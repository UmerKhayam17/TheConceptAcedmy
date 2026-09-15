const catchAsync = require('../../utils/catchAsync');
const ApiError = require('../../utils/ApiError');
const AcademyStudent = require('../../models/academy/AcademyStudent');
const AcademyClass = require('../../models/academy/AcademyClass');
const Session = require('../../models/Session');
const studentService = require('../../services/academy/academyStudentService');
const recordService = require('../../services/academy/academyStudentRecordService');
const feeStructureService = require('../../services/academy/academyFeeStructureService');
const {
  renderStudentsExcel,
  renderStudentsPdf,
} = require('../../services/academy/academyStudentExportService');
const importService = require('../../services/academy/academyStudentImportService');
const rt = require('../../services/realtime/academyRealtime');

async function assertParentOwnsStudent(req, studentId) {
  const roleName = req.user?.roleDoc?.name || req.user?.role?.name || req.user?.role;
  if (String(roleName) !== 'parent') return;

  const student = await AcademyStudent.findById(studentId).select('guardianEmail');
  if (!student) throw new ApiError(404, 'Student not found');

  const guardianEmail = String(student.guardianEmail || '').trim().toLowerCase();
  const userEmail = String(req.user?.email || '').trim().toLowerCase();

  if (!guardianEmail || guardianEmail !== userEmail) {
    throw new ApiError(403, 'Access denied');
  }
}

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
  res.json({ success: true, data });
});

const getRecord = catchAsync(async (req, res) => {
  await assertParentOwnsStudent(req, req.params.id);
  const data = await recordService.getStudentRecord(req.params.id);
  res.json({ success: true, data });
});

const list = catchAsync(async (req, res) => {
  const roleName = req.user?.roleDoc?.name || req.user?.role?.name || req.user?.role;
  const guardianEmail = String(roleName) === 'parent' ? String(req.user?.email || '').trim().toLowerCase() : undefined;
  const result = await studentService.listStudents({
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 20,
    search: req.query.search,
    classId: req.query.classId,
    sectionId: req.query.sectionId,
    status: req.query.status,
    fee: req.query.fee,
    discipline: req.query.discipline,
    sessionId: req.query.sessionId,
    sort: req.query.sort,
    guardianEmail,
  });
  res.json({ success: true, data: result.items, pagination: result.pagination, counts: result.counts });
});

async function resolveExportMeta(req) {
  let className = '';
  let sessionName = '';
  if (req.query.classId) {
    const cls = await AcademyClass.findById(req.query.classId)
      .select('className sessionId')
      .populate('sessionId', 'name');
    className = cls?.className || '';
    sessionName = cls?.sessionId?.name || '';
  }
  if (!sessionName && req.query.sessionId) {
    const session = await Session.findById(req.query.sessionId).select('name');
    sessionName = session?.name || '';
  }
  return {
    search: req.query.search || '',
    status: req.query.status || '',
    className,
    sessionName,
    generatedAt: new Date(),
    generatedBy: req.user?.name || req.user?.email || '',
  };
}

const importTemplate = catchAsync(async (req, res) => {
  const buffer = await importService.buildImportTemplate();
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename="STUDENT DETAIL.xlsx"');
  res.send(Buffer.from(buffer));
});

const importStudents = catchAsync(async (req, res) => {
  const data = await importService.importStudentsFromFile({
    file: req.file,
    sessionId: req.body.sessionId || req.query.sessionId,
    classId: req.body.classId || req.query.classId || '',
    userId: req.user._id,
  });
  res.status(data.createdCount ? 201 : 400).json({ success: data.createdCount > 0, data });
});

const exportStudents = catchAsync(async (req, res) => {
  const format = String(req.query.format || 'xlsx').toLowerCase();
  if (!['xlsx', 'pdf', 'csv'].includes(format)) {
    throw new ApiError(400, 'Export format must be xlsx, pdf, or csv');
  }

  const result = await studentService.listStudents({
    page: 1,
    limit: 10000,
    search: req.query.search,
    classId: req.query.classId,
    status: req.query.status,
    sessionId: req.query.sessionId,
    forExport: true,
  });
  const meta = await resolveExportMeta(req);

  if (format === 'pdf') {
    const buffer = await renderStudentsPdf(result.items, meta);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="academy-students.pdf"');
    return res.send(buffer);
  }

  if (format === 'xlsx') {
    const buffer = await renderStudentsExcel(result.items, meta);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="academy-students.xlsx"');
    return res.send(Buffer.from(buffer));
  }

  const csv = studentService.studentsToCsv(result.items);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="academy-students.csv"');
  res.send(csv);
});

const previewFees = catchAsync(async (req, res) => {
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

module.exports = {
  register,
  registerProvisional,
  registerDirect,
  activate,
  update,
  getById,
  getRecord,
  list,
  importTemplate,
  importStudents,
  exportStudents,
  exportCsv: exportStudents,
  previewFees,
  remove,
  discountReport,
  uploadPhoto,
};
