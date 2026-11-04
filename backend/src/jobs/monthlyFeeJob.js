const JobRun = require('../models/JobRun');
const Session = require('../models/Session');
const User = require('../models/User');
const Role = require('../models/Role');
const AcademyClass = require('../models/academy/AcademyClass');
const { generateMonthlyFees } = require('../services/academy/academyFeeService');
const { todayYmd } = require('../utils/schoolDay');

// A "running" claim older than this is treated as crashed and may be retried.
const STALE_RUN_MS = 2 * 60 * 60 * 1000;

function isEnabled() {
  return String(process.env.AUTO_FEE_GENERATION_ENABLED || 'true').toLowerCase() !== 'false';
}

/**
 * Generate monthly challans for every active class (active session first).
 * Students who already have a challan for the month are skipped by generateMonthlyFees,
 * so this is safe to run more than once.
 */
async function generateFeesForMonth({ month, year, sessionId, userId }) {
  const classQ = sessionId ? { sessionId, status: 'active' } : { status: 'active' };
  const classes = await AcademyClass.find(classQ).select('_id').lean();
  const totals = { classes: classes.length, created: 0, skipped: 0, repaired: 0 };

  const add = (res) => {
    totals.created += Number(res?.created) || 0;
    totals.skipped += Number(res?.skipped) || 0;
    totals.repaired += Number(res?.repaired) || 0;
  };

  if (!classes.length) {
    add(await generateMonthlyFees({ month, year }, userId));
    return totals;
  }
  for (const cls of classes) {
    // eslint-disable-next-line no-await-in-loop
    add(await generateMonthlyFees({ month, year, classId: cls._id }, userId));
  }
  return totals;
}

async function resolveSystemUser() {
  const adminRole = await Role.findOne({ name: 'admin' }).select('_id').lean();
  const admin = adminRole
    ? await User.findOne({ role: adminRole._id }).select('_id').lean()
    : await User.findOne().select('_id').lean();
  return admin?._id;
}

/** Atomically claim this month's run. Returns null if it's already done or in progress. */
async function claimRun(key, trigger) {
  const now = new Date();
  const retry = await JobRun.findOneAndUpdate(
    {
      key,
      $or: [
        { status: 'failed' },
        { status: 'running', startedAt: { $lt: new Date(now.getTime() - STALE_RUN_MS) } },
      ],
    },
    { $set: { status: 'running', startedAt: now, trigger, error: null }, $inc: { attempts: 1 } },
    { new: true }
  );
  if (retry) return retry;
  try {
    return await JobRun.create({ key, status: 'running', startedAt: now, trigger, attempts: 1 });
  } catch (err) {
    if (err?.code === 11000) return null; // already done or another instance is running it
    throw err;
  }
}

/**
 * Make sure the current month's challans exist. Runs at most once per month:
 * on the 1st via cron, or on the first check after a missed 1st (server was off).
 */
async function ensureMonthlyFeesGenerated(trigger = 'scheduled') {
  if (!isEnabled()) return { skipped: 'disabled' };

  const [y, m] = todayYmd().split('-').map(Number);
  const key = `monthly-fees:${y}-${String(m).padStart(2, '0')}`;

  const run = await claimRun(key, trigger);
  if (!run) return { skipped: 'already-done', key };

  try {
    const session = await Session.findOne({ isActive: true }).select('_id').lean();
    const userId = await resolveSystemUser();
    const result = await generateFeesForMonth({ month: m, year: y, sessionId: session?._id, userId });
    await JobRun.updateOne(
      { _id: run._id },
      { $set: { status: 'done', finishedAt: new Date(), result } }
    );
    console.log(`[monthly-fees] ${key} generated (${trigger}):`, JSON.stringify(result));
    return { key, ...result };
  } catch (err) {
    await JobRun.updateOne(
      { _id: run._id },
      { $set: { status: 'failed', finishedAt: new Date(), error: String(err?.message || err) } }
    );
    console.error(`[monthly-fees] ${key} failed (${trigger}):`, err?.message || err);
    return { key, error: String(err?.message || err) };
  }
}

module.exports = { ensureMonthlyFeesGenerated, generateFeesForMonth, isEnabled };
