import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema({
  createdByElectricianId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  linkedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  phone: { type: String, required: true, trim: true, maxlength: 20 },
  email: { type: String, trim: true, lowercase: true, maxlength: 160 },
  notes: { type: String, trim: true, maxlength: 1000 },
}, { timestamps: true, versionKey: false });

customerSchema.index({ createdByElectricianId: 1, phone: 1 });
export default mongoose.model('Customer', customerSchema);
