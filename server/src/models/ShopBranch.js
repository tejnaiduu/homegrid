import mongoose from 'mongoose';

const shopBranchSchema = new mongoose.Schema({
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
  branchName: { type: String, required: true, trim: true, maxlength: 120 },
  phone: { type: String, trim: true, maxlength: 20 },
  address: {
    line1: String,
    area: String,
    city: String,
    state: String,
    pincode: String,
    country: { type: String, default: 'India' },
  },
  // GeoJSON coordinates are [longitude, latitude]. Optional until location sharing is implemented.
  location: {
    type: { type: String, enum: ['Point'] },
    coordinates: { type: [Number], validate: (v) => !v || v.length === 2 },
  },
  isActive: { type: Boolean, default: true },
}, { timestamps: true, versionKey: false });

shopBranchSchema.index({ location: '2dsphere' });
shopBranchSchema.index({ shopId: 1, isActive: 1 });
export default mongoose.model('ShopBranch', shopBranchSchema);
