const AcademyStudent = require('../../models/academy/AcademyStudent');
const timetableVersionService = require('../timetable/timetableVersionService');

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

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

/**
 * Earliest class start today from the student's published section timetable.
 * Uses lecture/assembly/prayer periods; falls back to academyStartTime, then 09:30.
 */
async function getStudentFirstPeriodStartMinutes(studentId, checkIn) {
  const student = await AcademyStudent.findById(studentId)
    .populate('classId', 'sessionId')
    .select('classId sectionId')
    .lean();
  if (!student) return null;

  const sessionId = student.classId?.sessionId?._id || student.classId?.sessionId;
  const sectionId = student.sectionId?._id || student.sectionId;
  if (!sessionId || !sectionId) return null;

  const version = await timetableVersionService.getPublishedVersion(sessionId, sectionId);
  if (!version) return null;

  const grid = await timetableVersionService.getVersionGrid(version._id);
  const periods = grid.periods || [];
  const weekday = WEEKDAYS[checkIn.getDay()];

  const todayStarts = (grid.slots || [])
    .filter((slot) => String(slot.day || '').toLowerCase() === weekday)
    .map((slot) => periods.find((p) => String(p._id) === String(slot.periodId)))
    .filter(Boolean)
    .filter((p) => !p.type || START_PERIOD_TYPES.has(p.type))
    .map((p) => hhmmToMinutes(p.startTime))
    .filter((n) => n != null);

  if (todayStarts.length) {
    return Math.min(...todayStarts);
  }

  const academyStart =
    version.periodTemplate?.academyStartTime ||
    grid.version?.periodTemplate?.academyStartTime;
  return hhmmToMinutes(academyStart);
}

/**
 * Present if check-in is on/before the first class period (+ optional grace).
 * Late otherwise. Falls back to 09:30 when no timetable is available.
 */
async function resolveStudentAttendanceStatus(studentId, checkIn = new Date()) {
  const checkInMinutes = checkIn.getHours() * 60 + checkIn.getMinutes();
  const grace = Number(process.env.AI_ATTENDANCE_LATE_GRACE_MINUTES) || 0;
  const firstStart = await getStudentFirstPeriodStartMinutes(studentId, checkIn);
  return statusFromMinutes(checkInMinutes, firstStart, grace);
}

function resolveFallbackAttendanceStatus(checkIn = new Date()) {
  const checkInMinutes = checkIn.getHours() * 60 + checkIn.getMinutes();
  return statusFromMinutes(checkInMinutes, null, 0);
}

module.exports = {
  resolveStudentAttendanceStatus,
  resolveFallbackAttendanceStatus,
  getStudentFirstPeriodStartMinutes,
  hhmmToMinutes,
};
