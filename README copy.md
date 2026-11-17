# WireFlow — Electrical Material Management Platform

WireFlow is a working electrical-material workflow platform for electricians, customers, shop owners, and platform admins. The implemented system covers account registration, customer linking, material request creation, shop access approvals, inventory and order flows, fulfilment, invoice issuance, and admin oversight.

The current codebase is not a starter stub. It includes the end-to-end business flows that were validated in the project test suite:

1. An electrician creates a customer and house record.
2. The electrician adds catalog or custom items and creates a permanent material request code.
3. The customer can view the linked request after login or through a revocable QR link.
4. Verified shops can request access, create orders against request quantities, and reserve stock.
5. A shop fulfils accepted orders, issues its own invoice, and updates the consolidated purchase summary.
6. Admins can verify shops, manage user status, and monitor platform activity.

## 1. Current implementation status

This repository contains a working implementation of the platform workflows, with live regression verification for the key request, customer-link, shop-order, invoice, and admin scenarios.

- `client/`: React + Vite role-aware web app.
- `server/`: Express API using MongoDB/Mongoose.
- One authentication system with roles: `CUSTOMER`, `ELECTRICIAN`, `SHOP_OWNER`, `ADMIN`.
- Modular-monolith backend: modules are separated by domain while keeping one API surface.
- MongoDB stores the original material request separately from shop orders, inventory, invoices, and stock movements.
- The detailed schema, state transitions, and access policy are documented in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## 2. Database collections

| Collection / model | Responsibility |
|---|---|
| `User` | Login identity, password hash, account status and one or more roles |
| `Customer` | Customer profile created by an electrician; can later link to a login user |
| `House` | One or more houses / work locations for a customer |
| `Product` | Admin-managed standard electrical catalogue |
| `MaterialRequest` | Electrician's original list, unique request code and quantities |
| `RequestAccessGrant` | Hashed QR tokens, customer view grants and shop access grants |
| `Shop` | Shop business profile and verification state |
| `ShopBranch` | Physical branch details and optional GeoJSON location |
| `InventoryItem` | Branch-wise stock, reserved stock and price in paise |
| `ShopOrder` | One shop's offer / approved / fulfilled quantities against a request |
| `Invoice` | Immutable shop-issued invoice snapshot |
| `PurchaseSummary` | Consolidated customer statement across shop invoices; not a substitute for a shop's tax invoice |
| `InventoryMovement` | Append-only history of stock in, reservation, release, sale, return and adjustment |

### Core relationship

```text
User (electrician) ──< Customer ──< House ──< MaterialRequest
                                              │
                                              ├──< RequestAccessGrant
                                              ├──< ShopOrder >── Shop ──< ShopBranch
                                              │                    └──< InventoryItem >── Product
                                              │                                      └──< InventoryMovement
                                              └──< Invoice (one invoice per shop order)
                                                     │
                                                     └── PurchaseSummary (combined statement)
```

### Quantity rules

For each original request item:

```text
remainingQty = requestedQty - fulfilledQty - reservedQty
```

For each inventory item:

```text
availableStock = quantityOnHand - quantityReserved
```

- `requestedQty` is the electrician's original requirement. Do not overwrite it when a shop supplies part of the request.
- `reservedQty` protects a quantity while an accepted shop order is awaiting handover.
- `fulfilledQty` increases only when the shop actually hands over the material and finalizes fulfilment.
- Stock reservation, request reservation, fulfilment, inventory deduction, movement record and invoice creation must be committed in a MongoDB transaction.
- Deploy MongoDB as a replica set (MongoDB Atlas provides this) before enabling multi-document fulfilment transactions.
- Quantities are represented as numeric values and should be validated/rounded to the precision supported by the product unit. Money is stored as integer paise, never floating-point rupees.

### Billing rules

- Each shop issues its own immutable `Invoice` containing its seller details, items, tax/discount and total.
- `PurchaseSummary` rolls up the shop invoices against the original request for customer convenience.
- The consolidated statement is informational. It must not be presented as a replacement for the individual shop tax invoices.
- Tax rates and invoice fields need to be reviewed with a qualified accountant / tax professional before production use.

