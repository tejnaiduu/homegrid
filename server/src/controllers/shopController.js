import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import Shop from '../models/Shop.js';
import ShopBranch from '../models/ShopBranch.js';
import InventoryItem from '../models/InventoryItem.js';
import InventoryMovement from '../models/InventoryMovement.js';
import Product from '../models/Product.js';
import MaterialRequest from '../models/MaterialRequest.js';
import RequestAccessGrant from '../models/RequestAccessGrant.js';
import ReturnRequest from '../models/ReturnRequest.js';
import ShopOrder from '../models/ShopOrder.js';
import Invoice from '../models/Invoice.js';
import PurchaseSummary from '../models/PurchaseSummary.js';
import Customer from '../models/Customer.js';
import Notification from '../models/Notification.js';
import { emitUserNotification } from '../sockets/realtime.js';
import { ApiError } from '../utils/ApiError.js';
import { normalizeRequestCode } from '../utils/requestCode.js';
import { runWithOptionalTransaction } from '../utils/transactions.js';

const UNITS = ['PCS', 'METRE', 'ROLL', 'BOX', 'SET', 'KG', 'LITRE', 'OTHER'];
const STOCK_MOVEMENTS = ['PURCHASE_IN', 'SALE_OUT', 'RETURN_IN'];

function netFulfilledQty(item) {
  return Math.max(0, Number(item.fulfilledQty || 0) - Number(item.returnedQty || 0));
}

function remainingRequestQty(item) {
  return Math.max(0, Number(item.requestedQty) - Number(item.reservedQty || 0) - netFulfilledQty(item));
}

function materialRequestStatus(items) {
  if (items.every((item) => netFulfilledQty(item) >= item.requestedQty)) return 'FULFILLED';
  return items.some((item) => netFulfilledQty(item) > 0 || Number(item.reservedQty || 0) > 0)
    ? 'PARTIALLY_FULFILLED'
    : 'OPEN';
}

async function getOwnedShop(userId) {
  return Shop.findOne({ ownerUserId: userId, isActive: true });
}

async function getOwnedBranch(branchId, userId) {
  if (!mongoose.isValidObjectId(branchId)) throw new ApiError(400, 'Invalid branch identifier.');
  const shop = await getOwnedShop(userId);
  const branch = shop ? await ShopBranch.findOne({ _id: branchId, shopId: shop._id, isActive: true }) : null;
  if (!shop || !branch) throw new ApiError(404, 'Shop branch not found.');
  return { shop, branch };
}

export async function getMyShop(req, res) {
  const shop = await getOwnedShop(req.user._id);
  res.json({ success: true, data: { shop } });
}

export async function upsertMyShop(req, res) {
  const { businessName, gstNumber, contactPhone } = req.body;
  if (!businessName || String(businessName).trim().length < 2) throw new ApiError(400, 'Business name is required.');
  const shop = await Shop.findOneAndUpdate(
    { ownerUserId: req.user._id },
    { $set: { businessName: String(businessName).trim(), gstNumber, contactPhone } },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true },
  );
  res.status(201).json({ success: true, data: { shop } });
}

export async function listBranches(req, res) {
  const shop = await getOwnedShop(req.user._id);
  const branches = shop ? await ShopBranch.find({ shopId: shop._id, isActive: true }).sort({ createdAt: -1 }) : [];
  res.json({ success: true, data: { branches } });
}

export async function createBranch(req, res) {
  const shop = await getOwnedShop(req.user._id);
  if (!shop) throw new ApiError(400, 'Create your shop profile before adding a branch.');
  const { branchName, phone, address, location } = req.body;
  if (!branchName || !address?.line1 || !address?.city) {
    throw new ApiError(400, 'Branch name, address line and city are required.');
  }
  const branch = await ShopBranch.create({ shopId: shop._id, branchName, phone, address, location });
  res.status(201).json({ success: true, data: { branch } });
}

