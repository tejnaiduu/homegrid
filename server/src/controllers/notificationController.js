import mongoose from 'mongoose';
import Notification from '../models/Notification.js';
import { ApiError } from '../utils/ApiError.js';

export async function listNotifications(req, res) {
  const notifications = await Notification.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(100);
  res.json({ success: true, data: { notifications } });
}

export async function markNotificationRead(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid notification identifier.');
  const notification = await Notification.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, { $set: { isRead: true } }, { new: true });
  if (!notification) throw new ApiError(404, 'Notification not found.');
  res.json({ success: true, data: { notification } });
}