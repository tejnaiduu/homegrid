# Homegrid Deployment Readiness

## Current deployment status

The platform is not production verified. It is build- and test-clean in the local development environment, but there is no real deployment verification against production infrastructure.

## Required production platform setup

The repository's Docker Compose stack is for local development, not production: it uses localhost origins and HTTP cookies, so the API runs with `NODE_ENV=development`. Production hosting must use its own HTTPS origins, secure cookies, managed MongoDB, and production environment settings.

### Frontend

- Vercel is the intended target.
- Set environment variables for the public API URL.
- Ensure the app is configured to talk only to the correct backend origin.

### Backend

- Render or a comparable Node.js hosting provider is appropriate.
- Set production `NODE_ENV` and secure environment secrets.
- Ensure the application runs with a managed MongoDB Atlas cluster and no local file-based secret storage.

### Database

- MongoDB Atlas replica set or equivalent transaction-supporting deployment is required.
- Standalone local MongoDB is not sufficient for the multi-document stock and order transaction logic.

## Required production configuration

At minimum:

- `MONGODB_URI`
- `JWT_SECRET` (32+ characters)
- `CLIENT_URL`
- `COOKIE_NAME`
- `COOKIE_SAME_SITE`
- `COOKIE_SECURE`
- `PORT`

## Security checklist

- use secure httpOnly cookie settings in production
- enforce HTTPS only
- use strict CORS configuration
- ensure CSRF mitigation where required for cookie-based sessions
- rotate secrets in a password manager and not in the repository
- keep QR/token expiry and revocation logic enforced
- verify admin safeguards remain active in production

## Operational checklist

- health and readiness monitoring
- log aggregation and alerts
- database backups and restore procedure
- admin access review
- notification delivery verification
- production smoke tests for request creation, fulfilment and invoice generation

## Deployment gate

Public deployment must be treated as an explicit, user-approved operation. The repository has not been verified in a live production environment, so no production claim should be made yet.

## Automated production checks

The server startup configuration now enforces a production hardening gate before the app accepts a production configuration:

- `MONGODB_URI` cannot point to `localhost`/`127.0.0.1` in `NODE_ENV=production`
- `CLIENT_URL` / `CLIENT_URLS` must be HTTPS-only and must not reference localhost in production
- `COOKIE_SECURE=true` is required in production
- `COOKIE_SAME_SITE` must be a valid value and `none` requires secure cookies
- `PORT` must be a valid TCP port
- `JWT_SECRET` must remain at least 32 characters

Run:

```bash
npm run check:env --prefix server
```

before shipping to production. This is the repository-level safeguard for deployment readiness.
