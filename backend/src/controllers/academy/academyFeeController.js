const catchAsync = require('../../utils/catchAsync');
const ApiError = require('../../utils/ApiError');
const feeService = require('../../services/academy/academyFeeService');
const { renderFeeReceiptPdf } = require('../../services/academy/academyFeeReceiptService');
const rt = require('../../services/realtime/academyRealtime');
const {
  roleNameOf,
  linkedStudentIdsForParent,
  assertParentOwnsStudent,
} = require('../../utils/parentScope');

const list = catchAsync(async (req, res) => {
  const isParent = roleNameOf(req) === 'parent';

  const studentId = req.query.studentId;
  if (isParent && studentId) {
    await assertParentOwnsStudent(req, studentId);
  }

  let studentIds;
  if (isParent && !studentId) {
    studentIds = await linkedStudentIdsForParent(req);
  }

  const result = await feeService.listFeeRecords({
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 20,
    studentId: studentId || undefined,
    studentIds,
    status: req.query.status,
    month: req.query.month,
    year: req.query.year,
    classId: isParent ? undefined : req.query.classId,
    feeType: req.query.feeType,
    sessionId: isParent ? undefined : req.query.sessionId,
  });
  res.json({ success: true, data: result.items, pagination: result.pagination });
});

const generate = catchAsync(async (req, res) => {
  const data = await feeService.generateMonthlyFees(req.body, req.user._id);
  rt.feeCrud('generated', data?._id || 'batch');
  res.status(201).json({ success: true, data });
});

const receipt = catchAsync(async (req, res) => {
  const record = await feeService.getFeeRecordById(req.params.id);
  const studentId = record.studentId?._id || record.studentId;
  await assertParentOwnsStudent(req, studentId);

  if (record.status !== 'paid') {
    throw new ApiError(400, 'Receipt is available after the fee is paid');
  }

  const size = String(req.query.size || 'a4').toLowerCase();
  if (!['a4', 'thermal'].includes(size)) {
    throw new ApiError(400, 'Receipt size must be a4 or thermal');
  }

  const buffer = await renderFeeReceiptPdf(
    record,
    {
      generatedAt: new Date(),
      generatedBy: req.user?.name || req.user?.email || '',
    },
    size
  );
  const suffix = size === 'thermal' ? 'thermal' : 'a4';
  const filename = `${record.receiptNumber || `fee-receipt-${record._id}`}-${suffix}.pdf`.replace(
    /[^\w.-]+/g,
    '_'
  );
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.send(buffer);
});

const pay = catchAsync(async (req, res) => {
  const data = await feeService.recordPayment(req.params.id, req.body, req.user._id);
  rt.feeCrud('updated', req.params.id);
  res.json({ success: true, data });
});

const studentHistory = catchAsync(async (req, res) => {
  await assertParentOwnsStudent(req, req.params.studentId);
  const data = await feeService.getStudentFeeHistory(req.params.studentId);
  res.json({ success: true, data });
});

const summary = catchAsync(async (req, res) => {
  const isParent = roleNameOf(req) === 'parent';

  const studentId = req.query.studentId;
  if (isParent && studentId) {
    await assertParentOwnsStudent(req, studentId);
  }

  let studentIds;
  if (isParent && !studentId) {
    studentIds = await linkedStudentIdsForParent(req);
  }

  const data = await feeService.getFeeSummary({
    month: req.query.month ? Number(req.query.month) : undefined,
    year: req.query.year ? Number(req.query.year) : undefined,
    classId: isParent ? undefined : req.query.classId,
    studentId: studentId || undefined,
    studentIds,
    sessionId: isParent ? undefined : req.query.sessionId,
  });
  res.json({ success: true, data });
});

const defaulters = catchAsync(async (req, res) => {
  const result = await feeService.listFeeDefaulters({
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 20,
    classId: req.query.classId,
    month: req.query.month ? Number(req.query.month) : undefined,
    year: req.query.year ? Number(req.query.year) : undefined,
    search: req.query.search,
    sessionId: req.query.sessionId,
  });
  res.json({ success: true, data: result.items, pagination: result.pagination });
});

const defaultersSummary = catchAsync(async (req, res) => {
  const data = await feeService.getDefaultersSummary({
    classId: req.query.classId,
    month: req.query.month ? Number(req.query.month) : undefined,
    year: req.query.year ? Number(req.query.year) : undefined,
    sessionId: req.query.sessionId,
  });
  res.json({ success: true, data });
});

const exportDefaulters = catchAsync(async (req, res) => {
  const csv = await feeService.exportFeeDefaulters({
    classId: req.query.classId,
    month: req.query.month ? Number(req.query.month) : undefined,
    year: req.query.year ? Number(req.query.year) : undefined,
    search: req.query.search,
    sessionId: req.query.sessionId,
  });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="fee-defaulters.csv"');
  res.send(csv);
});

module.exports = {
  list,
  generate,
  pay,
  receipt,
  studentHistory,
  summary,
  defaulters,
  defaultersSummary,
  exportDefaulters,
};
