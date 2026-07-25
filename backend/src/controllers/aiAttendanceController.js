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
  res.json({
    success: true,
    data: {
      message: 'Attendance is stored directly in MongoDB on face match — no external sync needed.',
      date: req.body?.date || new Date().toISOString().slice(0, 10),
      students: 0,
      staff: 0,
      totalRecords: 0,
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
  // Legacy no-op: everything is Mongo-local now
  res.json({ success: true, data: { ignored: true, reason: 'Mongo-only AI attendance' } });
});

const listStaffAttendance = catchAsync(async (req, res) => {
  const role = req.user?.roleDoc || req.user?.role;
  const roleName = typeof role === 'object' && role?.name ? role.name : '';
  const isAdmin = roleName === 'admin';
  const date = req.query.date || new Date().toISOString().slice(0, 10);
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
  captureFace,
  trainFace,
  identify,
  cameras,
  cameraSnapshot,
  cctvAction,
  webhook,
  listStaffAttendance,
  myStaffAttendance,
  markStaffAttendance,
};
