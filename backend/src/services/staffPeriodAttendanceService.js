const ApiError = require('../utils/ApiError');
const Session = require('../models/Session');
const User = require('../models/User');
const TimetableVersion = require('../models/timetable/TimetableVersion');
const ScheduleSlot = require('../models/timetable/ScheduleSlot');
require('../models/timetable/PeriodTemplate');
require('../models/academy/AcademyClass');
require('../models/academy/AcademySection');
require('../models/academy/AcademySubject');
const Role = require('../models/Role');
const StaffPeriodAttendance = require('../models/StaffPeriodAttendance');
const StaffAttendance = require('../models/StaffAttendance');
const {
  weekdayName,
  dayBounds,
  todayYmd,
  formatDateInTz,
  minutesSinceMidnight,
} = require('../utils/schoolDay');
const { publicEmail } = require('../config/staffRoles');
const { graceMinutes, hhmmToMinutes } = require('./aiAttendance/attendanceStatusFromTimetable');

const PERIOD_STATUSES = new Set(['present', 'late', 'absent', 'leave']);
/** Non-teaching staff are marked once per day instead of per class. */
const DAY_PERIOD_KEY = 'day';
const NON_DAILY_ROLES = ['teacher', 'parent', 'student'];
const CLASS_PERIOD_TYPES = new Set(['lecture']);

function pad2(n) {
  return String(n).padStart(2, '0');
}

function emptyCounts() {
  return { totalClasses: 0, present: 0, late: 0, absent: 0, leave: 0 };
}

function addStatus(counts, status) {
  counts.totalClasses += 1;
  // Statuses are already resolved (saved mark → camera check-in → absent).
  counts[PERIOD_STATUSES.has(status) ? status : 'absent'] += 1;
}

function attendancePercent(counts) {
  if (!counts.totalClasses) return 0;
  const taken = counts.present + counts.late;
  return Math.round((taken / counts.totalClasses) * 1000) / 10;
}

function classLabel(row) {
  return (row.classes || [])
    .map((c) => c.className)
    .filter(Boolean)
    .filter((name, i, all) => all.indexOf(name) === i)
    .join(', ');
}

function sectionLabel(row) {
  return (row.classes || [])
    .map((c) => c.sectionName)
    .filter(Boolean)
    .filter((name, i, all) => all.indexOf(name) === i)
    .join(', ');
}

function subjectLabel(row) {
  return (row.classes || [])
    .map((c) => c.subjectName)
    .filter(Boolean)
    .filter((name, i, all) => all.indexOf(name) === i)
    .join(', ');
}

function periodKeyOf(startTime, endTime) {
  return `${startTime}|${endTime}`;
}

async function resolveSession(sessionId) {
  if (!sessionId) throw new ApiError(400, 'Select an academic session');
  const session = await Session.findById(sessionId).select('name timezone workingDays').lean();
  if (!session) throw new ApiError(404, 'Session not found');
  return session;
}

function weekdayForDay(ymd, timeZone) {
  const { start } = dayBounds(ymd, timeZone);
  return weekdayName(start, timeZone);
}

function daysInMonth(month, year, timeZone) {
  const m = Number(month);
  const y = Number(year);
  if (!m || !y || m < 1 || m > 12) throw new ApiError(400, 'Invalid month/year');
  const last = new Date(y, m, 0).getDate();
  const days = [];
  for (let d = 1; d <= last; d += 1) {
    const ymd = `${y}-${pad2(m)}-${pad2(d)}`;
    days.push({ day: ymd, weekday: weekdayForDay(ymd, timeZone) });
  }
  return days;
}

/**
 * Published lecture periods grouped by weekday, then teacher, then period time.
 * Class, section, subject, and time all come from the timetable.
 */
