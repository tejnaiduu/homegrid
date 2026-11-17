# Homegrid — Finalized Data Model and Workflow Rules

This document reflects the current implementation and the verified application flows in the repository. It is intended to match the deployed behavior of the platform rather than the earlier starter-only assumptions.

## 1. Product decisions locked

- Product selection supports both the admin-managed standard catalogue and electrician-entered custom items.
- A material request is created once by an electrician and retains its permanent request code.
- The customer can access the request by login after verified account linking, or by scanning a revocable read-only QR link.
- Shop access supports `ANY_REGISTERED_SHOP` and `APPROVED_ONLY` modes.
- Each shop purchase is represented as an independent shop order and invoice.
- The customer receives a consolidated purchase statement that sums the individual shop invoices. Individual seller invoices remain the source documents.

## 2. Collections and key fields

### `users`

- `name`, `phone`, `email`, `passwordHash`
- `roles[]`: `CUSTOMER`, `ELECTRICIAN`, `SHOP_OWNER`, `ADMIN`
- `phoneVerified`, `emailVerified`, `accountStatus`, `lastLoginAt`
- Unique partial indexes on phone and email when the field is present.
- A person may have multiple roles. Public registration can create customer, electrician or shop-owner roles; adding an admin role is a controlled operation.

### `customers`

- `createdByElectricianId`: electrician account that created this contact.
- `linkedUserId`: optional customer login account, populated only after verified phone ownership.
- `name`, `phone`, optional `email`, `notes`.
- Index: `(createdByElectricianId, phone)`.

### `houses`

- `customerId`, `createdByElectricianId`, `houseName`, structured `address`, optional `notes`, `isActive`.
- Index: `(customerId, createdAt)`.
- One customer can have several houses / work locations.

### `products`

- `sku`, `name`, `category`, optional `brand`, `specifications`, `unit`, `isActive`, `createdBy`.
- Search index on name, brand and category; unique sparse SKU.
- Standard catalogue products are administered centrally. An electrician can still add a custom line to a material request without creating a global catalogue product.

### `materialRequests`

- `requestCode`: generated random reference; immutable and unique.
- `electricianId`, `customerId`, `houseId`, `status`, `shopAccess`, `items[]`, `notes`, optional `expiresAt`.
- Every item has a stable `itemId`, `itemType` (`CATALOG` or `CUSTOM`), optional `productId`, a snapshot `name/category/brandPreference/unit/specifications`, and `requestedQty`, `reservedQty`, `fulfilledQty`.
- Product details are copied into the line when the request is created. Later catalogue edits do not rewrite the original requirement.
- `shopAccess.mode`: `ANY_REGISTERED_SHOP` or `APPROVED_ONLY`.
- `shopAccess.approvedShopIds` is a convenience list for approved shops. `RequestAccessGrant` is the authoritative record for the actual grant and its revocation / expiry.

### `requestAccessGrants`

- `requestId`, `grantType`, optional `shopId`, `tokenHash`, `permissions[]`, `expiresAt`, `revokedAt`, `createdBy`.
- Grant types: `CUSTOMER_QR`, `SHOP_APPROVAL`, `SHOP_INVITATION`.
- QR / invitation tokens are random high-entropy values. Only a SHA-256 hash is stored.
- Customer QR permission is `VIEW_REQUEST`; it never grants editing, order creation or customer-detail access.
- Shop grants may include `VIEW_REQUEST` and `CREATE_ORDER`. Customer approval is represented separately from the public QR.
- TTL index removes expired grants eventually; every lookup must still check expiry and revocation because TTL deletion is asynchronous.

### `shops` and `shopBranches`

- `shops`: `ownerUserId`, `businessName`, optional `gstNumber`, `contactPhone`, `verificationStatus`, `isActive`.
- `shopBranches`: `shopId`, `branchName`, `phone`, structured `address`, optional GeoJSON `location`, `isActive`.
- A shop may have multiple branches. Stock belongs to a branch, not merely to the parent shop.
- Branch location uses GeoJSON `[longitude, latitude]` and a `2dsphere` index when available.

### `inventoryItems`

- `branchId`, optional `productId`, `sku`, optional `customName`, `unit`, `specifications`.
- `quantityOnHand`, `quantityReserved`, `purchasePricePaise`, `sellingPricePaise`, `lowStockThreshold`, `isActive`.
- Unique index: `(branchId, sku)`.
- Available quantity is `quantityOnHand - quantityReserved`.
- Prices use integer paise (₹1 = 100 paise), never binary floating-point currency.

### `shopOrders`

- One order is one shop/branch transaction against one material request. The same shop can create more than one order for the same request if separate supply / handover events are needed.
- `orderCode`, `requestId`, `shopId`, `branchId`, `customerId`, `createdByShopUserId`, `status`, `lines[]`, totals and timestamps.
- Every line references the request's stable `requestItemId` and the shop's `inventoryItemId`.
- Lines preserve offered, approved and fulfilled quantities, item-name snapshot, unit and unit price in paise.
- If the shop offers a different brand/specification, mark it as a substitute and require customer approval before acceptance / fulfilment.

### `invoices`

