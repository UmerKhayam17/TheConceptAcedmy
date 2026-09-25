const User = require('../models/User');
const { createNotificationForUser } = require('./realtime/realtimeService');

function absencesBody({ studentName, className, sectionName, date }) {
  const where = [className, sectionName].filter(Boolean).join(' / ') || 'class';
  return {
    title: 'Absence alert',
    body: `${studentName || 'Your child'} was marked absent on ${date} (${where}).`,
  };
}

async function sendSms(phone, text) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from || !phone) {
    return { sent: false, channel: 'sms', reason: 'Twilio not configured or no phone' };
  }
  try {
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const body = new URLSearchParams({
      To: String(phone).startsWith('+') ? String(phone) : `+${phone}`,
      From: from,
      Body: text,
    });
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      }
    );
    if (!res.ok) {
      const errText = await res.text();
      return { sent: false, channel: 'sms', reason: errText.slice(0, 200) };
    }
    return { sent: true, channel: 'sms' };
  } catch (err) {
    return { sent: false, channel: 'sms', reason: err.message };
  }
}

async function sendEmail(to, subject, text) {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT || 587);
  if (!host || !user || !pass || !to) {
    return { sent: false, channel: 'email', reason: 'SMTP not configured or no recipient' };
  }
  try {
    // Prefer nodemailer when installed; otherwise skip silently
    let nodemailer;
    try {
      // eslint-disable-next-line global-require, import/no-extraneous-dependencies
      nodemailer = require('nodemailer');
    } catch {
      return { sent: false, channel: 'email', reason: 'nodemailer not installed' };
    }
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    const from = process.env.SMTP_FROM || user;
    await transporter.sendMail({ from, to, subject, text });
    return { sent: true, channel: 'email' };
  } catch (err) {
    return { sent: false, channel: 'email', reason: err.message };
  }
}

async function sendFcm(fcmToken, title, body) {
  if (!fcmToken) {
    return { sent: false, channel: 'fcm', reason: 'No FCM token' };
  }
  const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!saPath) {
    return { sent: false, channel: 'fcm', reason: 'FIREBASE_SERVICE_ACCOUNT_PATH not set' };
  }
  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      // eslint-disable-next-line import/no-dynamic-require, global-require
      const serviceAccount = require(require('path').resolve(saPath));
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    await admin.messaging().send({
      token: fcmToken,
      notification: { title, body },
    });
    return { sent: true, channel: 'fcm' };
  } catch (err) {
    return { sent: false, channel: 'fcm', reason: err.message };
  }
}

async function sendAttendanceAbsentNotification({
  studentName,
  className,
  sectionName,
  date,
  parentUserId,
}) {
  const { title, body } = absencesBody({ studentName, className, sectionName, date });
  const results = [];

  if (parentUserId) {
    try {
      await createNotificationForUser(parentUserId, {
        type: 'attendance_absent',
        title,
        body,
        path: '/attendance',
        moduleKey: 'attendance',
        resource: 'attendance',
        meta: { studentName, className, sectionName, date },
      });
      results.push({ sent: true, channel: 'in_app' });
    } catch (err) {
      results.push({ sent: false, channel: 'in_app', reason: err.message });
    }

    const parent = await User.findById(parentUserId).select('email phone fcmToken').lean();
    if (parent) {
      results.push(await sendSms(parent.phone, `${title}: ${body}`));
      results.push(await sendEmail(parent.email, title, body));
      results.push(await sendFcm(parent.fcmToken, title, body));
    }
  } else {
    results.push({ sent: false, channel: 'in_app', reason: 'No parentUserId' });
  }

  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.log('[notification] Absent delivery:', { studentName, date, results });
  }
  return results;
}

async function sendGenericPush(userId, title, body) {
  const results = [];
  if (userId) {
    try {
      await createNotificationForUser(userId, {
        type: 'generic',
        title,
        body,
      });
      results.push({ sent: true, channel: 'in_app' });
    } catch (err) {
      results.push({ sent: false, channel: 'in_app', reason: err.message });
    }
    const user = await User.findById(userId).select('email phone fcmToken').lean();
    if (user) {
      results.push(await sendSms(user.phone, `${title}: ${body}`));
      results.push(await sendEmail(user.email, title, body));
      results.push(await sendFcm(user.fcmToken, title, body));
    }
  }
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.log('[notification] Push delivery:', { userId, title, results });
  }
  return results;
}

module.exports = { sendAttendanceAbsentNotification, sendGenericPush };
