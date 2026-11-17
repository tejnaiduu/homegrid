import mongoose from 'mongoose';

const grantSchema = new mongoose.Schema({
  requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'MaterialRequest', required: true, index: true },
  grantType: { type: String, enum: ['CUSTOMER_QR', 'SHOP_APPROVAL', 'SHOP_INVITATION'], required: true },
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
  tokenHash: { type: String, select: false },
  permissions: [{ type: String, enum: ['VIEW_REQUEST', 'CREATE_ORDER', 'VIEW_PURCHASE_SUMMARY'] }],
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, versionKey: false });

grantSchema.index({ tokenHash: 1 }, { unique: true, sparse: true });
grantSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
grantSchema.index(
  { requestId: 1, shopId: 1, grantType: 1 },
  { unique: true, partialFilterExpression: { grantType: 'SHOP_APPROVAL', shopId: { $type: 'objectId' } } },
);
export default mongoose.model('RequestAccessGrant', grantSchema);