## 3. Prerequisites

Install:

- Node.js 20 LTS or newer
- npm
- MongoDB local replica set or MongoDB Atlas database

## 4. Run locally

From the project root:

```bash
npm install
npm install --prefix server
npm install --prefix client
```

Create the server environment file with the repo-supported setup command:

```bash
npm run setup:env
```

Or, from the server folder directly:

```bash
npm run setup:env --prefix server
```

Set at least:

```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/electrical_material_platform
JWT_SECRET=use-a-random-secret-with-at-least-32-characters
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173
COOKIE_NAME=electrical_platform_token
COOKIE_SAME_SITE=lax
COOKIE_SECURE=false
```

The app defaults to the standard API and frontend ports, but if another process is already using them, the runtime auto-selects the next available port. In a normal local setup, you will see the backend and frontend on a nearby free port such as 5002 and 5174.

Run the API and frontend together:

```bash
npm run dev
```

Open the app at the active local URL shown in the terminal, typically:

- Frontend: http://localhost:5173
- API health: http://localhost:5000/api/v1/health
- API readiness: http://localhost:5000/api/v1/health/ready

If the ports are occupied, the app may start on the next free port, for example http://localhost:5174 and http://localhost:5002.

For separate terminals:

```bash
npm run dev:server
npm run dev:client
```

## 5. Create the first admin account

Public registration intentionally cannot create an `ADMIN` role. Add these values temporarily to `server/.env`:

```env
ADMIN_NAME=Platform Admin
ADMIN_PHONE=9999999999
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=use-a-unique-password-of-at-least-12-characters
```

Then run:

```bash
npm run seed:admin --prefix server
```

Remove the temporary admin password from the environment after the account is created. Store credentials in a password manager. The seed script can also add the admin role to an existing account matching the supplied phone or email.

To insert a small starter electrical catalogue for local testing, run `npm run seed:catalog --prefix server`. These are sample catalogue records; shops still set their own prices and stock.

## 6. API routes implemented in this foundation

Base path: `/api/v1`

