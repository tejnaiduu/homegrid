import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  action: { type: String, required: true, trim: true, maxlength: 80 },
  entityType: { type: String, required: true, trim: true, maxlength: 80 },
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  previousData: { type: mongoose.Schema.Types.Mixed, default: null },
  newData: { type: mongoose.Schema.Types.Mixed, default: null },
  ipAddress: { type: String, trim: true, maxlength: 80 },
}, { timestamps: true, versionKey: false });

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
export default mongoose.model('AuditLog', auditLogSchema);
