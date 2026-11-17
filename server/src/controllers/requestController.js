import mongoose from 'mongoose';
import MaterialRequest from '../models/MaterialRequest.js';
import Product from '../models/Product.js';
import Customer from '../models/Customer.js';
import House from '../models/House.js';
import RequestAccessGrant from '../models/RequestAccessGrant.js';
import Invoice from '../models/Invoice.js';
import PurchaseSummary from '../models/PurchaseSummary.js';
import Notification from '../models/Notification.js';
import Shop from '../models/Shop.js';
import ShopOrder from '../models/ShopOrder.js';
import ReturnRequest from '../models/ReturnRequest.js';
import { emitUserNotification } from '../sockets/realtime.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { generateRequestCode, normalizeRequestCode } from '../utils/requestCode.js';
import { createOpaqueToken, hashToken } from '../utils/security.js';
import { runWithOptionalTransaction } from '../utils/transactions.js';

const ALLOWED_UNITS = ['PCS', 'METRE', 'ROLL', 'BOX', 'SET', 'KG', 'LITRE', 'OTHER'];

async function canViewRequest(request, user) {
  if (request.electricianId.equals(user._id)) return true;
  if (user.roles.includes('ADMIN')) return true;
  if (!user.roles.includes('CUSTOMER')) return false;
  const customer = await Customer.exists({ _id: request.customerId, linkedUserId: user._id });
  return Boolean(customer);
}

