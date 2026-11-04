/**
 * End-of-day auto absent for staff — same idea as the student job
 * (services/academy/autoAbsentService.js).
 *
 * A staff member is EXPECTED today when:
 * - they teach on the active session's published timetable → only on weekdays they have a class;
 * - they are not on any timetable (accountant, non-teaching staff) → on the session's working days.
 * Never expected before their account was created.
 *
 * Expected staff with no row today get `absent` with source `auto`. Camera / manual rows
 * are never touched. A later camera sighting fills checkIn and turns the row present/late.
 */
const User = require('../models/User');
const Role = require('../models/Role');
const StaffAttendance = require('../models/StaffAttendance');
const TimetableVersion = require('../models/timetable/TimetableVersion');
const ScheduleSlot = require('../models/timetable/ScheduleSlot');
const { STAFF_ROLE_NAMES } = require('../config/staffRoles');
const { dayBounds, todayYmd, formatDateInTz } = require('../utils/schoolDay');
const { autoAbsentTime } = require('./academy/autoAbsentService');
const { activeSession } = require('./aiAttendance/attendanceStatusFromTimetable');

const DEFAULT_WORKING_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function weekdayOfYmd(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  return WEEKDAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** teacherId -> Set(weekday) from every published timetable in the session. */
async function teachingWeekdays(sessionId) {
  const byTeacher = new Map();
  if (!sessionId) return byTeacher;
  const versions = await TimetableVersion.find({ session: sessionId, status: 'published' })
    .select('_id')
    .lean();
  if (!versions.length) return byTeacher;

  const slots = await ScheduleSlot.find({
    timetableVersion: { $in: versions.map((v) => v._id) },
    cancelled: { $ne: true },
  })
    .select('day teacher parallelEntries.teacher')
    .lean();

  const add = (teacherId, day) => {
    if (!teacherId) return;
    const key = String(teacherId);
    if (!byTeacher.has(key)) byTeacher.set(key, new Set());
    byTeacher.get(key).add(String(day || '').toLowerCase());
  };
  slots.forEach((slot) => {
    add(slot.teacher, slot.day);
    (slot.parallelEntries || []).forEach((e) => add(e?.teacher, slot.day));
  });
  return byTeacher;
}

async function markStaffAbsentForDay(ymd = todayYmd()) {
  const { start, end } = dayBounds(ymd);
  const weekday = weekdayOfYmd(ymd);

  const roles = await Role.find({ name: { $in: STAFF_ROLE_NAMES } }).select('_id').lean();
  const users = await User.find({
    isActive: true,
    role: { $in: roles.map((r) => r._id) },
  })
    .select('_id createdAt')
    .lean();
  if (!users.length) return { date: ymd, expected: 0, alreadyMarked: 0, markedAbsent: 0 };

  const session = await activeSession();
  const workingDays = session?.workingDays?.length ? session.workingDays : DEFAULT_WORKING_DAYS;
  const byTeacher = await teachingWeekdays(session?._id);

  const expected = users.filter((u) => {
    if (u.createdAt && formatDateInTz(u.createdAt) > ymd) return false;
    const days = byTeacher.get(String(u._id));
    return days ? days.has(weekday) : workingDays.includes(weekday);
  });

  const existing = expected.length
    ? await StaffAttendance.find({
        date: { $gte: start, $lte: end },
        userId: { $in: expected.map((u) => u._id) },
      })
        .select('userId')
        .lean()
    : [];
  const marked = new Set(existing.map((r) => String(r.userId)));

  const { label } = autoAbsentTime();
  const docs = expected
    .filter((u) => !marked.has(String(u._id)))
    .map((u) => ({
      userId: u._id,
      date: start,
      status: 'absent',
      source: 'auto',
      notes: `Auto-marked absent (no attendance by ${label})`,
    }));

  let inserted = 0;
  if (docs.length) {
    try {
      const res = await StaffAttendance.insertMany(docs, { ordered: false });
      inserted = res.length;
    } catch (err) {
      // Duplicate key = camera / admin marked them meanwhile — keep theirs.
      const dupOnly = (err?.writeErrors || []).every((e) => (e.code ?? e.err?.code) === 11000);
      if (!dupOnly) throw err;
      inserted = err.insertedDocs?.length ?? err.result?.insertedCount ?? docs.length - err.writeErrors.length;
    }
  }

  return {
    date: ymd,
    expected: expected.length,
    alreadyMarked: marked.size,
    markedAbsent: inserted,
  };
}

module.exports = { markStaffAbsentForDay };
