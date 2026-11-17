import mongoose from 'mongoose';

const shopSchema = new mongoose.Schema({
  ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  businessName: { type: String, required: true, trim: true, maxlength: 160 },
  gstNumber: { type: String, trim: true, uppercase: true, maxlength: 20 },
  contactPhone: { type: String, trim: true, maxlength: 20 },
  verificationStatus: { type: String, enum: ['PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED'], default: 'PENDING' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true, versionKey: false });

shopSchema.index({ businessName: 'text' });
export default mongoose.model('Shop', shopSchema);
