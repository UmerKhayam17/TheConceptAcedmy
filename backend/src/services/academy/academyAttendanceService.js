const ApiError = require('../../utils/ApiError');
const AcademyStudent = require('../../models/academy/AcademyStudent');
const AcademyAttendance = require('../../models/academy/AcademyAttendance');
const AcademyClass = require('../../models/academy/AcademyClass');
const { dayBounds } = require('../../utils/schoolDay');

function resolveDay(dateStr) {
  try {
    return dayBounds(dateStr);
  } catch (err) {
    throw new ApiError(400, err.message || 'Invalid date');
  }
}

async function listByDate({ date, classId, sectionId, sessionId, studentIds, studentId }) {
  const { start, end, ymd } = resolveDay(date);
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
  } else {
    throw new ApiError(400, 'classId, sessionId, or student filter required');
  }
  if (sectionId) studentQ.sectionId = sectionId;

  const students = await AcademyStudent.find(studentQ)
    .populate('classId', 'className classCode sessionId')
    .populate('sectionId', 'sectionName')
    .sort({ studentName: 1 })
    .lean();

  const studentIdList = students.map((s) => s._id);
  const records = studentIdList.length
    ? await AcademyAttendance.find({
        date: { $gte: start, $lte: end },
        studentId: { $in: studentIdList },
        $or: [{ subjectId: { $exists: false } }, { subjectId: null }],
      }).lean()
    : [];

  // Prefer day-level record; if duplicates exist, keep earliest checkIn
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

  const summary = { present: 0, absent: 0, leave: 0, late: 0, unmarked: 0 };
  students.forEach((s) => {
    const rec = recordByStudent.get(String(s._id));
    if (!rec) summary.unmarked += 1;
    else if (summary[rec.status] !== undefined) summary[rec.status] += 1;
  });

  return {
    date: ymd,
    students,
    records: [...recordByStudent.values()],
    summary,
  };
}

async function markAttendance({ date, entries }, userId) {
  const { start, end } = resolveDay(date);
  const results = [];

  for (const e of entries) {
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

async function getSummary({ month, year }) {
  if (!month || !year) throw new ApiError(400, 'month and year required');
  const start = new Date(Number(year), Number(month) - 1, 1);
  const end = new Date(Number(year), Number(month), 0, 23, 59, 59, 999);
  const grouped = await AcademyAttendance.aggregate([
    {
      $match: {
        date: { $gte: start, $lte: end },
        $or: [{ subjectId: { $exists: false } }, { subjectId: null }],
      },
    },
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

module.exports = { listByDate, markAttendance, getSummary };
