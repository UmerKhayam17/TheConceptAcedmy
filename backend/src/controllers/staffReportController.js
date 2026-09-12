const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const User = require('../models/User');
const Session = require('../models/Session');
const AcademySalaryRecord = require('../models/academy/AcademySalaryRecord');
const staffAttendanceService = require('../services/staffAttendanceService');
const scheduleSlotService = require('../services/timetable/scheduleSlotService');
const {
  renderStaffReportExcel,
  renderStaffReportPdf,
} = require('../services/academy/academyStaffReportExportService');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

async function buildStaffReportPayload(staffId, { month, year, sessionId }) {
  const user = await User.findById(staffId)
    .populate('role', 'name')
    .select('name email phone salary isActive profileImage createdAt role');
  if (!user) throw new ApiError(404, 'Staff member not found');

  const salaries = await AcademySalaryRecord.find({ staffId }).sort({ year: -1, month: -1 }).lean();

  const attMonth = month ? Number(month) : new Date().getMonth() + 1;
  const attYear = year ? Number(year) : new Date().getFullYear();
  const attendance = await staffAttendanceService.listForUser(staffId, {
    month: attMonth,
    year: attYear,
  });

  let session = null;
  if (sessionId) {
    session = await Session.findById(sessionId).select('name');
  }
  if (!session) {
    session = await Session.findOne({ isActive: true }).select('name');
  }

  let slots = [];
  if (session?._id) {
    const sched = await scheduleSlotService.getTeacherSchedule(String(session._id), staffId);
    slots = sched.slots || [];
  }

  return {
    user,
    salaries,
    attendance,
    slots,
    sessionName: session?.name || '',
    attendanceLabel: `${MONTHS[attMonth - 1]} ${attYear}`,
  };
}

const exportStaffReport = catchAsync(async (req, res) => {
  const format = String(req.query.format || 'xlsx').toLowerCase();
  if (!['xlsx', 'pdf'].includes(format)) {
    throw new ApiError(400, 'Export format must be xlsx or pdf');
  }

  const payload = await buildStaffReportPayload(req.params.id, {
    month: req.query.month,
    year: req.query.year,
    sessionId: req.query.sessionId,
  });

  const safeName = String(payload.user.name || 'staff')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  if (format === 'pdf') {
    const buffer = await renderStaffReportPdf(payload);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="staff-report-${safeName}.pdf"`);
    return res.send(buffer);
  }

  const buffer = await renderStaffReportExcel(payload);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="staff-report-${safeName}.xlsx"`);
  return res.send(Buffer.from(buffer));
});

module.exports = { exportStaffReport, buildStaffReportPayload };
