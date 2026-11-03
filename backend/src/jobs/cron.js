const cron = require('node-cron');
const Session = require('../models/Session');
const User = require('../models/User');
const Role = require('../models/Role');
const { addFeeVoucherGenerationJob } = require('./queues');
const { DEFAULT_TZ, todayYmd, minutesSinceMidnight } = require('../utils/schoolDay');
const { markAbsentForDay, autoAbsentTime } = require('../services/academy/autoAbsentService');

async function runAutoAbsent(reason) {
  try {
    const result = await markAbsentForDay(todayYmd());
    console.log(`[auto-absent] ${reason}:`, JSON.stringify(result));
  } catch (err) {
    console.error('[auto-absent] failed:', err?.message || err);
  }
}

/** Daily at AUTO_ABSENT_TIME (default 19:30, school timezone): save absent for expected, unmarked students. */
function startAutoAbsentJob() {
  if (String(process.env.AUTO_ABSENT_ENABLED || 'true').toLowerCase() === 'false') return;
  const { hour, minute, label } = autoAbsentTime();
  cron.schedule(`${minute} ${hour} * * *`, () => runAutoAbsent(`scheduled ${label}`), {
    timezone: DEFAULT_TZ,
  });
  // Server started after today's cut-off (e.g. restart at 8 PM) → fill today now. Safe to repeat.
  if (minutesSinceMidnight(new Date()) >= hour * 60 + minute) {
    setTimeout(() => runAutoAbsent('startup catch-up'), 15000);
  }
}

function startCronJobs() {
  startAutoAbsentJob();

  cron.schedule('0 0 1 * *', async () => {
    const session = await Session.findOne({ isActive: true });
    if (!session) return;
    const adminRole = await Role.findOne({ name: 'admin' });
    const adminUser = adminRole ? await User.findOne({ role: adminRole._id }) : await User.findOne();
    const now = new Date();
    await addFeeVoucherGenerationJob({
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      sessionId: session._id,
      userId: adminUser?._id,
    });
  });
}

module.exports = { startCronJobs };
