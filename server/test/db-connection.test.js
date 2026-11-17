import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const { connectDatabase } = await import('../src/config/db.js');

test('connectDatabase surfaces a helpful MongoDB error when the connection fails', async () => {
  const originalConnect = mongoose.connect;
  mongoose.connect = async () => {
    throw new Error('connect ECONNREFUSED 127.0.0.1:27017');
  };

  try {
    await assert.rejects(connectDatabase(), /MongoDB connection failed|MONGODB_URI|reachable/i);
  } finally {
    mongoose.connect = originalConnect;
  }
});
