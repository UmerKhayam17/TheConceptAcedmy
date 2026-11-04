const AcademyStudent = require('../../models/academy/AcademyStudent');
const Session = require('../../models/Session');
const timetableVersionService = require('../timetable/timetableVersionService');
const { isEnrolledInSubject } = require('../academy/studentEnrollment');
const {
  weekdayName,
  minutesSinceMidnight,
  DEFAULT_TZ,
} = require('../../utils/schoolDay');

/** Fallback when none of the student's subjects are on today's published timetable. */
const FALLBACK_LATE_AFTER_HOUR = 9;
const FALLBACK_LATE_AFTER_MINUTE = 30;

/** Used when AI_ATTENDANCE_LATE_GRACE_MINUTES is missing or invalid. */
const DEFAULT_GRACE_MINUTES = 10;

/** Minutes after the earliest selected-subject period start. Read on each check-in. */
function graceMinutes() {
  const raw = Number(process.env.AI_ATTENDANCE_LATE_GRACE_MINUTES);
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_GRACE_MINUTES;
  return raw;
}

/** Period types that count as class time (not breaks). */
const START_PERIOD_TYPES = new Set(['lecture', 'assembly', 'prayer']);

function hhmmToMinutes(value) {
  if (!value || typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

function statusFromMinutes(checkInMinutes, startMinutes, graceMinutes = 0) {
  if (startMinutes == null) {
    const fallback = FALLBACK_LATE_AFTER_HOUR * 60 + FALLBACK_LATE_AFTER_MINUTE;
    return checkInMinutes <= fallback ? 'present' : 'late';
  }
  return checkInMinutes <= startMinutes + graceMinutes ? 'present' : 'late';
}

function refId(value) {
  if (!value || value.deleted) return null;
  const id = value._id || value;
  if (!id || String(id) === 'deleted') return null;
  return String(id);
}

/** Primary subject plus any choice-group subjects taught in the same period. */
function slotSubjectIds(slot) {
  const ids = [refId(slot?.subject)];
  for (const entry of slot?.parallelEntries || []) {
    ids.push(refId(entry?.subject));
  }
  return ids.filter(Boolean);
}

function slotMatchesEnrollment(slot, student) {
  return slotSubjectIds(slot).some((id) => isEnrolledInSubject(student, id));
}

async function resolveSessionTimezone(sessionId) {
  if (!sessionId) return DEFAULT_TZ;
  const session = await Session.findById(sessionId).select('timezone').lean();
  return session?.timezone || DEFAULT_TZ;
}

/**
 * Earliest start today among the student's selected subjects on the
 * published section timetable. Empty when nothing matches (caller uses 9:30).
 */
async function getStudentFirstPeriodStartMinutes(studentId, checkIn) {
  const student = await AcademyStudent.findById(studentId)
    .populate('classId', 'sessionId')
    .select('classId sectionId selectedSubjects isFullPackage')
    .lean();
  if (!student) return { startMinutes: null, timeZone: DEFAULT_TZ };

  const sessionId = student.classId?.sessionId?._id || student.classId?.sessionId;
  const sectionId = student.sectionId?._id || student.sectionId;
  const timeZone = await resolveSessionTimezone(sessionId);
  if (!sessionId || !sectionId) return { startMinutes: null, timeZone };

  const version = await timetableVersionService.getPublishedVersion(sessionId, sectionId);
  if (!version) return { startMinutes: null, timeZone };

  const grid = await timetableVersionService.getVersionGrid(version._id);
  const periods = grid.periods || [];
  const weekday = weekdayName(checkIn, timeZone);

  const todayStarts = (grid.slots || [])
    .filter((slot) => String(slot.day || '').toLowerCase() === weekday)
    .filter((slot) => slotMatchesEnrollment(slot, student))
    .map((slot) => {
      const periodId = slot.periodId?._id || slot.periodId;
      return periods.find((p) => String(p._id) === String(periodId));
    })
    .filter(Boolean)
    .filter((p) => !p.type || START_PERIOD_TYPES.has(p.type))
    .map((p) => hhmmToMinutes(p.startTime))
    .filter((n) => n != null);

  if (!todayStarts.length) return { startMinutes: null, timeZone };
  return { startMinutes: Math.min(...todayStarts), timeZone };
}

async function resolveStudentAttendanceStatus(studentId, checkIn = new Date()) {
  const { startMinutes, timeZone } = await getStudentFirstPeriodStartMinutes(studentId, checkIn);
  const checkInMinutes = minutesSinceMidnight(checkIn, timeZone);
  const grace = startMinutes == null ? 0 : graceMinutes();
  return statusFromMinutes(checkInMinutes, startMinutes, grace);
}

function scheduleSlotModels() {
  return {
    TimetableVersion: require('../../models/timetable/TimetableVersion'),
    ScheduleSlot: require('../../models/timetable/ScheduleSlot'),
  };
}

/** Active session (timezone + working days), or null. */
async function activeSession() {
  return Session.findOne({ isActive: true }).select('_id timezone workingDays').lean();
}

/**
 * Teacher's timetable for the active session: start minutes of every period they
 * teach, grouped by weekday. Empty map when the user is not on any published timetable.
 */
async function getTeacherWeekdayStarts(userId, sessionId) {
  const byWeekday = new Map();
  if (!userId || !sessionId) return byWeekday;
  const { TimetableVersion, ScheduleSlot } = scheduleSlotModels();

  const versions = await TimetableVersion.find({ session: sessionId, status: 'published' })
    .select('_id periodTemplate')
    .populate({ path: 'periodTemplate', select: 'slots' })
    .lean();
  if (!versions.length) return byWeekday;

  const periodByVersion = new Map(
    versions.map((v) => [
      String(v._id),
      new Map((v.periodTemplate?.slots || []).map((p) => [String(p._id), p])),
    ])
  );

  const slots = await ScheduleSlot.find({
    timetableVersion: { $in: versions.map((v) => v._id) },
    cancelled: { $ne: true },
    $or: [{ teacher: userId }, { 'parallelEntries.teacher': userId }],
  })
    .select('timetableVersion periodId day')
    .lean();

  slots.forEach((slot) => {
    const period = periodByVersion.get(String(slot.timetableVersion))?.get(String(slot.periodId));
    if (!period) return;
    if (period.type && !START_PERIOD_TYPES.has(period.type)) return;
    const start = hhmmToMinutes(period.startTime);
    if (start == null) return;
    const weekday = String(slot.day || '').toLowerCase();
    if (!byWeekday.has(weekday)) byWeekday.set(weekday, []);
    byWeekday.get(weekday).push(start);
  });
  return byWeekday;
}

/**
 * Earliest period start today for a teacher on the published timetable of the
 * active session. Empty when they teach nothing today (caller uses 9:30).
 */
async function getTeacherFirstPeriodStartMinutes(userId, checkIn = new Date()) {
  const session = await activeSession();
  const timeZone = session?.timezone || DEFAULT_TZ;
  if (!session) return { startMinutes: null, timeZone };
  const byWeekday = await getTeacherWeekdayStarts(userId, session._id);
  const todayStarts = byWeekday.get(weekdayName(checkIn, timeZone)) || [];
  if (!todayStarts.length) return { startMinutes: null, timeZone };
  return { startMinutes: Math.min(...todayStarts), timeZone };
}

/** Same rule as students: earliest period today + grace; otherwise 9:30 AM. */
async function resolveStaffAttendanceStatus(userId, checkIn = new Date()) {
  const { startMinutes, timeZone } = await getTeacherFirstPeriodStartMinutes(userId, checkIn);
  const checkInMinutes = minutesSinceMidnight(checkIn, timeZone);
  const grace = startMinutes == null ? 0 : graceMinutes();
  return statusFromMinutes(checkInMinutes, startMinutes, grace);
}

function resolveFallbackAttendanceStatus(checkIn = new Date()) {
  const checkInMinutes = minutesSinceMidnight(checkIn, DEFAULT_TZ);
  return statusFromMinutes(checkInMinutes, null, 0);
}

module.exports = {
  graceMinutes,
  resolveStudentAttendanceStatus,
  resolveFallbackAttendanceStatus,
  resolveStaffAttendanceStatus,
  getStudentFirstPeriodStartMinutes,
  getTeacherFirstPeriodStartMinutes,
  getTeacherWeekdayStarts,
  activeSession,
  hhmmToMinutes,
  statusFromMinutes,
  slotMatchesEnrollment,
};
