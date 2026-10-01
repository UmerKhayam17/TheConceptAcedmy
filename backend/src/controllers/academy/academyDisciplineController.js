const catchAsync = require('../../utils/catchAsync');
const disciplineService = require('../../services/academy/academyDisciplineService');

const listByClass = catchAsync(async (req, res) => {
  const AcademyClass = require('../../models/academy/AcademyClass');
  const cls = await AcademyClass.findById(req.params.classId).select('className');
  if (!cls) {
    const ApiError = require('../../utils/ApiError');
    throw new ApiError(404, 'Class not found');
  }
  const data = await disciplineService.listByClass(req.params.classId, {
    status: req.query.status,
  });
  res.json({
    success: true,
    data,
    meta: {
      requiresDiscipline: await disciplineService.classRequiresDiscipline(req.params.classId),
      suggestsDisciplines: disciplineService.classNameSuggestsDisciplines(cls.className),
    },
  });
});

const create = catchAsync(async (req, res) => {
  const data = await disciplineService.createDiscipline(req.body, req.user._id);
  res.status(201).json({ success: true, data });
});

const createDefaults = catchAsync(async (req, res) => {
  const data = await disciplineService.createStandardDisciplines(req.params.classId, req.user._id);
  res.status(201).json({ success: true, data });
});

const update = catchAsync(async (req, res) => {
  const data = await disciplineService.updateDiscipline(req.params.id, req.body);
  res.json({ success: true, data });
});

const remove = catchAsync(async (req, res) => {
  await disciplineService.deleteDiscipline(req.params.id);
  res.json({ success: true, data: { deleted: true } });
});

module.exports = { listByClass, create, createDefaults, update, remove };
