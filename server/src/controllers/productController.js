import Product from '../models/Product.js';
import AuditLog from '../models/AuditLog.js';
import { ApiError } from '../utils/ApiError.js';

export async function listProducts(req, res) {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
  const filter = { isActive: true };
  if (req.query.category) filter.category = String(req.query.category).toUpperCase();
  if (req.query.q) filter.$text = { $search: String(req.query.q) };

  const [items, total] = await Promise.all([
    Product.find(filter).sort({ category: 1, name: 1 }).skip((page - 1) * limit).limit(limit),
    Product.countDocuments(filter),
  ]);

  res.json({ success: true, data: { items, page, limit, total, pages: Math.ceil(total / limit) } });
}

export async function createProduct(req, res) {
  const { name, category, brand, specifications, unit, sku } = req.body;
  if (!name || !category || !unit) throw new ApiError(400, 'Name, category and unit are required.');

  const product = await Product.create({
    name, category, brand, specifications: specifications || {}, unit, sku, createdBy: req.user._id,
  });
  await AuditLog.create({ performedBy: req.user._id, action: 'PRODUCT_CREATED', entityType: 'Product', entityId: product._id, newData: { name: product.name, category: product.category, brand: product.brand, unit: product.unit, sku: product.sku }, ipAddress: req.ip });
  res.status(201).json({ success: true, data: { product } });
}