function toRequestPayload(request) {
  return {
    id: request._id,
    requestCode: request.requestCode,
    status: request.status,
    items: request.items,
    shopAccess: request.shopAccess,
    notes: request.notes,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}

export async function createMaterialRequest(req, res) {
  const { customerId, houseId, items, notes, shopAccessMode } = req.body;
  if (!customerId || !houseId || !Array.isArray(items) || items.length === 0) {
    throw new ApiError(400, 'Customer, house and at least one material item are required.');
  }

  const [customer, house] = await Promise.all([
    Customer.findOne({ _id: customerId, createdByElectricianId: req.user._id }),
    House.findOne({ _id: houseId, createdByElectricianId: req.user._id, customerId }),
  ]);
  if (!customer || !house) throw new ApiError(404, 'Customer or house was not found in your records.');

  const productIds = items
    .filter((item) => item.itemType === 'CATALOG' && item.productId)
    .map((item) => item.productId);
  const products = productIds.length ? await Product.find({ _id: { $in: productIds }, isActive: true }) : [];
  const productMap = new Map(products.map((product) => [product._id.toString(), product]));

  const normalizedItems = items.map((item) => {
    const itemType = String(item.itemType || '').toUpperCase();
    const requestedQty = Number(item.requestedQty);
    if (!Number.isFinite(requestedQty) || requestedQty <= 0) {
      throw new ApiError(400, 'Every item must have a quantity greater than zero.');
    }

    if (itemType === 'CATALOG') {
      const product = productMap.get(String(item.productId));
      if (!product) throw new ApiError(400, `Catalog product not found: ${item.productId}`);
      return {
        itemType,
        productId: product._id,
        name: product.name,
        category: product.category,
        brandPreference: item.brandPreference || product.brand,
        unit: product.unit,
        specifications: { ...product.specifications, ...(item.specifications || {}) },
        requestedQty,
        notes: item.notes,
      };
    }

    if (itemType === 'CUSTOM') {
      const unit = String(item.unit || 'OTHER').toUpperCase();
      if (!item.name || !ALLOWED_UNITS.includes(unit)) {
        throw new ApiError(400, 'Custom items require a name and a valid unit.');
      }
      return {
        itemType,
        productId: null,
        name: String(item.name).trim(),
        category: item.category,
        brandPreference: item.brandPreference,
        unit,
        specifications: item.specifications || {},
        requestedQty,
        notes: item.notes,
      };
    }

    throw new ApiError(400, 'Each item must be CATALOG or CUSTOM.');
  });

  const request = await MaterialRequest.create({
    requestCode: generateRequestCode(),
    electricianId: req.user._id,
    customerId,
    houseId,
    items: normalizedItems,
    notes,
    shopAccess: {
      mode: ['ANY_REGISTERED_SHOP', 'APPROVED_ONLY'].includes(shopAccessMode)
        ? shopAccessMode
        : 'APPROVED_ONLY',
      approvedShopIds: [],
    },
  });

  res.status(201).json({ success: true, data: { request: toRequestPayload(request) } });
}

export async function listMyRequests(req, res) {
  let filter;
  if (req.user.roles.includes('ELECTRICIAN')) {
    filter = { electricianId: req.user._id };
  } else if (req.user.roles.includes('CUSTOMER')) {
    const customers = await Customer.find({ linkedUserId: req.user._id }).select('_id');
    filter = { customerId: { $in: customers.map((item) => item._id) } };
  } else if (req.user.roles.includes('ADMIN')) {
    filter = {};
  } else {
    throw new ApiError(403, 'This account cannot view material requests.');
  }

  const requests = await MaterialRequest.find(filter).sort({ createdAt: -1 }).limit(100);
  res.json({ success: true, data: { requests: requests.map(toRequestPayload) } });
}

export async function getRequestById(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid request identifier.');
  const request = await MaterialRequest.findById(req.params.id);
  if (!request) throw new ApiError(404, 'Material request not found.');
  if (!(await canViewRequest(request, req.user))) throw new ApiError(403, 'You do not have access to this material request.');
  res.json({ success: true, data: { request: toRequestPayload(request) } });
}

export async function getRequestByCode(req, res) {
  const normalizedCode = normalizeRequestCode(req.params.requestCode);
  const request = await MaterialRequest.findOne({ requestCode: normalizedCode });
  if (!request) throw new ApiError(404, 'Material request not found.');
  if (!(await canViewRequest(request, req.user))) throw new ApiError(403, 'This request is not linked to your account.');
  res.json({ success: true, data: { request: toRequestPayload(request) } });
}

export async function getRequestInvoices(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid request identifier.');
  const request = await MaterialRequest.findById(req.params.id);
  if (!request || !(await canViewRequest(request, req.user))) throw new ApiError(404, 'Material request not found.');
  const invoices = await Invoice.find({ requestId: request._id, status: 'ISSUED' }).sort({ issuedAt: -1 });
  res.json({ success: true, data: { invoices } });
}

export async function getRequestPurchaseSummary(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid request identifier.');
  const request = await MaterialRequest.findById(req.params.id);
  if (!request || !(await canViewRequest(request, req.user))) throw new ApiError(404, 'Material request not found.');
  const summary = await PurchaseSummary.findOne({ requestId: request._id });
  res.json({ success: true, data: { summary } });
}

export async function getRequestPurchases(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid request identifier.');
  const request = await MaterialRequest.findById(req.params.id);
  if (!request || !(await canViewRequest(request, req.user))) throw new ApiError(404, 'Material request not found.');
  const orders = await ShopOrder.find({ requestId: request._id }).sort({ createdAt: -1 }).populate('shopId', 'businessName').populate('branchId', 'branchName');
  res.json({ success: true, data: { orders } });
}

async function getLinkedCustomerRequestForReturns(requestId, userId) {
  if (!mongoose.isValidObjectId(requestId)) throw new ApiError(400, 'Invalid request identifier.');
  const request = await MaterialRequest.findById(requestId);
  if (!request) throw new ApiError(404, 'Material request not found.');
  const customer = await Customer.findOne({ _id: request.customerId, linkedUserId: userId });
  if (!customer) throw new ApiError(403, 'Only the linked customer can manage returns for this request.');
  return request;
}

export async function listCustomerReturns(req, res) {
  const request = await getLinkedCustomerRequestForReturns(req.params.id, req.user._id);
  const returns = await ReturnRequest.find({ requestId: request._id, customerId: request.customerId })
    .populate('orderId', 'orderCode')
    .populate('invoiceId', 'invoiceNumber')
    .sort({ createdAt: -1 })
    .limit(200);
  res.json({ success: true, data: { returns } });
}

export async function createCustomerReturn(req, res) {
  const request = await getLinkedCustomerRequestForReturns(req.params.id, req.user._id);
  const { orderId } = req.body;
  const lineIndex = Number(req.body.lineIndex);
  const quantity = Number(req.body.quantity);
  const reason = String(req.body.reason || '').trim();
  if (!mongoose.isValidObjectId(orderId)) throw new ApiError(400, 'A valid shop order is required.');
  if (!Number.isInteger(lineIndex) || lineIndex < 0) throw new ApiError(400, 'A valid order line is required.');
  if (!Number.isFinite(quantity) || quantity <= 0) throw new ApiError(400, 'Return quantity must be greater than zero.');
  if (!reason || reason.length > 500) throw new ApiError(400, 'A return reason of 1 to 500 characters is required.');

  let createdReturn;
  let shop;
  await runWithOptionalTransaction(async (session) => {
    const order = await ShopOrder.findOne({
      _id: orderId,
      requestId: request._id,
      customerId: request.customerId,
      status: 'FULFILLED',
    }).session(session);
    if (!order) throw new ApiError(404, 'A fulfilled order for this request was not found.');
    const line = order.lines[lineIndex];
    if (!line || line.fulfilledQty <= 0) throw new ApiError(400, 'The selected order line has no fulfilled quantity to return.');
    const invoice = await Invoice.findOne({ orderId: order._id, status: 'ISSUED' }).sort({ issuedAt: -1 }).session(session);
    if (!invoice) throw new ApiError(409, 'An issued invoice is required before requesting a return.');
    shop = await Shop.findById(order.shopId).select('ownerUserId businessName').session(session);
    if (!shop) throw new ApiError(409, 'The shop for this order is unavailable.');

    const availableQuantity = {
      $subtract: [
        { $ifNull: [{ $arrayElemAt: ['$lines.fulfilledQty', lineIndex] }, 0] },
        {
          $add: [
            { $ifNull: [{ $arrayElemAt: ['$lines.returnPendingQty', lineIndex] }, 0] },
            { $ifNull: [{ $arrayElemAt: ['$lines.returnApprovedQty', lineIndex] }, 0] },
          ],
        },
      ],
    };
    const counterPath = `lines.${lineIndex}.returnPendingQty`;
    const reservedOrder = await ShopOrder.findOneAndUpdate(
      {
        _id: order._id,
        status: 'FULFILLED',
        $expr: { $gte: [availableQuantity, quantity] },
      },
      { $inc: { [counterPath]: quantity } },
      { new: true, session },
    );
    if (!reservedOrder) throw new ApiError(409, 'Return quantity exceeds the remaining returnable quantity.');

    try {
      [createdReturn] = await ReturnRequest.create([{
        requestId: request._id,
        orderId: order._id,
        invoiceId: invoice._id,
        shopId: order.shopId,
        customerId: request.customerId,
        inventoryItemId: line.inventoryItemId,
        orderLineIndex: lineIndex,
        itemName: line.itemNameSnapshot,
        unit: line.unit,
        quantity,
        reason,
        requestedBy: req.user._id,
      }], { session });
    } catch (error) {
      const rollback = await ShopOrder.updateOne({ _id: order._id }, { $inc: { [counterPath]: -quantity } }, { session });
      if (!rollback.modifiedCount) {
        throw new AggregateError([error], 'Return request creation failed and the returnable quantity reservation could not be released.');
      }
      throw error;
    }
  });

  const notification = await Notification.create({
    userId: shop.ownerUserId,
    type: 'RETURN_REQUESTED',
    title: 'Customer return requested',
    message: `${createdReturn.quantity} ${createdReturn.unit} of ${createdReturn.itemName} were submitted for return.`,
    relatedRequestId: request._id,
    relatedOrderId: createdReturn.orderId,
  });
  emitUserNotification(null, shop.ownerUserId, notification);
  res.status(201).json({ success: true, data: { returnRequest: createdReturn } });
}

async function getLinkedCustomerRequest(requestId, userId) {
  const request = await MaterialRequest.findById(requestId);
  if (!request) throw new ApiError(404, 'Material request not found.');
  const customer = await Customer.findOne({ _id: request.customerId, linkedUserId: userId });
  if (!customer) throw new ApiError(403, 'Only the linked customer can manage shop access.');
  return request;
}

export async function listShopAccessRequests(req, res) {
  const request = await getLinkedCustomerRequest(req.params.id, req.user._id);
  const grants = await RequestAccessGrant.find({ requestId: request._id, grantType: 'SHOP_INVITATION', revokedAt: null, expiresAt: { $gt: new Date() } }).populate('shopId', 'businessName contactPhone verificationStatus').sort({ createdAt: -1 });
  res.json({ success: true, data: { requests: grants } });
}

export async function decideShopAccess(req, res) {
  const request = await getLinkedCustomerRequest(req.params.id, req.user._id);
  if (!mongoose.isValidObjectId(req.params.shopId)) throw new ApiError(400, 'Invalid shop identifier.');
  const grant = await RequestAccessGrant.findOne({ requestId: request._id, shopId: req.params.shopId, grantType: 'SHOP_INVITATION', revokedAt: null, expiresAt: { $gt: new Date() } });
  if (!grant) throw new ApiError(404, 'Pending shop access request not found.');
  const decision = String(req.body.decision || '').toUpperCase();
  const shop = await Shop.findById(req.params.shopId).select('businessName ownerUserId');
  if (!shop) throw new ApiError(404, 'Shop not found.');
  grant.revokedAt = new Date();
  if (decision === 'APPROVE') {
    grant.grantType = 'SHOP_APPROVAL';
    grant.permissions = ['VIEW_REQUEST', 'CREATE_ORDER', 'VIEW_PURCHASE_SUMMARY'];
    grant.revokedAt = null;
    request.shopAccess.approvedShopIds.addToSet(shop._id);
    await request.save();
  } else if (decision !== 'REJECT') {
    throw new ApiError(400, 'Decision must be APPROVE or REJECT.');
  }
  await grant.save();
  const notification = await Notification.create({ userId: shop.ownerUserId, type: decision === 'APPROVE' ? 'SHOP_ACCESS_APPROVED' : 'SHOP_ACCESS_REJECTED', title: `Shop access ${decision.toLowerCase()}`, message: `Access to material request ${request.requestCode} was ${decision.toLowerCase()}.`, relatedRequestId: request._id });
  emitUserNotification(null, shop.ownerUserId, notification);
  res.json({ success: true, message: `Shop access ${decision.toLowerCase()}.` });
}

export async function revokeShopAccess(req, res) {
  const request = await getLinkedCustomerRequest(req.params.id, req.user._id);
  if (!mongoose.isValidObjectId(req.params.shopId)) throw new ApiError(400, 'Invalid shop identifier.');
  const result = await RequestAccessGrant.updateMany({ requestId: request._id, shopId: req.params.shopId, grantType: 'SHOP_APPROVAL', revokedAt: null }, { $set: { revokedAt: new Date() } });
  request.shopAccess.approvedShopIds.pull(req.params.shopId);
  await request.save();
  if (!result.modifiedCount) throw new ApiError(404, 'Active shop access grant not found.');
  res.json({ success: true, message: 'Shop access revoked.' });
}

export async function createCustomerQrAccess(req, res) {
  const request = await MaterialRequest.findById(req.params.id);
  if (!request) throw new ApiError(404, 'Material request not found.');
  if (!request.electricianId.equals(req.user._id)) throw new ApiError(403, 'Only the request electrician can create its customer QR.');

  await RequestAccessGrant.updateMany(
    { requestId: request._id, grantType: 'CUSTOMER_QR', revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );

  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await RequestAccessGrant.create({
    requestId: request._id,
    grantType: 'CUSTOMER_QR',
    tokenHash: hashToken(token),
    permissions: ['VIEW_REQUEST'],
    expiresAt,
    createdBy: req.user._id,
  });

  res.status(201).json({
    success: true,
    data: {
      accessUrl: `${env.clientUrl}/access/${token}`,
      expiresAt,
      permissions: ['VIEW_REQUEST'],
    },
  });
}

export async function getPublicRequestByToken(req, res) {
  const tokenHash = hashToken(req.params.token);
  const grant = await RequestAccessGrant.findOne({
    tokenHash,
    grantType: 'CUSTOMER_QR',
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  }).select('+tokenHash');

  if (!grant) throw new ApiError(404, 'This QR link is invalid, expired or revoked.');
  const request = await MaterialRequest.findById(grant.requestId);
  if (!request || request.status === 'CANCELLED') throw new ApiError(404, 'Material request is no longer available.');

  // Public QR responses intentionally exclude customer phone, address and private notes.
  res.json({
    success: true,
    data: {
      request: {
        requestCode: request.requestCode,
        status: request.status,
        items: request.items,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
      },
    },
  });
}
