/**
 * Decides whether a student is EXPECTED at the academy on a given date.
 *
 * - Section has a published timetable → expected only if that weekday has a class
 *   in one of the student's subjects (full-package / no subjects selected → any class).
 * - No published timetable → expected on the session's working days (default Mon–Sat).
 * - Never expected before the student joined (activatedAt / enrolledAt).
 * - Never expected on a day that is not a working day in the session configuration —
 *   the session's working days win over the timetable.
 *
 * Used by the 7:30 PM auto-absent job and the absent / attendance registers so both agree.
 */
const TimetableVersion = require('../../models/timetable/TimetableVersion');
const ScheduleSlot = require('../../models/timetable/ScheduleSlot');
const AcademyClass = require('../../models/academy/AcademyClass');
const Session = require('../../models/Session');
const { formatDateInTz } = require('../../utils/schoolDay');
const { loadStudentHolidayContext } = require('../holidayService');
const { workingDaysOn } = require('../../utils/workingDays');

const DEFAULT_WORKING_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function weekdayOfYmd(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  return WEEKDAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function idOf(ref) {
  if (!ref) return '';
  return String(ref._id || ref);
}

async function sessionIdsForStudents(students) {
  const sessionByClass = new Map();
  const missingClassIds = new Set();
  students.forEach((s) => {
    const cls = s.classId;
    if (cls && typeof cls === 'object' && cls.sessionId) {
      sessionByClass.set(idOf(cls), idOf(cls.sessionId));
    } else if (cls) {
      missingClassIds.add(idOf(cls));
    }
  });
  if (missingClassIds.size) {
    const classes = await AcademyClass.find({ _id: { $in: [...missingClassIds] } })
      .select('_id sessionId')
      .lean();
    classes.forEach((c) => sessionByClass.set(String(c._id), idOf(c.sessionId)));
  }
  return sessionByClass;
}

const DAY_SHORT = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };
const WEEK_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/** "Mon–Fri", or "Mon, Wed, Fri" when the days are not consecutive. */
function workingDaysText(days) {
  const list = WEEK_ORDER.filter((d) => (days || []).includes(d));
  if (!list.length) return '';
  const first = WEEK_ORDER.indexOf(list[0]);
  const consecutive = list.every((d, i) => WEEK_ORDER.indexOf(d) === first + i);
  if (consecutive && list.length > 2) return `${DAY_SHORT[list[0]]}–${DAY_SHORT[list[list.length - 1]]}`;
  return list.map((d) => DAY_SHORT[d]).join(', ');
}

function capitalizeWord(word) {
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : '';
}

/** "Saturday, 14 Nov 2026 is not a working day (session working days: Mon–Fri)…" */
function offDayMessage(ymd, workingDays) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const pretty = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return (
    `${capitalizeWord(weekdayOfYmd(ymd))}, ${pretty} is not a working day ` +
    `(session working days: ${workingDaysText(workingDays)}). ` +
    'Attendance can only be marked on working days.'
  );
}

/**
 * Working days from each student's session (Configuration → Session → Working days).
 * Returns { isWorkingDay(student, ymd), workingDaysFor(student) }.
 */
async function loadWorkingDayContext(students) {
  const list = students || [];
  const sessionByClass = await sessionIdsForStudents(list);
  const sessionIds = [...new Set([...sessionByClass.values()].filter(Boolean))];
  const sessions = sessionIds.length
    ? await Session.find({ _id: { $in: sessionIds } }).select('_id workingDays workingDaysHistory').lean()
    : [];
  const sessionById = new Map(sessions.map((s) => [String(s._id), s]));

  /** Working days of the student's session that applied on `ymd` (history-aware). */
  function workingDaysFor(student, ymd) {
    const session = sessionById.get(sessionByClass.get(idOf(student.classId)));
    return session ? workingDaysOn(session, ymd) : DEFAULT_WORKING_DAYS;
  }

  function isWorkingDay(student, ymd) {
    return workingDaysFor(student, ymd).includes(weekdayOfYmd(ymd));
  }

  return { isWorkingDay, workingDaysFor };
}

/**
 * Loads timetable + session data once for a set of students.
 * Returns { isExpected(student, ymd) }.
 */
async function loadExpectationContext(students) {
  const list = students || [];
  const sectionIds = [...new Set(list.map((s) => idOf(s.sectionId)).filter(Boolean))];

  const versions = sectionIds.length
    ? await TimetableVersion.find({ section: { $in: sectionIds }, status: 'published' })
        .select('_id section')
        .lean()
    : [];
  const sectionsWithTimetable = new Set(versions.map((v) => String(v.section)));

  /** `${sectionId}|${weekday}` → Set(subjectId) taught that weekday */
  const subjectsByDay = new Map();
  if (versions.length) {
    const slots = await ScheduleSlot.find({
      timetableVersion: { $in: versions.map((v) => v._id) },
      cancelled: { $ne: true },
    })
      .select('section day subject parallelEntries.subject')
      .lean();
    slots.forEach((slot) => {
      const key = `${String(slot.section)}|${String(slot.day).toLowerCase()}`;
      if (!subjectsByDay.has(key)) subjectsByDay.set(key, new Set());
      const set = subjectsByDay.get(key);
      if (slot.subject) set.add(String(slot.subject));
      (slot.parallelEntries || []).forEach((p) => p.subject && set.add(String(p.subject)));
    });
  }

  const { isWorkingDay } = await loadWorkingDayContext(list);
  const { isStudentHoliday } = await loadStudentHolidayContext(list);

  function isExpected(student, ymd) {
    const joined = student.activatedAt || student.enrolledAt;
    if (joined && ymd < formatDateInTz(new Date(joined))) return false;
    if (isStudentHoliday(student, ymd)) return false;
    if (!isWorkingDay(student, ymd)) return false;

    const weekday = weekdayOfYmd(ymd);
    const sectionId = idOf(student.sectionId);

    if (sectionId && sectionsWithTimetable.has(sectionId)) {
      const taught = subjectsByDay.get(`${sectionId}|${weekday}`);
      if (!taught || taught.size === 0) return false;
      const selected = student.selectedSubjects || [];
      if (student.isFullPackage || selected.length === 0) return true;
      return selected.some((id) => taught.has(idOf(id)));
    }

    return true;
  }

  return { isExpected, isWorkingDay };
}

module.exports = {
  loadExpectationContext,
  loadWorkingDayContext,
  workingDaysText,
  offDayMessage,
  weekdayOfYmd,
  DEFAULT_WORKING_DAYS,
};