async function loadWeekdayPeriods(sessionId) {
  const versions = await TimetableVersion.find({ session: sessionId, status: 'published' })
    .select('_id periodTemplate')
    .populate({ path: 'periodTemplate', select: 'slots' })
    .lean();

  const periodByVersion = new Map();
  versions.forEach((version) => {
    const map = new Map();
    (version.periodTemplate?.slots || []).forEach((slot) => {
      map.set(String(slot._id), slot);
    });
    periodByVersion.set(String(version._id), map);
  });

  if (!versions.length) {
    return new Map();
  }

  const slots = await ScheduleSlot.find({
    timetableVersion: { $in: versions.map((v) => v._id) },
    cancelled: { $ne: true },
  })
    .populate('class', 'className')
    .populate('section', 'sectionName')
    .populate('subject', 'subjectName')
    .populate('parallelEntries.subject', 'subjectName')
    .lean();

  /** weekday -> teacherId -> periodKey -> period */
  const byWeekday = new Map();

  const ensurePeriod = (weekday, teacherId, period) => {
    if (!byWeekday.has(weekday)) byWeekday.set(weekday, new Map());
    const byTeacher = byWeekday.get(weekday);
    if (!byTeacher.has(teacherId)) byTeacher.set(teacherId, new Map());
    const byPeriod = byTeacher.get(teacherId);
    const key = periodKeyOf(period.startTime, period.endTime);
    if (!byPeriod.has(key)) {
      byPeriod.set(key, {
        periodKey: key,
        label: period.label || '',
        startTime: period.startTime,
        endTime: period.endTime,
        order: Number(period.order) || 0,
        classes: [],
      });
    }
    return byPeriod.get(key);
  };

  const pushClass = (bucket, classDoc, sectionDoc, subjectDoc) => {
    const className = classDoc?.className || '';
    const sectionName = sectionDoc?.sectionName || '';
    const subjectName = subjectDoc?.subjectName || '';
    const id = `${className}|${sectionName}|${subjectName}`;
    if (bucket.classes.some((c) => c.id === id)) return;
    bucket.classes.push({ id, className, sectionName, subjectName });
  };

  slots.forEach((slot) => {
    const period = periodByVersion.get(String(slot.timetableVersion))?.get(String(slot.periodId));
    if (!period?.startTime || !period?.endTime) return;
    if (period.type && !CLASS_PERIOD_TYPES.has(period.type)) return;

    const weekday = String(slot.day || '').toLowerCase();
    const assignments = [];
    if (slot.teacher) {
      assignments.push({ teacherId: String(slot.teacher), subject: slot.subject });
    }
    (slot.parallelEntries || []).forEach((entry) => {
      if (!entry?.teacher) return;
      assignments.push({ teacherId: String(entry.teacher), subject: entry.subject });
    });

    assignments.forEach(({ teacherId, subject }) => {
      const bucket = ensurePeriod(weekday, teacherId, period);
      pushClass(bucket, slot.class, slot.section, subject);
    });
  });

  byWeekday.forEach((byTeacher) => {
    byTeacher.forEach((byPeriod) => {
      byPeriod.forEach((row) => {
        row.classes.sort((a, b) =>
          `${a.className}${a.sectionName}${a.subjectName}`.localeCompare(
            `${b.className}${b.sectionName}${b.subjectName}`
          )
        );
      });
    });
  });

  return byWeekday;
}

async function teacherUsers(ids) {
  if (!ids.length) return new Map();
  const users = await User.find({ _id: { $in: ids } })
    .select('name email role isActive profileImage designation')
    .populate('role', 'name')
    .lean();
  return new Map(users.map((u) => [String(u._id), u]));
}

/**
 * Non-teaching staff (accountant, admin, custom staff roles) get one full-day
 * mark per working day instead of per-class marks. Anyone on the timetable is
 * treated as a teacher and left out here.
 */
