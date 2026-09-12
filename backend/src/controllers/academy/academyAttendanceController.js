const catchAsync = require('../../utils/catchAsync');
const ApiError = require('../../utils/ApiError');
const attendanceService = require('../../services/academy/academyAttendanceService');
const {
  renderAttendanceExcel,
  renderAttendancePdf,
} = require('../../services/academy/academyAttendanceExportService');
const AcademyClass = require('../../models/academy/AcademyClass');
const AcademySection = require('../../models/academy/AcademySection');
const AcademyStudent = require('../../models/academy/AcademyStudent');
const Session = require('../../models/Session');
const rt = require('../../services/realtime/academyRealtime');
const {
  roleNameOf,
  linkedStudentIdsForParent,
  assertParentOwnsStudent,
} = require('../../utils/parentScope');

const list = catchAsync(async (req, res) => {
  const date = req.query.date;
  if (!date) {
    return res.status(400).json({ success: false, message: 'date query required (YYYY-MM-DD)' });
  }

  const isParent = roleNameOf(req) === 'parent';

  let studentIds;
  if (isParent) {
    studentIds = await linkedStudentIdsForParent(req);
    if (req.query.studentId) {
      await assertParentOwnsStudent(req, req.query.studentId);
      studentIds = [req.query.studentId];
    }
  }

  const data = await attendanceService.listByDate({
    date,
    classId: isParent ? undefined : req.query.classId,
    sectionId: isParent ? undefined : req.query.sectionId,
    sessionId: isParent ? undefined : req.query.sessionId,
    studentIds,
  });
  res.json({ success: true, data });
});

async function resolveExportMeta(req, summary) {
  let className = '';
  let sessionName = '';
  let sectionName = '';
  let studentName = '';

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
  if (req.query.sectionId) {
    const section = await AcademySection.findById(req.query.sectionId).select('sectionName');
    sectionName = section?.sectionName || '';
  }
  if (req.query.studentId) {
    const student = await AcademyStudent.findById(req.query.studentId).select(
      'studentName studentId rollNumber'
    );
    if (student) {
      const ref = student.studentId || student.rollNumber;
      studentName = ref ? `${student.studentName} (${ref})` : student.studentName;
    }
  }

  return {
    date: req.query.date || '',
    className,
    sessionName,
    sectionName,
    studentName,
    summary,
    generatedAt: new Date(),
  };
}

function recordMapFromDay(data) {
  const map = new Map();
  (data.records || []).forEach((r) => {
    if (r?.studentId) map.set(String(r.studentId), r);
  });
  return map;
}

const exportAttendance = catchAsync(async (req, res) => {
  if (roleNameOf(req) === 'parent') {
    throw new ApiError(403, 'Parents cannot export attendance');
  }
  const date = req.query.date;
  if (!date) throw new ApiError(400, 'date query required (YYYY-MM-DD)');

  const format = String(req.query.format || 'xlsx').toLowerCase();
  if (!['xlsx', 'pdf'].includes(format)) {
    throw new ApiError(400, 'Export format must be xlsx or pdf');
  }

  const data = await attendanceService.listByDate({
    date,
    classId: req.query.classId,
    sectionId: req.query.sectionId,
    sessionId: req.query.classId ? undefined : req.query.sessionId,
    studentId: req.query.studentId,
  });
  const meta = await resolveExportMeta(req, data.summary);
  const records = recordMapFromDay(data);

  if (format === 'pdf') {
    const buffer = await renderAttendancePdf(data.students, records, meta);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="attendance-${date}.pdf"`);
    return res.send(buffer);
  }

  const buffer = await renderAttendanceExcel(data.students, records, meta);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="attendance-${date}.xlsx"`);
  return res.send(Buffer.from(buffer));
});

const mark = catchAsync(async (req, res) => {
  if (roleNameOf(req) === 'parent') {
    throw new ApiError(403, 'Parents cannot mark attendance');
  }
  const data = await attendanceService.markAttendance(req.body, req.user._id);
  rt.attendanceCrud('updated', req.body?.classId || 'batch');
  res.status(201).json({ success: true, data });
});

const summary = catchAsync(async (req, res) => {
  const data = await attendanceService.getSummary({
    month: req.query.month ? Number(req.query.month) : undefined,
    year: req.query.year ? Number(req.query.year) : undefined,
  });
  res.json({ success: true, data });
});

module.exports = { list, mark, summary, exportAttendance };
