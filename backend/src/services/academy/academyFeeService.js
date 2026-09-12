const ApiError = require('../../utils/ApiError');
const AcademyFeeRecord = require('../../models/academy/AcademyFeeRecord');
const AcademyStudent = require('../../models/academy/AcademyStudent');
const AcademyClass = require('../../models/academy/AcademyClass');
const { populateCreatedBy } = require('../../utils/createdBy');

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

async function buildFeeQuery({ studentId, studentIds, status, month, year, classId, feeType, sessionId }) {
  const q = {};
  if (status) q.status = status;
  if (feeType) q.feeType = feeType;
  if (month) q.month = Number(month);
  if (year) q.year = Number(year);
  if (studentId) {
    q.studentId = studentId;
    return q;
  }
  // Array (including empty) means an explicit scope — never fall through to all fees
  if (Array.isArray(studentIds)) {
    q.studentId = { $in: studentIds };
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

/** Mark pending vouchers past due date as overdue. */
async function syncOverdueFees(filter = {}) {
  const q = await buildFeeQuery(filter);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  await AcademyFeeRecord.updateMany(
    {
      ...q,
      status: 'pending',
      dueDate: { $lt: startOfToday },
    },
    { $set: { status: 'overdue' } }
  );
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

  const [items, total] = await Promise.all([
    populateCreatedBy(
      AcademyFeeRecord.find(q).populate({
        path: 'studentId',
        select: 'studentId studentName fatherName phone classId monthlyFee',
        populate: {
          path: 'classId',
          select: 'className sessionId',
          populate: { path: 'sessionId', select: 'name status' },
        },
      })
    )
      .sort({ year: -1, month: -1, createdAt: -1 })
      .skip(skip)
      .limit(perPage),
    AcademyFeeRecord.countDocuments(q),
  ]);

  return {
    items,
    pagination: { page: Math.max(1, page), limit: perPage, total, pages: Math.ceil(total / perPage) || 1 },
  };
}

async function generateMonthlyFees({ month, year, classId }, userId) {
  const studentQ = { status: 'active' };
  if (classId) studentQ.classId = classId;
  const students = await AcademyStudent.find(studentQ);
  const dueDate = new Date(year, month - 1, 10);
  const created = [];
  const skipped = [];

  for (const student of students) {
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
    const record = await AcademyFeeRecord.create({
      studentId: student._id,
      month,
      year,
      amount: student.monthlyFee,
      feeType: 'monthly',
      status: 'pending',
      dueDate,
      receiptNumber: receiptNumber(student, month, year, 'monthly'),
      recordedBy: userId,
      createdBy: userId,
    });
    created.push(record);
  }

  return { created: created.length, skipped: skipped.length };
}

async function recordPayment(feeRecordId, { paymentMethod, notes }, userId) {
  const record = await AcademyFeeRecord.findById(feeRecordId).populate('studentId');
  if (!record) throw new ApiError(404, 'Fee record not found');
  if (record.status === 'paid') throw new ApiError(400, 'Fee already paid');

  record.status = 'paid';
  record.paidAt = new Date();
  record.paymentMethod = paymentMethod || 'cash';
  record.notes = notes || '';
  record.recordedBy = userId;
  if (!record.receiptNumber && record.studentId) {
    record.receiptNumber = receiptNumber(record.studentId, record.month, record.year, record.feeType);
  }
  await record.save();
  return record;
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

  records.forEach((r) => {
    if (byStatus[r.status] != null) byStatus[r.status] += 1;
    if (r.status === 'paid') totalPaid += r.amount;
    if (r.status === 'pending' || r.status === 'overdue') totalPending += r.amount;
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

  return {
    recordsCount: records.length,
    totalPaid,
    totalPending,
    totalAmount: records.reduce((s, r) => s + r.amount, 0),
    byStatus,
    activeStudents,
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

module.exports = {
  listFeeRecords,
  getFeeRecordById,
  generateMonthlyFees,
  recordPayment,
  getStudentFeeHistory,
  getFeeSummary,
  listFeeDefaulters,
  getDefaultersSummary,
  exportFeeDefaulters,
  receiptNumber,
};
