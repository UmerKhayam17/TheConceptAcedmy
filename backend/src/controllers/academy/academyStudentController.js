const catchAsync = require('../../utils/catchAsync');
const ApiError = require('../../utils/ApiError');
const AcademyClass = require('../../models/academy/AcademyClass');
const AcademySection = require('../../models/academy/AcademySection');
const Session = require('../../models/Session');
const studentService = require('../../services/academy/academyStudentService');
const recordService = require('../../services/academy/academyStudentRecordService');
const feeStructureService = require('../../services/academy/academyFeeStructureService');
const {
  renderStudentsExcel,
  renderStudentsPdf,
  normalizeReportType,
} = require('../../services/academy/academyStudentExportService');
const rt = require('../../services/realtime/academyRealtime');
const {
  isTeacherRole,
  resolveTeacherScope,
  ensureClassInTeacherScope,
  assertTeacherCanAccessStudent,
  sanitizeStudentForTeacher,
  sanitizeStudentRecordForTeacher,
} = require('../../services/academy/teacherTestScope');
const {
  roleNameOf,
  linkedStudentIdsForParent,
  assertParentOwnsStudent,
  assertNotParent,
} = require('../../utils/parentScope');

const register = catchAsync(async (req, res) => {
  const data = await studentService.registerStudent(req.body, req.user._id);
  rt.studentCreated(data, req.user._id);
  res.status(201).json({ success: true, data });
});

const registerProvisional = catchAsync(async (req, res) => {
  const data = await studentService.registerProvisionalStudent(req.body, req.user._id);
  rt.studentCreated(data, req.user._id);
  res.status(201).json({ success: true, data });
});

const activate = catchAsync(async (req, res) => {
  const result = await studentService.activateStudent(req.params.id, req.body, req.user._id);
  rt.studentActivated(result.student);
  res.json({ success: true, data: result.student, credentials: result.credentials });
});

const prepareEnrollmentVoucher = catchAsync(async (req, res) => {
  const result = await studentService.prepareEnrollmentVoucher(req.params.id, req.body, req.user._id);
  rt.studentUpdated(result.student);
  if (result.voucher?._id) rt.feeCrud('created', result.voucher._id);
  res.status(201).json({
    success: true,
    data: result.student,
    voucher: result.voucher,
    fees: result.fees,
  });
});

const assignSection = catchAsync(async (req, res) => {
  const result = await studentService.assignSectionAfterPayment(req.params.id, req.body, req.user._id);
  rt.studentActivated(result.student);
  res.json({ success: true, data: result.student, credentials: result.credentials });
});

const changeSection = catchAsync(async (req, res) => {
  const result = await studentService.changeStudentSection(req.params.id, req.body);
  rt.studentUpdated(result.student);
  res.json({
    success: true, data: result.student, meta: {
      previousSectionId: result.previousSectionId,
      newSectionId: result.newSectionId,
    }
  });
});

const registerDirect = catchAsync(async (req, res) => {
  const result = await studentService.registerDirectStudent(req.body, req.user._id);
  rt.studentActivated(result.student);
  res.status(201).json({ success: true, data: result.student, credentials: result.credentials });
});

const update = catchAsync(async (req, res) => {
  const data = await studentService.updateStudent(req.params.id, req.body);
  rt.studentUpdated(data);
  res.json({ success: true, data });
});

const getById = catchAsync(async (req, res) => {
  await assertParentOwnsStudent(req, req.params.id);
  const data = await studentService.getStudent(req.params.id);
  if (isTeacherRole(req)) {
    await assertTeacherCanAccessStudent(req.user._id, data, req.query.sessionId);
    return res.json({ success: true, data: sanitizeStudentForTeacher(data) });
  }
  res.json({ success: true, data });
});

const getRecord = catchAsync(async (req, res) => {
  await assertParentOwnsStudent(req, req.params.id);
  const data = await recordService.getStudentRecord(req.params.id);
  if (isTeacherRole(req)) {
    await assertTeacherCanAccessStudent(req.user._id, data.student, req.query.sessionId);
    return res.json({ success: true, data: sanitizeStudentRecordForTeacher(data) });
  }
  res.json({ success: true, data });
});

const list = catchAsync(async (req, res) => {
  const isParent = roleNameOf(req) === 'parent';
  let studentIds = null;
  if (isParent) {
    studentIds = await linkedStudentIdsForParent(req);
  }
  const teacherScope = await resolveTeacherScope(req, req.query.sessionId);
  if (teacherScope) {
    ensureClassInTeacherScope(teacherScope, req.query.classId);
  }
  const result = await studentService.listStudents({
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 20,
    search: req.query.search,
    classId: isParent ? undefined : req.query.classId,
    sectionId: isParent ? undefined : req.query.sectionId,
    status: req.query.status,
    sessionId: isParent ? undefined : req.query.sessionId,
    sort: req.query.sort,
    studentIds,
    scopeFilter: teacherScope?.scopeFilter || null,
    hidePhoneSearch: Boolean(teacherScope) || isParent,
  });
  const items = teacherScope
    ? result.items.map((s) => sanitizeStudentForTeacher(s))
    : result.items;
  res.json({ success: true, data: items, pagination: result.pagination });
});

