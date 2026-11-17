import mongoose from 'mongoose';

export async function runWithOptionalTransaction(work) {
  const session = await mongoose.startSession();
  try {
    try {
      await session.withTransaction(async () => {
        await work(session);
      });
      return;
    } catch (error) {
      if (!error || (error.code !== 20 && error.codeName !== 'IllegalOperation')) {
        throw error;
      }
      await work(session);
    }
  } finally {
    await session.endSession();
  }
}
