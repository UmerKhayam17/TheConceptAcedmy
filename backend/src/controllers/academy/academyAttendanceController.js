const catchAsync = require('../../utils/catchAsync');
const ApiError = require('../../utils/ApiError');
const attendanceService = require('../../services/academy/academyAttendanceService');
const {
  renderAttendanceExcel,
  renderAttendancePdf,
  renderAbsentListExcel,
  renderAbsentListPdf,
  renderAttendanceRegisterPdf,
  renderAttendanceRegisterExcel,
  renderAbsentRegisterPdf,
  renderAbsentRegisterExcel,
} =require('../../services/academy/academyAttendanceExportService');
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
const {
  resolveTeacherScope,
  ensureClassInTeacherScope,
  ensureSectionInTeacherScope,
  assertTeacherCanAccessStudent,
  sanitizeStudentForTeacher,
  isTeacherRole,
} = require('../../services/academy/teacherTestScope');

const list = catchAsync(async (req, res) => {
  const date = req.query.date;
  if (!date) {
    return res.status(400).json({ success: false, message: 'date query required (YYYY-MM-DD)' });
  }

  const isParent = roleNameOf(req) === 'parent';
  const teacherScope = await resolveTeacherScope(req, req.query.sessionId);

  let studentIds;
  if (isParent) {
    studentIds = await linkedStudentIdsForParent(req);
    if (req.query.studentId) {
      await assertParentOwnsStudent(req, req.query.studentId);
      studentIds = [req.query.studentId];
    }
  }

  if (teacherScope) {
    ensureClassInTeacherScope(teacherScope, req.query.classId);
    ensureSectionInTeacherScope(teacherScope, req.query.classId, req.query.sectionId);
  }

  const data = await attendanceService.listByDate({
    date,
    classId: isParent ? undefined : req.query.classId,
    sectionId: isParent ? undefined : req.query.sectionId,
    sessionId: isParent ? undefined : req.query.sessionId,
    studentIds,
    scopeFilter: teacherScope?.scopeFilter || null,
  });

  if (teacherScope) {
    data.students = data.students.map((s) => sanitizeStudentForTeacher(s));
  }

  res.json({ success: true, data });
});

