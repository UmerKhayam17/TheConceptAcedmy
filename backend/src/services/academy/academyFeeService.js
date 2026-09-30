const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const AcademyFeeRecord = require('../../models/academy/AcademyFeeRecord');
const AcademyStudent = require('../../models/academy/AcademyStudent');
const AcademyClass = require('../../models/academy/AcademyClass');
const { populateCreatedBy } = require('../../utils/createdBy');
const { notifyByAccess } = require('../realtime/realtimeService');
const { renderBrandedExcel, renderBrandedPdf } = require('./academyReportDocument');

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
      $addFields: {
        className: { $arrayElemAt: ['$classDoc.className', 0] },
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
      studentName: row.student.studentName,
      fatherName: row.student.fatherName,
      phone: row.student.phone,
      classId: row.student.classId,
    },
    className: row.className || null,
  };
}

function receiptNumber(studentDoc, month, year, feeType) {
  const sid = studentDoc.studentId || studentDoc._id.toString().slice(-6);
  return `RCP-${sid}-${feeType === 'admission' ? 'ADM' : `${year}${String(month).padStart(2, '0')}`}`;
}

/** Monthly challan amount after the student's recurring monthly discount. */
function monthlyBillAmount(student) {
  const fee = Math.max(0, Number(student.monthlyFee) || 0);
  const discount = Math.min(Math.max(0, Number(student.monthlyFeeDiscount) || 0), fee);
  return Math.max(0, fee - discount);
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
async function createEnrollmentFeeVouchers(student, fees, userId, { asOf = new Date() } = {}) {
  const month = asOf.getMonth() + 1;
  const year = asOf.getFullYear();
  const dueDate = resolveMonthlyDueDate(month, year);
  const { admissionAmount, monthlyAmount } = splitEnrollmentAmounts(fees);
  const totalDue = Math.max(0, admissionAmount + monthlyAmount);
  if (totalDue <= 0) return [];

  const existingAdm = await AcademyFeeRecord.findOne({
    studentId: student._id,
    month,
    year,
    feeType: 'admission',
  });
  if (existingAdm) return [];

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
    createdBy: userId,
    recordedBy: userId,
    pendingNoticeAt: new Date(),
  });

  return [record];
}