| Method | Route | Access | Purpose |
|---|---|---|---|
| `POST` | `/auth/register` | Public | Create customer / electrician / shop-owner account |
| `POST` | `/auth/login` | Public | Login with phone or email and password |
| `POST` | `/auth/logout` | Public | Clear session cookie |
| `POST` | `/auth/refresh` | Authenticated | Renew the session cookie |
| `GET` | `/auth/me` | Authenticated | Current account and roles |
| `PATCH` | `/auth/me` | Authenticated | Update current name, phone, or email |
| `GET` | `/products` | Public | List active standard catalogue products |
| `POST` | `/products` | Admin | Add a standard catalogue product |
| `GET` | `/customers` | Electrician | List own customer records |
| `POST` | `/customers` | Electrician | Add a customer |
| `GET` | `/houses` | Electrician | List own houses; optional `?customerId=` filter |
| `POST` | `/houses` | Electrician | Add a house for an electrician-owned customer |
| `GET` | `/requests` | Electrician / linked customer / admin | List accessible requests |
| `POST` | `/requests` | Electrician | Create catalogue + custom material request |
| `GET` | `/requests/:id` | Electrician / linked customer / admin | Fetch request after ownership checks |
| `GET` | `/requests/by-code/:requestCode` | Electrician / linked customer / admin | Open own / linked request by request code |
| `POST` | `/requests/:id/customer-qr` | Owning electrician | Create a revocable, expiring, read-only customer QR URL |
| `GET` | `/requests/public/access/:token` | Public bearer link | Read-only material list; private customer contact details are excluded |
| `GET` | `/admin/overview` | Admin | Live platform totals and issued invoice value |
| `GET` | `/admin/users` | Admin | Paginated user management list with search and filters |
| `PATCH` | `/admin/users/:id/status` | Admin | Activate, suspend or mark a user pending |
| `GET` | `/admin/shops` | Admin | List shops with optional verification-status filter |
| `PATCH` | `/admin/shops/:id/verification` | Admin | Verify, reject, suspend or reset shop verification |
| `GET` | `/admin/orders` | Admin | Monitor shop orders with optional status filter |
| `GET` | `/admin/invoices` | Admin | Monitor issued and void shop invoices |
| `GET` | `/admin/audit-logs` | Admin | Paginated append-only administrator audit records |
| `GET` | `/shop/profile` | Shop owner | Fetch the authenticated owner's shop profile |
| `PUT` | `/shop/profile` | Shop owner | Create or update the owner's shop profile |
| `GET` | `/shop/branches` | Shop owner | List active branches owned by the shop |
| `POST` | `/shop/branches` | Shop owner | Add a branch to the owner's shop |
| `GET` | `/shop/inventory` | Shop owner | List branch inventory owned by the shop |
| `GET` | `/shop/inventory/low-stock` | Shop owner | List inventory at or below its available-stock threshold |
| `GET` | `/shop/inventory/movements` | Shop owner | List the shop's immutable stock movement history |
| `POST` | `/shop/inventory` | Shop owner | Add catalogue-linked or custom inventory |
| `POST` | `/shop/inventory/:id/stock` | Shop owner | Record guarded stock-in or stock-out movement |
| `GET` | `/shop/requests/:requestCode` | Verified shop owner | View permitted request items, remaining quantities and branch stock |
| `POST` | `/shop/requests/:requestCode/orders` | Verified shop owner | Reserve branch stock and request quantities in a MongoDB transaction; requires a unique `Idempotency-Key` header |
| `POST` | `/shop/orders/:id/fulfil` | Verified shop owner | Convert reserved stock into fulfilled sale quantities and issue the shop invoice |
| `POST` | `/shop/orders/:id/cancel` | Shop owner | Cancel an active order and release request/inventory reservations |
| `GET` | `/shop/orders` | Shop owner | List the owner's orders with an optional status filter |
| `GET` | `/requests/:id/invoices` | Linked customer / electrician / admin | Read issued shop invoices for a request |
| `GET` | `/requests/:id/purchase-summary` | Linked customer / electrician / admin | Read the consolidated purchase statement |
| `GET` | `/requests/:id/purchases` | Linked customer / electrician / admin | Read shop order history for a material request |
| `GET` | `/invoices/:id/pdf` | Invoice owner / admin | Download an issued shop invoice as PDF |
| `POST` | `/invoices/:id/void` | Issuing shop owner / admin | Void an issued invoice without editing its immutable contents |
| `GET` | `/requests/:id/purchase-summary/pdf` | Linked customer / electrician / admin | Download the consolidated purchase statement as a non-tax PDF summary |
| `GET` | `/electrician/dashboard` | Electrician | Protected customer, house, catalogue/custom material, and QR-link workspace |
| `POST` | `/shop/requests/:requestCode/access-request` | Verified shop owner | Ask the linked customer to approve shop access |
| `GET` | `/requests/:id/shop-access-requests` | Linked customer | List pending shop access requests |
| `POST` | `/requests/:id/shop-access/:shopId/decision` | Linked customer | Approve or reject a shop request |
| `DELETE` | `/requests/:id/shop-access/:shopId` | Linked customer | Revoke approved shop access |
| `GET` | `/notifications` | Authenticated | List persisted user notifications |
| `PATCH` | `/notifications/:id/read` | Notification owner | Mark a notification as read |

Authenticated clients receive `NOTIFICATION_CREATED` Socket.IO events in user-scoped rooms. Important notification records remain persisted in MongoDB and are reloaded by the client after each event.

Shop order reservation requires MongoDB transactions. Use MongoDB Atlas or a local replica set for this workflow; a standalone local MongoDB process cannot execute the multi-document transaction.