async function dailyStaffUsers(timetableTeacherIds) {
  const roles = await Role.find({ name: { $nin: NON_DAILY_ROLES } })
    .select('_id')
    .lean();
  if (!roles.length) return [];
  const users = await User.find({
    role: { $in: roles.map((r) => r._id) },
    isActive: { $ne: false },
    _id: { $nin: [...timetableTeacherIds] },
  })
    .select('name email role isActive profileImage designation')
    .populate('role', 'name')
    .lean();
  return users;
}

function isWorkingDay(session, weekday) {
  const days = Array.isArray(session.workingDays) ? session.workingDays : [];
  return days.length === 0 || days.includes(weekday);
}

/** Saved period mark when there is one; otherwise the camera-derived status (default absent). */
function defaultStatus(status, fallback = 'absent') {
  return PERIOD_STATUSES.has(status) ? status : fallback;
}

/**
 * Daily check-in rows (AI camera / manual / auto-absent) for the given days, keyed
 * `${userId}|${YYYY-MM-DD}`. Used to fill periods that have no saved mark.
 */
async function dailyMarksForDays(days, userId) {
  const map = new Map();
  if (!days.length) return map;
  const sorted = [...days].sort();
  const { start } = dayBounds(sorted[0]);
  const { end } = dayBounds(sorted[sorted.length - 1]);
  const q = { date: { $gte: start, $lte: end } };
  if (userId) q.userId = userId;
  const rows = await StaffAttendance.find(q).select('userId date status checkIn').lean();
  rows.forEach((row) => {
    map.set(`${row.userId}|${formatDateInTz(row.date)}`, row);
  });
  return map;
}

/** Full-day row (non-teaching staff): absent until the camera / admin marks the day. */
function autoDayStatus(daily) {
  if (!daily) return 'absent';
  if (daily.status === 'leave') return 'leave';
  if (daily.status === 'late') return 'late';
  if (daily.status === 'present' || daily.status === 'half_day' || daily.checkIn) return 'present';
  return 'absent';
}

/**
 * Class period with no saved mark: absent by default. Once the teacher has checked in
 * (camera or manual time): present if in by period start + grace, late if in before the
 * period ends, absent if they arrived after it ended.
 */
function autoPeriodStatus(row, daily, timeZone) {
  if (!daily) return 'absent';
  if (daily.status === 'leave') return 'leave';
  if (!daily.checkIn) {
    return daily.status === 'present' || daily.status === 'late' ? daily.status : 'absent';
  }
  const inAt = minutesSinceMidnight(new Date(daily.checkIn), timeZone);
  const start = hhmmToMinutes(row.startTime);
  const end = hhmmToMinutes(row.endTime);
  if (start == null) return daily.status === 'late' ? 'late' : 'present';
  if (inAt <= start + graceMinutes()) return 'present';
  if (end == null || inAt < end) return 'late';
  return 'absent';
}

function dayPeriod(status) {
  return {
    periodKey: DAY_PERIOD_KEY,
    label: 'Full day',
    startTime: '',
    endTime: '',
    classes: [],
    classLabel: '',
    sectionLabel: '',
    subjectLabel: '',
    status: defaultStatus(status),
  };
}

function allTimetableTeacherIds(byWeekday) {
  const ids = new Set();
  byWeekday.forEach((byTeacher) => {
    byTeacher.forEach((_periods, teacherId) => ids.add(teacherId));
  });
  return ids;
}

function sortPeriods(rows) {
  return [...rows].sort((a, b) => {
    const t = String(a.startTime).localeCompare(String(b.startTime));
    if (t !== 0) return t;
    return (a.order || 0) - (b.order || 0);
  });
}

function publicPeriod(row, status) {
  return {
    periodKey: row.periodKey,
    label: row.label,
    startTime: row.startTime,
    endTime: row.endTime,
    classes: row.classes.map(({ className, sectionName, subjectName }) => ({
      className,
      sectionName,
      subjectName,
    })),
    classLabel: classLabel(row),
    sectionLabel: sectionLabel(row),
    subjectLabel: subjectLabel(row),
    status: defaultStatus(status),
  };
}

