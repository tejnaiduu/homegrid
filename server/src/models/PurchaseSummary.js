import mongoose from 'mongoose';

// This is a customer-facing consolidated statement, not a replacement for each shop's tax invoice.
const purchaseSummarySchema = new mongoose.Schema({
  statementNumber: { type: String, required: true, unique: true },
  requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'MaterialRequest', required: true, unique: true },
  invoiceIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' }],
  shopCount: { type: Number, default: 0, min: 0 },
  subtotalPaise: { type: Number, default: 0, min: 0 },
  taxPaise: { type: Number, default: 0, min: 0 },
  discountPaise: { type: Number, default: 0, min: 0 },
  totalPaise: { type: Number, default: 0, min: 0 },
  generatedAt: { type: Date, default: Date.now },
}, { timestamps: true, versionKey: false });

export default mongoose.model('PurchaseSummary', purchaseSummarySchema);
