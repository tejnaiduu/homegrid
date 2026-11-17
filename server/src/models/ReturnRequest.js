import mongoose from 'mongoose';

const returnRequestSchema = new mongoose.Schema({
  requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'MaterialRequest', required: true, index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShopOrder', required: true, index: true },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  inventoryItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
  orderLineIndex: { type: Number, required: true, min: 0 },
  itemName: { type: String, required: true, trim: true, maxlength: 160 },
  unit: { type: String, required: true },
  quantity: { type: Number, required: true, min: 0.0001 },
  reason: { type: String, required: true, trim: true, maxlength: 500 },
  status: {
    type: String,
    enum: ['PENDING', 'PROCESSING', 'APPROVED', 'REJECTED'],
    default: 'PENDING',
    index: true,
  },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  decisionReason: { type: String, trim: true, maxlength: 500, default: null },
  decidedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

returnRequestSchema.index({ shopId: 1, status: 1, createdAt: -1 });
returnRequestSchema.index({ customerId: 1, requestId: 1, createdAt: -1 });

export default mongoose.model('ReturnRequest', returnRequestSchema);
