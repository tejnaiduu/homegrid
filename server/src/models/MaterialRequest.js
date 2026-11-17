import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';

const requestItemSchema = new mongoose.Schema({
  itemId: { type: String, default: () => randomUUID(), required: true },
  itemType: { type: String, enum: ['CATALOG', 'CUSTOM'], required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  category: { type: String, trim: true, uppercase: true, maxlength: 80 },
  brandPreference: { type: String, trim: true, maxlength: 100 },
  unit: { type: String, required: true, enum: ['PCS', 'METRE', 'ROLL', 'BOX', 'SET', 'KG', 'LITRE', 'OTHER'] },
  specifications: { type: mongoose.Schema.Types.Mixed, default: {} },
  requestedQty: { type: Number, required: true, min: 0.0001 },
  reservedQty: { type: Number, default: 0, min: 0 },
  fulfilledQty: { type: Number, default: 0, min: 0 },
  returnedQty: { type: Number, default: 0, min: 0 },
  notes: { type: String, trim: true, maxlength: 500 },
}, { _id: false });

const materialRequestSchema = new mongoose.Schema({
  requestCode: { type: String, required: true, unique: true, immutable: true, index: true },
  electricianId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  houseId: { type: mongoose.Schema.Types.ObjectId, ref: 'House', required: true, index: true },
  status: {
    type: String,
    enum: ['OPEN', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED'],
    default: 'OPEN',
    index: true,
  },
  shopAccess: {
    mode: { type: String, enum: ['ANY_REGISTERED_SHOP', 'APPROVED_ONLY'], default: 'APPROVED_ONLY' },
    approvedShopIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Shop' }],
  },
  items: {
    type: [requestItemSchema],
    validate: [(items) => items.length > 0, 'A material request must contain at least one item.'],
  },
  notes: { type: String, trim: true, maxlength: 2000 },
  expiresAt: Date,
}, { timestamps: true, versionKey: false });

materialRequestSchema.index({ electricianId: 1, createdAt: -1 });
materialRequestSchema.index({ customerId: 1, createdAt: -1 });
materialRequestSchema.index({ houseId: 1, createdAt: -1 });
export default mongoose.model('MaterialRequest', materialRequestSchema);
