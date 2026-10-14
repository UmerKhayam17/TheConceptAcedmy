const ApiError = require('../../utils/ApiError');
const User = require('../../models/User');
const Role = require('../../models/Role');
const AcademySalaryRecord = require('../../models/academy/AcademySalaryRecord');
const AcademySubject = require('../../models/academy/AcademySubject');
const { populateCreatedBy } = require('../../utils/createdBy');
const { calculateTeacherPercentageSalary } = require('./percentageSalaryCalculator');

/**
 * Fill missing tuitionSharePercent on stored breakdown lines from live subject docs
 * (vouchers generated before that field existed). Returns plain objects for JSON.
 */
async function enrichBreakdownWithSubjectShares(records) {
  const list = (Array.isArray(records) ? records : []).map((rec) =>
    typeof rec?.toObject === 'function' ? rec.toObject() : rec
  );
  const needIds = new Set();
  for (const rec of list) {
    for (const line of rec.calculationBreakdown || []) {
      if (line?.subjectId && !(Number(line.tuitionSharePercent) > 0)) {
        needIds.add(String(line.subjectId));
      }
    }
  }
  if (!needIds.size) return list;

  const subjects = await AcademySubject.find({ _id: { $in: [...needIds] } })
    .select('tuitionSharePercent')
    .lean();
  const shareById = new Map(
    subjects.map((s) => [String(s._id), Number(s.tuitionSharePercent) || 0])
  );

  for (const rec of list) {
    const lines = rec.calculationBreakdown;
    if (!lines?.length) continue;
    for (const line of lines) {
      if (Number(line.tuitionSharePercent) > 0) continue;
      const share = shareById.get(String(line.subjectId));
      if (share != null) {
        line.tuitionSharePercent = share;
      }
    }
  }
  return list;
}

function voucherNumber(userDoc, month, year) {
  const code = userDoc._id.toString().slice(-6).toUpperCase();
  return `SAL-${code}-${year}${String(month).padStart(2, '0')}`;
}

function staffPayType(member) {
  return member.payType === 'percentage' ? 'percentage' : 'fixed';
}

function staffHasPayroll(member) {
  if (staffPayType(member) === 'percentage') {
    // Teacher cut % is set on the staff user when creating/editing them.
    return Number(member.salaryPercentage || 0) > 0;
  }
  return Number(member.salary || 0) > 0;
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
  search,
}) {
  let q = await buildSalaryQuery({ staffId, status, month, year, roleName });
  const s = String(search || '').trim();
  if (s) {
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = { $regex: escaped, $options: 'i' };
    const users = await User.find({
      $or: [{ name: rx }, { email: rx }, { phone: rx }],
    }).select('_id');
    q = {
      $and: [
        q,
        {
          $or: [
            { staffId: { $in: users.map((u) => u._id) } },
            { voucherNumber: rx },
            { notes: rx },
          ],
        },
      ],
    };
  }
  const skip = (Math.max(1, page) - 1) * Math.min(100, Math.max(1, limit));
  const perPage = Math.min(100, Math.max(1, limit));

  const [items, total] = await Promise.all([
    populateCreatedBy(
      AcademySalaryRecord.find(q)
        .populate({
          path: 'staffId',
          select: 'name email phone salary payType salaryPercentage profileImage',
          populate: { path: 'role', select: 'name' },
        })
        .sort({ year: -1, month: -1, createdAt: -1 })
        .skip(skip)
        .limit(perPage)
    ),
    AcademySalaryRecord.countDocuments(q),
  ]);

  const enrichedItems = await enrichBreakdownWithSubjectShares(items);

  return {
    items: enrichedItems,
    pagination: {
      page: Math.max(1, page),
      limit: perPage,
      total,
      pages: Math.ceil(total / perPage) || 1,
    },
  };
}

