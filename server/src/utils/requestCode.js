import { randomBytes } from 'node:crypto';

export function generateRequestCode() {
  // Random, non-sequential reference. It is an identifier, not an access credential.
  return `EL-${randomBytes(8).toString('hex').toUpperCase()}`;
}

export function normalizeRequestCode(value) {
  const cleaned = String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!cleaned) return '';
  return cleaned.startsWith('EL-') ? cleaned : `EL-${cleaned}`;
}
