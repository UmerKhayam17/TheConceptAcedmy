const catchAsync = require('../../utils/catchAsync');
const sectionService = require('../../services/academy/academySectionService');
const rt = require('../../services/realtime/academyRealtime');
const {
  resolveTeacherScope,
  ensureClassInTeacherScope,
  sectionIdsForClassFromCombos,
  idStr,
} = require('../../services/academy/teacherTestScope');

const listByClass = catchAsync(async (req, res) => {
  const teacherScope = await resolveTeacherScope(req, req.query.sessionId);
  if (teacherScope) {
    ensureClassInTeacherScope(teacherScope, req.params.classId);
  }
  let data = await sectionService.listByClass(req.params.classId, { status: req.query.status });
  if (teacherScope) {
    const allowed = new Set(
      sectionIdsForClassFromCombos(teacherScope.combos, req.params.classId).map(idStr)
    );
    data = data.filter((s) => allowed.has(idStr(s._id)));
  }
  res.json({ success: true, data });
});

const listBySession = catchAsync(async (req, res) => {
  const sessionId = req.query.sessionId || undefined;
  const teacherScope = await resolveTeacherScope(req, sessionId);
  let data = await sectionService.listBySession(sessionId, { status: req.query.status });
  if (teacherScope) {
    const allowedClassIds = new Set(teacherScope.classIds);
    const allowedSections = new Set();
    for (const c of teacherScope.combos) {
      allowedSections.add(idStr(c.sectionId));
    }
    data = data.filter(
      (s) => allowedClassIds.has(idStr(s.classId?._id || s.classId)) && allowedSections.has(idStr(s._id))
    );
  }
  res.json({ success: true, data });
});

const create = catchAsync(async (req, res) => {
  const data = await sectionService.createSection(req.body, req.user._id);
  rt.sectionCrud('created', data._id);
  res.status(201).json({ success: true, data });
});

const update = catchAsync(async (req, res) => {
  const data = await sectionService.updateSection(req.params.id, req.body);
  rt.sectionCrud('updated', data._id);
  res.json({ success: true, data });
});

const remove = catchAsync(async (req, res) => {
  await sectionService.deleteSection(req.params.id);
  rt.sectionCrud('deleted', req.params.id);
  res.json({ success: true, data: { deleted: true } });
});

module.exports = { listByClass, listBySession, create, update, remove };
