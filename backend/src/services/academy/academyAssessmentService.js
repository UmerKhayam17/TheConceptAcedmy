const ApiError = require('../../utils/ApiError');
const AcademyAssessment = require('../../models/academy/AcademyAssessment');
const AcademyStudent = require('../../models/academy/AcademyStudent');
const AcademySubject = require('../../models/academy/AcademySubject');
const { hasAnySubjectEnrollment, isEnrolledInSubject } = require('./studentEnrollment');

async function assertStudent(id) {
  const student = await AcademyStudent.findById(id);
  if (!student) throw new ApiError(404, 'Student not found');
  return student;
}

async function listByStudent(studentId) {
  await assertStudent(studentId);
  return AcademyAssessment.find({ studentId })
    .sort({ examDate: -1 })
    .populate('subjectId', 'subjectName subjectCode')
    .populate('createdBy', 'name email')
    .populate('recordedBy', 'name email')
    .populate({
      path: 'classTestId',
      select: 'title createdBy teacherId',
      populate: [
        { path: 'createdBy', select: 'name email' },
        { path: 'teacherId', select: 'name email' },
      ],
    })
    .lean();
}

async function createAssessment(studentId, body, userId) {
  const student = await assertStudent(studentId);
  if (!hasAnySubjectEnrollment(student)) {
    throw new ApiError(400, 'Student is not enrolled in any subject');
  }
  if (body.subjectId) {
    const sub = await AcademySubject.findOne({ _id: body.subjectId, classId: student.classId });
    if (!sub) throw new ApiError(400, 'Subject not found for this class');
    if (!isEnrolledInSubject(student, body.subjectId)) {
      throw new ApiError(400, 'Student is not enrolled in this subject');
    }
  }
  if (body.obtainedMarks > body.totalMarks) {
    throw new ApiError(400, 'Obtained marks cannot exceed total marks');
  }
  const doc = await AcademyAssessment.create({
    studentId,
    classTestId: body.classTestId || undefined,
    subjectId: body.subjectId || undefined,
    title: body.title,
    assessmentType: body.assessmentType || 'weekly',
    examDate: body.examDate,
    totalMarks: body.totalMarks,
    obtainedMarks: body.obtainedMarks,
    remarks: body.remarks || '',
    testPaperImage: body.testPaperImage || '',
    recordedBy: userId,
    createdBy: userId,
  });
  return AcademyAssessment.findById(doc._id)
    .populate('subjectId', 'subjectName subjectCode')
    .populate('createdBy', 'name email')
    .populate('recordedBy', 'name email')
    .populate({ path: 'classTestId', select: 'title createdBy teacherId', populate: [
      { path: 'createdBy', select: 'name email' },
      { path: 'teacherId', select: 'name email' },
    ] })
    .lean();
}

async function updateAssessment(id, body, userId) {
  const existing = await AcademyAssessment.findById(id);
  if (!existing) throw new ApiError(404, 'Assessment not found');
  const obtained = body.obtainedMarks ?? existing.obtainedMarks;
  const total = body.totalMarks ?? existing.totalMarks;
  if (obtained > total) throw new ApiError(400, 'Obtained marks cannot exceed total marks');

  if (body.subjectId) {
    const student = await AcademyStudent.findById(existing.studentId);
    const sub = await AcademySubject.findOne({ _id: body.subjectId, classId: student?.classId });
    if (!sub) throw new ApiError(400, 'Subject not found for this class');
  }

  const updated = await AcademyAssessment.findByIdAndUpdate(
    id,
    {
      ...(body.classTestId !== undefined && { classTestId: body.classTestId || null }),
      ...(body.subjectId !== undefined && { subjectId: body.subjectId || null }),
      ...(body.title !== undefined && { title: body.title }),
      ...(body.assessmentType !== undefined && { assessmentType: body.assessmentType }),
      ...(body.examDate !== undefined && { examDate: body.examDate }),
      ...(body.totalMarks !== undefined && { totalMarks: body.totalMarks }),
      ...(body.obtainedMarks !== undefined && { obtainedMarks: body.obtainedMarks }),
      ...(body.remarks !== undefined && { remarks: body.remarks }),
      ...(body.testPaperImage !== undefined && { testPaperImage: body.testPaperImage || '' }),
      ...(userId && { recordedBy: userId }),
    },
    { new: true }
  )
    .populate('subjectId', 'subjectName subjectCode')
    .populate('createdBy', 'name email')
    .populate('recordedBy', 'name email')
    .populate({ path: 'classTestId', select: 'title createdBy teacherId', populate: [
      { path: 'createdBy', select: 'name email' },
      { path: 'teacherId', select: 'name email' },
    ] })
    .lean();
  return updated;
}