async function resolvePercentagePayload(member) {
  const staffPct = Number(member.salaryPercentage || 0);
  const calc = await calculateTeacherPercentageSalary(member._id, member);
  const notes =
    calc.amount > 0
      ? `Auto: monthly tuition only × subject share × teacher ${staffPct}% (${calc.breakdown.length} subject pool${
          calc.breakdown.length === 1 ? '' : 's'
        }). Admission fee excluded.`
      : staffPct > 0
        ? `Percentage pay (${staffPct}%). No monthly tuition pool yet — enter amount before marking paid.`
        : 'Percentage pay. Set teacher % on the staff profile, then recalculate.';

  return {
    amount: calc.amount,
    salaryPercentage: staffPct,
    calculationSource: calc.amount > 0 ? 'tuition_pool' : 'manual',
    calculationBreakdown: calc.breakdown,
    notes,
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
    if (!staffHasPayroll(member)) {
      skipped += 1;
      continue;
    }

    const payType = staffPayType(member);
    let amount = 0;
    let pct = Number(member.salaryPercentage || 0);
    let notes;
    let calculationSource = 'fixed';
    let calculationBreakdown = [];

    if (payType === 'fixed') {
      amount = Number(member.salary || 0);
      if (amount <= 0) {
        skipped += 1;
        continue;
      }
    } else {
      const resolved = await resolvePercentagePayload(member);
      amount = resolved.amount;
      pct = resolved.salaryPercentage;
      notes = resolved.notes;
      calculationSource = resolved.calculationSource;
      calculationBreakdown = resolved.calculationBreakdown;
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
      payType,
      salaryPercentage: payType === 'percentage' ? pct : 0,
      calculationSource: payType === 'percentage' ? calculationSource : 'fixed',
      calculationBreakdown: payType === 'percentage' ? calculationBreakdown : [],
      status: 'pending',
      dueDate,
      voucherNumber: voucherNumber(member, month, year),
      notes,
      createdBy: userId,
      recordedBy: userId,
    });
    created += 1;
  }

  return { created, skipped };
}

/**
 * Recompute unpaid (pending) percentage vouchers from current tuition / subject weights.
 * Paid / cancelled vouchers are left unchanged.
 * @param {{ month?: number, year?: number, roleName?: string }} filters — omit month/year to refresh all unpaid.
 */
async function recalculatePercentageSalaries({ month, year, roleName } = {}, userId) {
  const q = await buildSalaryQuery({
    month: month || undefined,
    year: year || undefined,
    roleName,
    status: 'pending',
  });
  q.payType = 'percentage';
  const records = await AcademySalaryRecord.find(q);
  let updated = 0;
  let skipped = 0;

  for (const record of records) {
    const member = await User.findById(record.staffId);
    if (!member) {
      skipped += 1;
      continue;
    }
    const resolved = await resolvePercentagePayload(member);
    record.amount = resolved.amount;
    record.salaryPercentage = resolved.salaryPercentage;
    record.calculationSource = resolved.calculationSource;
    record.calculationBreakdown = resolved.calculationBreakdown;
    record.notes = resolved.notes;
    if (userId) record.recordedBy = userId;
    await record.save();
    updated += 1;
  }

  return { updated, skipped };
}

/** After subject weight changes — refresh every unpaid percentage salary voucher. */
async function recalculateUnpaidPercentageSalariesAfterWeightChange(userId) {
  return recalculatePercentageSalaries({}, userId);
}

/**
 * Fire-and-forget safe refresh of all unpaid percentage vouchers.
 * Used when student tuition / subjects / package change (any teacher pool may shift).
 */
async function safeRefreshUnpaidPercentageSalaries(userId, reason = 'tuition') {
  try {
    return await recalculatePercentageSalaries({}, userId);
  } catch (err) {
    console.error(`[salary] Failed unpaid percentage refresh (${reason}):`, err);
    return { updated: 0, skipped: 0, error: true };
  }
}

/** After a teacher's salaryPercentage changes — refresh only that teacher's unpaid vouchers. */
async function recalculateUnpaidPercentageSalariesForStaff(staffId, userId) {
  if (!staffId) return { updated: 0, skipped: 0 };
  const records = await AcademySalaryRecord.find({
    staffId,
    status: 'pending',
    payType: 'percentage',
  });
  let updated = 0;
  let skipped = 0;
  const member = await User.findById(staffId);
  if (!member) return { updated: 0, skipped: records.length };

  for (const record of records) {
    if (staffPayType(member) !== 'percentage' || !(Number(member.salaryPercentage) > 0)) {
      // Pay type no longer percentage — leave voucher; admin can cancel/edit manually.
      skipped += 1;
      continue;
    }
    const resolved = await resolvePercentagePayload(member);
    record.amount = resolved.amount;
    record.salaryPercentage = resolved.salaryPercentage;
    record.calculationSource = resolved.calculationSource;
    record.calculationBreakdown = resolved.calculationBreakdown;
    record.notes = resolved.notes;
    if (userId) record.recordedBy = userId;
    await record.save();
    updated += 1;
  }

  return { updated, skipped };
}

