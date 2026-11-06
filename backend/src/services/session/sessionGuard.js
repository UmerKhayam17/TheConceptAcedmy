const ApiError = require('../../utils/ApiError');
const Session = require('../../models/Session');

const SESSION_STATUSES = ['active', 'completed', 'archived'];

function resolveSessionStatus(session) {
  if (session.status && SESSION_STATUSES.includes(session.status)) {
    return session.status;
  }
  if (session.isClosed) return 'completed';
  if (session.isActive) return 'active';
  return 'active';
}

function syncSessionFlags(session, status) {
  session.status = status;
  if (status === 'active') {
    session.isActive = true;
    session.isClosed = false;
  } else {
    session.isActive = false;
    session.isClosed = true;
  }
}

async function getSessionOrThrow(sessionId) {
  const session = await Session.findById(sessionId);
  if (!session) throw new ApiError(404, 'Session not found');
  return session;
}

/** Fix legacy rows where status and isActive/isClosed disagree. */
async function healSessionFlags(session) {
  const resolved = resolveSessionStatus(session);
  const needsHeal =
    session.status !== resolved ||
    (resolved === 'active' && (!session.isActive || session.isClosed)) ||
    (resolved !== 'active' && (session.isActive || !session.isClosed));

  if (!needsHeal) return session;

  syncSessionFlags(session, resolved);
  await session.save();
  return session;
}

async function assertSessionWritable(sessionId) {
  let session = await getSessionOrThrow(sessionId);
  session = await healSessionFlags(session);

  const status = resolveSessionStatus(session);
  if (status !== 'active') {
    throw new ApiError(
      403,
      `Session "${session.name}" is ${status} and cannot be modified. Use "Set active" on another session or open Session history → Activate.`
    );
  }
  return session;
}

function isSessionReadOnly(session) {
  return resolveSessionStatus(session) !== 'active';
}

/** Every session that currently counts as active (by status or legacy flags), except `exceptId`. */
function otherActiveFilter(exceptId) {
  const filter = {
    status: { $ne: 'archived' },
    $or: [{ status: 'active' }, { isActive: true }],
  };
  if (exceptId) filter._id = { $ne: exceptId };
  return filter;
}

/**
 * Make `session` (an unsaved new doc or an existing doc) the ONLY active session.
 *  1. Validate the target first, so nothing is closed if it cannot be saved.
 *  2. Close every other active session (archived ones are left untouched).
 *  3. Save the target as active.
 * If step 3 fails, the sessions closed in step 2 are re-opened, so the school is never
 * left without an active session. The partial unique index on `isActive` (models/Session.js)
 * rejects a concurrent second activation.
 */
async function activateExclusively(session) {
  syncSessionFlags(session, 'active');
  session.archivedAt = undefined;
  await session.validate();

  const previous = await Session.find(otherActiveFilter(session._id)).select('_id status isActive isClosed').lean();
  if (previous.length) {
    await Session.updateMany(
      { _id: { $in: previous.map((s) => s._id) } },
      { $set: { isActive: false, status: 'completed', isClosed: true, completedAt: new Date() } }
    );
  }

  try {
    await session.save();
  } catch (err) {
    await Promise.all(
      previous.map((s) =>
        Session.updateOne(
          { _id: s._id },
          { $set: { isActive: s.isActive, status: s.status, isClosed: s.isClosed }, $unset: { completedAt: '' } }
        )
      )
    ).catch(() => {});
    if (err?.code === 11000 && err?.keyPattern?.isActive) {
      throw new ApiError(409, 'Another session was activated at the same time. Refresh and try again.');
    }
    throw err;
  }

  return { session, closed: previous.map((s) => s._id) };
}

/**
 * Startup repair for data created before the one-active rule: if several sessions are
 * active, keep the one with the latest start date and close the rest.
 */
async function ensureSingleActiveSession() {
  const candidates = await Session.find(otherActiveFilter()).sort({ startDate: -1, updatedAt: -1 });
  // A row whose status says completed but still has isActive=true is a completed session with
  // stale flags: close it, never re-open it.
  const active = candidates.filter((s) => resolveSessionStatus(s) === 'active');
  const stale = candidates.filter((s) => resolveSessionStatus(s) !== 'active');
  if (stale.length) {
    await Session.updateMany(
      { _id: { $in: stale.map((s) => s._id) } },
      { $set: { isActive: false, isClosed: true } }
    );
  }
  if (active.length <= 1) {
    if (active[0] && (!active[0].isActive || active[0].isClosed)) {
      syncSessionFlags(active[0], 'active');
      await active[0].save();
    }
    return { kept: active[0]?._id || null, closed: [] };
  }
  const [keep, ...rest] = active;
  await Session.updateMany(
    { _id: { $in: rest.map((s) => s._id) } },
    { $set: { isActive: false, status: 'completed', isClosed: true, completedAt: new Date() } }
  );
  if (!keep.isActive || keep.isClosed) {
    syncSessionFlags(keep, 'active');
    await keep.save();
  }
  // eslint-disable-next-line no-console
  console.warn(
    `[sessions] ${active.length} sessions were active. Kept "${keep.name}" (latest start date); closed: ${rest
      .map((s) => `"${s.name}"`)
      .join(', ')}.`
  );
  return { kept: keep._id, closed: rest.map((s) => s._id) };
}

/** Startup: repair old data, then build the one-active-session unique index. */
async function ensureSessionIndexes() {
  await ensureSingleActiveSession();
  const existing = await Session.collection.indexes().catch(() => []);
  // The old plain index has the same key ({ isActive: 1 }) and would block the unique one.
  if (existing.some((ix) => ix.name === 'isActive_1')) {
    await Session.collection.dropIndex('isActive_1');
  }
  await Session.createIndexes();
}

module.exports = {
  SESSION_STATUSES,
  resolveSessionStatus,
  syncSessionFlags,
  getSessionOrThrow,
  healSessionFlags,
  assertSessionWritable,
  isSessionReadOnly,
  activateExclusively,
  ensureSingleActiveSession,
  ensureSessionIndexes,
};
