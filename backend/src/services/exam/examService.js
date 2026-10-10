const ApiError = require('../../utils/ApiError');
const Exam = require('../../models/Exam');
const Result = require('../../models/Result');
const AcademyStudent = require('../../models/academy/AcademyStudent');
const AcademySubject = require('../../models/academy/AcademySubject');
const AcademyClass = require('../../models/academy/AcademyClass');
const { computeResultTotals } = require('./examGrading');
const { hasAnySubjectEnrollment, selectedSubjectIds } = require('../academy/studentEnrollment');

function resolveClassId(student) {
  const c = student.classId;
  return c?._id ? c._id : c;
}

function enrolledSubjectIds(student, allClassSubjects) {
  const ids = selectedSubjectIds(student);
  if (ids.length > 0) return ids;
  if (student.isFullPackage) {
    return allClassSubjects.map((s) => String(s._id));
  }
  return [];
}

async function createExam(body, userId) {
  const cls = await AcademyClass.findById(body.academyClass);
  if (!cls) throw new ApiError(404, 'Class not found');
  return Exam.create({
    title: body.title,
    type: body.type,
    academyClass: body.academyClass,
    sessionLabel: body.sessionLabel || '',
    startDate: body.startDate,
    endDate: body.endDate,
    dateSheet: body.dateSheet || [],
    status: body.status || 'scheduled',
    createdBy: userId,
  });
}

async function listExams({ classId } = {}) {
  const q = {};
  if (classId) q.academyClass = classId;
  return Exam.find(q)
    .populate('academyClass', 'className')
    .populate('dateSheet.subject', 'subjectName subjectCode')
    .populate('createdBy', 'name email')
    .sort({ startDate: -1 })
    .lean();
}

async function getExamById(id) {
  const exam = await Exam.findById(id)
    .populate('academyClass', 'className')
    .populate('dateSheet.subject', 'subjectName subjectCode')
    .populate('createdBy', 'name email')
    .lean();
  if (!exam) throw new ApiError(404, 'Exam not found');
  return exam;
}

async function updateExam(id, patch) {
  const exam = await Exam.findByIdAndUpdate(id, patch, { new: true })
    .populate('academyClass', 'className')
    .populate('createdBy', 'name email')
    .lean();
  if (!exam) throw new ApiError(404, 'Exam not found');
  return exam;
}

async function getExamStudents(examId) {
  const exam = await Exam.findById(examId).lean();
  if (!exam) throw new ApiError(404, 'Exam not found');

  const studentQ = { classId: exam.academyClass, status: 'active' };
  if (exam.sectionId) studentQ.sectionId = exam.sectionId;
  if (exam.disciplineId) studentQ.disciplineId = exam.disciplineId;

  const [students, subjects, results] = await Promise.all([
    AcademyStudent.find(studentQ).populate('selectedSubjects', 'subjectName subjectCode').lean(),
    AcademySubject.find({ classId: exam.academyClass, status: 'active' }).sort({ subjectName: 1 }).lean(),
    Result.find({ exam: examId }).lean(),
  ]);

  const resultByStudent = {};
  results.forEach((r) => {
    resultByStudent[String(r.academyStudent)] = r;
  });

  const rows = students
    .filter((student) => hasAnySubjectEnrollment(student))
    .map((student) => {
      const enrolled = enrolledSubjectIds(student, subjects);
      const enrolledSubjects = subjects.filter((s) => enrolled.includes(String(s._id)));
      const existing = resultByStudent[String(student._id)];
      return {
        student: {
          _id: student._id,
          studentId: student.studentId,
          studentName: student.studentName,
          fatherName: student.fatherName,
          isFullPackage: student.isFullPackage,
        },
        subjects: enrolledSubjects,
        result: existing || null,
      };
    });

  return { exam, subjects, students: rows };
}

