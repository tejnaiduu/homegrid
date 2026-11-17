import test from 'node:test';
import assert from 'node:assert/strict';
import { generateRequestCode } from '../src/utils/requestCode.js';
import { createOpaqueToken, hashToken } from '../src/utils/security.js';

test('request codes are prefixed and unique across generated values', () => {
  const codes = new Set(Array.from({ length: 100 }, () => generateRequestCode()));
  assert.equal(codes.size, 100);
  for (const code of codes) assert.match(code, /^EL-[A-F0-9]{16}$/);
});

test('opaque QR tokens are not stored in their hashed representation', () => {
  const token = createOpaqueToken();
  const hash = hashToken(token);
  assert.ok(token.length >= 40);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, token);
  assert.equal(hashToken(token), hash);
});