export async function listInventory(req, res) {
  const shop = await getOwnedShop(req.user._id);
  const branches = shop ? await ShopBranch.find({ shopId: shop._id, isActive: true }).select('_id') : [];
  const branchIds = branches.map((branch) => branch._id);
  const filter = { branchId: { $in: branchIds }, isActive: true };
  if (req.query.branchId) {
    if (!branchIds.some((branchId) => branchId.equals(req.query.branchId))) throw new ApiError(403, 'That branch is not part of your shop.');
    filter.branchId = req.query.branchId;
  }
  const items = await InventoryItem.find(filter).populate('productId', 'name category brand unit').sort({ createdAt: -1 }).limit(200);
  res.json({ success: true, data: { items } });
}

export async function createInventoryItem(req, res) {
  const { branchId, productId, sku, customName, unit, specifications, quantityOnHand, purchasePricePaise, sellingPricePaise, lowStockThreshold } = req.body;
  await getOwnedBranch(branchId, req.user._id);
  if (!mongoose.isValidObjectId(productId) && !customName) throw new ApiError(400, 'Choose a catalogue product or provide a custom product name.');
  let product = null;
  if (productId) {
    product = await Product.findOne({ _id: productId, isActive: true });
    if (!product) throw new ApiError(404, 'Active catalogue product not found.');
  }
  const resolvedUnit = String(unit || product?.unit || '').toUpperCase();
  if (!UNITS.includes(resolvedUnit)) throw new ApiError(400, 'A valid inventory unit is required.');
  if (!sku || Number(sellingPricePaise) < 0 || Number(quantityOnHand || 0) < 0) throw new ApiError(400, 'SKU, non-negative quantity and selling price are required.');
  const item = await InventoryItem.create({
    branchId, productId: product?._id || null, sku, customName, unit: resolvedUnit, specifications: specifications || product?.specifications || {},
    quantityOnHand: Number(quantityOnHand || 0), purchasePricePaise: Number(purchasePricePaise || 0), sellingPricePaise: Number(sellingPricePaise), lowStockThreshold: Number(lowStockThreshold || 0),
  });
  res.status(201).json({ success: true, data: { item } });
}

export async function changeInventoryStock(req, res) {
  const quantity = Number(req.body.quantity);
  const movementType = String(req.body.movementType || '').toUpperCase();
  if (!Number.isFinite(quantity) || quantity <= 0 || !STOCK_MOVEMENTS.includes(movementType)) throw new ApiError(400, 'Provide a positive quantity and a valid stock movement.');
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid inventory identifier.');
  const item = await InventoryItem.findById(req.params.id);
  if (!item || !(await getOwnedBranch(item.branchId, req.user._id))) throw new ApiError(404, 'Inventory item not found.');
  const beforeOnHand = item.quantityOnHand;
  const update = movementType === 'SALE_OUT'
    ? { $inc: { quantityOnHand: -quantity } }
    : { $inc: { quantityOnHand: quantity } };
  const query = movementType === 'SALE_OUT'
    ? { _id: item._id, $expr: { $gte: [{ $subtract: ['$quantityOnHand', '$quantityReserved'] }, quantity] } }
    : { _id: item._id };
  const updated = await InventoryItem.findOneAndUpdate(query, update, { new: true, runValidators: true });
  if (!updated) throw new ApiError(409, 'Stock movement would exceed available inventory.');
  await InventoryMovement.create({
    inventoryItemId: updated._id, branchId: updated.branchId, movementType, quantity,
    quantityOnHandBefore: beforeOnHand, quantityOnHandAfter: updated.quantityOnHand,
    quantityReservedBefore: item.quantityReserved, quantityReservedAfter: updated.quantityReserved,
    referenceType: 'MANUAL', performedBy: req.user._id, note: req.body.note,
  });
  if (updated.quantityOnHand - updated.quantityReserved <= updated.lowStockThreshold) {
    const notification = await Notification.create({ userId: req.user._id, type: 'LOW_STOCK_ALERT', title: 'Low stock alert', message: `${updated.customName || updated.sku} is at or below its stock threshold.`, relatedOrderId: null });
    emitUserNotification(null, req.user._id, notification);
  }
  res.json({ success: true, data: { item: updated } });
}

