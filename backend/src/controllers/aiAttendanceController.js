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

const markStaffAttendance = catchAsync(async (req, res) => {
  const role = req.user?.roleDoc || req.user?.role;
  const roleName = typeof role === 'object' && role?.name ? role.name : '';
  const isAdmin = roleName === 'admin';
  const userId = isAdmin ? req.body.userId : req.user._id;
  if (!userId) throw new ApiError(400, 'userId required');
  const data = await staffAttendanceService.markManual({ ...req.body, userId }, req.user._id);
  res.status(201).json({ success: true, data });
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
  markStaffAttendance,
};
