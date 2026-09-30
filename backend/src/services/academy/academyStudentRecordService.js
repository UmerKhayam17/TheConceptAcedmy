const ApiError = require('../../utils/ApiError');
const AcademyStudent = require('../../models/academy/AcademyStudent');
const AcademySubject = require('../../models/academy/AcademySubject');
const AcademyFeeRecord = require('../../models/academy/AcademyFeeRecord');
const AcademyAttendance = require('../../models/academy/AcademyAttendance');
const AcademyAssessment = require('../../models/academy/AcademyAssessment');
const timetableVersionService = require('../timetable/timetableVersionService');

const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAY_INDEX = WEEKDAY_NAMES.reduce((acc, day, index) => ({ ...acc, [day]: index }), {});

function resolveClassId(student) {
  const c = student.classId;
  if (!c) return null;
  return c._id ? c._id : c;
}

function resolveSessionId(student) {
  const c = student.classId;
  if (!c) return null;
  const sessionId = c.sessionId;
  if (!sessionId) return null;
  return sessionId._id ? sessionId._id : sessionId;
}

function resolveSectionId(student) {
  const s = student.sectionId;
  if (!s) return null;
  return s._id ? s._id : s;
}

function resolveSubjectId(subject) {
  if (!subject) return null;
  return subject._id ? String(subject._id) : String(subject);
}

function normalizePublisherSubject(subject) {
  if (!subject || typeof subject === 'string') return subject;
  return {
    _id: subject._id,
    subjectName: subject.subjectName || subject.name,
    subjectCode: subject.subjectCode || subject.code,
  };
}

function normalizePublisherRoom(room) {
  if (!room) return '';
  if (typeof room === 'string') return room;
  return room.name || room.code || '';
}

function resolveEnrolledSubjectIds(student, allClassSubjects) {
  const selected = student.selectedSubjects || [];
  if (selected.length > 0) {
    return selected.map((s) => String(s._id || s));
  }
  if (student.isFullPackage) {
    return allClassSubjects.map((s) => String(s._id));
  }
  return [];
}

async function getPublishedTimetableSlots(sessionId, sectionId, enrolledIds) {
  const version = await timetableVersionService.getPublishedVersion(sessionId, sectionId);
  if (!version) return [];

  const grid = await timetableVersionService.getVersionGrid(version._id);
  const periods = grid.periods || [];

  return grid.slots
    .filter((slot) => {
      if (enrolledIds.size === 0) return true;
      const ids = [
        resolveSubjectId(slot.subject),
        ...((slot.parallelEntries || []).map((e) => resolveSubjectId(e.subject))),
      ].filter(Boolean);
      return ids.some((id) => enrolledIds.has(id));
    })
    .map((slot) => {
      const period = periods.find((p) => String(p._id) === String(slot.periodId));
      const rawDay = String(slot.day || '').toLowerCase();
      const normalizedDayName = rawDay in WEEKDAY_INDEX ? rawDay : String(slot.day || '');
      const dayOfWeek = normalizedDayName in WEEKDAY_INDEX ? WEEKDAY_INDEX[normalizedDayName] : 0;

      const candidates = [
        { subject: slot.subject, teacher: slot.teacher },
        ...((slot.parallelEntries || []).map((e) => ({ subject: e.subject, teacher: e.teacher }))),
      ];
      const matched =
        candidates.find((c) => enrolledIds.has(resolveSubjectId(c.subject))) || candidates[0];

      return {
        _id: slot._id,
        classId: slot.class,
        subjectId: normalizePublisherSubject(matched.subject),
        dayOfWeek,
        dayName:
          normalizedDayName && typeof normalizedDayName === 'string'
            ? normalizedDayName.charAt(0).toUpperCase() + normalizedDayName.slice(1)
            : '',
        startTime: period?.startTime || '',
        endTime: period?.endTime || '',
        room: normalizePublisherRoom(slot.room),
      };
    });
}

