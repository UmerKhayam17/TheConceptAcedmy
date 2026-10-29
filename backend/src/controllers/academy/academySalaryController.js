const catchAsync = require('../../utils/catchAsync');
const salaryService = require('../../services/academy/academySalaryService');
const salaryExportService = require('../../services/academy/academySalaryExportService');
const { renderSalarySlipPdf } = require('../../services/academy/salarySlipPdfService');
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
    search: req.query.search,
  });
  res.json({ success: true, data: result.items, pagination: result.pagination });
});

const getOne = catchAsync(async (req, res) => {
  const data = await salaryService.getSalaryRecordById(req.params.id);
  res.json({ success: true, data });
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

const recalculate = catchAsync(async (req, res) => {
  const data = await salaryService.recalculatePercentageSalaries(req.body, req.user._id);
  rt.salaryCrud('updated', 'batch');
  res.json({ success: true, data });
});

const pay = catchAsync(async (req, res) => {
  const data = await salaryService.recordSalaryPayment(req.params.id, req.body, req.user._id);
  rt.salaryCrud('updated', req.params.id);
  res.json({ success: true, data });
});

const payBulk = catchAsync(async (req, res) => {
  const data = await salaryService.recordBulkSalaryPayments(req.body, req.user._id);
  if (data.paid > 0) {
    rt.salaryCrud('updated', 'batch');
  }
  res.json({ success: true, data });
});

const updateAmount = catchAsync(async (req, res) => {
  const data = await salaryService.updateSalaryAmount(req.params.id, req.body.amount, req.user._id);
  rt.salaryCrud('updated', req.params.id);
  res.json({ success: true, data });
});

const exportReport = catchAsync(async (req, res) => {
  const format = String(req.query.format || 'xlsx').toLowerCase() === 'pdf' ? 'pdf' : 'xlsx';
  const ids = String(req.query.ids || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const buffer = await salaryExportService.exportSalaryReport({
    format,
    month: req.query.month ? Number(req.query.month) : undefined,
    year: req.query.year ? Number(req.query.year) : undefined,
    status: req.query.status || undefined,
    roleName: req.query.roleName || undefined,
    staffId: req.query.staffId || undefined,
    search: req.query.search || undefined,
    ids: ids.length ? ids : undefined,
  });
  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const monthLabel = req.query.month
    ? monthNames[Number(req.query.month) - 1] || String(req.query.month)
    : 'All';
  const yearLabel = req.query.year || 'All';
  const salaryFile = `Staff-Salary_${monthLabel}-${yearLabel}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
  if (format === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${salaryFile}"`);
  } else {
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${salaryFile}"`);
  }
  res.send(Buffer.from(buffer));
});

const exportSlip = catchAsync(async (req, res) => {
  const { buffer, fileName } = await renderSalarySlipPdf(req.params.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
  res.send(buffer);
});

module.exports = {
  list,
  getOne,
  exportSlip,
  summary,
  generate,
  recalculate,
  pay,
  payBulk,
  updateAmount,
  exportReport,
};
