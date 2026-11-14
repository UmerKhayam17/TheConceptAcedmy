/**
 * End-of-day auto absent: every active student who was EXPECTED today
 * (see attendanceExpectationService) and has no attendance row gets a saved
 * `absent` row with source `auto`.
 *
 * Existing camera / manual rows are never touched. If the camera sees the student
 * later, the AI sighting fills checkIn and replaces the auto absent with present/late.
 */
const AcademyStudent = require('../../models/academy/AcademyStudent');
const AcademyAttendance = require('../../models/academy/AcademyAttendance');
const { dayBounds, todayYmd } = require('../../utils/schoolDay');
const { loadExpectationContext } = require('./attendanceExpectationService');
const parentNotify = require('../parentNotifyService');

/** "HH:MM" (24h, school timezone) after which unmarked students are saved as absent. */
function autoAbsentTime() {
  const raw = String(process.env.AUTO_ABSENT_TIME || '19:30').trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})$/);
  const hour = m ? Math.min(23, Number(m[1])) : 19;
  const minute = m ? Math.min(59, Number(m[2])) : 30;
  return { hour, minute, label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` };
}

async function markAbsentForDay(ymd = todayYmd()) {
  const { start, end } = dayBounds(ymd);

  const students = await AcademyStudent.find({ status: 'active' })
    .select('_id classId sectionId selectedSubjects isFullPackage activatedAt enrolledAt')
    .lean();
  if (!students.length) return { date: ymd, expected: 0, alreadyMarked: 0, markedAbsent: 0 };

  const { isExpected } = await loadExpectationContext(students);
  const expected = students.filter((s) => isExpected(s, ymd));

  const existing = expected.length
    ? await AcademyAttendance.find({
        date: { $gte: start, $lte: end },
        studentId: { $in: expected.map((s) => s._id) },
        $or: [{ subjectId: { $exists: false } }, { subjectId: null }],
      })
        .select('studentId')
        .lean()
    : [];
  const marked = new Set(existing.map((r) => String(r.studentId)));

  const { label } = autoAbsentTime();
  const docs = expected
    .filter((s) => !marked.has(String(s._id)))
    .map((s) => ({
      studentId: s._id,
      date: start,
      status: 'absent',
      source: 'auto',
      notes: `Auto-marked absent (no attendance by ${label})`,
    }));

  let inserted = 0;
  let insertedDocs = [];
  if (docs.length) {
    try {
      const res = await AcademyAttendance.insertMany(docs, { ordered: false });
      inserted = res.length;
      insertedDocs = res;
    } catch (err) {
      // Duplicate key = camera/teacher marked the student meanwhile — keep theirs.
      const dupOnly = (err?.writeErrors || []).every((e) => (e.code ?? e.err?.code) === 11000);
      if (!dupOnly) throw err;
      inserted = err.insertedDocs?.length ?? err.result?.insertedCount ?? docs.length - err.writeErrors.length;
      insertedDocs = err.insertedDocs || [];
    }
  }

  parentNotify.attendanceMarked(
    insertedDocs.map((d) => ({ studentId: d.studentId, status: 'absent', date: d.date }))
  );

  return {
    date: ymd,
    expected: expected.length,
    alreadyMarked: marked.size,
    markedAbsent: inserted,
  };
}

module.exports = { markAbsentForDay, autoAbsentTime };
