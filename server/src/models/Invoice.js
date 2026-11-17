import mongoose from 'mongoose';

const invoiceLineSchema = new mongoose.Schema({
  requestItemId: String,
  itemName: { type: String, required: true },
  description: String,
  quantity: { type: Number, required: true, min: 0 },
  unit: { type: String, required: true },
  unitPricePaise: { type: Number, required: true, min: 0 },
  lineTotalPaise: { type: Number, required: true, min: 0 },
}, { _id: false });

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true, unique: true },
  requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'MaterialRequest', required: true, index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShopOrder', required: true, index: true },
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShopBranch', required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  sellerSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  buyerSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  lines: { type: [invoiceLineSchema], required: true },
  subtotalPaise: { type: Number, required: true, min: 0 },
  taxPaise: { type: Number, default: 0, min: 0 },
  discountPaise: { type: Number, default: 0, min: 0 },
  totalPaise: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['ISSUED', 'VOID'], default: 'ISSUED' },
  issuedAt: { type: Date, default: Date.now },
  replacesInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null },
  correctionReason: { type: String, default: null },
  issueType: { type: String, enum: ['ORIGINAL', 'CORRECTION'], default: 'ORIGINAL' },
}, { timestamps: true, versionKey: false });

invoiceSchema.index({ shopId:  1, issuedAt: -1 });
export default mongoose.model('Invoice', invoiceSchema);
