const fs = require('fs');
const path = require('path');
const ApiError = require('../../utils/ApiError');
const Exam = require('../../models/Exam');
const Result = require('../../models/Result');
const AcademyStudent = require('../../models/academy/AcademyStudent');
const AcademySubject = require('../../models/academy/AcademySubject');
const AcademyClass = require('../../models/academy/AcademyClass');
const { computeResultTotals } = require('./examGrading');
const { hasAnySubjectEnrollment, selectedSubjectIds } = require('../academy/studentEnrollment');
const { sortStudentsByRollAsc } = require('../../utils/academyStudentSort');

const EXAM_PAPER_DIR = path.join(__dirname, '../../../uploads/exam-papers');

function saveExamPaperFile(examId, studentId, subjectId, file) {
  if (!file?.buffer?.length) throw new ApiError(400, 'Image file required');
  fs.mkdirSync(EXAM_PAPER_DIR, { recursive: true });
  const ext = path.extname(file.originalname || '') || '.jpg';
  const safeExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext.toLowerCase())
    ? ext
    : '.jpg';
  const filename = `${examId}-${studentId}-${subjectId}-${Date.now()}${safeExt}`;
  const dest = path.join(EXAM_PAPER_DIR, filename);
  fs.writeFileSync(dest, file.buffer);
  return `/uploads/exam-papers/${filename}`;
}

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
    AcademyStudent.find(studentQ)
      .populate('selectedSubjects', 'subjectName subjectCode')
      .populate('sectionId', 'sectionName')
      .lean(),
    AcademySubject.find({ classId: exam.academyClass, status: 'active' }).sort({ subjectName: 1 }).lean(),
    Result.find({ exam: examId }).lean(),
  ]);

  const resultByStudent = {};
  results.forEach((r) => {
    resultByStudent[String(r.academyStudent)] = r;
  });

  const rows = sortStudentsByRollAsc(
    students.filter((student) => hasAnySubjectEnrollment(student))
  ).map((student) => {
    const enrolled = enrolledSubjectIds(student, subjects);
    const enrolledSubjects = subjects.filter((s) => enrolled.includes(String(s._id)));
    const existing = resultByStudent[String(student._id)];
    const section = student.sectionId;
    return {
      student: {
        _id: student._id,
        studentId: student.studentId,
        studentName: student.studentName,
        fatherName: student.fatherName,
        rollNumber: student.rollNumber,
        sectionName:
          section && typeof section === 'object' ? section.sectionName || '' : '',
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
    // eslint-disable-next-line no-await-in-loop
    const existing = await Result.findOne({
      academyStudent: row.studentId,
      exam: exam._id,
    }).lean();
    const mergedBySubject = new Map();
    for (const prev of existing?.subjectMarks || []) {
      const pid = String(prev.subject?._id || prev.subject);
      if (!pid) continue;
      mergedBySubject.set(pid, {
        subject: pid,
        obtained: Number(prev.obtained) || 0,
        total: Number(prev.total) || 0,
        isAbsent: Boolean(prev.isAbsent),
        remarks: prev.remarks || '',
        grade: prev.grade,
        paperImage: prev.paperImage || '',
      });
    }

    for (const sm of row.subjectMarks || []) {
      const sid = String(sm.subject || sm.subjectId);
      if (sid && !allowedIds.has(sid)) {
        throw new ApiError(400, `${student.studentName} is not enrolled in one or more marked subjects`);
      }
      const rawObtained = Number(sm.obtained);
      const total = Number(sm.total);
      const isAbsent =
        Boolean(sm.isAbsent) ||
        rawObtained === -1 ||
        /absent/i.test(String(sm.remarks || ''));
      const obtained = isAbsent ? 0 : rawObtained;
      if (!Number.isFinite(total) || total < 1) {
        throw new ApiError(400, `Invalid marks for ${student.studentName}`);
      }
      if (!isAbsent && (!Number.isFinite(obtained) || obtained < 0)) {
        throw new ApiError(400, `Invalid marks for ${student.studentName}`);
      }
      if (!isAbsent && obtained > total) {
        throw new ApiError(
          400,
          `Obtained marks cannot exceed total marks (${total}) for ${student.studentName}`
        );
      }
      const prev = mergedBySubject.get(sid) || {};
      const paperImage =
        sm.paperImage !== undefined && sm.paperImage !== null
          ? String(sm.paperImage || '')
          : prev.paperImage || '';
      mergedBySubject.set(sid, {
        subject: sid,
        obtained,
        total,
        isAbsent,
        remarks: isAbsent
          ? String(sm.remarks || '').trim() || 'Absent'
          : sm.remarks || '',
        grade: sm.grade,
        paperImage,
      });
    }

    const totals = computeResultTotals([...mergedBySubject.values()]);
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
          ...(row.proofImages !== undefined ? { proofImages: row.proofImages || [] } : {}),
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

async function uploadStudentExamPaper(examId, studentId, subjectId, file) {
  const exam = await Exam.findById(examId);
  if (!exam) throw new ApiError(404, 'Exam not found');
  const student = await AcademyStudent.findById(studentId);
  if (!student || String(resolveClassId(student)) !== String(exam.academyClass)) {
    throw new ApiError(400, 'Student not in this exam class');
  }
  const subjects = await AcademySubject.find({ classId: exam.academyClass, status: 'active' }).lean();
  const allowedIds = new Set(enrolledSubjectIds(student, subjects));
  const sid = String(subjectId || '');
  if (!sid || !allowedIds.has(sid)) {
    throw new ApiError(400, 'Student is not enrolled in this subject');
  }
  const subject = subjects.find((s) => String(s._id) === sid);
  if (!subject) throw new ApiError(400, 'Subject not found for this exam class');

  const url = saveExamPaperFile(examId, studentId, sid, file);
  const existing = await Result.findOne({ academyStudent: studentId, exam: exam._id });
  let savedToRecord = false;
  if (existing) {
    const marks = Array.isArray(existing.subjectMarks) ? existing.subjectMarks : [];
    const idx = marks.findIndex((m) => String(m.subject) === sid);
    if (idx >= 0) {
      marks[idx].paperImage = url;
      existing.subjectMarks = marks;
      existing.markModified('subjectMarks');
      await existing.save();
      savedToRecord = true;
    }
  }
  return { paperImage: url, studentId, subjectId: sid, savedToRecord };
}

async function getExamResults(examId) {
  const results = await Result.find({ exam: examId })
    .populate(
      'academyStudent',
      'studentId studentName fatherName classId rollNumber phone contactPhoneRes'
    )
    .populate('subjectMarks.subject', 'subjectName subjectCode')
    .sort({ percentage: -1 })
    .lean();

  await Promise.all(
    results.map((r, i) => Result.updateOne({ _id: r._id }, { $set: { position: i + 1 } }))
  );

  return Result.find({ exam: examId })
    .populate(
      'academyStudent',
      'studentId studentName fatherName classId rollNumber phone contactPhoneRes'
    )
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
  uploadStudentExamPaper,
  getExamResults,
  publishResult,
  publishAllForExam,
  studentPublishedResults,
};