function teacherShape(user, periods, attendanceType = 'class') {
  const counts = emptyCounts();
  periods.forEach((p) => addStatus(counts, p.status));
  return {
    attendanceType,
    userId: String(user._id),
    name: user.name || '',
    email: publicEmail(user.email),
    profileImage: user.profileImage || '',
    isActive: user.isActive !== false,
    role: user.role && typeof user.role === 'object' ? user.role.name || '' : '',
    ...counts,
    attendancePercent: attendancePercent(counts),
    periods,
  };
}

async function marksForDays(sessionId, days, userId) {
  const q = { sessionId, day: { $in: days } };
  if (userId) q.userId = userId;
  const rows = await StaffPeriodAttendance.find(q).select('userId day periodKey status').lean();
  const map = new Map();
  rows.forEach((row) => {
    map.set(`${row.userId}|${row.day}|${row.periodKey}`, row.status);
  });
  return map;
}

function periodsForTeacher(byWeekday, weekday, teacherId, day, markMap, dailyMap, timeZone) {
  const byPeriod = byWeekday.get(weekday)?.get(teacherId);
  if (!byPeriod) return [];
  const daily = dailyMap.get(`${teacherId}|${day}`);
  return sortPeriods([...byPeriod.values()]).map((row) =>
    publicPeriod(
      row,
      markMap.get(`${teacherId}|${day}|${row.periodKey}`) || autoPeriodStatus(row, daily, timeZone)
    )
  );
}

/** Full-day row status: saved mark, else from the daily check-in, else absent. */
function dayStatusFor(userId, day, markMap, dailyMap) {
  return (
    markMap.get(`${userId}|${day}|${DAY_PERIOD_KEY}`) ||
    autoDayStatus(dailyMap.get(`${userId}|${day}`))
  );
}

async function listDay({ sessionId, date, userId }) {
  const session = await resolveSession(sessionId);
  const ymd = dayBounds(date, session.timezone).ymd;
  const weekday = weekdayForDay(ymd, session.timezone);
  const byWeekday = await loadWeekdayPeriods(sessionId);
  const byTeacher = byWeekday.get(weekday) || new Map();
  let teacherIds = [...byTeacher.keys()];
  if (userId) teacherIds = teacherIds.filter((id) => id === String(userId));

  const users = await teacherUsers(teacherIds);
  const [markMap, dailyMap] = await Promise.all([
    marksForDays(sessionId, [ymd], userId || undefined),
    dailyMarksForDays([ymd], userId || undefined),
  ]);

  const classTeachers = teacherIds
    .map((id) => users.get(id))
    .filter(Boolean)
    .map((user) =>
      teacherShape(
        user,
        periodsForTeacher(byWeekday, weekday, String(user._id), ymd, markMap, dailyMap, session.timezone)
      )
    );

  let dailyStaff = [];
  if (isWorkingDay(session, weekday)) {
    dailyStaff = (await dailyStaffUsers(allTimetableTeacherIds(byWeekday)))
      .filter((user) => !userId || String(user._id) === String(userId))
      .map((user) =>
        teacherShape(
          user,
          [dayPeriod(dayStatusFor(user._id, ymd, markMap, dailyMap))],
          'daily'
        )
      );
  }

  const teachers = [...classTeachers, ...dailyStaff].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );

  const summary = emptyCounts();
  teachers.forEach((t) => {
    summary.totalClasses += t.totalClasses;
    summary.present += t.present;
    summary.late += t.late;
    summary.absent += t.absent;
    summary.leave += t.leave;
  });

  return {
    date: ymd,
    weekday,
    sessionId: String(session._id),
    sessionName: session.name || '',
    teachers,
    summary: { ...summary, attendancePercent: attendancePercent(summary) },
  };
}

