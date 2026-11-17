import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema({
  line1: { type: String, trim: true, maxlength: 160 },
  line2: { type: String, trim: true, maxlength: 160 },
  area: { type: String, trim: true, maxlength: 100 },
  city: { type: String, trim: true, maxlength: 100 },
  state: { type: String, trim: true, maxlength: 100 },
  pincode: { type: String, trim: true, maxlength: 12 },
  country: { type: String, default: 'India', trim: true, maxlength: 80 },
}, { _id: false });

const houseSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  createdByElectricianId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  houseName: { type: String, required: true, trim: true, maxlength: 120 },
  address: { type: addressSchema, required: true },
  notes: { type: String, trim: true, maxlength: 1000 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true, versionKey: false });

houseSchema.index({ customerId: 1, createdAt: -1 });
export default mongoose.model('House', houseSchema);
