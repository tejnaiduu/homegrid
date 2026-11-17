# Homegrid API Inventory

## Base API

Base path: `/api/v1`

## Authentication and user account routes

- `POST /auth/register` — public account registration
- `POST /auth/login` — login using phone or email
- `POST /auth/logout` — clear the httpOnly session cookie
- `POST /auth/refresh` — refresh a valid session
- `GET /auth/me` — authenticated current user data
- `PATCH /auth/me` — authenticated profile update

Source: `server/src/routes/authRoutes.js`

## Product routes

- `GET /products` — public read-only product list
- `POST /products` — admin-managed product creation

Source: `server/src/routes/productRoutes.js`

## Customer and house routes

- `GET /customers` — electrician-owned customers
- `POST /customers` — create customer
- `GET /houses` — electrician-owned houses
- `POST /houses` — create house

Source: `server/src/routes/customerRoutes.js`, `server/src/routes/houseRoutes.js`

## Request routes

- `GET /requests` — accessible requests by role
- `POST /requests` — create material request
- `GET /requests/:id` — fetch a request after access checks
- `GET /requests/by-code/:requestCode` — fetch by request code
- `GET /requests/:id/invoices` — request-specific invoices
- `GET /requests/:id/purchase-summary` — consolidated summary
- `GET /requests/:id/purchases` — order history
- `POST /requests/:id/customer-qr` — create QR read-only grant
- `GET /requests/public/access/:token` — public QR token access
- `GET /requests/:id/shop-access-requests` — customer pending shop approval requests
- `POST /requests/:id/shop-access/:shopId/decision` — approve or reject shop access
- `DELETE /requests/:id/shop-access/:shopId` — revoke shop approval

Source: `server/src/routes/requestRoutes.js`, `server/src/controllers/requestController.js`

## Admin routes

- `GET /admin/overview`
- `GET /admin/users`
- `PATCH /admin/users/:id/status`
- `GET /admin/shops`
- `PATCH /admin/shops/:id/verification`
- `GET /admin/orders`
- `GET /admin/invoices`
- `GET /admin/audit-logs`

Source: `server/src/routes/adminRoutes.js`, `server/src/controllers/adminController.js`

## Shop routes

- `GET /shop/profile` — view owned shop
- `PUT /shop/profile` — create or update shop profile
- `GET /shop/branches` — list branches
- `POST /shop/branches` — create branch
- `GET /shop/inventory` — list inventory
- `POST /shop/inventory` — add inventory item
- `POST /shop/inventory/:id/stock` — adjust stock
- `GET /shop/inventory/low-stock` — low-stock alerts
- `GET /shop/inventory/movements` — stock movement history
- `GET /shop/requests/:requestCode` — view accessible request for stock checking
- `POST /shop/requests/:requestCode/access-request` — ask for customer approval
- `POST /shop/requests/:requestCode/orders` — reserve stock and create an order
- `POST /shop/orders/:id/fulfil` — fulfil order and issue invoice
- `POST /shop/orders/:id/cancel` — release reservation and cancel order
- `GET /shop/orders` — list shop orders

Source: `server/src/routes/shopRoutes.js`, `server/src/controllers/shopController.js`

## Invoice and PDF routes

- `GET /invoices/:id/pdf` — download shop invoice PDF
- `POST /invoices/:id/void` — void an issued invoice
- `GET /requests/:id/purchase-summary/pdf` — download consolidated statement PDF

Source: `server/src/routes/invoiceRoutes.js`, `server/src/controllers/invoiceController.js`

## Notification routes

- `GET /notifications`
- `PATCH /notifications/:id/read`

Source: `server/src/routes/notificationRoutes.js`

## Observations

The API surface is broad and mostly consistent with the Homegrid business domain. The remaining gaps are not in route availability but in validation depth, business workflow regression tests and the final production-hardening layer.
