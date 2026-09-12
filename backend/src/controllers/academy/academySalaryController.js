const catchAsync = require('../../utils/catchAsync');
const salaryService = require('../../services/academy/academySalaryService');
const rt = require('../../services/realtime/academyRealtime');

const list = catchAsync(async (req, res) => {
  const result = await salaryService.listSalaryRecords({
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 20,
    staffId: req.query.staffId,
    status: req.query.status,
    month: req.query.month ? Number(req.query.month) : undefined,
    year: req.query.year ? Number(req.query.year) : undefined,
    roleName: req.query.roleName,
  });
  res.json({ success: true, data: result.items, pagination: result.pagination });
});

const summary = catchAsync(async (req, res) => {
  const data = await salaryService.getSalarySummary({
    month: req.query.month ? Number(req.query.month) : undefined,
    year: req.query.year ? Number(req.query.year) : undefined,
    roleName: req.query.roleName,
    staffId: req.query.staffId,
  });
  res.json({ success: true, data });
});

const generate = catchAsync(async (req, res) => {
  const data = await salaryService.generateMonthlySalaries(req.body, req.user._id);
  rt.salaryCrud('generated', 'batch');
  res.status(201).json({ success: true, data });
});

const pay = catchAsync(async (req, res) => {
  const data = await salaryService.recordSalaryPayment(req.params.id, req.body, req.user._id);
  rt.salaryCrud('updated', req.params.id);
  res.json({ success: true, data });
});

module.exports = { list, summary, generate, pay };