async function getAccessibleRequest(requestCode, userId) {
  const shop = await Shop.findOne({ ownerUserId: userId, isActive: true, verificationStatus: 'VERIFIED' });
  if (!shop) throw new ApiError(403, 'Your shop must be verified before accessing material requests.');
  const normalizedCode = normalizeRequestCode(requestCode);
  const request = await MaterialRequest.findOne({ requestCode: normalizedCode });
  if (!request || request.status === 'CANCELLED') throw new ApiError(404, 'Material request not found.');
  let allowed = request.shopAccess.mode === 'ANY_REGISTERED_SHOP';
  if (!allowed) {
    allowed = request.shopAccess.approvedShopIds.some((shopId) => shopId.equals(shop._id));
    if (!allowed) {
      allowed = Boolean(await RequestAccessGrant.exists({
        requestId: request._id, shopId: shop._id, grantType: 'SHOP_APPROVAL', revokedAt: null, expiresAt: { $gt: new Date() }, permissions: 'VIEW_REQUEST',
      }));
    }
  }
  if (!allowed) throw new ApiError(403, 'This material request has not been shared with your shop.');
  return { shop, request };
}

export async function lookupMaterialRequest(req, res) {
  const { shop, request } = await getAccessibleRequest(req.params.requestCode, req.user._id);
  const branches = await ShopBranch.find({ shopId: shop._id, isActive: true }).select('_id branchName');
  const inventory = await InventoryItem.find({ branchId: { $in: branches.map((branch) => branch._id) }, isActive: true }).populate('productId', 'name category brand unit');
  const items = request.items.map((item) => ({
    itemId: item.itemId,
    name: item.name,
    unit: item.unit,
    requestedQty: item.requestedQty,
    reservedQty: item.reservedQty,
    fulfilledQty: item.fulfilledQty,
    returnedQty: Number(item.returnedQty || 0),
    remainingQty: remainingRequestQty(item),
    brandPreference: item.brandPreference,
    specifications: item.specifications,
    inventory: inventory.filter((stock) => (item.productId && stock.productId?._id.equals(item.productId)) || (!item.productId && stock.customName === item.name)).map((stock) => ({
      id: stock._id, branchId: stock.branchId, sku: stock.sku, availableQty: stock.quantityOnHand - stock.quantityReserved, sellingPricePaise: stock.sellingPricePaise,
    })),
  }));
  res.json({ success: true, data: { request: { id: request._id, requestCode: request.requestCode, status: request.status }, items } });
}

export async function createShopOrder(req, res) {
  const { shop, request } = await getAccessibleRequest(req.params.requestCode, req.user._id);
  const idempotencyKey = String(req.get('Idempotency-Key') || '').trim();
  if (!idempotencyKey || idempotencyKey.length > 120) throw new ApiError(400, 'A valid Idempotency-Key header is required.');
  const existingOrder = await ShopOrder.findOne({ shopId: shop._id, idempotencyKey });
  if (existingOrder) return res.status(200).json({ success: true, message: 'Existing order returned for this idempotency key.', data: { order: existingOrder } });
  const { branchId, lines } = req.body;
  if (!Array.isArray(lines) || !lines.length) throw new ApiError(400, 'At least one order line is required.');
  const { branch } = await getOwnedBranch(branchId, req.user._id);
  let createdOrder;
  await runWithOptionalTransaction(async (session) => {
    const requestInTransaction = await MaterialRequest.findOne({ _id: request._id, status: { $in: ['OPEN', 'PARTIALLY_FULFILLED'] } }).session(session);
    if (!requestInTransaction) throw new ApiError(409, 'This material request is no longer available.');
    const orderLines = [];
    let subtotalPaise = 0;
    for (const line of lines) {
      const quantity = Number(line.offeredQty);
      const requestItem = requestInTransaction.items.find((item) => item.itemId === line.requestItemId);
      if (!requestItem || !Number.isFinite(quantity) || quantity <= 0) throw new ApiError(400, 'Each order line must reference a valid positive quantity.');
      const remainingQty = remainingRequestQty(requestItem);
      if (quantity > remainingQty) throw new ApiError(409, `Quantity exceeds remaining requirement for ${requestItem.name}.`);
      const inventory = await InventoryItem.findOneAndUpdate(
        { _id: line.inventoryItemId, branchId: branch._id, isActive: true, $expr: { $gte: [{ $subtract: ['$quantityOnHand', '$quantityReserved'] }, quantity] } },
        { $inc: { quantityReserved: quantity } }, { new: true, session, runValidators: true },
      );
      if (!inventory) throw new ApiError(409, `Insufficient available stock for ${requestItem.name}.`);
      const beforeReserved = inventory.quantityReserved - quantity;
      requestItem.reservedQty += quantity;
      const lineTotalPaise = Math.round(quantity * inventory.sellingPricePaise);
      subtotalPaise += lineTotalPaise;
      orderLines.push({ requestItemId: requestItem.itemId, inventoryItemId: inventory._id, productId: requestItem.productId, itemNameSnapshot: requestItem.name, unit: requestItem.unit, offeredQty: quantity, approvedQty: quantity, unitPricePaise: inventory.sellingPricePaise });
      await InventoryMovement.create([{ inventoryItemId: inventory._id, branchId: branch._id, movementType: 'RESERVE', quantity, quantityOnHandBefore: inventory.quantityOnHand, quantityOnHandAfter: inventory.quantityOnHand, quantityReservedBefore: beforeReserved, quantityReservedAfter: inventory.quantityReserved, referenceType: 'SHOP_ORDER', performedBy: req.user._id }], { session });
    }
    await requestInTransaction.save({ session });
    [createdOrder] = await ShopOrder.create([{ orderCode: `OR-${randomBytes(8).toString('hex').toUpperCase()}`, idempotencyKey, requestId: requestInTransaction._id, shopId: shop._id, branchId: branch._id, customerId: requestInTransaction.customerId, createdByShopUserId: req.user._id, status: 'ACCEPTED', lines: orderLines, subtotalPaise, totalPaise: subtotalPaise, acceptedAt: new Date() }], { session });
  });
  res.status(201).json({ success: true, data: { order: createdOrder } });
}

