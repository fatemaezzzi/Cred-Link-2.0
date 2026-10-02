import assert from 'node:assert/strict';
import crypto from 'crypto';
import { agent } from './agent';
import { initIssuerAgent, getIssuerDid, getIssuerOrg } from './issuer';
import { credentialService } from '../services/credential.service';
import { trustService } from '../services/trust.service';
import { supabaseAdmin } from '../config/supabase';
import { env } from '../config/env';
import { AuthUser } from '../middleware/authMiddleware';

/**
 * Veramo W3C Verifiable Credentials Acceptance Test Suite
 *
 * Exercises the end-to-end cryptographic lifecycle:
 *  1. Persistent NIT Issuer initialization
 *  2. Real W3C VC issuance (Credential A)
 *  3. In-memory store wipe & simulated server restart
 *  4. Second VC issuance (Credential B) & identity consistency assertion
 *  5. Cross-restart cryptographic verification (Mode A)
 *  6. Mode B Bank Verification with consent validation & 3-way claim intersection
 *  7. Guarded single-use consent consumption (replay protection)
 *  8. Revocation lifecycle check
 *  9. Trust Registry suspension check
 * 10. Guaranteed cleanup in finally block
 */
async function runAcceptanceTest() {
  console.log('================================================================');
  console.log('  CREDENTIAL ACCEPTANCE TEST: VERAMO W3C VC INTEGRATION');
  console.log('================================================================\n');

  let credA: any = null;
  let credB: any = null;
  let testConsentId: string | null = null;
  let nitOrgId: string = '';

  const adminActor: AuthUser = {
    id: '00000000-0000-0000-0000-000000000000',
    role: 'ADMIN',
    email: 'admin@credlink.org',
    fullName: 'Network Administrator',
  };

  const aaravSharmaStudentId = '286fa80a-119f-4281-9901-4930c48b239f';
  const apexBankOrgId = '43bd92eb-be42-4262-b932-55cc94bede40';

  try {
    // -------------------------------------------------------------------------
    // Phase 1: Initialize persistent NIT Issuer Agent
    // -------------------------------------------------------------------------
    console.log('[STEP 1] Initializing persistent NIT Issuer Agent...');
    const { did: issuerDid, organization: issuerOrg } = await initIssuerAgent();
    nitOrgId = issuerOrg.id;

    assert.equal(issuerDid, env.ISSUER_DID, 'Issuer DID must match configured persistent DID');
    assert.ok(issuerOrg.id, 'Issuer organization must exist in DB');
    console.log(`  ✓ Persistent Issuer Loaded: ${issuerDid}`);
    console.log(`  ✓ Issuer Org ID: ${issuerOrg.id} (${issuerOrg.name})\n`);

    // -------------------------------------------------------------------------
    // Phase 2: Issue Credential A (Bachelor of Technology)
    // -------------------------------------------------------------------------
    console.log('[STEP 2] Issuing Credential A (B.Tech for Aarav Sharma)...');
    credA = await credentialService.createCredential(adminActor, {
      subjectId: aaravSharmaStudentId,
      issuerOrgId: issuerOrg.id,
      domain: 'education',
      credentialType: 'Bachelor of Technology',
      title: 'Bachelor of Technology in Computer Science',
      claims: {
        degree: 'Bachelor of Technology',
        major: 'Computer Science',
        institution: 'National Institute of Technology',
        graduationYear: 2026,
        gpa: '3.92',
      },
    });

    assert.ok(credA.id, 'Credential A must have an ID');
    assert.equal(credA.issuerDid, env.ISSUER_DID, 'Credential A issuer DID must match persistent NIT DID');
    assert.equal(credA.credentialIdUri, `urn:uuid:${credA.id}`, 'Credential A must have stable urn:uuid ID URI');
    assert.ok(credA.jwt && credA.jwt.length > 100, 'Credential A must contain signed compact JWT');
    console.log(`  ✓ Credential A Issued: ${credA.id}`);
    console.log(`  ✓ Signed ID URI: ${credA.credentialIdUri}`);
    console.log(`  ✓ JWT Hash Prefix: ${credA.jwtHash.substring(0, 16)}...\n`);

    // -------------------------------------------------------------------------
    // Phase 3: Wipe Veramo In-Memory Stores & Simulate Process Restart
    // -------------------------------------------------------------------------
    // didManagerDelete deletes the DID identifier and cascades to delete associated keys
    await agent.didManagerDelete({ did: env.ISSUER_DID });

    const identifiersAfterWipe = await agent.didManagerFind();
    assert.ok(
      !identifiersAfterWipe.some((id: any) => id.did === env.ISSUER_DID),
      'Issuer DID must no longer exist in memory after wipe'
    );

    // Verify key was also wiped from key store
    let keyWiped = false;
    try {
      await agent.keyManagerGet({ kid: env.ISSUER_KEY_ID });
    } catch {
      keyWiped = true;
    }
    assert.ok(keyWiped, 'Issuer private key must be wiped from memory store');
    console.log('  ✓ In-memory DID and private key successfully wiped');

    console.log('  Re-initializing Issuer Agent from environment secret...');
    const reloaded = await initIssuerAgent();
    assert.equal(reloaded.did, env.ISSUER_DID, 'Reloaded DID must match original persistent DID');
    console.log(`  ✓ Agent successfully rehydrated: ${reloaded.did}\n`);

    // -------------------------------------------------------------------------
    // Phase 4: Issue Credential B (Master of Technology) after Restart
    // -------------------------------------------------------------------------
    console.log('[STEP 4] Issuing Credential B (M.Tech) after restart...');
    credB = await credentialService.createCredential(adminActor, {
      subjectId: aaravSharmaStudentId,
      issuerOrgId: issuerOrg.id,
      domain: 'education',
      credentialType: 'Master of Technology',
      title: 'Master of Technology in Artificial Intelligence',
      claims: {
        degree: 'Master of Technology',
        specialization: 'Artificial Intelligence',
        institution: 'National Institute of Technology',
        graduationYear: 2028,
        grade: 'Distinction',
      },
    });

    assert.ok(credB.id, 'Credential B must have an ID');
    assert.equal(credB.issuerDid, credA.issuerDid, 'Credential B issuer DID must match Credential A issuer DID');
    assert.equal(credB.issuerDid, env.ISSUER_DID, 'Credential B issuer DID must equal persistent env.ISSUER_DID');
    console.log(`  ✓ Credential B Issued: ${credB.id}`);
    console.log(`  ✓ Identity Consistency Confirmed: ${credB.issuerDid} === ${credA.issuerDid}\n`);

    // -------------------------------------------------------------------------
    // Phase 5: Cryptographically Verify Both Credentials (Mode A)
    // -------------------------------------------------------------------------
    console.log('[STEP 5] Cryptographically verifying Credential A and B (Mode A)...');

    // Verify Credential A (issued BEFORE restart)
    const verifyResultA = await credentialService.verifyCredential(adminActor, {
      credentialPayload: credA.jwt,
    });
    assert.equal(verifyResultA.valid, true, `Credential A verification failed: ${verifyResultA.reason}`);
    assert.equal(verifyResultA.cryptographicVerification.signatureValid, true, 'Credential A signature must be valid');
    assert.equal(verifyResultA.cryptographicVerification.algorithm, 'Ed25519-EdDSA');
    assert.equal(verifyResultA.applicationStatus, 'VALID');
    assert.equal(verifyResultA.credentialId, credA.id);
    console.log('  ✓ Credential A (pre-restart) verified cryptographically (Ed25519-EdDSA)');

    // Verify Credential B (issued AFTER restart)
    const verifyResultB = await credentialService.verifyCredential(adminActor, {
      credentialPayload: credB.jwt,
    });
    assert.equal(verifyResultB.valid, true, `Credential B verification failed: ${verifyResultB.reason}`);
    assert.equal(verifyResultB.cryptographicVerification.signatureValid, true, 'Credential B signature must be valid');
    assert.equal(verifyResultB.applicationStatus, 'VALID');
    assert.equal(verifyResultB.credentialId, credB.id);
    console.log('  ✓ Credential B (post-restart) verified cryptographically (Ed25519-EdDSA)\n');

    // -------------------------------------------------------------------------
    // Phase 6: Mode B - Bank Verification Request with Consent & Claim Filtering
    // -------------------------------------------------------------------------
    console.log('[STEP 6] Testing Mode B Bank Verification with consent and claim intersection...');

    // Student approved only degree, major, institution (NOT gpa)
    const consentUuid = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { data: newConsent, error: consentErr } = await supabaseAdmin
      .from('consents')
      .insert({
        id: consentUuid,
        citizen_id: aaravSharmaStudentId,
        requesting_org_id: apexBankOrgId,
        credential_id: credA.id,
        domain: 'education',
        purpose: 'Education verification for education loan application',
        requested_claims: ['degree', 'major', 'institution', 'graduationYear', 'gpa'],
        approved_claims: ['degree', 'major', 'institution', 'graduationYear'], // gpa excluded!
        status: 'APPROVED',
        granted_at: new Date().toISOString(),
        expires_at: expiresAt,
      })
      .select('*')
      .single();

    if (consentErr || !newConsent) {
      throw new Error(`Failed to create test consent: ${consentErr?.message}`);
    }
    testConsentId = newConsent.id;
    console.log(`  ✓ Test Consent Created (ID: ${testConsentId}, Status: APPROVED)`);

    // Perform Mode B verification via trustService
    const bankVerifyResult = await trustService.verifyCredentialComprehensive(adminActor, {
      credentialPayload: credA.jwt,
      consentId: testConsentId || undefined,
      verifierOrgId: apexBankOrgId,
    });

    assert.equal(bankVerifyResult.verified, true, `Bank verification failed: ${bankVerifyResult.reason}`);
    assert.equal(bankVerifyResult.verificationResult, 'APPROVED');
    assert.equal(bankVerifyResult.mode, 'BANK_VERIFICATION_REQUEST');

    // Verify 3-way claim intersection
    const allowed = bankVerifyResult.allowedClaims;
    assert.equal(allowed.degree, 'Bachelor of Technology', 'Degree must be included');
    assert.equal(allowed.major, 'Computer Science', 'Major must be included');
    assert.equal(allowed.institution, 'National Institute of Technology', 'Institution must be included');
    assert.equal(allowed.graduationYear, 2026, 'Graduation year must be included');
    assert.equal(allowed.gpa, undefined, 'GPA must be excluded because citizen did not approve it');
    console.log('  ✓ Three-way claim intersection verified: Unapproved claim "gpa" was withheld');

    // Confirm consent atomic state transition: APPROVED -> EXPIRED (consumed single-use)
    assert.equal(bankVerifyResult.consentDetails?.status, 'CONSUMED', 'Consent details status must be CONSUMED');

    const { data: consumedConsent } = await supabaseAdmin
      .from('consents')
      .select('status')
      .eq('id', testConsentId)
      .single();

    assert.ok(
      consumedConsent?.status === 'EXPIRED' || consumedConsent?.status === 'CONSUMED',
      'Consent status in DB must be transitioned from APPROVED'
    );
    console.log('  ✓ Consent atomically transitioned to consumed state\n');

    // -------------------------------------------------------------------------
    // Phase 7: Replay Protection Check - Re-using Consumed Consent must Fail
    // -------------------------------------------------------------------------
    console.log('[STEP 7] Testing Replay Protection (reusing consumed consent)...');
    const replayVerifyResult = await trustService.verifyCredentialComprehensive(adminActor, {
      credentialPayload: credA.jwt,
      consentId: testConsentId || undefined,
      verifierOrgId: apexBankOrgId,
    });

    assert.equal(replayVerifyResult.verified, false, 'Replay verification must be rejected');
    assert.equal(replayVerifyResult.verificationResult, 'REJECTED');
    assert.equal(replayVerifyResult.reason, 'consent already consumed');
    console.log('  ✓ Replay attempt correctly rejected: "consent already consumed"\n');

    // -------------------------------------------------------------------------
    // Phase 8: Credential Revocation Check
    // -------------------------------------------------------------------------
    console.log('[STEP 8] Testing Credential Revocation Lifecycle...');
    await credentialService.revokeCredential(adminActor, credA.id, {
      reason: 'Academic disciplinary record audit',
    });

    // Mode A verification on revoked credential
    const revokedVerifyA = await credentialService.verifyCredential(adminActor, {
      credentialPayload: credA.jwt,
    });
    assert.equal(revokedVerifyA.valid, false, 'Revoked credential must not be valid');
    assert.equal(revokedVerifyA.applicationStatus, 'REVOKED');
    assert.equal(revokedVerifyA.reason, 'credential revoked');
    assert.equal(revokedVerifyA.revocationDetails?.isRevoked, true);

    // Mode B verification on revoked credential
    const revokedVerifyB = await trustService.verifyCredentialComprehensive(adminActor, {
      credentialPayload: credA.jwt,
    });
    assert.equal(revokedVerifyB.verified, false, 'Comprehensive verify on revoked credential must fail');
    assert.equal(revokedVerifyB.verificationResult, 'REJECTED');
    assert.equal(revokedVerifyB.reason, 'credential revoked');
    console.log('  ✓ Revoked credential correctly rejected across all verification endpoints\n');

    // -------------------------------------------------------------------------
    // Phase 9: Trust Registry Suspension Check
    // -------------------------------------------------------------------------
    console.log('[STEP 9] Testing Trust Registry Issuer Suspension...');
    // Temporarily suspend NIT in Trust Registry
    const { error: suspendErr } = await supabaseAdmin
      .from('trust_registry')
      .update({ trust_status: 'SUSPENDED' })
      .eq('organization_id', nitOrgId);

    if (suspendErr) {
      throw new Error(`Failed to suspend issuer for test: ${suspendErr.message}`);
    }

    // Try verifying Credential B (which is VALID in credentials table)
    const suspendedVerify = await credentialService.verifyCredential(adminActor, {
      credentialPayload: credB.jwt,
    });
    assert.equal(suspendedVerify.valid, false, 'Verification with suspended issuer must fail');
    assert.equal(suspendedVerify.reason, 'issuer suspended');
    assert.equal(suspendedVerify.trustRegistryCheck?.isTrusted, false);

    const suspendedComprehensive = await trustService.verifyCredentialComprehensive(adminActor, {
      credentialPayload: credB.jwt,
    });
    assert.equal(suspendedComprehensive.verified, false, 'Comprehensive verify with suspended issuer must fail');
    assert.equal(suspendedComprehensive.reason, 'issuer suspended');
    console.log('  ✓ Suspended issuer credential correctly rejected: "issuer suspended"\n');

    // -------------------------------------------------------------------------
    // Phase 10: Domain Accreditation Enforcement Check
    // -------------------------------------------------------------------------
    console.log('[STEP 10] Testing Domain Accreditation Enforcement...');
    // Restore VERIFIED status, but change accredited_for to 'healthcare' (mismatch with 'education')
    await supabaseAdmin
      .from('trust_registry')
      .update({
        trust_status: 'VERIFIED',
        verification_metadata: { accredited_for: 'healthcare' },
      })
      .eq('organization_id', nitOrgId);

    const domainMismatchVerify = await credentialService.verifyCredential(adminActor, {
      credentialPayload: credB.jwt,
    });
    assert.equal(domainMismatchVerify.valid, false, 'Domain mismatch must fail');
    assert.equal(domainMismatchVerify.reason, 'issuer not accredited for this domain');
    console.log('  ✓ Domain mismatch correctly rejected: "issuer not accredited for this domain"');

    // Test with missing domain metadata (empty object - no accredited_for)
    await supabaseAdmin
      .from('trust_registry')
      .update({
        trust_status: 'VERIFIED',
        verification_metadata: {},
      })
      .eq('organization_id', nitOrgId);

    const missingDomainVerify = await credentialService.verifyCredential(adminActor, {
      credentialPayload: credB.jwt,
    });
    assert.equal(missingDomainVerify.valid, false, 'Missing domain metadata must fail, not default to education');
    assert.equal(missingDomainVerify.reason, 'issuer not accredited for this domain');
    console.log('  ✓ Missing domain metadata correctly rejected (no fallback defaulting)\n');

    console.log('================================================================');
    console.log('  ALL ACCEPTANCE TEST ASSERTIONS PASSED (11/11)');
    console.log('================================================================\n');
  } finally {
    // -------------------------------------------------------------------------
    // Phase 10: Guaranteed Cleanup
    // -------------------------------------------------------------------------
    console.log('[CLEANUP] Starting teardown and restoring Trust Registry...');

    try {
      // 1. Restore NIT Trust Registry status to VERIFIED
      if (nitOrgId) {
        await supabaseAdmin
          .from('trust_registry')
          .update({
            trust_status: 'VERIFIED',
            verification_metadata: {
              accredited_for: 'education',
              accreditedFor: 'education',
              accreditedBy: 'CredLink National Trust Registry Governance',
            },
          })
          .eq('organization_id', nitOrgId);
        console.log('  ✓ Restored NIT Trust Registry status to VERIFIED (accredited_for: education)');
      }

      // 2. Clean up test consent
      if (testConsentId) {
        await supabaseAdmin.from('consents').delete().eq('id', testConsentId);
        console.log(`  ✓ Deleted test consent: ${testConsentId}`);
      }

      // 3. Clean up test credentials
      const idsToDelete = [credA?.id, credB?.id].filter(Boolean);
      if (idsToDelete.length > 0) {
        await supabaseAdmin.from('credentials').delete().in('id', idsToDelete);
        console.log(`  ✓ Deleted test credentials: ${idsToDelete.join(', ')}`);

        // 4. Clean up test audit logs
        await supabaseAdmin
          .from('audit_logs')
          .delete()
          .in('target_resource_id', [...idsToDelete, testConsentId].filter(Boolean));
        console.log('  ✓ Cleaned up related audit logs');
      }

      console.log('[CLEANUP] Teardown complete. Database in clean state.\n');
    } catch (cleanupErr) {
      console.error('[CLEANUP WARNING] Failed during teardown:', cleanupErr);
    }
  }
}

runAcceptanceTest().catch((err) => {
  console.error('[FATAL] Acceptance test failed:', err);
  process.exit(1);
});
