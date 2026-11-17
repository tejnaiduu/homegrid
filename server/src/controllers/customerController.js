import Customer from '../models/Customer.js';
import User from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';

async function autoLinkCustomerUser(customerPayload) {
  const candidateEmail = customerPayload.email ? String(customerPayload.email).trim().toLowerCase() : null;
  const candidatePhone = customerPayload.phone ? String(customerPayload.phone).trim() : null;
  if (!candidateEmail && !candidatePhone) return null;

  const user = await User.findOne({
    roles: 'CUSTOMER',
    $or: [
      ...(candidateEmail ? [{ email: candidateEmail }] : []),
      ...(candidatePhone ? [{ phone: candidatePhone }] : []),
    ],
  }).select('_id roles');

  if (!user) return null;
  await Customer.findOneAndUpdate(
    { _id: customerPayload._id, linkedUserId: null },
    { $set: { linkedUserId: user._id } },
    { new: true },
  );
  return user._id;
}

export async function createCustomer(req, res) {
  const { name, phone, email, notes } = req.body;
  if (!name || !phone) throw new ApiError(400, 'Customer name and phone are required.');
  const customer = await Customer.create({
    createdByElectricianId: req.user._id,
    name,
    phone,
    email,
    notes,
  });
  await autoLinkCustomerUser(customer);
  res.status(201).json({ success: true, data: { customer } });
}

export async function listCustomers(req, res) {
  const customers = await Customer.find({ createdByElectricianId: req.user._id }).sort({ createdAt: -1 }).limit(100);
  res.json({ success: true, data: { customers } });
}
