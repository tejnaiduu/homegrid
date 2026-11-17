import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDatabase } from '../config/db.js';
import Product from '../models/Product.js';
import '../models/index.js';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });

const products = [
  { sku: 'WIRE-CU-15', name: 'Copper Electrical Wire 1.5mm', category: 'WIRES', brand: 'Generic', unit: 'METRE', specifications: { material: 'Copper', size: '1.5mm' } },
  { sku: 'SWITCH-6A-1W', name: '6A One-Way Modular Switch', category: 'SWITCHES', brand: 'Generic', unit: 'PCS', specifications: { rating: '6A', type: 'One-way', modules: 1 } },
  { sku: 'LED-BULB-9W', name: 'LED Bulb 9W', category: 'LIGHTING', brand: 'Generic', unit: 'PCS', specifications: { wattage: '9W' } },
  { sku: 'FAN-CEILING-1200', name: 'Ceiling Fan 1200mm', category: 'FANS', brand: 'Generic', unit: 'PCS', specifications: { sweep: '1200mm' } },
  { sku: 'MCB-32A-SP', name: '32A Single Pole MCB', category: 'PROTECTION', brand: 'Generic', unit: 'PCS', specifications: { rating: '32A', poles: 1 } },
];

try {
  await connectDatabase();
  for (const product of products) {
    await Product.updateOne({ sku: product.sku }, { $setOnInsert: product }, { upsert: true });
  }
  console.log(`Catalogue seed complete (${products.length} starter products).`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
