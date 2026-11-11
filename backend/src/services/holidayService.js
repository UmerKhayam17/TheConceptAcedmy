/**
 * Approved holidays are the only ones attendance reads.
 * Pending Islamic estimates never skip an absent mark.
 */
const crypto = require('crypto');
const Holiday = require('../models/Holiday');
const Session = require('../models/Session');
const AcademyClass = require('../models/academy/AcademyClass');
const AcademyAttendance = require('../models/academy/AcademyAttendance');
const StaffAttendance = require('../models/StaffAttendance');
const User = require('../models/User');
const Role = require('../models/Role');
const { formatDateInTz, dayBounds } = require('../utils/schoolDay');
const { buildHolidayDrafts } = require('./holidayCalendar');

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function covers(row, ymd) {
  return ymd >= row.startDate && ymd <= row.endDate;
}

function sessionYmd(session, value) {
  return formatDateInTz(value, session?.timezone);
}

async function ensureSessionHolidays(session, userId) {
  if (!session?._id || !session.startDate || !session.endDate) return [];
  const drafts = buildHolidayDrafts(sessionYmd(session, session.startDate), sessionYmd(session, session.endDate));
  if (!drafts.length) return 0;
  const existing = await Holiday.find({
    sessionId: session._id,
    code: { $in: drafts.map((draft) => draft.code) },
  })
    .select('code')
    .lean();
  const have = new Set(existing.map((row) => row.code));
  const fresh = drafts.filter((draft) => !have.has(draft.code));
  if (!fresh.length) return 0;

  try {
    await Holiday.insertMany(
      fresh.map((draft) => ({
        ...draft,
        sessionId: session._id,
        createdBy: userId || undefined,
      })),
      { ordered: false }
    );
  } catch (err) {
    const writeErrors = err?.writeErrors || [];
    const dupOnly = writeErrors.length > 0 && writeErrors.every((e) => (e.code ?? e.err?.code) === 11000);
    if (!dupOnly && err?.code !== 11000) throw err;
  }
  for (const draft of fresh) {
    if (draft.status === 'approved') {
      await clearAutoAbsents({ ...draft, status: 'approved', appliesTo: draft.appliesTo });
    }
  }
  return fresh.length;
}

async function ensureActiveSessionHolidays() {
  const session = await Session.findOne({ isActive: true }).select('_id startDate endDate timezone').lean();
  if (!session) return 0;
  return ensureSessionHolidays(session);
}

async function listForSession(sessionId, userId) {
  const session = await Session.findById(sessionId).select('name startDate endDate status isActive timezone').lean();
  if (!session) return null;
  await ensureSessionHolidays(session, userId);
  const holidays = await Holiday.find({ sessionId }).sort({ startDate: 1, name: 1 }).lean();
  const counts = {
    total: holidays.length,
    confirmed: holidays.filter((h) => h.status === 'approved').length,
    pending: holidays.filter((h) => h.status === 'pending').length,
    vacations: holidays.filter((h) => h.category === 'vacation').length,
  };
  return { session, holidays, counts };
}

function assertYmd(value, label) {
  if (!YMD.test(String(value || ''))) {
    const err = new Error(`${label} must be YYYY-MM-DD`);
    err.statusCode = 400;
    throw err;
  }
}

function normalizeAppliesTo(value) {
  const src = value || {};
  const appliesTo = {
    students: src.students !== false,
    teachers: src.teachers !== false,
    staff: src.staff !== false,
  };
  if (!appliesTo.students && !appliesTo.teachers && !appliesTo.staff) {
    const err = new Error('Choose at least one group: students, teachers, or staff');
    err.statusCode = 400;
    throw err;
  }
  return appliesTo;
}

