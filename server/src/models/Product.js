import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  sku: { type: String, trim: true, uppercase: true, maxlength: 60 },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  category: { type: String, required: true, trim: true, uppercase: true, maxlength: 80 },
  brand: { type: String, trim: true, maxlength: 100 },
  specifications: { type: mongoose.Schema.Types.Mixed, default: {} },
  unit: {
    type: String,
    required: true,
    enum: ['PCS', 'METRE', 'ROLL', 'BOX', 'SET', 'KG', 'LITRE', 'OTHER'],
  },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, versionKey: false });

productSchema.index({ sku: 1 }, { unique: true, sparse: true });
productSchema.index({ name: 'text', brand: 'text', category: 'text' });
productSchema.index({ category: 1, isActive: 1 });
export default mongoose.model('Product', productSchema);
