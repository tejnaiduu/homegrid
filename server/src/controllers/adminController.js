import User from '../models/User.js';
import Customer from '../models/Customer.js';
import Shop from '../models/Shop.js';
import Product from '../models/Product.js';
import MaterialRequest from '../models/MaterialRequest.js';
import ShopOrder from '../models/ShopOrder.js';
import Invoice from '../models/Invoice.js';
import { ApiError } from '../utils/ApiError.js';
import AuditLog from '../models/AuditLog.js';

const USER_PROJECTION = '_id name email phone roles accountStatus createdAt lastLoginAt';
const ACCOUNT_STATUSES = ['ACTIVE', 'PENDING', 'SUSPENDED'];

export async function getOverview(_req, res) {
  const [
    totalUsers,
    customers,
    electricians,
    shops,
    verifiedShops,
    pendingShops,
    activeRequests,
    completedRequests,
    orders,
    invoices,
    sales,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ roles: 'CUSTOMER' }),
    User.countDocuments({ roles: 'ELECTRICIAN' }),
    Shop.countDocuments(),
    Shop.countDocuments({ verificationStatus: 'VERIFIED', isActive: true }),
    Shop.countDocuments({ verificationStatus: 'PENDING' }),
    MaterialRequest.countDocuments({ status: { $in: ['OPEN', 'PARTIALLY_FULFILLED'] } }),
    MaterialRequest.countDocuments({ status: 'FULFILLED' }),
    ShopOrder.countDocuments(),
    Invoice.countDocuments({ status: 'ISSUED' }),
    Invoice.aggregate([
      { $match: { status: 'ISSUED' } },
      { $group: { _id: null, totalPaise: { $sum: '$totalPaise' } } },
    ]),
  ]);

  res.json({
    success: true,
    data: {
      totals: {
        users: totalUsers,
        customers,
        electricians,
        shops,
        verifiedShops,
        pendingShops,
        activeRequests,
        completedRequests,
        orders,
        invoices,
        salesPaise: sales[0]?.totalPaise || 0,
      },
    },
  });
}