async function buildFeeQuery({ studentId, studentIds, status, month, year, classId, feeType, sessionId }) {
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
  if (classId) {
    const students = await AcademyStudent.find({ classId }).select('_id');
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

function periodText(month, year, feeType) {
  if (feeType === 'admission') return 'Admission';
  const name = MONTH_NAMES[(Number(month) || 1) - 1] || '';
  return `${name} ${year || ''}`.trim();
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

async function listFeeRecords({
  page = 1,
  limit = 20,
  studentId,
  studentIds,
  status,
  month,
  year,
  classId,
  feeType,
  sessionId,
}) {
  await syncOverdueFees({ studentId, studentIds, status, month, year, classId, feeType, sessionId });

  const q = await buildFeeQuery({ studentId, studentIds, status, month, year, classId, feeType, sessionId });

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
      skipped.push(student._id);
      continue;
    }

    const amount = monthlyBillAmount(student);
    if (amount <= 0) {
      skipped.push(student._id);
      continue;
    }

    const record = await AcademyFeeRecord.create({
      studentId: student._id,
      month,
      year,
      amount,
      feeType: 'monthly',
      status: 'pending',
      dueDate,
      receiptNumber: receiptNumber(student, month, year, 'monthly'),
      recordedBy: userId,
      createdBy: userId,
      pendingNoticeAt: new Date(),
    });
    created.push(record);
    record.studentId = student;
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

async function listUnpaidForChallan(studentId, months) {
  const student = await AcademyStudent.findById(studentId);
  if (!student) throw new ApiError(404, 'Student not found');
  await syncOverdueFees({ studentId });
  let query = AcademyFeeRecord.find({
    studentId,
    status: { $in: ['pending', 'overdue'] },
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

async function recordPayment(feeRecordId, { paymentMethod, notes }, userId) {
  const existing = await AcademyFeeRecord.findById(feeRecordId).populate('studentId');
  if (!existing) throw new ApiError(404, 'Fee record not found');
  if (existing.status === 'paid') throw new ApiError(400, 'Fee already paid');

  const nextReceipt =
    existing.receiptNumber ||
    (existing.studentId
      ? receiptNumber(existing.studentId, existing.month, existing.year, existing.feeType)
      : undefined);

  // Atomic: only one concurrent payer can flip pending/overdue → paid
  const record = await AcademyFeeRecord.findOneAndUpdate(
    {
      _id: feeRecordId,
      status: { $in: ['pending', 'overdue'] },
    },
    {
      $set: {
        status: 'paid',
        paidAt: new Date(),
        paymentMethod: paymentMethod || 'cash',
        notes: notes || '',
        recordedBy: userId,
        ...(nextReceipt ? { receiptNumber: nextReceipt } : {}),
      },
    },
    { new: true }
  ).populate('studentId');

  if (!record) {
    const again = await AcademyFeeRecord.findById(feeRecordId).select('status').lean();
    if (again?.status === 'paid') throw new ApiError(400, 'Fee already paid');
    throw new ApiError(409, 'Could not record payment — please retry');
  }
  return record;
}

async function recordPayments(feeRecordIds, payload, userId) {
  const ids = [...new Set((feeRecordIds || []).map(String))];
  const records = await AcademyFeeRecord.find({ _id: { $in: ids } }).sort({ year: 1, month: 1 });
  if (records.length !== ids.length) throw new ApiError(404, 'One or more fee records were not found');
  const students = new Set(records.map((r) => String(r.studentId)));
  if (students.size !== 1) throw new ApiError(400, 'Pay fees for one student at a time');
  if (records.some((r) => r.status === 'paid')) throw new ApiError(400, 'One of the selected fees is already paid');

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
          paidAt: new Date(),
          paymentMethod: payload.paymentMethod || 'cash',
          notes: payload.notes || '',
          recordedBy: userId,
          receiptNumber:
            record.receiptNumber ||
            receiptNumber(record.studentId, record.month, record.year, record.feeType),
        },
      },
      { new: true }
    );
    if (!updated) {
      throw new ApiError(400, 'One of the selected fees is already paid');
    }
    paid.push(updated);
  }
  return {
    paid: paid.length,
    total: paid.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
    records: paid,
  };
}

async function getStudentFeeHistory(studentId) {
  const student = await AcademyStudent.findById(studentId);
  if (!student) throw new ApiError(404, 'Student not found');
  await syncOverdueFees({ studentId });
  const records = await AcademyFeeRecord.find({ studentId }).sort({ year: -1, month: -1 });
  return { student, records };
}

async function getFeeSummary({ month, year, classId, studentId, studentIds, sessionId }) {
  await syncOverdueFees({ month, year, classId, studentId, studentIds, sessionId });
  const q = await buildFeeQuery({ month, year, classId, studentId, studentIds, sessionId });
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
    if (classId) {
      studentQ.classId = classId;
    } else if (sessionId) {
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
            student: {
              _id: '$student._id',
              studentId: '$student.studentId',
              studentName: '$student.studentName',
              fatherName: '$student.fatherName',
              phone: '$student.phone',
              classId: '$student.classId',
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
    'Student ID',
    'Student Name',
    'Father Name',
    'Phone',
    'Class',
    'Total Due (PKR)',
    'Unpaid Vouchers',
    'Overdue Vouchers',
    'Oldest Due Date',
    'Days Overdue',
  ];
  const rows = items.map((d) => [
    d.student?.studentId ?? '',
    d.student?.studentName ?? '',
    d.student?.fatherName ?? '',
    d.student?.phone ?? '',
    d.className ?? '',
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
        regNo: student.studentId || student.registrationNumber || '',
        name: student.studentName || '',
        className: student.classId?.className || '',
        amounts: {},
        total: 0,
      });
    }
    const row = byStudent.get(id);
    const key = monthKey(record);
    row.amounts[key] = (row.amounts[key] || 0) + (Number(record.amount) || 0);
    row.total += Number(record.amount) || 0;
  });

  const students = [...byStudent.values()].sort(
    (a, b) => a.className.localeCompare(b.className) || a.name.localeCompare(b.name)
  );

  const rows = students.map((student, index) => {
    const row = {
      serial: index + 1,
      regNo: student.regNo,
      name: student.name,
      className: student.className,
      total: student.total,
    };
    monthOrder.forEach((m) => {
      row[m.key] = student.amounts[m.key] ?? null;
    });
    return row;
  });

  if (rows.length) {
    const totalRow = { serial: '', regNo: '', name: 'Total', className: '', total: 0 };
    monthOrder.forEach((m) => {
      const sum = rows.reduce((acc, row) => acc + (Number(row[m.key]) || 0), 0);
      totalRow[m.key] = sum || null;
      totalRow.total += sum;
    });
    rows.push(totalRow);
  }

  const monthPdf = Math.max(40, Math.min(58, Math.floor(420 / Math.max(monthOrder.length, 1))));
  const columns = [
    { key: 'serial', header: 'S.No', excelWidth: 8, pdfWidth: 28, align: 'center' },
    { key: 'regNo', header: 'Reg No', excelWidth: 22, pdfWidth: 88 },
    { key: 'name', header: 'Name', excelWidth: 24, pdfWidth: 120 },
    { key: 'className', header: 'Class', excelWidth: 14, pdfWidth: 52 },
    ...monthOrder.map((m) => ({
      key: m.key,
      header: monthHeader(m, sameYear),
      excelWidth: 12,
      pdfWidth: monthPdf,
      align: 'right',
      numFmt: '#,##0',
    })),
    { key: 'total', header: 'Total pending', excelWidth: 16, pdfWidth: 68, align: 'right', numFmt: '#,##0' },
  ];

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
      select: 'studentId registrationNumber studentName classId status',
      populate: { path: 'classId', select: 'className' },
    })
    .sort({ year: 1, month: 1 })
    .lean();

  records = records.filter((r) => r.studentId && r.studentId.status === 'active');
  const term = String(search || '').trim().toLowerCase();
  if (term) {
    records = records.filter((r) => {
      const student = r.studentId;
      return [student.studentName, student.studentId, student.registrationNumber].some((value) =>
        String(value || '').toLowerCase().includes(term)
      );
    });
  }
  return records;
}

