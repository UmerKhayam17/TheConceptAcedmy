const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const {
  chargeApplies,
  componentFromCharge,
  listActiveCharges,
} = require('./academyAdditionalChargeService');
const AcademyStudent = require('../../models/academy/AcademyStudent');
const AcademyClass = require('../../models/academy/AcademyClass');
const AcademySection = require('../../models/academy/AcademySection');
const AcademyFeeRecord = require('../../models/academy/AcademyFeeRecord');
const Session = require('../../models/Session');
const { populateCreatedBy } = require('../../utils/createdBy');
const { notifyByAccess } = require('../realtime/realtimeService');
const { renderBrandedExcel, renderBrandedPdf } = require('./academyReportDocument');
const { renderDualTablePdf } = require('./academyStudentExportService');
const { compareStudentsByRollAsc } = require('../../utils/academyStudentSort');
const { dayBounds, formatDateInTz, todayYmd } = require('../../utils/schoolDay');
const { getEnrollmentLayout } = require('./academyEnrollmentSubjectService');

async function resolveFeeReportContext({ sessionId, classId }) {
  let sessionLabel = '';
  let classLabel = '';
  if (sessionId) {
    const session = await Session.findById(sessionId).select('name').lean();
    sessionLabel = session?.name || '';
  }
  if (classId) {
    const cls = await AcademyClass.findById(classId).select('className').lean();
    classLabel = cls?.className || '';
  }
  return { sessionLabel, classLabel };
}

const PAYMENT_SLIP_DIR = path.join(__dirname, '../../../uploads/payment-slips');

function resolvePaidAt(value) {
  if (!value) return new Date();
  const raw = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(raw.getTime())) throw new ApiError(400, 'Invalid payment date');
  const paidAt = new Date(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate(), 12, 0, 0, 0);
  const paidYmd = `${raw.getUTCFullYear()}-${String(raw.getUTCMonth() + 1).padStart(2, '0')}-${String(raw.getUTCDate()).padStart(2, '0')}`;
  if (paidYmd > todayYmd()) throw new ApiError(400, 'Payment date cannot be in the future');
  return paidAt;
}

