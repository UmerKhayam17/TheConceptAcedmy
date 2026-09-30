const catchAsync = require('../../utils/catchAsync');
const subjectService = require('../../services/academy/academySubjectService');
const { getEnrollmentLayout } = require('../../services/academy/academyEnrollmentSubjectService');
const rt = require('../../services/realtime/academyRealtime');
const {
  resolveTeacherScope,
  ensureClassInTeacherScope,
  subjectIdsForClassFromCombos,
  idStr,
} = require('../../services/academy/teacherTestScope');

const listByClass = catchAsync(async (req, res) => {
  const teacherScope = await resolveTeacherScope(req, req.query.sessionId);
  if (teacherScope) {
    ensureClassInTeacherScope(teacherScope, req.params.classId);
  }
  let data = await subjectService.listByClass(req.params.classId, {
    status: req.query.status,
    sectionId: req.query.sectionId,
  });
  if (teacherScope) {
    const allowed = new Set(
      subjectIdsForClassFromCombos(
        teacherScope.combos,
        req.params.classId,
        req.query.sectionId
      ).map(idStr)
    );
    data = data.filter((s) => allowed.has(idStr(s._id)));
  }
  res.json({ success: true, data });
});

const listChoiceGroups = catchAsync(async (req, res) => {
  const teacherScope = await resolveTeacherScope(req, req.query.sessionId);
  if (teacherScope) {
    ensureClassInTeacherScope(teacherScope, req.params.classId);
  }
  const data = await subjectService.listChoiceGroups(req.params.classId);
  res.json({ success: true, data });
});

const enrollmentLayout = catchAsync(async (req, res) => {
  const teacherScope = await resolveTeacherScope(req, req.query.sessionId);
  if (teacherScope) {
    ensureClassInTeacherScope(teacherScope, req.params.classId);
  }
  const data = await getEnrollmentLayout(req.params.classId, req.query.sectionId);
  res.json({ success: true, data });
});

const create = catchAsync(async (req, res) => {
  const data = await subjectService.createSubject(req.body, req.user._id);
  rt.subjectCrud('created', data._id);
  res.status(201).json({ success: true, data });
});

const createBulkChoice = catchAsync(async (req, res) => {
  const data = await subjectService.createBulkChoiceSubjects(
    { ...req.body, classId: req.params.classId || req.body.classId },
    req.user._id
  );
  (data.subjects || []).forEach((s) => rt.subjectCrud('created', s._id));
  res.status(201).json({ success: true, data });
});

const update = catchAsync(async (req, res) => {
  const data = await subjectService.updateSubject(req.params.id, req.body, req.user._id);
  rt.subjectCrud('updated', data._id);
  res.json({ success: true, data });
});

const remove = catchAsync(async (req, res) => {
  await subjectService.deleteSubject(req.params.id);
  rt.subjectCrud('deleted', req.params.id);
  res.json({ success: true, data: { deleted: true } });
});

module.exports = {
  listByClass,
  listChoiceGroups,
  enrollmentLayout,
  create,
  createBulkChoice,
  update,
  remove,
};