export async function fulfilShopOrder(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid order identifier.');
  const shop = await Shop.findOne({ ownerUserId: req.user._id, isActive: true, verificationStatus: 'VERIFIED' });
  if (!shop) throw new ApiError(403, 'Your shop must be verified to fulfil orders.');
  let invoice;
  let order;
  await runWithOptionalTransaction(async (session) => {
    order = await ShopOrder.findOne({ _id: req.params.id, shopId: shop._id, status: { $in: ['ACCEPTED', 'PARTIALLY_FULFILLED'] } }).session(session);
    if (!order) throw new ApiError(404, 'Order not found or already finalized.');
    const request = await MaterialRequest.findById(order.requestId).session(session);
    if (!request) throw new ApiError(409, 'The material request for this order no longer exists.');
    const requestedLines = Array.isArray(req.body.lines) ? req.body.lines : null;
    const fulfilments = order.lines.map((line) => {
      const requested = requestedLines?.find((entry) => entry.requestItemId === line.requestItemId)?.quantity;
      return { line, quantity: requested === undefined ? line.approvedQty - line.fulfilledQty : Number(requested) };
    });
    const invoiceLines = [];
    for (const { line, quantity } of fulfilments) {
      if (!Number.isFinite(quantity) || quantity < 0 || quantity > line.approvedQty - line.fulfilledQty) throw new ApiError(400, 'Fulfilment quantity is invalid.');
      if (!quantity) continue;
      const inventory = await InventoryItem.findOneAndUpdate(
        { _id: line.inventoryItemId, quantityReserved: { $gte: quantity }, quantityOnHand: { $gte: quantity } },
        { $inc: { quantityReserved: -quantity, quantityOnHand: -quantity } }, { new: true, session, runValidators: true },
      );
      if (!inventory) throw new ApiError(409, 'Reserved inventory is no longer available.');
      const requestItem = request.items.find((item) => item.itemId === line.requestItemId);
      if (!requestItem || requestItem.reservedQty < quantity) throw new ApiError(409, 'Reserved request quantity is no longer available.');
      requestItem.reservedQty -= quantity;
      requestItem.fulfilledQty += quantity;
      line.fulfilledQty += quantity;
      invoiceLines.push({ requestItemId: line.requestItemId, itemName: line.itemNameSnapshot, quantity, unit: line.unit, unitPricePaise: line.unitPricePaise, lineTotalPaise: Math.round(quantity * line.unitPricePaise) });
      await InventoryMovement.create([{ inventoryItemId: inventory._id, branchId: order.branchId, movementType: 'SALE_OUT', quantity, quantityOnHandBefore: inventory.quantityOnHand + quantity, quantityOnHandAfter: inventory.quantityOnHand, quantityReservedBefore: inventory.quantityReserved + quantity, quantityReservedAfter: inventory.quantityReserved, referenceType: 'SHOP_ORDER', referenceId: order._id, performedBy: req.user._id }], { session });
    }
    if (!invoiceLines.length) throw new ApiError(400, 'Provide at least one quantity to fulfil.');
    const complete = order.lines.every((line) => line.fulfilledQty >= line.approvedQty);
    order.status = complete ? 'FULFILLED' : 'PARTIALLY_FULFILLED';
    if (complete) order.fulfilledAt = new Date();
    request.status = materialRequestStatus(request.items);
    await request.save({ session });
    await order.save({ session });
    if (complete) {
      const [customer, branch] = await Promise.all([Customer.findById(order.customerId).session(session), ShopBranch.findById(order.branchId).session(session)]);
      const subtotalPaise = invoiceLines.reduce((total, line) => total + line.lineTotalPaise, 0);
      [invoice] = await Invoice.create([{ invoiceNumber: `INV-${randomBytes(8).toString('hex').toUpperCase()}`, requestId: order.requestId, orderId: order._id, shopId: order.shopId, branchId: order.branchId, customerId: order.customerId, sellerSnapshot: { businessName: shop.businessName, gstNumber: shop.gstNumber, contactPhone: shop.contactPhone, branch: branch?.toObject() }, buyerSnapshot: { name: customer?.name, phone: customer?.phone, email: customer?.email }, lines: invoiceLines, subtotalPaise, totalPaise: subtotalPaise }], { session });
      const invoices = await Invoice.find({ requestId: order.requestId, status: 'ISSUED' }).session(session);
      await PurchaseSummary.findOneAndUpdate({ requestId: order.requestId }, { $set: { statementNumber: `SUM-${randomBytes(8).toString('hex').toUpperCase()}`, invoiceIds: invoices.map((item) => item._id), shopCount: new Set(invoices.map((item) => item.shopId.toString())).size, subtotalPaise: invoices.reduce((sum, item) => sum + item.subtotalPaise, 0), taxPaise: invoices.reduce((sum, item) => sum + item.taxPaise, 0), discountPaise: invoices.reduce((sum, item) => sum + item.discountPaise, 0), totalPaise: invoices.reduce((sum, item) => sum + item.totalPaise, 0), generatedAt: new Date() } }, { upsert: true, new: true, session, setDefaultsOnInsert: true });
    }
  });
  res.json({ success: true, data: { order, invoice } });
}