async function removeAssessment(id) {
  const doc = await AcademyAssessment.findByIdAndDelete(id);
  if (!doc) throw new ApiError(404, 'Assessment not found');
  return doc;
}

function dayRange(examDate) {
  const d = new Date(examDate);
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/** Class grid: students enrolled in subject + optional existing rows for same test session. */
async function getClassTestEntry({ classId, subjectId, title, assessmentType, examDate, sectionId }) {
  const subject = await AcademySubject.findOne({ _id: subjectId, classId, status: 'active' }).lean();
  if (!subject) throw new ApiError(404, 'Subject not found for this class');

  const studentQ = { classId, status: 'active' };
  if (sectionId) studentQ.sectionId = sectionId;

  const students = await AcademyStudent.find(studentQ)
    .select('studentId studentName fatherName isFullPackage selectedSubjects classId sectionId')
    .sort({ studentName: 1 })
    .lean();

  const enrolled = students.filter((s) => isEnrolledInSubject(s, subjectId));

  let existingByStudent = {};
  if (title && assessmentType && examDate) {
    const { start, end } = dayRange(examDate);
    const studentIds = enrolled.map((s) => s._id);
    const existing = await AcademyAssessment.find({
      studentId: { $in: studentIds },
      subjectId,
      title: title.trim(),
      assessmentType,
      examDate: { $gte: start, $lte: end },
    }).lean();
    existing.forEach((a) => {
      existingByStudent[String(a.studentId)] = a;
    });
  }

  return {
    subject,
    students: enrolled.map((student) => ({
      student: {
        _id: student._id,
        studentId: student.studentId,
        studentName: student.studentName,
        fatherName: student.fatherName,
      },
      assessment: existingByStudent[String(student._id)] || null,
    })),
  };
}

/** Save marks for many students for one test session (create or update per row). */
async function bulkSaveClassTest(body, userId) {
  const { classId, subjectId, title, assessmentType, examDate, totalMarks, entries } = body;
  const subject = await AcademySubject.findOne({ _id: subjectId, classId });
  if (!subject) throw new ApiError(400, 'Subject not found for this class');
  if (!Array.isArray(entries) || !entries.length) {
    throw new ApiError(400, 'No marks to save');
  }

  const { start, end } = dayRange(examDate);
  const saved = [];

  for (const row of entries) {
    if (row.obtainedMarks === '' || row.obtainedMarks == null) continue;
    const obtained = Number(row.obtainedMarks);
    if (Number.isNaN(obtained) || obtained < 0) continue;
    if (obtained > totalMarks) {
      throw new ApiError(400, `Obtained marks cannot exceed ${totalMarks} for student ${row.studentId}`);
    }

    const student = await AcademyStudent.findById(row.studentId);
    if (!student || String(student.classId) !== String(classId)) {
      throw new ApiError(400, 'Invalid student for this class');
    }
    if (!hasAnySubjectEnrollment(student)) {
      throw new ApiError(400, `${student.studentName} is not enrolled in any subject`);
    }
    if (!isEnrolledInSubject(student, subjectId)) {
      throw new ApiError(400, `${student.studentName} is not enrolled in this subject`);
    }

    const payload = {
      subjectId,
      title: title.trim(),
      assessmentType,
      examDate,
      totalMarks,
      obtainedMarks: obtained,
      remarks: row.remarks || '',
      recordedBy: userId,
    };

    if (row.assessmentId) {
      const updated = await updateAssessment(row.assessmentId, payload, userId);
      saved.push(updated);
      continue;
    }

    const dup = await AcademyAssessment.findOne({
      studentId: row.studentId,
      subjectId,
      title: title.trim(),
      assessmentType,
      examDate: { $gte: start, $lte: end },
    });
    if (dup) {
      const updated = await updateAssessment(dup._id, payload, userId);
      saved.push(updated);
    } else {
      const created = await createAssessment(row.studentId, payload, userId);
      saved.push(created);
    }
  }

  if (!saved.length) throw new ApiError(400, 'Enter at least one student mark');
  return { savedCount: saved.length, records: saved };
}

module.exports = {
  listByStudent,
  createAssessment,
  updateAssessment,
  removeAssessment,
  getClassTestEntry,
  bulkSaveClassTest,
};
