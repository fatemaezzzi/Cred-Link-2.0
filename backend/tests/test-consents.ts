import app from '../src/app';
import http from 'http';
import { supabaseAdmin } from '../src/config/supabase';

async function runConsentTests() {
  console.log('=== Stage 4 Consent & Credential Sharing Test Suite ===\n');

  const server = http.createServer(app);
  const PORT = 5006;
  await new Promise<void>((resolve) => server.listen(PORT, resolve));

  const timestamp = Date.now();
  const issuerEmail = `issuer.college.${timestamp}@credlink.org`;
  const employerEmail = `verifier.employer.${timestamp}@credlink.org`;
  const citizenEmail = `citizen.alice.${timestamp}@credlink.org`;
  const testPassword = 'Password123!';

  let issuerToken = '';
  let employerToken = '';
  let citizenToken = '';
  let citizenUserId = '';
  let collegeOrgId = '';
  let employerOrgId = '';
  let issuedCredId = '';
  let requestedConsentId = '';

  try {
    // -------------------------------------------------------------------------
    // Setup Step 1: Register Accounts & Issue Test Credential
    // -------------------------------------------------------------------------
    console.log('[Setup] Registering accounts & creating organizations...');

    // Register College Issuer
    const regIssuerRes = await fetch(`http://localhost:${PORT}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: issuerEmail, password: testPassword, fullName: 'College Admin', role: 'COLLEGE' }),
    });
    const regIssuerData: any = await regIssuerRes.json();
    issuerToken = regIssuerData.data.session.access_token;

    // Register Employer Verifier
    const regEmployerRes = await fetch(`http://localhost:${PORT}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: employerEmail, password: testPassword, fullName: 'HR Manager', role: 'EMPLOYER' }),
    });
    const regEmployerData: any = await regEmployerRes.json();
    employerToken = regEmployerData.data.session.access_token;

    // Register Citizen Alice
    const regCitizenRes = await fetch(`http://localhost:${PORT}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: citizenEmail, password: testPassword, fullName: 'Alice Smith', role: 'CITIZEN' }),
    });
    const regCitizenData: any = await regCitizenRes.json();
    citizenToken = regCitizenData.data.session.access_token;
    citizenUserId = regCitizenData.data.user.id;

    // Create & Approve College Org
    const createCollegeRes = await fetch(`http://localhost:${PORT}/api/organizations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${issuerToken}` },
      body: JSON.stringify({ name: 'National University', code: `NU-${timestamp.toString().slice(-4)}`, domain: 'college' }),
    });
    const createCollegeData: any = await createCollegeRes.json();
    collegeOrgId = createCollegeData.data.id;
    await supabaseAdmin.from('organizations').update({ verification_status: 'APPROVED', is_issuer: true }).eq('id', collegeOrgId);

    // Create & Approve Employer Org
    const createEmployerRes = await fetch(`http://localhost:${PORT}/api/organizations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employerToken}` },
      body: JSON.stringify({ name: 'TechCorp Solutions', code: `TC-${timestamp.toString().slice(-4)}`, domain: 'employer' }),
    });
    const createEmployerData: any = await createEmployerRes.json();
    employerOrgId = createEmployerData.data.id;
    await supabaseAdmin.from('organizations').update({ verification_status: 'APPROVED' }).eq('id', employerOrgId);

    // Issue Degree Credential to Alice
    const issueCredRes = await fetch(`http://localhost:${PORT}/api/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${issuerToken}` },
      body: JSON.stringify({
        subjectId: citizenUserId,
        issuerOrgId: collegeOrgId,
        domain: 'education',
        credentialType: 'Bachelor of Science',
        title: 'B.Sc Computer Science',
        claims: { degree: 'B.Sc', major: 'CS', gpa: '3.90', graduationYear: 2026, ssn: '999-00-1234' },
      }),
    });
    const issueCredData: any = await issueCredRes.json();
    issuedCredId = issueCredData.data.id;
    console.log(`✓ Setup complete. Credential ID: ${issuedCredId}`);

    // -------------------------------------------------------------------------
    // Test 1: Unconsented Credential Sharing Prevention (403 Forbidden)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 1: Security Check - Access Without Consent (Expected: 403 Forbidden) ---');
    const unconsentedAccessRes = await fetch(`http://localhost:${PORT}/api/consents/share-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employerToken}` },
      body: JSON.stringify({ credentialId: issuedCredId, requestingOrgId: employerOrgId }),
    });
    const unconsentedAccessData: any = await unconsentedAccessRes.json();
    console.log(`Status: ${unconsentedAccessRes.status} (Expected: 403 Forbidden)`);
    console.log('Unconsented Response:\n', JSON.stringify(unconsentedAccessData, null, 2));

    // -------------------------------------------------------------------------
    // Test 2: Organization Requests Consent (POST /api/consents/request)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 2: Organization Submits Consent Request (POST /api/consents/request) ---');
    const reqConsentRes = await fetch(`http://localhost:${PORT}/api/consents/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employerToken}` },
      body: JSON.stringify({
        citizenId: citizenUserId,
        requestingOrgId: employerOrgId,
        credentialId: issuedCredId,
        domain: 'education',
        purpose: 'Employment Verification for Senior Software Engineer Role',
        requestedClaims: ['degree', 'major', 'gpa'],
      }),
    });
    const reqConsentData: any = await reqConsentRes.json();
    console.log(`Status: ${reqConsentRes.status} (Expected: 201 Created)`);
    console.log('Consent Request Data:\n', JSON.stringify(reqConsentData, null, 2));
    requestedConsentId = reqConsentData.data.id;

    // -------------------------------------------------------------------------
    // Test 3: Citizen Responds & Approves Consent (POST /api/consents/:id/respond)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 3: Citizen Approves Consent with Granular Claims (POST /api/consents/:id/respond) ---');
    const respondRes = await fetch(`http://localhost:${PORT}/api/consents/${requestedConsentId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${citizenToken}` },
      body: JSON.stringify({
        action: 'APPROVE',
        approvedClaims: ['degree', 'major', 'gpa'], // Excludes sensitive SSN!
      }),
    });
    const respondData: any = await respondRes.json();
    console.log(`Status: ${respondRes.status} (Expected: 200 OK)`);
    console.log('Response Output:\n', JSON.stringify(respondData, null, 2));

    // -------------------------------------------------------------------------
    // Test 4: Shared Credential Access & Selective Disclosure
    // -------------------------------------------------------------------------
    console.log('\n--- Test 4: Employer Accesses Credential Under Active Consent (Selective Disclosure) ---');
    const sharedAccessRes = await fetch(`http://localhost:${PORT}/api/consents/share-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employerToken}` },
      body: JSON.stringify({ credentialId: issuedCredId, requestingOrgId: employerOrgId }),
    });
    const sharedAccessData: any = await sharedAccessRes.json();
    console.log(`Status: ${sharedAccessRes.status} (Expected: 200 OK)`);
    console.log('Shared Credential Data:\n', JSON.stringify(sharedAccessData, null, 2));

    // -------------------------------------------------------------------------
    // Test 5: Citizen Revokes Consent (POST /api/consents/:id/revoke)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 5: Citizen Revokes Consent (POST /api/consents/:id/revoke) ---');
    const revokeConsentRes = await fetch(`http://localhost:${PORT}/api/consents/${requestedConsentId}/revoke`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    const revokeConsentData: any = await revokeConsentRes.json();
    console.log(`Status: ${revokeConsentRes.status} (Expected: 200 OK)`);
    console.log('Revocation Response:\n', JSON.stringify(revokeConsentData, null, 2));

    // -------------------------------------------------------------------------
    // Test 6: Access Attempt After Revocation (Expected: 403 Forbidden)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 6: Access Attempt After Revocation (Expected: 403 Forbidden) ---');
    const postRevokeAccessRes = await fetch(`http://localhost:${PORT}/api/consents/share-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employerToken}` },
      body: JSON.stringify({ credentialId: issuedCredId, requestingOrgId: employerOrgId }),
    });
    const postRevokeAccessData: any = await postRevokeAccessRes.json();
    console.log(`Status: ${postRevokeAccessRes.status} (Expected: 403 Forbidden)`);
    console.log('Post-Revocation Response:\n', JSON.stringify(postRevokeAccessData, null, 2));

    // -------------------------------------------------------------------------
    // Test 7: Paginated Consent Listing
    // -------------------------------------------------------------------------
    console.log('\n--- Test 7: Paginated Consent Listing (GET /api/consents) ---');
    const listConsentRes = await fetch(`http://localhost:${PORT}/api/consents?page=1&limit=5`, {
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    const listConsentData: any = await listConsentRes.json();
    console.log(`Status: ${listConsentRes.status} (Expected: 200 OK)`);
    console.log(`Found ${listConsentData.data?.consents?.length || 0} consent records for citizen.`);

    // -------------------------------------------------------------------------
    // Test 8: Audit Log Verification
    // -------------------------------------------------------------------------
    console.log('\n--- Test 8: Audit-Log Verification ---');
    const { data: auditLogs } = await supabaseAdmin
      .from('audit_logs')
      .select('event_type, action, outcome, created_at')
      .in('event_type', ['CONSENT_GRANTED', 'CONSENT_REVOKED', 'VERIFICATION_REQUESTED'])
      .order('created_at', { ascending: false })
      .limit(5);

    console.log('Recent Consent Audit Logs:\n', JSON.stringify(auditLogs, null, 2));

    console.log('\n=== All Stage 4 Test Cases Executed Successfully ===');
  } catch (err) {
    console.error('Consent test execution error:', err);
  } finally {
    server.close(() => {
      console.log('\nTest server shutdown cleanly.');
      process.exit(0);
    });
  }
}

runConsentTests();