export async function cancelShopOrder(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid order identifier.');
  const shop = await Shop.findOne({ ownerUserId: req.user._id, isActive: true, verificationStatus: 'VERIFIED' });
  if (!shop) throw new ApiError(403, 'Your shop must be verified before cancelling orders.');
  await runWithOptionalTransaction(async (session) => {
    const order = await ShopOrder.findOne({ _id: req.params.id, shopId: shop?._id, status: { $in: ['ACCEPTED', 'PARTIALLY_FULFILLED'] } }).session(session);
    if (!order) throw new ApiError(404, 'Order not found or already finalized.');
    const request = await MaterialRequest.findById(order.requestId).session(session);
    if (!request) throw new ApiError(409, 'The material request for this order no longer exists.');
    for (const line of order.lines) {
      const reserved = line.approvedQty - line.fulfilledQty;
      if (!reserved) continue;
      const inventory = await InventoryItem.findOneAndUpdate({ _id: line.inventoryItemId, quantityReserved: { $gte: reserved } }, { $inc: { quantityReserved: -reserved } }, { new: true, session, runValidators: true });
      if (!inventory) throw new ApiError(409, 'Reserved inventory cannot be released.');
      const requestItem = request.items.find((item) => item.itemId === line.requestItemId);
      requestItem.reservedQty -= reserved;
      await InventoryMovement.create([{ inventoryItemId: inventory._id, branchId: order.branchId, movementType: 'RELEASE', quantity: reserved, quantityOnHandBefore: inventory.quantityOnHand, quantityOnHandAfter: inventory.quantityOnHand, quantityReservedBefore: inventory.quantityReserved + reserved, quantityReservedAfter: inventory.quantityReserved, referenceType: 'SHOP_ORDER', referenceId: order._id, performedBy: req.user._id }], { session });
    }
    order.status = 'CANCELLED';
    request.status = materialRequestStatus(request.items);
    await Promise.all([order.save({ session }), request.save({ session })]);
  });
  res.json({ success: true, message: 'Order cancelled and reservations released.' });
}