async function resolveExportMeta(req) {
  let className = '';
  let sectionName = '';
  let sessionName = '';
  if (req.query.classId) {
    const cls = await AcademyClass.findById(req.query.classId)
      .select('className sessionId')
      .populate('sessionId', 'name');
    className = cls?.className || '';
    sessionName = cls?.sessionId?.name || '';
  }
  if (req.query.sectionId) {
    const sec = await AcademySection.findById(req.query.sectionId).select('sectionName');
    sectionName = sec?.sectionName || '';
  }
  if (!sessionName && req.query.sessionId) {
    const session = await Session.findById(req.query.sessionId).select('name');
    sessionName = session?.name || '';
  }
  return {
    search: req.query.search || '',
    status: req.query.status || '',
    className,
    sectionName,
    sessionName,
    generatedAt: new Date(),
    generatedBy: req.user?.name || req.user?.email || '',
  };
}

const exportStudents = catchAsync(async (req, res) => {
  assertNotParent(req, 'Parents cannot export students');
  const format = String(req.query.format || 'xlsx').toLowerCase();
  if (!['xlsx', 'pdf', 'csv'].includes(format)) {
    throw new ApiError(400, 'Export format must be xlsx, pdf, or csv');
  }
  if (!req.query.classId || !req.query.sectionId) {
    throw new ApiError(400, 'Select both class and section to export the student list');
  }

  const teacherScope = await resolveTeacherScope(req, req.query.sessionId);
  if (teacherScope) {
    ensureClassInTeacherScope(teacherScope, req.query.classId);
  }

  const result = await studentService.listStudents({
    page: 1,
    limit: 10000,
    search: req.query.search,
    classId: req.query.classId,
    sectionId: req.query.sectionId,
    status: req.query.status,
    sessionId: req.query.sessionId,
    forExport: true,
    scopeFilter: teacherScope?.scopeFilter || null,
    hidePhoneSearch: Boolean(teacherScope),
  });
  const meta = await resolveExportMeta(req);
  const omitSensitive = Boolean(teacherScope);
  const reportType = normalizeReportType(req.query.reportType || req.query.report);
  const renderOpts = { omitSensitive, reportType };

  const safeToken = (value, fallback = 'All') => {
    const cleaned = String(value || fallback)
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '');
    return cleaned || fallback;
  };
  const fileBase = [
    reportType === 'contact' ? 'Contact-List' : 'Student-List',
    meta.sessionName ? safeToken(meta.sessionName) : null,
    meta.className ? safeToken(meta.className) : null,
    meta.sectionName ? safeToken(meta.sectionName) : null,
    meta.status ? safeToken(meta.status) : null,
  ]
    .filter(Boolean)
    .join('_');

  if (format === 'pdf') {
    const buffer = await renderStudentsPdf(result.items, meta, renderOpts);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileBase}.pdf"`);
    return res.send(buffer);
  }

  if (format === 'xlsx') {
    const buffer = await renderStudentsExcel(result.items, meta, renderOpts);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.xlsx"`);
    return res.send(Buffer.from(buffer));
  }

  const csv = studentService.studentsToCsv(result.items, { omitSensitive });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.csv"`);
  res.send(csv);
});

const previewFees = catchAsync(async (req, res) => {
  assertNotParent(req, 'Parents cannot preview fees');
  const data = await feeStructureService.previewFees(req.body);
  res.json({ success: true, data });
});

const remove = catchAsync(async (req, res) => {
  const data = await studentService.deleteStudent(req.params.id);
  rt.studentDeleted(req.params.id);
  res.json({ success: true, data });
});

const discountReport = catchAsync(async (req, res) => {
  const result = await studentService.getDiscountReport({
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 20,
    classId: req.query.classId,
    search: req.query.search,
    from: req.query.from,
    to: req.query.to,
  });
  res.json({ success: true, data: result.items, summary: result.summary, pagination: result.pagination });
});

const uploadPhoto = catchAsync(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Image file required');
  const data = await studentService.uploadStudentPhoto(req.params.id, req.file);
  rt.studentUpdated(data);
  res.json({ success: true, data });
});

const provisionParentPortals = catchAsync(async (req, res) => {
  const data = await studentService.provisionParentPortalsForAllActiveStudents();
  res.json({ success: true, data });
});

module.exports = {
  register,
  registerProvisional,
  registerDirect,
  activate,
  prepareEnrollmentVoucher,
  assignSection,
  changeSection,
  update,
  getById,
  getRecord,
  list,
  exportStudents,
  exportCsv: exportStudents,
  previewFees,
  remove,
  discountReport,
  uploadPhoto,
  provisionParentPortals,
};
