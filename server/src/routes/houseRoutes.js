import { Router } from 'express';
import { createHouse, listHouses } from '../controllers/houseController.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
router.use(requireAuth, requireRoles('ELECTRICIAN'));
router.route('/').get(asyncHandler(listHouses)).post(asyncHandler(createHouse));
export default router;
