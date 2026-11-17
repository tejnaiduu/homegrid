import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDatabase() {
  mongoose.set('strictQuery', true);
  const mongoUri = process.env.MONGODB_URI || env.mongoUri;

  try {
    await mongoose.connect(mongoUri, {
      autoIndex: env.nodeEnv !== 'production',
    });
    console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const localHint = mongoUri?.includes('localhost') || mongoUri?.includes('127.0.0.1')
      ? 'Make sure MongoDB is running locally and the URI points to the right instance.'
      : 'Check that the MongoDB URI points to a reachable server, such as a local MongoDB instance or MongoDB Atlas.';
    throw new Error(`MongoDB connection failed: ${errorMessage}. ${localHint} Verify the MONGODB_URI value in server/.env before retrying.`);
  }
}
