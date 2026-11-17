import test from 'node:test';
import assert from 'node:assert/strict';

const envModuleUrl = new URL('../src/config/env.js', import.meta.url);

test('client origins accepts a comma-separated list and keeps the first host as the primary URL', async () => {
  const original = process.env.CLIENT_URL;
  const originalUrls = process.env.CLIENT_URLS;
  process.env.CLIENT_URL = 'https://app.example.com';
  process.env.CLIENT_URLS = 'https://app.example.com,https://admin.example.com,https://localhost:5173';

  try {
    const { env: configured } = await import(`${envModuleUrl.href}?fresh=${Date.now()}`);
    assert.deepEqual(configured.clientUrls, [
      'https://app.example.com',
      'https://admin.example.com',
      'https://localhost:5173',
    ]);
    assert.equal(configured.clientUrl, 'https://app.example.com');
  } finally {
    if (original === undefined) delete process.env.CLIENT_URL; else process.env.CLIENT_URL = original;
    if (originalUrls === undefined) delete process.env.CLIENT_URLS; else process.env.CLIENT_URLS = originalUrls;
  }
});
