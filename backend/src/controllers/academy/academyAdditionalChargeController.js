const catchAsync = require('../../utils/catchAsync');
const chargeService = require('../../services/academy/academyAdditionalChargeService');

const list = catchAsync(async (req, res) => {
  const data = await chargeService.listCharges({ status: req.query.status });
  res.json({ success: true, data });
});

const create = catchAsync(async (req, res) => {
  const data = await chargeService.createCharge(req.body, req.user._id);
  res.status(201).json({ success: true, data });
});

const update = catchAsync(async (req, res) => {
  const data = await chargeService.updateCharge(req.params.id, req.body);
  res.json({ success: true, data });
});

const remove = catchAsync(async (req, res) => {
  await chargeService.deleteCharge(req.params.id);
  res.json({ success: true, data: { deleted: true } });
});

module.exports = { list, create, update, remove };
