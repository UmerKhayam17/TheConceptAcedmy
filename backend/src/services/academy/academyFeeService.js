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
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  if (paidAt > endOfToday) throw new ApiError(400, 'Payment date cannot be in the future');
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

function daysSince(date) {
  if (!date) return 0;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((startOfToday - d) / (24 * 60 * 60 * 1000)));
}

function escapeCsvCell(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildDefaulterFeeMatch({ classId, month, year, studentIds }) {
  const feeMatch = { status: { $in: ['pending', 'overdue'] } };
  if (month) feeMatch.month = Number(month);
  if (year) feeMatch.year = Number(year);
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
 * PAID / WAIVED → never touched
 * PENDING / OVERDUE → amount + components updated together
 * Manual charge lines (stationery without chargeId) → preserved on the same challan
 *
 * Partial credit: if prior amount was reduced below the old components total
 * (staff recorded a remaining balance), keep that credit against the revised bill.
 */
async function syncUnpaidChallansForStudent(student) {
  if (!student?._id) return { updated: 0, skipped: 0 };

  const unpaid = await AcademyFeeRecord.find({
    studentId: student._id,
    status: { $in: ['pending', 'overdue'] },
    feeType: { $in: ['monthly', 'admission'] },
  });

  if (!unpaid.length) return { updated: 0, skipped: 0 };

  const charges = await listActiveCharges();
  let updated = 0;
  let skipped = 0;

  for (const record of unpaid) {
    const bill = reviseBillForFeeRecord(student, record, charges);
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
    if (!amountChanged && !componentsChanged) {
      skipped += 1;
      continue;
    }

    record.amount = nextAmount;
    record.components = bill.components;
    if (alreadyPaid > 0) {
      const creditNote = `Revised bill ₨${bill.amount.toLocaleString()}; credit ₨${alreadyPaid.toLocaleString()} for prior partial payment.`;
      const notes = String(record.notes || '');
      if (!notes.includes('Revised bill')) {
        record.notes = [notes.trim(), creditNote].filter(Boolean).join(' · ');
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

async function createEnrollmentFeeVouchers(student, fees, userId, { asOf = new Date(), replacePending = false } = {}) {
  const month = asOf.getMonth() + 1;
  const year = asOf.getFullYear();
  const dueDate = resolveMonthlyDueDate(month, year);
  const { admissionAmount, monthlyAmount } = splitEnrollmentAmounts(fees);
  // Enrollment voucher starts tuition-only; staff opt into charges when printing / paying.
  const tuitionBill = composeMonthlyComponents(student, month, [], monthlyAmount, { chargeIds: [] });
  const components = [...tuitionBill.components];
  if (admissionAmount > 0) {
    components.push({ name: 'Admission', amount: roundMoney(admissionAmount), kind: 'admission' });
  }
  const totalDue = roundMoney(components.reduce((sum, line) => sum + line.amount, 0));
  if (totalDue <= 0) return [];

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
      existingAdm.amount = totalDue;
      existingAdm.components = components;
      existingAdm.dueDate = dueDate;
      existingAdm.notes = 'First month: monthly fee + admission fee (after discounts)';
      existingAdm.recordedBy = userId;
      await existingAdm.save();
      return [existingAdm];
    }
    return [existingAdm];
  }

  // Avoid a leftover monthly-only voucher for the enrollment month.
  await AcademyFeeRecord.deleteMany({
    studentId: student._id,
    month,
    year,
    feeType: 'monthly',
    status: { $in: ['pending', 'overdue'] },
  });

  const record = await AcademyFeeRecord.create({
    studentId: student._id,
    month,
    year,
    amount: totalDue,
    feeType: 'admission',
    status: 'pending',
    dueDate,
    receiptNumber: receiptNumber(student, month, year, 'admission'),
    notes: 'First month: monthly fee + admission fee (after discounts)',
    components,
    createdBy: userId,
    recordedBy: userId,
    pendingNoticeAt: new Date(),
  });

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
}) {
  const q = {};
  if (status) q.status = status;
  if (feeType) q.feeType = feeType;
  if (month) q.month = Number(month);
  if (year) q.year = Number(year);
  if (studentId) {
    // Aggregate $match does not cast strings — must use ObjectId.
    q.studentId = mongoose.isValidObjectId(studentId)
      ? new mongoose.Types.ObjectId(String(studentId))
      : studentId;
    return q;
  }
  // Array (including empty) means an explicit scope — never fall through to all fees
  if (Array.isArray(studentIds)) {
    q.studentId = {
      $in: studentIds
        .filter(Boolean)
        .map((id) => (mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(String(id)) : id)),
    };
    return q;
  }
  if (classId || sectionId) {
    const studentQ = {};
    if (classId) studentQ.classId = classId;
    if (sectionId) studentQ.sectionId = sectionId;
    const students = await AcademyStudent.find(studentQ).select('_id');
    q.studentId = { $in: students.map((s) => s._id) };
    return q;
  }
  if (sessionId) {
    const classes = await AcademyClass.find({ sessionId }).select('_id');
    const students = await AcademyStudent.find({ classId: { $in: classes.map((c) => c._id) } }).select('_id');
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
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

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
          select: 'studentId studentName fatherName phone classId monthlyFee',
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
    const listAdmission = Math.max(0, Number(student.admissionFee) || 0);

    // Legacy enrollments billed admission+first-month tuition as one large admission
    // voucher. Waive any unpaid monthly duplicate for that same period.
    const legacyAdmission = await AcademyFeeRecord.findOne({
      studentId: student._id,
      month,
      year,
      feeType: 'admission',
      amount: { $gt: listAdmission + 0.5 },
    });
    if (legacyAdmission) {
      const dup = await AcademyFeeRecord.findOneAndUpdate(
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
            notes: 'Waived: enrollment month already covered by combined admission voucher',
            recordedBy: userId,
          },
        },
        { new: true }
      );
      if (dup) repaired += 1;
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

    // Monthly challans are tuition-only until staff check additional charges at print/pay.
    const { amount, components } = composeMonthlyComponents(
      student,
      month,
      [],
      monthlyBillAmount(student),
      { chargeIds: [] }
    );
    if (amount <= 0) {
      skipped.push(student._id);
      continue;
    }

    const record = await AcademyFeeRecord.create({
      studentId: student._id,
      month,
      year,
      amount,
      components,
      feeType: 'monthly',
      status: 'pending',
      dueDate,
      receiptNumber: receiptNumber(student, month, year, 'monthly'),
      recordedBy: userId,
      createdBy: userId,
      pendingNoticeAt: new Date(),
    });
    await absorbUnpaidStationeryIntoMonthly(student._id, month, year, userId);
    const refreshed = await AcademyFeeRecord.findById(record._id);
    created.push(refreshed || record);
    if (refreshed) refreshed.studentId = student;
    else record.studentId = student;
  }

  if (created.length) {
    const label = periodText(month, year, 'monthly');
    await safeNotify(() => notifyFeeStaff({
      type: 'fee_challan',
      title: created.length === 1 ? 'Fee challan issued' : `${created.length} fee challans issued`,
      body: `${label} is unpaid for ${unpaidSummary(created)}.`,
      path: '/fees',
      moduleKey: 'fee',
      resource: 'fees',
      resourceId: `issued-${year}-${month}-${created[0]._id}`,
      meta: { month, year, count: created.length },
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

async function getStudentFeeHistory(studentId) {
  const student = await AcademyStudent.findById(studentId);
  if (!student) throw new ApiError(404, 'Student not found');
  await syncOverdueFees({ studentId });
  const records = await AcademyFeeRecord.find({ studentId }).sort({ year: -1, month: -1 });
  return { student, records };
}

async function getFeeSummary({ month, year, classId, sectionId, studentId, studentIds, sessionId }) {
  await syncOverdueFees({ month, year, classId, sectionId, studentId, studentIds, sessionId });
  const q = await buildFeeQuery({ month, year, classId, sectionId, studentId, studentIds, sessionId });
  const records = await AcademyFeeRecord.find(q).lean();

  const byStatus = { pending: 0, paid: 0, overdue: 0, waived: 0 };
  let totalPaid = 0;
  let totalPending = 0;
  let oldestPending = null;

  records.forEach((r) => {
    if (byStatus[r.status] != null) byStatus[r.status] += 1;
    if (r.status === 'paid') totalPaid += r.amount;
    if (r.status === 'pending' || r.status === 'overdue') {
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
    const prevRecords = await AcademyFeeRecord.find(prevQ).lean();
    let prevPaid = 0;
    let prevPending = 0;
    prevRecords.forEach((r) => {
      if (r.status === 'paid') prevPaid += r.amount;
      if (r.status === 'pending' || r.status === 'overdue') prevPending += r.amount;
    });
    previous = {
      month: prevMonth,
      year: prevYear,
      totalPaid: prevPaid,
      totalPending: prevPending,
      recordsCount: prevRecords.length,
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
        return AcademyFeeRecord.find(tq).select('amount status').lean();
      })
    );
    windowRows.forEach((rows) => {
      let p = 0;
      let u = 0;
      rows.forEach((r) => {
        if (r.status === 'paid') p += r.amount;
        if (r.status === 'pending' || r.status === 'overdue') u += r.amount;
      });
      paidSeries.push(p);
      pendingSeries.push(u);
      recordsSeries.push(rows.length);
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
    recordsCount: records.length,
    totalPaid,
    totalPending,
    totalAmount: records.reduce((s, r) => s + r.amount, 0),
    byStatus,
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

  const feeMatch = buildDefaulterFeeMatch({ classId, month, year, studentIds });
  const perPage = Math.min(100, Math.max(1, limit));
  const skip = (Math.max(1, page) - 1) * perPage;

  const pipeline = buildDefaultersPipeline({ feeMatch, search });
  pipeline.push({ $sort: { oldestDueDate: 1, totalDue: -1 } });
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

async function getDefaultersSummary({ classId, month, year, sessionId }) {
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

  const feeMatch = buildDefaulterFeeMatch({ classId, month, year, studentIds });
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
    'Ref #',
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
    d.student?.registrationNumber || d.student?.studentId || '',
    d.student?.rollNumber || d.student?.studentId || '',
    d.student?.studentName ?? '',
    d.student?.fatherName ?? '',
    d.className ?? '',
    d.sectionName ?? '',
    d.student?.phone ?? '',
    d.totalDue ?? 0,
    d.unpaidCount ?? 0,
    d.overdueCount ?? 0,
    d.oldestDueDate ? new Date(d.oldestDueDate).toISOString().slice(0, 10) : '',
    d.daysOverdue ?? 0,
  ]);
  return [header, ...rows].map((r) => r.map(escapeCsvCell).join(',')).join('\n');
}

async function exportFeeDefaulters({ classId, month, year, search, sessionId }) {
  const { items } = await listFeeDefaulters({
    page: 1,
    limit: 10000,
    classId,
    month,
    year,
    search,
    sessionId,
  });
  return defaultersToCsv(items);
}

function monthKey(record) {
  return `${record.year}-${String(record.month).padStart(2, '0')}`;
}

function monthHeader(record, sameYear) {
  const name = MONTH_NAMES[(Number(record.month) || 1) - 1] || '';
  return sameYear ? name : `${name} ${record.year}`;
}

function formatExportDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function buildDefaulterReport(records) {
  const monthOrder = [];
  const seenMonths = new Set();
  records.forEach((record) => {
    const key = monthKey(record);
    if (seenMonths.has(key)) return;
    seenMonths.add(key);
    monthOrder.push({ key, month: record.month, year: record.year });
  });
  const years = new Set(monthOrder.map((m) => m.year));
  const sameYear = years.size <= 1;

  const byStudent = new Map();
  records.forEach((record) => {
    const student = record.studentId;
    const id = String(student._id);
    if (!byStudent.has(id)) {
      byStudent.set(id, {
        regNo: student.registrationNumber || student.studentId || '',
        rollNo: student.rollNumber || student.studentId || '',
        name: student.studentName || '',
        fatherName: student.fatherName || '',
        className: student.classId?.className || '',
        sectionName: student.sectionId?.sectionName || '',
        contact: student.phone || '',
        challanNo: record.receiptNumber || '',
        dueDate: record.dueDate || null,
        amounts: {},
        total: 0,
      });
    }
    const row = byStudent.get(id);
    const key = monthKey(record);
    row.amounts[key] = (row.amounts[key] || 0) + (Number(record.amount) || 0);
    row.total += Number(record.amount) || 0;
    if (record.dueDate && (!row.dueDate || new Date(record.dueDate) < new Date(row.dueDate))) {
      row.dueDate = record.dueDate;
      if (record.receiptNumber) row.challanNo = record.receiptNumber;
    } else if (!row.challanNo && record.receiptNumber) {
      row.challanNo = record.receiptNumber;
    }
  });

  const students = [...byStudent.values()].sort(
    (a, b) =>
      a.className.localeCompare(b.className) ||
      a.sectionName.localeCompare(b.sectionName) ||
      a.name.localeCompare(b.name)
  );

  const rows = students.map((student, index) => {
    const row = {
      serial: index + 1,
      regNo: student.regNo,
      rollNo: student.rollNo,
      name: student.name,
      fatherName: student.fatherName,
      className: student.className,
      sectionName: student.sectionName,
      challanNo: student.challanNo,
      total: student.total,
      dueDate: formatExportDate(student.dueDate),
      contact: student.contact || '',
    };
    monthOrder.forEach((m) => {
      row[m.key] = student.amounts[m.key] ?? null;
    });
    return row;
  });

  if (rows.length) {
    const totalRow = {
      _isTotal: true,
      serial: '',
      regNo: '',
      rollNo: '',
      name: '',
      fatherName: '',
      className: '',
      sectionName: '',
      challanNo: '',
      total: 0,
      dueDate: '',
      contact: '',
    };
    monthOrder.forEach((m) => {
      const sum = rows.reduce((acc, row) => acc + (Number(row[m.key]) || 0), 0);
      totalRow[m.key] = sum || null;
      totalRow.total += sum;
    });
    rows.push(totalRow);
  }

  // Base widths for A4 landscape (~770 usable). Renderer scales to exact page width.
  const usable = 770;
  const fixed = [
    { key: 'serial', header: 'Serial', excelWidth: 8, pdfWidth: 32, align: 'center' },
    { key: 'regNo', header: 'Ref #', excelWidth: 20, pdfWidth: 100, wrap: true },
    { key: 'rollNo', header: 'Roll #', excelWidth: 16, pdfWidth: 72, wrap: true },
    { key: 'name', header: 'Name', excelWidth: 20, pdfWidth: 95, wrap: true },
    { key: 'fatherName', header: 'Father Name', excelWidth: 18, pdfWidth: 90, wrap: true },
    { key: 'contact', header: 'Contact', excelWidth: 14, pdfWidth: 70 },
    { key: 'className', header: 'Class', excelWidth: 10, pdfWidth: 40, align: 'center' },
    { key: 'sectionName', header: 'Section', excelWidth: 10, pdfWidth: 42, align: 'center' },
    { key: 'challanNo', header: 'Challan #', excelWidth: 16, pdfWidth: 72, wrap: true },
  ];
  const trail = [
    { key: 'total', header: 'Total Amount', excelWidth: 13, pdfWidth: 58, align: 'right', numFmt: '#,##0' },
    { key: 'dueDate', header: 'Due Date', excelWidth: 12, pdfWidth: 55, align: 'center' },
  ];
  const fixedW = fixed.reduce((s, c) => s + c.pdfWidth, 0);
  const trailW = trail.reduce((s, c) => s + c.pdfWidth, 0);
  const monthBudget = Math.max(40, usable - fixedW - trailW);
  const monthPdf = Math.max(
    40,
    Math.floor(monthBudget / Math.max(monthOrder.length, 1))
  );
  const monthColumns = monthOrder.map((m) => ({
    key: m.key,
    header: monthHeader(m, sameYear),
    excelWidth: 11,
    pdfWidth: monthPdf,
    align: 'right',
    numFmt: '#,##0',
  }));
  // Distribute any leftover width evenly so the table fills the page.
  const columns = [...fixed, ...monthColumns, ...trail];
  const sumW = columns.reduce((s, c) => s + c.pdfWidth, 0);
  let leftover = usable - sumW;
  if (leftover !== 0) {
    const growKeys = new Set(['regNo', 'name', 'fatherName', 'rollNo', 'contact', 'challanNo']);
    const growCols = columns.filter((c) => growKeys.has(c.key));
    const targets = growCols.length ? growCols : columns;
    const each = Math.floor(leftover / targets.length);
    targets.forEach((c) => {
      c.pdfWidth += each;
    });
    targets[targets.length - 1].pdfWidth += leftover - each * targets.length;
  }

  return { columns, rows, monthCount: monthOrder.length };
}

async function loadUnpaidMonthlyFees({ classId, month, year, search, sessionId }) {
  await syncOverdueFees({ classId, month, year, sessionId });

  let studentIds;
  if (classId || sessionId) {
    studentIds = await resolveActiveStudentIds(classId, sessionId);
    if (!studentIds.length) return [];
  }

  const feeMatch = {
    ...buildDefaulterFeeMatch({ classId, month, year, studentIds }),
    feeType: 'monthly',
  };
  let records = await AcademyFeeRecord.find(feeMatch)
    .populate({
      path: 'studentId',
      select:
        'studentId registrationNumber rollNumber studentName fatherName phone classId sectionId status',
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

async function loadPaidFees({ classId, month, year, search, sessionId, feeType }) {
  const base = await buildFeeQuery({
    classId,
    month,
    year,
    sessionId,
    status: 'paid',
    feeType,
  });
  const q = await applyFeeRecordSearch(base, search);
  const records = await AcademyFeeRecord.find(q)
    .populate({
      path: 'studentId',
      select: 'studentId registrationNumber studentName fatherName phone classId status',
      populate: { path: 'classId', select: 'className' },
    })
    .sort({ paidAt: -1, year: -1, month: -1 })
    .lean();
  return records.filter((r) => r.studentId && r.studentId.status === 'active');
}

function buildPaidCollectionReport(records) {
  const rows = records.map((record, index) => {
    const student = record.studentId;
    return {
      serial: index + 1,
      receiptNumber: record.receiptNumber || '',
      studentId: student?.studentId || student?.registrationNumber || '',
      studentName: student?.studentName || '',
      fatherName: student?.fatherName || '',
      className: student?.classId?.className || '',
      period: paidFeePeriodLabel(record),
      feeType: paidFeeTypeLabel(record.feeType),
      amount: Number(record.amount) || 0,
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
    const total = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
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
      amount: total,
      paidAt: '',
      paymentMethod: '',
      slipNumber: '',
      notes: '',
    });
  }

  // Keep total pdfWidth ≤ ~770 (A4 landscape inner width @ margin 36).
  const columns = [
    { key: 'serial', header: 'S.No', excelWidth: 7, pdfWidth: 28, align: 'center' },
    { key: 'receiptNumber', header: 'Receipt', excelWidth: 16, pdfWidth: 78 },
    { key: 'studentId', header: 'Student ID', excelWidth: 16, pdfWidth: 78 },
    { key: 'studentName', header: 'Student', excelWidth: 16, pdfWidth: 78, wrap: true },
    { key: 'fatherName', header: 'Father', excelWidth: 14, pdfWidth: 72, wrap: true },
    { key: 'className', header: 'Class', excelWidth: 9, pdfWidth: 34, align: 'center' },
    { key: 'period', header: 'Month', excelWidth: 12, pdfWidth: 58 },
    { key: 'feeType', header: 'Type', excelWidth: 10, pdfWidth: 42, align: 'center' },
    { key: 'amount', header: 'Amount', excelWidth: 11, pdfWidth: 50, align: 'right', numFmt: '#,##0' },
    { key: 'paidAt', header: 'Paid on', excelWidth: 11, pdfWidth: 52, align: 'center' },
    { key: 'paymentMethod', header: 'Method', excelWidth: 10, pdfWidth: 42, align: 'center' },
    { key: 'slipNumber', header: 'Slip no.', excelWidth: 12, pdfWidth: 52 },
    { key: 'notes', header: 'Notes', excelWidth: 18, pdfWidth: 66, wrap: true },
  ];

  return { columns, rows };
}

function paidFeesToCsv(records) {
  const { columns, rows } = buildPaidCollectionReport(records);
  const header = columns.map((c) => c.header);
  const body = rows.map((row) => columns.map((col) => row[col.key]));
  return [header, ...body].map((r) => r.map(escapeCsvCell).join(',')).join('\n');
}

async function exportPaidFees({ classId, month, year, search, sessionId, feeType }) {
  const records = await loadPaidFees({ classId, month, year, search, sessionId, feeType });
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

async function exportPaidFeesReport({ classId, month, year, search, sessionId, feeType, format }) {
  const records = await loadPaidFees({ classId, month, year, search, sessionId, feeType });
  const { columns, rows } = buildPaidCollectionReport(records);
  const { sessionLabel, classLabel } = await resolveFeeReportContext({ sessionId, classId });
  const periodBits = [
    formatReportMonthLabel({ month, year, records, allLabel: 'All paid months' }),
  ];
  if (feeType) periodBits.push(paidFeeTypeLabel(feeType));
  const voucherCount = rows.length ? rows.length - 1 : 0;
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
    title: 'Paid Fee Collection Report',
    sheetName: 'Paid fees',
    confidentialLabel: 'Paid fee collection',
    subject: 'Paid student fees',
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

async function exportFeeDefaultersMonthWise({ classId, month, year, search, sessionId, format }) {
  const records = await loadUnpaidMonthlyFees({ classId, month, year, search, sessionId });
  const { columns, rows } = buildDefaulterReport(records);
  const { sessionLabel, classLabel } = await resolveFeeReportContext({ sessionId, classId });
  const periodBits = [
    formatReportMonthLabel({ month, year, records, allLabel: 'All unpaid months' }),
  ];
  const studentCount = rows.length ? rows.length - 1 : 0;
  const meta = {
    sessionLabel,
    leftFilter: classLabel || 'All classes',
    rightFilter: periodBits.join(' · '),
    filterLine: periodBits.join(' · '),
    countLabel: `${studentCount} student${studentCount === 1 ? '' : 's'}`,
    generatedAt: new Date(),
  };
  const payload = {
    title: 'Fee Defaulter Report',
    sheetName: 'Defaulters',
    confidentialLabel: 'Fee defaulter list',
    subject: 'Fee defaulters by month',
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
  monthlyBillAmount,
  recordPayment,
  recordPayments,
  getStudentFeeHistory,
  getFeeSummary,
  listFeeDefaulters,
  getDefaultersSummary,
  exportFeeDefaulters,
  exportFeeDefaultersMonthWise,
  exportPaidFees,
  exportPaidFeesReport,
  receiptNumber,
};
