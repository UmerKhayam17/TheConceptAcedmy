const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const Notification = require('../models/Notification');
const { formatNotification } = require('../services/realtime/realtimeService');
const { saveDeviceToken, removeDeviceToken } = require('../services/pushService');

const list = catchAsync(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const unreadOnly = req.query.unread === '1' || req.query.unread === 'true';
  const filter = { userId: req.user._id };
  if (unreadOnly) filter.read = false;

  const [items, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(limit),
    Notification.countDocuments({ userId: req.user._id, read: false }),
  ]);

  res.json({
    success: true,
    data: items.map(formatNotification),
    unreadCount,
  });
});

const markRead = catchAsync(async (req, res) => {
  const doc = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { $set: { read: true, readAt: new Date() } },
    { new: true }
  );
  if (!doc) throw new ApiError(404, 'Notification not found');
  res.json({ success: true, data: formatNotification(doc) });
});

const markAllRead = catchAsync(async (req, res) => {
  const result = await Notification.updateMany(
    { userId: req.user._id, read: false },
    { $set: { read: true, readAt: new Date() } }
  );
  res.json({ success: true, data: { updated: result.modifiedCount } });
});

/** The Android app saves this phone's push token after sign-in (phone notification bar). */
const readToken = (req) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (token && (token.length > 4096 || /\s/.test(token))) throw new ApiError(400, 'Invalid device token');
  return token;
};

const registerDevice = catchAsync(async (req, res) => {
  const token = readToken(req);
  if (!token) throw new ApiError(400, 'Device token is required');
  await saveDeviceToken(req.user._id, token);
  res.json({ success: true });
});

const unregisterDevice = catchAsync(async (req, res) => {
  await removeDeviceToken(req.user._id, readToken(req) || null);
  res.json({ success: true });
});

module.exports = { list, markRead, markAllRead, registerDevice, unregisterDevice };