async function enterMarks(examId, marksRows, userId) {
  const exam = await Exam.findById(examId);
  if (!exam) throw new ApiError(404, 'Exam not found');

  const subjects = await AcademySubject.find({ classId: exam.academyClass, status: 'active' }).lean();

  const saved = [];
  for (const row of marksRows) {
    const student = await AcademyStudent.findById(row.studentId);
    if (!student || String(resolveClassId(student)) !== String(exam.academyClass)) {
      throw new ApiError(400, 'Invalid student for this exam');
    }
    if (!hasAnySubjectEnrollment(student)) {
      throw new ApiError(400, `${student.studentName} is not enrolled in any subject`);
    }
    const allowedIds = new Set(enrolledSubjectIds(student, subjects));
    for (const sm of row.subjectMarks || []) {
      const sid = String(sm.subject || sm.subjectId);
      if (sid && !allowedIds.has(sid)) {
        throw new ApiError(400, `${student.studentName} is not enrolled in one or more marked subjects`);
      }
      const obtained = Number(sm.obtained);
      const total = Number(sm.total);
      if (!Number.isFinite(obtained) || !Number.isFinite(total) || total < 1) {
        throw new ApiError(400, `Invalid marks for ${student.studentName}`);
      }
      if (obtained < 0) {
        throw new ApiError(400, `Obtained marks cannot be negative for ${student.studentName}`);
      }
      if (obtained > total) {
        throw new ApiError(
          400,
          `Obtained marks cannot exceed total marks (${total}) for ${student.studentName}`
        );
      }
    }

    const totals = computeResultTotals(row.subjectMarks);
    // eslint-disable-next-line no-await-in-loop
    const result = await Result.findOneAndUpdate(
      { academyStudent: row.studentId, exam: exam._id },
      {
        $set: {
          academyStudent: row.studentId,
          exam: exam._id,
          subjectMarks: totals.subjectMarks,
          totalMarks: totals.totalMarks,
          obtainedMarks: totals.obtainedMarks,
          percentage: totals.percentage,
          grade: totals.grade,
          gpa: totals.gpa,
          proofImages: row.proofImages || [],
          enteredBy: userId,
          isPublished: false,
        },
        $setOnInsert: { createdBy: userId },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    saved.push(result);
  }
  return saved;
}

async function getExamResults(examId) {
  const results = await Result.find({ exam: examId })
    .populate('academyStudent', 'studentId studentName fatherName classId')
    .populate('subjectMarks.subject', 'subjectName subjectCode')
    .sort({ percentage: -1 })
    .lean();

  await Promise.all(
    results.map((r, i) => Result.updateOne({ _id: r._id }, { $set: { position: i + 1 } }))
  );

  return Result.find({ exam: examId })
    .populate('academyStudent', 'studentId studentName fatherName classId')
    .populate('subjectMarks.subject', 'subjectName subjectCode')
    .sort({ percentage: -1 })
    .lean();
}

async function publishResult(resultId) {
  const result = await Result.findByIdAndUpdate(
    resultId,
    { isPublished: true },
    { new: true }
  )
    .populate('exam')
    .populate('academyStudent', 'studentId studentName');
  if (!result) throw new ApiError(404, 'Result not found');
  return result;
}

async function publishAllForExam(examId) {
  const exam = await Exam.findById(examId);
  if (!exam) throw new ApiError(404, 'Exam not found');
  const res = await Result.updateMany({ exam: examId }, { $set: { isPublished: true } });
  await Exam.findByIdAndUpdate(examId, { status: 'completed' });
  return { modifiedCount: res.modifiedCount };
}

async function studentPublishedResults(academyStudentId) {
  return Result.find({ academyStudent: academyStudentId, isPublished: true })
    .populate('exam', 'title type sessionLabel startDate endDate status')
    .populate('subjectMarks.subject', 'subjectName subjectCode')
    .sort({ createdAt: -1 })
    .lean();
}

module.exports = {
  createExam,
  listExams,
  getExamById,
  updateExam,
  getExamStudents,
  enterMarks,
  getExamResults,
  publishResult,
  publishAllForExam,
  studentPublishedResults,
};
