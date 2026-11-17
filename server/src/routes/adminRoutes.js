import { Router } from 'express';
import { getOverview, getReports, listUsers, updateUserStatus, listShops, updateShopVerification, listOrders, listInvoices, listAuditLogs } from '../controllers/adminController.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
router.use(requireAuth, requireRoles('ADMIN'));
router.get('/overview', asyncHandler(getOverview));
router.get('/reports', asyncHandler(getReports));
router.get('/users', asyncHandler(listUsers));
router.patch('/users/:id/status', asyncHandler(updateUserStatus));
router.get('/shops', asyncHandler(listShops));
router.patch('/shops/:id/verification', asyncHandler(updateShopVerification));
router.get('/orders', asyncHandler(listOrders));
router.get('/invoices', asyncHandler(listInvoices));
router.get('/audit-logs', asyncHandler(listAuditLogs));

export default router;