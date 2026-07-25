const ApiError = require('../../utils/ApiError');
const AcademyStudent = require('../../models/academy/AcademyStudent');
const AcademyAttendance = require('../../models/academy/AcademyAttendance');
const AcademyClass = require('../../models/academy/AcademyClass');

function dayRange(dateStr) {
  const day = new Date(dateStr);
  if (Number.isNaN(day.getTime())) throw new ApiError(400, 'Invalid date');
  day.setHours(0, 0, 0, 0);
  const end = new Date(day);
  end.setHours(23, 59, 59, 999);
  return { start: day, end };
}

async function listByDate({ date, classId, sectionId, sessionId }) {
  const { start, end } = dayRange(date);
  const studentQ = { status: 'active' };
  if (classId) {
    studentQ.classId = classId;
  } else if (sessionId) {
    const classes = await AcademyClass.find({ sessionId }).select('_id');
    studentQ.classId = { $in: classes.map((c) => c._id) };
  }
  if (sectionId) studentQ.sectionId = sectionId;

  const [students, records] = await Promise.all([
    AcademyStudent.find(studentQ)
      .populate('classId', 'className classCode sessionId')
      .populate('sectionId', 'sectionName')
      .sort({ studentName: 1 })
      .lean(),
    AcademyAttendance.find({ date: { $gte: start, $lte: end } }).lean(),
  ]);

  const recordByStudent = new Map(records.map((r) => [String(r.studentId), r]));

  const summary = { present: 0, absent: 0, leave: 0, late: 0, unmarked: 0 };
  students.forEach((s) => {
    const rec = recordByStudent.get(String(s._id));
    if (!rec) summary.unmarked += 1;
    else if (summary[rec.status] !== undefined) summary[rec.status] += 1;
  });

  return { date: start.toISOString().slice(0, 10), students, records, summary };
}

async function markAttendance({ date, entries }, userId) {
  const { start, end } = dayRange(date);
  const results = [];

  for (const e of entries) {
    const filter = {
      studentId: e.studentId,
      date: { $gte: start, $lte: end },
      $or: [{ subjectId: { $exists: false } }, { subjectId: null }],
    };
    // eslint-disable-next-line no-await-in-loop
    const doc = await AcademyAttendance.findOneAndUpdate(
      filter,
      {
        $set: {
          studentId: e.studentId,
          date: start,
          status: e.status,
          notes: e.notes,
          markedBy: userId,
          source: 'manual',
        },
        $setOnInsert: { createdBy: userId },
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
  const rows = await AcademyAttendance.find({ date: { $gte: start, $lte: end } });
  const summary = { total: rows.length, present: 0, absent: 0, late: 0, leave: 0 };
  rows.forEach((r) => {
    if (summary[r.status] !== undefined) summary[r.status] += 1;
  });
  return summary;
}

module.exports = { listByDate, markAttendance, getSummary };
