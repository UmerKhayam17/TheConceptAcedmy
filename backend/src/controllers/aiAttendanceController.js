const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const ai = require('../services/aiAttendance/aiAttendanceService');
const faceEnrollment = require('../services/aiAttendance/faceEnrollmentService');
const staffAttendanceService = require('../services/staffAttendanceService');
const staffPeriodAttendanceService = require('../services/staffPeriodAttendanceService');

const status = catchAsync(async (req, res) => {
  const data = await ai.statusOverview();
  res.json({ success: true, data });
});

const syncRoster = catchAsync(async (req, res) => {
  const data = await ai.syncRoster();
  res.json({ success: true, data });
});

/** Kept for UI compatibility — attendance is written live on identify (Mongo only). */
const syncAttendance = catchAsync(async (req, res) => {
  res.status(410).json({
    success: false,
    message: 'External attendance sync is retired. Marks are written to MongoDB on face match.',
    data: {
      date: req.body?.date || require('../utils/schoolDay').todayYmd(),
    },
  });
});

const people = catchAsync(async (req, res) => {
  const data = await ai.listPeopleForEnrollment();
  res.json({ success: true, data });
});

const enrollmentStatus = catchAsync(async (req, res) => {
  const data = await faceEnrollment.enrollmentStatus(req.params.employeeId);
  res.json({ success: true, data });
});

const enrollmentImage = catchAsync(async (req, res) => {
  const { absPath, filename } = await faceEnrollment.enrollmentImageFile(
    req.params.employeeId,
    req.params.index
  );
  res.setHeader('Cache-Control', 'private, max-age=120');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.sendFile(absPath);
});

const captureFace = catchAsync(async (req, res) => {
  const { image } = req.body || {};
  if (!image) throw new ApiError(400, 'image (base64) required');
  const data = await faceEnrollment.captureFace(req.params.employeeId, image);
  res.json({ success: true, data });
});

const trainFace = catchAsync(async (req, res) => {
  const data = await faceEnrollment.trainFace(req.params.employeeId);
  res.json({ success: true, data });
});

const deleteEnrollmentImage = catchAsync(async (req, res) => {
  const data = await faceEnrollment.deleteEnrollmentImage(req.params.employeeId, req.params.index);
  res.json({ success: true, data });
});

const deleteAllEnrollmentImages = catchAsync(async (req, res) => {
  const data = await faceEnrollment.deleteAllEnrollmentImages(req.params.employeeId);
  res.json({ success: true, data });
});

const identify = catchAsync(async (req, res) => {
  const { image, markAttendance = true, source = 'webcam' } = req.body || {};
  if (!image) throw new ApiError(400, 'image (base64) required');
  const data = await ai.identifyAndMark(image, { markAttendance, source });
  res.json({ success: true, data });
});

const cameras = catchAsync(async (req, res) => {
  const data = await ai.listCameras();
  res.json({ success: true, data });
});

const cameraSnapshot = catchAsync(async (req, res) => {
  const data = await ai.cameraSnapshot(req.params.cameraId);
  res.json({ success: true, data });
});

const cctvAction = catchAsync(async (req, res) => {
  const data = await ai.cameraAction(req.body?.action, req.body?.cameraId);
  res.json({ success: true, data });
});

const webhook = catchAsync(async (req, res) => {
  const secret = (process.env.AI_ATTENDANCE_WEBHOOK_SECRET || '').trim();
  if (!secret) {
    return res.status(410).json({
      success: false,
      message: 'Webhook retired (Mongo-only AI attendance). Set AI_ATTENDANCE_WEBHOOK_SECRET only if re-enabling.',
    });
  }
  const header = req.get('x-webhook-secret') || req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (header !== secret) throw new ApiError(401, 'Invalid webhook secret');
  res.json({ success: true, data: { ignored: true, reason: 'Mongo-only AI attendance' } });
});

const listStaffAttendance = catchAsync(async (req, res) => {
  const role = req.user?.roleDoc || req.user?.role;
  const roleName = typeof role === 'object' && role?.name ? role.name : '';
  const isAdmin = roleName === 'admin';
  const { todayYmd } = require('../utils/schoolDay');
  const date = req.query.date || todayYmd();
  const userId = isAdmin && req.query.userId ? req.query.userId : !isAdmin ? req.user._id : req.query.userId;
  const data = await staffAttendanceService.listByDate({ date, userId });
  res.json({ success: true, data });
});

const myStaffAttendance = catchAsync(async (req, res) => {
  const month = req.query.month ? Number(req.query.month) : undefined;
  const year = req.query.year ? Number(req.query.year) : undefined;
  const data = await staffAttendanceService.listForUser(req.user._id, { month, year });
  res.json({ success: true, data });
});

