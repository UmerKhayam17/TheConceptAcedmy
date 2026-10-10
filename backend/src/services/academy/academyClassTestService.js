const fs = require('fs');
const path = require('path');
const ApiError = require('../../utils/ApiError');
const AcademyClassTest = require('../../models/academy/AcademyClassTest');
const AcademyAssessment = require('../../models/academy/AcademyAssessment');
const AcademyStudent = require('../../models/academy/AcademyStudent');
const AcademySubject = require('../../models/academy/AcademySubject');
const AcademyClass = require('../../models/academy/AcademyClass');
const AcademySection = require('../../models/academy/AcademySection');
const assessmentService = require('./academyAssessmentService');
const { buildSeriesPlan } = require('./classTestSeries');
const { isEnrolledInSubject } = require('./studentEnrollment');
const {
  isTeacherRole,
  getTeacherScopeCombos,
  mongoFilterForCombos,
  assertTeacherOwnsCombo,
  assertTeacherCanAccessTest,
  resolveTeacherForCombo,
} = require('./teacherTestScope');

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

async function assertClassSubjectSection(classId, subjectId, sectionId) {
  const cls = await AcademyClass.findById(classId);
  if (!cls) throw new ApiError(404, 'Class not found');
  const subject = await AcademySubject.findOne({ _id: subjectId, classId });
  if (!subject) throw new ApiError(400, 'Subject not found for this class');
  if (sectionId) {
    const section = await AcademySection.findOne({ _id: sectionId, classId });
    if (!section) throw new ApiError(400, 'Section not found for this class');
  }
  return { cls, subject };
}

async function populateTestQuery(query) {
  return query
    .populate('classId', 'className')
    .populate('sectionId', 'sectionName')
    .populate('disciplineId', 'name code')
    .populate('subjectId', 'subjectName subjectCode')
    .populate('teacherId', 'name email')
    .populate('createdBy', 'name email')
    .lean();
}

/**
 * Direct class-test create is admin/legacy only.
 * Teachers must use the assessment catalog assign → publish path.
 */
async function createClassTest(body, userId, actor) {
  if (isTeacherRole(actor)) {
    throw new ApiError(
      403,
      'Teachers must create tests from the assessment catalog (Tests → Create from catalog)'
    );
  }

  await assertClassSubjectSection(body.classId, body.subjectId, body.sectionId);

  const teacherId =
    body.teacherId ||
    (await resolveTeacherForCombo({
      sessionId: body.sessionId,
      classId: body.classId,
      sectionId: body.sectionId,
      subjectId: body.subjectId,
    })) ||
    userId;

  const { seriesId, occurrences, createdCount } = buildSeriesPlan(body);
  const docs = [];

  for (const occ of occurrences) {
    // eslint-disable-next-line no-await-in-loop
    const doc = await AcademyClassTest.create({
      classId: body.classId,
      sectionId: body.sectionId || undefined,
      subjectId: body.subjectId,
      title: occ.title,
      seriesLabel: occ.seriesLabel,
      assessmentType: body.assessmentType || 'weekly',
      examDate: occ.examDate,
      testTime: occ.testTime,
      totalMarks: body.totalMarks,
      syllabus: body.syllabus || '',
      status: 'open',
      recurrence: occ.recurrence,
      seriesId: occ.seriesId,
      occurrenceIndex: occ.occurrenceIndex,
      occurrenceCount: occ.occurrenceCount,
      teacherId,
      createdBy: userId,
    });
    docs.push(doc);
  }

  const tests = await AcademyClassTest.find({ _id: { $in: docs.map((d) => d._id) } })
    .populate('classId', 'className')
    .populate('sectionId', 'sectionName')
    .populate('subjectId', 'subjectName subjectCode')
    .populate('teacherId', 'name email')
    .sort({ occurrenceIndex: 1 })
    .lean();

  return {
    test: tests[0],
    tests,
    seriesId,
    createdCount,
  };
}

async function listClassTests({ classId, seriesId, sessionId } = {}, actor) {
  const q = {};
  if (classId) q.classId = classId;
  if (seriesId) q.seriesId = seriesId;

  if (isTeacherRole(actor)) {
    const combos = await getTeacherScopeCombos(actor._id, sessionId);
    const scopeFilter = mongoFilterForCombos(combos);
    Object.assign(q, scopeFilter);
  }

  return populateTestQuery(
    AcademyClassTest.find(q).sort({ examDate: -1, seriesId: -1, occurrenceIndex: 1, createdAt: -1 })
  );
}

async function getClassTestById(id, actor, sessionId) {
  const test = await populateTestQuery(AcademyClassTest.findById(id));
  if (!test) throw new ApiError(404, 'Class test not found');
  if (isTeacherRole(actor)) {
    await assertTeacherCanAccessTest(actor._id, test, sessionId);
  }
  return test;
}

