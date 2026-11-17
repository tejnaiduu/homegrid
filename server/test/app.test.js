import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/homegrid_test';
process.env.JWT_SECRET = 'test-secret-with-at-least-32-characters';
process.env.CLIENT_URL = 'http://localhost:5173';

const { default: app } = await import('../src/app.js');

function request(server, path, options = {}) {
  return new Promise((resolve, reject) => {
    const requestOptions = { hostname: '127.0.0.1', port: server.address().port, path, ...options };
    const clientRequest = http.request(requestOptions, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    clientRequest.on('error', reject);
    clientRequest.end();
  });
}

test('health endpoint is available without authentication', async () => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await request(server, '/api/v1/health');
    assert.equal(response.status, 200);
    assert.match(response.body, /Electrical platform API is running/);
    assert.ok(response.headers['x-content-type-options']);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('readiness endpoint reports database state', async () => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await request(server, '/api/v1/health/ready');
    assert.ok([200, 503].includes(response.status));
    const payload = JSON.parse(response.body);
    assert.ok(payload.database);
    assert.ok(payload.state || payload.readyState !== undefined);
    assert.ok(payload.details || payload.message);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('protected role routes reject unauthenticated requests', async () => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    for (const path of ['/api/v1/admin/overview', '/api/v1/shop/orders', '/api/v1/notifications', '/api/v1/invoices/not-an-id/pdf']) {
      const response = await request(server, path);
      assert.equal(response.status, 401, path);
    }
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