const staffAttendanceHistory = catchAsync(async (req, res) => {
  const role = req.user?.roleDoc || req.user?.role;
  const roleName = typeof role === 'object' && role?.name ? role.name : '';
  const isAdmin = roleName === 'admin';
  if (req.query.userId && String(req.query.userId) !== String(req.user._id) && !isAdmin) {
    throw new ApiError(403, "Not allowed to view another staff member's attendance");
  }
  const userId = req.query.userId || req.user._id;
  const month = req.query.month ? Number(req.query.month) : undefined;
  const year = req.query.year ? Number(req.query.year) : undefined;
  const data = await staffAttendanceService.listForUser(userId, { month, year });
  res.json({ success: true, data });
});

const listStaffTeachers = catchAsync(async (_req, res) => {
  const data = await staffAttendanceService.listTeachers();
  res.json({ success: true, data });
});

const listStaffAttendanceMonth = catchAsync(async (req, res) => {
  const role = req.user?.roleDoc || req.user?.role;
  const roleName = typeof role === 'object' && role?.name ? role.name : '';
  const isAdmin = roleName === 'admin';
  const month = req.query.month ? Number(req.query.month) : new Date().getMonth() + 1;
  const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
  let userId = req.query.userId;
  if (!isAdmin) {
    userId = req.user._id;
  }
  const data = await staffAttendanceService.listByMonth({ month, year, userId });
  res.json({ success: true, data });
});

const listStaffPeriodAttendance = catchAsync(async (req, res) => {
  const role = req.user?.roleDoc || req.user?.role;
  const roleName = typeof role === 'object' && role?.name ? role.name : '';
  const isAdmin = roleName === 'admin';
  const { todayYmd } = require('../utils/schoolDay');
  const date = req.query.date || todayYmd();
  const userId = isAdmin ? req.query.userId : req.user._id;
  const data = await staffPeriodAttendanceService.listDay({
    sessionId: req.query.sessionId,
    date,
    userId: userId || undefined,
  });
  res.json({ success: true, data });
});

const listStaffPeriodMonth = catchAsync(async (req, res) => {
  const role = req.user?.roleDoc || req.user?.role;
  const roleName = typeof role === 'object' && role?.name ? role.name : '';
  const isAdmin = roleName === 'admin';
  const month = req.query.month ? Number(req.query.month) : new Date().getMonth() + 1;
  const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
  const userId = isAdmin ? req.query.userId : req.user._id;
  const data = await staffPeriodAttendanceService.listMonth({
    sessionId: req.query.sessionId,
    month,
    year,
    userId: userId || undefined,
  });
  res.json({ success: true, data });
});

const saveStaffPeriodAttendance = catchAsync(async (req, res) => {
  const role = req.user?.roleDoc || req.user?.role;
  const roleName = typeof role === 'object' && role?.name ? role.name : '';
  const isAdmin = roleName === 'admin';
  let marks = Array.isArray(req.body?.marks) ? req.body.marks : [];
  if (!isAdmin) {
    marks = marks.map((mark) => ({ ...mark, userId: req.user._id }));
  }
  const data = await staffPeriodAttendanceService.saveMarks({
    sessionId: req.body?.sessionId,
    date: req.body?.date,
    marks,
    markedBy: req.user._id,
  });
  res.status(201).json({ success: true, data });
});

const markStaffAttendance = catchAsync(async (req, res) => {
  // Route already requires mark_attendance / manage_users — allow marking any staff.
  const userId = req.body.userId || req.user._id;
  if (!userId) throw new ApiError(400, 'userId required');
  const data = await staffAttendanceService.markManual({ ...req.body, userId }, req.user._id);
  res.status(201).json({ success: true, data });
});

function safeReportToken(value, fallback = 'staff') {
  const cleaned = String(value || fallback)
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '');
  return cleaned || fallback;
}

