import http from 'http';
import { CredLinkApiClient, ApiClientError } from '../../../packages/api-client';

async function runApiClientTests() {
  console.log('=== Running CredLink API Client Test Suite ===\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  // Set up mock HTTP server on localhost:5009
  const PORT = 5009;
  let mockHandler: (req: http.IncomingMessage, res: http.ServerResponse) => void;

  const server = http.createServer((req, res) => {
    if (mockHandler) {
      mockHandler(req, res);
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  const client = new CredLinkApiClient(`http://localhost:${PORT}`);

  try {
    // Test 1: Successful Login
    mockHandler = (req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        const payload = JSON.parse(body);
        if (req.url === '/api/auth/login' && req.method === 'POST' && payload.email === 'admin@hospital.org') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: true,
              message: 'Login successful',
              data: {
                user: { id: 'usr_mock_1', email: payload.email, fullName: 'Mock Doctor', role: 'HOSPITAL', status: 'ACTIVE' },
                session: { access_token: 'mock_jwt_token_123', refresh_token: 'mock_refresh_token', expires_at: 1740000000 },
                memberships: [
                  {
                    id: 'mem_1',
                    member_role: 'ADMIN',
                    status: 'ACTIVE',
                    organization: { id: 'org_1', name: 'St. Jude Hospital', code: 'SJH', domain: 'hospital', did: 'did:credlink:health:stjude:0x44ab09', is_issuer: true }
                  }
                ]
              },
              timestamp: new Date().toISOString()
            })
          );
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Invalid credentials', timestamp: new Date().toISOString() }));
        }
      });
    };

    const loginRes = await client.login({ email: 'admin@hospital.org', password: 'Password123!' });
    assert(loginRes.success === true, 'Test 1: Login returns success: true');
    assert(loginRes.data?.session?.access_token === 'mock_jwt_token_123', 'Test 1: Login returns access_token');
    assert(client.getToken() === 'mock_jwt_token_123', 'Test 1: API client automatically stores Bearer token');

    // Test 2: Invalid Credentials (401)
    try {
      await client.login({ email: 'wrong@hospital.org', password: 'bad' });
      assert(false, 'Test 2: Failed login should throw ApiClientError');
    } catch (err) {
      assert(err instanceof ApiClientError && err.statusCode === 401, 'Test 2: Login 401 error correctly caught');
    }

    // Test 3: Authenticated GET /api/auth/me attaches Bearer header
    let receivedAuthHeader = '';
    mockHandler = (req, res) => {
      receivedAuthHeader = req.headers['authorization'] || '';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          data: {
            user: { id: 'usr_mock_1', email: 'admin@hospital.org', fullName: 'Mock Doctor', role: 'HOSPITAL', status: 'ACTIVE' },
            memberships: []
          },
          timestamp: new Date().toISOString()
        })
      );
    };

    const meRes = await client.getMe();
    assert(meRes.success === true, 'Test 3: getMe returns success: true');
    assert(receivedAuthHeader === 'Bearer mock_jwt_token_123', 'Test 3: getMe sends Authorization: Bearer <token>');

    // Test 4: Server 500 Error Handling
    mockHandler = (_req, res) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Database connection failed', timestamp: new Date().toISOString() }));
    };
    try {
      await client.getMe();
      assert(false, 'Test 4: 500 Server error should throw ApiClientError');
    } catch (err) {
      assert(err instanceof ApiClientError && err.statusCode === 500, 'Test 4: 500 Server error correctly caught');
    }

    // Test 5: Invalid JSON Response Handling
    mockHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body>Bad Gateway</body></html>');
    };
    try {
      await client.getMe();
      assert(false, 'Test 5: Non-JSON response should throw ApiClientError');
    } catch (err) {
      assert(err instanceof ApiClientError && err.message.includes('Invalid JSON'), 'Test 5: Non-JSON error correctly caught');
    }

    // Test 6: Logout clears token
    mockHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Logged out', timestamp: new Date().toISOString() }));
    };
    await client.logout();
    assert(client.getToken() === null, 'Test 6: Logout clears token from API client');

  } finally {
    server.close();
  }

  // Test 7: Network failure when server is down
  const deadClient = new CredLinkApiClient('http://localhost:59999');
  try {
    await deadClient.checkHealth();
    assert(false, 'Test 7: Network connection failure should throw ApiClientError');
  } catch (err) {
    assert(err instanceof ApiClientError && err.statusCode === 503, 'Test 7: Network error caught cleanly');
  }

  console.log(`\n=== API Client Test Summary: ${passed} Passed, ${failed} Failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runApiClientTests();
