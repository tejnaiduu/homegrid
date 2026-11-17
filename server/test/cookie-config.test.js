import test from 'node:test';
import assert from 'node:assert/strict';

const envModuleUrl = new URL('../src/config/env.js', import.meta.url);

test('cookie configuration normalizes sameSite and rejects invalid production settings', async () => {
  const originalCookieSameSite = process.env.COOKIE_SAME_SITE;
  const originalCookieSecure = process.env.COOKIE_SECURE;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalClientUrl = process.env.CLIENT_URL;
  const originalClientUrls = process.env.CLIENT_URLS;
  const originalMongoUri = process.env.MONGODB_URI;
  process.env.NODE_ENV = 'production';
  process.env.MONGODB_URI = 'mongodb+srv://cluster.example.com/electrical_material_platform';
  process.env.CLIENT_URL = 'https://app.example.com';
  process.env.CLIENT_URLS = 'https://app.example.com';
  process.env.COOKIE_SAME_SITE = 'NONE';
  process.env.COOKIE_SECURE = 'true';

  try {
    const { env: configured } = await import(`${envModuleUrl.href}?fresh=${Date.now()}`);
    assert.equal(configured.cookieSameSite, 'none');
    assert.equal(configured.cookieSecure, true);
  } finally {
    if (originalCookieSameSite === undefined) delete process.env.COOKIE_SAME_SITE; else process.env.COOKIE_SAME_SITE = originalCookieSameSite;
    if (originalCookieSecure === undefined) delete process.env.COOKIE_SECURE; else process.env.COOKIE_SECURE = originalCookieSecure;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNodeEnv;
    if (originalClientUrl === undefined) delete process.env.CLIENT_URL; else process.env.CLIENT_URL = originalClientUrl;
    if (originalClientUrls === undefined) delete process.env.CLIENT_URLS; else process.env.CLIENT_URLS = originalClientUrls;
    if (originalMongoUri === undefined) delete process.env.MONGODB_URI; else process.env.MONGODB_URI = originalMongoUri;
  }
});

test('cookie configuration rejects invalid sameSite values', async () => {
  const originalCookieSameSite = process.env.COOKIE_SAME_SITE;
  const originalCookieSecure = process.env.COOKIE_SECURE;
  process.env.COOKIE_SAME_SITE = 'invalid';
  process.env.COOKIE_SECURE = 'true';

  try {
    await assert.rejects(
      import(`${envModuleUrl.href}?fresh=${Date.now() + 1}`),
      /COOKIE_SAME_SITE/i,
    );
  } finally {
    if (originalCookieSameSite === undefined) delete process.env.COOKIE_SAME_SITE; else process.env.COOKIE_SAME_SITE = originalCookieSameSite;
    if (originalCookieSecure === undefined) delete process.env.COOKIE_SECURE; else process.env.COOKIE_SECURE = originalCookieSecure;
  }
});

test('production configuration rejects insecure local endpoints and cookies', async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalMongoUri = process.env.MONGODB_URI;
  const originalClientUrl = process.env.CLIENT_URL;
  const originalClientUrls = process.env.CLIENT_URLS;
  const originalCookieSecure = process.env.COOKIE_SECURE;
  const originalCookieSameSite = process.env.COOKIE_SAME_SITE;

  process.env.NODE_ENV = 'production';
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/electrical_material_platform';
  process.env.CLIENT_URL = 'http://localhost:5173';
  process.env.CLIENT_URLS = 'http://localhost:5173';
  process.env.COOKIE_SECURE = 'false';
  process.env.COOKIE_SAME_SITE = 'lax';

  try {
    await assert.rejects(
      import(`${envModuleUrl.href}?fresh=${Date.now() + 2}`),
      /production|CLIENT_URL|MONGODB_URI|COOKIE_SECURE/i,
    );
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNodeEnv;
    if (originalMongoUri === undefined) delete process.env.MONGODB_URI; else process.env.MONGODB_URI = originalMongoUri;
    if (originalClientUrl === undefined) delete process.env.CLIENT_URL; else process.env.CLIENT_URL = originalClientUrl;
    if (originalClientUrls === undefined) delete process.env.CLIENT_URLS; else process.env.CLIENT_URLS = originalClientUrls;
    if (originalCookieSecure === undefined) delete process.env.COOKIE_SECURE; else process.env.COOKIE_SECURE = originalCookieSecure;
    if (originalCookieSameSite === undefined) delete process.env.COOKIE_SAME_SITE; else process.env.COOKIE_SAME_SITE = originalCookieSameSite;
  }
});
