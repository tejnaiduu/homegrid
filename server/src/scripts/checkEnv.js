import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });

const nodeEnv = String(process.env.NODE_ENV || 'development').toLowerCase();
const required = ['MONGODB_URI', 'JWT_SECRET'];
const missing = required.filter((key) => !process.env[key] || !String(process.env[key]).trim());

if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}.`);
  console.error('Create server/.env from the example or run "npm run setup:env" from the project root, then update the values before starting the API.');
  process.exit(1);
}

if (String(process.env.JWT_SECRET).length < 32) {
  console.error('JWT_SECRET must contain at least 32 characters.');
  process.exit(1);
}

const port = Number(process.env.PORT || 5000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT must be a valid integer between 1 and 65535.');
  process.exit(1);
}

const rawClientUrls = [process.env.CLIENT_URL, process.env.CLIENT_URLS]
  .flatMap((value) => typeof value === 'string' ? value.split(',') : [])
  .map((value) => value.trim())
  .filter(Boolean);
const clientUrls = [...new Set(rawClientUrls.length ? rawClientUrls : ['http://localhost:5173'])];

if (nodeEnv === 'production') {
  if (!clientUrls.length || clientUrls.some((url) => /localhost|127\.0\.0\.1/i.test(url) || !/^https:\/\//i.test(url))) {
    console.error('Production CLIENT_URL / CLIENT_URLS must include HTTPS origins only and must not point to localhost or 127.0.0.1.');
    process.exit(1);
  }

  if (/localhost|127\.0\.0\.1/i.test(process.env.MONGODB_URI || '')) {
    console.error('Production MONGODB_URI must not point to localhost or 127.0.0.1; use a managed MongoDB Atlas or replica-set deployment.');
    process.exit(1);
  }
}

const cookieSameSite = String(process.env.COOKIE_SAME_SITE || 'lax').toLowerCase();
const validSameSiteValues = ['lax', 'strict', 'none'];
if (!validSameSiteValues.includes(cookieSameSite)) {
  console.error('COOKIE_SAME_SITE must be one of: lax, strict, or none.');
  process.exit(1);
}

const cookieSecure = process.env.COOKIE_SECURE === 'true' || process.env.COOKIE_SECURE === 'TRUE';
if (nodeEnv === 'production') {
  if (!cookieSecure) {
    console.error('COOKIE_SECURE must be true in production.');
    process.exit(1);
  }

  if (cookieSameSite === 'none' && !cookieSecure) {
    console.error('COOKIE_SECURE must be true when COOKIE_SAME_SITE=none in production.');
    process.exit(1);
  }
}

console.log('Environment validation passed. Required values are present, production hardening checks passed, and JWT_SECRET length is valid.');
