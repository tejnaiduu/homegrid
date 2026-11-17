import { Router } from 'express';
import { createCustomer, listCustomers } from '../controllers/customerController.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
router.use(requireAuth, requireRoles('ELECTRICIAN'));
router.route('/').get(asyncHandler(listCustomers)).post(asyncHandler(createCustomer));
export default router;
