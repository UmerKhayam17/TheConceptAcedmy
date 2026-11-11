/**
 * Decides whether a student is EXPECTED at the academy on a given date.
 *
 * - Section has a published timetable → expected only if that weekday has a class
 *   in one of the student's subjects (full-package / no subjects selected → any class).
 * - No published timetable → expected on the session's working days (default Mon–Sat).
 * - Never expected before the student joined (activatedAt / enrolledAt).
 *
 * Used by the 7:30 PM auto-absent job and the absent / attendance registers so both agree.
 */
const TimetableVersion = require('../../models/timetable/TimetableVersion');
const ScheduleSlot = require('../../models/timetable/ScheduleSlot');
const AcademyClass = require('../../models/academy/AcademyClass');
const Session = require('../../models/Session');
const { formatDateInTz } = require('../../utils/schoolDay');
const { loadStudentHolidayContext } = require('../holidayService');

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

  const sessionByClass = await sessionIdsForStudents(list);
  const sessionIds = [...new Set([...sessionByClass.values()].filter(Boolean))];
  const sessions = sessionIds.length
    ? await Session.find({ _id: { $in: sessionIds } }).select('_id workingDays').lean()
    : [];
  const workingBySession = new Map(
    sessions.map((s) => [
      String(s._id),
      new Set((s.workingDays?.length ? s.workingDays : DEFAULT_WORKING_DAYS).map((d) => String(d).toLowerCase())),
    ])
  );
  const defaultWorking = new Set(DEFAULT_WORKING_DAYS);
  const { isStudentHoliday } = await loadStudentHolidayContext(list);

  function isExpected(student, ymd) {
    const joined = student.activatedAt || student.enrolledAt;
    if (joined && ymd < formatDateInTz(new Date(joined))) return false;
    if (isStudentHoliday(student, ymd)) return false;

    const weekday = weekdayOfYmd(ymd);
    const sectionId = idOf(student.sectionId);

    if (sectionId && sectionsWithTimetable.has(sectionId)) {
      const taught = subjectsByDay.get(`${sectionId}|${weekday}`);
      if (!taught || taught.size === 0) return false;
      const selected = student.selectedSubjects || [];
      if (student.isFullPackage || selected.length === 0) return true;
      return selected.some((id) => taught.has(idOf(id)));
    }

    const sessionId = sessionByClass.get(idOf(student.classId));
    const working = workingBySession.get(sessionId) || defaultWorking;
    return working.has(weekday);
  }

  return { isExpected };
}

module.exports = {
  loadExpectationContext,
  weekdayOfYmd,
};
