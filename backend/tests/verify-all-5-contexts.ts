import { authService } from '../src/services/auth.service';
import { credentialService } from '../src/services/credential.service';
import { consentService } from '../src/services/consent.service';
import { supabaseAdmin } from '../src/config/supabase';

async function verifyAll() {
  console.log('=== VERIFYING ALL 5 ACCOUNTS & ORGANIZATION CONTEXT RESOLUTION ===\n');

  const testAccounts = [
    { name: 'COLLEGE', email: 'college@credlink.org', password: 'college123', expectedOrgName: 'Oxford University (Synthetic)', expectedRole: 'COLLEGE', expectedCode: 'OX-0448', shouldHaveOrgId: true },
    { name: 'HOSPITAL', email: 'hospital@credlink.org', password: 'healthcare123', expectedOrgName: 'All India Institute of Medical Sciences (Synthetic)', expectedRole: 'HOSPITAL', expectedCode: 'AIIMS-0668', shouldHaveOrgId: true },
    { name: 'BANK', email: 'finance@credlink.org', password: 'finance123', expectedOrgName: 'Apex Global Bank (Synthetic)', expectedRole: 'BANK', expectedCode: 'BNK-0448', shouldHaveOrgId: true },
    { name: 'EMPLOYER', email: 'employer@credlink.org', password: 'employer123', expectedOrgName: 'TechCorp Solutions (Synthetic)', expectedRole: 'EMPLOYER', expectedCode: 'TC-7250', shouldHaveOrgId: true },
    { name: 'ADMIN', email: 'admin@credlink.org', password: 'admin123', expectedOrgName: 'CredLink Network Governance', expectedRole: 'ADMIN', expectedCode: 'GOV-ROOT', shouldHaveOrgId: false },
  ];

  let collegeAuthUser: any = null;
  let collegeUserObj: any = null;

  for (const acc of testAccounts) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Testing Account: ${acc.name} (${acc.email})`);
    console.log(`--------------------------------------------------`);

    const loginRes = await authService.loginUser({
      email: acc.email,
      password: acc.password,
    });

    const user = loginRes.user;
    console.log(`[Login] Role: ${user.role}`);
    console.log(`[Login] Organization ID: ${user.organizationId}`);
    console.log(`[Login] Organization Name: ${user.organizationName}`);
    console.log(`[Login] Organization Code: ${user.organizationCode}`);
    console.log(`[Login] Organization Domain: ${user.organizationDomain}`);
    console.log(`[Login] Organization DID: ${user.organizationDid}`);
    console.log(`[Login] Is Issuer: ${user.isIssuer}`);
    console.log(`[Login] Authorized Credential Types: ${JSON.stringify(user.authorizedCredentialTypes)}`);

    if (acc.name === 'COLLEGE') {
      collegeUserObj = user;
      collegeAuthUser = {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
        organizationId: user.organizationId,
      };
    }

    // Verify getCurrentUser
    const meRes = await authService.getCurrentUser(user.id);
    const meUser = meRes.user;
    console.log(`[GetMe] Matches Login: ${meUser.organizationId === user.organizationId && meUser.organizationName === user.organizationName}`);

    // Assertions
    if (user.role !== acc.expectedRole) {
      throw new Error(`Role mismatch for ${acc.name}: expected ${acc.expectedRole}, got ${user.role}`);
    }
    if (user.organizationName !== acc.expectedOrgName) {
      throw new Error(`OrgName mismatch for ${acc.name}: expected ${acc.expectedOrgName}, got ${user.organizationName}`);
    }
    if (acc.shouldHaveOrgId) {
      if (!user.organizationId) {
        throw new Error(`Missing organizationId UUID for institutional user ${acc.name}`);
      }
      // Check database relationship
      const { data: member } = await supabaseAdmin
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'ACTIVE')
        .single();

      if (member?.organization_id !== user.organizationId) {
        throw new Error(`DB mismatch: member.organization_id (${member?.organization_id}) != user.organizationId (${user.organizationId})`);
      }
      console.log(`[DB Verify] profiles.id (${user.id}) -> organization_members.organization_id (${member.organization_id}) -> organizations.id: MATCHED!`);
    } else {
      if (user.organizationId !== null) {
        throw new Error(`ADMIN should not have ordinary organizationId UUID, got ${user.organizationId}`);
      }
      console.log(`[DB Verify] ADMIN governance context confirmed with organizationId = null (no ordinary membership).`);
    }
  }

  // Now test College Credential Issuance
  console.log(`\n==================================================`);
  console.log(`Testing College Credential Issuance with Oxford UUID`);
  console.log(`==================================================`);

  // Target citizen
  const { data: citizenProfile } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'CITIZEN')
    .limit(1)
    .single();

  if (!citizenProfile) throw new Error('No citizen profile found');
  console.log(`Target Citizen: ${citizenProfile.full_name} (${citizenProfile.id})`);

  const issuedCredential = await credentialService.createCredential(collegeAuthUser, {
    subjectId: citizenProfile.id,
    issuerOrgId: collegeUserObj.organizationId,
    domain: 'education' as any,
    credentialType: 'Bachelor of Science',
    title: 'Bachelor of Science in Computer Science',
    claims: {
      subjectName: citizenProfile.full_name,
      degree: 'Bachelor of Science',
      major: 'Computer Science',
      graduationYear: '2025',
    },
  });

  console.log(`[Credential Issued] ID: ${issuedCredential.id}`);
  console.log(`[Credential Issued] Issuer Org ID: ${issuedCredential.issuerOrgId}`);
  console.log(`[Credential Issued] Status: ${issuedCredential.status}`);
  console.log(`[Credential Issued] Signature: ${issuedCredential.issuerSignature.substring(0, 30)}...`);

  if (issuedCredential.issuerOrgId !== collegeUserObj.organizationId) {
    throw new Error('Credential issuerOrgId mismatch with Oxford UUID!');
  }

  // Now test College Verification Request (Consent Request)
  console.log(`\n==================================================`);
  console.log(`Testing College Consent/Verification Request with Oxford UUID`);
  console.log(`==================================================`);

  const consentRequest = await consentService.requestConsent(collegeAuthUser, {
    citizenId: citizenProfile.id,
    requestingOrgId: collegeUserObj.organizationId,
    credentialId: issuedCredential.id,
    domain: 'education' as any,
    purpose: 'Academic verification of Bachelor degree qualifications',
    requestedClaims: ['degree', 'major', 'graduationYear'],
  });

  console.log(`[Consent Request Created] ID: ${consentRequest.id}`);
  console.log(`[Consent Request Created] Requesting Org ID: ${consentRequest.requestingOrgId}`);
  console.log(`[Consent Request Created] Requesting Org Name: ${consentRequest.requestingOrg?.name}`);
  console.log(`[Consent Request Created] Status: ${consentRequest.status}`);

  if (consentRequest.requestingOrgId !== collegeUserObj.organizationId) {
    throw new Error('Consent requestingOrgId mismatch with Oxford UUID!');
  }

  // Now test Revocation
  console.log(`\n==================================================`);
  console.log(`Testing Credential Revocation by College`);
  console.log(`==================================================`);

  const revokedCred = await credentialService.revokeCredential(collegeAuthUser, issuedCredential.id, {
    reason: 'Synthetic E2E test verification revocation cycle',
  });

  console.log(`[Credential Revoked] Status: ${revokedCred.status}`);
  console.log(`[Credential Revoked] Reason: ${revokedCred.revocationReason}`);

  if (revokedCred.status !== 'REVOKED') {
    throw new Error('Revocation failed to set status to REVOKED');
  }

  console.log(`\n>>> ALL 5 ACCOUNTS, ISSUANCE, VERIFICATION, REVOCATION FULLY PASSED! <<<`);
}

verifyAll().catch((err) => {
  console.error('\n[FATAL ERROR IN VERIFICATION]:', err);
  process.exit(1);
});
