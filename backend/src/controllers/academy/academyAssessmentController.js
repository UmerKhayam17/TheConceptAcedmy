const catchAsync = require('../../utils/catchAsync');
const ApiError = require('../../utils/ApiError');
const AcademyStudent = require('../../models/academy/AcademyStudent');
const assessmentService = require('../../services/academy/academyAssessmentService');

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

const list = catchAsync(async (req, res) => {
  await assertParentOwnsStudent(req, req.params.studentId);
  const data = await assessmentService.listByStudent(req.params.studentId);
  res.json({ success: true, data });
});

const create = catchAsync(async (req, res) => {
  await assertParentOwnsStudent(req, req.params.studentId);
  const data = await assessmentService.createAssessment(req.params.studentId, req.body, req.user._id);
  res.status(201).json({ success: true, data });
});

const update = catchAsync(async (req, res) => {
  const data = await assessmentService.updateAssessment(req.params.id, req.body, req.user._id);
  res.json({ success: true, data });
});

const remove = catchAsync(async (req, res) => {
  await assessmentService.removeAssessment(req.params.id);
  res.json({ success: true, data: { ok: true } });
});

const classEntry = catchAsync(async (req, res) => {
  const data = await assessmentService.getClassTestEntry(req.query);
  res.json({ success: true, data });
});

const bulkSave = catchAsync(async (req, res) => {
  const data = await assessmentService.bulkSaveClassTest(req.body, req.user._id);
  res.status(201).json({ success: true, data });
});

module.exports = { list, create, update, remove, classEntry, bulkSave };
