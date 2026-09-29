const fs = require('fs');
const path = require('path');
const ApiError = require('../../utils/ApiError');
const AcademyClassTest = require('../../models/academy/AcademyClassTest');
const AcademyAssessment = require('../../models/academy/AcademyAssessment');
const AcademyStudent = require('../../models/academy/AcademyStudent');
const AcademySubject = require('../../models/academy/AcademySubject');
const AcademyClass = require('../../models/academy/AcademyClass');
const assessmentService = require('./academyAssessmentService');
const { buildSeriesPlan } = require('./classTestSeries');
const { hasAnySubjectEnrollment, isEnrolledInSubject } = require('./studentEnrollment');

const TEST_PAPER_DIR = path.join(__dirname, '../../../uploads/test-papers');

function saveTestPaperFile(testId, studentId, file) {
  if (!file?.buffer?.length) throw new ApiError(400, 'Image file required');
  fs.mkdirSync(TEST_PAPER_DIR, { recursive: true });
  const ext = path.extname(file.originalname || '') || '.jpg';
  const safeExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext.toLowerCase()) ? ext : '.jpg';
  const filename = `${testId}-${studentId}-${Date.now()}${safeExt}`;
  const dest = path.join(TEST_PAPER_DIR, filename);
  fs.writeFileSync(dest, file.buffer);
  return `/uploads/test-papers/${filename}`;
}

async function uploadStudentTestPaper(testId, studentId, file) {
  const test = await AcademyClassTest.findById(testId);
  if (!test) throw new ApiError(404, 'Class test not found');
  const student = await AcademyStudent.findById(studentId);
  if (!student || String(student.classId) !== String(test.classId)) {
    throw new ApiError(400, 'Student not in this test class');
  }
  const testSubjectId = String(test.subjectId);
  if (!hasAnySubjectEnrollment(student) || !isEnrolledInSubject(student, testSubjectId)) {
    throw new ApiError(400, 'Student is not enrolled in this test subject');
  }
  const url = saveTestPaperFile(testId, studentId, file);
  const existing = await AcademyAssessment.findOne({ classTestId: testId, studentId });
  if (existing) {
    existing.testPaperImage = url;
    await existing.save();
  }
  return { testPaperImage: url, studentId, savedToRecord: Boolean(existing) };
}

async function assertClassAndSubject(classId, subjectId) {
  const cls = await AcademyClass.findById(classId);
  if (!cls) throw new ApiError(404, 'Class not found');
  const subject = await AcademySubject.findOne({ _id: subjectId, classId });
  if (!subject) throw new ApiError(400, 'Subject not found for this class');
  return { cls, subject };
}

async function populateTestQuery(query) {
  return query
    .populate('classId', 'className')
    .populate('subjectId', 'subjectName subjectCode')
    .populate('createdBy', 'name email')
    .lean();
}

async function createClassTest(body, userId) {
  await assertClassAndSubject(body.classId, body.subjectId);

  const { seriesId, occurrences, createdCount } = buildSeriesPlan(body);
  const docs = [];

  for (const occ of occurrences) {
    // eslint-disable-next-line no-await-in-loop
    const doc = await AcademyClassTest.create({
      classId: body.classId,
      subjectId: body.subjectId,
      title: occ.title,
      seriesLabel: occ.seriesLabel,
      assessmentType: body.assessmentType || 'weekly',
      examDate: occ.examDate,
      testTime: occ.testTime,
      totalMarks: body.totalMarks,
      status: 'open',
      recurrence: occ.recurrence,
      seriesId: occ.seriesId,
      occurrenceIndex: occ.occurrenceIndex,
      occurrenceCount: occ.occurrenceCount,
      createdBy: userId,
    });
    docs.push(doc);
  }

  const tests = await AcademyClassTest.find({ _id: { $in: docs.map((d) => d._id) } })
    .populate('classId', 'className')
    .populate('subjectId', 'subjectName subjectCode')
    .sort({ occurrenceIndex: 1 })
    .lean();

  return {
    test: tests[0],
    tests,
    seriesId,
    createdCount,
  };
}

async function listClassTests({ classId, seriesId } = {}) {
  const q = {};
  if (classId) q.classId = classId;
  if (seriesId) q.seriesId = seriesId;
  return AcademyClassTest.find(q)
    .populate('classId', 'className')
    .populate('subjectId', 'subjectName subjectCode')
    .sort({ examDate: -1, seriesId: -1, occurrenceIndex: 1, createdAt: -1 })
    .lean();
}

async function getClassTestById(id) {
  const test = await AcademyClassTest.findById(id)
    .populate('classId', 'className')
    .populate('subjectId', 'subjectName subjectCode')
    .lean();
  if (!test) throw new ApiError(404, 'Class test not found');
  return test;
}

