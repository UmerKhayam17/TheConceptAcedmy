const AcademyStudent = require('../../models/academy/AcademyStudent');
const AcademyClass = require('../../models/academy/AcademyClass');
const AcademySection = require('../../models/academy/AcademySection');
const AcademySubject = require('../../models/academy/AcademySubject');
const AcademyFeeRecord = require('../../models/academy/AcademyFeeRecord');
const AcademyExpense = require('../../models/academy/AcademyExpense');
const AcademySalaryRecord = require('../../models/academy/AcademySalaryRecord');
const AcademyAttendance = require('../../models/academy/AcademyAttendance');
const StaffAttendance = require('../../models/StaffAttendance');
const User = require('../../models/User');
const Role = require('../../models/Role');
const Exam = require('../../models/Exam');
const Announcement = require('../../models/Announcement');
const feeService = require('./academyFeeService');
const { dayBounds, todayYmd, formatDateInTz } = require('../../utils/schoolDay');

function monthWindow(monthsBack = 5) {
  const out = [];
  const now = new Date();
  for (let i = monthsBack; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      month: d.getMonth() + 1,
      year: d.getFullYear(),
      label: d.toLocaleString('en', { month: 'short', year: '2-digit' }),
    });
  }
  return out;
}

async function monthlyFinanceTrends(months) {
  const trends = [];
  for (const m of months) {
    const start = new Date(m.year, m.month - 1, 1);
    const end = new Date(m.year, m.month, 0, 23, 59, 59, 999);

    // eslint-disable-next-line no-await-in-loop
    const [feeAgg, expenseAgg, salaryAgg, attendanceAgg, enrollAgg] = await Promise.all([
      AcademyFeeRecord.aggregate([
        { $match: { month: m.month, year: m.year } },
        { $group: { _id: '$status', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      AcademyExpense.aggregate([
        { $match: { expenseDate: { $gte: start, $lte: end }, status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      AcademySalaryRecord.aggregate([
        { $match: { month: m.month, year: m.year } },
        { $group: { _id: '$status', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      AcademyAttendance.aggregate([
        {
          $match: {
            date: { $gte: start, $lte: end },
            $or: [{ subjectId: { $exists: false } }, { subjectId: null }],
          },
        },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      AcademyStudent.countDocuments({
        enrolledAt: { $gte: start, $lte: end },
      }),
    ]);

    const feeByStatus = Object.fromEntries(feeAgg.map((r) => [r._id, r.amount]));
    const salaryByStatus = Object.fromEntries(
      salaryAgg.map((r) => [r._id, { amount: r.amount, count: r.count }])
    );
    const attByStatus = Object.fromEntries(attendanceAgg.map((r) => [r._id, r.count]));

    trends.push({
      label: m.label,
      month: m.month,
      year: m.year,
      feesCollected: feeByStatus.paid || 0,
      feesPending: (feeByStatus.pending || 0) + (feeByStatus.overdue || 0),
      expenses: expenseAgg[0]?.total || 0,
      salaryPaid: salaryByStatus.paid?.amount || 0,
      salaryPending: salaryByStatus.pending?.amount || 0,
      attendancePresent: (attByStatus.present || 0) + (attByStatus.late || 0),
      attendanceAbsent: attByStatus.absent || 0,
      attendanceLate: attByStatus.late || 0,
      attendanceLeave: attByStatus.leave || 0,
      enrollments: enrollAgg || 0,
    });
  }
  return trends;
}

async function expenseByCategory(month, year) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  const rows = await AcademyExpense.aggregate([
    { $match: { expenseDate: { $gte: start, $lte: end }, status: 'paid' } },
    { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    { $sort: { total: -1 } },
  ]);
  return rows.map((r) => ({
    category: r._id || 'other',
    total: r.total,
    count: r.count,
  }));
}

async function studentsByClass() {
  const rows = await AcademyStudent.aggregate([
    { $match: { status: 'active' } },
    { $group: { _id: '$classId', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 12 },
  ]);
  const classIds = rows.map((r) => r._id).filter(Boolean);
  const classes = await AcademyClass.find({ _id: { $in: classIds } }).select('className').lean();
  const nameById = Object.fromEntries(classes.map((c) => [String(c._id), c.className]));
  return rows.map((r) => ({
    classId: r._id ? String(r._id) : null,
    className: r._id ? nameById[String(r._id)] || 'Unknown' : 'Unassigned',
    count: r.count,
  }));
}

async function genderDistribution() {
  const rows = await AcademyStudent.aggregate([
    { $match: { status: 'active' } },
    { $group: { _id: '$gender', count: { $sum: 1 } } },
  ]);
  const map = Object.fromEntries(rows.map((r) => [r._id || 'unspecified', r.count]));
  return [
    { name: 'Male', value: map.male || 0 },
    { name: 'Female', value: map.female || 0 },
    { name: 'Other', value: map.other || 0 },
    { name: 'Unspecified', value: map.unspecified || 0 },
  ].filter((d) => d.value > 0);
}

async function upcomingBirthdays(limit = 8) {
  const students = await AcademyStudent.find({
    status: 'active',
    dateOfBirth: { $exists: true, $ne: null },
  })
    .select('studentName studentId dateOfBirth classId')
    .populate('classId', 'className')
    .lean();

  const today = new Date();
  const todayMd = today.getMonth() * 100 + today.getDate();

  const scored = students
    .map((s) => {
      const dob = new Date(s.dateOfBirth);
      if (Number.isNaN(dob.getTime())) return null;
      let next = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
      if (next < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
        next = new Date(today.getFullYear() + 1, dob.getMonth(), dob.getDate());
      }
      const md = dob.getMonth() * 100 + dob.getDate();
      const daysUntil = Math.round((next - today) / 86400000);
      return {
        id: String(s._id),
        name: s.studentName,
        studentId: s.studentId || '',
        className: s.classId?.className || '',
        dateOfBirth: dob.toISOString().slice(0, 10),
        nextBirthday: formatDateInTz(next),
        daysUntil,
        isToday: md === todayMd,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, limit);

  return scored;
}

async function feesByClass() {
  const rows = await AcademyFeeRecord.aggregate([
    {
      $lookup: {
        from: 'students',
        localField: 'studentId',
        foreignField: '_id',
        as: 'student',
      },
    },
    { $unwind: { path: '$student', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: '$student.classId',
        assessed: { $sum: '$amount' },
        collected: {
          $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] },
        },
        outstanding: {
          $sum: {
            $cond: [{ $in: ['$status', ['pending', 'overdue']] }, '$amount', 0],
          },
        },
      },
    },
    { $sort: { assessed: -1 } },
    { $limit: 20 },
  ]);
  const classIds = rows.map((r) => r._id).filter(Boolean);
  const classes = await AcademyClass.find({ _id: { $in: classIds } }).select('className').lean();
  const nameById = Object.fromEntries(classes.map((c) => [String(c._id), c.className]));
  return rows.map((r) => {
    const assessed = r.assessed || 0;
    const collected = r.collected || 0;
    const outstanding = r.outstanding || 0;
    return {
      classId: r._id ? String(r._id) : null,
      className: r._id ? nameById[String(r._id)] || 'Unknown' : 'Unassigned',
      assessed,
      collected,
      outstanding,
      pct: assessed > 0 ? Math.round((collected / assessed) * 100) : 0,
    };
  });
}

async function paymentMethodBreakdown() {
  const rows = await AcademyFeeRecord.aggregate([
    { $match: { status: 'paid' } },
    {
      $group: {
        _id: { $ifNull: ['$paymentMethod', 'other'] },
        amount: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { amount: -1 } },
  ]);
  const labels = {
    cash: 'Cash',
    bank_transfer: 'Bank Transfer',
    online: 'Online',
    other: 'Other',
  };
  return rows.map((r) => ({
    key: r._id || 'other',
    name: labels[r._id] || String(r._id || 'Other'),
    amount: r.amount || 0,
    count: r.count || 0,
  }));
}

async function feeTypeMonthlyTrends(months) {
  const out = [];
  for (const m of months) {
    // eslint-disable-next-line no-await-in-loop
    const rows = await AcademyFeeRecord.aggregate([
      { $match: { month: m.month, year: m.year, status: 'paid' } },
      { $group: { _id: '$feeType', amount: { $sum: '$amount' } } },
    ]);
    const byType = Object.fromEntries(rows.map((r) => [r._id, r.amount]));
    out.push({
      label: m.label,
      month: m.month,
      year: m.year,
      monthly: byType.monthly || 0,
      admission: byType.admission || 0,
      stationery: byType.stationery || 0,
    });
  }
  return out;
}

async function outstandingAging() {
  const now = new Date();
  const unpaid = await AcademyFeeRecord.find({ status: { $in: ['pending', 'overdue'] } })
    .select('amount dueDate studentId status')
    .lean();
  const buckets = [
    { key: '1-30', label: '1–30 days', min: 1, max: 30, amount: 0, students: new Set() },
    { key: '31-60', label: '31–60 days', min: 31, max: 60, amount: 0, students: new Set() },
    { key: '61-90', label: '61–90 days', min: 61, max: 90, amount: 0, students: new Set() },
    { key: '90+', label: '90+ days', min: 91, max: Infinity, amount: 0, students: new Set() },
  ];
  for (const fee of unpaid) {
    if (!fee.dueDate) continue;
    const days = Math.floor((now - new Date(fee.dueDate)) / (1000 * 60 * 60 * 24));
    if (days < 1) continue;
    const bucket = buckets.find((b) => days >= b.min && days <= b.max);
    if (!bucket) continue;
    bucket.amount += fee.amount || 0;
    if (fee.studentId) bucket.students.add(String(fee.studentId));
  }
  return buckets.map((b) => ({
    label: b.label,
    amount: b.amount,
    students: b.students.size,
  }));
}

async function studentPaymentStatus() {
  const rows = await AcademyFeeRecord.aggregate([
    {
      $group: {
        _id: '$studentId',
        unpaid: {
          $sum: { $cond: [{ $in: ['$status', ['pending', 'overdue']] }, 1, 0] },
        },
        paid: {
          $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] },
        },
        total: { $sum: 1 },
      },
    },
  ]);
  let fullyPaid = 0;
  let partiallyPaid = 0;
  let unpaid = 0;
  let overdueOnly = 0;
  for (const r of rows) {
    if (r.unpaid === 0 && r.paid > 0) fullyPaid += 1;
    else if (r.unpaid > 0 && r.paid > 0) partiallyPaid += 1;
    else if (r.unpaid > 0 && r.paid === 0) unpaid += 1;
  }
  // Overdue-focused count from unpaid fee records with overdue status
  const overdueStudents = await AcademyFeeRecord.distinct('studentId', { status: 'overdue' });
  overdueOnly = overdueStudents.length;
  const total = fullyPaid + partiallyPaid + unpaid || 1;
  return [
    { name: 'Fully Paid', students: fullyPaid, pct: Math.round((fullyPaid / total) * 1000) / 10 },
    { name: 'Partially Paid', students: partiallyPaid, pct: Math.round((partiallyPaid / total) * 1000) / 10 },
    { name: 'Unpaid', students: unpaid, pct: Math.round((unpaid / total) * 1000) / 10 },
    { name: 'Overdue', students: overdueOnly, pct: Math.round((overdueOnly / total) * 1000) / 10 },
  ];
}

async function getDashboardOverview({ months = 6 } = {}) {
  const today = todayYmd();
  const { start, end } = dayBounds(today);
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const window = monthWindow(Math.max(1, months) - 1);

  const [teacherRole, accountantRole, staffRoles] = await Promise.all([
    Role.findOne({ name: 'teacher' }).select('_id').lean(),
    Role.findOne({ name: 'accountant' }).select('_id').lean(),
    Role.find({ name: { $in: ['teacher', 'accountant'] } }).select('_id').lean(),
  ]);

  const [
    studentCounts,
    teacherCount,
    accountantCount,
    staffCount,
    classCount,
    sectionCount,
    subjectCount,
    feeSummaryAll,
    feeSummaryMonth,
    todayAttendance,
    staffAttendanceToday,
    expenseCategories,
    classBreakdown,
    trends,
    defaulters,
    gender,
    feeStatusAmounts,
    upcomingExams,
    recentAnnouncements,
    recentAdmissions,
    recentPayments,
    birthdays,
    pendingFeeAdmissions,
    classFeeCollections,
    paymentMethods,
    revenueByFeeType,
    agingBuckets,
    paymentStatus,
    recentExpenses,
    recentSalaries,
  ] = await Promise.all([
    AcademyStudent.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    teacherRole
      ? User.countDocuments({ isActive: true, role: teacherRole._id })
      : Promise.resolve(0),
    accountantRole
      ? User.countDocuments({ isActive: true, role: accountantRole._id })
      : Promise.resolve(0),
    User.countDocuments({
      isActive: true,
      role: { $in: staffRoles.map((r) => r._id) },
    }),
    AcademyClass.countDocuments({ status: 'active' }),
    AcademySection.countDocuments({}),
    AcademySubject.countDocuments({ status: 'active' }),
    feeService.getFeeSummary({}),
    feeService.getFeeSummary({ month, year }),
    AcademyAttendance.aggregate([
      {
        $match: {
          date: { $gte: start, $lte: end },
          $or: [{ subjectId: { $exists: false } }, { subjectId: null }],
        },
      },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    StaffAttendance.aggregate([
      { $match: { date: { $gte: start, $lte: end } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    expenseByCategory(month, year),
    studentsByClass(),
    monthlyFinanceTrends(window),
    feeService.getDefaultersSummary({}),
    genderDistribution(),
    AcademyFeeRecord.aggregate([
      { $match: { month, year } },
      { $group: { _id: '$status', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Exam.find({
      status: { $in: ['scheduled', 'ongoing'] },
      startDate: { $gte: start },
    })
      .sort({ startDate: 1 })
      .limit(6)
      .populate('academyClass', 'className')
      .select('title type startDate endDate status academyClass')
      .lean(),
    Announcement.find({})
      .sort({ publishedAt: -1, createdAt: -1 })
      .limit(6)
      .select('title publishedAt createdAt audience')
      .lean(),
    AcademyStudent.find({})
      .sort({ createdAt: -1 })
      .limit(6)
      .populate('classId', 'className')
      .select('studentName studentId status classId createdAt enrolledAt')
      .lean(),
    AcademyFeeRecord.find({ status: 'paid', paidAt: { $exists: true } })
      .sort({ paidAt: -1 })
      .limit(20)
      .populate('studentId', 'studentName studentId')
      .select('amount paidAt feeType month year studentId receiptNumber paymentMethod')
      .lean(),
    upcomingBirthdays(8),
    AcademyStudent.countDocuments({ status: 'pending_fee' }),
    feesByClass(),
    paymentMethodBreakdown(),
    feeTypeMonthlyTrends(window),
    outstandingAging(),
    studentPaymentStatus(),
    AcademyExpense.find({ status: 'paid' })
      .sort({ expenseDate: -1 })
      .limit(15)
      .select('title amount expenseDate category paymentMethod vendor status')
      .lean(),
    AcademySalaryRecord.find({})
      .sort({ updatedAt: -1 })
      .limit(15)
      .populate('staffId', 'name')
      .select('amount month year status paymentMethod paidAt staffId')
      .lean(),
  ]);

  const studentsByStatus = Object.fromEntries(
    studentCounts.map((r) => [r._id || 'unknown', r.count])
  );
  const activeStudents = studentsByStatus.active || 0;
  const attendanceToday = Object.fromEntries(todayAttendance.map((r) => [r._id, r.count]));
  const staffAtt = Object.fromEntries(staffAttendanceToday.map((r) => [r._id, r.count]));
  const markedToday =
    (attendanceToday.present || 0) +
    (attendanceToday.absent || 0) +
    (attendanceToday.late || 0) +
    (attendanceToday.leave || 0);
  const unmarkedToday = Math.max(0, activeStudents - markedToday);

  const netThisMonth =
    (feeSummaryMonth.totalPaid || 0) -
    (trends[trends.length - 1]?.expenses || 0) -
    (trends[trends.length - 1]?.salaryPaid || 0);

  const feeStatusMap = Object.fromEntries(
    feeStatusAmounts.map((r) => [r._id, { amount: r.amount, count: r.count }])
  );

  return {
    generatedAt: new Date().toISOString(),
    today,
    period: { month, year },
    kpis: {
      activeStudents,
      inactiveStudents: studentsByStatus.inactive || 0,
      pendingAdmissions: pendingFeeAdmissions || studentsByStatus.pending_fee || 0,
      teacherCount,
      accountantCount,
      staffCount,
      classCount,
      sectionCount,
      subjectCount,
      feesCollectedAll: feeSummaryAll.totalPaid || 0,
      feesOutstandingAll: feeSummaryAll.totalPending || 0,
      feesCollectedMonth: feeSummaryMonth.totalPaid || 0,
      feesOutstandingMonth: feeSummaryMonth.totalPending || 0,
      feeVouchersMonth: feeSummaryMonth.recordsCount || 0,
      expensesMonth: trends[trends.length - 1]?.expenses || 0,
      salaryPendingMonth: trends[trends.length - 1]?.salaryPending || 0,
      salaryPaidMonth: trends[trends.length - 1]?.salaryPaid || 0,
      netCashMonth: netThisMonth,
      defaulterCount: defaulters?.defaulterCount || 0,
      defaulterOutstanding: defaulters?.totalOutstanding || 0,
      presentToday: attendanceToday.present || 0,
      lateToday: attendanceToday.late || 0,
      absentToday: attendanceToday.absent || 0,
      leaveToday: attendanceToday.leave || 0,
      unmarkedToday,
      staffPresentToday: (staffAtt.present || 0) + (staffAtt.late || 0),
      staffAbsentToday: staffAtt.absent || 0,
      upcomingExamsCount: upcomingExams.length,
      attendanceRateToday:
        activeStudents > 0
          ? Math.round(
              (((attendanceToday.present || 0) + (attendanceToday.late || 0)) / activeStudents) * 100
            )
          : null,
    },
    charts: {
      monthlyTrends: trends,
      feeStatusMonth: [
        { name: 'Paid', value: feeStatusMap.paid?.amount || 0, count: feeStatusMap.paid?.count || 0 },
        {
          name: 'Pending',
          value: feeStatusMap.pending?.amount || 0,
          count: feeStatusMap.pending?.count || 0,
        },
        {
          name: 'Overdue',
          value: feeStatusMap.overdue?.amount || 0,
          count: feeStatusMap.overdue?.count || 0,
        },
        {
          name: 'Waived',
          value: feeStatusMap.waived?.amount || 0,
          count: feeStatusMap.waived?.count || 0,
        },
      ],
      attendanceToday: [
        { name: 'Present', value: attendanceToday.present || 0 },
        { name: 'Late', value: attendanceToday.late || 0 },
        { name: 'Absent', value: attendanceToday.absent || 0 },
        { name: 'Leave', value: attendanceToday.leave || 0 },
        { name: 'Unmarked', value: unmarkedToday },
      ],
      expensesByCategory: expenseCategories,
      studentsByClass: classBreakdown,
      genderDistribution: gender,
      feesByClass: classFeeCollections,
      paymentMethods,
      revenueByFeeType,
      agingBuckets,
      studentPaymentStatus: paymentStatus,
    },
    widgets: {
      upcomingExams: upcomingExams.map((e) => ({
        id: String(e._id),
        title: e.title,
        type: e.type,
        status: e.status,
        startDate: e.startDate,
        endDate: e.endDate,
        className: e.academyClass?.className || '',
      })),
      upcomingBirthdays: birthdays,
      recentAdmissions: recentAdmissions.map((s) => ({
        id: String(s._id),
        name: s.studentName,
        studentId: s.studentId || '',
        status: s.status,
        className: s.classId?.className || '',
        at: s.enrolledAt || s.createdAt,
      })),
      recentPayments: recentPayments.map((p) => ({
        id: String(p._id),
        amount: p.amount,
        paidAt: p.paidAt,
        feeType: p.feeType,
        month: p.month,
        year: p.year,
        voucherNumber: p.receiptNumber || '',
        paymentMethod: p.paymentMethod || 'cash',
        studentName: p.studentId?.studentName || '—',
        studentId: p.studentId?.studentId || '',
      })),
      recentExpenses: recentExpenses.map((e) => ({
        id: String(e._id),
        title: e.title,
        amount: e.amount,
        expenseDate: e.expenseDate,
        category: e.category || 'other',
        paymentMethod: e.paymentMethod || 'other',
        vendor: e.vendor || '',
        status: e.status,
      })),
      recentSalaries: recentSalaries.map((s) => ({
        id: String(s._id),
        amount: s.amount,
        month: s.month,
        year: s.year,
        status: s.status,
        paymentMethod: s.paymentMethod || 'other',
        paidAt: s.paidAt || null,
        staffName: s.staffId?.name || 'Staff',
      })),
      recentAnnouncements: recentAnnouncements.map((a) => ({
        id: String(a._id),
        title: a.title,
        at: a.publishedAt || a.createdAt,
        audience: a.audience || '',
      })),
    },
  };
}

module.exports = { getDashboardOverview };