function attendanceSummary(records) {
  const counts = { present: 0, absent: 0, late: 0, leave: 0, total: records.length };
  records.forEach((r) => {
    if (counts[r.status] != null) counts[r.status] += 1;
  });
  const attended = counts.present + counts.late;
  const rate = counts.total ? Math.round((attended / counts.total) * 100) : null;
  return { ...counts, attendanceRate: rate };
}

function feeSummary(records) {
  let totalPaid = 0;
  let totalPending = 0;
  const byStatus = { pending: 0, paid: 0, overdue: 0, waived: 0 };
  records.forEach((r) => {
    if (byStatus[r.status] != null) byStatus[r.status] += 1;
    if (r.status === 'paid') totalPaid += r.amount;
    if (r.status === 'pending' || r.status === 'overdue') totalPending += r.amount;
  });
  return {
    recordsCount: records.length,
    totalPaid,
    totalPending,
    byStatus,
  };
}

function assessmentSummary(assessments) {
  if (!assessments.length) {
    return { count: 0, averagePercentage: null, highestPercentage: null, lowestPercentage: null };
  }
  const pcts = assessments
    .map((a) => (a.totalMarks > 0 ? (a.obtainedMarks / a.totalMarks) * 100 : null))
    .filter((p) => p != null);
  const avg = pcts.length ? Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length) : null;
  return {
    count: assessments.length,
    averagePercentage: avg,
    highestPercentage: pcts.length ? Math.round(Math.max(...pcts)) : null,
    lowestPercentage: pcts.length ? Math.round(Math.min(...pcts)) : null,
  };
}

async function getStudentRecord(id) {
  const student = await AcademyStudent.findById(id)
    .populate('classId', 'className totalSubjects sessionId')
    .populate('selectedSubjects', 'subjectName subjectCode')
    .populate('feeStructureId')
    .populate('createdBy', 'name email');
  if (!student) throw new ApiError(404, 'Student not found');

  const classId = resolveClassId(student);
  const sessionId = resolveSessionId(student);
  const sectionId = resolveSectionId(student);

  const [allClassSubjects, feeRecords, attendanceRecords, assessments] =
    await Promise.all([
      classId
        ? AcademySubject.find({ classId, status: 'active' }).sort({ subjectName: 1 })
        : [],
      AcademyFeeRecord.find({ studentId: id }).sort({ year: -1, month: -1, createdAt: -1 }),
      AcademyAttendance.find({ studentId: id })
        .sort({ date: -1 })
        .limit(200)
        .populate('subjectId', 'subjectName subjectCode'),
      AcademyAssessment.find({ studentId: id })
        .sort({ examDate: -1 })
        .populate('subjectId', 'subjectName subjectCode')
        .populate('createdBy', 'name email')
        .populate('recordedBy', 'name email')
        .populate({
          path: 'classTestId',
          select: 'title createdBy teacherId seriesLabel',
          populate: [
            { path: 'createdBy', select: 'name email' },
            { path: 'teacherId', select: 'name email' },
          ],
        }),
    ]);

  const enrolledIds = new Set(resolveEnrolledSubjectIds(student, allClassSubjects));
  const enrollmentSubjects =
    student.selectedSubjects?.length > 0
      ? student.selectedSubjects
      : student.isFullPackage
        ? allClassSubjects
        : [];

  let timetable = [];
  if (sessionId && sectionId) {
    timetable = await getPublishedTimetableSlots(sessionId, sectionId, enrolledIds);
  }

  return {
    student,
    enrollment: {
      isFullPackage: student.isFullPackage,
      subjectCount: enrollmentSubjects?.length || 0,
      classSubjectsTotal: allClassSubjects.length,
      subjects: enrollmentSubjects,
    },
    timetable,
    attendance: {
      summary: attendanceSummary(attendanceRecords),
      records: attendanceRecords,
    },
    fees: {
      summary: feeSummary(feeRecords),
      records: feeRecords,
    },
    assessments: {
      summary: assessmentSummary(assessments),
      records: assessments,
    },
  };
}

module.exports = { getStudentRecord };
