const catchAsync = require('../../utils/catchAsync');
const ApiError = require('../../utils/ApiError');
const AcademyStudent = require('../../models/academy/AcademyStudent');
const AcademyAssessment = require('../../models/academy/AcademyAssessment');
const assessmentService = require('../../services/academy/academyAssessmentService');
const {
  isTeacherRole,
  assertTeacherCanAccessStudent,
  assertTeacherOwnsCombo,
  assertTeacherHasClassSection,
} = require('../../services/academy/teacherTestScope');

async function assertParentOwnsStudent(req, studentId) {
  const roleName = req.user?.roleDoc?.name || req.user?.role?.name || req.user?.role;
  if (String(roleName) !== 'parent') return;

  const student = await AcademyStudent.findById(studentId).select('guardianEmail');
  if (!student) throw new ApiError(404, 'Student not found');

  const guardianEmail = String(student.guardianEmail || '').trim().toLowerCase();
  const userEmail = String(req.user?.email || '').trim().toLowerCase();
  if (!guardianEmail || guardianEmail !== userEmail) {
    throw new ApiError(403, 'Access denied');
  }
}

async function assertTeacherOwnsStudent(req, studentId) {
  if (!isTeacherRole(req)) return;
  const student = await AcademyStudent.findById(studentId).select('classId sectionId');
  if (!student) throw new ApiError(404, 'Student not found');
  await assertTeacherCanAccessStudent(
    req.user._id,
    student,
    req.query.sessionId || req.body?.sessionId
  );
}

async function assertTeacherOwnsAssessment(req, assessmentId) {
  if (!isTeacherRole(req)) return;
  const row = await AcademyAssessment.findById(assessmentId).select('studentId');
  if (!row) throw new ApiError(404, 'Assessment not found');
  await assertTeacherOwnsStudent(req, row.studentId);
}

const list = catchAsync(async (req, res) => {
  await assertParentOwnsStudent(req, req.params.studentId);
  await assertTeacherOwnsStudent(req, req.params.studentId);
  const data = await assessmentService.listByStudent(req.params.studentId);
  res.json({ success: true, data });
});

const create = catchAsync(async (req, res) => {
  await assertParentOwnsStudent(req, req.params.studentId);
  await assertTeacherOwnsStudent(req, req.params.studentId);
  const data = await assessmentService.createAssessment(req.params.studentId, req.body, req.user._id);
  res.status(201).json({ success: true, data });
});

const update = catchAsync(async (req, res) => {
  await assertTeacherOwnsAssessment(req, req.params.id);
  const data = await assessmentService.updateAssessment(req.params.id, req.body, req.user._id);
  res.json({ success: true, data });
});

const remove = catchAsync(async (req, res) => {
  await assertTeacherOwnsAssessment(req, req.params.id);
  await assessmentService.removeAssessment(req.params.id);
  res.json({ success: true, data: { ok: true } });
});

const classEntry = catchAsync(async (req, res) => {
  if (isTeacherRole(req)) {
    const { classId, sectionId, subjectId, sessionId } = req.query;
    if (classId && sectionId && subjectId) {
      await assertTeacherOwnsCombo(req.user._id, {
        classId,
        sectionId,
        subjectId,
        sessionId,
      });
    } else if (classId && sectionId) {
      await assertTeacherHasClassSection(req.user._id, { classId, sectionId, sessionId });
    }
  }
  const data = await assessmentService.getClassTestEntry(req.query);
  res.json({ success: true, data });
});

const bulkSave = catchAsync(async (req, res) => {
  if (isTeacherRole(req)) {
    const { classId, sectionId, subjectId, sessionId } = req.body || {};
    if (classId && sectionId && subjectId) {
      await assertTeacherOwnsCombo(req.user._id, {
        classId,
        sectionId,
        subjectId,
        sessionId,
      });
    } else if (classId && sectionId) {
      await assertTeacherHasClassSection(req.user._id, { classId, sectionId, sessionId });
    }
  }
  const data = await assessmentService.bulkSaveClassTest(req.body, req.user._id);
  res.status(201).json({ success: true, data });
});

module.exports = { list, create, update, remove, classEntry, bulkSave };
