const Bull = require('bull');
const { sendAttendanceAbsentNotification } = require('../services/notificationService');
const { generateMonthlyFees } = require('../services/academy/academyFeeService');
const AcademyClass = require('../models/academy/AcademyClass');

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const attendanceNotifQueue = new Bull('attendance-notifications', redisUrl, {
  defaultJobOptions: { removeOnComplete: 100, removeOnFail: 50 },
});

attendanceNotifQueue.process(async (job) => {
  await sendAttendanceAbsentNotification(job.data);
});

const feeVoucherQueue = new Bull('fee-voucher-generation', redisUrl, {
  defaultJobOptions: { removeOnComplete: 20, removeOnFail: 20 },
});

feeVoucherQueue.process(async (job) => {
  const { month, year, sessionId, userId } = job.data;
  const classQ = sessionId ? { sessionId, status: 'active' } : { status: 'active' };
  const classes = await AcademyClass.find(classQ).select('_id').lean();
  for (const cls of classes) {
    await generateMonthlyFees({ month, year, classId: cls._id }, userId);
  }
  if (!classes.length) {
    await generateMonthlyFees({ month, year }, userId);
  }
});

function addAttendanceNotificationJob(data) {
  return attendanceNotifQueue.add(data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  });
}

function addFeeVoucherGenerationJob(data) {
  return feeVoucherQueue.add(data, { delay: 0 });
}

async function queueAttendanceAbsent(payload) {
  try {
    await addAttendanceNotificationJob(payload);
  } catch {
    await sendAttendanceAbsentNotification(payload);
  }
}

module.exports = {
  attendanceNotifQueue,
  feeVoucherQueue,
  addAttendanceNotificationJob,
  addFeeVoucherGenerationJob,
  queueAttendanceAbsent,
};
