import app from '../src/app';
import http from 'http';

async function runOrgTests() {
  console.log('=== Stage 2 Organizations Endpoint Verification Test ===');

  const server = http.createServer(app);
  const PORT = 5004;
  await new Promise<void>((resolve) => server.listen(PORT, resolve));

  const testEmail = `org.test.${Date.now()}@credlink.org`;
  const testPassword = 'Password123!';
  let authToken = '';
  let createdOrgId = '';

  try {
    // 1. Register test user to obtain valid JWT token
    const regRes = await fetch(`http://localhost:${PORT}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        fullName: 'Org Admin User',
        role: 'COLLEGE',
      }),
    });
    const regData: any = await regRes.json();
    authToken = regData.data.session.access_token;
    console.log('Test user registered.');

    // 2. Submit Organization Registration (POST /api/organizations)
    console.log('\n--- 1. Testing POST /api/organizations (Valid Submission) ---');
    const orgCode = `AIIMS-${Date.now().toString().slice(-4)}`;
    const createRes = await fetch(`http://localhost:${PORT}/api/organizations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        name: 'All India Institute of Medical Sciences (Synthetic)',
        code: orgCode,
        domain: 'hospital',
        registrationRef: 'HOSP-SYNTH-2026-001',
      }),
    });
    const createData: any = await createRes.json();
    console.log(`POST /api/organizations Status: ${createRes.status}`);
    console.log('Created Org Data:\n', JSON.stringify(createData, null, 2));
    if (createData.data?.id) {
      createdOrgId = createData.data.id;
    }

    // 3. GET /api/organizations (Listing with Pagination and Domain Filter)
    console.log('\n--- 2. Testing GET /api/organizations (Listing & Filtering by domain=hospital) ---');
    const listRes = await fetch(`http://localhost:${PORT}/api/organizations?domain=hospital&page=1&limit=5`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const listData: any = await listRes.json();
    console.log(`GET /api/organizations Status: ${listRes.status}`);
    console.log('Organizations List:\n', JSON.stringify(listData, null, 2));

    // 4. GET /api/organizations/:id (Fetching Specific Organization)
    console.log(`\n--- 3. Testing GET /api/organizations/${createdOrgId} ---`);
    const getRes = await fetch(`http://localhost:${PORT}/api/organizations/${createdOrgId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const getData: any = await getRes.json();
    console.log(`GET /api/organizations/:id Status: ${getRes.status}`);
    console.log('Organization Details:\n', JSON.stringify(getData, null, 2));

    // 5. Invalid Organization ID Check
    console.log('\n--- 4. Testing GET /api/organizations/invalid-uuid-format ---');
    const invalidIdRes = await fetch(`http://localhost:${PORT}/api/organizations/invalid-uuid-format`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const invalidIdData: any = await invalidIdRes.json();
    console.log(`Invalid ID Status: ${invalidIdRes.status} (Expected: 400)`);
    console.log('Invalid ID Response:\n', JSON.stringify(invalidIdData, null, 2));

    // 6. Security Check: Self-assigning "APPROVED" status or "isIssuer: true"
    console.log('\n--- 5. Security Check: Attempting to Self-Approve Status ({ verificationStatus: "APPROVED", isIssuer: true }) ---');
    const tamperRes = await fetch(`http://localhost:${PORT}/api/organizations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        name: 'Rogue Institute',
        code: `ROGUE-${Date.now().toString().slice(-4)}`,
        domain: 'college',
        verificationStatus: 'APPROVED',
        isIssuer: true,
      }),
    });
    const tamperData: any = await tamperRes.json();
    console.log(`Self-Approval Attempt Status: ${tamperRes.status} (Expected: 400 Bad Request)`);
    console.log('Self-Approval Response:\n', JSON.stringify(tamperData, null, 2));

    // 7. Security Check: Unauthenticated Request
    console.log('\n--- 6. Security Check: Unauthenticated GET /api/organizations ---');
    const unauthRes = await fetch(`http://localhost:${PORT}/api/organizations`);
    const unauthData: any = await unauthRes.json();
    console.log(`Unauthenticated Status: ${unauthRes.status} (Expected: 401)`);
    console.log('Unauthenticated Response:\n', JSON.stringify(unauthData, null, 2));

  } catch (err) {
    console.error('Organization test failed:', err);
  } finally {
    server.close(() => {
      console.log('\nTest Server closed cleanly.');
      process.exit(0);
    });
  }
}

runOrgTests();