The QR link is a bearer credential: anyone who obtains it can see the permitted read-only list until it expires or is revoked. Share it carefully. The request code itself is only an identifier and does not grant access.

## 7. Example create-material-request payload

`POST /api/v1/requests` with an authenticated `ELECTRICIAN` account:

```json
{
  "customerId": "CUSTOMER_OBJECT_ID",
  "houseId": "HOUSE_OBJECT_ID",
  "shopAccessMode": "APPROVED_ONLY",
  "notes": "First-floor electrical work",
  "items": [
    {
      "itemType": "CATALOG",
      "productId": "PRODUCT_OBJECT_ID",
      "requestedQty": 100,
      "brandPreference": "Finolex",
      "specifications": { "colour": "Red" }
    },
    {
      "itemType": "CUSTOM",
      "name": "Modular switch plate - 8 module",
      "category": "SWITCHES",
      "unit": "PCS",
      "requestedQty": 2,
      "specifications": { "finish": "White" }
    }
  ]
}
```

Supported units: `PCS`, `METRE`, `ROLL`, `BOX`, `SET`, `KG`, `LITRE`, `OTHER`.

## 8. Environment for frontend deployment

Set `VITE_API_URL` in the frontend build environment to the deployed API URL plus `/api/v1`, for example:

```env
VITE_API_URL=https://your-api.example.com/api/v1
```

For cross-site frontend/API hosting, configure the server with the exact frontend origin in `CLIENT_URL`, `COOKIE_SAME_SITE=none`, and `COOKIE_SECURE=true`, and serve both over HTTPS. Verify cookie behavior in the deployed browser before launch.

## 9. Important implementation status

### Implemented now

- React/Vite application shell, registration, login and role-aware dashboards.
- Express app, MongoDB connection, secure HttpOnly session cookie, password hashing and role middleware.
- Full foundational Mongoose model set for users, customer/house, catalogue, requests, access grants, shops/branches, inventory, orders, invoices, consolidated statements and stock movements.
- Electrician customer and house creation APIs.
- Standard catalogue list and admin product creation APIs.
- Electrician material request creation with both catalogue products and custom items.
- Unique request code and customer read-only QR token API.
- Public QR request page that shows requested, fulfilled and pending quantities without exposing customer phone/address.
- Role-specific electrician, customer, shop-owner and Super Admin dashboards with live API data.
- Shop profile, branches, inventory movements, verified request access, reservations, fulfilment, cancellation, invoices and consolidated summaries.
- Customer request lookup, shop approval actions, notifications, invoice PDF downloads and print summaries.
- Super Admin shop verification, order/request monitoring, catalogue management and append-only audit logs.

### Remaining implementation layer

1. Customer account linking using verified phone OTP.
2. Socket.IO real-time delivery and broader notification event coverage.
3. Invoice void/credit-note workflow, payment tracking and dispute management.
4. Alternative-product proposals, low-stock alerts and richer shop reports.
5. Admin settings, category/brand management and exportable analytics.
6. Camera QR scanning, downloadable consolidated-summary PDF and richer dashboard history views.
7. Authenticated end-to-end workflow tests, backups, observability and production hardening.

The shop / inventory / order / invoice schemas and core transactional APIs are implemented now. MongoDB Atlas or a replica-set deployment is still required to execute multi-document reservation and fulfilment transactions.

## 10. Security and production checklist

- Add SMS OTP verification before treating a phone number as verified or linking a customer login.
- Never expose raw QR tokens in logs. Only store their SHA-256 hash; revoke previous links when creating a replacement.
- Use customer approval or an explicitly shared invitation for shop access. The request ID alone must never unlock private details.
- Enforce ownership / branch checks on every shop and inventory API.
- Run stock reservation and fulfilment in replica-set transactions with idempotency keys to prevent duplicate submissions.
- Record every stock change in `InventoryMovement`; do not let the browser directly edit stock totals.
- Add request payload validation, automated permission tests, backups, monitoring and abuse controls before public launch.
- Do not use the sample user names, phone numbers or addresses in real customer data.
