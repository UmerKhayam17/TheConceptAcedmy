const catchAsync = require('../../utils/catchAsync');
const feeStructureService = require('../../services/academy/academyFeeStructureService');
const rt = require('../../services/realtime/academyRealtime');
const { assertNotParent } = require('../../utils/parentScope');

const list = catchAsync(async (req, res) => {
  assertNotParent(req, 'Parents cannot view fee structures');
  const data = await feeStructureService.listAll({
    status: req.query.status,
    classId: req.query.classId,
  });
  res.json({ success: true, data });
});

const getByClass = catchAsync(async (req, res) => {
  assertNotParent(req, 'Parents cannot view fee structures');
  const data = await feeStructureService.getByClass(req.params.classId);
  res.json({ success: true, data: data || null });
});

const create = catchAsync(async (req, res) => {
  const data = await feeStructureService.createStructure(req.body, req.user._id);
  rt.feeStructureCrud('created', data._id);
  res.status(201).json({ success: true, data });
});

const update = catchAsync(async (req, res) => {
  const data = await feeStructureService.updateStructure(req.params.id, req.body);
  rt.feeStructureCrud('updated', data._id);
  res.json({ success: true, data });
});

const preview = catchAsync(async (req, res) => {
  assertNotParent(req, 'Parents cannot preview fees');
  const data = await feeStructureService.previewFees(req.body);
  res.json({ success: true, data });
});

const remove = catchAsync(async (req, res) => {
  await feeStructureService.deleteStructure(req.params.id);
  rt.feeStructureCrud('deleted', req.params.id);
  res.json({ success: true, data: { deleted: true } });
});

module.exports = { list, getByClass, create, update, preview, remove };
