import mongoose from 'mongoose';

const inventoryMovementSchema = new mongoose.Schema({
  inventoryItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShopBranch', required: true, index: true },
  movementType: {
    type: String,
    enum: ['PURCHASE_IN', 'RESERVE', 'RELEASE', 'SALE_OUT', 'RETURN_IN', 'ADJUSTMENT'],
    required: true,
  },
  quantity: { type: Number, required: true, min: 0.0001 },
  quantityOnHandBefore: { type: Number, required: true, min: 0 },
  quantityOnHandAfter: { type: Number, required: true, min: 0 },
  quantityReservedBefore: { type: Number, required: true, min: 0 },
  quantityReservedAfter: { type: Number, required: true, min: 0 },
  referenceType: { type: String, enum: ['SHOP_ORDER', 'MANUAL', 'PURCHASE', 'RETURN'], required: true },
  referenceId: { type: mongoose.Schema.Types.ObjectId },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  note: { type: String, trim: true, maxlength: 500 },
}, { timestamps: true, versionKey: false });

inventoryMovementSchema.index({ inventoryItemId: 1, createdAt: -1 });
export default mongoose.model('InventoryMovement', inventoryMovementSchema);
