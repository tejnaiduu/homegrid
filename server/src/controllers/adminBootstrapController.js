import { timingSafeEqual } from 'node:crypto';
import mongoose from 'mongoose';
import AdminBootstrap from '../models/AdminBootstrap.js';
import User from '../models/User.js';
import { env } from '../config/env.js';
import { createSession } from './authController.js';
import { ApiError } from '../utils/ApiError.js';

const BOOTSTRAP_ID = 'initial-admin';
const SETUP_UNAVAILABLE_MESSAGE = 'Admin setup is unavailable or has already been completed.';

function hasValidSetupToken(candidate) {
  const expected = Buffer.from(env.adminBootstrapToken || '');
  const received = Buffer.from(typeof candidate === 'string' ? candidate : '');
  return expected.length >= 32
    && received.length === expected.length
    && timingSafeEqual(received, expected);
}

async function isSetupAvailable() {
  if (!env.adminBootstrapToken) return false;
  const [admin, completedSetup] = await Promise.all([
    User.exists({ roles: 'ADMIN' }),
    AdminBootstrap.exists({ _id: BOOTSTRAP_ID }),
  ]);
  return !admin && !completedSetup;
}

export async function getAdminSetupStatus(_req, res) {
  res.json({ success: true, data: { available: await isSetupAvailable() } });
}

export async function bootstrapAdmin(req, res) {
  const body = req.body || {};
  if (!hasValidSetupToken(body.setupToken)) {
    throw new ApiError(403, 'The setup key is invalid or admin setup is unavailable.');
  }

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase() || undefined;
  const phone = String(body.phone || '').trim() || undefined;
  const password = String(body.password || '');

  if (!name || name.length < 2 || name.length > 100 || (!email && !phone)) {
    throw new ApiError(400, 'Enter a name and at least one email address or phone number.');
  }
  if (email && email.length > 160) throw new ApiError(400, 'Email address is too long.');
  if (phone && phone.length > 20) throw new ApiError(400, 'Phone number is too long.');
  if (password.length < 12) throw new ApiError(400, 'Admin password must contain at least 12 characters.');

  await AdminBootstrap.init();
  const session = await mongoose.startSession();
  let user;

  try {
    await session.withTransaction(async () => {
      const [admin, completedSetup] = await Promise.all([
        User.exists({ roles: 'ADMIN' }).session(session),
        AdminBootstrap.exists({ _id: BOOTSTRAP_ID }).session(session),
      ]);
      if (admin || completedSetup) throw new ApiError(410, SETUP_UNAVAILABLE_MESSAGE);

      await AdminBootstrap.create([{ _id: BOOTSTRAP_ID }], { session });
      [user] = await User.create([{
        name,
        email,
        phone,
        passwordHash: await User.hashPassword(password),
        roles: ['ADMIN'],
      }], { session });
    });
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?._id) {
      throw new ApiError(410, SETUP_UNAVAILABLE_MESSAGE);
    }
    throw error;
  } finally {
    await session.endSession();
  }

  res.status(201).json({
    success: true,
    message: 'Administrator account created.',
    data: { user: createSession(user, res) },
  });
}
