const ApiError = require('../../utils/ApiError');
const AcademyStudent = require('../../models/academy/AcademyStudent');
const AcademyAttendance = require('../../models/academy/AcademyAttendance');
const AcademyClass = require('../../models/academy/AcademyClass');
const { loadExpectationContext } = require('./attendanceExpectationService');
const { dayBounds, formatDateInTz, monthBounds } = require('../../utils/schoolDay');
const { sortStudentsByClassThenRoll } = require('../../utils/academyStudentSort');

/** Inclusive calendar-day cap for custom attendance report ranges. */
const MAX_RANGE_DAYS = 93;

function resolveDay(dateStr) {
  try {
    return dayBounds(dateStr);
  } catch (err) {
    throw new ApiError(400, err.message || 'Invalid date');
  }
}

function nextYmd(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

function enumerateYmds(dateFrom, dateTo) {
  const from = resolveDay(dateFrom);
  const to = resolveDay(dateTo);
  if (from.start.getTime() > to.start.getTime()) {
    throw new ApiError(400, 'From date must be on or before To date');
  }
  const days = [];
  let cur = from.ymd;
  while (cur <= to.ymd) {
    days.push(cur);
    if (days.length > MAX_RANGE_DAYS) {
      throw new ApiError(400, `Date range cannot exceed ${MAX_RANGE_DAYS} days`);
    }
    cur = nextYmd(cur);
  }
  return { from, to, days };
}

async function resolveStudents({
  classId,
  sectionId,
  sessionId,
  studentIds,
  studentId,
  scopeFilter = null,
}) {
  const studentQ = { status: 'active' };

  if (Array.isArray(studentIds)) {
    studentQ._id = { $in: studentIds };
  } else if (studentId) {
    studentQ._id = studentId;
  } else if (classId) {
    studentQ.classId = classId;
  } else if (sessionId) {
    const classes = await AcademyClass.find({ sessionId }).select('_id');
    studentQ.classId = { $in: classes.map((c) => c._id) };
  } else if (!scopeFilter) {
    throw new ApiError(400, 'classId, sessionId, or student filter required');
  }
  if (sectionId) studentQ.sectionId = sectionId;

  const filter =
    scopeFilter && Object.keys(scopeFilter).length
      ? { $and: [studentQ, scopeFilter] }
      : studentQ;

  return sortStudentsByClassThenRoll(
    await AcademyStudent.find(filter)
      .populate('classId', 'className classCode sessionId')
      .populate('sectionId', 'sectionName')
      .lean()
  );
}

function preferEarlierCheckIn(records) {
  const recordByStudent = new Map();
  for (const r of records) {
    const key = String(r.studentId);
    const prev = recordByStudent.get(key);
    if (!prev) {
      recordByStudent.set(key, r);
      continue;
    }
    const prevIn = prev.checkIn ? new Date(prev.checkIn).getTime() : Infinity;
    const nextIn = r.checkIn ? new Date(r.checkIn).getTime() : Infinity;
    if (nextIn < prevIn) recordByStudent.set(key, r);
  }
  return recordByStudent;
}

async function listByDate({
  date,
  classId,
  sectionId,
  sessionId,
  studentIds,
  studentId,
  scopeFilter = null,
}) {
  const { start, end, ymd } = resolveDay(date);
  const students = await resolveStudents({
    classId,
    sectionId,
    sessionId,
    studentIds,
    studentId,
    scopeFilter,
  });

  const studentIdList = students.map((s) => s._id);
  const records = studentIdList.length
    ? await AcademyAttendance.find({
        date: { $gte: start, $lte: end },
        studentId: { $in: studentIdList },
        $or: [{ subjectId: { $exists: false } }, { subjectId: null }],
      }).lean()
    : [];

  const recordByStudent = preferEarlierCheckIn(records);

  // Students without a saved mark count as absent by default.
  const summary = { present: 0, absent: 0, leave: 0, late: 0, unmarked: 0 };
  students.forEach((s) => {
    const rec = recordByStudent.get(String(s._id));
    if (!rec) summary.absent += 1;
    else if (summary[rec.status] !== undefined) summary[rec.status] += 1;
  });

  return {
    date: ymd,
    dateFrom: ymd,
    dateTo: ymd,
    students,
    records: [...recordByStudent.values()],
    summary,
  };
}

/**
 * Attendance across an inclusive From–To range.
 * Unmarked student-days count as absent. Returns per-student totals for reports.
 */
async function listByDateRange({
  dateFrom,
  dateTo,
  classId,
  sectionId,
  sessionId,
  studentIds,
  studentId,
  scopeFilter = null,
}) {
  const { from, to, days } = enumerateYmds(dateFrom, dateTo);
  if (days.length === 1) {
    return listByDate({
      date: days[0],
      classId,
      sectionId,
      sessionId,
      studentIds,
      studentId,
      scopeFilter,
    });
  }

  const students = await resolveStudents({
    classId,
    sectionId,
    sessionId,
    studentIds,
    studentId,
    scopeFilter,
  });

  const studentIdList = students.map((s) => s._id);
  const records = studentIdList.length
    ? await AcademyAttendance.find({
        date: { $gte: from.start, $lte: to.end },
        studentId: { $in: studentIdList },
        $or: [{ subjectId: { $exists: false } }, { subjectId: null }],
      }).lean()
    : [];

  /** studentId|ymd → best day record */
  const byStudentDay = new Map();
  for (const r of records) {
    const ymd = formatDateInTz(r.date);
    const key = `${String(r.studentId)}|${ymd}`;
    const prev = byStudentDay.get(key);
    if (!prev) {
      byStudentDay.set(key, r);
      continue;
    }
    const prevIn = prev.checkIn ? new Date(prev.checkIn).getTime() : Infinity;
    const nextIn = r.checkIn ? new Date(r.checkIn).getTime() : Infinity;
    if (nextIn < prevIn) byStudentDay.set(key, r);
  }

  const dayCount = days.length;
  const summary = { present: 0, absent: 0, leave: 0, late: 0, unmarked: 0 };
  const studentSummaries = students.map((s) => {
    const counts = { present: 0, absent: 0, leave: 0, late: 0 };
    days.forEach((ymd) => {
      const rec = byStudentDay.get(`${String(s._id)}|${ymd}`);
      const status = rec?.status && counts[rec.status] !== undefined ? rec.status : 'absent';
      counts[status] += 1;
      summary[status] += 1;
    });
    const markedPresent = counts.present + counts.late;
    const attendancePercent =
      dayCount > 0 ? Math.round((markedPresent / dayCount) * 1000) / 10 : 0;
    return {
      studentId: s._id,
      student: s,
      ...counts,
      totalDays: dayCount,
      attendancePercent,
    };
  });

  return {
    date: `${from.ymd}–${to.ymd}`,
    dateFrom: from.ymd,
    dateTo: to.ymd,
    days,
    students,
    records,
    summary,
    studentSummaries,
  };
}

/**
 * Date-wise absent list for From–To.
 * Unmarked students count as absent. Multi-day ranges skip days with no marks
 * (weekends / holidays where attendance was never taken).
 */
async function listAbsentByDateRange({
  dateFrom,
  dateTo,
  classId,
  sectionId,
  sessionId,
  studentIds,
  studentId,
  scopeFilter = null,
}) {
  const { from, to, days } = enumerateYmds(dateFrom, dateTo);
  const students = await resolveStudents({
    classId,
    sectionId,
    sessionId,
    studentIds,
    studentId,
    scopeFilter,
  });

  const studentIdList = students.map((s) => s._id);
  const records = studentIdList.length
    ? await AcademyAttendance.find({
        date: { $gte: from.start, $lte: to.end },
        studentId: { $in: studentIdList },
        $or: [{ subjectId: { $exists: false } }, { subjectId: null }],
      }).lean()
    : [];

  const byStudentDay = new Map();
  const daysWithMarks = new Set();
  for (const r of records) {
    const ymd = formatDateInTz(r.date);
    daysWithMarks.add(ymd);
    const key = `${String(r.studentId)}|${ymd}`;
    const prev = byStudentDay.get(key);
    if (!prev) {
      byStudentDay.set(key, r);
      continue;
    }
    const prevIn = prev.checkIn ? new Date(prev.checkIn).getTime() : Infinity;
    const nextIn = r.checkIn ? new Date(r.checkIn).getTime() : Infinity;
    if (nextIn < prevIn) byStudentDay.set(key, r);
  }

  const singleDay = days.length === 1;
  const byDate = [];
  let totalAbsent = 0;

  days.forEach((ymd) => {
    if (!singleDay && !daysWithMarks.has(ymd)) return;
    const absentees = students.filter((s) => {
      const rec = byStudentDay.get(`${String(s._id)}|${ymd}`);
      const status = rec?.status || 'absent';
      return status === 'absent';
    });
    if (absentees.length === 0) return;
    totalAbsent += absentees.length;
    byDate.push({
      date: ymd,
      count: absentees.length,
      students: absentees,
    });
  });

  return {
    dateFrom: from.ymd,
    dateTo: to.ymd,
    days: byDate,
    totalAbsent,
    summary: { absent: totalAbsent, days: byDate.length },
  };
}

/**
 * Day-by-day register data for From–To (printed like the monthly sheet).
 * statusByStudentDay holds a status only where the student was marked or expected;
 * a missing entry means "no class for this student that day".
 */
async function listRegisterByDateRange({
  dateFrom,
  dateTo,
  classId,
  sectionId,
  sessionId,
  studentIds,
  studentId,
  scopeFilter = null,
}) {
  const { from, to, days } = enumerateYmds(dateFrom, dateTo);
  const students = await resolveStudents({
    classId,
    sectionId,
    sessionId,
    studentIds,
    studentId,
    scopeFilter,
  });

  const studentIdList = students.map((s) => s._id);
  const records = studentIdList.length
    ? await AcademyAttendance.find({
        date: { $gte: from.start, $lte: to.end },
        studentId: { $in: studentIdList },
        $or: [{ subjectId: { $exists: false } }, { subjectId: null }],
      }).lean()
    : [];

  const byStudentDay = new Map();
  const markedDays = new Set();
  for (const r of records) {
    const ymd = formatDateInTz(r.date);
    markedDays.add(ymd);
    const key = `${String(r.studentId)}|${ymd}`;
    const prev = byStudentDay.get(key);
    if (!prev) {
      byStudentDay.set(key, r);
      continue;
    }
    const prevIn = prev.checkIn ? new Date(prev.checkIn).getTime() : Infinity;
    const nextIn = r.checkIn ? new Date(r.checkIn).getTime() : Infinity;
    if (nextIn < prevIn) byStudentDay.set(key, r);
  }

  const savedStatus = new Map();
  byStudentDay.forEach((rec, key) => savedStatus.set(key, rec.status));

  // Per student-day: saved mark wins; otherwise absent only if the student was EXPECTED
  // that day (section timetable + their subjects) and the day is not in the future.
  const { isExpected } = await loadExpectationContext(students);
  const todayYmd = formatDateInTz(new Date());
  const statusByStudentDay = new Map();
  const activeDays = new Set();
  const summary = { present: 0, absent: 0, leave: 0, late: 0 };
  students.forEach((s) => {
    days.forEach((ymd) => {
      const key = `${String(s._id)}|${ymd}`;
      let status = savedStatus.get(key);
      if (!status && ymd <= todayYmd && isExpected(s, ymd)) status = 'absent';
      if (!status) return;
      statusByStudentDay.set(key, status);
      activeDays.add(ymd);
      if (summary[status] !== undefined) summary[status] += 1;
    });
  });

  return {
    dateFrom: from.ymd,
    dateTo: to.ymd,
    days,
    markedDays: days.filter((d) => activeDays.has(d)),
    students,
    statusByStudentDay,
    summary,
  };
}

async function markAttendance({ date, entries }, userId, { assertStudentAccess } = {}) {
  const { start, end } = resolveDay(date);
  const results = [];

  for (const e of entries) {
    if (typeof assertStudentAccess === 'function') {
      // eslint-disable-next-line no-await-in-loop
      await assertStudentAccess(e.studentId);
    }

    const filter = {
      studentId: e.studentId,
      date: { $gte: start, $lte: end },
      $or: [{ subjectId: { $exists: false } }, { subjectId: null }],
    };

    const set = {
      studentId: e.studentId,
      date: start,
      status: e.status,
      notes: e.notes,
      markedBy: userId,
      source: 'manual',
    };

    // Keep times consistent with status
    if (e.status === 'absent' || e.status === 'leave') {
      set.checkIn = null;
      set.checkOut = null;
    } else if (e.checkIn) {
      set.checkIn = new Date(e.checkIn);
    }

    // eslint-disable-next-line no-await-in-loop
    const doc = await AcademyAttendance.findOneAndUpdate(
      filter,
      {
        $set: set,
        $setOnInsert: { createdBy: userId },
        $unset: e.status === 'absent' || e.status === 'leave' ? { confidence: 1 } : {},
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    results.push(doc);
  }

  return results;
}

async function getSummary({ month, year, scopeFilter = null, studentIds = null }) {
  if (!month || !year) throw new ApiError(400, 'month and year required');
  const { start, end } = monthBounds(year, month);

  let studentIdFilter = null;
  if (Array.isArray(studentIds)) {
    studentIdFilter = studentIds;
  } else if (scopeFilter && Object.keys(scopeFilter).length) {
    const ids = await AcademyStudent.find({
      $and: [{ status: 'active' }, scopeFilter],
    }).distinct('_id');
    studentIdFilter = ids;
  }

  const match = {
    date: { $gte: start, $lte: end },
    $or: [{ subjectId: { $exists: false } }, { subjectId: null }],
  };
  if (studentIdFilter) {
    match.studentId = { $in: studentIdFilter };
  }

  const grouped = await AcademyAttendance.aggregate([
    { $match: match },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const summary = { total: 0, present: 0, absent: 0, late: 0, leave: 0 };
  grouped.forEach((row) => {
    const key = row._id;
    const n = row.count || 0;
    summary.total += n;
    if (summary[key] !== undefined) summary[key] = n;
  });
  return summary;
}

/** Daily general attendance for one student across a calendar month. */
async function listByStudentMonth({ studentId, month, year }) {
  if (!studentId) throw new ApiError(400, 'studentId required');
  if (!month || !year) throw new ApiError(400, 'month and year required');

  const { start, end, daysInMonth } = monthBounds(year, month);

  const records = await AcademyAttendance.find({
    studentId,
    date: { $gte: start, $lte: end },
    $or: [{ subjectId: { $exists: false } }, { subjectId: null }],
  })
    .sort({ date: 1 })
    .lean();

  const summary = { total: 0, present: 0, absent: 0, late: 0, leave: 0 };
  records.forEach((r) => {
    summary.total += 1;
    if (summary[r.status] !== undefined) summary[r.status] += 1;
  });
  const marked = summary.present + summary.late + summary.absent + summary.leave;
  const attendanceRate =
    marked > 0 ? Math.round(((summary.present + summary.late) / marked) * 1000) / 10 : null;

  return {
    month: Number(month),
    year: Number(year),
    daysInMonth,
    summary: { ...summary, attendanceRate },
    // `ymd` = the school day, so clients never have to derive it from the UTC timestamp.
    records: records.map((r) => ({ ...r, ymd: formatDateInTz(r.date) })),
  };
}

module.exports = {
  listByDate,
  listByDateRange,
  listAbsentByDateRange,
  listRegisterByDateRange,
  markAttendance,
  getSummary,
  listByStudentMonth,
  MAX_RANGE_DAYS,
};
