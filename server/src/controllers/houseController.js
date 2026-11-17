import Customer from '../models/Customer.js';
import House from '../models/House.js';
import { ApiError } from '../utils/ApiError.js';

export async function createHouse(req, res) {
  const { customerId, houseName, address, notes } = req.body;
  if (!customerId || !houseName || !address?.city) {
    throw new ApiError(400, 'Customer, house name and city are required.');
  }

  const customer = await Customer.findOne({ _id: customerId, createdByElectricianId: req.user._id });
  if (!customer) throw new ApiError(404, 'Customer not found in your customer list.');

  const house = await House.create({
    customerId,
    createdByElectricianId: req.user._id,
    houseName,
    address,
    notes,
  });
  res.status(201).json({ success: true, data: { house } });
}

export async function listHouses(req, res) {
  const filter = { createdByElectricianId: req.user._id, isActive: true };
  if (req.query.customerId) filter.customerId = req.query.customerId;
  const houses = await House.find(filter).sort({ createdAt: -1 }).limit(100);
  res.json({ success: true, data: { houses } });
}