export async function getReports(req, res) {
  const days = Math.max(1, Math.min(Number.parseInt(req.query.days, 10) || 30, 365));
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  const [salesByDay, requestStatusBreakdown, invoiceStatusBreakdown, recentInvoices, totalSales] = await Promise.all([
    Invoice.aggregate([
      { $match: { status: 'ISSUED', issuedAt: { $gte: start } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$issuedAt' } }, totalPaise: { $sum: '$totalPaise' }, invoiceCount: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    MaterialRequest.aggregate([
      { $match: { createdAt: { $gte: start } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Invoice.aggregate([
      { $match: { issuedAt: { $gte: start } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Invoice.find({ issuedAt: { $gte: start } }).sort({ issuedAt: -1 }).limit(8).populate('shopId', 'businessName').populate('requestId', 'requestCode'),
    Invoice.aggregate([
      { $match: { status: 'ISSUED', issuedAt: { $gte: start } } },
      { $group: { _id: null, totalPaise: { $sum: '$totalPaise' }, invoiceCount: { $sum: 1 } } },
    ]),
  ]);

  const keyedSales = new Map(salesByDay.map((entry) => [entry._id, entry]));
  const salesByDayRange = [];
  for (let index = 0; index < days; index += 1) {
    const current = new Date(start);
    current.setDate(start.getDate() + index);
    const key = current.toISOString().slice(0, 10);
    const day = keyedSales.get(key) || { totalPaise: 0, invoiceCount: 0 };
    salesByDayRange.push({
      date: key,
      totalPaise: day.totalPaise || 0,
      invoiceCount: day.invoiceCount || 0,
    });
  }

  const totalSalesPaise = totalSales[0]?.totalPaise || 0;
  const invoiceCount = totalSales[0]?.invoiceCount || 0;

  res.json({
    success: true,
    data: {
      report: {
        rangeDays: days,
        totalSalesPaise,
        avgInvoiceValuePaise: invoiceCount ? Math.round(totalSalesPaise / invoiceCount) : 0,
        salesByDay: salesByDayRange,
        requestStatusBreakdown: requestStatusBreakdown.map((entry) => ({ status: entry._id || 'UNKNOWN', count: entry.count })),
        invoiceStatusBreakdown: invoiceStatusBreakdown.map((entry) => ({ status: entry._id || 'UNKNOWN', count: entry.count })),
        recentInvoices: recentInvoices.map((invoice) => ({
          _id: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          totalPaise: invoice.totalPaise,
          issuedAt: invoice.issuedAt,
          shopName: invoice.shopId?.businessName || 'Unknown shop',
          requestCode: invoice.requestId?.requestCode || '-',
        })),
      },
    },
  });
}

export async function listUsers(req, res) {
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
  const filter = {};
  const search = String(req.query.search || '').trim();
  const role = String(req.query.role || '').toUpperCase();
  const status = String(req.query.status || '').toUpperCase();

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
    ];
  }
  if (['CUSTOMER', 'ELECTRICIAN', 'SHOP_OWNER', 'ADMIN'].includes(role)) filter.roles = role;
  if (ACCOUNT_STATUSES.includes(status)) filter.accountStatus = status;

  const [users, total] = await Promise.all([
    User.find(filter).select(USER_PROJECTION).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments(filter),
  ]);

  res.json({ success: true, data: { users, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
}

export async function updateUserStatus(req, res) {
  const status = String(req.body.status || '').toUpperCase();
  if (!ACCOUNT_STATUSES.includes(status)) throw new ApiError(400, 'Select a valid account status.');
  const user = await User.findById(req.params.id).select(USER_PROJECTION);
  if (!user) throw new ApiError(404, 'User not found.');
  const previousStatus = user.accountStatus;
  if (user._id.equals(req.user._id) && status !== 'ACTIVE') {
    throw new ApiError(400, 'You cannot deactivate your own administrator account.');
  }
  if (user.roles.includes('ADMIN') && status !== 'ACTIVE') {
    const activeAdmins = await User.countDocuments({ roles: 'ADMIN', accountStatus: 'ACTIVE' });
    if (activeAdmins <= 1) throw new ApiError(400, 'The final active administrator cannot be deactivated.');
  }

  user.accountStatus = status;
  await user.save();
  await AuditLog.create({ performedBy: req.user._id, action: 'USER_STATUS_UPDATED', entityType: 'User', entityId: user._id, previousData: { accountStatus: previousStatus }, newData: { accountStatus: status }, ipAddress: req.ip });
  res.json({ success: true, message: 'User status updated.', data: { user } });
}

export async function listShops(req, res) {
  const status = String(req.query.status || '').toUpperCase();
  const filter = ['PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED'].includes(status) ? { verificationStatus: status } : {};
  const shops = await Shop.find(filter).populate('ownerUserId', 'name email phone accountStatus').sort({ createdAt: -1 }).limit(200);
  res.json({ success: true, data: { shops } });
}

export async function updateShopVerification(req, res) {
  const status = String(req.body.status || '').toUpperCase();
  if (!['VERIFIED', 'REJECTED', 'SUSPENDED', 'PENDING'].includes(status)) throw new ApiError(400, 'Select a valid shop verification status.');
  const previousShop = await Shop.findById(req.params.id).select('verificationStatus isActive');
  const shop = await Shop.findByIdAndUpdate(req.params.id, { $set: { verificationStatus: status, isActive: status !== 'SUSPENDED' && status !== 'REJECTED' } }, { new: true, runValidators: true });
  if (!shop) throw new ApiError(404, 'Shop not found.');
  await AuditLog.create({ performedBy: req.user._id, action: 'SHOP_VERIFICATION_UPDATED', entityType: 'Shop', entityId: shop._id, previousData: previousShop, newData: { verificationStatus: shop.verificationStatus, isActive: shop.isActive }, ipAddress: req.ip });
  res.json({ success: true, message: 'Shop verification status updated.', data: { shop } });
}

export async function listOrders(req, res) {
  const filter = {};
  if (['SUBMITTED', 'ACCEPTED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED'].includes(String(req.query.status).toUpperCase())) filter.status = String(req.query.status).toUpperCase();
  const orders = await ShopOrder.find(filter).sort({ createdAt: -1 }).limit(200).populate('shopId', 'businessName').populate('requestId', 'requestCode');
  res.json({ success: true, data: { orders } });
}

export async function listAuditLogs(req, res) {
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 25, 1), 100);
  const [logs, total] = await Promise.all([
    AuditLog.find({}).populate('performedBy', 'name email phone').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    AuditLog.countDocuments(),
  ]);
  res.json({ success: true, data: { logs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
}

export async function listInvoices(req, res) {
  const status = String(req.query.status || '').toUpperCase();
  const filter = ['ISSUED', 'VOID'].includes(status) ? { status } : {};
  const invoices = await Invoice.find(filter).sort({ issuedAt: -1 }).limit(200).populate('shopId', 'businessName').populate('requestId', 'requestCode');
  res.json({ success: true, data: { invoices } });
}