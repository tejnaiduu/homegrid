import mongoose from 'mongoose';

const orderLineSchema = new mongoose.Schema({
  requestItemId: { type: String, required: true },
  inventoryItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  itemNameSnapshot: { type: String, required: true },
  unit: { type: String, required: true },
  offeredQty: { type: Number, required: true, min: 0 },
  approvedQty: { type: Number, default: 0, min: 0 },
  fulfilledQty: { type: Number, default: 0, min: 0 },
  returnPendingQty: { type: Number, default: 0, min: 0 },
  returnApprovedQty: { type: Number, default: 0, min: 0 },
  unitPricePaise: { type: Number, required: true, min: 0 },
  isSubstitute: { type: Boolean, default: false },
  substituteDetails: { type: mongoose.Schema.Types.Mixed, default: null },
}, { _id: false });

const shopOrderSchema = new mongoose.Schema({
  orderCode: { type: String, required: true, unique: true },
  idempotencyKey: { type: String, trim: true, maxlength: 120 },
  requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'MaterialRequest', required: true, index: true },
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShopBranch', required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  createdByShopUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: {
    type: String,
    enum: ['SUBMITTED', 'AWAITING_CUSTOMER_APPROVAL', 'ACCEPTED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED', 'EXPIRED'],
    default: 'SUBMITTED',
    index: true,
  },
  lines: { type: [orderLineSchema], validate: [(lines) => lines.length > 0, 'An order must contain at least one line.'] },
  subtotalPaise: { type: Number, default: 0, min: 0 },
  taxPaise: { type: Number, default: 0, min: 0 },
  discountPaise: { type: Number, default: 0, min: 0 },
  totalPaise: { type: Number, default: 0, min: 0 },
  expiresAt: Date,
  acceptedAt: Date,
  fulfilledAt: Date,
}, { timestamps: true, versionKey: false });

shopOrderSchema.index({ requestId: 1, createdAt: -1 });
shopOrderSchema.index({ shopId: 1, createdAt: -1 });
shopOrderSchema.index({ shopId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });
export default mongoose.model('ShopOrder', shopOrderSchema);