export async function listShopReturnRequests(req, res) {
  const shop = await getOwnedShop(req.user._id);
  if (!shop) return res.json({ success: true, data: { returns: [] } });
  const filter = { shopId: shop._id };
  const status = String(req.query.status || '').toUpperCase();
  if (['PENDING', 'PROCESSING', 'APPROVED', 'REJECTED'].includes(status)) filter.status = status;
  const returns = await ReturnRequest.find(filter)
    .populate('orderId', 'orderCode')
    .populate('customerId', 'name phone')
    .sort({ createdAt: -1 })
    .limit(200);
  res.json({ success: true, data: { returns } });
}

export async function decideShopReturnRequest(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid return request identifier.');
  const shop = await Shop.findOne({ ownerUserId: req.user._id, isActive: true, verificationStatus: 'VERIFIED' });
  if (!shop) throw new ApiError(403, 'Your shop must be verified to decide return requests.');
  const decision = String(req.body.decision || '').toUpperCase();
  if (!['APPROVE', 'REJECT'].includes(decision)) throw new ApiError(400, 'Decision must be APPROVE or REJECT.');
  const decisionReason = String(req.body.reason || '').trim();
  if (decisionReason.length > 500) throw new ApiError(400, 'Return decision reason must be 500 characters or fewer.');

  let decidedReturn;
  await runWithOptionalTransaction(async (session) => {
    let returnRequest;
    let order;
    let request;
    let inventory;
    let movement;
    let orderSaved = false;
    let requestSaved = false;
    returnRequest = await ReturnRequest.findOneAndUpdate(
      { _id: req.params.id, shopId: shop._id, status: 'PENDING' },
      { $set: { status: 'PROCESSING' } },
      { new: true, session },
    );
    if (!returnRequest) {
      const exists = await ReturnRequest.exists({ _id: req.params.id, shopId: shop._id }).session(session);
      if (!exists) throw new ApiError(404, 'Return request not found.');
      throw new ApiError(409, 'Return request has already been decided or is being processed.');
    }

    try {
      order = await ShopOrder.findOne({ _id: returnRequest.orderId, shopId: shop._id }).session(session);
      const line = order?.lines[returnRequest.orderLineIndex];
      if (!order || order.status !== 'FULFILLED' || !line || !line.inventoryItemId.equals(returnRequest.inventoryItemId)) {
        throw new ApiError(409, 'The fulfilled order line for this return is no longer available.');
      }
      if (Number(line.returnPendingQty || 0) < returnRequest.quantity) {
        throw new ApiError(409, 'The pending return quantity is no longer available.');
      }

      if (decision === 'APPROVE') {
        request = await MaterialRequest.findById(returnRequest.requestId).session(session);
        const requestItem = request?.items.find((item) => item.itemId === line.requestItemId);
        if (!request || !requestItem) throw new ApiError(409, 'The material request line for this return is no longer available.');
        const totalFulfilled = Number(requestItem.fulfilledQty || 0);
        const totalReturned = Number(requestItem.returnedQty || 0);
        if (totalReturned + returnRequest.quantity > totalFulfilled + 1e-9) {
          throw new ApiError(409, 'Approved returns cannot exceed the fulfilled request quantity.');
        }
        requestItem.returnedQty = totalReturned + returnRequest.quantity;
        if (request.status !== 'CANCELLED') request.status = materialRequestStatus(request.items);
        await request.save({ session });
        requestSaved = true;

        inventory = await InventoryItem.findOneAndUpdate(
          { _id: returnRequest.inventoryItemId, branchId: order.branchId, isActive: true },
          { $inc: { quantityOnHand: returnRequest.quantity } },
          { new: true, session, runValidators: true },
        );
        if (!inventory) throw new ApiError(409, 'The original inventory item is unavailable for restocking.');
        [movement] = await InventoryMovement.create([{
          inventoryItemId: inventory._id,
          branchId: inventory.branchId,
          movementType: 'RETURN_IN',
          quantity: returnRequest.quantity,
          quantityOnHandBefore: inventory.quantityOnHand - returnRequest.quantity,
          quantityOnHandAfter: inventory.quantityOnHand,
          quantityReservedBefore: inventory.quantityReserved,
          quantityReservedAfter: inventory.quantityReserved,
          referenceType: 'RETURN',
          referenceId: returnRequest._id,
          performedBy: req.user._id,
          note: `Customer return for order ${order.orderCode}`,
        }], { session });
        line.returnApprovedQty = Number(line.returnApprovedQty || 0) + returnRequest.quantity;
      }

      line.returnPendingQty = Number(line.returnPendingQty || 0) - returnRequest.quantity;
      await order.save({ session });
      orderSaved = true;
      returnRequest.status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      returnRequest.decidedBy = req.user._id;
      returnRequest.decisionReason = decisionReason || null;
      returnRequest.decidedAt = new Date();
      await returnRequest.save({ session });
      decidedReturn = returnRequest;
    } catch (error) {
      if (!session.inTransaction()) {
        const rollbackErrors = [];
        if (movement) {
          try { await InventoryMovement.deleteOne({ _id: movement._id }).session(session); }
          catch (rollbackError) { rollbackErrors.push(rollbackError); }
        }
        if (inventory) {
          try {
            const reverted = await InventoryItem.findOneAndUpdate(
              { _id: inventory._id, $expr: { $gte: [{ $subtract: ['$quantityOnHand', '$quantityReserved'] }, returnRequest.quantity] } },
              { $inc: { quantityOnHand: -returnRequest.quantity } },
              { session, runValidators: true },
            );
            if (!reverted) throw new Error('Restocked units changed before rollback.');
          } catch (rollbackError) { rollbackErrors.push(rollbackError); }
        }
        if (orderSaved) {
          try {
            const rollbackOrder = await ShopOrder.findById(order._id).session(session);
            const rollbackLine = rollbackOrder?.lines[returnRequest.orderLineIndex];
            if (!rollbackLine) throw new Error('Order line disappeared before rollback.');
            rollbackLine.returnPendingQty = Number(rollbackLine.returnPendingQty || 0) + returnRequest.quantity;
            if (decision === 'APPROVE') rollbackLine.returnApprovedQty = Number(rollbackLine.returnApprovedQty || 0) - returnRequest.quantity;
            await rollbackOrder.save({ session });
          } catch (rollbackError) { rollbackErrors.push(rollbackError); }
        }
        if (requestSaved) {
          try {
            const rollbackRequest = await MaterialRequest.findById(request._id).session(session);
            const rollbackItem = rollbackRequest?.items.find((item) => item.itemId === order.lines[returnRequest.orderLineIndex].requestItemId);
            if (!rollbackItem) throw new Error('Material request line disappeared before rollback.');
            rollbackItem.returnedQty = Math.max(0, Number(rollbackItem.returnedQty || 0) - returnRequest.quantity);
            if (rollbackRequest.status !== 'CANCELLED') rollbackRequest.status = materialRequestStatus(rollbackRequest.items);
            await rollbackRequest.save({ session });
          } catch (rollbackError) { rollbackErrors.push(rollbackError); }
        }
        try {
          await ReturnRequest.updateOne(
            { _id: returnRequest._id, status: 'PROCESSING' },
            { $set: { status: 'PENDING' } },
            { session },
          );
        } catch (rollbackError) { rollbackErrors.push(rollbackError); }
        if (rollbackErrors.length) {
          throw new AggregateError([error, ...rollbackErrors], 'Return decision failed and rollback was incomplete.');
        }
      }
      throw error;
    }
  });

  const customer = await Customer.findById(decidedReturn.customerId).select('linkedUserId');
  if (customer?.linkedUserId) {
    const notification = await Notification.create({
      userId: customer.linkedUserId,
      type: decision === 'APPROVE' ? 'RETURN_APPROVED' : 'RETURN_REJECTED',
      title: `Return ${decision === 'APPROVE' ? 'approved' : 'rejected'}`,
      message: `Return for ${decidedReturn.itemName} on order ${decidedReturn.orderId} was ${decision.toLowerCase()}.`,
      relatedRequestId: decidedReturn.requestId,
      relatedOrderId: decidedReturn.orderId,
    });
    emitUserNotification(null, customer.linkedUserId, notification);
  }
  res.json({ success: true, data: { returnRequest: decidedReturn } });
}