async function exportFeeDefaultersMonthWise({ classId, month, year, search, sessionId, format }) {
  const records = await loadUnpaidMonthlyFees({ classId, month, year, search, sessionId });
  const { columns, rows } = buildDefaulterReport(records);
  const title = 'Fee defaulter list';
  const filterBits = [];
  if (month && year) filterBits.push(`${MONTH_NAMES[Number(month) - 1]} ${year}`);
  else if (year) filterBits.push(String(year));
  else filterBits.push('All unpaid months');
  const studentCount = rows.length ? rows.length - 1 : 0;
  const meta = {
    filterLine: filterBits.join(' · '),
    countLabel: `${studentCount} student${studentCount === 1 ? '' : 's'}`,
    generatedAt: new Date(),
  };
  const payload = {
    title,
    sheetName: 'Defaulters',
    confidentialLabel: 'Fee defaulter list',
    subject: 'Fee defaulters by month',
    columns,
    rows,
    meta,
    emptyMessage: 'No fee defaulters for the selected filters.',
  };
  if (String(format).toLowerCase() === 'pdf') {
    return renderBrandedPdf(payload);
  }
  return renderBrandedExcel(payload);
}

module.exports = {
  listFeeRecords,
  getFeeRecordById,
  listUnpaidForChallan,
  generateMonthlyFees,
  createEnrollmentFeeVouchers,
  monthlyBillAmount,
  recordPayment,
  recordPayments,
  getStudentFeeHistory,
  getFeeSummary,
  listFeeDefaulters,
  getDefaultersSummary,
  exportFeeDefaulters,
  exportFeeDefaultersMonthWise,
  receiptNumber,
};