/**
 * Refresh unpaid percentage vouchers for one or more teachers (assignment changes).
 * Errors are logged and do not fail the parent write.
 */
async function safeRefreshUnpaidPercentageSalariesForStaff(staffIds, userId, reason = 'assignment') {
  const unique = [
    ...new Set(
      (Array.isArray(staffIds) ? staffIds : [staffIds])
        .filter(Boolean)
        .map((id) => String(id))
    ),
  ];
  let updated = 0;
  let skipped = 0;
  for (const staffId of unique) {
    try {
      const result = await recalculateUnpaidPercentageSalariesForStaff(staffId, userId);
      updated += result.updated || 0;
      skipped += result.skipped || 0;
    } catch (err) {
      console.error(`[salary] Failed unpaid refresh for staff ${staffId} (${reason}):`, err);
      skipped += 1;
    }
  }
  return { updated, skipped, staffCount: unique.length };
}

async function recordSalaryPayment(id, { paymentMethod, notes, amount }, userId) {
  const record = await AcademySalaryRecord.findById(id).populate({
    path: 'staffId',
    select: 'name',
  });
  if (!record) throw new ApiError(404, 'Salary record not found');
  if (record.status === 'paid') throw new ApiError(400, 'Salary already paid');
  if (record.status === 'cancelled') throw new ApiError(400, 'Salary record cancelled');

  if (amount !== undefined && amount !== null && amount !== '') {
    const n = Number(amount);
    if (Number.isNaN(n) || n < 0) throw new ApiError(400, 'Invalid salary amount');
    if (record.payType === 'percentage' && n !== record.amount) {
      record.calculationSource = 'manual';
    }
    record.amount = n;
  }

  if (record.payType === 'percentage' && !(record.amount > 0)) {
    throw new ApiError(400, 'Enter the calculated percentage amount before marking paid');
  }
  if (!(record.amount > 0)) {
    throw new ApiError(400, 'Salary amount must be greater than zero');
  }

  record.status = 'paid';
  record.paidAt = new Date();
  record.paymentMethod = paymentMethod || 'bank_transfer';
  if (notes !== undefined) record.notes = notes || '';
  record.recordedBy = userId;
  if (!record.voucherNumber && record.staffId) {
    record.voucherNumber = voucherNumber(record.staffId, record.month, record.year);
  }
  await record.save();
  return record;
}

/** Update pending voucher amount (mainly for percentage staff). */
async function updateSalaryAmount(id, amount, userId) {
  const record = await AcademySalaryRecord.findById(id);
  if (!record) throw new ApiError(404, 'Salary record not found');
  if (record.status !== 'pending') {
    throw new ApiError(400, 'Only pending salary vouchers can be edited');
  }
  const n = Number(amount);
  if (Number.isNaN(n) || n < 0) throw new ApiError(400, 'Invalid salary amount');
  record.amount = n;
  if (record.payType === 'percentage') {
    record.calculationSource = 'manual';
  }
  record.recordedBy = userId;
  await record.save();
  return record.populate({
    path: 'staffId',
    select: 'name email phone salary payType salaryPercentage profileImage',
    populate: { path: 'role', select: 'name' },
  });
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
  const userQ = {
    isActive: true,
    role: { $in: roleIds },
    $or: [{ salary: { $gt: 0 } }, { payType: 'percentage', salaryPercentage: { $gt: 0 } }],
  };
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
  recalculatePercentageSalaries,
  recalculateUnpaidPercentageSalariesAfterWeightChange,
  recalculateUnpaidPercentageSalariesForStaff,
  safeRefreshUnpaidPercentageSalaries,
  safeRefreshUnpaidPercentageSalariesForStaff,
  recordSalaryPayment,
  updateSalaryAmount,
  getSalarySummary,
};
