const ApiError = require('../../utils/ApiError');
const User = require('../../models/User');
const Role = require('../../models/Role');
const AcademyStaffAdvance = require('../../models/academy/AcademyStaffAdvance');
const AcademySalaryRecord = require('../../models/academy/AcademySalaryRecord');
const { STAFF_ROLE_NAMES } = require('../../config/staffRoles');

/**
 * Staff advances & loans.
 *
 * Flow:
 *  1. Admin gives an advance / loan → record is `active`.
 *  2. Every PENDING salary voucher of that staff member (from the start month onward) gets a
 *     planned deduction: advance = whole remaining amount, loan = one installment.
 *     Deduction is capped by the voucher amount, so net salary never goes below zero.
 *  3. When the voucher is marked PAID the deduction is applied: recoveredAmount grows and the
 *     record closes itself once fully recovered.
 *  Admin can override a voucher's deduction (skip / change a month) or record a cash repayment.
 */

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
const period = (month, year) => Number(year) * 100 + Number(month);

function remainingOf(adv) {
  return Math.max(0, round((adv.amount || 0) - (adv.recoveredAmount || 0)));
}

const STAFF_POPULATE = {
  path: 'staffId',
  select: 'name email phone profileImage designation payType salary salaryPercentage',
  populate: { path: 'role', select: 'name' },
};

async function assertStaffMember(staffId) {
  const roles = await Role.find({ name: { $in: STAFF_ROLE_NAMES } }).select('_id');
  const user = await User.findOne({ _id: staffId, role: { $in: roles.map((r) => r._id) } }).select(
    '_id isActive'
  );
  if (!user) throw new ApiError(400, 'Select a valid staff member');
  return user;
}

/**
 * Plan deductions for one voucher.
 * @param {Array} advances active advances sorted oldest first
 * @param {Map<string, number>} remaining advanceId → amount still free to deduct (mutated)
 */
function planFor(advances, remaining, voucherPeriod, cap) {
  const lines = [];
  let room = Math.max(0, round(cap));
  for (const adv of advances) {
    if (room <= 0) break;
    if (period(adv.startMonth, adv.startYear) > voucherPeriod) continue;
    const id = String(adv._id);
    const left = remaining.get(id) || 0;
    if (left <= 0) continue;
    const want = adv.type === 'advance' ? left : Math.min(left, adv.installmentAmount || left);
    const take = round(Math.min(want, room));
    if (take <= 0) continue;
    lines.push({ advanceId: adv._id, type: adv.type, amount: take });
    remaining.set(id, round(left - take));
    room = round(room - take);
  }
  return lines;
}

/** Fit stored (manual) lines into what is really left, without planning new ones. */
function clampLines(lines, advances, remaining, cap) {
  const byId = new Map(advances.map((a) => [String(a._id), a]));
  const out = [];
  let room = Math.max(0, round(cap));
  for (const line of lines || []) {
    const id = String(line.advanceId);
    if (!byId.has(id)) continue;
    const left = remaining.get(id) || 0;
    const take = round(Math.min(Number(line.amount) || 0, left, room));
    if (take <= 0) continue;
    out.push({ advanceId: line.advanceId, type: byId.get(id).type, amount: take });
    remaining.set(id, round(left - take));
    room = round(room - take);
  }
  return out;
}

const sameLines = (a = [], b = []) =>
  a.length === b.length &&
  a.every(
    (x, i) =>
      String(x.advanceId) === String(b[i].advanceId) && round(x.amount) === round(b[i].amount)
  );

async function activeAdvancesFor(staffId) {
  return AcademyStaffAdvance.find({ staffId, status: 'active' }).sort({ givenDate: 1, createdAt: 1 });
}

/** Re-plan deductions on every pending voucher of one staff member. */
async function refreshPendingDeductionsForStaff(staffId) {
  if (!staffId) return { updated: 0 };
  const [advances, vouchers] = await Promise.all([
    activeAdvancesFor(staffId),
    AcademySalaryRecord.find({ staffId, status: 'pending' }).sort({ year: 1, month: 1 }),
  ]);
  const remaining = new Map(advances.map((a) => [String(a._id), remainingOf(a)]));
  let updated = 0;

  for (const v of vouchers) {
    const lines = v.advanceDeductionManual
      ? clampLines(v.advanceDeductions, advances, remaining, v.amount)
      : planFor(advances, remaining, period(v.month, v.year), v.amount);
    const net = Math.max(0, round((v.amount || 0) - lines.reduce((n, l) => n + l.amount, 0)));
    if (!sameLines(v.advanceDeductions, lines) || round(v.netAmount) !== net) {
      v.advanceDeductions = lines;
      await v.save();
      updated += 1;
    }
  }
  return { updated };
}

