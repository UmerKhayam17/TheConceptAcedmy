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

/**
 * Every session that holds any "active" marker, except `exceptId`: status 'active' OR the
 * isActive flag (archived/completed rows with a stale isActive=true included — they still count
 * against the one_active_session unique index, so they must be cleared too).
 */
function otherActiveFilter(exceptId) {
  const filter = { $or: [{ status: 'active' }, { isActive: true }] };
  if (exceptId) filter._id = { $ne: exceptId };
  return filter;
}

/**
 * Close sessions in one update: clear the active flags, mark non-archived ones completed
 * (archived stays archived), and keep an existing completion date (only fill it when missing).
 */
function closeSessionsUpdate() {
  return [
    {
      $set: {
        isActive: false,
        isClosed: true,
        status: { $cond: [{ $eq: ['$status', 'archived'] }, 'archived', 'completed'] },
        completedAt: { $ifNull: ['$completedAt', '$$NOW'] },
      },
    },
  ];
}

/** Put a session's lifecycle fields back exactly as they were (used on rollback). */
function restoreLifecycle(prev) {
  const $set = {};
  const $unset = {};
  ['status', 'isActive', 'isClosed', 'completedAt'].forEach((key) => {
    if (prev[key] === undefined || prev[key] === null) $unset[key] = '';
    else $set[key] = prev[key];
  });
  const update = {};
  if (Object.keys($set).length) update.$set = $set;
  if (Object.keys($unset).length) update.$unset = $unset;
  return update;
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

  // Raw collection read: Mongoose would fill in schema defaults (status 'active') for old rows
  // that have no status saved, and the rollback must restore exactly what was stored.
  const previous = await Session.collection
    .find(otherActiveFilter(session._id), {
      projection: { status: 1, isActive: 1, isClosed: 1, completedAt: 1 },
    })
    .toArray();
  if (previous.length) {
    await Session.collection.updateMany(
      { _id: { $in: previous.map((s) => s._id) } },
      closeSessionsUpdate()
    );
  }

  try {
    await session.save();
  } catch (err) {
    await Promise.all(
      previous.map((s) => Session.collection.updateOne({ _id: s._id }, restoreLifecycle(s)))
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
  const raw = Session.collection;

  // 1. Old rows with no status saved: give them the status the app already shows for them
  //    (resolveSessionStatus: closed → completed, otherwise active). Without this, the app
  //    treats them as active while database queries on `status` skip them.
  await raw.updateMany({ status: { $exists: false }, isClosed: true }, { $set: { status: 'completed' } });
  await raw.updateMany({ status: { $exists: false } }, { $set: { status: 'active' } });

  // 2. Rows whose status is completed/archived but still carry isActive=true: stale flags.
  //    Clear them (they still count against the unique index); never re-open them.
  await raw.updateMany(
    { status: { $in: ['completed', 'archived'] }, $or: [{ isActive: true }, { isClosed: { $ne: true } }] },
    { $set: { isActive: false, isClosed: true } }
  );

  // 3. Keep exactly one 'active' session: the one with the latest start date.
  const active = await raw
    .find({ status: 'active' }, { projection: { name: 1, isActive: 1, isClosed: 1 } })
    .sort({ startDate: -1, updatedAt: -1 })
    .toArray();
  if (!active.length) return { kept: null, closed: [] };

  const [keep, ...rest] = active;
  if (rest.length) {
    await raw.updateMany({ _id: { $in: rest.map((s) => s._id) } }, closeSessionsUpdate());
  }
  if (!keep.isActive || keep.isClosed) {
    await raw.updateOne({ _id: keep._id }, { $set: { isActive: true, isClosed: false } });
  }
  if (!rest.length) return { kept: keep._id, closed: [] };
  // eslint-disable-next-line no-console
  console.warn(
    `[sessions] ${active.length} sessions were active. Kept "${keep.name}" (latest start date); closed: ${rest
      .map((s) => `"${s.name}"`)
      .join(', ')}.`
  );
  return { kept: keep._id, closed: rest.map((s) => s._id) };
}

/**
 * Startup: repair old data, then build the one-active-session unique index.
 * Never stops the API from starting: if the index still cannot be built, the application-level
 * rule (activateExclusively) keeps working and a clear error is logged for the admin.
 */
async function ensureSessionIndexes() {
  try {
    await ensureSingleActiveSession();
    const existing = await Session.collection.indexes().catch(() => []);
    // The old plain index has the same key ({ isActive: 1 }) and would block the unique one.
    if (existing.some((ix) => ix.name === 'isActive_1')) {
      await Session.collection.dropIndex('isActive_1');
    }
    await Session.createIndexes();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      '[sessions] Could not build the one-active-session index. The API will still run, but check ' +
        'db.sessions.find({ isActive: true }) — more than one row is marked active.',
      err?.message || err
    );
  }
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
