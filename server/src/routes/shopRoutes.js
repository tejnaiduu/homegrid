import { Router } from 'express';
import { createBranch, createInventoryItem, getMyShop, listBranches, listInventory, listLowStock, listInventoryMovements, upsertMyShop, changeInventoryStock, lookupMaterialRequest, listMyShopOrders, listShopReturnRequests, decideShopReturnRequest, requestMaterialAccess, createShopOrder, fulfilShopOrder, cancelShopOrder } from '../controllers/shopController.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
router.use(requireAuth, requireRoles('SHOP_OWNER'));
router.route('/profile').get(asyncHandler(getMyShop)).put(asyncHandler(upsertMyShop));
router.route('/branches').get(asyncHandler(listBranches)).post(asyncHandler(createBranch));
router.get('/inventory', asyncHandler(listInventory));
router.get('/inventory/low-stock', asyncHandler(listLowStock));
router.get('/inventory/movements', asyncHandler(listInventoryMovements));
router.get('/returns', asyncHandler(listShopReturnRequests));
router.post('/returns/:id/decision', asyncHandler(decideShopReturnRequest));
router.post('/inventory', asyncHandler(createInventoryItem));
router.post('/inventory/:id/stock', asyncHandler(changeInventoryStock));
router.get('/requests/:requestCode', asyncHandler(lookupMaterialRequest));
router.post('/requests/:requestCode/access-request', asyncHandler(requestMaterialAccess));
router.post('/requests/:requestCode/orders', asyncHandler(createShopOrder));
router.get('/orders', asyncHandler(listMyShopOrders));
router.post('/orders/:id/fulfil', asyncHandler(fulfilShopOrder));
router.post('/orders/:id/cancel', asyncHandler(cancelShopOrder));

export default router;