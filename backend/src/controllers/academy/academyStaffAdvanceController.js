const catchAsync = require('../../utils/catchAsync');
const advanceService = require('../../services/academy/staffAdvanceService');
const rt = require('../../services/realtime/academyRealtime');

const list = catchAsync(async (req, res) => {
  const result = await advanceService.listAdvances({
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 20,
    staffId: req.query.staffId,
    type: req.query.type,
    status: req.query.status,
    search: req.query.search,
  });
  res.json({ success: true, data: result.items, pagination: result.pagination });
});

const getOne = catchAsync(async (req, res) => {
  const data = await advanceService.getAdvanceById(req.params.id);
  res.json({ success: true, data });
});

const summary = catchAsync(async (req, res) => {
  const data = await advanceService.getAdvanceSummary({
    staffId: req.query.staffId,
    type: req.query.type,
  });
  res.json({ success: true, data });
});

const create = catchAsync(async (req, res) => {
  const data = await advanceService.createAdvance(req.body, req.user._id);
  rt.salaryCrud('updated', 'batch');
  res.status(201).json({ success: true, data });
});

const update = catchAsync(async (req, res) => {
  const data = await advanceService.updateAdvance(req.params.id, req.body, req.user._id);
  rt.salaryCrud('updated', 'batch');
  res.json({ success: true, data });
});

const repay = catchAsync(async (req, res) => {
  const data = await advanceService.recordCashRepayment(req.params.id, req.body, req.user._id);
  rt.salaryCrud('updated', 'batch');
  res.json({ success: true, data });
});

const cancel = catchAsync(async (req, res) => {
  const data = await advanceService.cancelAdvance(req.params.id, req.user._id);
  rt.salaryCrud('updated', 'batch');
  res.json({ success: true, data });
});

const setVoucherDeduction = catchAsync(async (req, res) => {
  const data = await advanceService.setVoucherDeduction(
    req.params.id,
    req.body.amount,
    req.user._id
  );
  rt.salaryCrud('updated', req.params.id);
  res.json({ success: true, data });
});

module.exports = { list, getOne, summary, create, update, repay, cancel, setVoucherDeduction };
