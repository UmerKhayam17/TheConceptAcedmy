const ApiError = require('../../utils/ApiError');
const User = require('../../models/User');
const Role = require('../../models/Role');
const AcademySalaryRecord = require('../../models/academy/AcademySalaryRecord');
const { populateCreatedBy } = require('../../utils/createdBy');

function voucherNumber(userDoc, month, year) {
  const code = userDoc._id.toString().slice(-6).toUpperCase();
  return `SAL-${code}-${year}${String(month).padStart(2, '0')}`;
}

async function staffRoleIds() {
  const roles = await Role.find({ name: { $in: ['teacher', 'accountant'] } }).select('_id');
  return roles.map((r) => r._id);
}

async function buildSalaryQuery({ staffId, status, month, year, roleName }) {
  const q = {};
  if (status) q.status = status;
  if (month) q.month = Number(month);
  if (year) q.year = Number(year);
  if (staffId) {
    q.staffId = staffId;
    return q;
  }
  if (roleName) {
    const role = await Role.findOne({ name: roleName });
    if (!role) return { staffId: { $in: [] } };
    const users = await User.find({ role: role._id, isActive: true }).select('_id');
    q.staffId = { $in: users.map((u) => u._id) };
    return q;
  }
  const roleIds = await staffRoleIds();
  const users = await User.find({ role: { $in: roleIds }, isActive: true }).select('_id');
  q.staffId = { $in: users.map((u) => u._id) };
  return q;
}

async function listSalaryRecords({
  page = 1,
  limit = 20,
  staffId,
  status,
  month,
  year,
  roleName,
}) {
  const q = await buildSalaryQuery({ staffId, status, month, year, roleName });
  const skip = (Math.max(1, page) - 1) * Math.min(100, Math.max(1, limit));
  const perPage = Math.min(100, Math.max(1, limit));

  const [items, total] = await Promise.all([
    populateCreatedBy(
      AcademySalaryRecord.find(q)
        .populate({
          path: 'staffId',
          select: 'name email phone salary profileImage',
          populate: { path: 'role', select: 'name' },
        })
        .sort({ year: -1, month: -1, createdAt: -1 })
        .skip(skip)
        .limit(perPage)
    ),
    AcademySalaryRecord.countDocuments(q),
  ]);

  return {
    items,
    pagination: {
      page: Math.max(1, page),
      limit: perPage,
      total,
      pages: Math.ceil(total / perPage) || 1,
    },
  };
}

async function generateMonthlySalaries({ month, year, roleName }, userId) {
  const roleIds = await staffRoleIds();
  const userQ = { isActive: true, role: { $in: roleIds } };
  if (roleName) {
    const role = await Role.findOne({ name: roleName });
    if (!role) throw new ApiError(400, 'Invalid role filter');
    userQ.role = role._id;
  }

  const staff = await User.find(userQ);
  const dueDate = new Date(year, month, 1);
  let created = 0;
  let skipped = 0;

  for (const member of staff) {
    const amount = member.salary || 0;
    if (amount <= 0) {
      skipped += 1;
      continue;
    }
    const exists = await AcademySalaryRecord.findOne({
      staffId: member._id,
      month,
      year,
    });
    if (exists) {
      skipped += 1;
      continue;
    }
    await AcademySalaryRecord.create({
      staffId: member._id,
      month,
      year,
      amount,
      status: 'pending',
      dueDate,
      voucherNumber: voucherNumber(member, month, year),
      createdBy: userId,
      recordedBy: userId,
    });
    created += 1;
  }

  return { created, skipped };
}

async function recordSalaryPayment(id, { paymentMethod, notes }, userId) {
  const record = await AcademySalaryRecord.findById(id).populate({
    path: 'staffId',
    select: 'name',
  });
  if (!record) throw new ApiError(404, 'Salary record not found');
  if (record.status === 'paid') throw new ApiError(400, 'Salary already paid');
  if (record.status === 'cancelled') throw new ApiError(400, 'Salary record cancelled');

  record.status = 'paid';
  record.paidAt = new Date();
  record.paymentMethod = paymentMethod || 'bank_transfer';
  record.notes = notes || '';
  record.recordedBy = userId;
  if (!record.voucherNumber && record.staffId) {
    record.voucherNumber = voucherNumber(record.staffId, record.month, record.year);
  }
  await record.save();
  return record;
}

async function getSalarySummary({ month, year, roleName, staffId }) {
  const q = await buildSalaryQuery({ month, year, roleName, staffId });
  const records = await AcademySalaryRecord.find(q).lean();

  const byStatus = { pending: 0, paid: 0, cancelled: 0 };
  let totalPaid = 0;
  let totalPending = 0;

  records.forEach((r) => {
    if (byStatus[r.status] != null) byStatus[r.status] += 1;
    if (r.status === 'paid') totalPaid += r.amount;
    if (r.status === 'pending') totalPending += r.amount;
  });

  const roleIds = await staffRoleIds();
  const userQ = { isActive: true, role: { $in: roleIds }, salary: { $gt: 0 } };
  if (roleName) {
    const role = await Role.findOne({ name: roleName });
    if (role) userQ.role = role._id;
  }
  const activeStaff = await User.countDocuments(userQ);

  return {
    recordsCount: records.length,
    totalPaid,
    totalPending,
    byStatus,
    activeStaff,
  };
}

module.exports = {
  listSalaryRecords,
  generateMonthlySalaries,
  recordSalaryPayment,
  getSalarySummary,
};