function savePaymentSlip(file) {
  if (!file?.buffer?.length) return '';
  fs.mkdirSync(PAYMENT_SLIP_DIR, { recursive: true });
  const ext = path.extname(file.originalname || '').toLowerCase();
  const safeExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf'].includes(ext) ? ext : '.jpg';
  const filename = `slip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExt}`;
  fs.writeFileSync(path.join(PAYMENT_SLIP_DIR, filename), file.buffer);
  return `/uploads/payment-slips/${filename}`;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Start of today in the academy timezone (not the host timezone). */
function startOfSchoolToday() {
  return dayBounds(todayYmd()).start;
}

function ymdToUtcMs(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function daysSince(date) {
  if (!date) return 0;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return 0;
  const diff = ymdToUtcMs(todayYmd()) - ymdToUtcMs(formatDateInTz(d));
  return Math.max(0, Math.round(diff / (24 * 60 * 60 * 1000)));
}

function escapeCsvCell(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Billing-month range from two YYYY-MM-DD dates: a voucher matches when its billing
 * month falls between the month of `periodFrom` and the month of `periodTo`.
 * Returns a Mongo $expr (works in find and aggregate $match), or null.
 */
function billingPeriodExpr(periodFrom, periodTo) {
  const key = (value) => {
    const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(value || ''));
    return m ? Number(m[1]) * 12 + Number(m[2]) : null;
  };
  const fromKey = key(periodFrom);
  const toKey = key(periodTo);
  if (fromKey == null && toKey == null) return null;
  const recordKey = { $add: [{ $multiply: ['$year', 12] }, '$month'] };
  const conds = [];
  if (fromKey != null) conds.push({ $gte: [recordKey, fromKey] });
  if (toKey != null) conds.push({ $lte: [recordKey, toKey] });
  return { $and: conds };
}

function buildDefaulterFeeMatch({ classId, month, year, studentIds, periodFrom, periodTo }) {
  const feeMatch = { status: { $in: ['pending', 'overdue'] } };
  if (month) feeMatch.month = Number(month);
  if (year) feeMatch.year = Number(year);
  const period = billingPeriodExpr(periodFrom, periodTo);
  if (period) feeMatch.$expr = period;
  if (studentIds?.length) feeMatch.studentId = { $in: studentIds };
  return feeMatch;
}

async function resolveActiveStudentIds(classId, sessionId) {
  const studentQ = { status: 'active' };
  if (classId) {
    studentQ.classId = classId;
  } else if (sessionId) {
    const classes = await AcademyClass.find({ sessionId }).select('_id');
    studentQ.classId = { $in: classes.map((c) => c._id) };
  }
  const students = await AcademyStudent.find(studentQ).select('_id').lean();
  return students.map((s) => s._id);
}

function buildDefaultersPipeline({ feeMatch, search }) {
  const pipeline = [
    { $match: feeMatch },
    {
      $group: {
        _id: '$studentId',
        totalDue: { $sum: '$amount' },
        unpaidCount: { $sum: 1 },
        overdueCount: {
          $sum: { $cond: [{ $eq: ['$status', 'overdue'] }, 1, 0] },
        },
        pendingCount: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
        },
        oldestDueDate: { $min: '$dueDate' },
      },
    },
    {
      $lookup: {
        from: AcademyStudent.collection.name,
        localField: '_id',
        foreignField: '_id',
        as: 'student',
      },
    },
    { $unwind: '$student' },
    { $match: { 'student.status': 'active' } },
    {
      $lookup: {
        from: AcademyClass.collection.name,
        localField: 'student.classId',
        foreignField: '_id',
        as: 'classDoc',
      },
    },
    {
      $lookup: {
        from: AcademySection.collection.name,
        localField: 'student.sectionId',
        foreignField: '_id',
        as: 'sectionDoc',
      },
    },
    {
      $addFields: {
        className: { $arrayElemAt: ['$classDoc.className', 0] },
        sectionName: { $arrayElemAt: ['$sectionDoc.sectionName', 0] },
      },
    },
  ];

  if (search && String(search).trim()) {
    const s = String(search).trim();
    const rx = new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    pipeline.push({
      $match: {
        $or: [
          { 'student.studentName': rx },
          { 'student.fatherName': rx },
          { 'student.phone': rx },
          { 'student.studentId': rx },
          { 'student.rollNumber': rx },
          { 'student.registrationNumber': rx },
          { className: rx },
          { sectionName: rx },
        ],
      },
    });
  }

  return pipeline;
}

function mapDefaulterRow(row) {
  const daysOverdue = daysSince(row.oldestDueDate);
  return {
    studentId: row._id,
    totalDue: row.totalDue,
    unpaidCount: row.unpaidCount,
    overdueCount: row.overdueCount,
    pendingCount: row.pendingCount,
    oldestDueDate: row.oldestDueDate,
    daysOverdue,
    student: {
      _id: row.student._id,
      studentId: row.student.studentId,
      registrationNumber: row.student.registrationNumber,
      rollNumber: row.student.rollNumber,
      studentName: row.student.studentName,
      fatherName: row.student.fatherName,
      phone: row.student.phone,
      classId: row.student.classId,
      sectionId: row.student.sectionId,
    },
    className: row.className || null,
    sectionName: row.sectionName || null,
  };
}

function receiptNumber(studentDoc, month, year, feeType) {
  const sid = studentDoc.studentId || studentDoc._id.toString().slice(-6);
  const period = `${year}${String(month).padStart(2, '0')}`;
  if (feeType === 'admission') return `RCP-${sid}-ADM`;
  if (feeType === 'stationery') return `RCP-${sid}-STN-${period}`;
  return `RCP-${sid}-${period}`;
}

/** Monthly challan amount after the student's recurring monthly discount. */
function monthlyBillAmount(student) {
  const fee = Math.max(0, Number(student.monthlyFee) || 0);
  const discount = Math.min(Math.max(0, Number(student.monthlyFeeDiscount) || 0), fee);
  return Math.max(0, fee - discount);
}

const FULL_WAIVER_NOTE = 'Full fee waiver — free student (auto-settled)';

function applyFullWaiverSettlement(record, userId) {
  record.amount = 0;
  record.status = 'paid';
  record.paidAt = record.paidAt || new Date();
  record.paymentMethod = record.paymentMethod || 'other';
  record.recordedBy = userId;
  if (Array.isArray(record.components) && record.components.length) {
    record.components = record.components.map((line) => {
      const plain = typeof line?.toObject === 'function' ? line.toObject() : { ...line };
      return { ...plain, amount: 0 };
    });
  }
  const notes = String(record.notes || '').trim();
  if (!notes.includes('Full fee waiver')) {
    record.notes = [notes, FULL_WAIVER_NOTE].filter(Boolean).join(' · ');
  }
  return record;
}

/** Tuition + admission payable are both ₨ 0 after discounts. */
function isStudentFullFeeWaiver(student) {
  const monthlyDue = monthlyBillAmount(student);
  const { admissionAmount } = splitEnrollmentAmounts(student || {});
  return monthlyDue <= 0 && admissionAmount <= 0;
}

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Tuition plus optionally selected additional charges for this month.
 * By default no charges are added — pass chargeIds to include specific ones.
 */
function composeMonthlyComponents(student, month, charges, tuitionAmount, { chargeIds } = {}) {
  const tuition = roundMoney(tuitionAmount);
  const components = [];
  if (tuition > 0) components.push({ name: 'Tuition', amount: tuition, kind: 'tuition' });

  const selected = new Set(
    (Array.isArray(chargeIds) ? chargeIds : []).map((id) => String(id)).filter(Boolean)
  );
  if (selected.size) {
    for (const charge of charges || []) {
      if (!selected.has(String(charge._id))) continue;
      if (!chargeApplies(charge, student, month)) continue;
      const line = componentFromCharge(charge);
      if (line.amount > 0) components.push(line);
    }
  }

  const amount = roundMoney(components.reduce((sum, line) => sum + line.amount, 0));
  return { amount, components };
}

function chargeIdsFromComponents(components) {
  return (Array.isArray(components) ? components : [])
    .filter((line) => line?.kind === 'charge' && line?.chargeId)
    .map((line) => String(line.chargeId));
}

/** Ad-hoc charge lines (e.g. stationery) with no linked additional-charge id. */
function manualChargeLines(components) {
  return (Array.isArray(components) ? components : [])
    .filter((line) => line?.kind === 'charge' && !line.chargeId && Number(line.amount) > 0)
    .map((line) => ({
      name: String(line.name || 'Charge').trim() || 'Charge',
      amount: roundMoney(Number(line.amount) || 0),
      kind: 'charge',
    }));
}

function withPreservedManualCharges(bill, previousComponents) {
  if (!bill) return bill;
  const manual = manualChargeLines(previousComponents);
  if (!manual.length) return bill;
  const components = [...bill.components, ...manual];
  const amount = roundMoney(components.reduce((sum, line) => sum + line.amount, 0));
  return { amount, components };
}

function isStationeryLine(line) {
  return (
    line?.kind === 'charge' &&
    !line.chargeId &&
    /^stationery$/i.test(String(line.name || '').trim())
  );
}

function seedComponentsIfEmpty(record) {
  const existing = Array.isArray(record.components) ? [...record.components] : [];
  if (existing.length) return existing;
  const amt = roundMoney(Number(record.amount) || 0);
  if (amt <= 0) return [];
  if (record.feeType === 'admission') {
    return [{ name: 'Admission', amount: amt, kind: 'admission' }];
  }
  return [{ name: 'Tuition', amount: amt, kind: 'tuition' }];
}

function totalFromComponents(components) {
  return roundMoney(
    (Array.isArray(components) ? components : []).reduce((sum, line) => sum + (Number(line.amount) || 0), 0)
  );
}

/**
 * Nominal due day is the 10th. For the current calendar month, never set a past
 * due date so newly issued challans do not flip to overdue on the same day.
 * Past months keep the historical due date so they correctly show as overdue.
 */
function resolveMonthlyDueDate(month, year, day = 10) {
  const due = new Date(year, month - 1, day);
  const now = new Date();
  const isCurrentPeriod = month === now.getMonth() + 1 && year === now.getFullYear();
  if (!isCurrentPeriod) return due;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return due < today ? today : due;
}

function splitEnrollmentAmounts(fees) {
  const monthlyFee = Math.max(0, Number(fees.monthlyFee) || 0);
  const admissionFee = Math.max(0, Number(fees.admissionFee) || 0);
  const monthlyDisc = Math.max(0, Number(fees.monthlyFeeDiscount) || 0);
  const admissionDisc = Math.max(0, Number(fees.admissionFeeDiscount) || 0);
  const legacyDisc = Math.max(0, Number(fees.discountAmount) || 0);

  if (monthlyDisc > 0 || admissionDisc > 0) {
    return {
      admissionAmount: Math.max(0, admissionFee - Math.min(admissionDisc, admissionFee)),
      monthlyAmount: Math.max(0, monthlyFee - Math.min(monthlyDisc, monthlyFee)),
    };
  }

  // Legacy combined discount: apply to admission first, remainder to monthly.
  let remaining = legacyDisc;
  const admCut = Math.min(remaining, admissionFee);
  remaining -= admCut;
  return {
    admissionAmount: Math.max(0, admissionFee - admCut),
    monthlyAmount: Math.max(0, monthlyFee - Math.min(remaining, monthlyFee)),
  };
}

/**
 * First month (unpaid): one combined voucher =
 * monthly fee + admission fee − discounts.
 * Later months are created by generateMonthlyFees as monthly − monthly discount.
 */
/**
 * Recalculate unpaid challans after a student fee profile change.
 * Same composition as generateMonthlyFees / enrollment vouchers:
 * monthlyBillAmount → charges → (admission on admission vouchers) → total.
 *
 * Full fee waiver → all pending/overdue challans auto-settled as Paid at ₨ 0
 * PAID / WAIVED → never touched
 * PENDING / OVERDUE → amount + components updated together
 * Manual charge lines (stationery without chargeId) → preserved on the same challan
 *
 * Partial credit: if prior amount was reduced below the old components total
 * (staff recorded a remaining balance), keep that credit against the revised bill.
 */
async function syncUnpaidChallansForStudent(student, { chargeIds } = {}) {
  if (!student?._id) return { updated: 0, skipped: 0 };

  // A full waiver / full tuition exemption only zeroes tuition and admission. Each open
  // monthly / admission challan is rebuilt below: one with nothing left is settled as Paid
  // at ₨0, one that still carries additional or stationery charges keeps those due.
  // Stationery and other non-tuition challans are never touched here.
  const unpaid = await AcademyFeeRecord.find({
    studentId: student._id,
    status: { $in: ['pending', 'overdue'] },
    feeType: { $in: ['monthly', 'admission'] },
  });

  if (!unpaid.length) return { updated: 0, skipped: 0 };

  const charges = await listActiveCharges();
  const forceChargeIds =
    chargeIds !== undefined ? [...new Set((Array.isArray(chargeIds) ? chargeIds : []).map(String).filter(Boolean))] : undefined;
  let updated = 0;
  let skipped = 0;

  for (const record of unpaid) {
    const bill = reviseBillForFeeRecord(
      student,
      record,
      charges,
      forceChargeIds !== undefined ? { chargeIds: forceChargeIds } : undefined
    );
    if (!bill || bill.amount < 0) {
      skipped += 1;
      continue;
    }

    const oldAmount = roundMoney(Number(record.amount) || 0);
    const oldComponentsTotal = roundMoney(
      (Array.isArray(record.components) ? record.components : []).reduce(
        (sum, line) => sum + (Number(line.amount) || 0),
        0
      )
    );
    // Amount below components total ⇒ remaining after a prior partial settlement.
    const alreadyPaid =
      oldComponentsTotal > oldAmount + 0.009
        ? roundMoney(oldComponentsTotal - oldAmount)
        : 0;
    const nextAmount = roundMoney(Math.max(0, bill.amount - alreadyPaid));

    const amountChanged = Math.abs(nextAmount - oldAmount) > 0.009;
    const componentsChanged = !componentsEqual(record.components, bill.components);
    const becomesFree = nextAmount <= 0 && record.status !== 'paid';
    if (!amountChanged && !componentsChanged && !becomesFree) {
      skipped += 1;
      continue;
    }

    record.components = bill.components;
    if (nextAmount <= 0) {
      applyFullWaiverSettlement(record, student.updatedBy || student.createdBy);
    } else {
      record.amount = nextAmount;
      if (alreadyPaid > 0) {
        const creditNote = `Revised bill ₨${bill.amount.toLocaleString()}; credit ₨${alreadyPaid.toLocaleString()} for prior partial payment.`;
        const notes = String(record.notes || '');
        if (!notes.includes('Revised bill')) {
          record.notes = [notes.trim(), creditNote].filter(Boolean).join(' · ');
        }
      }
    }
    await record.save();
    updated += 1;
  }

  return { updated, skipped };
}

function reviseBillForFeeRecord(student, record, charges, { chargeIds } = {}) {
  const selectedIds =
    chargeIds !== undefined ? chargeIds : chargeIdsFromComponents(record.components);
  const previousComponents = record.components;

  if (record.feeType === 'monthly') {
    const bill = composeMonthlyComponents(student, record.month, charges, monthlyBillAmount(student), {
      chargeIds: selectedIds,
    });
    return withPreservedManualCharges(bill, previousComponents);
  }

  if (record.feeType === 'admission') {
    const { admissionAmount, monthlyAmount } = splitEnrollmentAmounts({
      monthlyFee: student.monthlyFee,
      admissionFee: student.admissionFee,
      monthlyFeeDiscount: student.monthlyFeeDiscount,
      admissionFeeDiscount: student.admissionFeeDiscount,
      discountAmount: student.discountAmount,
    });
    const tuitionBill = composeMonthlyComponents(student, record.month, charges, monthlyAmount, {
      chargeIds: selectedIds,
    });
    const components = [...tuitionBill.components];
    if (admissionAmount > 0) {
      components.push({
        name: 'Admission',
        amount: roundMoney(admissionAmount),
        kind: 'admission',
      });
    }
    const amount = roundMoney(components.reduce((sum, line) => sum + line.amount, 0));
    return withPreservedManualCharges({ amount, components }, previousComponents);
  }

  return null;
}

function componentsEqual(a, b) {
  const norm = (list) =>
    (Array.isArray(list) ? list : [])
      .map((line) => ({
        name: String(line?.name || '').trim(),
        amount: roundMoney(Number(line?.amount) || 0),
        kind: String(line?.kind || ''),
        chargeId: line?.chargeId ? String(line.chargeId) : '',
      }))
      .sort((x, y) => `${x.kind}:${x.name}`.localeCompare(`${y.kind}:${y.name}`));
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

async function createEnrollmentFeeVouchers(
  student,
  fees,
  userId,
  { asOf = new Date(), replacePending = false, chargeIds } = {}
) {
  const month = asOf.getMonth() + 1;
  const year = asOf.getFullYear();
  const dueDate = resolveMonthlyDueDate(month, year);
  const { admissionAmount, monthlyAmount } = splitEnrollmentAmounts(fees);
  // Use explicitly passed chargeIds; otherwise fall back to the additional charges
  // selected for this student at registration (student.defaultChargeIds).
  const sourceIds = chargeIds !== undefined ? chargeIds : student?.defaultChargeIds;
  const selectedIds = [
    ...new Set(
      (Array.isArray(sourceIds) ? sourceIds : [])
        .map((id) => String(id?._id ?? id ?? ''))
        .filter(Boolean)
    ),
  ];
  const charges = selectedIds.length ? await listActiveCharges() : [];
  const tuitionBill = composeMonthlyComponents(student, month, charges, monthlyAmount, {
    chargeIds: selectedIds,
  });
  // Order: Admission → Tuition → additional charges.
  const components = [];
  if (admissionAmount > 0) {
    components.push({ name: 'Admission', amount: roundMoney(admissionAmount), kind: 'admission' });
  }
  components.push(...tuitionBill.components);
  const totalDue = roundMoney(components.reduce((sum, line) => sum + line.amount, 0));
  const isFree = totalDue <= 0;
  // Full waiver: still show Tuition + Admission as ₨ 0 lines on one enrollment voucher.
  const enrollmentComponents = isFree
    ? [
        { name: 'Admission', amount: 0, kind: 'admission' },
        { name: 'Tuition', amount: 0, kind: 'tuition' },
      ]
    : components;

  const existingAdm = await AcademyFeeRecord.findOne({
    studentId: student._id,
    month,
    year,
    feeType: 'admission',
  });
  if (existingAdm) {
    if (existingAdm.status === 'paid' || existingAdm.status === 'waived') {
      return [existingAdm];
    }
    if (replacePending && ['pending', 'overdue'].includes(existingAdm.status)) {
      existingAdm.components = enrollmentComponents;
      existingAdm.dueDate = dueDate;
      existingAdm.recordedBy = userId;
      if (isFree) {
        applyFullWaiverSettlement(existingAdm, userId);
        existingAdm.components = enrollmentComponents;
      } else {
        existingAdm.amount = totalDue;
        existingAdm.notes = 'First month: monthly fee + admission fee (after discounts)';
      }
      await existingAdm.save();
      return [existingAdm];
    }
    return [existingAdm];
  }

  // Avoid a leftover monthly-only voucher for the enrollment month
  // (including auto-settled free monthly rows).
  await AcademyFeeRecord.deleteMany({
    studentId: student._id,
    month,
    year,
    feeType: 'monthly',
    $or: [
      { status: { $in: ['pending', 'overdue'] } },
      { status: 'paid', amount: { $lte: 0 } },
    ],
  });

  const recordPayload = {
    studentId: student._id,
    month,
    year,
    amount: isFree ? 0 : totalDue,
    feeType: 'admission',
    status: isFree ? 'paid' : 'pending',
    dueDate,
    receiptNumber: receiptNumber(student, month, year, 'admission'),
    notes: isFree
      ? `${FULL_WAIVER_NOTE} · First month (monthly + admission)`
      : 'First month: monthly fee + admission fee (after discounts)',
    components: enrollmentComponents,
    createdBy: userId,
    recordedBy: userId,
  };
  if (isFree) {
    recordPayload.paidAt = new Date();
    recordPayload.paymentMethod = 'other';
  } else {
    recordPayload.pendingNoticeAt = new Date();
  }

  const record = await AcademyFeeRecord.create(recordPayload);

  return [record];
}

async function buildFeeQuery({
  studentId,
  studentIds,
  status,
  month,
  year,
  classId,
  sectionId,
  feeType,
  sessionId,
  dateFrom,
  dateTo,
  /** Billing-month range (YYYY-MM-DD dates); see billingPeriodExpr. */
  periodFrom,
  periodTo,
  /** When true, only fee rows for active students (hides inactive / suspended). */
  activeStudentsOnly = false,
}) {
  const q = {};
  if (status) q.status = status;
  if (feeType) q.feeType = feeType;
  if (month) q.month = Number(month);
  if (year) q.year = Number(year);
  const period = billingPeriodExpr(periodFrom, periodTo);
  if (period) q.$expr = period;
  if (dateFrom || dateTo) {
    const paidAt = {};
    if (dateFrom) paidAt.$gte = dayBounds(String(dateFrom)).start;
    if (dateTo) paidAt.$lte = dayBounds(String(dateTo)).end;
    q.paidAt = paidAt;
  }

  const toObjectIds = (ids) =>
    ids
      .filter(Boolean)
      .map((id) => (mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(String(id)) : id));

  const restrictToActive = async (ids) => {
    if (!activeStudentsOnly) return ids;
    if (!ids.length) return ids;
    const active = await AcademyStudent.find({ _id: { $in: ids }, status: 'active' })
      .select('_id')
      .lean();
    return active.map((s) => s._id);
  };

  if (studentId) {
    // Explicit student scope (e.g. parent portal) — keep access even if inactive/suspended.
    // Aggregate $match does not cast strings — must use ObjectId.
    q.studentId = mongoose.isValidObjectId(studentId)
      ? new mongoose.Types.ObjectId(String(studentId))
      : studentId;
    return q;
  }
  // Array (including empty) means an explicit scope — never fall through to all fees
  if (Array.isArray(studentIds)) {
    const scoped = toObjectIds(studentIds);
    q.studentId = { $in: await restrictToActive(scoped) };
    return q;
  }
  if (classId || sectionId) {
    const studentQ = activeStudentsOnly ? { status: 'active' } : {};
    if (classId) studentQ.classId = classId;
    if (sectionId) studentQ.sectionId = sectionId;
    const students = await AcademyStudent.find(studentQ).select('_id').lean();
    q.studentId = { $in: students.map((s) => s._id) };
    return q;
  }
  if (sessionId) {
    const classes = await AcademyClass.find({ sessionId }).select('_id').lean();
    const studentQ = {
      classId: { $in: classes.map((c) => c._id) },
      ...(activeStudentsOnly ? { status: 'active' } : {}),
    };
    const students = await AcademyStudent.find(studentQ).select('_id').lean();
    q.studentId = { $in: students.map((s) => s._id) };
    return q;
  }
  if (activeStudentsOnly) {
    const students = await AcademyStudent.find({ status: 'active' }).select('_id').lean();
    q.studentId = { $in: students.map((s) => s._id) };
  }
  return q;
}

async function applyFeeRecordSearch(q, search) {
  const s = String(search || '').trim();
  if (!s) return q;
  const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = { $regex: escaped, $options: 'i' };
  const students = await AcademyStudent.find({
    $or: [
      { studentName: rx },
      { fatherName: rx },
      { studentId: rx },
      { registrationNumber: rx },
      { rollNumber: rx },
      { phone: rx },
    ],
  }).select('_id');
  return {
    $and: [
      q,
      {
        $or: [
          { studentId: { $in: students.map((st) => st._id) } },
          { receiptNumber: rx },
          { paymentSlipNumber: rx },
          { feeType: rx },
          { notes: rx },
        ],
      },
    ],
  };
}

function periodText(month, year, feeType) {
  if (feeType === 'admission') return 'Admission';
  const name = MONTH_NAMES[(Number(month) || 1) - 1] || '';
  const period = `${name} ${year || ''}`.trim();
  if (feeType === 'stationery') return period ? `Stationery · ${period}` : 'Stationery';
  return period;
}

function studentLabel(record) {
  const student = record.studentId;
  const name = student && typeof student === 'object' ? student.studentName : 'Student';
  return `${name} (${periodText(record.month, record.year, record.feeType)})`;
}

function unpaidSummary(records) {
  const names = records.slice(0, 5).map(studentLabel);
  const extra = records.length > 5 ? ` and ${records.length - 5} more` : '';
  return `${names.join(', ')}${extra}`;
}

async function notifyFeeStaff(notification) {
  await notifyByAccess(
    {
      roles: ['accountant', 'admin'],
      permissions: ['manage_academy_fees', 'view_academy_fee_reports'],
      moduleKey: 'fee',
      moduleAction: 'view',
    },
    notification,
    null
  );
}

async function safeNotify(fn) {
  try {
    await fn();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[fees] notification failed:', err.message);
  }
}

/** Mark pending vouchers past due date as overdue, and alert staff once. */
async function syncOverdueFees(filter = {}) {
  const q = await buildFeeQuery(filter);
  const startOfToday = startOfSchoolToday();

  const flipping = await AcademyFeeRecord.find({
    ...q,
    status: 'pending',
    dueDate: { $lt: startOfToday },
    overdueNoticeAt: null,
  }).populate({ path: 'studentId', select: 'studentName studentId' });

  await AcademyFeeRecord.updateMany(
    {
      ...q,
      status: 'pending',
      dueDate: { $lt: startOfToday },
    },
    { $set: { status: 'overdue' } }
  );

  if (flipping.length) {
    await AcademyFeeRecord.updateMany(
      { _id: { $in: flipping.map((r) => r._id) } },
      { $set: { overdueNoticeAt: new Date() } }
    );
    await safeNotify(() => notifyFeeStaff({
      type: 'fee_overdue',
      title: flipping.length === 1 ? 'Unpaid fee is overdue' : `${flipping.length} unpaid fees are overdue`,
      body: unpaidSummary(flipping),
      path: '/fees',
      moduleKey: 'fee',
      resource: 'fees',
      resourceId: String(flipping[0]._id),
      meta: { feeRecordIds: flipping.map((r) => String(r._id)), count: flipping.length },
    }));
  }

  const unseen = await AcademyFeeRecord.find({
    ...q,
    status: { $in: ['pending', 'overdue'] },
    pendingNoticeAt: null,
    overdueNoticeAt: null,
  }).populate({ path: 'studentId', select: 'studentName studentId' });

  if (unseen.length) {
    await AcademyFeeRecord.updateMany(
      { _id: { $in: unseen.map((r) => r._id) } },
      { $set: { pendingNoticeAt: new Date() } }
    );
    await safeNotify(() => notifyFeeStaff({
      type: 'fee_unpaid',
      title: unseen.length === 1 ? 'Student has an unpaid fee' : `${unseen.length} students have unpaid fees`,
      body: unpaidSummary(unseen),
      path: '/fees',
      moduleKey: 'fee',
      resource: 'fees',
      resourceId: String(unseen[0]._id),
      meta: { feeRecordIds: unseen.map((r) => String(r._id)), count: unseen.length },
    }));
  }
}

async function getFeeRecordById(id) {
  const record = await AcademyFeeRecord.findById(id)
    .populate({
      path: 'studentId',
      select: 'studentId studentName fatherName phone classId',
      populate: {
        path: 'classId',
        select: 'className sessionId',
        populate: { path: 'sessionId', select: 'name status' },
      },
    })
    .populate('recordedBy', 'name email');
  if (!record) throw new ApiError(404, 'Fee record not found');
  return record;
}

/**
 * Edit a fee voucher.
 * Paid: amount, notes, paymentMethod, paidAt, payment slip, payment slip number.
 * Unpaid (pending/overdue): amount, notes, dueDate, status (pending|overdue|waived).
 */
async function updateFeeRecord(id, payload = {}, slipFile) {
  const record = await AcademyFeeRecord.findById(id);
  if (!record) throw new ApiError(404, 'Fee record not found');

  const isPaid = record.status === 'paid';
  const isWaived = record.status === 'waived';

  if (isWaived) {
    throw new ApiError(400, 'Waived fees cannot be edited');
  }

  if (payload.amount !== undefined) {
    const amount = Number(payload.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new ApiError(400, 'Amount must be a non-negative number');
    }
    record.amount = amount;
    if (Array.isArray(record.components) && record.components.length > 0) {
      record.components = [
        {
          name: record.feeType === 'admission' ? 'Admission' : record.feeType === 'stationery' ? 'Stationery' : 'Tuition',
          amount,
          kind: record.feeType === 'admission' ? 'admission' : 'tuition',
        },
      ];
    }
  }

  if (payload.notes !== undefined) {
    record.notes = String(payload.notes || '').trim();
  }

  if (isPaid) {
    if (payload.paymentMethod !== undefined) {
      const method = String(payload.paymentMethod || 'cash');
      if (!['cash', 'bank_transfer', 'online', 'other'].includes(method)) {
        throw new ApiError(400, 'Invalid payment method');
      }
      record.paymentMethod = method;
    }
    if (payload.paidAt !== undefined && payload.paidAt !== null && payload.paidAt !== '') {
      record.paidAt = resolvePaidAt(payload.paidAt);
    }
    if (payload.paymentSlipNumber !== undefined) {
      record.paymentSlipNumber = String(payload.paymentSlipNumber || '').trim();
    }
    const slipPath = savePaymentSlip(slipFile);
    if (slipPath) record.paymentSlip = slipPath;
  } else {
    if (payload.dueDate !== undefined) {
      if (payload.dueDate === null || payload.dueDate === '') {
        record.dueDate = undefined;
      } else {
        const d = new Date(payload.dueDate);
        if (Number.isNaN(d.getTime())) throw new ApiError(400, 'Invalid due date');
        record.dueDate = d;
      }
    }

    if (payload.status !== undefined) {
      const next = String(payload.status);
      if (!['pending', 'overdue', 'waived'].includes(next)) {
        throw new ApiError(400, 'Status must be pending, overdue, or waived');
      }
      record.status = next;
    }
  }

  await record.save();
  return getFeeRecordById(record._id);
}

async function listFeeRecords({
  page = 1,
  limit = 20,
  studentId,
  studentIds,
  status,
  month,
  year,
  classId,
  sectionId,
  feeType,
  sessionId,
  search,
  dateFrom,
  dateTo,
  periodFrom,
  periodTo,
}) {
  await syncOverdueFees({
    studentId,
    studentIds,
    status,
    month,
    year,
    classId,
    sectionId,
    feeType,
    sessionId,
  });

  // Merge legacy separate stationery challans into monthly/admission when possible.
  const orphanQ = { feeType: 'stationery', status: { $in: ['pending', 'overdue'] } };
  if (studentId) orphanQ.studentId = studentId;
  else if (studentIds?.length) orphanQ.studentId = { $in: studentIds };
  if (month) orphanQ.month = Number(month);
  if (year) orphanQ.year = Number(year);
  const orphans = await AcademyFeeRecord.find(orphanQ).select('studentId month year').limit(200);
  const seen = new Set();
  for (const orphan of orphans) {
    const key = `${orphan.studentId}-${orphan.month}-${orphan.year}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // eslint-disable-next-line no-await-in-loop
    await absorbUnpaidStationeryIntoMonthly(orphan.studentId, orphan.month, orphan.year, null);
  }

  // Paid history keeps inactive/suspended students; collection views are active-only.
  const activeStudentsOnly = status !== 'paid';
  const base = await buildFeeQuery({
    studentId,
    studentIds,
    status,
    month,
    year,
    classId,
    sectionId,
    feeType,
    sessionId,
    dateFrom,
    dateTo,
    periodFrom,
    periodTo,
    activeStudentsOnly,
  });
  const q = await applyFeeRecordSearch(base, search);

  const skip = (Math.max(1, page) - 1) * Math.min(100, Math.max(1, limit));
  const perPage = Math.min(100, Math.max(1, limit));

  const ranked = await AcademyFeeRecord.aggregate([
    { $match: q },
    {
      $addFields: {
        statusRank: {
          $switch: {
            branches: [
              { case: { $eq: ['$status', 'overdue'] }, then: 0 },
              { case: { $eq: ['$status', 'pending'] }, then: 1 },
              { case: { $eq: ['$status', 'waived'] }, then: 2 },
            ],
            default: 3,
          },
        },
      },
    },
    { $sort: { statusRank: 1, year: -1, month: -1, createdAt: -1 } },
    { $skip: skip },
    { $limit: perPage },
    { $project: { _id: 1 } },
  ]);
  const ids = ranked.map((row) => row._id);
  const [docs, total] = await Promise.all([
    ids.length
      ? populateCreatedBy(
        AcademyFeeRecord.find({ _id: { $in: ids } }).populate({
          path: 'studentId',
          select:
            'studentId studentName fatherName phone classId status monthlyFee admissionFee monthlyFeeDiscount admissionFeeDiscount',
          populate: {
            path: 'classId',
            select: 'className sessionId',
            populate: { path: 'sessionId', select: 'name status' },
          },
        })
      )
      : [],
    AcademyFeeRecord.countDocuments(q),
  ]);
  const order = new Map(ids.map((id, index) => [String(id), index]));
  const sorted = docs.sort((a, b) => (order.get(String(a._id)) ?? 0) - (order.get(String(b._id)) ?? 0));
  const items = await attachUnpaidMonthCounts(sorted);

  return {
    items,
    pagination: { page: Math.max(1, page), limit: perPage, total, pages: Math.ceil(total / perPage) || 1 },
  };
}

async function attachUnpaidMonthCounts(docs) {
  const studentIds = [
    ...new Set(
      docs
        .map((doc) => {
          const student = doc.studentId;
          return student && student._id ? student._id : student;
        })
        .filter(Boolean)
        .map((id) => String(id))
    ),
  ];
  const counts = new Map();
  if (studentIds.length) {
    const rows = await AcademyFeeRecord.aggregate([
      {
        $match: {
          studentId: { $in: studentIds.map((id) => new mongoose.Types.ObjectId(id)) },
          status: { $in: ['pending', 'overdue'] },
          feeType: 'monthly',
        },
      },
      { $sort: { year: 1, month: 1 } },
      {
        $group: {
          _id: '$studentId',
          count: { $sum: 1 },
          firstMonth: { $first: '$month' },
          firstYear: { $first: '$year' },
          lastMonth: { $last: '$month' },
          lastYear: { $last: '$year' },
        },
      },
    ]);
    rows.forEach((row) => counts.set(String(row._id), row));
  }

  return docs.map((doc) => {
    const row = typeof doc.toObject === 'function' ? doc.toObject({ virtuals: true }) : { ...doc };
    const student = row.studentId;
    const key = String(student && student._id ? student._id : student || '');
    const info = counts.get(key);
    row.unpaidMonthCount = info?.count || 0;
    if (info?.count) {
      row.unpaidFrom = periodText(info.firstMonth, info.firstYear, 'monthly');
      row.unpaidTo = periodText(info.lastMonth, info.lastYear, 'monthly');
    }
    return row;
  });
}

async function generateMonthlyFees({ month, year, classId }, userId) {
  const studentQ = { status: 'active' };
  if (classId) studentQ.classId = classId;
  const students = await AcademyStudent.find(studentQ);
  const dueDate = resolveMonthlyDueDate(month, year);
  const created = [];
  const skipped = [];
  let repaired = 0;

  for (const student of students) {
    // First month is billed on the enrollment (admission) voucher — monthly + admission
    // combined. Never create a second monthly challan for that same period.
    const enrollmentVoucher = await AcademyFeeRecord.findOne({
      studentId: student._id,
      month,
      year,
      feeType: 'admission',
    });
    if (enrollmentVoucher) {
      const coverNote = 'Waived: enrollment month already covered by admission voucher';
      const unpaidDup = await AcademyFeeRecord.findOneAndUpdate(
        {
          studentId: student._id,
          month,
          year,
          feeType: 'monthly',
          status: { $in: ['pending', 'overdue'] },
        },
        {
          $set: {
            status: 'waived',
            notes: coverNote,
            recordedBy: userId,
          },
        },
        { new: true }
      );
      if (unpaidDup) repaired += 1;

      // Free-student auto-paid monthly rows for the enrollment month are also duplicates.
      const freeDup = await AcademyFeeRecord.findOne({
        studentId: student._id,
        month,
        year,
        feeType: 'monthly',
        amount: { $lte: 0 },
        status: 'paid',
      });
      if (freeDup) {
        freeDup.status = 'waived';
        freeDup.recordedBy = userId;
        const notes = String(freeDup.notes || '').trim();
        if (!notes.includes('enrollment month already covered')) {
          freeDup.notes = [notes, coverNote].filter(Boolean).join(' · ');
        }
        await freeDup.save();
        repaired += 1;
      }

      skipped.push(student._id);
      continue;
    }

    const exists = await AcademyFeeRecord.findOne({
      studentId: student._id,
      month,
      year,
      feeType: 'monthly',
    });
    if (exists) {
      await absorbUnpaidStationeryIntoMonthly(student._id, month, year, userId);
      skipped.push(student._id);
      continue;
    }

    // Monthly challans stay tuition-only until staff check additional charges at print/pay.
    const { amount, components } = composeMonthlyComponents(
      student,
      month,
      [],
      monthlyBillAmount(student),
      { chargeIds: [] }
    );
    const isFree = amount <= 0;
    const record = await AcademyFeeRecord.create({
      studentId: student._id,
      month,
      year,
      amount: isFree ? 0 : amount,
      components: isFree ? [{ name: 'Tuition', amount: 0, kind: 'tuition' }] : components,
      feeType: 'monthly',
      status: isFree ? 'paid' : 'pending',
      dueDate,
      receiptNumber: receiptNumber(student, month, year, 'monthly'),
      recordedBy: userId,
      createdBy: userId,
      ...(isFree
        ? { paidAt: new Date(), paymentMethod: 'other', notes: FULL_WAIVER_NOTE }
        : { pendingNoticeAt: new Date() }),
    });
    await absorbUnpaidStationeryIntoMonthly(student._id, month, year, userId);
    const refreshed = await AcademyFeeRecord.findById(record._id);
    created.push(refreshed || record);
    if (refreshed) refreshed.studentId = student;
    else record.studentId = student;
  }

  const unpaidCreated = created.filter((r) => r.status === 'pending' || r.status === 'overdue');
  if (unpaidCreated.length) {
    const label = periodText(month, year, 'monthly');
    await safeNotify(() => notifyFeeStaff({
      type: 'fee_challan',
      title: unpaidCreated.length === 1 ? 'Fee challan issued' : `${unpaidCreated.length} fee challans issued`,
      body: `${label} is unpaid for ${unpaidSummary(unpaidCreated)}.`,
      path: '/fees',
      moduleKey: 'fee',
      resource: 'fees',
      resourceId: `issued-${year}-${month}-${unpaidCreated[0]._id}`,
      meta: { month, year, count: unpaidCreated.length },
    }));
  }

  return { created: created.length, skipped: skipped.length, repaired };
}

/**
 * Rebuild unpaid monthly/admission vouchers with the given additional charges only.
 * Empty chargeIds clears configured charge lines (tuition / admission / manual stationery remain).
 */
async function applySelectedChargesToFees(feeRecordIds, chargeIds = []) {
  const ids = [...new Set((Array.isArray(feeRecordIds) ? feeRecordIds : []).map(String).filter(Boolean))];
  if (!ids.length) throw new ApiError(400, 'Select at least one fee record');

  const selectedChargeIds = [
    ...new Set((Array.isArray(chargeIds) ? chargeIds : []).map(String).filter(Boolean)),
  ];

  const records = await AcademyFeeRecord.find({
    _id: { $in: ids },
    status: { $in: ['pending', 'overdue'] },
    feeType: { $in: ['monthly', 'admission'] },
  }).populate('studentId');

  if (!records.length) throw new ApiError(404, 'No unpaid fee records found');

  const charges = selectedChargeIds.length ? await listActiveCharges() : [];
  const updated = [];

  for (const record of records) {
    const student = record.studentId;
    if (!student) continue;
    const bill = reviseBillForFeeRecord(student, record, charges, {
      chargeIds: selectedChargeIds,
    });
    if (!bill) continue;

    const amountChanged = Math.abs(roundMoney(bill.amount) - roundMoney(record.amount)) > 0.009;
    const componentsChanged = !componentsEqual(record.components, bill.components);
    if (!amountChanged && !componentsChanged) {
      updated.push(record);
      continue;
    }

    record.amount = bill.amount;
    record.components = bill.components;
    await record.save();
    updated.push(record);
  }

  return updated;
}

async function listUnpaidForChallan(studentId, months) {
  const student = await AcademyStudent.findById(studentId);
  if (!student) throw new ApiError(404, 'Student not found');
  await syncOverdueFees({ studentId });

  // Fold legacy separate stationery rows into monthly/admission challans before print.
  const stationeryOrphans = await AcademyFeeRecord.find({
    studentId,
    feeType: 'stationery',
    status: { $in: ['pending', 'overdue'] },
  }).select('month year');
  for (const orphan of stationeryOrphans) {
    // eslint-disable-next-line no-await-in-loop
    await absorbUnpaidStationeryIntoMonthly(studentId, orphan.month, orphan.year, null);
  }

  let query = AcademyFeeRecord.find({
    studentId,
    status: { $in: ['pending', 'overdue'] },
    feeType: { $in: ['monthly', 'admission'] },
  })
    .sort({ year: 1, month: 1, createdAt: 1 })
    .populate({
      path: 'studentId',
      select: 'studentId studentName fatherName phone classId',
      populate: {
        path: 'classId',
        select: 'className sessionId',
        populate: { path: 'sessionId', select: 'name status' },
      },
    })
    .populate('recordedBy', 'name email');
  const count = Number(months);
  if (Number.isInteger(count) && count > 0) query = query.limit(count);
  return query;
}

async function waiveResyncedOrphans(orphans, host, userId) {
  if (!orphans?.length) return 0;
  const hostLabel = host
    ? `${host.feeType || 'monthly'} challan${host.receiptNumber ? ` ${host.receiptNumber}` : ''}`
    : 'monthly fee challan';
  const note = `Resynced into ${hostLabel} (not deleted)`;
  const ids = orphans.map((row) => row._id);
  await AcademyFeeRecord.updateMany(
    { _id: { $in: ids }, status: { $in: ['pending', 'overdue'] } },
    {
      $set: {
        status: 'waived',
        notes: note,
        ...(userId ? { recordedBy: userId } : {}),
      },
    }
  );
  return ids.length;
}

/**
 * Fold any unpaid legacy stationery rows into the monthly/admission challan for that period.
 * Separate rows are waived (kept for history), not deleted.
 * Returns { host, waived, amount } or null when nothing could be merged.
 */
async function absorbUnpaidStationeryIntoMonthly(studentId, month, year, userId) {
  const orphans = await AcademyFeeRecord.find({
    studentId,
    month,
    year,
    feeType: 'stationery',
    status: { $in: ['pending', 'overdue'] },
  });
  if (!orphans.length) return null;

  const stationeryAmount = roundMoney(
    orphans.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
  );
  if (stationeryAmount <= 0) {
    const waived = await waiveResyncedOrphans(orphans, null, userId);
    return { host: null, waived, amount: 0 };
  }

  let host = await AcademyFeeRecord.findOne({
    studentId,
    month,
    year,
    feeType: 'monthly',
    status: { $in: ['pending', 'overdue'] },
  });
  if (!host) {
    host = await AcademyFeeRecord.findOne({
      studentId,
      month,
      year,
      feeType: 'admission',
      status: { $in: ['pending', 'overdue'] },
    });
  }

  if (!host) {
    const anyMonthly = await AcademyFeeRecord.findOne({
      studentId,
      month,
      year,
      feeType: 'monthly',
    });
    if (anyMonthly) {
      // Monthly exists but is paid/waived — cannot merge without creating a duplicate key.
      return null;
    }

    const student = await AcademyStudent.findById(studentId);
    if (!student || student.status !== 'active') return null;

    const tuitionBill = composeMonthlyComponents(student, month, [], monthlyBillAmount(student), {
      chargeIds: [],
    });
    const components = [
      ...tuitionBill.components,
      { name: 'Stationery', amount: stationeryAmount, kind: 'charge' },
    ];
    const total = totalFromComponents(components);
    if (total <= 0) return null;

    host = await AcademyFeeRecord.create({
      studentId,
      month,
      year,
      amount: total,
      components,
      feeType: 'monthly',
      status: 'pending',
      dueDate: resolveMonthlyDueDate(month, year),
      receiptNumber: receiptNumber(student, month, year, 'monthly'),
      notes: 'Created while resyncing separate stationery challan',
      createdBy: userId,
      recordedBy: userId,
      pendingNoticeAt: new Date(),
    });
  } else {
    const components = seedComponentsIfEmpty(host).filter((line) => !isStationeryLine(line));
    components.push({ name: 'Stationery', amount: stationeryAmount, kind: 'charge' });
    host.amount = totalFromComponents(components);
    host.components = components;
    if (userId) host.recordedBy = userId;
    const orphanNotes = orphans
      .map((row) => String(row.notes || '').trim())
      .filter(Boolean);
    if (orphanNotes.length && !String(host.notes || '').trim()) {
      host.notes = orphanNotes[0];
    }
    await host.save();
  }

  const waived = await waiveResyncedOrphans(orphans, host, userId);
  return { host, waived, amount: stationeryAmount };
}

/**
 * Batch-resync separately created stationery/charge challans into monthly (or admission) challans.
 * Orphan rows are waived and kept — never deleted.
 */
async function resyncSeparateChargeChallans(
  { studentId, classId, month, year, sessionId } = {},
  userId
) {
  const orphanQ = {
    feeType: 'stationery',
    status: { $in: ['pending', 'overdue'] },
  };
  if (month != null && month !== '') orphanQ.month = Number(month);
  if (year != null && year !== '') orphanQ.year = Number(year);

  if (studentId) {
    orphanQ.studentId = studentId;
  } else if (classId || sessionId) {
    const ids = await resolveActiveStudentIds(classId || undefined, sessionId || undefined);
    if (!ids.length) {
      return { groups: 0, merged: 0, skipped: 0, waivedRecords: 0, amountMerged: 0, createdMonthly: 0 };
    }
    orphanQ.studentId = { $in: ids };
  }

  const orphans = await AcademyFeeRecord.find(orphanQ).select('studentId month year').limit(5000);
  const groups = new Map();
  for (const orphan of orphans) {
    const key = `${orphan.studentId}-${orphan.month}-${orphan.year}`;
    if (!groups.has(key)) {
      groups.set(key, {
        studentId: orphan.studentId,
        month: orphan.month,
        year: orphan.year,
      });
    }
  }

  let merged = 0;
  let skipped = 0;
  let waivedRecords = 0;
  let amountMerged = 0;
  let createdMonthly = 0;

  for (const group of groups.values()) {
    const beforeHost = await AcademyFeeRecord.findOne({
      studentId: group.studentId,
      month: group.month,
      year: group.year,
      feeType: { $in: ['monthly', 'admission'] },
      status: { $in: ['pending', 'overdue'] },
    }).select('_id');

    // eslint-disable-next-line no-await-in-loop
    const result = await absorbUnpaidStationeryIntoMonthly(
      group.studentId,
      group.month,
      group.year,
      userId
    );

    if (!result?.host) {
      skipped += 1;
      continue;
    }

    merged += 1;
    waivedRecords += result.waived || 0;
    amountMerged = roundMoney(amountMerged + (result.amount || 0));
    if (!beforeHost && result.host.feeType === 'monthly') createdMonthly += 1;
  }

  return {
    groups: groups.size,
    merged,
    skipped,
    waivedRecords,
    amountMerged,
    createdMonthly,
  };
}

/**
 * Add (or update) stationery on the student's monthly fee challan for that period.
 * Does not create a separate stationery fee record — same pattern as additional charges.
 */
async function addStationeryCharge(studentId, { amount, month, year, notes } = {}, userId) {
  const student = await AcademyStudent.findById(studentId);
  if (!student) throw new ApiError(404, 'Student not found');
  if (student.status !== 'active') {
    throw new ApiError(400, 'Stationery can only be charged for active students');
  }

  const amt = roundMoney(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    throw new ApiError(400, 'Stationery amount must be greater than 0');
  }

  const now = new Date();
  const m = month != null ? Number(month) : now.getMonth() + 1;
  const y = year != null ? Number(year) : now.getFullYear();
  if (!Number.isInteger(m) || m < 1 || m > 12) throw new ApiError(400, 'Invalid month');
  if (!Number.isInteger(y) || y < 2000 || y > 2100) throw new ApiError(400, 'Invalid year');

  const dueDate = resolveMonthlyDueDate(m, y);
  const noteText = String(notes || '').trim() || 'Stationery charge';

  await absorbUnpaidStationeryIntoMonthly(student._id, m, y, userId);

  let record = await AcademyFeeRecord.findOne({
    studentId: student._id,
    month: m,
    year: y,
    feeType: 'monthly',
  });
  if (!record) {
    record = await AcademyFeeRecord.findOne({
      studentId: student._id,
      month: m,
      year: y,
      feeType: 'admission',
      status: { $in: ['pending', 'overdue'] },
    });
  }

  if (record && (record.status === 'paid' || record.status === 'waived')) {
    throw new ApiError(
      400,
      'Fee for this month is already settled. Choose another month to add stationery.'
    );
  }

  if (!record) {
    const tuitionBill = composeMonthlyComponents(student, m, [], monthlyBillAmount(student), {
      chargeIds: [],
    });
    const components = [...tuitionBill.components, { name: 'Stationery', amount: amt, kind: 'charge' }];
    const total = totalFromComponents(components);
    if (total <= 0) throw new ApiError(400, 'Nothing to charge for this month');

    record = await AcademyFeeRecord.create({
      studentId: student._id,
      month: m,
      year: y,
      amount: total,
      components,
      feeType: 'monthly',
      status: 'pending',
      dueDate,
      receiptNumber: receiptNumber(student, m, y, 'monthly'),
      notes: noteText,
      createdBy: userId,
      recordedBy: userId,
      pendingNoticeAt: new Date(),
    });
  } else {
    const components = seedComponentsIfEmpty(record).filter((line) => !isStationeryLine(line));
    components.push({ name: 'Stationery', amount: amt, kind: 'charge' });
    record.amount = totalFromComponents(components);
    record.components = components;
    record.notes = noteText;
    record.recordedBy = userId;
    if (!record.dueDate) record.dueDate = dueDate;
    if (!record.receiptNumber) {
      record.receiptNumber = receiptNumber(student, m, y, record.feeType || 'monthly');
    }
    await record.save();
  }

  // Waive any leftover unpaid stationery rows for this period (keep history).
  const leftovers = await AcademyFeeRecord.find({
    studentId: student._id,
    month: m,
    year: y,
    feeType: 'stationery',
    status: { $in: ['pending', 'overdue'] },
  });
  await waiveResyncedOrphans(leftovers, record, userId);

  await record.populate({
    path: 'studentId',
    select: 'studentId studentName fatherName phone classId',
    populate: { path: 'classId', select: 'className' },
  });
  return record;
}

async function recordPayment(feeRecordId, { paymentMethod, notes, paidAt, paymentSlipNumber }, userId, slipFile) {
  const existing = await AcademyFeeRecord.findById(feeRecordId).populate('studentId');
  if (!existing) throw new ApiError(404, 'Fee record not found');
  if (existing.status === 'paid') throw new ApiError(400, 'Fee already paid');

  const nextReceipt =
    existing.receiptNumber ||
    (existing.studentId
      ? receiptNumber(existing.studentId, existing.month, existing.year, existing.feeType)
      : undefined);
  const paymentSlip = savePaymentSlip(slipFile);
  const slipNumber = String(paymentSlipNumber || '').trim();

  // Atomic: only one concurrent payer can flip pending/overdue → paid
  const record = await AcademyFeeRecord.findOneAndUpdate(
    {
      _id: feeRecordId,
      status: { $in: ['pending', 'overdue'] },
    },
    {
      $set: {
        status: 'paid',
        paidAt: resolvePaidAt(paidAt),
        paymentMethod: paymentMethod || 'cash',
        notes: notes || '',
        recordedBy: userId,
        ...(nextReceipt ? { receiptNumber: nextReceipt } : {}),
        ...(paymentSlip ? { paymentSlip } : {}),
        ...(slipNumber ? { paymentSlipNumber: slipNumber } : {}),
      },
    },
    { new: true }
  ).populate({
    path: 'studentId',
    select: 'studentId studentName fatherName phone classId sectionId status',
  });

  if (!record) {
    const again = await AcademyFeeRecord.findById(feeRecordId).select('status').lean();
    if (again?.status === 'paid') throw new ApiError(400, 'Fee already paid');
    throw new ApiError(409, 'Could not record payment — please retry');
  }

  const student = record.studentId;
  const needsSectionAssignment =
    record.feeType === 'admission' &&
    student &&
    student.status === 'pending_fee' &&
    !student.sectionId;

  return { record, needsSectionAssignment: Boolean(needsSectionAssignment) };
}

async function recordPayments(feeRecordIds, payload, userId, slipFile) {
  const ids = [...new Set((feeRecordIds || []).map(String))];
  const records = await AcademyFeeRecord.find({ _id: { $in: ids } }).sort({ year: 1, month: 1 });
  if (records.length !== ids.length) throw new ApiError(404, 'One or more fee records were not found');
  const students = new Set(records.map((r) => String(r.studentId)));
  if (students.size !== 1) throw new ApiError(400, 'Pay fees for one student at a time');
  if (records.some((r) => r.status === 'paid')) throw new ApiError(400, 'One of the selected fees is already paid');

  const paidAt = resolvePaidAt(payload.paidAt);
  const paymentSlip = savePaymentSlip(slipFile);
  const slipNumber = String(payload.paymentSlipNumber || '').trim();
  const paid = [];
  for (const record of records) {
    // eslint-disable-next-line no-await-in-loop
    const updated = await AcademyFeeRecord.findOneAndUpdate(
      {
        _id: record._id,
        status: { $in: ['pending', 'overdue'] },
      },
      {
        $set: {
          status: 'paid',
          paidAt,
          paymentMethod: payload.paymentMethod || 'cash',
          notes: payload.notes || '',
          recordedBy: userId,
          receiptNumber:
            record.receiptNumber ||
            receiptNumber(record.studentId, record.month, record.year, record.feeType),
          ...(paymentSlip ? { paymentSlip } : {}),
          ...(slipNumber ? { paymentSlipNumber: slipNumber } : {}),
        },
      },
      { new: true }
    );
    if (!updated) {
      throw new ApiError(400, 'One of the selected fees is already paid');
    }
    paid.push(updated);
  }

  const studentId = records[0].studentId;
  const student = await AcademyStudent.findById(studentId).select('status sectionId');
  const paidAdmission = paid.some((r) => r.feeType === 'admission');
  const needsSectionAssignment =
    paidAdmission && student && student.status === 'pending_fee' && !student.sectionId;

  return {
    paid: paid.length,
    total: paid.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
    records: paid,
    needsSectionAssignment: Boolean(needsSectionAssignment),
    studentId: studentId ? String(studentId) : undefined,
  };
}

function unpaidStatusFromDueDate(dueDate) {
  if (!dueDate) return 'pending';
  const startOfToday = startOfSchoolToday();
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return 'pending';
  return due < startOfToday ? 'overdue' : 'pending';
}

function appendFeeNote(existing, line) {
  const prev = String(existing || '').trim();
  return [prev, line].filter(Boolean).join(' · ');
}

/**
 * Undo a recorded payment (mistake) or mark a refund.
 * Clears payment fields and restores pending/overdue from dueDate.
 * kind: 'reverse' | 'refund'
 */
async function reversePayment(id, { reason, kind = 'reverse' } = {}, userId) {
  const record = await AcademyFeeRecord.findById(id);
  if (!record) throw new ApiError(404, 'Fee record not found');
  if (record.status !== 'paid') {
    throw new ApiError(400, 'Only paid fees can be reversed or refunded');
  }

  const why = String(reason || '').trim();
  if (!why) throw new ApiError(400, 'Reason is required');
  if (why.length > 500) throw new ApiError(400, 'Reason must be 500 characters or fewer');

  const action = kind === 'refund' ? 'refund' : 'reverse';
  const label = action === 'refund' ? 'Refunded' : 'Payment reversed';
  const when = todayYmd();
  const prevPaid = record.paidAt ? formatDateInTz(record.paidAt) : '—';
  const noteLine = `${label} ${when} (was paid ${prevPaid}; ₨${Number(record.amount || 0).toLocaleString()}): ${why}`;

  const updated = await AcademyFeeRecord.findOneAndUpdate(
    { _id: record._id, status: 'paid' },
    {
      $set: {
        status: unpaidStatusFromDueDate(record.dueDate),
        paymentMethod: 'cash',
        notes: appendFeeNote(record.notes, noteLine),
        ...(userId && !record.createdBy ? { createdBy: userId } : {}),
      },
      $unset: {
        paidAt: 1,
        paymentSlip: 1,
        paymentSlipNumber: 1,
        recordedBy: 1,
      },
    },
    { new: true }
  );
  if (!updated) throw new ApiError(409, 'Payment changed — please retry');
  return getFeeRecordById(updated._id);
}

/**
 * Move a mistaken payment from one student's voucher to another's
 * matching month / year / feeType unpaid voucher.
 */
async function transferPayment(id, { targetStudentId, targetFeeRecordId, reason } = {}, userId) {
  const source = await AcademyFeeRecord.findById(id);
  if (!source) throw new ApiError(404, 'Fee record not found');
  if (source.status !== 'paid') {
    throw new ApiError(400, 'Only paid fees can be transferred');
  }

  const why = String(reason || '').trim();
  if (!why) throw new ApiError(400, 'Reason is required');
  if (why.length > 500) throw new ApiError(400, 'Reason must be 500 characters or fewer');

  const targetStudent = await AcademyStudent.findById(targetStudentId).select(
    '_id studentId studentName status sectionId'
  );
  if (!targetStudent) throw new ApiError(404, 'Target student not found');
  if (String(targetStudent._id) === String(source.studentId)) {
    throw new ApiError(400, 'Choose a different student to transfer to');
  }

  let target;
  if (targetFeeRecordId) {
    target = await AcademyFeeRecord.findById(targetFeeRecordId);
    if (!target) throw new ApiError(404, 'Target fee record not found');
    if (String(target.studentId) !== String(targetStudent._id)) {
      throw new ApiError(400, 'Target fee does not belong to the selected student');
    }
  } else {
    target = await AcademyFeeRecord.findOne({
      studentId: targetStudent._id,
      month: source.month,
      year: source.year,
      feeType: source.feeType,
    });
    if (!target) {
      throw new ApiError(
        404,
        'Target student has no matching fee voucher for this period and type'
      );
    }
  }

  if (target.status === 'paid') {
    throw new ApiError(400, 'Target fee is already paid');
  }
  if (target.status === 'waived') {
    throw new ApiError(400, 'Target fee is waived and cannot receive a transfer');
  }
  if (!['pending', 'overdue'].includes(target.status)) {
    throw new ApiError(400, 'Target fee must be pending or overdue');
  }

  const when = todayYmd();
  const paidAt = source.paidAt || new Date();
  const paymentMethod = source.paymentMethod || 'cash';
  const paymentSlip = source.paymentSlip || '';
  const paymentSlipNumber = source.paymentSlipNumber || '';
  const receipt =
    target.receiptNumber ||
    receiptNumber(target.studentId, target.month, target.year, target.feeType);

  const sourceNote = `Payment transferred to student ${targetStudent.studentId || targetStudent._id} on ${when}: ${why}`;
  const targetNote = `Payment transferred from fee ${source._id} on ${when}: ${why}`;

  // Snapshot for rollback if the target update fails.
  const sourceSnapshot = {
    status: source.status,
    paidAt: source.paidAt,
    paymentMethod: source.paymentMethod,
    paymentSlip: source.paymentSlip,
    paymentSlipNumber: source.paymentSlipNumber,
    recordedBy: source.recordedBy,
    notes: source.notes,
  };

  const cleared = await AcademyFeeRecord.findOneAndUpdate(
    { _id: source._id, status: 'paid' },
    {
      $set: {
        status: unpaidStatusFromDueDate(source.dueDate),
        paymentMethod: 'cash',
        notes: appendFeeNote(source.notes, sourceNote),
      },
      $unset: {
        paidAt: 1,
        paymentSlip: 1,
        paymentSlipNumber: 1,
        recordedBy: 1,
      },
    },
    { new: true }
  );
  if (!cleared) throw new ApiError(409, 'Source payment changed — please retry');

  const paid = await AcademyFeeRecord.findOneAndUpdate(
    {
      _id: target._id,
      status: { $in: ['pending', 'overdue'] },
    },
    {
      $set: {
        status: 'paid',
        paidAt,
        paymentMethod,
        notes: appendFeeNote(target.notes, targetNote),
        recordedBy: userId,
        receiptNumber: receipt,
        ...(paymentSlip ? { paymentSlip } : {}),
        ...(paymentSlipNumber ? { paymentSlipNumber } : {}),
      },
    },
    { new: true }
  );

  if (!paid) {
    await AcademyFeeRecord.findByIdAndUpdate(source._id, {
      $set: {
        status: sourceSnapshot.status,
        paidAt: sourceSnapshot.paidAt,
        paymentMethod: sourceSnapshot.paymentMethod || 'cash',
        paymentSlip: sourceSnapshot.paymentSlip,
        paymentSlipNumber: sourceSnapshot.paymentSlipNumber,
        recordedBy: sourceSnapshot.recordedBy,
        notes: sourceSnapshot.notes,
      },
    });
    throw new ApiError(409, 'Target fee was paid by someone else — please retry');
  }

  const [from, to] = await Promise.all([
    getFeeRecordById(source._id),
    getFeeRecordById(target._id),
  ]);

  const needsSectionAssignment =
    to.feeType === 'admission' &&
    targetStudent.status === 'pending_fee' &&
    !targetStudent.sectionId;

  return {
    from,
    to,
    needsSectionAssignment: Boolean(needsSectionAssignment),
    studentId: String(targetStudent._id),
  };
}

async function getStudentFeeHistory(studentId) {
  const student = await AcademyStudent.findById(studentId);
  if (!student) throw new ApiError(404, 'Student not found');
  await syncOverdueFees({ studentId });
  const records = await AcademyFeeRecord.find({ studentId }).sort({ year: -1, month: -1 });
  return { student, records };
}

async function getFeeSummary({
  month,
  year,
  classId,
  sectionId,
  studentId,
  studentIds,
  sessionId,
  dateFrom,
  dateTo,
  periodFrom,
  periodTo,
}) {
  await syncOverdueFees({ month, year, classId, sectionId, studentId, studentIds, sessionId });
  // dateFrom/dateTo = paid date (Paid tab); periodFrom/periodTo = billing month (other tabs).
  const q = await buildFeeQuery({
    month,
    year,
    classId,
    sectionId,
    studentId,
    studentIds,
    sessionId,
    dateFrom,
    dateTo,
    periodFrom,
    periodTo,
  });
  const records = await AcademyFeeRecord.find(q).select('amount status studentId month year feeType dueDate').lean();

  // Paid history stays for inactive/suspended; unpaid KPIs are active students only.
  const scopedStudentIds = [
    ...new Set(records.map((r) => String(r.studentId)).filter(Boolean)),
  ];
  const activeIdSet = new Set(
    scopedStudentIds.length
      ? (
        await AcademyStudent.find({
          _id: { $in: scopedStudentIds.map((id) => new mongoose.Types.ObjectId(id)) },
          status: 'active',
        })
          .select('_id')
          .lean()
      ).map((s) => String(s._id))
      : []
  );
  // Explicit single-student scope (parent): treat as visible regardless of status.
  if (studentId) activeIdSet.add(String(studentId));

  const byStatus = { pending: 0, paid: 0, overdue: 0, waived: 0 };
  let totalPaid = 0;
  let totalPending = 0;
  let oldestPending = null;
  let recordsCount = 0;
  /** Paid / outstanding split by fee type (tuition = monthly). Same rules as the totals. */
  const byFeeType = {
    monthly: { paid: 0, pending: 0, paidCount: 0, pendingCount: 0 },
    admission: { paid: 0, pending: 0, paidCount: 0, pendingCount: 0 },
    stationery: { paid: 0, pending: 0, paidCount: 0, pendingCount: 0 },
  };

  records.forEach((r) => {
    const isPaid = r.status === 'paid';
    const isActiveStudent = activeIdSet.has(String(r.studentId));
    if (!isPaid && !isActiveStudent) return;

    const typeBucket = byFeeType[r.feeType || 'monthly'];
    recordsCount += 1;
    if (byStatus[r.status] != null) byStatus[r.status] += 1;
    if (isPaid) {
      totalPaid += r.amount;
      if (typeBucket) {
        typeBucket.paid += Number(r.amount) || 0;
        typeBucket.paidCount += 1;
      }
    }
    if (isActiveStudent && (r.status === 'pending' || r.status === 'overdue')) {
      if (typeBucket) {
        typeBucket.pending += Number(r.amount) || 0;
        typeBucket.pendingCount += 1;
      }
      totalPending += r.amount;
      const key = (Number(r.year) || 0) * 12 + (Number(r.month) || 0);
      if (!oldestPending || key < oldestPending.key) {
        oldestPending = {
          key,
          month: Number(r.month) || null,
          year: Number(r.year) || null,
          feeType: r.feeType || 'monthly',
          dueDate: r.dueDate || null,
        };
      }
    }
  });

  let activeStudents = 0;
  if (studentId) {
    activeStudents = await AcademyStudent.countDocuments({ _id: studentId, status: 'active' });
  } else if (Array.isArray(studentIds)) {
    activeStudents = studentIds.length
      ? await AcademyStudent.countDocuments({ _id: { $in: studentIds }, status: 'active' })
      : 0;
  } else {
    const studentQ = { status: 'active' };
    if (classId) studentQ.classId = classId;
    if (sectionId) studentQ.sectionId = sectionId;
    if (!classId && !sectionId && sessionId) {
      const classes = await AcademyClass.find({ sessionId }).select('_id');
      studentQ.classId = { $in: classes.map((c) => c._id) };
    }
    activeStudents = await AcademyStudent.countDocuments(studentQ);
  }

  // Previous calendar month comparison (same class/student/session filters).
  let previous = null;
  let trends = { paid: [], pending: [], records: [] };
  const hasPeriod = month && year;
  if (hasPeriod) {
    const m = Number(month);
    const y = Number(year);
    const prevMonth = m === 1 ? 12 : m - 1;
    const prevYear = m === 1 ? y - 1 : y;
    const prevQ = await buildFeeQuery({
      month: prevMonth,
      year: prevYear,
      classId,
      sectionId,
      studentId,
      studentIds,
      sessionId,
    });
    const prevRecords = await AcademyFeeRecord.find(prevQ)
      .select('amount status studentId')
      .lean();
    const prevStudentIds = [...new Set(prevRecords.map((r) => String(r.studentId)).filter(Boolean))];
    const prevActive = new Set(
      prevStudentIds.length
        ? (
          await AcademyStudent.find({
            _id: { $in: prevStudentIds.map((id) => new mongoose.Types.ObjectId(id)) },
            status: 'active',
          })
            .select('_id')
            .lean()
        ).map((s) => String(s._id))
        : []
    );
    if (studentId) prevActive.add(String(studentId));
    let prevPaid = 0;
    let prevPending = 0;
    let prevCount = 0;
    prevRecords.forEach((r) => {
      const isPaid = r.status === 'paid';
      const isActiveStudent = prevActive.has(String(r.studentId));
      if (!isPaid && !isActiveStudent) return;
      prevCount += 1;
      if (isPaid) prevPaid += r.amount;
      if (isActiveStudent && (r.status === 'pending' || r.status === 'overdue')) {
        prevPending += r.amount;
      }
    });
    previous = {
      month: prevMonth,
      year: prevYear,
      totalPaid: prevPaid,
      totalPending: prevPending,
      recordsCount: prevCount,
    };

    // Last 6 months sparkline points ending at selected month.
    const paidSeries = [];
    const pendingSeries = [];
    const recordsSeries = [];
    const windows = [];
    for (let i = 5; i >= 0; i -= 1) {
      let mm = m - i;
      let yy = y;
      while (mm <= 0) {
        mm += 12;
        yy -= 1;
      }
      windows.push({ month: mm, year: yy });
    }
    const windowRows = await Promise.all(
      windows.map(async (w) => {
        const tq = await buildFeeQuery({
          month: w.month,
          year: w.year,
          classId,
          sectionId,
          studentId,
          studentIds,
          sessionId,
        });
        return AcademyFeeRecord.find(tq).select('amount status studentId').lean();
      })
    );
    const trendStudentIds = [
      ...new Set(windowRows.flat().map((r) => String(r.studentId)).filter(Boolean)),
    ];
    const trendActive = new Set(
      trendStudentIds.length
        ? (
          await AcademyStudent.find({
            _id: { $in: trendStudentIds.map((id) => new mongoose.Types.ObjectId(id)) },
            status: 'active',
          })
            .select('_id')
            .lean()
        ).map((s) => String(s._id))
        : []
    );
    if (studentId) trendActive.add(String(studentId));
    windowRows.forEach((rows) => {
      let p = 0;
      let u = 0;
      let count = 0;
      rows.forEach((r) => {
        const isPaid = r.status === 'paid';
        const isActiveStudent = trendActive.has(String(r.studentId));
        if (!isPaid && !isActiveStudent) return;
        count += 1;
        if (isPaid) p += r.amount;
        if (isActiveStudent && (r.status === 'pending' || r.status === 'overdue')) {
          u += r.amount;
        }
      });
      paidSeries.push(p);
      pendingSeries.push(u);
      recordsSeries.push(count);
    });
    trends = { paid: paidSeries, pending: pendingSeries, records: recordsSeries };
  }

  let oldestPendingAgeMonths = null;
  if (oldestPending?.year && oldestPending?.month) {
    const now = new Date();
    const cur = now.getFullYear() * 12 + (now.getMonth() + 1);
    const then = oldestPending.year * 12 + oldestPending.month;
    oldestPendingAgeMonths = Math.max(0, cur - then);
  }

  return {
    recordsCount,
    totalPaid,
    totalPending,
    totalAmount: totalPaid + totalPending,
    byStatus,
    byFeeType,
    activeStudents,
    previous,
    trends,
    oldestPending: oldestPending
      ? {
        month: oldestPending.month,
        year: oldestPending.year,
        feeType: oldestPending.feeType,
        ageMonths: oldestPendingAgeMonths,
      }
      : null,
  };
}

/** Students with at least one pending or overdue fee voucher. */
async function listFeeDefaulters({
  page = 1,
  limit = 20,
  classId,
  month,
  year,
  search,
  sessionId,
  periodFrom,
  periodTo,
}) {
  await syncOverdueFees({ classId, month, year, sessionId });

  let studentIds;
  if (classId || sessionId) {
    studentIds = await resolveActiveStudentIds(classId, sessionId);
    if (!studentIds.length) {
      const perPage = Math.min(100, Math.max(1, limit));
      return {
        items: [],
        pagination: { page: 1, limit: perPage, total: 0, pages: 1 },
      };
    }
  }

  const feeMatch = buildDefaulterFeeMatch({ classId, month, year, studentIds, periodFrom, periodTo });
  const perPage = Math.min(100, Math.max(1, limit));
  const skip = (Math.max(1, page) - 1) * perPage;

  const pipeline = buildDefaultersPipeline({ feeMatch, search });
  // Roster order: ascending roll number within the defaulter set.
  pipeline.push({
    $sort: {
      'student.rollNumber': 1,
      'student.studentName': 1,
      oldestDueDate: 1,
    },
  });
  pipeline.push({
    $facet: {
      metadata: [{ $count: 'total' }],
      items: [
        { $skip: skip },
        { $limit: perPage },
        {
          $project: {
            _id: 1,
            totalDue: 1,
            unpaidCount: 1,
            overdueCount: 1,
            pendingCount: 1,
            oldestDueDate: 1,
            className: 1,
            sectionName: 1,
            student: {
              _id: '$student._id',
              studentId: '$student.studentId',
              registrationNumber: '$student.registrationNumber',
              rollNumber: '$student.rollNumber',
              studentName: '$student.studentName',
              fatherName: '$student.fatherName',
              phone: '$student.phone',
              classId: '$student.classId',
              sectionId: '$student.sectionId',
            },
          },
        },
      ],
    },
  });

  const [result] = await AcademyFeeRecord.aggregate(pipeline);
  const total = result?.metadata?.[0]?.total ?? 0;
  const items = (result?.items || []).map(mapDefaulterRow);

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

async function getDefaultersSummary({ classId, month, year, sessionId, periodFrom, periodTo }) {
  await syncOverdueFees({ classId, month, year, sessionId });

  let studentIds;
  if (classId || sessionId) {
    studentIds = await resolveActiveStudentIds(classId, sessionId);
    if (!studentIds.length) {
      return {
        defaulterCount: 0,
        totalOutstanding: 0,
        totalUnpaidVouchers: 0,
        overdueVouchers: 0,
      };
    }
  }

  const feeMatch = buildDefaulterFeeMatch({ classId, month, year, studentIds, periodFrom, periodTo });
  const pipeline = buildDefaultersPipeline({ feeMatch });
  pipeline.push({
    $group: {
      _id: null,
      defaulterCount: { $sum: 1 },
      totalOutstanding: { $sum: '$totalDue' },
      totalUnpaidVouchers: { $sum: '$unpaidCount' },
      overdueVouchers: { $sum: '$overdueCount' },
    },
  });

  const [row] = await AcademyFeeRecord.aggregate(pipeline);
  return {
    defaulterCount: row?.defaulterCount ?? 0,
    totalOutstanding: row?.totalOutstanding ?? 0,
    totalUnpaidVouchers: row?.totalUnpaidVouchers ?? 0,
    overdueVouchers: row?.overdueVouchers ?? 0,
  };
}

function defaultersToCsv(items) {
  const header = [
    'Roll #',
    'Student Name',
    'Father Name',
    'Class',
    'Section',
    'Contact',
    'Total Due (PKR)',
    'Unpaid Vouchers',
    'Overdue Vouchers',
    'Oldest Due Date',
    'Days Overdue',
  ];
  const rows = items.map((d) => [
    d.student?.rollNumber || d.student?.studentId || '',
    d.student?.studentName ?? '',
    d.student?.fatherName ?? '',
    d.className ?? '',
    d.sectionName ?? '',
    d.student?.phone ?? '',
    d.totalDue ?? 0,
    d.unpaidCount ?? 0,
    d.overdueCount ?? 0,
    d.oldestDueDate ? formatDateInTz(d.oldestDueDate) : '',
    d.daysOverdue ?? 0,
  ]);
  return [header, ...rows].map((r) => r.map(escapeCsvCell).join(',')).join('\n');
}

async function exportFeeDefaulters({ classId, month, year, search, sessionId, periodFrom, periodTo }) {
  const { items } = await listFeeDefaulters({
    page: 1,
    limit: 10000,
    classId,
    month,
    year,
    search,
    sessionId,
    periodFrom,
    periodTo,
  });
  return defaultersToCsv(items);
}

function monthKey(record) {
  return `${record.year}-${String(record.month).padStart(2, '0')}`;
}

/**
 * One row per student (all unpaid challans rolled up). Same heads as Paid Fee Summary,
 * without Receipt # / Paid Date. Month lists every unpaid period for that student.
 * S.No | Challan No. | Roll # | Student | Class | Section | Month | Concession |
 * [Admission] | Tuition | Stationery | <each additional charge> | Total Due
 */
function buildDefaulterReport(records, categoryNames = {}) {
  const sorted = sortUnpaidForSummary(records);
  const chargeCols = new Map();
  let hasAdmission = false;

  const headKey = (head) => {
    if (/^Admission/i.test(head)) return 'admission';
    if (/^Tuition/i.test(head)) return 'tuition';
    if (/^station[ae]r/i.test(head)) return 'stationery';
    const key = `charge_${head.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    if (!chargeCols.has(key)) chargeCols.set(key, head);
    return key;
  };

  const byStudent = new Map();
  for (const record of sorted) {
    const student = record.studentId;
    if (!student?._id) continue;
    const id = String(student._id);
    if (!byStudent.has(id)) {
      byStudent.set(id, {
        student,
        challans: [],
        periods: [],
        periodKeys: new Set(),
        admission: 0,
        tuition: 0,
        stationery: 0,
        charges: {},
        totalDue: 0,
      });
    }
    const entry = byStudent.get(id);
    const challan = String(record.receiptNumber || '').trim();
    if (challan && !entry.challans.includes(challan)) entry.challans.push(challan);

    const periodLabel = paidFeePeriodLabel(record);
    const periodKey =
      record.feeType === 'admission'
        ? 'admission'
        : `${Number(record.year) || 0}-${String(Number(record.month) || 0).padStart(2, '0')}`;
    if (periodLabel && !entry.periodKeys.has(periodKey)) {
      entry.periodKeys.add(periodKey);
      entry.periods.push({ key: periodKey, label: periodLabel });
    }

    entry.totalDue = roundMoney(entry.totalDue + (Number(record.amount) || 0));
    for (const { head, amount } of paidFeeHeadLines(record)) {
      const key = headKey(head);
      if (key === 'admission') {
        hasAdmission = true;
        entry.admission = roundMoney(entry.admission + amount);
      } else if (key === 'tuition') {
        entry.tuition = roundMoney(entry.tuition + amount);
      } else if (key === 'stationery') {
        entry.stationery = roundMoney(entry.stationery + amount);
      } else {
        entry.charges[key] = roundMoney((entry.charges[key] || 0) + amount);
      }
    }
  }

  const students = [...byStudent.values()].sort((a, b) => {
    const sa = a.student;
    const sb = b.student;
    const byClass = String(sa?.classId?.className || '').localeCompare(
      String(sb?.classId?.className || '')
    );
    if (byClass) return byClass;
    const bySection = String(sa?.sectionId?.sectionName || '').localeCompare(
      String(sb?.sectionId?.sectionName || '')
    );
    if (bySection) return bySection;
    return compareStudentsByRollAsc(
      { rollNumber: sa?.rollNumber || sa?.studentId, studentName: sa?.studentName },
      { rollNumber: sb?.rollNumber || sb?.studentId, studentName: sb?.studentName }
    );
  });

  const chargeKeys = [...chargeCols.keys()].sort((a, b) =>
    chargeCols.get(a).localeCompare(chargeCols.get(b))
  );
  const amountKeys = [
    ...(hasAdmission ? ['admission'] : []),
    'tuition',
    'stationery',
    ...chargeKeys,
  ];

  const rows = students.map((entry, index) => {
    const student = entry.student;
    entry.periods.sort((a, b) => String(a.key).localeCompare(String(b.key)));
    const row = {
      serial: index + 1,
      challanNo: entry.challans.join(', '),
      rollNo: student?.rollNumber || student?.studentId || student?.registrationNumber || '',
      studentName: student?.studentName || '',
      className: student?.classId?.className || '',
      sectionName: student?.sectionId?.sectionName || '',
      period: entry.periods.map((p) => p.label).join(', '),
      concession: summaryConcessionLabel(student, categoryNames),
      admission: entry.admission,
      tuition: entry.tuition,
      stationery: entry.stationery,
      totalDue: entry.totalDue,
    };
    for (const key of chargeKeys) row[key] = entry.charges[key] || 0;
    for (const key of amountKeys) row[key] = Number(row[key]) || 0;
    return row;
  });

  if (rows.length) {
    const total = {
      _isTotal: true,
      serial: '',
      challanNo: '',
      rollNo: '',
      studentName: 'Total',
      className: '',
      sectionName: '',
      period: '',
      concession: '',
      totalDue: roundMoney(rows.reduce((s, r) => s + r.totalDue, 0)),
    };
    for (const key of amountKeys) {
      total[key] = roundMoney(rows.reduce((s, r) => s + (Number(r[key]) || 0), 0));
    }
    rows.push(total);
  }

  // Wider Month column — may list several unpaid periods per student.
  const fixedPdf = 26 + 56 + 48 + 78 + 32 + 34 + 88 + 72 + 56;
  const amountPdf = Math.max(38, Math.min(58, Math.floor((770 - fixedPdf) / Math.max(amountKeys.length, 1))));
  const money = (key, header) => ({
    key,
    header,
    excelWidth: 12,
    pdfWidth: amountPdf,
    align: 'right',
    numFmt: '#,##0',
    wrap: true,
  });
  const columns = [
    { key: 'serial', header: 'S.No.', excelWidth: 6, pdfWidth: 26, align: 'center' },
    { key: 'challanNo', header: 'Challan No.', excelWidth: 16, pdfWidth: 56, align: 'center', wrap: true },
    { key: 'rollNo', header: 'Student Roll #', excelWidth: 12, pdfWidth: 48, align: 'center', wrap: true },
    { key: 'studentName', header: 'Student Name', excelWidth: 18, pdfWidth: 78, wrap: true },
    { key: 'className', header: 'Class', excelWidth: 8, pdfWidth: 32, align: 'center' },
    { key: 'sectionName', header: 'Section', excelWidth: 9, pdfWidth: 34, align: 'center' },
    { key: 'period', header: 'Month', excelWidth: 26, pdfWidth: 88, wrap: true },
    { key: 'concession', header: 'Concession', excelWidth: 26, pdfWidth: 72, wrap: true },
    ...(hasAdmission ? [money('admission', 'Admission Fee')] : []),
    money('tuition', 'Tuition Fee'),
    money('stationery', 'Stationery'),
    ...chargeKeys.map((key) => money(key, chargeCols.get(key))),
    { key: 'totalDue', header: 'Total Due', excelWidth: 13, pdfWidth: 56, align: 'right', numFmt: '#,##0' },
  ];
  return { columns, rows };
}

async function loadUnpaidFees({ classId, month, year, search, sessionId, periodFrom, periodTo }) {
  await syncOverdueFees({ classId, month, year, sessionId });

  let studentIds;
  if (classId || sessionId) {
    studentIds = await resolveActiveStudentIds(classId, sessionId);
    if (!studentIds.length) return [];
  }

  const feeMatch = buildDefaulterFeeMatch({ classId, month, year, studentIds, periodFrom, periodTo });
  let records = await AcademyFeeRecord.find(feeMatch)
    .populate({
      path: 'studentId',
      // Section + relief fields match the Paid Fee Summary columns.
      select:
        'studentId registrationNumber rollNumber studentName fatherName phone classId sectionId status feeReliefType concessionCategory concessionPercent exemptionRemarks monthlyFee monthlyFeeDiscount',
      populate: [
        { path: 'classId', select: 'className' },
        { path: 'sectionId', select: 'sectionName' },
      ],
    })
    .sort({ year: 1, month: 1 })
    .lean();

  records = records.filter((r) => r.studentId && r.studentId.status === 'active');
  const term = String(search || '').trim().toLowerCase();
  if (term) {
    records = records.filter((r) => {
      const student = r.studentId;
      return [
        student.studentName,
        student.fatherName,
        student.phone,
        student.studentId,
        student.registrationNumber,
        student.rollNumber,
        student.classId?.className,
        student.sectionId?.sectionName,
      ].some((value) => String(value || '').toLowerCase().includes(term));
    });
  }
  return records;
}

/** Class → section → roll → period — roster order for unpaid challans. */
function sortUnpaidForSummary(records) {
  return [...records].sort((a, b) => {
    const sa = a.studentId;
    const sb = b.studentId;
    const byClass = String(sa?.classId?.className || '').localeCompare(
      String(sb?.classId?.className || '')
    );
    if (byClass) return byClass;
    const bySection = String(sa?.sectionId?.sectionName || '').localeCompare(
      String(sb?.sectionId?.sectionName || '')
    );
    if (bySection) return bySection;
    const byRoll = compareStudentsByRollAsc(
      { rollNumber: sa?.rollNumber || sa?.studentId, studentName: sa?.studentName },
      { rollNumber: sb?.rollNumber || sb?.studentId, studentName: sb?.studentName }
    );
    if (byRoll) return byRoll;
    return (
      (Number(a.year) || 0) - (Number(b.year) || 0) ||
      (Number(a.month) || 0) - (Number(b.month) || 0) ||
      String(a.receiptNumber || '').localeCompare(String(b.receiptNumber || ''))
    );
  });
}

function paidFeePeriodLabel(record) {
  if (record.feeType === 'admission') return 'Admission';
  const name = MONTH_NAMES[(Number(record.month) || 1) - 1] || '';
  return `${name} ${record.year || ''}`.trim();
}

function paidFeeTypeLabel(feeType) {
  if (feeType === 'admission') return 'Admission';
  if (feeType === 'stationery') return 'Stationery';
  return 'Monthly';
}

function paymentMethodExportLabel(method) {
  const map = {
    cash: 'Cash',
    bank_transfer: 'Bank transfer',
    online: 'Online',
    other: 'Other',
  };
  return map[method] || method || '';
}

async function loadPaidFees({ classId, month, year, search, sessionId, feeType, dateFrom, dateTo }) {
  const base = await buildFeeQuery({
    classId,
    month,
    year,
    sessionId,
    status: 'paid',
    feeType,
    dateFrom,
    dateTo,
  });
  const q = await applyFeeRecordSearch(base, search);
  // Keep paid history for inactive / suspended students (collection lists exclude them separately).
  const records = await AcademyFeeRecord.find(q)
    .populate({
      path: 'studentId',
      // Section + relief fields are needed by the Fee Summary (Section / Concession columns).
      select:
        'studentId rollNumber registrationNumber studentName fatherName phone classId sectionId status feeReliefType concessionCategory concessionPercent exemptionRemarks monthlyFee monthlyFeeDiscount',
      populate: [
        { path: 'classId', select: 'className' },
        { path: 'sectionId', select: 'sectionName' },
      ],
    })
    .sort({ paidAt: -1, year: -1, month: -1 })
    .lean();
  return records.filter((r) => r.studentId);
}

/** Split paid voucher into tuition/admission base vs additional charges (incl. stationery). */
function splitPaidFeeAmounts(record) {
  const total = roundMoney(Number(record.amount) || 0);
  const comps = Array.isArray(record.components) ? record.components : [];
  if (!comps.length) {
    if (record.feeType === 'stationery') {
      return { tuition: 0, additionalCharges: total };
    }
    return { tuition: total, additionalCharges: 0 };
  }

  let tuition = 0;
  let additionalCharges = 0;
  for (const line of comps) {
    const amt = roundMoney(Number(line?.amount) || 0);
    if (amt <= 0) continue;
    if (line.kind === 'charge') additionalCharges += amt;
    else tuition += amt;
  }
  tuition = roundMoney(tuition);
  additionalCharges = roundMoney(additionalCharges);

  // Keep column totals aligned with voucher amount when a remaining-balance credit was applied.
  const componentsTotal = roundMoney(tuition + additionalCharges);
  if (componentsTotal > 0 && Math.abs(componentsTotal - total) > 0.009) {
    const ratio = total / componentsTotal;
    tuition = roundMoney(tuition * ratio);
    additionalCharges = roundMoney(total - tuition);
  } else if (componentsTotal <= 0) {
    return record.feeType === 'stationery'
      ? { tuition: 0, additionalCharges: total }
      : { tuition: total, additionalCharges: 0 };
  }

  return { tuition, additionalCharges };
}

/** Ascending by payment slip number (numeric-aware); records without a slip go last. */
const slipCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
function sortByPaymentSlip(records) {
  return [...records].sort((a, b) => {
    const sa = String(a.paymentSlipNumber || '').trim();
    const sb = String(b.paymentSlipNumber || '').trim();
    if (sa && !sb) return -1;
    if (!sa && sb) return 1;
    return (
      (sa && sb ? slipCollator.compare(sa, sb) : 0) ||
      new Date(a.paidAt || 0).getTime() - new Date(b.paidAt || 0).getTime()
    );
  });
}

function buildPaidCollectionReport(records) {
  const rows = sortByPaymentSlip(records).map((record, index) => {
    const student = record.studentId;
    const { tuition, additionalCharges } = splitPaidFeeAmounts(record);
    return {
      serial: index + 1,
      receiptNumber: record.receiptNumber || '',
      studentId: student?.rollNumber || student?.studentId || student?.registrationNumber || '',
      studentName: student?.studentName || '',
      fatherName: student?.fatherName || '',
      className: student?.classId?.className || '',
      period: paidFeePeriodLabel(record),
      feeType: paidFeeTypeLabel(record.feeType),
      tuition,
      additionalCharges,
      paidAt: record.paidAt
        ? (() => {
            const d = new Date(record.paidAt);
            if (Number.isNaN(d.getTime())) return '';
            const dd = String(d.getDate()).padStart(2, '0');
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            return `${dd}/${mm}/${d.getFullYear()}`;
          })()
        : '',
      paymentMethod: paymentMethodExportLabel(record.paymentMethod),
      slipNumber: record.paymentSlipNumber || '',
      notes: record.notes || '',
    };
  });

  if (rows.length) {
    const tuitionTotal = rows.reduce((sum, row) => sum + (Number(row.tuition) || 0), 0);
    const chargesTotal = rows.reduce((sum, row) => sum + (Number(row.additionalCharges) || 0), 0);
    rows.push({
      _isTotal: true,
      serial: '',
      receiptNumber: '',
      studentId: '',
      studentName: 'Total',
      fatherName: '',
      className: '',
      period: '',
      feeType: '',
      tuition: roundMoney(tuitionTotal),
      additionalCharges: roundMoney(chargesTotal),
      paidAt: '',
      paymentMethod: '',
      slipNumber: '',
      notes: '',
    });
  }

  // Keep total pdfWidth ≤ ~770 (A4 landscape inner width @ margin 36).
  const columns = [
    { key: 'serial', header: 'S.No', excelWidth: 7, pdfWidth: 26, align: 'center' },
    { key: 'receiptNumber', header: 'Receipt', excelWidth: 15, pdfWidth: 70 },
    { key: 'studentId', header: 'Roll #', excelWidth: 14, pdfWidth: 68 },
    { key: 'studentName', header: 'Student', excelWidth: 14, pdfWidth: 68, wrap: true },
    { key: 'fatherName', header: 'Father', excelWidth: 13, pdfWidth: 62, wrap: true },
    { key: 'className', header: 'Class', excelWidth: 8, pdfWidth: 32, align: 'center' },
    { key: 'period', header: 'Month', excelWidth: 11, pdfWidth: 52 },
    { key: 'feeType', header: 'Type', excelWidth: 9, pdfWidth: 38, align: 'center' },
    { key: 'tuition', header: 'Tuition', excelWidth: 11, pdfWidth: 46, align: 'right', numFmt: '#,##0' },
    {
      key: 'additionalCharges',
      header: 'Additional charges',
      excelWidth: 14,
      pdfWidth: 58,
      align: 'right',
      numFmt: '#,##0',
    },
    { key: 'paidAt', header: 'Paid on', excelWidth: 11, pdfWidth: 48, align: 'center' },
    { key: 'paymentMethod', header: 'Method', excelWidth: 10, pdfWidth: 40, align: 'center' },
    { key: 'slipNumber', header: 'Slip no.', excelWidth: 11, pdfWidth: 48 },
    { key: 'notes', header: 'Notes', excelWidth: 14, pdfWidth: 54, wrap: true },
  ];

  return { columns, rows };
}

function paidFeesToCsv(records) {
  const { columns, rows } = buildPaidCollectionReport(records);
  const header = columns.map((c) => c.header);
  const body = rows.map((row) => columns.map((col) => row[col.key]));
  return [header, ...body].map((r) => r.map(escapeCsvCell).join(',')).join('\n');
}

async function exportPaidFees({ classId, month, year, search, sessionId, feeType, dateFrom, dateTo }) {
  const records = await loadPaidFees({ classId, month, year, search, sessionId, feeType, dateFrom, dateTo });
  return paidFeesToCsv(records);
}

function formatReportMonthLabel({ month, year, records = [], allLabel = 'All months' }) {
  if (month && year) {
    const name = MONTH_NAMES[Number(month) - 1] || '';
    return `Month: ${name} ${year}`;
  }
  if (year && !month) return `Year: ${year} · All months`;
  const seen = new Map();
  records.forEach((record) => {
    if (!record?.month || !record?.year) return;
    const key = monthKey(record);
    if (seen.has(key)) return;
    const name = MONTH_NAMES[(Number(record.month) || 1) - 1] || '';
    seen.set(key, `${name} ${record.year}`);
  });
  const labels = [...seen.values()];
  if (!labels.length) return allLabel;
  if (labels.length === 1) return `Month: ${labels[0]}`;
  if (labels.length <= 4) return `Months: ${labels.join(', ')}`;
  return `${allLabel} (${labels.length})`;
}

/** Paid fee lines for one voucher, scaled so they add up to the voucher amount. */
function paidFeeHeadLines(record) {
  const total = roundMoney(Number(record.amount) || 0);
  const comps = (Array.isArray(record.components) ? record.components : []).filter(
    (line) => roundMoney(Number(line?.amount) || 0) > 0
  );
  const fallbackHead =
    record.feeType === 'stationery'
      ? 'Stationery'
      : record.feeType === 'admission' && !comps.length
        ? 'Admission fee'
        : 'Tuition fee';
  if (!comps.length) return total > 0 ? [{ head: fallbackHead, amount: total }] : [];

  const lines = comps.map((line) => {
    let head;
    if (line.kind === 'admission') head = 'Admission fee';
    else if (line.kind === 'tuition') head = 'Tuition fee';
    else if (isStationeryLine(line)) head = 'Stationery';
    else head = String(line.name || 'Additional charge').trim() || 'Additional charge';
    return { head, amount: roundMoney(Number(line.amount) || 0) };
  });
  const sum = roundMoney(lines.reduce((s, l) => s + l.amount, 0));
  // Remaining-balance credits can make the paid amount differ from the line total.
  if (sum > 0 && Math.abs(sum - total) > 0.009) {
    const ratio = total / sum;
    let allocated = 0;
    lines.forEach((line, i) => {
      if (i === lines.length - 1) line.amount = roundMoney(total - allocated);
      else {
        line.amount = roundMoney(line.amount * ratio);
        allocated += line.amount;
      }
    });
  }
  return lines;
}

/**
 * Concession text for the summary sheet — same wording as Student Management
 * (shared describeFeeRelief label), plus the monthly amount.
 * e.g. "Legacy discount (≈43%) · PKR 6,500 / month", "Concession — Sibling (15%) · PKR 1,324 / month"
 */
function summaryConcessionLabel(student, categoryNames = {}) {
  if (!student) return '';
  const { describeFeeRelief } = require('../../utils/feeRelief');
  const relief = describeFeeRelief(student, categoryNames);
  if (!relief.reliefLabel) return '';
  return relief.reliefAmount > 0
    ? `${relief.reliefLabel} · PKR ${Number(relief.reliefAmount).toLocaleString('en-US')} / month`
    : relief.reliefLabel;
}

function formatPaidDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * Fee summary — one row per paid challan:
 * S.No | Challan No. | Roll # | Student | Class | Section | Concession |
 * [Admission] | Tuition | Stationery | <each additional charge> | Receipt # | Paid Date | Total Received
 */
function buildPaidFeeSummaryReport(records, categoryNames = {}) {
  const sorted = sortByPaymentSlip(records);
  const chargeCols = new Map(); // key -> header
  let hasAdmission = false;

  const headKey = (head) => {
    if (/^Admission/i.test(head)) return 'admission';
    if (/^Tuition/i.test(head)) return 'tuition';
    if (/^station[ae]r/i.test(head)) return 'stationery';
    const key = `charge_${head.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    if (!chargeCols.has(key)) chargeCols.set(key, head);
    return key;
  };

  const rows = sorted.map((record, index) => {
    const student = record.studentId;
    const row = {
      serial: index + 1,
      challanNo: record.receiptNumber || '',
      rollNo: student?.rollNumber || student?.studentId || student?.registrationNumber || '',
      studentName: student?.studentName || '',
      className: student?.classId?.className || '',
      sectionName: student?.sectionId?.sectionName || '',
      concession: summaryConcessionLabel(student, categoryNames),
      admission: 0,
      tuition: 0,
      stationery: 0,
      receiptNo: record.paymentSlipNumber || '',
      paidAt: formatPaidDate(record.paidAt),
      totalReceived: roundMoney(Number(record.amount) || 0),
    };
    for (const { head, amount } of paidFeeHeadLines(record)) {
      const key = headKey(head);
      if (key === 'admission' && amount > 0) hasAdmission = true;
      row[key] = roundMoney((Number(row[key]) || 0) + amount);
    }
    return row;
  });

  const chargeKeys = [...chargeCols.keys()].sort((a, b) =>
    chargeCols.get(a).localeCompare(chargeCols.get(b))
  );
  const amountKeys = [
    ...(hasAdmission ? ['admission'] : []),
    'tuition',
    'stationery',
    ...chargeKeys,
  ];
  for (const row of rows) for (const key of amountKeys) row[key] = Number(row[key]) || 0;

  if (rows.length) {
    const total = {
      _isTotal: true,
      serial: '',
      challanNo: '',
      rollNo: '',
      studentName: 'Total',
      className: '',
      sectionName: '',
      concession: '',
      receiptNo: '',
      paidAt: '',
      totalReceived: roundMoney(rows.reduce((s, r) => s + r.totalReceived, 0)),
    };
    for (const key of amountKeys) total[key] = roundMoney(rows.reduce((s, r) => s + (Number(r[key]) || 0), 0));
    rows.push(total);
  }

  // Keep total pdfWidth ≤ ~770 (A4 landscape inner width).
  const fixedPdf = 26 + 56 + 56 + 92 + 36 + 38 + 84 + 52 + 52 + 62;
  const amountPdf = Math.max(40, Math.min(62, Math.floor((770 - fixedPdf) / amountKeys.length)));
  const money = (key, header) => ({
    key,
    header,
    excelWidth: 12,
    pdfWidth: amountPdf,
    align: 'right',
    numFmt: '#,##0',
    wrap: true,
  });
  const columns = [
    { key: 'serial', header: 'S.No.', excelWidth: 6, pdfWidth: 26, align: 'center' },
    { key: 'challanNo', header: 'Challan No.', excelWidth: 13, pdfWidth: 56, align: 'center', wrap: true },
    { key: 'rollNo', header: 'Student Roll #', excelWidth: 13, pdfWidth: 56, align: 'center', wrap: true },
    { key: 'studentName', header: 'Student Name', excelWidth: 22, pdfWidth: 92, wrap: true },
    { key: 'className', header: 'Class', excelWidth: 8, pdfWidth: 36, align: 'center' },
    { key: 'sectionName', header: 'Section', excelWidth: 9, pdfWidth: 38, align: 'center' },
    { key: 'concession', header: 'Concession', excelWidth: 28, pdfWidth: 84, wrap: true },
    ...(hasAdmission ? [money('admission', 'Admission Fee')] : []),
    money('tuition', 'Tuition Fee'),
    money('stationery', 'Stationery'),
    ...chargeKeys.map((key) => money(key, chargeCols.get(key))),
    { key: 'receiptNo', header: 'Receipt #', excelWidth: 11, pdfWidth: 52, align: 'center', wrap: true },
    { key: 'paidAt', header: 'Paid Date', excelWidth: 12, pdfWidth: 52, align: 'center' },
    { key: 'totalReceived', header: 'Total Received', excelWidth: 15, pdfWidth: 62, align: 'right', numFmt: '#,##0' },
  ];
  return { columns, rows };
}

async function exportPaidFeesReport({
  classId,
  month,
  year,
  search,
  sessionId,
  feeType,
  dateFrom,
  dateTo,
  format,
  variant,
}) {
  const records = await loadPaidFees({ classId, month, year, search, sessionId, feeType, dateFrom, dateTo });
  const isSummary = variant === 'summary';
  const { columns, rows } = isSummary
    ? buildPaidFeeSummaryReport(records, await require('./concessionCategoryService').categoryNameMap())
    : buildPaidCollectionReport(records);
  const { sessionLabel, classLabel } = await resolveFeeReportContext({ sessionId, classId });
  const periodBits = [
    dateFrom && dateTo
      ? dateFrom === dateTo
        ? `Date: ${dateFrom}`
        : `From ${dateFrom}  To ${dateTo}`
      : null,
    formatReportMonthLabel({ month, year, records, allLabel: 'All paid months' }),
  ].filter(Boolean);
  if (feeType) periodBits.push(paidFeeTypeLabel(feeType));
  const voucherCount = records.length;
  const meta = {
    sessionLabel,
    leftFilter: classLabel || 'All classes',
    centerFilter: `Total challan paid: ${voucherCount}`,
    rightFilter: periodBits.join(' · '),
    filterLine: periodBits.join(' · '),
    countLabel: `Total challan paid: ${voucherCount}`,
    generatedAt: new Date(),
  };
  const payload = {
    title: isSummary ? 'Paid Fee Summary' : 'Paid Fee Collection Report',
    sheetName: isSummary ? 'Fee summary' : 'Paid fees',
    confidentialLabel: isSummary ? 'Paid fee summary' : 'Paid fee collection',
    subject: isSummary ? 'Paid fee summary by head' : 'Paid student fees',
    columns,
    rows,
    meta,
    emptyMessage: 'No paid fees for the selected filters.',
    plain: true,
  };
  if (String(format).toLowerCase() === 'pdf') {
    return renderBrandedPdf(payload);
  }
  return renderBrandedExcel(payload);
}

async function exportFeeDefaultersMonthWise({
  classId,
  month,
  year,
  search,
  sessionId,
  format,
  periodFrom,
  periodTo,
}) {
  const records = await loadUnpaidFees({ classId, month, year, search, sessionId, periodFrom, periodTo });
  const { columns, rows } = buildDefaulterReport(
    records,
    await require('./concessionCategoryService').categoryNameMap()
  );
  const { sessionLabel, classLabel } = await resolveFeeReportContext({ sessionId, classId });
  const periodBits = [
    periodFrom && periodTo
      ? `Billing months from ${periodFrom.slice(0, 7)} to ${periodTo.slice(0, 7)}`
      : null,
    formatReportMonthLabel({ month, year, records, allLabel: 'All unpaid months' }),
  ].filter(Boolean);
  const studentCount = rows.length && rows[rows.length - 1]?._isTotal ? rows.length - 1 : rows.length;
  const voucherCount = records.length;
  const meta = {
    sessionLabel,
    leftFilter: classLabel || 'All classes',
    centerFilter: `${studentCount} student${studentCount === 1 ? '' : 's'} · ${voucherCount} unpaid challan${voucherCount === 1 ? '' : 's'}`,
    rightFilter: periodBits.join(' · '),
    filterLine: periodBits.join(' · '),
    countLabel: `${studentCount} student${studentCount === 1 ? '' : 's'}`,
    generatedAt: new Date(),
  };
  const payload = {
    title: 'Fee Defaulter Report',
    sheetName: 'Defaulters',
    confidentialLabel: 'Fee defaulter list',
    subject: 'Fee defaulters by student',
    columns,
    rows,
    meta,
    emptyMessage: 'No fee defaulters for the selected filters.',
    plain: true,
  };
  if (String(format).toLowerCase() === 'pdf') {
    return renderBrandedPdf(payload);
  }
  return renderBrandedExcel(payload);
}

function subjectListOrder(a, b) {
  const ra = a.enrollmentType === 'required' ? 0 : 1;
  const rb = b.enrollmentType === 'required' ? 0 : 1;
  if (ra !== rb) return ra - rb;
  return String(a.subjectName || '').localeCompare(String(b.subjectName || ''));
}

function formatRupees(n) {
  return `Rs ${roundMoney(n).toLocaleString('en-PK')}`;
}

function subjectNamesList(subjectDocs) {
  return (subjectDocs || [])
    .filter((sub) => sub && typeof sub === 'object')
    .sort(subjectListOrder)
    .map((sub) => sub.subjectName || sub.subjectCode)
    .filter(Boolean)
    .join(', ');
}

/**
 * Accounts Report subjects:
 * - Full package + choice groups (9th/10th): only selected group electives
 * - Full package + discipline (1st/2nd year): only that discipline's stream subjects
 * - Part-time: only the subjects the student selected
 */
async function resolveAccountsSubjectDocs(student, classId, sectionId, layoutCache) {
  const selected = (student.selectedSubjects || []).filter((sub) => sub && typeof sub === 'object');
  const selectedIds = new Set(selected.map((s) => String(s._id)));

  // Part-time: only what they picked.
  if (!student.isFullPackage) {
    return selected;
  }

  const disciplineId = student.disciplineId?._id || student.disciplineId || null;
  const cacheKey = `${classId}:${sectionId}:${disciplineId || ''}`;
  let layout = layoutCache.get(cacheKey);
  if (!layout) {
    layout = await getEnrollmentLayout(classId, sectionId, disciplineId);
    layoutCache.set(cacheKey, layout);
  }

  // 1st / 2nd year: discipline stream subjects only (not shared / all-package subjects).
  if (disciplineId && (layout.streamSubjects || []).length) {
    return layout.streamSubjects.slice();
  }

  // 9th / 10th: choice groups — only the group subjects they selected.
  if (layout.hasChoiceGroups) {
    const picks = [];
    const seen = new Set();
    for (const group of layout.choiceGroups || []) {
      for (const sub of group.subjects || []) {
        const id = String(sub._id);
        if (!selectedIds.has(id) || seen.has(id)) continue;
        seen.add(id);
        picks.push(sub);
      }
    }
    return picks;
  }

  // Full package with neither groups nor discipline stream — keep selected list as-is.
  return selected;
}

/** Latest non-empty payment slip number per student (most recent paidAt first). */
async function latestPaymentSlipByStudent(studentIds) {
  const slipByStudent = new Map();
  if (!studentIds.length) return slipByStudent;

  const paid = await AcademyFeeRecord.find({
    studentId: { $in: studentIds },
    status: 'paid',
    paymentSlipNumber: { $exists: true, $nin: [null, ''] },
  })
    .select('studentId paymentSlipNumber paidAt')
    .sort({ paidAt: -1, updatedAt: -1 })
    .lean();

  for (const record of paid) {
    const id = String(record.studentId);
    if (slipByStudent.has(id)) continue;
    const slip = String(record.paymentSlipNumber || '').trim();
    if (slip) slipByStudent.set(id, slip);
  }
  return slipByStudent;
}

/** One row per active student: roll #, name, monthly fee, payment slip no., discipline, subjects. */
async function loadClassAccountsRows(classId, sectionId) {
  if (!classId || !sectionId) {
    throw new ApiError(400, 'Select a class and section to export the accounts report');
  }

  const students = await AcademyStudent.find({ classId, sectionId, status: 'active' })
    .select(
      'studentId registrationNumber rollNumber studentName disciplineId selectedSubjects isFullPackage monthlyFee monthlyFeeDiscount feeReliefType concessionCategory concessionPercent exemptionRemarks'
    )
    .populate({ path: 'disciplineId', select: 'name' })
    .populate({
      path: 'selectedSubjects',
      select: 'subjectName subjectCode enrollmentType choiceGroupName',
    })
    .lean();
  const slipByStudent = await latestPaymentSlipByStudent(students.map((s) => s._id));
  const { describeFeeRelief } = require('../../utils/feeRelief');
  const { categoryNameMap } = require('./concessionCategoryService');
  const concessionNames = await categoryNameMap();
  const layoutCache = new Map();
  let totalFee = 0;
  const rows = [];
  for (const student of students) {
    const fee = monthlyBillAmount(student);
    totalFee = roundMoney(totalFee + fee);
    // eslint-disable-next-line no-await-in-loop
    const subjectDocs = await resolveAccountsSubjectDocs(student, classId, sectionId, layoutCache);
    rows.push({
      serial: 0,
      regNo: student.rollNumber || student.studentId || student.registrationNumber || '',
      name: student.studentName || '',
      fee,
      relief: describeFeeRelief(student, concessionNames).reliefLabel,
      slipNo: slipByStudent.get(String(student._id)) || '',
      discipline:
        student.disciplineId?.name || (student.isFullPackage ? 'Full package' : 'Part-time'),
      subjects: subjectNamesList(subjectDocs),
      _roll: student.rollNumber || '',
    });
  }

  // Ascending by payment slip number; blank slips last; roll # as tie-breaker.
  rows.sort((a, b) => {
    const sa = String(a.slipNo || '').trim();
    const sb = String(b.slipNo || '').trim();
    if (!sa && !sb) return compareStudentsByRollAsc({ rollNumber: a._roll }, { rollNumber: b._roll });
    if (!sa) return 1;
    if (!sb) return -1;
    const bySlip = sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' });
    if (bySlip !== 0) return bySlip;
    return compareStudentsByRollAsc({ rollNumber: a._roll }, { rollNumber: b._roll });
  });

  rows.forEach((row, index) => {
    row.serial = index + 1;
    delete row._roll;
  });

  return { rows, totalFee };
}

async function exportClassAccountsReport({ classId, sectionId, sessionId, format }) {
  const { rows, totalFee } = await loadClassAccountsRows(classId, sectionId);
  const { sessionLabel, classLabel } = await resolveFeeReportContext({ sessionId, classId });
  const section = await AcademySection.findById(sectionId).select('sectionName').lean();
  const sectionLabel = section?.sectionName || '';
  const count = rows.length;
  const countLabel = `${count} student${count === 1 ? '' : 's'}`;
  const meta = {
    sessionLabel,
    leftFilter: `Class: ${classLabel}`,
    centerFilter: `Section: ${sectionLabel} · ${countLabel}`,
    rightFilter: `Total monthly fee: ${formatRupees(totalFee)}`,
    filterLine: `Class: ${classLabel} · Section: ${sectionLabel}`,
    countLabel,
    generatedAt: new Date(),
  };
  const title = 'Accounts Report';
  const confidentialLabel = 'Class wise accounts';
  const emptyMessage = 'No active students in this class and section.';

  if (String(format).toLowerCase() === 'pdf') {
    // Same two-tables-per-page layout as the Student List.
    return renderDualTablePdf({
      title,
      subject: 'Class wise student fee and subjects',
      confidentialLabel,
      emptyMessage,
      rows: rows.map((row) => ({ ...row, fee: row.fee.toLocaleString('en-PK') })),
      meta,
      buildCols: (tableW) => {
        const cols = [
          { key: 'serial', w: 16, label: 'Sr #', align: 'center', wrap: false },
          { key: 'regNo', w: 42, label: 'Roll #', align: 'center', wrap: true },
          { key: 'name', w: 56, label: 'Student Name', align: 'left', wrap: true },
          { key: 'fee', w: 32, label: 'Fee (Rs)', align: 'center', wrap: false },
          { key: 'slipNo', w: 40, label: 'Slip no.', align: 'center', wrap: true },
          { key: 'discipline', w: 36, label: 'Discipline', align: 'center', wrap: true },
          { key: 'subjects', w: 0, label: 'Subjects', align: 'left', wrap: true },
        ];
        const used = cols.reduce((sum, c) => sum + c.w, 0);
        cols[6].w = Math.max(36, tableW - used);
        return cols;
      },
    });
  }

  const excelRows = rows.slice();
  if (excelRows.length) {
    excelRows.push({ _isTotal: true, name: 'Total', fee: totalFee });
  }
  return renderBrandedExcel({
    title,
    sheetName: 'Class accounts',
    confidentialLabel,
    columns: [
      { key: 'serial', header: 'Sr #', excelWidth: 6, align: 'center' },
      { key: 'regNo', header: 'Roll #', excelWidth: 18, align: 'center' },
      { key: 'name', header: 'Student Name', excelWidth: 22, wrap: true },
      { key: 'fee', header: 'Fee (Rs)', excelWidth: 12, align: 'center', numFmt: '#,##0' },
      { key: 'relief', header: 'Concession / Exemption', excelWidth: 26, wrap: true },
      { key: 'slipNo', header: 'Slip no.', excelWidth: 14, align: 'center', wrap: true },
      { key: 'discipline', header: 'Discipline', excelWidth: 16, align: 'center', wrap: true },
      { key: 'subjects', header: 'Subjects', excelWidth: 48, wrap: true },
    ],
    rows: excelRows,
    meta,
    plain: true,
    layout: 'portrait',
    lightHeader: false,
  });
}

module.exports = {
  listFeeRecords,
  getFeeRecordById,
  updateFeeRecord,
  listUnpaidForChallan,
  applySelectedChargesToFees,
  addStationeryCharge,
  resyncSeparateChargeChallans,
  generateMonthlyFees,
  createEnrollmentFeeVouchers,
  syncUnpaidChallansForStudent,
  isStudentFullFeeWaiver,
  monthlyBillAmount,
  recordPayment,
  recordPayments,
  reversePayment,
  transferPayment,
  getStudentFeeHistory,
  getFeeSummary,
  listFeeDefaulters,
  getDefaultersSummary,
  exportFeeDefaulters,
  exportFeeDefaultersMonthWise,
  exportPaidFees,
  exportPaidFeesReport,
  exportClassAccountsReport,
  receiptNumber,
};
