import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const requireAuth = asyncHandler(async (req, _res, next) => {
  const cookieToken = req.cookies?.[env.cookieName];
  const header = req.headers.authorization;
  const bearerToken = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const token = cookieToken || bearerToken;

  if (!token) throw new ApiError(401, 'Please log in to continue.');

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw new ApiError(401, 'Your session is invalid or has expired. Please log in again.');
  }

  const user = await User.findById(payload.sub).select('_id name email phone roles accountStatus');
  if (!user || user.accountStatus !== 'ACTIVE') {
    throw new ApiError(401, 'This account is unavailable.');
  }

  req.user = user;
  next();
});

export function requireRoles(...allowedRoles) {
  return (req, _res, next) => {
    const hasRole = req.user?.roles?.some((role) => allowedRoles.includes(role));
    if (!hasRole) return next(new ApiError(403, 'You do not have permission to perform this action.'));
    next();
  };
}