const exportStaffAttendance = catchAsync(async (req, res) => {
  const {
    renderDailyStaffAttendanceExcel,
    renderDailyStaffAttendancePdf,
    renderMonthlyStaffAttendanceExcel,
    renderMonthlyStaffAttendancePdf,
    renderAllStaffMonthlyAttendanceExcel,
    renderAllStaffMonthlyAttendancePdf,
    renderTeacherDayExcel,
    renderTeacherDayPdf,
    MONTHS,
  } = require('../services/academy/staffAttendanceExportService');

  const role = req.user?.roleDoc || req.user?.role;
  const roleName = typeof role === 'object' && role?.name ? role.name : '';
  const isAdmin = roleName === 'admin';

  const format = String(req.query.format || 'pdf').toLowerCase();
  if (!['xlsx', 'pdf'].includes(format)) {
    throw new ApiError(400, 'Export format must be xlsx or pdf');
  }

  const scope = String(req.query.scope || 'monthly').toLowerCase();
  let userId = req.query.userId;
  if (!isAdmin) {
    userId = String(req.user._id);
  }

  if (scope === 'daily') {
    const { todayYmd } = require('../utils/schoolDay');
    const date = req.query.date || todayYmd();
    const dayData = await staffPeriodAttendanceService.listDay({
      sessionId: req.query.sessionId,
      date,
      userId: userId || undefined,
    });
    let teachers = dayData.teachers || [];
    const roleFilter = String(req.query.role || '').trim().toLowerCase();
    if (roleFilter) {
      teachers = teachers.filter((t) => String(t.role || '').toLowerCase() === roleFilter);
    }
    const one = userId ? teachers[0] : null;
    const staffLabel = one?.name || 'All staff';
    const meta = {
      generatedAt: new Date(),
      sessionLabel: dayData.sessionName || '',
      leftFilter: `Staff: ${staffLabel}`,
      centerFilter: dayData.weekday ? String(dayData.weekday) : '',
      rightFilter: `Date: ${dayData.date}`,
      filterLine: [`Date: ${dayData.date}`, `Staff: ${staffLabel}`, dayData.sessionName ? `Session: ${dayData.sessionName}` : null]
        .filter(Boolean)
        .join('   |   '),
      summary: one
        ? {
            totalClasses: one.totalClasses,
            present: one.present,
            late: one.late,
            absent: one.absent,
            leave: one.leave,
            unmarked: one.unmarked,
          }
        : dayData.summary,
    };
    const safeDate = String(dayData.date).replace(/[^0-9-]/g, '');
    const dailyStaffToken = safeReportToken(one?.name || 'All-Staff', 'All-Staff');
    const dailyFile = `${dailyStaffToken}_${safeDate}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
    const buffer = one
      ? format === 'pdf'
        ? await renderTeacherDayPdf({ staffUser: one, periods: one.periods, meta })
        : await renderTeacherDayExcel({ staffUser: one, periods: one.periods, meta })
      : format === 'pdf'
        ? await renderDailyStaffAttendancePdf({ teachers, meta })
        : await renderDailyStaffAttendanceExcel({ teachers, meta });
    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${dailyFile}"`);
      return res.send(buffer);
    }
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${dailyFile}"`);
    return res.send(Buffer.from(buffer));
  }

  const month = req.query.month ? Number(req.query.month) : new Date().getMonth() + 1;
  const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
  if (!month || !year || month < 1 || month > 12) {
    throw new ApiError(400, 'Invalid month/year');
  }
  const periodLabel = `${MONTHS[month - 1]} ${year}`;
  const monthData = await staffPeriodAttendanceService.listMonth({
    sessionId: req.query.sessionId,
    month,
    year,
    userId: userId || undefined,
  });
  let teachers = monthData.teachers || [];
  const roleFilter = String(req.query.role || '').trim().toLowerCase();
  if (!userId && roleFilter) {
    teachers = teachers.filter((t) => String(t.role || '').toLowerCase() === roleFilter);
  }
  const one = userId ? teachers[0] : null;
  const meta = {
    generatedAt: new Date(),
    sessionLabel: monthData.sessionName || '',
    leftFilter: one ? `Staff: ${one.name}` : roleFilter ? `Role: ${roleFilter}` : 'Staff: All',
    centerFilter: one?.role ? `Role: ${one.role}` : '',
    rightFilter: `Month: ${periodLabel}`,
    filterLine: [
      `Period: ${periodLabel}`,
      one ? `Staff: ${one.name}` : 'Staff: All',
      monthData.sessionName ? `Session: ${monthData.sessionName}` : null,
    ]
      .filter(Boolean)
      .join('   |   '),
    summary: one
      ? {
          totalClasses: one.totalClasses,
          present: one.present,
          late: one.late,
          absent: one.absent,
          leave: one.leave,
          unmarked: one.unmarked,
        }
      : monthData.summary,
  };

  if (!one) {
    const allFileBase = `All-Staff_${safeReportToken(MONTHS[month - 1])}-${year}`;
    const buffer = format === 'pdf'
      ? await renderAllStaffMonthlyAttendancePdf({ teachers, meta })
      : await renderAllStaffMonthlyAttendanceExcel({ teachers, meta });
    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${allFileBase}.pdf"`);
      return res.send(buffer);
    }
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${allFileBase}.xlsx"`);
    return res.send(Buffer.from(buffer));
  }

  const staffFileBase = `${safeReportToken(one.name)}_${safeReportToken(MONTHS[month - 1])}-${year}`;
  const buffer = format === 'pdf'
    ? await renderMonthlyStaffAttendancePdf({ staffUser: one, periods: one.periods, meta })
    : await renderMonthlyStaffAttendanceExcel({ staffUser: one, periods: one.periods, meta });
  if (format === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${staffFileBase}.pdf"`);
    return res.send(buffer);
  }
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${staffFileBase}.xlsx"`);
  return res.send(Buffer.from(buffer));
});

module.exports = {
  status,
  syncRoster,
  syncAttendance,
  people,
  enrollmentStatus,
  enrollmentImage,
  captureFace,
  trainFace,
  deleteEnrollmentImage,
  deleteAllEnrollmentImages,
  identify,
  cameras,
  cameraSnapshot,
  cctvAction,
  webhook,
  listStaffAttendance,
  myStaffAttendance,
  staffAttendanceHistory,
  listStaffTeachers,
  listStaffAttendanceMonth,
  listStaffPeriodAttendance,
  listStaffPeriodMonth,
  saveStaffPeriodAttendance,
  markStaffAttendance,
  exportStaffAttendance,
};
