const ApiError = require('../utils/ApiError');
const Session = require('../models/Session');
const User = require('../models/User');
const TimetableVersion = require('../models/timetable/TimetableVersion');
const ScheduleSlot = require('../models/timetable/ScheduleSlot');
require('../models/academy/AcademyClass');
require('../models/academy/AcademySection');
require('../models/academy/AcademySubject');
const Role = require('../models/Role');
const StaffPeriodAttendance = require('../models/StaffPeriodAttendance');
const StaffAttendance = require('../models/StaffAttendance');
const StaffExtraClass = require('../models/StaffExtraClass');
const PeriodTemplate = require('../models/timetable/PeriodTemplate');
const AcademySection = require('../models/academy/AcademySection');
const AcademySubject = require('../models/academy/AcademySubject');
const {
  weekdayName,
  dayBounds,
  todayYmd,
  formatDateInTz,
  minutesSinceMidnight,
} = require('../utils/schoolDay');
const { publicEmail } = require('../config/staffRoles');
const { holidayClosureForSession } = require('./holidayService');
const { staffGraceMinutes: graceMinutes, hhmmToMinutes } = require('./aiAttendance/attendanceStatusFromTimetable');

/** left_early is only ever set by an admin (it counts as missed, like absent). */
const PERIOD_STATUSES = new Set(['present', 'late', 'absent', 'leave', 'left_early']);
/** Non-teaching staff are marked once per day instead of per class. */
const DAY_PERIOD_KEY = 'day';
const NON_DAILY_ROLES = ['teacher', 'parent', 'student'];
const CLASS_PERIOD_TYPES = new Set(['lecture']);

function pad2(n) {
  return String(n).padStart(2, '0');
}

