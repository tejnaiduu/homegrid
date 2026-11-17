import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });

const nodeEnv = String(process.env.NODE_ENV || 'development').toLowerCase();
const required = ['MONGODB_URI', 'JWT_SECRET'];
const missing = required.filter((key) => !process.env[key] || !String(process.env[key]).trim());
const adminBootstrapToken = String(process.env.ADMIN_BOOTSTRAP_TOKEN || '').trim();

if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}. Create server/.env from the example or run "npm run setup:env" from the project root, then update the values before starting the API.`);
}

if (String(process.env.JWT_SECRET).length < 32) {
  throw new Error('JWT_SECRET must contain at least 32 characters.');
}
if (adminBootstrapToken && adminBootstrapToken.length < 32) {
  throw new Error('ADMIN_BOOTSTRAP_TOKEN must contain at least 32 characters when set.');
}

const port = Number(process.env.PORT || 5000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be a valid integer between 1 and 65535.');
}

const rawClientUrls = [process.env.CLIENT_URL, process.env.CLIENT_URLS]
  .flatMap((value) => typeof value === 'string' ? value.split(',') : [])
  .map((value) => value.trim())
  .filter(Boolean);
const clientUrls = [...new Set(rawClientUrls.length ? rawClientUrls : ['http://localhost:5173'])];

if (nodeEnv === 'production') {
  if (!clientUrls.length || clientUrls.some((url) => /localhost|127\.0\.0\.1/i.test(url) || !/^https:\/\//i.test(url))) {
    throw new Error('Production CLIENT_URL / CLIENT_URLS must include HTTPS origins only and must not point to localhost or 127.0.0.1.');
  }

  if (/localhost|127\.0\.0\.1/i.test(process.env.MONGODB_URI || '')) {
    throw new Error('Production MONGODB_URI must not point to localhost or 127.0.0.1; use a managed MongoDB Atlas or replica-set deployment.');
  }
}

const cookieSameSite = String(process.env.COOKIE_SAME_SITE || 'lax').toLowerCase();
const validSameSiteValues = ['lax', 'strict', 'none'];
if (!validSameSiteValues.includes(cookieSameSite)) {
  throw new Error('COOKIE_SAME_SITE must be one of: lax, strict, or none.');
}

const cookieSecure = process.env.COOKIE_SECURE === 'true' || process.env.COOKIE_SECURE === 'TRUE';
if (nodeEnv === 'production') {
  if (!cookieSecure) {
    throw new Error('COOKIE_SECURE must be true in production.');
  }

  if (cookieSameSite === 'none' && !cookieSecure) {
    throw new Error('COOKIE_SECURE must be true when COOKIE_SAME_SITE=none in production.');
  }
}

export const env = {
  nodeEnv,
  port,
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  adminBootstrapToken,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientUrl: clientUrls[0],
  clientUrls,
  cookieName: process.env.COOKIE_NAME || 'electrical_platform_token',
  cookieSameSite,
  cookieSecure,
};