async function getClassTestMarksEntry(testId, actor, sessionId) {
  const test = await getClassTestById(testId, actor, sessionId);
  const classId = test.classId?._id || test.classId;
  const sectionId = test.sectionId?._id || test.sectionId;
  const disciplineId = test.disciplineId?._id || test.disciplineId;

  const studentQ = { classId, status: 'active' };
  if (sectionId) studentQ.sectionId = sectionId;
  if (disciplineId) studentQ.disciplineId = disciplineId;

  const subjectId = test.subjectId?._id || test.subjectId;
  // Award list / marks: only students enrolled in this subject (full package or selectedSubjects)
  const studentsRaw = await AcademyStudent.find(studentQ)
    .select(
      'studentId studentName fatherName rollNumber sectionId isFullPackage selectedSubjects disciplineId'
    )
    .populate('sectionId', 'sectionName')
    .populate('disciplineId', 'name code')
    .sort({ studentName: 1 })
    .lean();
  const students = subjectId
    ? studentsRaw.filter((s) => isEnrolledInSubject(s, subjectId))
    : studentsRaw;

  const assessments = await AcademyAssessment.find({ classTestId: testId })
    .populate('createdBy', 'name email')
    .populate('recordedBy', 'name email')
    .lean();
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
    students: students.map((student) => ({
      student: {
        _id: student._id,
        studentId: student.studentId,
        studentName: student.studentName,
        fatherName: student.fatherName,
        rollNumber: student.rollNumber,
        sectionName:
          typeof student.sectionId === 'object' && student.sectionId
            ? student.sectionId.sectionName
            : undefined,
        disciplineName:
          typeof student.disciplineId === 'object' && student.disciplineId
            ? student.disciplineId.name
            : undefined,
        disciplineId:
          typeof student.disciplineId === 'object' && student.disciplineId
            ? student.disciplineId._id
            : student.disciplineId || undefined,
      },
      assessment: byStudent[String(student._id)] || null,
    })),
  };
}

async function saveClassTestMarks(testId, entries, userId, actor, sessionId) {
  const test = await AcademyClassTest.findById(testId);
  if (!test) throw new ApiError(404, 'Class test not found');
  if (isTeacherRole(actor)) {
    await assertTeacherCanAccessTest(actor._id, test, sessionId);
  }
  if (test.status === 'closed') throw new ApiError(400, 'This test is closed for editing');

  if (!Array.isArray(entries) || !entries.length) {
    throw new ApiError(400, 'No marks to save');
  }

  const classId = String(test.classId);
  const sectionId = test.sectionId ? String(test.sectionId) : '';
  const disciplineId = test.disciplineId ? String(test.disciplineId) : '';
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
    if (sectionId && String(student.sectionId || '') !== sectionId) {
      throw new ApiError(400, 'Invalid student for this section');
    }
    if (disciplineId && String(student.disciplineId || '') !== disciplineId) {
      throw new ApiError(400, 'Invalid student for this discipline');
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
      const updated = await assessmentService.updateAssessment(row.assessmentId, payload, userId);
      saved.push(updated);
      continue;
    }

    const existing = await AcademyAssessment.findOne({
      classTestId: testId,
      studentId: row.studentId,
    });
    if (existing) {
      const updated = await assessmentService.updateAssessment(existing._id, payload, userId);
      saved.push(updated);
    } else {
      const created = await assessmentService.createAssessment(row.studentId, payload, userId);
      saved.push(created);
    }
  }

  if (!saved.length) throw new ApiError(400, 'Enter at least one student mark');
  return { savedCount: saved.length, records: saved };
}

async function uploadStudentTestPaper(testId, studentId, file, actor, sessionId) {
  const test = await AcademyClassTest.findById(testId);
  if (!test) throw new ApiError(404, 'Class test not found');
  if (isTeacherRole(actor)) {
    await assertTeacherCanAccessTest(actor._id, test, sessionId);
  }
  const student = await AcademyStudent.findById(studentId);
  if (!student || String(student.classId) !== String(test.classId)) {
    throw new ApiError(400, 'Student not in this test class');
  }
  if (test.sectionId && String(student.sectionId || '') !== String(test.sectionId)) {
    throw new ApiError(400, 'Student not in this test section');
  }
  if (test.disciplineId && String(student.disciplineId || '') !== String(test.disciplineId)) {
    throw new ApiError(400, 'Student not in this test discipline');
  }
  const url = saveTestPaperFile(testId, studentId, file);
  const existing = await AcademyAssessment.findOne({ classTestId: testId, studentId });
  if (existing) {
    existing.testPaperImage = url;
    await existing.save();
  }
  return { testPaperImage: url, studentId, savedToRecord: Boolean(existing) };
}

async function removeClassTest(id, { deleteSeries = false } = {}, actor, sessionId) {
  const test = await AcademyClassTest.findById(id);
  if (!test) throw new ApiError(404, 'Class test not found');
  if (isTeacherRole(actor)) {
    await assertTeacherCanAccessTest(actor._id, test, sessionId);
    if (test.assignmentId) {
      throw new ApiError(403, 'Catalog-linked tests cannot be deleted here; remove the catalog assignment instead');
    }
  }

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
  // re-export for tests that assert combo ownership
  assertTeacherOwnsCombo,
};