async function getClassTestMarksEntry(testId) {
  const test = await getClassTestById(testId);
  const classId = test.classId?._id || test.classId;

  const subjectId = String(test.subjectId?._id || test.subjectId);

  const students = await AcademyStudent.find({ classId, status: 'active' })
    .select('studentId studentName fatherName isFullPackage selectedSubjects')
    .sort({ studentName: 1 })
    .lean();

  const enrolledStudents = students.filter(
    (s) => hasAnySubjectEnrollment(s) && isEnrolledInSubject(s, subjectId)
  );

  const assessments = await AcademyAssessment.find({ classTestId: testId }).lean();
  const byStudent = {};
  assessments.forEach((a) => {
    byStudent[String(a.studentId)] = a;
  });

  let seriesSiblings = [];
  if (test.seriesId) {
    seriesSiblings = await AcademyClassTest.find({ seriesId: test.seriesId })
      .select('title examDate testTime occurrenceIndex occurrenceCount status')
      .sort({ occurrenceIndex: 1 })
      .lean();
  }

  return {
    test,
    series: seriesSiblings,
    students: enrolledStudents.map((student) => ({
      student: {
        _id: student._id,
        studentId: student.studentId,
        studentName: student.studentName,
        fatherName: student.fatherName,
      },
      assessment: byStudent[String(student._id)] || null,
    })),
  };
}

async function saveClassTestMarks(testId, entries, userId) {
  const test = await AcademyClassTest.findById(testId);
  if (!test) throw new ApiError(404, 'Class test not found');
  if (test.status === 'closed') throw new ApiError(400, 'This test is closed for editing');

  if (!Array.isArray(entries) || !entries.length) {
    throw new ApiError(400, 'No marks to save');
  }

  const classId = String(test.classId);
  const saved = [];

  for (const row of entries) {
    if (row.obtainedMarks === '' || row.obtainedMarks == null) continue;
    const obtained = Number(row.obtainedMarks);
    if (Number.isNaN(obtained) || obtained < 0) continue;
    if (obtained > test.totalMarks) {
      throw new ApiError(400, `Obtained marks cannot exceed ${test.totalMarks}`);
    }

    const student = await AcademyStudent.findById(row.studentId);
    if (!student || String(student.classId) !== classId) {
      throw new ApiError(400, 'Invalid student for this class');
    }
    const testSubjectId = String(test.subjectId);
    if (!hasAnySubjectEnrollment(student) || !isEnrolledInSubject(student, testSubjectId)) {
      throw new ApiError(400, `${student.studentName} is not enrolled in this test subject`);
    }

    const payload = {
      classTestId: testId,
      subjectId: test.subjectId,
      title: test.title,
      assessmentType: test.assessmentType,
      examDate: test.examDate,
      totalMarks: test.totalMarks,
      obtainedMarks: obtained,
      remarks: row.remarks || '',
      testPaperImage: row.testPaperImage || '',
    };

    if (row.assessmentId) {
      const updated = await assessmentService.updateAssessment(row.assessmentId, payload);
      saved.push(updated);
      continue;
    }

    const existing = await AcademyAssessment.findOne({
      classTestId: testId,
      studentId: row.studentId,
    });
    if (existing) {
      const updated = await assessmentService.updateAssessment(existing._id, payload);
      saved.push(updated);
    } else {
      const created = await assessmentService.createAssessment(row.studentId, payload, userId);
      saved.push(created);
    }
  }

  if (!saved.length) throw new ApiError(400, 'Enter at least one student mark');
  return { savedCount: saved.length, records: saved };
}

async function removeClassTest(id, { deleteSeries = false } = {}) {
  const test = await AcademyClassTest.findById(id);
  if (!test) throw new ApiError(404, 'Class test not found');

  if (deleteSeries && test.seriesId) {
    const siblings = await AcademyClassTest.find({ seriesId: test.seriesId }).select('_id').lean();
    const ids = siblings.map((s) => s._id);
    await AcademyAssessment.deleteMany({ classTestId: { $in: ids } });
    await AcademyClassTest.deleteMany({ seriesId: test.seriesId });
    return { ok: true, deletedCount: ids.length };
  }

  await AcademyAssessment.deleteMany({ classTestId: id });
  await AcademyClassTest.findByIdAndDelete(id);
  return { ok: true, deletedCount: 1 };
}

module.exports = {
  createClassTest,
  listClassTests,
  getClassTestById,
  getClassTestMarksEntry,
  saveClassTestMarks,
  uploadStudentTestPaper,
  removeClassTest,
};