async function safeRefreshStaff(staffIds) {
  const unique = [...new Set((Array.isArray(staffIds) ? staffIds : [staffIds]).filter(Boolean).map(String))];
  for (const id of unique) {
    try {
      await refreshPendingDeductionsForStaff(id);
    } catch (err) {
      console.error(`[advances] Could not refresh deductions for staff ${id}:`, err?.message || err);
    }
  }
}

/**
 * Called right before a voucher is marked paid. Sets the final deduction lines on the
 * in-memory record (earlier pending vouchers keep their share first).
 */
async function prepareDeductionsForPayment(record) {
  const staffId = record.staffId?._id || record.staffId;
  const [advances, earlier] = await Promise.all([
    activeAdvancesFor(staffId),
    AcademySalaryRecord.find({
      staffId,
      status: 'pending',
      _id: { $ne: record._id },
    }).select('month year advanceDeductions'),
  ]);
  const remaining = new Map(advances.map((a) => [String(a._id), remainingOf(a)]));
  const thisPeriod = period(record.month, record.year);
  for (const v of earlier) {
    if (period(v.month, v.year) >= thisPeriod) continue;
    for (const d of v.advanceDeductions || []) {
      const id = String(d.advanceId);
      if (remaining.has(id)) remaining.set(id, Math.max(0, round(remaining.get(id) - d.amount)));
    }
  }
  record.advanceDeductions = record.advanceDeductionManual
    ? clampLines(record.advanceDeductions, advances, remaining, record.amount)
    : planFor(advances, remaining, thisPeriod, record.amount);
}

function applyRepayment(adv, { amount, salaryRecordId, month, year, paidAt }) {
  const take = round(Math.min(Number(amount) || 0, remainingOf(adv)));
  if (take <= 0) return 0;
  adv.repayments.push({ salaryRecordId, month, year, amount: take, paidAt: paidAt || new Date() });
  adv.recoveredAmount = round((adv.recoveredAmount || 0) + take);
  if (remainingOf(adv) <= 0) {
    adv.status = 'closed';
    adv.closedAt = new Date();
  }
  return take;
}

/** After a voucher is saved as paid: move its deductions into the advance records. */
async function applyDeductionsFromPaidVoucher(record, userId) {
  const lines = record.advanceDeductions || [];
  if (!lines.length) return;
  const staffId = record.staffId?._id || record.staffId;
  for (const line of lines) {
    const adv = await AcademyStaffAdvance.findById(line.advanceId);
    if (!adv || adv.status !== 'active') continue;
    applyRepayment(adv, {
      amount: line.amount,
      salaryRecordId: record._id,
      month: record.month,
      year: record.year,
      paidAt: record.paidAt,
    });
    if (userId) adv.recordedBy = userId;
    await adv.save();
  }
  await safeRefreshStaff(staffId);
}

/** Admin override of one pending voucher's deduction. `amount: null` → back to automatic. */
async function setVoucherDeduction(recordId, amount, userId) {
  const record = await AcademySalaryRecord.findById(recordId);
  if (!record) throw new ApiError(404, 'Salary record not found');
  if (record.status !== 'pending') {
    throw new ApiError(400, 'Deduction can only be changed on a pending voucher');
  }

  if (amount === null || amount === undefined || amount === '') {
    record.advanceDeductionManual = false;
    record.recordedBy = userId;
    await record.save();
    await refreshPendingDeductionsForStaff(record.staffId);
    return AcademySalaryRecord.findById(recordId);
  }

  const total = round(amount);
  if (total < 0) throw new ApiError(400, 'Invalid deduction amount');
  if (total > round(record.amount)) {
    throw new ApiError(400, 'Deduction cannot be more than the salary amount');
  }

  const advances = await activeAdvancesFor(record.staffId);
  const thisPeriod = period(record.month, record.year);
  const eligible = advances.filter((a) => period(a.startMonth, a.startYear) <= thisPeriod);
  const lines = [];
  let left = total;
  for (const adv of eligible) {
    if (left <= 0) break;
    const take = round(Math.min(left, remainingOf(adv)));
    if (take <= 0) continue;
    lines.push({ advanceId: adv._id, type: adv.type, amount: take });
    left = round(left - take);
  }
  if (left > 0) {
    throw new ApiError(400, 'Deduction is more than the advance / loan still owed');
  }

  record.advanceDeductions = lines;
  record.advanceDeductionManual = true;
  record.recordedBy = userId;
  await record.save();
  await refreshPendingDeductionsForStaff(record.staffId);
  return AcademySalaryRecord.findById(recordId);
}

