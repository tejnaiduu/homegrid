import mongoose from 'mongoose';

const inventoryItemSchema = new mongoose.Schema({
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShopBranch', required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 80 },
  customName: { type: String, trim: true, maxlength: 160 },
  unit: { type: String, required: true, enum: ['PCS', 'METRE', 'ROLL', 'BOX', 'SET', 'KG', 'LITRE', 'OTHER'] },
  specifications: { type: mongoose.Schema.Types.Mixed, default: {} },
  quantityOnHand: { type: Number, required: true, min: 0, default: 0 },
  quantityReserved: { type: Number, required: true, min: 0, default: 0 },
  purchasePricePaise: { type: Number, min: 0, default: 0 },
  sellingPricePaise: { type: Number, required: true, min: 0 },
  lowStockThreshold: { type: Number, min: 0, default: 0 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true, versionKey: false });

inventoryItemSchema.index({ branchId: 1, sku: 1 }, { unique: true });
inventoryItemSchema.index({ productId: 1, branchId: 1 });
export default mongoose.model('InventoryItem', inventoryItemSchema);
