import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';
import { register, login, logout, refreshSession, getCurrentUser, updateCurrentUser } from '../controllers/authController.js';
import { getAdminSetupStatus, bootstrapAdmin } from '../controllers/adminBootstrapController.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.nodeEnv === 'test' ? 200 : 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many authentication attempts. Please try again later.' },
});

router.post('/register', authLimiter, asyncHandler(register));
router.post('/login', authLimiter, asyncHandler(login));
router.get('/admin-setup/status', authLimiter, asyncHandler(getAdminSetupStatus));
router.post('/admin-setup', authLimiter, asyncHandler(bootstrapAdmin));
router.post('/logout', asyncHandler(logout));
router.post('/refresh', requireAuth, asyncHandler(refreshSession));
router.get('/me', requireAuth, asyncHandler(getCurrentUser));
router.patch('/me', requireAuth, asyncHandler(updateCurrentUser));

export default router;
