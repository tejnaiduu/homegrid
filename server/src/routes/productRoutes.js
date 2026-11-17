import { Router } from 'express';
import { createProduct, listProducts } from '../controllers/productController.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
router.get('/', asyncHandler(listProducts));
router.post('/', requireAuth, requireRoles('ADMIN'), asyncHandler(createProduct));
export default router;
