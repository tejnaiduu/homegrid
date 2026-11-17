import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  phone: { type: String, trim: true, maxlength: 20 },
  email: { type: String, trim: true, lowercase: true, maxlength: 160 },
  passwordHash: { type: String, required: true, select: false },
  roles: {
    type: [{ type: String, enum: ['CUSTOMER', 'ELECTRICIAN', 'SHOP_OWNER', 'ADMIN'] }],
    required: true,
    validate: [(values) => values.length > 0, 'At least one role is required.'],
  },
  phoneVerified: { type: Boolean, default: false },
  emailVerified: { type: Boolean, default: false },
  accountStatus: { type: String, enum: ['ACTIVE', 'PENDING', 'SUSPENDED'], default: 'ACTIVE' },
  lastLoginAt: Date,
}, { timestamps: true, versionKey: false });

userSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: 'string' } } });
userSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};

userSchema.statics.hashPassword = function hashPassword(password) {
  return bcrypt.hash(password, 12);
};

export default mongoose.model('User', userSchema);