- One immutable seller invoice per shop order in this implementation model.
- Contains invoice number, `requestId`, `orderId`, shop / branch / customer references, seller and buyer snapshots, item snapshots, subtotal, tax, discount, total, issue time and status.
- Invoice details must not be silently edited after issue. Corrections require an appropriate void / credit-note / revised-document workflow.

### `purchaseSummaries`

- One consolidated statement per material request, refreshed when shop invoices are issued.
- Contains `statementNumber`, `requestId`, `invoiceIds`, `shopCount`, summed subtotal/tax/discount/total and `generatedAt`.
- It is a convenience summary for the customer, not a replacement for individual shop invoices or a combined tax invoice.

### `inventoryMovements`

- Append-only ledger for `PURCHASE_IN`, `RESERVE`, `RELEASE`, `SALE_OUT`, `RETURN_IN`, `ADJUSTMENT`.
- Records item, branch, quantity, before/after on-hand and reserved values, reference order/action, actor and timestamp.
- Do not let frontend requests directly overwrite inventory quantity fields. All changes should go through validated backend services and write a movement record.

## 3. State transitions

### Material request

```text
OPEN ── first item fulfilled ──> PARTIALLY_FULFILLED
OPEN ── all requested quantities fulfilled ──> FULFILLED
PARTIALLY_FULFILLED ── all requested quantities fulfilled ──> FULFILLED
OPEN / PARTIALLY_FULFILLED ── electrician cancellation (only if no active reservations) ──> CANCELLED
```

The request status is derived from all item quantities and cancellation state. Do not mark it `FULFILLED` while any item has a positive remaining quantity or active reservation.

### Shop order

```text
SUBMITTED ── no substitute / accepted ──> ACCEPTED
SUBMITTED ── substitute needs consent ──> AWAITING_CUSTOMER_APPROVAL
AWAITING_CUSTOMER_APPROVAL ── customer approves ──> ACCEPTED
ACCEPTED ── partial handover ──> PARTIALLY_FULFILLED
ACCEPTED / PARTIALLY_FULFILLED ── all order lines handed over ──> FULFILLED
SUBMITTED / ACCEPTED ── cancelled under allowed rules ──> CANCELLED
```

A rejected substitute must not reduce the original request quantity or inventory.

## 4. Transaction-safe fulfilment algorithm

All quantities below must be checked again inside a MongoDB session transaction. A browser-side stock preview is not authoritative.

1. Authenticate the shop owner and verify the shop and branch are active / verified and owned by that user.
2. Verify the request's shop access mode. For `APPROVED_ONLY`, require an active shop-specific `SHOP_APPROVAL` grant. For open mode, require a verified shop session and a valid shared request reference; return only the material data needed to prepare an offer.
3. Validate that every supplied `requestItemId` belongs to the same material request and that the requested product/specification or an approved substitute matches.
4. Recompute `remainingQty = requestedQty - fulfilledQty - reservedQty` for each requested line.
5. Recompute `availableStock = quantityOnHand - quantityReserved` for each shop inventory line.
6. Reject quantities above either remaining request quantity or available shop stock.
7. Atomically increment the request line's `reservedQty` and the inventory line's `quantityReserved`; create the shop order and `RESERVE` movement rows in the same transaction.
8. At physical handover, atomically decrement inventory `quantityOnHand` and `quantityReserved`, decrement request `reservedQty`, increment request `fulfilledQty`, mark the order line fulfilled, write `SALE_OUT` movement rows, issue the shop invoice and refresh the consolidated purchase statement.
9. On cancellation / expiry before handover, atomically release both reservations and write `RELEASE` movements. Do not deduct on-hand stock.
10. Use an idempotency key on order creation and fulfilment endpoints so retrying a network request cannot double-reserve or double-deduct stock.

## 5. Access policy

| Actor | Allowed view | Not allowed |
|---|---|---|
| Electrician who created request | Original list, status and purchase summary | Editing historical invoices or shop stock |
| Linked customer | Original list, shop orders, individual invoices and consolidated statement | Editing electrician's original quantities directly |
| Customer QR visitor | Read-only material list and quantity progress | Customer contact details, address, approvals, order creation or edits |
| Verified shop with allowed access | Requested item details needed to prepare a supply offer | Other shops' prices, orders, invoices or stock |
| Shop owner / branch staff | Own branch stock, own orders and own invoices | Another shop's inventory and billing |
| Admin | Platform operations according to audited admin permissions | Unlogged or untraceable changes |

For the `ANY_REGISTERED_SHOP` mode, do not expose personal customer contact/address details by default. The request code is a high-entropy shared reference, but production shop access should still be protected by a verified shop account, rate limits and a clear customer-sharing/consent flow. In `APPROVED_ONLY`, a shop-specific grant must be created after customer approval.

## 6. Planned API modules after the foundation

- Customer account link / OTP verification.
- Shop and branch onboarding, verification and staff permissions.
- Shop request lookup / access approval / invitation.
- Inventory CRUD, purchases, adjustments and low-stock alerts.
- Transactional shop order create / accept / substitute approval / reserve / cancel / fulfil.
- Immutable shop invoice generation and consolidated purchase statement refresh.
- Real-time request updates and notifications.