async function clearAutoAbsents(holiday) {
  if (!holiday || holiday.status !== 'approved') return { students: 0, staff: 0 };
  const { start } = dayBounds(holiday.startDate);
  const { end } = dayBounds(holiday.endDate);
  const applies = holiday.appliesTo || {};
  let students = 0;
  let staff = 0;

  if (applies.students) {
    const res = await AcademyAttendance.deleteMany({
      date: { $gte: start, $lte: end },
      status: 'absent',
      source: 'auto',
      $or: [{ subjectId: { $exists: false } }, { subjectId: null }],
    });
    students = res.deletedCount || 0;
  }

  const roleNames = [];
  if (applies.teachers) roleNames.push('teacher');
  if (applies.staff) roleNames.push('accountant', 'non_teaching_staff');
  if (roleNames.length) {
    const roles = await Role.find({ name: { $in: roleNames } }).select('_id').lean();
    const users = roles.length
      ? await User.find({ role: { $in: roles.map((r) => r._id) } }).select('_id').lean()
      : [];
    if (users.length) {
      const res = await StaffAttendance.deleteMany({
        date: { $gte: start, $lte: end },
        status: 'absent',
        source: 'auto',
        userId: { $in: users.map((u) => u._id) },
      });
      staff = res.deletedCount || 0;
    }
  }

  return { students, staff };
}

async function createHoliday(sessionId, body, userId) {
  const session = await Session.findById(sessionId).select('_id startDate endDate timezone').lean();
  if (!session) {
    const err = new Error('Session not found');
    err.statusCode = 404;
    throw err;
  }
  assertYmd(body.startDate, 'Start date');
  assertYmd(body.endDate, 'End date');
  if (body.startDate > body.endDate) {
    const err = new Error('Start date must be on or before the end date');
    err.statusCode = 400;
    throw err;
  }
  const sessionStart = sessionYmd(session, session.startDate);
  const sessionEnd = sessionYmd(session, session.endDate);
  if (body.endDate < sessionStart || body.startDate > sessionEnd) {
    const err = new Error('Holiday dates must fall inside the academic session');
    err.statusCode = 400;
    throw err;
  }

  const status = body.status === 'pending' ? 'pending' : 'approved';
  const holiday = await Holiday.create({
    sessionId,
    code: `manual-${crypto.randomBytes(8).toString('hex')}`,
    name: String(body.name || '').trim(),
    shortName: String(body.shortName || body.name || '').trim(),
    category: body.category,
    source: body.source || (body.category === 'vacation' ? 'manual' : body.category === 'government' ? 'government' : 'manual'),
    startDate: body.startDate,
    endDate: body.endDate,
    status,
    appliesTo: normalizeAppliesTo(body.appliesTo),
    estimated: status === 'pending',
    notes: String(body.notes || '').trim(),
    createdBy: userId,
    approvedBy: status === 'approved' ? userId : undefined,
    approvedAt: status === 'approved' ? new Date() : undefined,
  });
  const cleared = await clearAutoAbsents(holiday);
  return { holiday, cleared };
}

async function updateHoliday(id, body, userId) {
  const holiday = await Holiday.findById(id);
  if (!holiday) {
    const err = new Error('Holiday not found');
    err.statusCode = 404;
    throw err;
  }
  if (body.name != null) holiday.name = String(body.name).trim();
  if (body.shortName != null) holiday.shortName = String(body.shortName).trim();
  if (body.category) holiday.category = body.category;
  if (body.notes != null) holiday.notes = String(body.notes).trim();
  if (body.appliesTo) holiday.appliesTo = normalizeAppliesTo({ ...holiday.appliesTo.toObject?.() || holiday.appliesTo, ...body.appliesTo });
  if (body.startDate || body.endDate) {
    const startDate = body.startDate || holiday.startDate;
    const endDate = body.endDate || holiday.endDate;
    assertYmd(startDate, 'Start date');
    assertYmd(endDate, 'End date');
    if (startDate > endDate) {
      const err = new Error('Start date must be on or before the end date');
      err.statusCode = 400;
      throw err;
    }
    holiday.startDate = startDate;
    holiday.endDate = endDate;
    if (holiday.estimated) holiday.notes = holiday.notes || '';
  }
  if (body.status === 'approved' || body.status === 'pending') {
    holiday.status = body.status;
    if (body.status === 'approved') {
      holiday.estimated = false;
      holiday.approvedBy = userId;
      holiday.approvedAt = new Date();
    } else {
      holiday.approvedBy = undefined;
      holiday.approvedAt = undefined;
    }
  }
  await holiday.save();
  const cleared = await clearAutoAbsents(holiday);
  return { holiday, cleared };
}

