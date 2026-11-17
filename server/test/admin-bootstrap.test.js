import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const setupToken = 'test-bootstrap-token-with-at-least-32-characters';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-with-at-least-32-characters';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.ADMIN_BOOTSTRAP_TOKEN = setupToken;

const { default: app } = await import('../src/app.js');
const { env } = await import('../src/config/env.js');
const { connectDatabase } = await import('../src/config/db.js');
const { default: User } = await import('../src/models/User.js');

async function requestJson(server, path, options = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1',
      port: server.address().port,
      path,
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({
        statusCode: response.statusCode,
        headers: response.headers,
        body: body ? JSON.parse(body) : null,
      }));
    });

    request.on('error', reject);
    if (options.body) request.write(JSON.stringify(options.body));
    request.end();
  });
}

test('first admin setup requires the key and closes permanently after one creation', { concurrency: false }, async () => {
  const memoryServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = memoryServer.getUri();
  env.adminBootstrapToken = setupToken;
  await connectDatabase();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const configuredToken = env.adminBootstrapToken;
    env.adminBootstrapToken = '';
    const unconfiguredStatus = await requestJson(server, '/api/v1/auth/admin-setup/status');
    assert.equal(unconfiguredStatus.body.data.available, false);
    env.adminBootstrapToken = configuredToken;

    const initialStatus = await requestJson(server, '/api/v1/auth/admin-setup/status');
    assert.equal(initialStatus.statusCode, 200);
    assert.equal(initialStatus.body.data.available, true);

    const invalidKey = await requestJson(server, '/api/v1/auth/admin-setup', {
      method: 'POST',
      body: {
        name: 'First Admin',
        email: 'admin@example.com',
        password: 'StrongAdminPass1!',
        setupToken: 'invalid',
      },
    });
    assert.equal(invalidKey.statusCode, 403);

    const attempts = await Promise.all([
      requestJson(server, '/api/v1/auth/admin-setup', {
        method: 'POST',
        body: {
          name: 'First Admin',
          email: 'admin@example.com',
          password: 'StrongAdminPass1!',
          setupToken,
        },
      }),
      requestJson(server, '/api/v1/auth/admin-setup', {
        method: 'POST',
        body: {
          name: 'Other Admin',
          email: 'other-admin@example.com',
          password: 'StrongAdminPass2!',
          setupToken,
        },
      }),
    ]);

    assert.deepEqual(attempts.map((response) => response.statusCode).sort(), [201, 410]);
    assert.equal(await User.countDocuments({ roles: 'ADMIN' }), 1);
    assert.equal(attempts.find((response) => response.statusCode === 201).body.data.user.roles[0], 'ADMIN');

    const closedStatus = await requestJson(server, '/api/v1/auth/admin-setup/status');
    assert.equal(closedStatus.body.data.available, false);

    const publicAdminRegistration = await requestJson(server, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'Public Admin',
        email: 'public-admin@example.com',
        password: 'StrongAdminPass3!',
        role: 'ADMIN',
      },
    });
    assert.equal(publicAdminRegistration.statusCode, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    await memoryServer.stop();
  }
});
