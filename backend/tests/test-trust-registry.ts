import app from '../src/app';
import http from 'http';
import { supabaseAdmin } from '../src/config/supabase';

async function runTrustRegistryTests() {
  console.log('=== Stage 5 Trust Registry & Multi-Layer Verification Test Suite ===\n');

  const server = http.createServer(app);
  const PORT = 5007;
  await new Promise<void>((resolve) => server.listen(PORT, resolve));

  const timestamp = Date.now();
  const adminEmail = `admin.network.${timestamp}@credlink.org`;
  const issuerEmail = `issuer.college.${timestamp}@credlink.org`;
  const citizenEmail = `citizen.bob.${timestamp}@credlink.org`;
  const testPassword = 'Password123!';

  let adminToken = '';
  let issuerToken = '';
  let citizenToken = '';
  let citizenUserId = '';
  let collegeOrgId = '';
  let issuedCredId = '';
  let trustRecordId = '';

  try {
    // -------------------------------------------------------------------------
    // Setup Step 1: Register Accounts & Network Admin
    // -------------------------------------------------------------------------
    console.log('[Setup] Registering test accounts...');

    // 1. Network Admin Account
    const regAdminRes = await fetch(`http://localhost:${PORT}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: testPassword, fullName: 'Network Admin', role: 'ADMIN' }),
    });
    const regAdminData: any = await regAdminRes.json();
    adminToken = regAdminData.data.session.access_token;

    // 2. Issuer Admin Account
    const regIssuerRes = await fetch(`http://localhost:${PORT}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: issuerEmail, password: testPassword, fullName: 'Dean Admin', role: 'COLLEGE' }),
    });
    const regIssuerData: any = await regIssuerRes.json();
    issuerToken = regIssuerData.data.session.access_token;

    // 3. Citizen Bob
    const regCitizenRes = await fetch(`http://localhost:${PORT}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: citizenEmail, password: testPassword, fullName: 'Bob Student', role: 'CITIZEN' }),
    });
    const regCitizenData: any = await regCitizenRes.json();
    citizenToken = regCitizenData.data.session.access_token;
    citizenUserId = regCitizenData.data.user.id;

    // Create & Approve College Org
    const createCollegeRes = await fetch(`http://localhost:${PORT}/api/organizations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${issuerToken}` },
      body: JSON.stringify({ name: 'Oxford University (Synthetic)', code: `OX-${timestamp.toString().slice(-4)}`, domain: 'college' }),
    });
    const createCollegeData: any = await createCollegeRes.json();
    collegeOrgId = createCollegeData.data.id;
    await supabaseAdmin.from('organizations').update({ verification_status: 'APPROVED', is_issuer: true }).eq('id', collegeOrgId);

    // Issue Degree Credential to Bob
    const issueCredRes = await fetch(`http://localhost:${PORT}/api/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${issuerToken}` },
      body: JSON.stringify({
        subjectId: citizenUserId,
        issuerOrgId: collegeOrgId,
        domain: 'education',
        credentialType: 'Master of Science',
        title: 'M.Sc Data Science',
        claims: { degree: 'M.Sc', gpa: '3.98', year: 2026 },
      }),
    });
    const issueCredData: any = await issueCredRes.json();
    issuedCredId = issueCredData.data.id;
    console.log(`✓ Setup complete. College Org ID: ${collegeOrgId}, Credential ID: ${issuedCredId}`);

    // -------------------------------------------------------------------------
    // Test 1: Security Check - Non-Admin Attempting Trust Registry Modification
    // -------------------------------------------------------------------------
    console.log('\n--- Test 1: Security Check - Issuer Trying to Register in Trust Registry (Expected: 403 Forbidden) ---');
    const unauthRegRes = await fetch(`http://localhost:${PORT}/api/trust-registry/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${issuerToken}` },
      body: JSON.stringify({ organizationId: collegeOrgId, trustStatus: 'VERIFIED' }),
    });
    const unauthRegData: any = await unauthRegRes.json();
    console.log(`Status: ${unauthRegRes.status} (Expected: 403 Forbidden)`);
    console.log('Unauthorized Response:\n', JSON.stringify(unauthRegData, null, 2));

    // -------------------------------------------------------------------------
    // Test 2: Network Admin Registers Issuer in Trust Registry
    // -------------------------------------------------------------------------
    console.log('\n--- Test 2: Network Admin Registers Issuer in Trust Registry (POST /api/trust-registry/register) ---');
    const regTrustRes = await fetch(`http://localhost:${PORT}/api/trust-registry/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        organizationId: collegeOrgId,
        trustStatus: 'VERIFIED',
        verificationMetadata: { auditor: 'Global Accreditation Board', rating: 'AAA' },
      }),
    });
    const regTrustData: any = await regTrustRes.json();
    console.log(`Status: ${regTrustRes.status} (Expected: 201 Created)`);
    console.log('Trust Registry Entry:\n', JSON.stringify(regTrustData, null, 2));
    trustRecordId = regTrustData.data.id;

    // -------------------------------------------------------------------------
    // Test 3: Multi-Layer Comprehensive Verification (Trusted & Valid Credential)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 3: Comprehensive Verification for Trusted Credential (POST /api/verification/verify-credential) ---');
    const verifyValidRes = await fetch(`http://localhost:${PORT}/api/verification/verify-credential`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${citizenToken}` },
      body: JSON.stringify({ credentialId: issuedCredId }),
    });
    const verifyValidData: any = await verifyValidRes.json();
    console.log(`Status: ${verifyValidRes.status} (Expected: 200 OK)`);
    console.log('Verification Report:\n', JSON.stringify(verifyValidData, null, 2));

    // -------------------------------------------------------------------------
    // Test 4: Network Admin Suspends Issuer Trust Status
    // -------------------------------------------------------------------------
    console.log('\n--- Test 4: Network Admin Suspends Issuer Trust Status (PATCH /api/trust-registry/:id/status) ---');
    const suspendRes = await fetch(`http://localhost:${PORT}/api/trust-registry/${collegeOrgId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ trustStatus: 'SUSPENDED', reason: 'Pending audit review of credential issuance policies' }),
    });
    const suspendData: any = await suspendRes.json();
    console.log(`Status: ${suspendRes.status} (Expected: 200 OK)`);
    console.log('Suspended Trust Entry:\n', JSON.stringify(suspendData, null, 2));

    // -------------------------------------------------------------------------
    // Test 5: Comprehensive Verification Rejection (Suspended Issuer)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 5: Verification Attempt for Credential from Suspended Issuer (Expected: REJECTED) ---');
    const verifySuspendedRes = await fetch(`http://localhost:${PORT}/api/verification/verify-credential`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${citizenToken}` },
      body: JSON.stringify({ credentialId: issuedCredId }),
    });
    const verifySuspendedData: any = await verifySuspendedRes.json();
    console.log(`Status: ${verifySuspendedRes.status} (Expected: 200 OK)`);
    console.log('Verification Report (Suspended Issuer):\n', JSON.stringify(verifySuspendedData, null, 2));

    // -------------------------------------------------------------------------
    // Test 6: Listing & Lookup of Trust Registry Entries
    // -------------------------------------------------------------------------
    console.log('\n--- Test 6: Trust Registry Public Listing & Org Lookup ---');
    const listTrustRes = await fetch(`http://localhost:${PORT}/api/trust-registry?trustStatus=SUSPENDED`, {
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    const listTrustData: any = await listTrustRes.json();
    console.log(`Status: ${listTrustRes.status} (Expected: 200 OK)`);
    console.log(`Found ${listTrustData.data?.entries?.length || 0} suspended trust records.`);

    // -------------------------------------------------------------------------
    // Test 7: Audit Log Verification
    // -------------------------------------------------------------------------
    console.log('\n--- Test 7: Audit-Log Verification ---');
    const { data: auditLogs } = await supabaseAdmin
      .from('audit_logs')
      .select('event_type, action, outcome, created_at')
      .in('event_type', ['ORGANIZATION_STATUS_CHANGED', 'VERIFICATION_APPROVED', 'VERIFICATION_REQUESTED'])
      .order('created_at', { ascending: false })
      .limit(5);

    console.log('Recent Trust & Verification Audit Logs:\n', JSON.stringify(auditLogs, null, 2));

    console.log('\n=== All Stage 5 Test Cases Executed Successfully ===');
  } catch (err) {
    console.error('Trust Registry test execution error:', err);
  } finally {
    server.close(() => {
      console.log('\nTest server shutdown cleanly.');
      process.exit(0);
    });
  }
}

runTrustRegistryTests();