async function approveHoliday(id, userId) {
  return updateHoliday(id, { status: 'approved' }, userId);
}

async function deleteHoliday(id) {
  const holiday = await Holiday.findById(id);
  if (!holiday) {
    const err = new Error('Holiday not found');
    err.statusCode = 404;
    throw err;
  }
  await holiday.deleteOne();
  return { deleted: true };
}

async function approvedRowsForSessions(sessionIds) {
  const ids = [...new Set((sessionIds || []).map((id) => String(id || '')).filter(Boolean))];
  if (!ids.length) return [];
  return Holiday.find({
    sessionId: { $in: ids },
    status: 'approved',
  })
    .select('sessionId startDate endDate appliesTo name')
    .lean();
}

function closureFromRows(rows) {
  return function closure(ymd) {
    const hits = (rows || []).filter((row) => covers(row, ymd));
    return {
      students: hits.some((row) => row.appliesTo?.students),
      teachers: hits.some((row) => row.appliesTo?.teachers),
      staff: hits.some((row) => row.appliesTo?.staff),
      name: hits.map((row) => row.name).filter(Boolean).join(', '),
    };
  };
}

async function holidayClosureForSession(sessionId) {
  if (!sessionId) return closureFromRows([]);
  const rows = await approvedRowsForSessions([sessionId]);
  return closureFromRows(rows);
}

async function loadStudentHolidayContext(students) {
  const list = students || [];
  const sessionByStudent = new Map();
  const missingClassIds = new Set();

  list.forEach((student) => {
    const cls = student.classId;
    if (cls && typeof cls === 'object' && cls.sessionId) {
      sessionByStudent.set(String(student._id), String(cls.sessionId._id || cls.sessionId));
    } else if (cls) {
      missingClassIds.add(String(cls._id || cls));
    }
  });

  const classSession = new Map();
  if (missingClassIds.size) {
    const classes = await AcademyClass.find({ _id: { $in: [...missingClassIds] } })
      .select('_id sessionId')
      .lean();
    classes.forEach((cls) => classSession.set(String(cls._id), String(cls.sessionId || '')));
  }

  function sessionIdOf(student) {
    const known = sessionByStudent.get(String(student._id));
    if (known) return known;
    const cls = student.classId;
    return classSession.get(String(cls?._id || cls)) || '';
  }

  const rows = await approvedRowsForSessions(list.map(sessionIdOf));
  const bySession = new Map();
  rows.forEach((row) => {
    if (!row.appliesTo?.students) return;
    const key = String(row.sessionId);
    if (!bySession.has(key)) bySession.set(key, []);
    bySession.get(key).push(row);
  });

  function isStudentHoliday(student, ymd) {
    const ranges = bySession.get(sessionIdOf(student));
    if (!ranges) return false;
    return ranges.some((row) => covers(row, ymd));
  }

  function holidayName(student, ymd) {
    const ranges = bySession.get(sessionIdOf(student)) || [];
    return ranges
      .filter((row) => covers(row, ymd))
      .map((row) => row.name)
      .join(', ');
  }

  return { isStudentHoliday, holidayName };
}

module.exports = {
  ensureSessionHolidays,
  ensureActiveSessionHolidays,
  listForSession,
  createHoliday,
  updateHoliday,
  approveHoliday,
  deleteHoliday,
  holidayClosureForSession,
  loadStudentHolidayContext,
};
