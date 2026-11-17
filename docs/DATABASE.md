# Homegrid Database Design

## Overview

The application uses MongoDB via Mongoose. The current model layer is intentionally domain-oriented and largely matches the Homegrid business flow: customer records, electrician-owned request data, shop inventory and orders, invoice generation, purchase summaries and notification records.

## Core collections

### User

Source: `server/src/models/User.js`

- login identity and role membership
- active/suspended status
- hashed password field
- role-based access control

### Customer

Source: `server/src/models/Customer.js`

- customer profile created by an electrician
- optional linked login account
- phone and contact linking

### House

Source: `server/src/models/House.js`

- address and house metadata
- one or many houses per customer

### Product

Source: `server/src/models/Product.js`

- standard catalogue items
- category, brand, unit and metadata
- active/inactive state

### MaterialRequest

Source: `server/src/models/MaterialRequest.js`

- immutable request code
- per-item quantities and item snapshots
- `reservedQty` and `fulfilledQty` tracking
- `shopAccess` flags and approved-shop list

### RequestAccessGrant

Source: `server/src/models/RequestAccessGrant.js`

- hashed QR / access tokens
- request, shop and permissions linkage
- revocation and expiry

### Shop and ShopBranch

Sources: `server/src/models/Shop.js`, `server/src/models/ShopBranch.js`

- business profile, verification state and owner linkage
- branch metadata and stock ownership

### InventoryItem and InventoryMovement

Sources: `server/src/models/InventoryItem.js`, `server/src/models/InventoryMovement.js`

- branch-level stock, reservation and on-hand counts
- movement ledger for stock-in, reserve, release and sale-out operations

### ShopOrder

Source: `server/src/models/ShopOrder.js`

- one shop response against one material request
- idempotency key for retry-safe order creation
- totals in paise

### Invoice

Source: `server/src/models/Invoice.js`

- immutable seller invoice snapshot
- totals and item snapshots
- issued/voided lifecycle state

### PurchaseSummary

Source: `server/src/models/PurchaseSummary.js`

- consolidated statement across invoices
- summary of totals and invoice IDs

## Important design rules

- `MaterialRequest.requestCode` is immutable and unique.
- Request line quantities are not overwritten by shop fulfilment; the original electrician-created values remain the source of truth.
- `availableStock = quantityOnHand - quantityReserved`.
- `remainingQty = requestedQty - reservedQty - fulfilledQty`.
- Currency values must remain integer paise.
- Transactional reserve/fulfilment operations require a replica set or MongoDB Atlas transaction-capable deployment.

## Indexation and consistency notes

The schema layer includes indexes for common lookup paths, including:

- request codes
- electrician and customer ownership
- shop and branch ownership
- inventory branch-scoping
- idempotency for shop orders

However, broader database validation and concurrency testing remain a gap. The system should continue to be validated under realistically concurrent stock reservation and multi-shop order scenarios.
