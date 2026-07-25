const ApiError = require('../utils/ApiError');
const StaffAttendance = require('../models/StaffAttendance');
const User = require('../models/User');

function dayRange(dateStr) {
  const day = new Date(dateStr);
  if (Number.isNaN(day.getTime())) throw new ApiError(400, 'Invalid date');
  day.setHours(0, 0, 0, 0);
  const end = new Date(day);
  end.setHours(23, 59, 59, 999);
  return { start: day, end };
}

async function listByDate({ date, userId }) {
  const { start, end } = dayRange(date);
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
    date: start.toISOString().slice(0, 10),
    records,
    summary,
  };
}

async function listForUser(userId, { month, year } = {}) {
  const q = { userId };
  if (month && year) {
    const start = new Date(Number(year), Number(month) - 1, 1);
    const end = new Date(Number(year), Number(month), 0, 23, 59, 59, 999);
    q.date = { $gte: start, $lte: end };
  }
  return StaffAttendance.find(q).sort({ date: -1 }).lean();
}

async function markManual({ date, userId, status, checkIn, checkOut, notes }, markedBy) {
  const { start, end } = dayRange(date);
  const user = await User.findById(userId).select('_id').lean();
  if (!user) throw new ApiError(404, 'Staff user not found');

  return StaffAttendance.findOneAndUpdate(
    { userId, date: { $gte: start, $lte: end } },
    {
      $set: {
        userId,
        date: start,
        status: status || 'present',
        source: 'manual',
        checkIn: checkIn ? new Date(checkIn) : undefined,
        checkOut: checkOut ? new Date(checkOut) : undefined,
        notes,
        markedBy,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

module.exports = { listByDate, listForUser, markManual };
