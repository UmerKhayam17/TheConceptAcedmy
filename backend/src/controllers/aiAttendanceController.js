const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const ai = require('../services/aiAttendance/aiAttendanceService');
const faceEnrollment = require('../services/aiAttendance/faceEnrollmentService');
const staffAttendanceService = require('../services/staffAttendanceService');

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
  const User = require('../models/User');
  const {
    renderDailyStaffAttendanceExcel,
    renderDailyStaffAttendancePdf,
    renderMonthlyStaffAttendanceExcel,
    renderMonthlyStaffAttendancePdf,
    renderAllStaffMonthlyAttendanceExcel,
    renderAllStaffMonthlyAttendancePdf,
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
    const dayData = await staffAttendanceService.listByDate({
      date,
      userId: userId || undefined,
    });
    const recordByUser = new Map();
    (dayData.records || []).forEach((r) => {
      const id =
        r.userId && typeof r.userId === 'object' ? String(r.userId._id) : String(r.userId || '');
      if (id) recordByUser.set(id, r);
    });

    let staffList = [];
    if (userId) {
      const u = await User.findById(userId)
        .select('name email role isActive')
        .populate('role', 'name')
        .lean();
      if (!u) throw new ApiError(404, 'Staff member not found');
      staffList = [u];
    } else {
      staffList = await staffAttendanceService.listTeachers();
      const roleFilter = String(req.query.role || '')
        .trim()
        .toLowerCase();
      if (roleFilter) {
        staffList = staffList.filter((u) => {
          const n = u.role && typeof u.role === 'object' ? u.role.name : u.role;
          return String(n || '').toLowerCase() === roleFilter;
        });
      }
      staffList = staffList.filter((u) => u.isActive !== false);
    }

    const staffLabel = userId && staffList[0] ? staffList[0].name : 'All staff';
    const roleLabel = req.query.role ? String(req.query.role) : '';
    const meta = {
      generatedAt: new Date(),
      leftFilter: `Staff: ${staffLabel}`,
      centerFilter: roleLabel ? `Role: ${roleLabel}` : '',
      rightFilter: `Date: ${date}`,
      filterLine: [`Date: ${date}`, `Staff: ${staffLabel}`, roleLabel ? `Role: ${roleLabel}` : null]
        .filter(Boolean)
        .join('   |   '),
      summary: dayData.summary,
    };

    const safeDate = String(date).replace(/[^0-9-]/g, '');
    const dailyStaffToken = safeReportToken(
      userId && staffList[0] ? staffList[0].name : 'All-Staff',
      'All-Staff'
    );
    const dailyFile = `${dailyStaffToken}_${safeDate}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
    if (format === 'pdf') {
      const buffer = await renderDailyStaffAttendancePdf({
        staffList,
        recordByUser,
        meta,
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${dailyFile}"`);
      return res.send(buffer);
    }

    const buffer = await renderDailyStaffAttendanceExcel({
      staffList,
      recordByUser,
      meta,
    });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${dailyFile}"`);
    return res.send(Buffer.from(buffer));
  }

  // Monthly report — one staff, or all staff when userId is omitted
  const month = req.query.month ? Number(req.query.month) : new Date().getMonth() + 1;
  const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
  if (!month || !year || month < 1 || month > 12) {
    throw new ApiError(400, 'Invalid month/year');
  }
  const periodTag = `${year}-${String(month).padStart(2, '0')}`;
  const periodLabel = `${MONTHS[month - 1]} ${year}`;

  if (!userId) {
    const monthData = await staffAttendanceService.listByMonth({ month, year });
    let records = monthData.records || [];
    const roleFilter = String(req.query.role || '')
      .trim()
      .toLowerCase();
    if (roleFilter) {
      records = records.filter((r) => {
        const u = r.userId && typeof r.userId === 'object' ? r.userId : null;
        const n = u?.role && typeof u.role === 'object' ? u.role.name : u?.role;
        return String(n || '').toLowerCase() === roleFilter;
      });
    }
    const meta = {
      generatedAt: new Date(),
      leftFilter: roleFilter ? `Role: ${roleFilter}` : 'Staff: All',
      centerFilter: `Records: ${records.length}`,
      rightFilter: `Month: ${periodLabel}`,
      filterLine: [
        `Period: ${periodLabel}`,
        'Staff: All',
        roleFilter ? `Role: ${roleFilter}` : null,
      ]
        .filter(Boolean)
        .join('   |   '),
    };

    const allFileBase = `All-Staff_${safeReportToken(MONTHS[month - 1])}-${year}`;
    if (format === 'pdf') {
      const buffer = await renderAllStaffMonthlyAttendancePdf({ records, meta });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${allFileBase}.pdf"`);
      return res.send(buffer);
    }

    const buffer = await renderAllStaffMonthlyAttendanceExcel({ records, meta });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${allFileBase}.xlsx"`);
    return res.send(Buffer.from(buffer));
  }

  const staffUser = await User.findById(userId)
    .select('name email role phone isActive')
    .populate('role', 'name')
    .lean();
  if (!staffUser) throw new ApiError(404, 'Staff member not found');

  const records = await staffAttendanceService.listForUser(userId, { month, year });
  const roleLabel =
    staffUser.role && typeof staffUser.role === 'object'
      ? staffUser.role.name
      : String(staffUser.role || '');
  const meta = {
    generatedAt: new Date(),
    leftFilter: `Staff: ${staffUser.name}`,
    centerFilter: roleLabel ? `Role: ${roleLabel}` : '',
    rightFilter: `Month: ${periodLabel}`,
    filterLine: [
      `Staff: ${staffUser.name}`,
      roleLabel ? `Role: ${roleLabel}` : null,
      `Period: ${periodLabel}`,
    ]
      .filter(Boolean)
      .join('   |   '),
  };

  const staffFileBase = `${safeReportToken(staffUser.name)}_${safeReportToken(MONTHS[month - 1])}-${year}`;

  if (format === 'pdf') {
    const buffer = await renderMonthlyStaffAttendancePdf({
      staffUser,
      records,
      meta,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${staffFileBase}.pdf"`);
    return res.send(buffer);
  }

  const buffer = await renderMonthlyStaffAttendanceExcel({
    staffUser,
    records,
    meta,
  });
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
  markStaffAttendance,
  exportStaffAttendance,
};
