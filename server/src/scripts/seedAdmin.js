import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDatabase } from '../config/db.js';
import User from '../models/User.js';
import '../models/index.js';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });

const { ADMIN_NAME, ADMIN_PHONE, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

if (!ADMIN_NAME || (!ADMIN_PHONE && !ADMIN_EMAIL) || !ADMIN_PASSWORD) {
  throw new Error('Set ADMIN_NAME, ADMIN_PHONE or ADMIN_EMAIL, and ADMIN_PASSWORD in server/.env before running this script.');
}
if (ADMIN_PASSWORD.length < 8) throw new Error('ADMIN_PASSWORD must be at least 8 characters.');

try {
  await connectDatabase();
  const normalizedEmail = ADMIN_EMAIL ? ADMIN_EMAIL.toLowerCase() : undefined;
  const existing = await User.findOne({ $or: [
    ...(ADMIN_PHONE ? [{ phone: ADMIN_PHONE }] : []),
    ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
  ] });

  if (existing) {
    const updates = {};
    if (ADMIN_NAME && existing.name !== ADMIN_NAME) updates.name = ADMIN_NAME;
    if (ADMIN_PHONE && existing.phone !== ADMIN_PHONE) updates.phone = ADMIN_PHONE;
    if (normalizedEmail && existing.email !== normalizedEmail) updates.email = normalizedEmail;
    if (Object.keys(updates).length) {
      await User.updateOne({ _id: existing._id }, { $set: updates });
    }
    if (!existing.roles.includes('ADMIN')) {
      existing.roles.push('ADMIN');
      await existing.save();
    }
    console.log(`Admin account aligned for existing user ${existing._id}.`);
  } else {
    const admin = await User.create({
      name: ADMIN_NAME,
      phone: ADMIN_PHONE || undefined,
      email: normalizedEmail || undefined,
      passwordHash: await User.hashPassword(ADMIN_PASSWORD),
      roles: ['ADMIN'],
      phoneVerified: false,
      emailVerified: false,
    });
    console.log(`Admin created: ${admin._id}`);
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
