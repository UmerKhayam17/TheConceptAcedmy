const catchAsync = require('../../utils/catchAsync');
const ApiError = require('../../utils/ApiError');
const feeService = require('../../services/academy/academyFeeService');
const {
  renderFeeReceiptPdf,
  renderFeeChallanPdf,
} = require('../../services/academy/academyFeeReceiptService');
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

  const size = String(req.query.size || 'a4').toLowerCase();
  if (!['a4', 'thermal'].includes(size)) {
    throw new ApiError(400, 'Print size must be a4 or thermal');
  }

  const unpaid = record.status === 'pending' || record.status === 'overdue';
  const meta = {
    generatedAt: new Date(),
    generatedBy: req.user?.name || req.user?.email || '',
  };
  const buffer = unpaid
    ? await renderFeeChallanPdf([record], meta, size)
    : await renderFeeReceiptPdf(record, meta, size);
  const kind = unpaid ? 'challan' : 'receipt';
  const suffix = size === 'thermal' ? 'thermal' : 'a4';
  const filename = `${record.receiptNumber || `fee-${kind}-${record._id}`}-${suffix}.pdf`.replace(
    /[^\w.-]+/g,
    '_'
  );
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.send(buffer);
});

const challan = catchAsync(async (req, res) => {
  const months = req.query.months ? Number(req.query.months) : undefined;
  if (req.query.months && (!Number.isInteger(months) || months < 1 || months > 24)) {
    throw new ApiError(400, 'Months must be between 1 and 24');
  }

  const records = await feeService.listUnpaidForChallan(req.params.studentId, months);
  if (!records.length) {
    throw new ApiError(400, 'No unpaid fees to print');
  }
  const studentId = records[0].studentId?._id || records[0].studentId;
  await assertParentOwnsStudent(req, studentId);

  const size = String(req.query.size || 'a4').toLowerCase();
  if (!['a4', 'thermal'].includes(size)) {
    throw new ApiError(400, 'Print size must be a4 or thermal');
  }

  const buffer = await renderFeeChallanPdf(
    records,
    {
      generatedAt: new Date(),
      generatedBy: req.user?.name || req.user?.email || '',
    },
    size
  );
  const suffix = size === 'thermal' ? 'thermal' : 'a4';
  const filename = `fee-challan-${records.length}m-${suffix}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.send(buffer);
});

const pay = catchAsync(async (req, res) => {
  const data = await feeService.recordPayment(req.params.id, req.body, req.user._id);
  rt.feeCrud('updated', req.params.id);
  res.json({ success: true, data });
});

const payMany = catchAsync(async (req, res) => {
  const data = await feeService.recordPayments(req.body.feeRecordIds, req.body, req.user._id);
  rt.feeCrud('updated', 'batch');
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

function defaulterExportQuery(req) {
  return {
    classId: req.query.classId,
    month: req.query.month ? Number(req.query.month) : undefined,
    year: req.query.year ? Number(req.query.year) : undefined,
    search: req.query.search,
    sessionId: req.query.sessionId,
  };
}

const exportDefaulters = catchAsync(async (req, res) => {
  const csv = await feeService.exportFeeDefaulters(defaulterExportQuery(req));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="fee-defaulters.csv"');
  res.send(csv);
});

const exportDefaultersMonthWise = catchAsync(async (req, res) => {
  const format = String(req.query.format || 'xlsx').toLowerCase() === 'pdf' ? 'pdf' : 'xlsx';
  const buffer = await feeService.exportFeeDefaultersMonthWise({
    ...defaulterExportQuery(req),
    format,
  });
  if (format === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="fee-defaulters.pdf"');
  } else {
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="fee-defaulters.xlsx"');
  }
  res.send(Buffer.from(buffer));
});

module.exports = {
  list,
  generate,
  pay,
  payMany,
  receipt,
  challan,
  studentHistory,
  summary,
  defaulters,
  defaultersSummary,
  exportDefaulters,
  exportDefaultersMonthWise,
};