function emptyCounts() {
  return { totalClasses: 0, present: 0, late: 0, absent: 0, leave: 0, left_early: 0 };
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

function minutesToHhmm(mins) {
  if (mins == null) return '';
  return `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
}

/** Check-in / last check-out as HH:MM in the school timezone (for the review screen). */
function scanTimes(daily, timeZone) {
  const inMin = daily?.checkIn ? minutesSinceMidnight(new Date(daily.checkIn), timeZone) : null;
  const outMin = daily?.checkOut ? minutesSinceMidnight(new Date(daily.checkOut), timeZone) : null;
  return { inMin, outMin, checkInTime: minutesToHhmm(inMin), checkOutTime: minutesToHhmm(outMin) };
}

/** Minutes since midnight now, or null when `day` is a past day (everything has ended). */
function nowMinutesFor(day, timeZone) {
  return day === todayYmd(timeZone) ? minutesSinceMidnight(new Date(), timeZone) : null;
}

/**
 * One gate phone can't prove when a teacher left — only when it last saw them. So a class
 * that ran after the last check-out scan is never changed automatically: it keeps its
 * check-in status and is flagged for the admin to confirm (left early / absent / present).
 * Only classes that have already ended are flagged, so today's later classes stay quiet.
 */
function reviewFor(row, daily, times, nowMin) {
  if (!daily?.checkIn || times.outMin == null) return null;
  const end = hhmmToMinutes(row.endTime);
  if (end == null) return null;
  if (nowMin != null && nowMin < end) return null;
  if (times.outMin >= end - graceMinutes()) return null;
  return {
    review: 'left_early',
    reviewNote: `Last check-out ${times.checkOutTime}, before this class ended`,
  };
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

function publicPeriod(row, status, review = null) {
  return {
    review: review?.review || null,
    reviewNote: review?.reviewNote || '',
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
    ...(row.extra
      ? {
          isExtra: true,
          extraClassId: row.extra.id,
          extraReason: row.extra.reason,
          coveringForName: row.extra.coveringForName,
          extraNote: row.extra.note,
        }
      : {}),
  };
}

function teacherShape(user, periods, attendanceType = 'class', scan = {}) {
  const counts = emptyCounts();
  periods.forEach((p) => addStatus(counts, p.status));
  return {
    checkInTime: scan.checkInTime || '',
    checkOutTime: scan.checkOutTime || '',
    /** 'no_checkout' = checked in but never scanned out on a finished school day. */
    reviewReason: scan.reviewReason || '',
    needsReview: periods.filter((p) => p.review).length + (scan.reviewReason ? 1 : 0),
    attendanceType,
    userId: String(user._id),
    name: user.name || '',
    email: publicEmail(user.email),
    profileImage: user.profileImage || '',
    isActive: user.isActive !== false,
    role: user.role && typeof user.role === 'object' ? user.role.name || '' : '',
    ...counts,
    /** Classes added for a date outside the timetable (already inside totalClasses). */
    extraClasses: periods.filter((p) => p.isExtra).length,
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

function periodsForTeacher(
  byWeekday,
  weekday,
  teacherId,
  day,
  markMap,
  dailyMap,
  timeZone,
  extrasMap = new Map(),
  includeTimetable = true
) {
  const byPeriod = includeTimetable ? byWeekday.get(weekday)?.get(teacherId) : null;
  const extras = extrasMap.get(`${teacherId}|${day}`) || [];
  if (!byPeriod && !extras.length) return [];
  const daily = dailyMap.get(`${teacherId}|${day}`);
  const times = scanTimes(daily, timeZone);
  const nowMin = nowMinutesFor(day, timeZone);
  return sortPeriods([...(byPeriod ? byPeriod.values() : []), ...extras]).map((row) => {
    const saved = markMap.get(`${teacherId}|${day}|${row.periodKey}`);
    // A saved mark is the admin's decision — nothing left to review.
    if (saved) return publicPeriod(row, saved);
    // Extra classes are absent until the admin marks them — a gate check-in alone
    // does not prove the extra class was taken.
    if (row.extra) return publicPeriod(row, 'absent');
    const status = autoPeriodStatus(row, daily, timeZone);
    const review = status === 'present' || status === 'late' ? reviewFor(row, daily, times, nowMin) : null;
    return publicPeriod(row, status, review);
  });
}

/**
 * Check-in / check-out times for one teacher's day, plus 'no_checkout' when they checked in
 * but never scanned out and their last class of the day is over.
 */
function teacherScan(teacherId, day, periods, dailyMap, timeZone) {
  const daily = dailyMap.get(`${teacherId}|${day}`);
  const times = scanTimes(daily, timeZone);
  let reviewReason = '';
  if (daily?.checkIn && times.outMin == null && periods.length) {
    const lastEnd = Math.max(...periods.map((p) => hhmmToMinutes(p.endTime) ?? 0));
    const nowMin = nowMinutesFor(day, timeZone);
    if (nowMin == null || nowMin >= lastEnd) reviewReason = 'no_checkout';
  }
  return { checkInTime: times.checkInTime, checkOutTime: times.checkOutTime, reviewReason };
}

/** Full-day row status: saved mark, else from the daily check-in, else absent. */
function dayStatusFor(userId, day, markMap, dailyMap) {
  return (
    markMap.get(`${userId}|${day}|${DAY_PERIOD_KEY}`) ||
    autoDayStatus(dailyMap.get(`${userId}|${day}`))
  );
}

function savedOnDay(markMap, userId, day) {
  const prefix = `${userId}|${day}|`;
  for (const key of markMap.keys()) {
    if (key.startsWith(prefix)) return true;
  }
  return false;
}

function holidayShape(user, attendanceType, holidayName) {
  return {
    ...teacherShape(user, [], attendanceType, {}),
    holidayName,
  };
}

async function listDay({ sessionId, date, userId }) {
  const session = await resolveSession(sessionId);
  const ymd = dayBounds(date, session.timezone).ymd;
  const weekday = weekdayForDay(ymd, session.timezone);
  const byWeekday = await loadWeekdayPeriods(sessionId);
  const byTeacher = byWeekday.get(weekday) || new Map();
  const extrasMap = await extrasForDays(session._id, [ymd], userId || undefined);
  const idSet = new Set(byTeacher.keys());
  extrasMap.forEach((_rows, key) => idSet.add(key.split('|')[0]));
  let teacherIds = [...idSet];
  if (userId) teacherIds = teacherIds.filter((id) => id === String(userId));

  const users = await teacherUsers(teacherIds);
  const [markMap, dailyMap] = await Promise.all([
    marksForDays(sessionId, [ymd], userId || undefined),
    dailyMarksForDays([ymd], userId || undefined),
  ]);
  const closure = await holidayClosureForSession(session._id);
  const closed = closure(ymd);

  const classTeachers = teacherIds
    .map((id) => users.get(id))
    .filter(Boolean)
    .map((user) => {
      const id = String(user._id);
      const holidayOff =
        closed.teachers && !savedOnDay(markMap, id, ymd) && !dailyMap.has(`${id}|${ymd}`);
      // On a holiday only extra classes deliberately added for that date still count.
      if (holidayOff && !extrasMap.has(`${id}|${ymd}`)) {
        return holidayShape(user, 'class', closed.name);
      }
      const periods = periodsForTeacher(
        byWeekday,
        weekday,
        id,
        ymd,
        markMap,
        dailyMap,
        session.timezone,
        extrasMap,
        !holidayOff
      );
      return teacherShape(user, periods, 'class', teacherScan(id, ymd, periods, dailyMap, session.timezone));
    });

  let dailyStaff = [];
  if (isWorkingDay(session, weekday)) {
    const exclude = allTimetableTeacherIds(byWeekday);
    teacherIds.forEach((id) => exclude.add(id));
    dailyStaff = (await dailyStaffUsers(exclude))
      .filter((user) => !userId || String(user._id) === String(userId))
      .map((user) => {
        const id = String(user._id);
        if (
          closed.staff &&
          !markMap.get(`${id}|${ymd}|${DAY_PERIOD_KEY}`) &&
          !dailyMap.has(`${id}|${ymd}`)
        ) {
          return holidayShape(user, 'daily', closed.name);
        }
        return teacherShape(
          user,
          [dayPeriod(dayStatusFor(user._id, ymd, markMap, dailyMap))],
          'daily',
          scanTimes(dailyMap.get(`${user._id}|${ymd}`), session.timezone)
        );
      });
  }

  const teachers = [...classTeachers, ...dailyStaff].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );

  const summary = { ...emptyCounts(), needsReview: 0, extraClasses: 0 };
  teachers.forEach((t) => {
    summary.totalClasses += t.totalClasses;
    summary.present += t.present;
    summary.late += t.late;
    summary.absent += t.absent;
    summary.leave += t.leave;
    summary.left_early += t.left_early;
    summary.needsReview += t.needsReview;
    summary.extraClasses += t.extraClasses || 0;
  });

  return {
    date: ymd,
    weekday,
    sessionId: String(session._id),
    sessionName: session.name || '',
    holiday: closed.teachers || closed.staff ? { name: closed.name, teachers: closed.teachers, staff: closed.staff } : null,
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
  // Days after today have not happened yet — they would all count as absent.
  const today = todayYmd(session.timezone);
  const pastDays = days.filter(({ day }) => day <= today);
  const extrasMap = await extrasForDays(
    session._id,
    pastDays.map((d) => d.day),
    userId || undefined
  );
  extrasMap.forEach((_rows, key) => teacherIds.add(key.split('|')[0]));
  let ids = [...teacherIds];
  if (userId) ids = ids.filter((id) => id === String(userId));

  const users = await teacherUsers(ids);
  const closure = await holidayClosureForSession(session._id);
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
        const closed = closure(day);
        const holidayOff =
          closed.teachers &&
          !savedOnDay(markMap, String(user._id), day) &&
          !dailyMap.has(`${user._id}|${day}`);
        if (holidayOff && !extrasMap.has(`${user._id}|${day}`)) {
          return;
        }
        periodsForTeacher(
          byWeekday,
          weekday,
          String(user._id),
          day,
          markMap,
          dailyMap,
          session.timezone,
          extrasMap,
          !holidayOff
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
        workingDays.map(({ day, weekday }) => {
          const closed = closure(day);
          if (
            closed.staff &&
            !markMap.get(`${user._id}|${day}|${DAY_PERIOD_KEY}`) &&
            !dailyMap.has(`${user._id}|${day}`)
          ) {
            return null;
          }
          return {
            day,
            weekday,
            ...dayPeriod(dayStatusFor(user._id, day, markMap, dailyMap)),
          };
        }).filter(Boolean),
        'daily'
      )
    );

  const teachers = [...classTeachers, ...dailyStaff].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );

  const summary = { ...emptyCounts(), needsReview: 0, extraClasses: 0 };
  teachers.forEach((t) => {
    summary.totalClasses += t.totalClasses;
    summary.present += t.present;
    summary.late += t.late;
    summary.absent += t.absent;
    summary.leave += t.leave;
    summary.left_early += t.left_early;
    summary.needsReview += t.needsReview;
    summary.extraClasses += t.extraClasses || 0;
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

// ─── Extra classes (taken on a date, not on the timetable) ─────────────────────

const EXTRA_KEY_PREFIX = 'extra:';
const EXTRA_REASONS = new Set(['extra', 'makeup', 'cover']);
const EXTRA_REASON_LABELS = { extra: 'Extra class', makeup: 'Make-up class', cover: 'Covering' };

/** Extra classes for the given days, as period rows keyed `${userId}|${day}`. */
async function extrasForDays(sessionId, days, userId) {
  const map = new Map();
  if (!days.length) return map;
  const q = { sessionId, day: { $in: days } };
  if (userId) q.userId = userId;
  const rows = await StaffExtraClass.find(q)
    .populate('classId', 'className')
    .populate('sectionId', 'sectionName')
    .populate('subjectId', 'subjectName')
    .populate('coveringFor', 'name')
    .lean();
  rows.forEach((row) => {
    const key = `${row.userId}|${row.day}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({
      periodKey: `${EXTRA_KEY_PREFIX}${row._id}`,
      label: row.label || EXTRA_REASON_LABELS[row.reason] || 'Extra class',
      startTime: row.startTime,
      endTime: row.endTime,
      order: Number(row.order) || 0,
      classes: [
        {
          id: String(row._id),
          className: row.classId?.className || '',
          sectionName: row.sectionId?.sectionName || '',
          subjectName: row.subjectId?.subjectName || '',
        },
      ],
      extra: {
        id: String(row._id),
        reason: row.reason || 'extra',
        coveringForName: row.coveringFor?.name || '',
        note: row.note || '',
      },
    });
  });
  return map;
}

