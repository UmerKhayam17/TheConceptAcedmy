const AcademyStudent = require('../../models/academy/AcademyStudent');
const Session = require('../../models/Session');
const timetableVersionService = require('../timetable/timetableVersionService');
const {
  weekdayName,
  minutesSinceMidnight,
  DEFAULT_TZ,
} = require('../../utils/schoolDay');

/** Fallback when no published class timetable exists for the student today. */
const FALLBACK_LATE_AFTER_HOUR = 9;
const FALLBACK_LATE_AFTER_MINUTE = 30;

/** Period types that count as the school/class start (not breaks). */
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

async function resolveSessionTimezone(sessionId) {
  if (!sessionId) return DEFAULT_TZ;
  const session = await Session.findById(sessionId).select('timezone').lean();
  return session?.timezone || DEFAULT_TZ;
}

/**
 * Earliest class start today from the student's published section timetable.
 */
async function getStudentFirstPeriodStartMinutes(studentId, checkIn) {
  const student = await AcademyStudent.findById(studentId)
    .populate('classId', 'sessionId')
    .select('classId sectionId')
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
    .map((slot) => periods.find((p) => String(p._id) === String(slot.periodId)))
    .filter(Boolean)
    .filter((p) => !p.type || START_PERIOD_TYPES.has(p.type))
    .map((p) => hhmmToMinutes(p.startTime))
    .filter((n) => n != null);

  if (todayStarts.length) {
    return { startMinutes: Math.min(...todayStarts), timeZone };
  }

  const academyStart =
    version.periodTemplate?.academyStartTime ||
    grid.version?.periodTemplate?.academyStartTime;
  return { startMinutes: hhmmToMinutes(academyStart), timeZone };
}

async function resolveStudentAttendanceStatus(studentId, checkIn = new Date()) {
  const grace = Number(process.env.AI_ATTENDANCE_LATE_GRACE_MINUTES) || 0;
  const { startMinutes, timeZone } = await getStudentFirstPeriodStartMinutes(studentId, checkIn);
  const checkInMinutes = minutesSinceMidnight(checkIn, timeZone);
  return statusFromMinutes(checkInMinutes, startMinutes, grace);
}

function resolveFallbackAttendanceStatus(checkIn = new Date()) {
  const checkInMinutes = minutesSinceMidnight(checkIn, DEFAULT_TZ);
  return statusFromMinutes(checkInMinutes, null, 0);
}

module.exports = {
  resolveStudentAttendanceStatus,
  resolveFallbackAttendanceStatus,
  getStudentFirstPeriodStartMinutes,
  hhmmToMinutes,
};
