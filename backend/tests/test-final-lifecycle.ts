import http from 'http';
import app from '../src/app';
import { supabaseAdmin } from '../src/config/supabase';

async function runFinalLifecycleTest() {
  console.log('================================================================');
  console.log('      CREDLINK SUPABASE MILESTONE: FINAL LIFECYCLE TEST        ');
  console.log('================================================================\n');

  // Start live Express HTTP server on localhost:5001
  const server = http.createServer(app);
  const PORT = 5001;
  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  const baseUrl = `http://localhost:${PORT}`;

  try {
    // =========================================================================
    // SECTION 16: FIVE-CONTEXT VALIDATION
    // =========================================================================
    console.log('>>> SECTION 16: FIVE-CONTEXT VALIDATION <<<\n');

    const accounts = [
      {
        name: 'ADMIN',
        email: 'admin@credlink.org',
        password: 'admin123',
        expectedRole: 'ADMIN',
        expectedOrgName: 'CredLink Network Governance',
        expectedOrgCode: 'GOV-ROOT',
        hasOrgUuid: false,
      },
      {
        name: 'COLLEGE',
        email: 'college@credlink.org',
        password: 'college123',
        expectedRole: 'COLLEGE',
        expectedOrgName: 'Oxford University (Synthetic)',
        expectedOrgCode: 'OX-0448',
        hasOrgUuid: true,
      },
      {
        name: 'HOSPITAL',
        email: 'hospital@credlink.org',
        password: 'healthcare123',
        expectedRole: 'HOSPITAL',
        expectedOrgName: 'All India Institute of Medical Sciences (Synthetic)',
        expectedOrgCode: 'AIIMS-0668',
        hasOrgUuid: true,
      },
      {
        name: 'BANK',
        email: 'finance@credlink.org',
        password: 'finance123',
        expectedRole: 'BANK',
        expectedOrgName: 'Apex Global Bank (Synthetic)',
        expectedOrgCode: 'BNK-0448',
        hasOrgUuid: true,
      },
      {
        name: 'EMPLOYER',
        email: 'employer@credlink.org',
        password: 'employer123',
        expectedRole: 'EMPLOYER',
        expectedOrgName: 'TechCorp Solutions (Synthetic)',
        expectedOrgCode: 'TC-7250',
        hasOrgUuid: true,
      },
    ];

    const tokens: Record<string, string> = {};
    const orgUuids: Record<string, string | null> = {};

    for (const acc of accounts) {
      console.log(`Checking Context: ${acc.name} (${acc.email})`);

      // 1. Live HTTP Login
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: acc.email, password: acc.password }),
      });
      const loginJson = await loginRes.json();

      if (!loginRes.ok || !loginJson.success) {
        throw new Error(`Login failed for ${acc.name}: ${JSON.stringify(loginJson)}`);
      }

      const token = loginJson.data.session.access_token;
      tokens[acc.name] = token;
      const user = loginJson.data.user;

      if (user.role !== acc.expectedRole) {
        throw new Error(`Role mismatch for ${acc.name}: expected ${acc.expectedRole}, got ${user.role}`);
      }
      if (user.organizationName !== acc.expectedOrgName) {
        throw new Error(`OrgName mismatch for ${acc.name}: expected ${acc.expectedOrgName}, got ${user.organizationName}`);
      }
      if (user.organizationCode !== acc.expectedOrgCode) {
        throw new Error(`OrgCode mismatch for ${acc.name}: expected ${acc.expectedOrgCode}, got ${user.organizationCode}`);
      }

      if (acc.hasOrgUuid) {
        if (!user.organizationId) {
          throw new Error(`Missing organizationId UUID for ${acc.name}`);
        }
        // Verify UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(user.organizationId)) {
          throw new Error(`Invalid organizationId UUID format for ${acc.name}: ${user.organizationId}`);
        }

        // Verify direct database membership relationship
        const { data: member, error: memberErr } = await supabaseAdmin
          .from('organization_members')
          .select('organization_id, status, member_role, organization:organizations(id, name, code)')
          .eq('user_id', user.id)
          .eq('status', 'ACTIVE')
          .single();

        if (memberErr || !member) {
          throw new Error(`DB membership verification failed for ${acc.name}: ${memberErr?.message}`);
        }
        if (member.organization_id !== user.organizationId) {
          throw new Error(`DB mismatch: membership org ID ${member.organization_id} !== user org ID ${user.organizationId}`);
        }
        orgUuids[acc.name] = user.organizationId;
        console.log(`  ✓ ${acc.name}: Role=${user.role} | Org=${user.organizationName} | UUID=${user.organizationId} [DB MATCHED]`);
      } else {
        if (user.organizationId !== null) {
          throw new Error(`ADMIN should have organizationId=null, got ${user.organizationId}`);
        }
        orgUuids[acc.name] = null;
        console.log(`  ✓ ${acc.name}: Role=${user.role} | Governance Root Context (organizationId=null) [CONFIRMED]`);
      }

      // 2. Live HTTP GET /api/auth/me
      const meRes = await fetch(`${baseUrl}/api/auth/me`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      const meJson = await meRes.json();
      if (!meRes.ok || !meJson.success) {
        throw new Error(`GET /api/auth/me failed for ${acc.name}: ${JSON.stringify(meJson)}`);
      }
      if (meJson.data.user.organizationId !== user.organizationId) {
        throw new Error(`GET /api/auth/me organizationId mismatch for ${acc.name}`);
      }
    }

    console.log('\n>>> ALL 5 CONTEXTS VALIDATED WITH AUTHORITATIVE DB RESOLUTION <<<\n');

    // =========================================================================
    // SECTION 15: COMPLETE CONTROLLED LIFECYCLE TEST
    // =========================================================================
    console.log('>>> SECTION 15: COMPLETE CONTROLLED LIFECYCLE TEST <<<\n');

    // Get Target Citizen Profile
    const { data: citizenProfile, error: citErr } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'CITIZEN')
      .limit(1)
      .single();

    if (citErr || !citizenProfile) {
      throw new Error(`Failed to load target citizen: ${citErr?.message}`);
    }
    console.log(`Target Citizen: ${citizenProfile.full_name} (${citizenProfile.id})`);

    // STEP 1: Login as an institutional account (COLLEGE)
    console.log('\nSTEP 1: Institutional Login (COLLEGE: Oxford University)');
    const collegeToken = tokens['COLLEGE'];
    const collegeOrgId = orgUuids['COLLEGE']!;
    console.log(`  ✓ Authenticated token obtained`);

    // STEP 2: Resolve actual organization UUID
    console.log('\nSTEP 2: Resolve actual organization UUID');
    console.log(`  ✓ College organization UUID: ${collegeOrgId}`);

    // STEP 3: Issue a credential to existing citizen via live HTTP POST /api/credentials
    console.log('\nSTEP 3: Issue credential via POST /api/credentials');
    const issuePayload = {
      subjectId: citizenProfile.id,
      issuerOrgId: collegeOrgId,
      domain: 'education',
      credentialType: 'Bachelor of Science',
      title: 'Bachelor of Science in Computer Science',
      claims: {
        studentName: citizenProfile.full_name,
        degree: 'Bachelor of Science',
        major: 'Computer Science',
        graduationYear: 2025,
        honors: 'First Class',
      },
    };

    const issueRes = await fetch(`${baseUrl}/api/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${collegeToken}`,
      },
      body: JSON.stringify(issuePayload),
    });
    const issueJson = await issueRes.json();

    if (!issueRes.ok || !issueJson.success) {
      throw new Error(`Issuance failed: ${JSON.stringify(issueJson)}`);
    }

    const newCred = issueJson.data;
    const credId = newCred.id;
    console.log(`  ✓ Credential Issued: ID=${credId} | Status=${newCred.status}`);
    console.log(`  ✓ Issuer Signature: ${newCred.issuerSignature.substring(0, 32)}...`);

    // STEP 4: Verify credential appears in API response
    console.log('\nSTEP 4: Verify credential appears in HTTP API response (listCredentials)');
    const listRes = await fetch(`${baseUrl}/api/credentials`, {
      headers: { Authorization: `Bearer ${collegeToken}` },
    });
    const listJson = await listRes.json();
    const foundInList = (listJson.data.credentials || []).find((c: any) => c.id === credId);
    if (!foundInList) {
      throw new Error(`Issued credential ${credId} not found in GET /api/credentials list!`);
    }
    console.log(`  ✓ Found credential in API list: Title="${foundInList.title}" | Status=${foundInList.status}`);

    // STEP 5: Verify credential exists directly in Supabase table
    console.log('\nSTEP 5: Verify credential exists directly in Supabase credentials table');
    const { data: dbCred, error: dbCredErr } = await supabaseAdmin
      .from('credentials')
      .select('*')
      .eq('id', credId)
      .single();

    if (dbCredErr || !dbCred) {
      throw new Error(`Credential ${credId} not found in Supabase: ${dbCredErr?.message}`);
    }
    if (dbCred.status !== 'VALID') {
      throw new Error(`Supabase credential status is not VALID: got ${dbCred.status}`);
    }
    if (dbCred.issuer_org_id !== collegeOrgId) {
      throw new Error(`Supabase issuer_org_id mismatch: ${dbCred.issuer_org_id} !== ${collegeOrgId}`);
    }
    console.log(`  ✓ Direct Supabase row verified: id=${dbCred.id} | status=${dbCred.status}`);

    // STEP 6: Refresh frontend (simulated fresh API fetch)
    console.log('\nSTEP 6: Refresh (GET /api/credentials/:id)');
    const getRes = await fetch(`${baseUrl}/api/credentials/${credId}`, {
      headers: { Authorization: `Bearer ${collegeToken}` },
    });
    const getJson = await getRes.json();

    // STEP 7: Verify it remains
    console.log('\nSTEP 7: Verify credential remains after refresh');
    if (!getRes.ok || getJson.data.id !== credId || getJson.data.status !== 'VALID') {
      throw new Error(`Refreshed credential verification failed: ${JSON.stringify(getJson)}`);
    }
    console.log(`  ✓ Fresh fetch confirmed: id=${getJson.data.id} | status=${getJson.data.status}`);

    // STEP 8: Revoke it via live HTTP POST /api/credentials/:id/revoke
    console.log('\nSTEP 8: Revoke credential via POST /api/credentials/:id/revoke');
    const revokeRes = await fetch(`${baseUrl}/api/credentials/${credId}/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${collegeToken}`,
      },
      body: JSON.stringify({ reason: 'E2E Lifecycle Revocation Test' }),
    });
    const revokeJson = await revokeRes.json();
    if (!revokeRes.ok || !revokeJson.success) {
      throw new Error(`Revocation failed: ${JSON.stringify(revokeJson)}`);
    }
    console.log(`  ✓ Revocation response: status=${revokeJson.data.status} | reason=${revokeJson.data.revocationReason}`);

    // STEP 9: Verify Supabase status = REVOKED
    console.log('\nSTEP 9: Verify Supabase database status = REVOKED');
    const { data: dbRevokedCred, error: dbRevErr } = await supabaseAdmin
      .from('credentials')
      .select('*')
      .eq('id', credId)
      .single();

    if (dbRevErr || !dbRevokedCred) {
      throw new Error(`Failed to query revoked cred: ${dbRevErr?.message}`);
    }
    if (dbRevokedCred.status !== 'REVOKED') {
      throw new Error(`Database status is not REVOKED: got ${dbRevokedCred.status}`);
    }
    console.log(`  ✓ Direct Supabase check confirmed: status=${dbRevokedCred.status}`);

    // STEP 10: Refresh frontend (GET /api/credentials/:id)
    console.log('\nSTEP 10: Refresh frontend and verify status = REVOKED');
    const refreshRevokedRes = await fetch(`${baseUrl}/api/credentials/${credId}`, {
      headers: { Authorization: `Bearer ${collegeToken}` },
    });
    const refreshRevokedJson = await refreshRevokedRes.json();
    if (refreshRevokedJson.data.status !== 'REVOKED') {
      throw new Error(`Refreshed credential does not reflect REVOKED status: ${refreshRevokedJson.data.status}`);
    }
    console.log(`  ✓ Refreshed API record confirmed: status=${refreshRevokedJson.data.status} | revocationReason="${refreshRevokedJson.data.revocationReason}"`);

    // STEP 11: Create a verification request using valid requester (EMPLOYER: TechCorp)
    console.log('\nSTEP 11: Create verification request via POST /api/consents/request (EMPLOYER)');
    const employerToken = tokens['EMPLOYER'];
    const employerOrgId = orgUuids['EMPLOYER']!;

    const consentReqPayload = {
      citizenId: citizenProfile.id,
      requestingOrgId: employerOrgId,
      credentialId: credId,
      domain: 'education',
      purpose: 'Verification of academic qualifications for employment',
      requestedClaims: ['studentName', 'degree', 'major', 'graduationYear'],
    };

    const consentRes = await fetch(`${baseUrl}/api/consents/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${employerToken}`,
      },
      body: JSON.stringify(consentReqPayload),
    });
    const consentJson = await consentRes.json();

    if (!consentRes.ok || !consentJson.success) {
      throw new Error(`Consent request failed: ${JSON.stringify(consentJson)}`);
    }

    const consentId = consentJson.data.id;
    console.log(`  ✓ Consent Request Created: ID=${consentId} | Status=${consentJson.data.status}`);

    // STEP 12: Verify consent exists in Supabase table
    console.log('\nSTEP 12: Verify consent exists directly in Supabase consents table');
    const { data: dbConsent, error: dbConsentErr } = await supabaseAdmin
      .from('consents')
      .select('*')
      .eq('id', consentId)
      .single();

    if (dbConsentErr || !dbConsent) {
      throw new Error(`Consent ${consentId} not found in Supabase: ${dbConsentErr?.message}`);
    }
    if (dbConsent.status !== 'PENDING') {
      throw new Error(`Supabase consent status is not PENDING: got ${dbConsent.status}`);
    }
    console.log(`  ✓ Direct Supabase consent check confirmed: id=${dbConsent.id} | status=${dbConsent.status}`);

    // STEP 13: Citizen approves consent request
    console.log('\nSTEP 13: Citizen login & consent response (APPROVE)');
    // Login as Citizen
    const citizenLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'citizen@credlink.org', password: 'citizen123' }),
    });
    const citizenLoginJson = await citizenLoginRes.json();
    if (!citizenLoginRes.ok || !citizenLoginJson.success) {
      throw new Error(`Citizen login failed: ${JSON.stringify(citizenLoginJson)}`);
    }
    const citizenToken = citizenLoginJson.data.session.access_token;

    // Citizen responds to consent request
    const respondRes = await fetch(`${baseUrl}/api/consents/${consentId}/respond`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizenToken}`,
      },
      body: JSON.stringify({
        action: 'APPROVE',
        approvedClaims: ['studentName', 'degree', 'major', 'graduationYear'],
      }),
    });
    const respondJson = await respondRes.json();
    if (!respondRes.ok || !respondJson.success) {
      throw new Error(`Consent response failed: ${JSON.stringify(respondJson)}`);
    }
    console.log(`  ✓ Citizen response submitted: status=${respondJson.data.status}`);

    // STEP 14: Verify status changed in Supabase
    console.log('\nSTEP 14: Verify status changed in Supabase consents table');
    const { data: dbApprovedConsent, error: dbApprErr } = await supabaseAdmin
      .from('consents')
      .select('*')
      .eq('id', consentId)
      .single();

    if (dbApprErr || !dbApprovedConsent) {
      throw new Error(`Failed to query approved consent: ${dbApprErr?.message}`);
    }
    if (dbApprovedConsent.status !== 'APPROVED') {
      throw new Error(`Database consent status is not APPROVED: got ${dbApprovedConsent.status}`);
    }
    if (!dbApprovedConsent.granted_at) {
      throw new Error('Database consent granted_at is null');
    }
    console.log(`  ✓ Direct Supabase check confirmed: status=${dbApprovedConsent.status} | granted_at=${dbApprovedConsent.granted_at}`);

    // STEP 15: Run verification
    console.log('\nSTEP 15: Run verification via POST /api/verification/verify-credential');
    const verifyRes = await fetch(`${baseUrl}/api/verification/verify-credential`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${employerToken}`,
      },
      body: JSON.stringify({ credentialId: credId }),
    });
    const verifyJson = await verifyRes.json();
    if (!verifyRes.ok || !verifyJson.success) {
      throw new Error(`Verification endpoint failed: ${JSON.stringify(verifyJson)}`);
    }

    const verificationResult = verifyJson.data;
    console.log(`  ✓ Verification result: verified=${verificationResult.verified} | outcome=${verificationResult.verificationResult}`);
    console.log(`  ✓ Lifecycle check: isRevoked=${verificationResult.lifecycleCheck?.isRevoked} | status=${verificationResult.lifecycleCheck?.status}`);
    console.log(`  ✓ Cryptographic check: algorithm=${verificationResult.cryptographicCheck?.algorithm} | signatureValid=${verificationResult.cryptographicCheck?.signatureValid}`);

    if (!verificationResult.lifecycleCheck?.isRevoked) {
      throw new Error('Verification failed to recognize that credential was revoked in DB!');
    }
    if (verificationResult.verified !== false) {
      throw new Error('Revoked credential should not be verified as valid!');
    }

    // STEP 16: Verify audit events exist
    console.log('\nSTEP 16: Verify audit events in Supabase audit_logs table');
    const { data: logs, error: logsErr } = await supabaseAdmin
      .from('audit_logs')
      .select('*')
      .or(`target_resource_id.eq.${credId},target_resource_id.eq.${consentId}`)
      .order('created_at', { ascending: true });

    if (logsErr || !logs || logs.length === 0) {
      throw new Error(`No audit logs found for resources: ${logsErr?.message}`);
    }

    console.log(`  ✓ Total audit log entries recorded: ${logs.length}`);
    const eventTypes = logs.map((l: any) => l.event_type);
    console.log(`  ✓ Recorded event types: ${eventTypes.join(', ')}`);

    const hasCredIssued = logs.some((l: any) => l.event_type === 'CREDENTIAL_ISSUED');
    const hasCredRevoked = logs.some((l: any) => l.event_type === 'CREDENTIAL_REVOKED');
    const hasVerifRequested = logs.some((l: any) => l.event_type === 'VERIFICATION_REQUESTED');
    const hasConsentGranted = logs.some((l: any) => l.event_type === 'CONSENT_GRANTED');

    if (!hasCredIssued) throw new Error('Missing CREDENTIAL_ISSUED audit log');
    if (!hasCredRevoked) throw new Error('Missing CREDENTIAL_REVOKED audit log');
    if (!hasVerifRequested) throw new Error('Missing VERIFICATION_REQUESTED audit log');
    if (!hasConsentGranted) throw new Error('Missing CONSENT_GRANTED audit log');

    // STEP 17: Verify all displayed values come from database/API responses
    console.log('\nSTEP 17: Verify audit log API endpoint returns authoritative DB state');
    const auditApiRes = await fetch(`${baseUrl}/api/audit-logs?limit=10`, {
      headers: { Authorization: `Bearer ${tokens['ADMIN']}` },
    });
    const auditApiJson = await auditApiRes.json();
    if (!auditApiRes.ok || !auditApiJson.success) {
      throw new Error(`Audit log API failed: ${JSON.stringify(auditApiJson)}`);
    }

    const returnedLogs = auditApiJson.data.logs;
    if (!Array.isArray(returnedLogs) || returnedLogs.length === 0) {
      throw new Error('Audit API returned empty logs array');
    }
    const sampleLog = returnedLogs[0];
    if (!sampleLog.actor || !sampleLog.organization || !sampleLog.timestamp) {
      throw new Error('Audit API response missing required populated fields');
    }
    console.log(`  ✓ Audit API sample log: ${sampleLog.action} | Actor: ${sampleLog.actor} | Org: ${sampleLog.organization}`);

    console.log('\n================================================================');
    console.log('       ALL 17 LIFECYCLE STEPS & AUDIT PROOFS FULLY PASSED!      ');
    console.log('================================================================\n');

  } finally {
    server.close();
  }
}

runFinalLifecycleTest().catch((err) => {
  console.error('\n[FATAL LIFECYCLE FAILURE]:', err);
  process.exit(1);
});
