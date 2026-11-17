import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Customer from '../models/Customer.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

const PUBLIC_ROLES = ['CUSTOMER', 'ELECTRICIAN', 'SHOP_OWNER'];

function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

function safeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    roles: user.roles,
    accountStatus: user.accountStatus,
  };
}

export function createSession(user, res) {
  const token = jwt.sign({ sub: user._id.toString(), roles: user.roles }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
  res.cookie(env.cookieName, token, cookieOptions());
  return safeUser(user);
}

export async function register(req, res) {
  const { name, phone, email, password, role } = req.body;
  const normalizedRole = String(role || '').toUpperCase();

  if (!name || (!phone && !email) || !password || !normalizedRole) {
    throw new ApiError(400, 'Name, phone or email, password and role are required.');
  }
  if (!PUBLIC_ROLES.includes(normalizedRole)) {
    throw new ApiError(400, 'Select a valid public account role.');
  }
  if (String(password).length < 8) {
    throw new ApiError(400, 'Password must contain at least 8 characters.');
  }

  const user = await User.create({
    name,
    phone: phone || undefined,
    email: email || undefined,
    passwordHash: await User.hashPassword(password),
    roles: [normalizedRole],
  });

  if (normalizedRole === 'CUSTOMER') {
    const customerQuery = [];
    if (email) customerQuery.push({ email: String(email).trim().toLowerCase() });
    if (phone) customerQuery.push({ phone: String(phone).trim() });
    if (customerQuery.length) {
      await Customer.updateMany(
        { linkedUserId: null, $or: customerQuery },
        { $set: { linkedUserId: user._id } },
      );
    }
  }

  res.status(201).json({ success: true, message: 'Account created.', data: { user: createSession(user, res) } });
}

export async function login(req, res) {
  const { identifier, password } = req.body;
  if (!identifier || !password) throw new ApiError(400, 'Enter your phone/email and password.');

  const query = String(identifier).includes('@')
    ? { email: String(identifier).trim().toLowerCase() }
    : { phone: String(identifier).trim() };

  const user = await User.findOne(query).select('+passwordHash');
  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, 'Invalid login details.');
  }
  if (user.accountStatus !== 'ACTIVE') throw new ApiError(403, 'This account is not active.');

  user.lastLoginAt = new Date();
  await user.save();
  res.json({ success: true, message: 'Logged in.', data: { user: createSession(user, res) } });
}

export async function logout(_req, res) {
  res.clearCookie(env.cookieName, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    path: '/',
  });
  res.json({ success: true, message: 'Logged out.' });
}

export async function refreshSession(req, res) {
  res.json({ success: true, message: 'Session refreshed.', data: { user: createSession(req.user, res) } });
}

export async function getCurrentUser(req, res) {
  res.json({ success: true, data: { user: safeUser(req.user) } });
}

export async function updateCurrentUser(req, res) {
  const allowedFields = ['name', 'phone', 'email'];
  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) updates[field] = String(req.body[field]).trim() || undefined;
  }
  if (updates.name !== undefined && updates.name.length < 2) throw new ApiError(400, 'Name must contain at least 2 characters.');
  if (updates.email !== undefined) updates.email = updates.email.toLowerCase();
  if (updates.phone === undefined && updates.email === undefined && updates.name === undefined) {
    throw new ApiError(400, 'Provide at least one profile field to update.');
  }
  const user = await User.findByIdAndUpdate(req.user._id, { $set: updates }, { new: true, runValidators: true });
  if (!user) throw new ApiError(404, 'User account not found.');
  res.json({ success: true, message: 'Profile updated.', data: { user: safeUser(user) } });
}
