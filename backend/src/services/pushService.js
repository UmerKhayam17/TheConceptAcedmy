/**
 * Phone push notifications (Firebase Cloud Messaging) for the Android app.
 *
 * Every in-app notification (the bell) is also sent to the user's phone, so it shows in the
 * phone's notification bar even when the app is closed. The phone's FCM token is saved by the
 * app after sign-in (POST /notifications/device-token) and removed on logout.
 *
 * Server setup (either one):
 *   FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/firebase-key.json   (key file from Firebase console)
 *   FIREBASE_SERVICE_ACCOUNT_JSON={...}                        (the same JSON inline)
 * Without it, push is skipped and the in-app notifications keep working as before.
 */
const path = require('path');
const User = require('../models/User');

/** Must match PUSH_CHANNEL_ID in frontend/src/lib/pushNotifications.ts */
const ANDROID_CHANNEL_ID = 'tca_alerts';

let messaging; // undefined = not tried yet, null = not configured
let warned = false;

function getMessaging() {
  if (messaging !== undefined) return messaging;
  messaging = null;
  try {
    let serviceAccount = null;
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      serviceAccount = require(path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH));
    }
    if (!serviceAccount) {
      if (!warned) {
        warned = true;
        console.warn('[push] Firebase key not set (FIREBASE_SERVICE_ACCOUNT_PATH) - phone push disabled');
      }
      return messaging;
    }
    const admin = require('firebase-admin');
    const app = admin.apps.length
      ? admin.app()
      : admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    messaging = admin.messaging(app);
  } catch (err) {
    console.error('[push] Firebase init failed:', err.message);
    messaging = null;
  }
  return messaging;
}

/** Tokens Firebase says are dead (app uninstalled, data cleared, ...). */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

const clip = (value, max) => {
  const s = String(value ?? '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

/**
 * Send one notification to a user's phone. Never throws.
 * @param {string} userId
 * @param {{ _id?: unknown, title: string, body?: string, path?: string, type?: string,
 *           moduleKey?: string, resource?: string, resourceId?: string }} notification
 */
async function sendPushToUser(userId, notification) {
  const fcm = getMessaging();
  if (!fcm || !userId) return { sent: false, channel: 'fcm', reason: 'not configured' };
  try {
    const user = await User.findById(userId).select('fcmToken isActive').lean();
    const token = user?.fcmToken;
    if (!token || user.isActive === false) return { sent: false, channel: 'fcm', reason: 'No FCM token' };

    const id = notification._id ? String(notification._id) : '';
    await fcm.send({
      token,
      notification: {
        title: clip(notification.title, 120),
        body: clip(notification.body, 400),
      },
      // Used by the app to open the right screen when the notification is tapped.
      data: {
        notificationId: id,
        path: String(notification.path || ''),
        type: String(notification.type || ''),
        moduleKey: String(notification.moduleKey || ''),
        resource: String(notification.resource || ''),
        resourceId: String(notification.resourceId || ''),
        title: clip(notification.title, 120),
      },
      android: {
        priority: 'high',
        notification: {
          channelId: ANDROID_CHANNEL_ID,
          sound: 'default',
          ...(id ? { tag: id } : {}),
        },
      },
    });
    return { sent: true, channel: 'fcm' };
  } catch (err) {
    if (DEAD_TOKEN_CODES.has(err?.code)) {
      await User.updateOne({ _id: userId }, { $unset: { fcmToken: 1 } }).catch(() => {});
    } else {
      console.error('[push] send failed:', err?.code || '', err?.message);
    }
    return { sent: false, channel: 'fcm', reason: err?.message };
  }
}

/** Save this phone's token for the user (and take it away from anyone who used the phone before). */
async function saveDeviceToken(userId, token) {
  await User.updateMany({ fcmToken: token, _id: { $ne: userId } }, { $unset: { fcmToken: 1 } });
  await User.updateOne({ _id: userId }, { $set: { fcmToken: token } });
}

async function removeDeviceToken(userId, token) {
  const filter = token ? { _id: userId, fcmToken: token } : { _id: userId };
  await User.updateOne(filter, { $unset: { fcmToken: 1 } });
}

module.exports = { sendPushToUser, saveDeviceToken, removeDeviceToken, ANDROID_CHANNEL_ID };