// ── CRUD ────────────────────────────────────────────────────────────────

function normalizeStart(body, givenDate) {
  const d = givenDate || new Date();
  const startMonth = Number(body.startMonth) || d.getMonth() + 1;
  const startYear = Number(body.startYear) || d.getFullYear();
  return { startMonth, startYear };
}

async function createAdvance(body, userId) {
  await assertStaffMember(body.staffId);
  const amount = round(body.amount);
  const givenDate = body.givenDate ? new Date(body.givenDate) : new Date();
  const { startMonth, startYear } = normalizeStart(body, givenDate);
  const installmentAmount =
    body.type === 'loan' ? round(body.installmentAmount) : amount;
  if (body.type === 'loan' && !(installmentAmount > 0)) {
    throw new ApiError(400, 'Enter the monthly installment for the loan');
  }
  if (installmentAmount > amount) {
    throw new ApiError(400, 'Monthly installment cannot be more than the loan amount');
  }

  const adv = await AcademyStaffAdvance.create({
    staffId: body.staffId,
    type: body.type,
    amount,
    givenDate,
    startMonth,
    startYear,
    installmentAmount,
    paymentMethod: body.paymentMethod || 'cash',
    notes: body.notes || '',
    createdBy: userId,
    recordedBy: userId,
  });
  await safeRefreshStaff(body.staffId);
  return AcademyStaffAdvance.findById(adv._id).populate(STAFF_POPULATE);
}

async function updateAdvance(id, body, userId) {
  const adv = await AcademyStaffAdvance.findById(id);
  if (!adv) throw new ApiError(404, 'Advance / loan not found');
  if (adv.status === 'cancelled') throw new ApiError(400, 'This record is cancelled');

  if (body.amount !== undefined) {
    const amount = round(body.amount);
    if (amount < round(adv.recoveredAmount)) {
      throw new ApiError(400, 'Amount cannot be less than what is already recovered');
    }
    adv.amount = amount;
    if (adv.type === 'advance') adv.installmentAmount = amount;
  }
  if (body.installmentAmount !== undefined && adv.type === 'loan') {
    const inst = round(body.installmentAmount);
    if (!(inst > 0)) throw new ApiError(400, 'Monthly installment must be more than zero');
    adv.installmentAmount = inst;
  }
  if (adv.installmentAmount > adv.amount) adv.installmentAmount = adv.amount;
  if (body.givenDate) adv.givenDate = new Date(body.givenDate);
  if (body.startMonth) adv.startMonth = Number(body.startMonth);
  if (body.startYear) adv.startYear = Number(body.startYear);
  if (body.paymentMethod) adv.paymentMethod = body.paymentMethod;
  if (body.notes !== undefined) adv.notes = body.notes || '';

  if (remainingOf(adv) <= 0) {
    adv.status = 'closed';
    adv.closedAt = adv.closedAt || new Date();
  } else if (adv.status === 'closed') {
    adv.status = 'active';
    adv.closedAt = undefined;
  }
  adv.recordedBy = userId;
  await adv.save();
  await safeRefreshStaff(adv.staffId);
  return AcademyStaffAdvance.findById(adv._id).populate(STAFF_POPULATE);
}

/** Staff hands money back directly (not through salary). */
async function recordCashRepayment(id, { amount, paidAt, notes }, userId) {
  const adv = await AcademyStaffAdvance.findById(id);
  if (!adv) throw new ApiError(404, 'Advance / loan not found');
  if (adv.status !== 'active') throw new ApiError(400, 'Only an active advance / loan can be repaid');
  const value = round(amount);
  if (!(value > 0)) throw new ApiError(400, 'Enter the amount received');
  if (value > remainingOf(adv)) {
    throw new ApiError(400, `Only Rs ${remainingOf(adv).toLocaleString('en-PK')} is still owed`);
  }
  applyRepayment(adv, { amount: value, paidAt: paidAt ? new Date(paidAt) : new Date() });
  if (notes) adv.notes = [adv.notes, notes].filter(Boolean).join(' | ');
  adv.recordedBy = userId;
  await adv.save();
  await safeRefreshStaff(adv.staffId);
  return AcademyStaffAdvance.findById(adv._id).populate(STAFF_POPULATE);
}

