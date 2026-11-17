import { Router } from 'express';
import { downloadInvoicePdf, getInvoiceCreditNote, reissueInvoice, voidInvoice } from '../controllers/invoiceController.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
router.use(requireAuth, requireRoles('CUSTOMER', 'ELECTRICIAN', 'SHOP_OWNER', 'ADMIN'));
router.get('/:id/pdf', asyncHandler(downloadInvoicePdf));
router.post('/:id/void', requireRoles('SHOP_OWNER', 'ADMIN'), asyncHandler(voidInvoice));
router.post('/:id/reissue', requireRoles('SHOP_OWNER', 'ADMIN'), asyncHandler(reissueInvoice));
router.post('/:id/credit-note', requireRoles('SHOP_OWNER', 'ADMIN'), asyncHandler(getInvoiceCreditNote));
router.get('/:id/credit-note', requireRoles('SHOP_OWNER', 'ADMIN', 'CUSTOMER'), asyncHandler(getInvoiceCreditNote));
export default router;