async function listMonth({ sessionId, month, year, userId }) {
  const session = await resolveSession(sessionId);
  const days = daysInMonth(month, year, session.timezone);
  const byWeekday = await loadWeekdayPeriods(sessionId);

  const teacherIds = new Set();
  byWeekday.forEach((byTeacher) => {
    byTeacher.forEach((_periods, teacherId) => teacherIds.add(teacherId));
  });
  let ids = [...teacherIds];
  if (userId) ids = ids.filter((id) => id === String(userId));

  const users = await teacherUsers(ids);
  // Days after today have not happened yet — they would all count as absent.
  const today = todayYmd(session.timezone);
  const pastDays = days.filter(({ day }) => day <= today);
  const [markMap, dailyMap] = await Promise.all([
    marksForDays(
      sessionId,
      pastDays.map((d) => d.day),
      userId || undefined
    ),
    dailyMarksForDays(
      pastDays.map((d) => d.day),
      userId || undefined
    ),
  ]);

  const classTeachers = ids
    .map((id) => users.get(id))
    .filter(Boolean)
    .map((user) => {
      const detail = [];
      pastDays.forEach(({ day, weekday }) => {
        periodsForTeacher(
          byWeekday,
          weekday,
          String(user._id),
          day,
          markMap,
          dailyMap,
          session.timezone
        ).forEach((period) => {
          detail.push({
            day,
            weekday,
            ...period,
          });
        });
      });
      const shaped = teacherShape(user, detail);
      return shaped;
    });

  const workingDays = pastDays.filter(({ weekday }) => isWorkingDay(session, weekday));
  const dailyStaff = (await dailyStaffUsers(teacherIds))
    .filter((user) => !userId || String(user._id) === String(userId))
    .map((user) =>
      teacherShape(
        user,
        workingDays.map(({ day, weekday }) => ({
          day,
          weekday,
          ...dayPeriod(dayStatusFor(user._id, day, markMap, dailyMap)),
        })),
        'daily'
      )
    );

  const teachers = [...classTeachers, ...dailyStaff].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );

  const summary = emptyCounts();
  teachers.forEach((t) => {
    summary.totalClasses += t.totalClasses;
    summary.present += t.present;
    summary.late += t.late;
    summary.absent += t.absent;
    summary.leave += t.leave;
  });

  return {
    month: Number(month),
    year: Number(year),
    sessionId: String(session._id),
    sessionName: session.name || '',
    days,
    workingDays: Array.isArray(session.workingDays) ? session.workingDays : [],
    teachers,
    summary: { ...summary, attendancePercent: attendancePercent(summary) },
  };
}

async function saveMarks({ sessionId, date, marks, markedBy }) {
  if (!Array.isArray(marks) || marks.length === 0) {
    throw new ApiError(400, 'Select a status for at least one period');
  }
  const day = await listDay({ sessionId, date });
  const allowed = new Map();
  day.teachers.forEach((teacher) => {
    teacher.periods.forEach((period) => {
      allowed.set(`${teacher.userId}|${period.periodKey}`, true);
    });
  });

  const ops = [];
  marks.forEach((mark) => {
    const userId = String(mark.userId || '');
    const periodKey = String(mark.periodKey || '');
    const status = String(mark.status || '');
    if (status && !PERIOD_STATUSES.has(status)) {
      throw new ApiError(400, 'Status must be present, absent, late, or leave');
    }
    if (!allowed.has(`${userId}|${periodKey}`)) {
      throw new ApiError(400, 'That period is not on this teacher’s timetable');
    }
    const filter = { userId, sessionId: day.sessionId, day: day.date, periodKey };
    if (!status) {
      ops.push({ deleteOne: { filter } });
    } else {
      ops.push({
        updateOne: {
          filter,
          update: { $set: { status, markedBy } },
          upsert: true,
        },
      });
    }
  });

  if (ops.length) await StaffPeriodAttendance.bulkWrite(ops);
  return listDay({ sessionId, date: day.date });
}

module.exports = {
  listDay,
  listMonth,
  saveMarks,
  attendancePercent,
};
