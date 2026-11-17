import { Router } from 'express';
import {
  createMaterialRequest,
  listMyRequests,
  getRequestById,
  getRequestByCode,
  getRequestInvoices,
  getRequestPurchaseSummary,
  getRequestPurchases,
  listCustomerReturns,
  createCustomerReturn,
  listShopAccessRequests,
  decideShopAccess,
  revokeShopAccess,
  createCustomerQrAccess,
  getPublicRequestByToken,
} from '../controllers/requestController.js';
import { downloadPurchaseSummaryPdf } from '../controllers/invoiceController.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.get('/public/access/:token', asyncHandler(getPublicRequestByToken));
router.use(requireAuth);
router.get('/by-code/:requestCode', requireRoles('CUSTOMER', 'ELECTRICIAN', 'ADMIN'), asyncHandler(getRequestByCode));
router.route('/').get(requireRoles('CUSTOMER', 'ELECTRICIAN', 'ADMIN'), asyncHandler(listMyRequests));
router.post('/', requireRoles('ELECTRICIAN'), asyncHandler(createMaterialRequest));
router.post('/:id/customer-qr', requireRoles('ELECTRICIAN'), asyncHandler(createCustomerQrAccess));
router.get('/:id/purchase-summary/pdf', requireRoles('CUSTOMER', 'ELECTRICIAN', 'ADMIN'), asyncHandler(downloadPurchaseSummaryPdf));
router.get('/:id', requireRoles('CUSTOMER', 'ELECTRICIAN', 'ADMIN'), asyncHandler(getRequestById));
router.get('/:id/invoices', requireRoles('CUSTOMER', 'ELECTRICIAN', 'ADMIN'), asyncHandler(getRequestInvoices));
router.get('/:id/purchase-summary', requireRoles('CUSTOMER', 'ELECTRICIAN', 'ADMIN'), asyncHandler(getRequestPurchaseSummary));
router.get('/:id/purchases', requireRoles('CUSTOMER', 'ELECTRICIAN', 'ADMIN'), asyncHandler(getRequestPurchases));
router.route('/:id/returns').get(requireRoles('CUSTOMER'), asyncHandler(listCustomerReturns)).post(requireRoles('CUSTOMER'), asyncHandler(createCustomerReturn));
router.get('/:id/shop-access-requests', requireRoles('CUSTOMER'), asyncHandler(listShopAccessRequests));
router.post('/:id/shop-access/:shopId/decision', requireRoles('CUSTOMER'), asyncHandler(decideShopAccess));
router.delete('/:id/shop-access/:shopId', requireRoles('CUSTOMER'), asyncHandler(revokeShopAccess));

export default router;