async function cancelAdvance(id, userId) {
  const adv = await AcademyStaffAdvance.findById(id);
  if (!adv) throw new ApiError(404, 'Advance / loan not found');
  if (adv.status === 'cancelled') return adv;
  if (round(adv.recoveredAmount) > 0) {
    throw new ApiError(400, 'Part of this is already recovered, so it cannot be cancelled. Edit the amount instead.');
  }
  adv.status = 'cancelled';
  adv.recordedBy = userId;
  await adv.save();
  await safeRefreshStaff(adv.staffId);
  return AcademyStaffAdvance.findById(adv._id).populate(STAFF_POPULATE);
}

async function buildQuery({ staffId, type, status, search }) {
  const q = {};
  if (staffId) q.staffId = staffId;
  if (type) q.type = type;
  if (status) q.status = status;
  const s = String(search || '').trim();
  if (s && !staffId) {
    const rx = { $regex: s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    const users = await User.find({ $or: [{ name: rx }, { phone: rx }, { designation: rx }] }).select('_id');
    q.staffId = { $in: users.map((u) => u._id) };
  }
  return q;
}

async function listAdvances({ page = 1, limit = 20, ...filters }) {
  const q = await buildQuery(filters);
  const perPage = Math.min(100, Math.max(1, Number(limit) || 20));
  const current = Math.max(1, Number(page) || 1);
  const [items, total] = await Promise.all([
    AcademyStaffAdvance.find(q)
      .populate(STAFF_POPULATE)
      .populate({ path: 'createdBy', select: 'name' })
      .sort({ status: 1, givenDate: -1, createdAt: -1 })
      .skip((current - 1) * perPage)
      .limit(perPage),
    AcademyStaffAdvance.countDocuments(q),
  ]);
  return {
    items,
    pagination: { page: current, limit: perPage, total, pages: Math.ceil(total / perPage) || 1 },
  };
}

async function getAdvanceById(id) {
  const adv = await AcademyStaffAdvance.findById(id)
    .populate(STAFF_POPULATE)
    .populate({ path: 'createdBy', select: 'name' })
    .populate({ path: 'recordedBy', select: 'name' })
    .populate({ path: 'repayments.salaryRecordId', select: 'voucherNumber month year amount status' });
  if (!adv) throw new ApiError(404, 'Advance / loan not found');
  const pending = await AcademySalaryRecord.find({
    staffId: adv.staffId?._id || adv.staffId,
    status: 'pending',
    'advanceDeductions.advanceId': adv._id,
  })
    .select('voucherNumber month year amount advanceDeductions')
    .sort({ year: 1, month: 1 })
    .lean();
  const upcoming = pending.map((v) => ({
    salaryRecordId: v._id,
    voucherNumber: v.voucherNumber,
    month: v.month,
    year: v.year,
    amount: round(
      (v.advanceDeductions || [])
        .filter((d) => String(d.advanceId) === String(adv._id))
        .reduce((n, d) => n + (Number(d.amount) || 0), 0)
    ),
  }));
  return { ...adv.toJSON(), upcomingDeductions: upcoming };
}

async function getAdvanceSummary({ staffId, type } = {}) {
  const q = { status: { $ne: 'cancelled' } };
  if (staffId) q.staffId = staffId;
  if (type) q.type = type;
  const rows = await AcademyStaffAdvance.find(q).select('type amount recoveredAmount status').lean();
  const out = {
    totalGiven: 0,
    totalRecovered: 0,
    totalOutstanding: 0,
    activeCount: 0,
    closedCount: 0,
    advanceOutstanding: 0,
    loanOutstanding: 0,
  };
  for (const r of rows) {
    const left = remainingOf(r);
    out.totalGiven += r.amount || 0;
    out.totalRecovered += r.recoveredAmount || 0;
    if (r.status === 'active') {
      out.activeCount += 1;
      out.totalOutstanding += left;
      if (r.type === 'advance') out.advanceOutstanding += left;
      else out.loanOutstanding += left;
    } else if (r.status === 'closed') {
      out.closedCount += 1;
    }
  }
  Object.keys(out).forEach((k) => {
    out[k] = round(out[k]);
  });
  return out;
}

module.exports = {
  createAdvance,
  updateAdvance,
  cancelAdvance,
  recordCashRepayment,
  listAdvances,
  getAdvanceById,
  getAdvanceSummary,
  setVoucherDeduction,
  refreshPendingDeductionsForStaff,
  safeRefreshStaff,
  prepareDeductionsForPayment,
  applyDeductionsFromPaidVoucher,
};