export async function requestMaterialAccess(req, res) {
  const shop = await Shop.findOne({ ownerUserId: req.user._id, isActive: true, verificationStatus: 'VERIFIED' });
  if (!shop) throw new ApiError(403, 'Your shop must be verified before requesting access.');
  const normalizedCode = normalizeRequestCode(req.params.requestCode);
  const request = await MaterialRequest.findOne({ requestCode: normalizedCode, status: { $ne: 'CANCELLED' } });
  if (!request) throw new ApiError(404, 'Material request not found.');
  if (request.shopAccess.mode === 'ANY_REGISTERED_SHOP' || request.shopAccess.approvedShopIds.some((id) => id.equals(shop._id))) {
    throw new ApiError(409, 'Your shop already has access to this request.');
  }
  const existing = await RequestAccessGrant.findOne({ requestId: request._id, shopId: shop._id, grantType: 'SHOP_INVITATION', revokedAt: null, expiresAt: { $gt: new Date() } });
  if (existing) throw new ApiError(409, 'An access request is already pending.');
  await RequestAccessGrant.create({ requestId: request._id, grantType: 'SHOP_INVITATION', shopId: shop._id, permissions: [], expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), createdBy: req.user._id });
  const customer = await Customer.findById(request.customerId).select('linkedUserId');
  if (customer?.linkedUserId) {
    const notification = await Notification.create({ userId: customer.linkedUserId, type: 'SHOP_ACCESS_REQUESTED', title: 'Shop access requested', message: `${shop.businessName} requested access to material request ${request.requestCode}.`, relatedRequestId: request._id });
    emitUserNotification(null, customer.linkedUserId, notification);
  }
  res.status(201).json({ success: true, message: 'Access request sent for customer approval.' });
}

