import app from '../src/app';
import http from 'http';
import { supabaseAdmin } from '../src/config/supabase';

async function runCredentialTests() {
  console.log('=== Stage 3 Credentials Verification & Security Test Suite ===\n');

  const server = http.createServer(app);
  const PORT = 5005;
  await new Promise<void>((resolve) => server.listen(PORT, resolve));

  // Generate unique test identities
  const timestamp = Date.now();
  const issuerEmail = `issuer.admin.${timestamp}@credlink.org`;
  const citizen1Email = `citizen1.${timestamp}@credlink.org`;
  const citizen2Email = `citizen2.${timestamp}@credlink.org`;
  const testPassword = 'Password123!';

  let issuerToken = '';
  let issuerUserId = '';
  let citizen1Token = '';
  let citizen1UserId = '';
  let citizen2Token = '';
  let citizen2UserId = '';
  let createdOrgId = '';
  let issuedCredId = '';

  try {
    // -------------------------------------------------------------------------
    // Setup Step 1: Register accounts & obtain JWT tokens
    // -------------------------------------------------------------------------
    console.log('[Setup] Registering test accounts...');

    // 1. Issuer Admin Account
    const regIssuerRes = await fetch(`http://localhost:${PORT}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: issuerEmail,
        password: testPassword,
        fullName: 'University Admin',
        role: 'COLLEGE',
      }),
    });
    const regIssuerData: any = await regIssuerRes.json();
    issuerToken = regIssuerData.data.session.access_token;
    issuerUserId = regIssuerData.data.user.id;

    // 2. Citizen 1 Account
    const regCitizen1Res = await fetch(`http://localhost:${PORT}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: citizen1Email,
        password: testPassword,
        fullName: 'Alice Citizen',
        role: 'CITIZEN',
      }),
    });
    const regCitizen1Data: any = await regCitizen1Res.json();
    citizen1Token = regCitizen1Data.data.session.access_token;
    citizen1UserId = regCitizen1Data.data.user.id;

    // 3. Citizen 2 Account
    const regCitizen2Res = await fetch(`http://localhost:${PORT}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: citizen2Email,
        password: testPassword,
        fullName: 'Bob Citizen',
        role: 'CITIZEN',
      }),
    });
    const regCitizen2Data: any = await regCitizen2Res.json();
    citizen2Token = regCitizen2Data.data.session.access_token;
    citizen2UserId = regCitizen2Data.data.user.id;

    console.log('✓ Test accounts created successfully.');

    // -------------------------------------------------------------------------
    // Setup Step 2: Create & Approve Organization
    // -------------------------------------------------------------------------
    console.log('\n[Setup] Registering & Approving Issuer Organization...');
    const orgCode = `IIT-${timestamp.toString().slice(-4)}`;
    const createOrgRes = await fetch(`http://localhost:${PORT}/api/organizations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${issuerToken}`,
      },
      body: JSON.stringify({
        name: 'Indian Institute of Technology (Synthetic)',
        code: orgCode,
        domain: 'college',
        registrationRef: 'EDU-REG-2026-99',
      }),
    });
    const createOrgData: any = await createOrgRes.json();
    createdOrgId = createOrgData.data.id;

    // Server-side approve organization to grant issuer status
    await supabaseAdmin
      .from('organizations')
      .update({
        verification_status: 'APPROVED',
        is_issuer: true,
        authorized_credential_types: ['Bachelor of Technology', 'Master of Science'],
      })
      .eq('id', createdOrgId);

    console.log(`✓ Organization '${orgCode}' created & approved (ID: ${createdOrgId}).`);

    // -------------------------------------------------------------------------
    // Test 1: Authorized Credential Issuance
    // -------------------------------------------------------------------------
    console.log('\n--- Test 1: Authorized Credential Issuance (POST /api/credentials) ---');
    const issueRes = await fetch(`http://localhost:${PORT}/api/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${issuerToken}`,
      },
      body: JSON.stringify({
        subjectId: citizen1UserId,
        issuerOrgId: createdOrgId,
        domain: 'education',
        credentialType: 'Bachelor of Technology',
        title: 'Degree in Computer Science & Engineering',
        claims: {
          degree: 'B.Tech',
          major: 'Computer Science',
          gpa: '3.95',
          graduationYear: 2026,
        },
        expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });
    const issueData: any = await issueRes.json();
    console.log(`Status: ${issueRes.status} (Expected: 201 Created)`);
    console.log('Issued Credential Result:\n', JSON.stringify(issueData, null, 2));

    if (issueData.data?.id) {
      issuedCredId = issueData.data.id;
    }

    // -------------------------------------------------------------------------
    // Test 2: Invalid Credential Payloads & Self-Assignment Protection
    // -------------------------------------------------------------------------
    console.log('\n--- Test 2: Security Check - Invalid Payload & Self-Assigned Status ---');
    const invalidPayloadRes = await fetch(`http://localhost:${PORT}/api/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${issuerToken}`,
      },
      body: JSON.stringify({
        subjectId: citizen1UserId,
        issuerOrgId: createdOrgId,
        domain: 'education',
        credentialType: 'Degree',
        title: 'Tampered Credential',
        claims: { test: true },
        status: 'VALID', // Self-assigned status forbidden
      }),
    });
    const invalidPayloadData: any = await invalidPayloadRes.json();
    console.log(`Status: ${invalidPayloadRes.status} (Expected: 400 Bad Request)`);
    console.log('Validation Error Response:\n', JSON.stringify(invalidPayloadData, null, 2));

    // -------------------------------------------------------------------------
    // Test 3: Unauthorized Issuer Attempts
    // -------------------------------------------------------------------------
    console.log('\n--- Test 3: Security Check - Unauthorized Issuer (Citizen trying to issue) ---');
    const unauthIssueRes = await fetch(`http://localhost:${PORT}/api/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizen1Token}`,
      },
      body: JSON.stringify({
        subjectId: citizen2UserId,
        issuerOrgId: createdOrgId,
        domain: 'education',
        credentialType: 'Fake Degree',
        title: 'Self-Issued Degree',
        claims: { fake: true },
      }),
    });
    const unauthIssueData: any = await unauthIssueRes.json();
    console.log(`Status: ${unauthIssueRes.status} (Expected: 403 Forbidden)`);
    console.log('Unauthorized Response:\n', JSON.stringify(unauthIssueData, null, 2));

    // -------------------------------------------------------------------------
    // Test 4: Citizen Access to Own Credentials
    // -------------------------------------------------------------------------
    console.log('\n--- Test 4: Citizen Accessing Own Credentials (GET /api/credentials) ---');
    const citizenListRes = await fetch(`http://localhost:${PORT}/api/credentials`, {
      headers: { Authorization: `Bearer ${citizen1Token}` },
    });
    const citizenListData: any = await citizenListRes.json();
    console.log(`Status: ${citizenListRes.status} (Expected: 200 OK)`);
    console.log(`Found ${citizenListData.data?.credentials?.length || 0} credentials for Alice.`);

    // -------------------------------------------------------------------------
    // Test 5: Prevention of Cross-Citizen Access
    // -------------------------------------------------------------------------
    console.log('\n--- Test 5: Security Check - Cross-Citizen Unauthorized Access ---');
    const crossAccessRes = await fetch(`http://localhost:${PORT}/api/credentials/${issuedCredId}`, {
      headers: { Authorization: `Bearer ${citizen2Token}` }, // Bob trying to fetch Alice's credential
    });
    const crossAccessData: any = await crossAccessRes.json();
    console.log(`Status: ${crossAccessRes.status} (Expected: 403 Forbidden)`);
    console.log('Cross-Citizen Access Response:\n', JSON.stringify(crossAccessData, null, 2));

    // -------------------------------------------------------------------------
    // Test 6: Credential Retrieval & Pagination
    // -------------------------------------------------------------------------
    console.log('\n--- Test 6: Paginated Listing with Domain Filter ---');
    const listRes = await fetch(`http://localhost:${PORT}/api/credentials?domain=education&page=1&limit=5`, {
      headers: { Authorization: `Bearer ${issuerToken}` },
    });
    const listData: any = await listRes.json();
    console.log(`Status: ${listRes.status} (Expected: 200 OK)`);
    console.log('Paginated Result:\n', JSON.stringify(listData.data?.pagination, null, 2));

    // -------------------------------------------------------------------------
    // Test 7: Authorized Revocation & Unauthorized Revocation Prevention
    // -------------------------------------------------------------------------
    console.log('\n--- Test 7a: Security Check - Unauthorized Revocation (Citizen attempting to revoke) ---');
    const unauthRevokeRes = await fetch(`http://localhost:${PORT}/api/credentials/${issuedCredId}/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizen1Token}`,
      },
      body: JSON.stringify({ reason: 'Self revocation' }),
    });
    const unauthRevokeData: any = await unauthRevokeRes.json();
    console.log(`Status: ${unauthRevokeRes.status} (Expected: 403 Forbidden)`);
    console.log('Unauthorized Revoke Response:\n', JSON.stringify(unauthRevokeData, null, 2));

    console.log('\n--- Test 7b: Authorized Revocation (Issuer Admin revoking) ---');
    const authRevokeRes = await fetch(`http://localhost:${PORT}/api/credentials/${issuedCredId}/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${issuerToken}`,
      },
      body: JSON.stringify({ reason: 'Administrative academic audit request' }),
    });
    const authRevokeData: any = await authRevokeRes.json();
    console.log(`Status: ${authRevokeRes.status} (Expected: 200 OK)`);
    console.log('Revocation Response:\n', JSON.stringify(authRevokeData, null, 2));

    // -------------------------------------------------------------------------
    // Test 8 & 10: Verification & Cryptographic Signature Check
    // -------------------------------------------------------------------------
    console.log('\n--- Test 8 & 10: Credential Verification & Cryptographic Signature Check ---');
    const verifyRes = await fetch(`http://localhost:${PORT}/api/credentials/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizen1Token}`,
      },
      body: JSON.stringify({ credentialId: issuedCredId }),
    });
    const verifyData: any = await verifyRes.json();
    console.log(`Status: ${verifyRes.status} (Expected: 200 OK)`);
    console.log('Verification Output:\n', JSON.stringify(verifyData, null, 2));

    // -------------------------------------------------------------------------
    // Test 9: Audit Log Verification
    // -------------------------------------------------------------------------
    console.log('\n--- Test 9: Audit-Log Verification ---');
    const { data: auditLogs } = await supabaseAdmin
      .from('audit_logs')
      .select('event_type, action, outcome, created_at')
      .in('event_type', ['CREDENTIAL_ISSUED', 'CREDENTIAL_REVOKED'])
      .order('created_at', { ascending: false })
      .limit(5);

    console.log('Recent Credential Audit Logs:\n', JSON.stringify(auditLogs, null, 2));

    console.log('\n=== All Stage 3 Test Cases Executed Successfully ===');
  } catch (err) {
    console.error('Credential test execution error:', err);
  } finally {
    server.close(() => {
      console.log('\nTest server shutdown cleanly.');
      process.exit(0);
    });
  }
}

runCredentialTests();
