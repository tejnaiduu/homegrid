import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { env } from './config/env.js';
import authRoutes from './routes/authRoutes.js';
import productRoutes from './routes/productRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import houseRoutes from './routes/houseRoutes.js';
import requestRoutes from './routes/requestRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import shopRoutes from './routes/shopRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import invoiceRoutes from './routes/invoiceRoutes.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import './models/index.js';

const app = express();
const allowedOrigins = new Set(env.clientUrls);

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());
if (env.nodeEnv !== 'test') {
  // QR tokens are bearer credentials; never write their raw URL path to access logs.
  app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev', {
    skip: (req) => req.path.startsWith('/api/v1/requests/public/access/'),
  }));
}

app.get('/api/v1/health', (_req, res) => {
  res.json({ success: true, message: 'Electrical platform API is running.' });
});
app.get('/api/v1/health/ready', (_req, res) => {
  const readyState = mongoose.connection.readyState;
  const stateName = ['disconnected', 'connected', 'connecting', 'disconnecting'][readyState] || 'unknown';
  const ready = readyState === 1;
  res.status(ready ? 200 : 503).json({
    success: ready,
    database: ready ? 'connected' : 'unavailable',
    state: stateName,
    readyState,
    details: ready
      ? 'MongoDB connection active.'
      : 'MongoDB is not connected. Check MONGODB_URI and the database service status.',
  });
});
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/customers', customerRoutes);
app.use('/api/v1/houses', houseRoutes);
app.use('/api/v1/requests', requestRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/shop', shopRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/invoices', invoiceRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