/**
 * Period configuration that applies to a section: its published timetable's template,
 * else the session's default (or first active) configuration.
 */
async function templateForSection(sessionId, sectionId) {
  if (sectionId) {
    const version = await TimetableVersion.findOne({
      session: sessionId,
      section: sectionId,
      status: 'published',
    })
      .select('periodTemplate')
      .lean();
    if (version?.periodTemplate) {
      const t = await PeriodTemplate.findById(version.periodTemplate).lean();
      if (t) return t;
    }
  }
  return (
    (await PeriodTemplate.findOne({
      session: sessionId,
      isDefault: true,
      isActive: { $ne: false },
    }).lean()) ||
    (await PeriodTemplate.findOne({ session: sessionId, isActive: { $ne: false } })
      .sort({ createdAt: 1 })
      .lean())
  );
}

function lectureSlots(template) {
  return (template?.slots || [])
    .filter((slot) => !slot.type || CLASS_PERIOD_TYPES.has(slot.type))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

/** Configured lecture periods a new extra class can be placed in. */
async function extraClassPeriodOptions({ sessionId, sectionId }) {
  const session = await resolveSession(sessionId);
  const template = await templateForSection(session._id, sectionId);
  return {
    periodTemplateId: template ? String(template._id) : '',
    periodTemplateName: template?.name || '',
    periods: lectureSlots(template).map((slot) => ({
      _id: String(slot._id),
      label: slot.label,
      startTime: slot.startTime,
      endTime: slot.endTime,
      order: slot.order,
    })),
  };
}

async function createExtraClass(body, actorId) {
  const session = await resolveSession(body.sessionId);
  const ymd = dayBounds(body.date, session.timezone).ymd;
  const userId = String(body.userId || '');
  if (!userId) throw new ApiError(400, 'Select a teacher');
  if (!body.classId) throw new ApiError(400, 'Select a class');
  if (!body.subjectId) throw new ApiError(400, 'Select a subject');
  if (!body.periodId) throw new ApiError(400, 'Select a period');
  const reason = EXTRA_REASONS.has(body.reason) ? body.reason : 'extra';

  const teacher = await User.findById(userId).select('name role').populate('role', 'name').lean();
  if (!teacher) throw new ApiError(404, 'Teacher not found');
  const roleName = teacher.role && typeof teacher.role === 'object' ? teacher.role.name : '';
  if (roleName !== 'teacher') {
    throw new ApiError(400, 'Extra classes can only be added for teachers');
  }

  if (body.sectionId) {
    const section = await AcademySection.findById(body.sectionId).select('classId').lean();
    if (!section || String(section.classId) !== String(body.classId)) {
      throw new ApiError(400, 'That section does not belong to the selected class');
    }
  }
  const subject = await AcademySubject.findById(body.subjectId).select('classId').lean();
  if (!subject || String(subject.classId) !== String(body.classId)) {
    throw new ApiError(400, 'That subject does not belong to the selected class');
  }

  const template = await templateForSection(session._id, body.sectionId);
  const slot = lectureSlots(template).find((s) => String(s._id) === String(body.periodId));
  if (!slot) throw new ApiError(400, 'That period is not in the timetable configuration');

  let coveringFor = null;
  if (reason === 'cover' && body.coveringFor) {
    if (String(body.coveringFor) === userId) {
      throw new ApiError(400, 'A teacher cannot cover for themselves');
    }
    coveringFor = body.coveringFor;
  }

  // Clash with the teacher's own timetable class in the same period that day.
  const weekday = weekdayForDay(ymd, session.timezone);
  const byWeekday = await loadWeekdayPeriods(session._id);
  const own = byWeekday.get(weekday)?.get(userId);
  if (own?.has(periodKeyOf(slot.startTime, slot.endTime))) {
    throw new ApiError(
      400,
      `${teacher.name || 'This teacher'} already has a timetable class in ${slot.label}`
    );
  }

  try {
    const doc = await StaffExtraClass.create({
      userId,
      sessionId: session._id,
      day: ymd,
      periodTemplateId: template?._id,
      periodSlotId: slot._id,
      label: slot.label,
      startTime: slot.startTime,
      endTime: slot.endTime,
      order: slot.order,
      classId: body.classId,
      sectionId: body.sectionId || null,
      subjectId: body.subjectId,
      reason,
      coveringFor,
      note: String(body.note || '').slice(0, 300),
      createdBy: actorId,
    });
    return { _id: String(doc._id), day: ymd };
  } catch (err) {
    if (err?.code === 11000) {
      throw new ApiError(
        409,
        `${teacher.name || 'This teacher'} already has an extra class in ${slot.label}`
      );
    }
    throw err;
  }
}

async function getExtraClass(id) {
  const doc = await StaffExtraClass.findById(id).lean();
  if (!doc) throw new ApiError(404, 'Extra class not found');
  return doc;
}

async function deleteExtraClass(id) {
  const doc = await getExtraClass(id);
  await StaffPeriodAttendance.deleteMany({
    userId: doc.userId,
    sessionId: doc.sessionId,
    day: doc.day,
    periodKey: `${EXTRA_KEY_PREFIX}${doc._id}`,
  });
  await StaffExtraClass.deleteOne({ _id: doc._id });
  return { _id: String(doc._id) };
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
      throw new ApiError(400, 'Status must be present, absent, late, leave, or left early');
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
  extraClassPeriodOptions,
  createExtraClass,
  getExtraClass,
  deleteExtraClass,
};