export async function listMyShopOrders(req, res) {
  const shop = await Shop.findOne({ ownerUserId: req.user._id, isActive: true });
  if (!shop) return res.json({ success: true, data: { orders: [] } });
  const filter = { shopId: shop._id };
  const allowedStatuses = ['SUBMITTED', 'ACCEPTED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED', 'EXPIRED'];
  const status = String(req.query.status || '').toUpperCase();
  if (allowedStatuses.includes(status)) filter.status = status;
  const orders = await ShopOrder.find(filter).populate('requestId', 'requestCode status').sort({ createdAt: -1 }).limit(200);
  res.json({ success: true, data: { orders } });
}

export async function listLowStock(req, res) {
  const shop = await getOwnedShop(req.user._id);
  const branches = shop ? await ShopBranch.find({ shopId: shop._id, isActive: true }).select('_id') : [];
  const items = await InventoryItem.find({ branchId: { $in: branches.map((branch) => branch._id) }, isActive: true, $expr: { $lte: [{ $subtract: ['$quantityOnHand', '$quantityReserved'] }, '$lowStockThreshold'] } }).populate('productId', 'name category brand unit').sort({ quantityOnHand: 1 }).limit(200);
  res.json({ success: true, data: { items } });
}

export async function listInventoryMovements(req, res) {
  const shop = await getOwnedShop(req.user._id);
  const branches = shop ? await ShopBranch.find({ shopId: shop._id, isActive: true }).select('_id') : [];
  const movements = await InventoryMovement.find({ branchId: { $in: branches.map((branch) => branch._id) } }).sort({ createdAt: -1 }).limit(200).populate('inventoryItemId', 'sku customName').populate('performedBy', 'name');
  res.json({ success: true, data: { movements } });
}