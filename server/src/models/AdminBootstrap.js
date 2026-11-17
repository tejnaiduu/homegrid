import mongoose from 'mongoose';

const adminBootstrapSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  completedAt: { type: Date, default: Date.now },
}, { versionKey: false });

export default mongoose.model('AdminBootstrap', adminBootstrapSchema);
