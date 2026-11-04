const cron = require('node-cron');
const {
  ensureMonthlyFeesGenerated,
  isEnabled: isMonthlyFeeJobEnabled,
} = require('./monthlyFeeJob');
const { DEFAULT_TZ, todayYmd, minutesSinceMidnight } = require('../utils/schoolDay');
const { markAbsentForDay, autoAbsentTime } = require('../services/academy/autoAbsentService');

const { markStaffAbsentForDay } = require('../services/staffAutoAbsentService');

async function runAutoAbsent(reason) {
  try {
    const result = await markAbsentForDay(todayYmd());
    console.log(`[auto-absent] ${reason}:`, JSON.stringify(result));
  } catch (err) {
    console.error('[auto-absent] failed:', err?.message || err);
  }
  if (String(process.env.STAFF_AUTO_ABSENT_ENABLED || 'true').toLowerCase() === 'false') return;
  try {
    const result = await markStaffAbsentForDay(todayYmd());
    console.log(`[auto-absent:staff] ${reason}:`, JSON.stringify(result));
  } catch (err) {
    console.error('[auto-absent:staff] failed:', err?.message || err);
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

  startMonthlyFeeJob();
}

/**
 * Monthly challans are generated automatically, once per month:
 *  - 00:05 on the 1st (school timezone) if the server is running;
 *  - otherwise ~20s after the next startup, or on the hourly check.
 * A JobRun row per month prevents running twice; students who already
 * have a challan are skipped, so a manual "Generate" click is harmless.
 */
function startMonthlyFeeJob() {
  if (!isMonthlyFeeJobEnabled()) return;
  const run = (trigger) =>
    ensureMonthlyFeesGenerated(trigger).catch((err) =>
      console.error('[monthly-fees] check failed:', err?.message || err)
    );
  cron.schedule('5 0 1 * *', () => run('scheduled 1st'), { timezone: DEFAULT_TZ });
  cron.schedule('15 * * * *', () => run('hourly catch-up'), { timezone: DEFAULT_TZ });
  setTimeout(() => run('startup catch-up'), 20000);
}

module.exports = { startCronJobs };
