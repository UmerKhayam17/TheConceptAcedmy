const catchAsync = require('../../utils/catchAsync');
const ApiError = require('../../utils/ApiError');
const classService = require('../../services/academy/academyClassService');
const classRecordService = require('../../services/academy/academyClassRecordService');
const rt = require('../../services/realtime/academyRealtime');
const {
  isTeacherRole,
  getTeacherScopeCombos,
  classIdsFromCombos,
  assertTeacherCanAccessClass,
  idStr,
} = require('../../services/academy/teacherTestScope');
const {
  isParentRole,
  linkedStudentsForParent,
  assertNotParent,
} = require('../../utils/parentScope');

async function parentAllowedClassIds(req) {
  const kids = await linkedStudentsForParent(req, { select: 'classId' });
  return new Set(kids.map((s) => idStr(s.classId)).filter(Boolean));
}

const list = catchAsync(async (req, res) => {
  let data = await classService.listClasses({
    status: req.query.status,
    search: req.query.search,
    sessionId: req.query.sessionId,
  });
  if (isTeacherRole(req)) {
    const combos = await getTeacherScopeCombos(req.user._id, req.query.sessionId);
    const allowed = new Set(classIdsFromCombos(combos).map(idStr));
    data = data.filter((c) => allowed.has(idStr(c._id)));
  } else if (isParentRole(req)) {
    const allowed = await parentAllowedClassIds(req);
    data = data.filter((c) => allowed.has(idStr(c._id)));
  }
  res.json({ success: true, data });
});

const getOne = catchAsync(async (req, res) => {
  if (isTeacherRole(req)) {
    await assertTeacherCanAccessClass(req.user._id, req.params.id, req.query.sessionId);
  } else if (isParentRole(req)) {
    const allowed = await parentAllowedClassIds(req);
    if (!allowed.has(idStr(req.params.id))) {
      throw new ApiError(403, 'Access denied');
    }
  }
  const data = await classService.getClassById(req.params.id);
  res.json({ success: true, data });
});

const getRecord = catchAsync(async (req, res) => {
  assertNotParent(req, 'Parents cannot open class records');
  let allowedSectionIds = null;
  if (isTeacherRole(req)) {
    const combos = await assertTeacherCanAccessClass(req.user._id, req.params.id, req.query.sessionId);
    allowedSectionIds = combos
      .filter((c) => idStr(c.classId) === idStr(req.params.id))
      .map((c) => c.sectionId)
      .filter(Boolean);
  }
  const data = await classRecordService.getClassRecord(req.params.id, {
    omitSensitive: isTeacherRole(req),
    allowedSectionIds,
  });
  res.json({ success: true, data });
});

const create = catchAsync(async (req, res) => {
  const data = await classService.createClass(req.body, req.user._id);
  rt.classCrud('created', data._id);
  res.status(201).json({ success: true, data });
});

const update = catchAsync(async (req, res) => {
  const data = await classService.updateClass(req.params.id, req.body);
  rt.classCrud('updated', data._id);
  res.json({ success: true, data });
});

const remove = catchAsync(async (req, res) => {
  await classService.deleteClass(req.params.id);
  rt.classCrud('deleted', req.params.id);
  res.json({ success: true, data: { deleted: true } });
});

module.exports = { list, getOne, getRecord, create, update, remove };
