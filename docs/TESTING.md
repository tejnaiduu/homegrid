# Homegrid Testing Status

## Current automated coverage

The repository includes a lightweight Node test suite under `server/test`.

### Verified tests

Executed with:

```bash
npm test --prefix server
```

Result:

- 5 tests passed
- 0 tests failed

These cover:

- health endpoint availability
- readiness endpoint behavior
- unauthenticated protection for role-based API paths
- request-code generator uniqueness
- QR token hashing behavior

Evidence:

- `server/test/app.test.js`
- `server/test/security.test.js`

## Frontend verification

Executed with:

```bash
npm run build --prefix client
```

Result:

- Vite production build succeeded
- 1624 modules transformed
- build completed in ~4.75s

## Missing high-value tests

The important untested business workflows remain:

- authenticated end-to-end customer/electrician/shop/admin flows
- multi-shop partial fulfilment
- inventory reservation and release concurrency
- request remaining-quantity integrity checks
- invoice correctness and PDF integrity
- corrected-invoice and credit-note flows
- browser-level Socket.IO notification flows
- access-control edge cases such as IDOR and cross-user request access

## Test philosophy

The repository is currently validating architecture and security fundamentals, but it is not yet validating the actual business lifecycle end-to-end. The system still needs a real integration test harness using authenticated flows and MongoDB-backed assertions.