async function resolveExportMeta(req, summary, { date, dateFrom, dateTo } = {}) {
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

  const from = dateFrom || req.query.dateFrom || date || req.query.date || '';
  const to = dateTo || req.query.dateTo || date || req.query.date || '';

  return {
    date: from && to && from !== to ? `${from}–${to}` : from || to || '',
    dateFrom: from,
    dateTo: to,
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

function sendExportBuffer(res, buffer, { format, filename }) {
  res.setHeader(
    'Content-Type',
    format === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `${format === 'pdf' ? 'inline' : 'attachment'}; filename="${filename}"`
  );
  return res.send(buffer);
}

const listAbsent = catchAsync(async (req, res) => {
  const dateFrom = req.query.dateFrom || req.query.date;
  const dateTo = req.query.dateTo || req.query.dateFrom || req.query.date;
  if (!dateFrom || !dateTo) {
    return res.status(400).json({
      success: false,
      message: 'dateFrom and dateTo (or date) required (YYYY-MM-DD)',
    });
  }

  const isParent = roleNameOf(req) === 'parent';
  const teacherScope = await resolveTeacherScope(req, req.query.sessionId);

  let studentIds;
  if (isParent) {
    studentIds = await linkedStudentIdsForParent(req);
    if (req.query.studentId) {
      await assertParentOwnsStudent(req, req.query.studentId);
      studentIds = [req.query.studentId];
    }
  }

  if (teacherScope) {
    ensureClassInTeacherScope(teacherScope, req.query.classId);
    ensureSectionInTeacherScope(teacherScope, req.query.classId, req.query.sectionId);
  }

  const data = await attendanceService.listAbsentByDateRange({
    dateFrom,
    dateTo,
    classId: isParent ? undefined : req.query.classId,
    sectionId: isParent ? undefined : req.query.sectionId,
    sessionId: isParent ? undefined : req.query.classId ? undefined : req.query.sessionId,
    studentIds,
    studentId: isParent ? undefined : req.query.studentId,
    scopeFilter: teacherScope?.scopeFilter || null,
  });

  if (teacherScope) {
    data.days = (data.days || []).map((day) => ({
      ...day,
      students: (day.students || []).map((s) => sanitizeStudentForTeacher(s)),
    }));
  }

  res.json({ success: true, data });
});

const exportAttendance = catchAsync(async (req, res) => {
  if (roleNameOf(req) === 'parent') {
    throw new ApiError(403, 'Parents cannot export attendance');
  }

  const dateFrom = req.query.dateFrom || req.query.date;
  const dateTo = req.query.dateTo || req.query.dateFrom || req.query.date;
  if (!dateFrom || !dateTo) {
    throw new ApiError(400, 'dateFrom and dateTo (or date) required (YYYY-MM-DD)');
  }

  const format = String(req.query.format || 'xlsx').toLowerCase();
  if (!['xlsx', 'pdf'].includes(format)) {
    throw new ApiError(400, 'Export format must be xlsx or pdf');
  }

  const reportKind = String(req.query.reportKind || 'attendance').toLowerCase();
  const teacherScope = await resolveTeacherScope(req, req.query.sessionId);
  if (teacherScope) {
    ensureClassInTeacherScope(teacherScope, req.query.classId);
    ensureSectionInTeacherScope(teacherScope, req.query.classId, req.query.sectionId);
  }

  const filter = {
    classId: req.query.classId,
    sectionId: req.query.sectionId,
    sessionId: req.query.classId ? undefined : req.query.sessionId,
    studentId: req.query.studentId,
    scopeFilter: teacherScope?.scopeFilter || null,
  };

  const fromSafe = String(dateFrom).replace(/[^0-9-]/g, '');
  const toSafe = String(dateTo).replace(/[^0-9-]/g, '');
  const rangeStub = fromSafe === toSafe ? fromSafe : `${fromSafe}_to_${toSafe}`;
  const ext = format === 'pdf' ? 'pdf' : 'xlsx';

  const isRange = String(dateFrom) !== String(dateTo);

  // Date range → day-wise register (one column per date, like the monthly sheet).
  if (isRange) {
    const data = await attendanceService.listRegisterByDateRange({ dateFrom, dateTo, ...filter });
    const meta = await resolveExportMeta(req, data.summary, {
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
    });
    const absent = reportKind === 'absent';
    let buffer;
    if (format === 'pdf') {
      buffer = absent
        ? await renderAbsentRegisterPdf(data, meta)
        : await renderAttendanceRegisterPdf(data, meta);
    } else {
      buffer = absent
        ? await renderAbsentRegisterExcel(data, meta)
        : await renderAttendanceRegisterExcel(data, meta);
    }
    return sendExportBuffer(res, buffer, {
      format,
      filename: `${absent ? 'Absent-List' : 'Student-Attendance'}_${rangeStub}.${ext}`,
    });
  }

  if (reportKind === 'absent') {
    const data = await attendanceService.listAbsentByDateRange({
      dateFrom,
      dateTo,
      ...filter,
    });
    const meta = await resolveExportMeta(req, data.summary, {
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
    });
    const buffer =
      format === 'pdf'
        ? await renderAbsentListPdf(data.days, meta)
        : await renderAbsentListExcel(data.days, meta);
    return sendExportBuffer(res, buffer, {
      format,
      filename: `Absent-List_${rangeStub}.${ext}`,
    });
  }

  const data = await attendanceService.listByDate({ date: dateFrom, ...filter });

  const meta = await resolveExportMeta(req, data.summary, {
    date: data.date,
    dateFrom: data.dateFrom || dateFrom,
    dateTo: data.dateTo || dateTo,
  });

  const records = recordMapFromDay(data);
  const buffer =
    format === 'pdf'
      ? await renderAttendancePdf(data.students, records, meta)
      : await renderAttendanceExcel(data.students, records, meta);
  return sendExportBuffer(res, buffer, {
    format,
    filename: `Student-Attendance_${rangeStub}.${ext}`,
  });
});

const mark = catchAsync(async (req, res) => {
  if (roleNameOf(req) === 'parent') {
    throw new ApiError(403, 'Parents cannot mark attendance');
  }

  const teacher = isTeacherRole(req);
  const assertStudentAccess = teacher
    ? async (studentId) => {
        const student = await AcademyStudent.findById(studentId).select('classId sectionId');
        if (!student) throw new ApiError(404, 'Student not found');
        await assertTeacherCanAccessStudent(req.user._id, student, req.query.sessionId || req.body?.sessionId);
      }
    : undefined;

  const data = await attendanceService.markAttendance(req.body, req.user._id, {
    assertStudentAccess,
  });
  rt.attendanceCrud('updated', req.body?.classId || 'batch');
  res.status(201).json({ success: true, data });
});

const summary = catchAsync(async (req, res) => {
  const teacherScope = await resolveTeacherScope(req, req.query.sessionId);
  let studentIds = null;
  if (roleNameOf(req) === 'parent') {
    studentIds = await linkedStudentIdsForParent(req);
    if (req.query.studentId) {
      await assertParentOwnsStudent(req, req.query.studentId);
      studentIds = [req.query.studentId];
    }
  }
  const data = await attendanceService.getSummary({
    month: req.query.month ? Number(req.query.month) : undefined,
    year: req.query.year ? Number(req.query.year) : undefined,
    scopeFilter: teacherScope?.scopeFilter || null,
    studentIds,
  });
  res.json({ success: true, data });
});

const studentMonth = catchAsync(async (req, res) => {
  const studentId = req.params.studentId;
  await assertParentOwnsStudent(req, studentId);
  if (isTeacherRole(req)) {
    const student = await AcademyStudent.findById(studentId).select('classId sectionId');
    if (!student) throw new ApiError(404, 'Student not found');
    await assertTeacherCanAccessStudent(req.user._id, student, req.query.sessionId);
  }
  const data = await attendanceService.listByStudentMonth({
    studentId,
    month: req.query.month ? Number(req.query.month) : undefined,
    year: req.query.year ? Number(req.query.year) : undefined,
  });
  res.json({ success: true, data });
});

module.exports = { list, listAbsent, mark, summary, exportAttendance, studentMonth };
