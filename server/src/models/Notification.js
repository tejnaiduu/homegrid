import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, required: true, trim: true, maxlength: 60 },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  message: { type: String, required: true, trim: true, maxlength: 500 },
  relatedRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'MaterialRequest', default: null, index: true },
  relatedOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShopOrder', default: null },
  isRead: { type: Boolean, default: false, index: true },
}, { timestamps: true, versionKey: false });

notificationSchema.index({ userId: 1, createdAt: -1 });
export default mongoose.model('Notification', notificationSchema);
