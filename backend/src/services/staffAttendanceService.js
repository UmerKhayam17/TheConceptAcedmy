const ApiError = require('../utils/ApiError');
const { dayBounds } = require('../utils/schoolDay');
const StaffAttendance = require('../models/StaffAttendance');
const User = require('../models/User');
const Role = require('../models/Role');

/** Day bounds in the academy timezone. YYYY-MM-DD is a calendar day; anything else is an instant. */
function dayRange(dateStr) {
  const trimmed = String(dateStr || '').trim();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : new Date(dateStr);
  if (day instanceof Date && Number.isNaN(day.getTime())) throw new ApiError(400, 'Invalid date');
  return dayBounds(day);
}

function monthRange(month, year) {
  const m = Number(month);
  const y = Number(year);
  if (!m || !y || m < 1 || m > 12) throw new ApiError(400, 'Invalid month/year');
  const mm = String(m).padStart(2, '0');
  const lastDay = String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0');
  const { start } = dayBounds(`${y}-${mm}-01`);
  const { end } = dayBounds(`${y}-${mm}-${lastDay}`);
  return { start, end };
}

/** Staff accounts for attendance marking: teacher, accountant, admin (active first). */
async function listTeachers() {
  const roles = await Role.find({
    name: { $regex: /^(teacher|accountant|admin)$/i },
  })
    .select('_id name')
    .lean();
  const byRole =
    roles.length > 0
      ? await User.find({ role: { $in: roles.map((r) => r._id) } })
          .select('name email phone role isActive')
          .populate('role', 'name')
          .lean()
      : [];

  // Also include users who have a teacher profile (session roster), in case role naming differs.
  let byProfile = [];
  try {
    const TeacherProfile = require('../models/timetable/TeacherProfile');
    const userIds = await TeacherProfile.distinct('user');
    if (userIds.length) {
      byProfile = await User.find({ _id: { $in: userIds } })
        .select('name email phone role isActive')
        .populate('role', 'name')
        .lean();
    }
  } catch {
    /* TeacherProfile optional */
  }

  const map = new Map();
  [...byRole, ...byProfile].forEach((u) => {
    map.set(String(u._id), u);
  });
  return Array.from(map.values()).sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })
  );
}

async function listByDate({ date, userId }) {
  const { start, end, ymd } = dayRange(date);
  const q = { date: { $gte: start, $lte: end } };
  if (userId) q.userId = userId;

  const records = await StaffAttendance.find(q)
    .populate('userId', 'name email role profileImage aiEmployeeId')
    .sort({ checkIn: 1 })
    .lean();

  const staffQ = { isActive: true };
  if (userId) staffQ._id = userId;
  // When listing a day without filter, still return records only (admin sees all marked)

  const summary = { present: 0, late: 0, absent: 0, half_day: 0, leave: 0 };
  records.forEach((r) => {
    if (summary[r.status] !== undefined) summary[r.status] += 1;
  });

  return {
    date: ymd,
    records,
    summary,
  };
}

async function listForUser(userId, { month, year } = {}) {
  const q = { userId };
  if (month && year) {
    const { start, end } = monthRange(month, year);
    q.date = { $gte: start, $lte: end };
  }
  return StaffAttendance.find(q).sort({ date: 1, checkIn: 1 }).lean();
}

async function listByMonth({ month, year, userId }) {
  const { start, end } = monthRange(month, year);
  const q = { date: { $gte: start, $lte: end } };
  if (userId) q.userId = userId;
  const records = await StaffAttendance.find(q)
    .populate({
      path: 'userId',
      select: 'name email role profileImage',
      populate: { path: 'role', select: 'name' },
    })
    .sort({ date: 1, checkIn: 1 })
    .lean();

  records.sort((a, b) => {
    const da = new Date(a.date).getTime() || 0;
    const db = new Date(b.date).getTime() || 0;
    if (da !== db) return da - db;
    const na = a.userId && typeof a.userId === 'object' ? a.userId.name || '' : '';
    const nb = b.userId && typeof b.userId === 'object' ? b.userId.name || '' : '';
    return String(na).localeCompare(String(nb), undefined, { sensitivity: 'base' });
  });

  const summary = { present: 0, late: 0, absent: 0, half_day: 0, leave: 0 };
  records.forEach((r) => {
    if (summary[r.status] !== undefined) summary[r.status] += 1;
  });

  return {
    month: Number(month),
    year: Number(year),
    records,
    summary,
  };
}

async function markManual({ date, userId, status, checkIn, checkOut, notes }, markedBy) {
  const { start, end } = dayRange(date);
  const user = await User.findById(userId).select('_id').lean();
  if (!user) throw new ApiError(404, 'Staff user not found');

  const nextStatus = status || 'present';
  const $set = {
    userId,
    date: start,
    status: nextStatus,
    source: 'manual',
    notes: notes != null ? String(notes) : '',
    markedBy,
  };
  const $unset = {};

  const hasIn = Boolean(checkIn);
  const hasOut = Boolean(checkOut);
  if (hasIn) $set.checkIn = new Date(checkIn);
  else $unset.checkIn = 1;
  if (hasOut) $set.checkOut = new Date(checkOut);
  else $unset.checkOut = 1;

  const update = { $set };
  if (Object.keys($unset).length) update.$unset = $unset;

  return StaffAttendance.findOneAndUpdate(
    { userId, date: { $gte: start, $lte: end } },
    update,
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
  ).populate('userId', 'name email role');
}

module.exports = { listByDate, listForUser, listByMonth, listTeachers, markManual };
