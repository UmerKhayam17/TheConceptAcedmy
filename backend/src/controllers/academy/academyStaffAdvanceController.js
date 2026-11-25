const catchAsync = require('../../utils/catchAsync');
const advanceService = require('../../services/academy/staffAdvanceService');
const rt = require('../../services/realtime/academyRealtime');
const { exportStaffAdvanceReport } = require('../../services/academy/staffAdvanceExportService');

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
  rt.staffAdvanceCrud('updated', 'batch');
  rt.salaryCrud('updated', 'batch');
  res.status(201).json({ success: true, data });
});

const update = catchAsync(async (req, res) => {
  const data = await advanceService.updateAdvance(req.params.id, req.body, req.user._id);
  rt.staffAdvanceCrud('updated', 'batch');
  rt.salaryCrud('updated', 'batch');
  res.json({ success: true, data });
});

const repay = catchAsync(async (req, res) => {
  const data = await advanceService.recordCashRepayment(req.params.id, req.body, req.user._id);
  rt.staffAdvanceCrud('updated', 'batch');
  rt.salaryCrud('updated', 'batch');
  res.json({ success: true, data });
});

const cancel = catchAsync(async (req, res) => {
  const data = await advanceService.cancelAdvance(req.params.id, req.user._id);
  rt.staffAdvanceCrud('updated', 'batch');
  rt.salaryCrud('updated', 'batch');
  res.json({ success: true, data });
});

const setVoucherDeduction = catchAsync(async (req, res) => {
  const data = await advanceService.setVoucherDeduction(
    req.params.id,
    req.body.amount,
    req.user._id
  );
  rt.staffAdvanceCrud('updated', req.params.id);
  rt.salaryCrud('updated', req.params.id);
  res.json({ success: true, data });
});

/** GET /staff-advances/export-report?format=pdf|xlsx&kind=list|repayments&type&status&search&staffId&ids */
const exportReport = catchAsync(async (req, res) => {
  const format = String(req.query.format || 'xlsx').toLowerCase() === 'pdf' ? 'pdf' : 'xlsx';
  const kind = req.query.kind === 'repayments' ? 'repayments' : 'list';
  const ids = String(req.query.ids || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[a-f0-9]{24}$/i.test(s));
  const buffer = await exportStaffAdvanceReport({
    format,
    kind,
    staffId: req.query.staffId || undefined,
    type: ['advance', 'loan'].includes(req.query.type) ? req.query.type : undefined,
    status: ['active', 'closed', 'cancelled'].includes(req.query.status) ? req.query.status : undefined,
    search: req.query.search ? String(req.query.search).slice(0, 100) : undefined,
    ids: ids.length ? ids : undefined,
  });
  const name = kind === 'repayments' ? 'Advance-Loan-Repayments' : 'Staff-Advances-Loans';
  const day = new Date().toISOString().slice(0, 10);
  const file = `${name}_${day}.${format}`;
  if (format === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${file}"`);
  } else {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
  }
  res.send(Buffer.from(buffer));
});

module.exports = { list, getOne, summary, create, update, repay, cancel, setVoucherDeduction, exportReport };
