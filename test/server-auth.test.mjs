import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createServer } from '../lib/server.mjs';

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

test('server-auth - unauthenticated server allows open access', async () => {
  const server = createServer({
    transportType: 'sse',
    port: 3901,
    host: '127.0.0.1',
    mcpApiKey: ''
  });

  const { httpServer } = await server.start();

  try {
    const health = await makeRequest('http://127.0.0.1:3901/health');
    assert.equal(health.statusCode, 200);
    const healthData = JSON.parse(health.body);
    assert.equal(healthData.authenticated, false);
  } finally {
    await new Promise(r => httpServer.close(r));
  }
});

test('server-auth - enforces MCP_API_KEY on SSE endpoints', async () => {
  const TEST_KEY = 'test_secret_key_12345';
  const server = createServer({
    transportType: 'sse',
    port: 3902,
    host: '127.0.0.1',
    mcpApiKey: TEST_KEY
  });

  const { httpServer } = await server.start();

  try {
    // 1. Health check is available and indicates auth is enabled
    const health = await makeRequest('http://127.0.0.1:3902/health');
    assert.equal(health.statusCode, 200);
    const healthData = JSON.parse(health.body);
    assert.equal(healthData.authenticated, true);

    // 2. Unauthenticated request to /sse is rejected with 401
    const unauth = await makeRequest('http://127.0.0.1:3902/sse');
    assert.equal(unauth.statusCode, 401);
    const unauthBody = JSON.parse(unauth.body);
    assert.equal(unauthBody.error, 'Unauthorized');

    // 3. Request with wrong token is rejected with 401
    const wrongAuth = await makeRequest('http://127.0.0.1:3902/sse', {
      headers: {
        'Authorization': 'Bearer wrong_key'
      }
    });
    assert.equal(wrongAuth.statusCode, 401);

    // 4. Request with query param token succeeds (initiates SSE stream)
    const sseWithQueryReq = http.request('http://127.0.0.1:3902/sse?token=' + TEST_KEY, (res) => {
      assert.equal(res.statusCode, 200);
      assert.match(res.headers['content-type'], /text\/event-stream/);
      res.destroy();
    });
    await new Promise((resolve) => {
      sseWithQueryReq.on('close', resolve);
      sseWithQueryReq.end();
    });

    // 5. Request with Authorization: Bearer header succeeds
    const sseWithHeaderReq = http.request('http://127.0.0.1:3902/sse', {
      headers: {
        'Authorization': `Bearer ${TEST_KEY}`
      }
    }, (res) => {
      assert.equal(res.statusCode, 200);
      assert.match(res.headers['content-type'], /text\/event-stream/);
      res.destroy();
    });
    await new Promise((resolve) => {
      sseWithHeaderReq.on('close', resolve);
      sseWithHeaderReq.end();
    });

    // 6. Messages endpoint rejects unauthenticated POST with 401
    const msgUnauth = await makeRequest('http://127.0.0.1:3902/messages?sessionId=dummy', {
      method: 'POST',
      body: '{}'
    });
    assert.equal(msgUnauth.statusCode, 401);

    // 7. Messages endpoint with valid key checks session existence (returns 404 for unknown session)
    const msgAuth = await makeRequest('http://127.0.0.1:3902/messages?sessionId=dummy', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TEST_KEY}`,
        'Content-Type': 'application/json'
      },
      body: '{}'
    });
    assert.equal(msgAuth.statusCode, 404);
  } finally {
    await new Promise(r => httpServer.close(r));
  }
});
