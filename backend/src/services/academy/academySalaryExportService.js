const AcademySalaryRecord = require('../../models/academy/AcademySalaryRecord');
const AcademyClass = require('../../models/academy/AcademyClass');
const AcademySection = require('../../models/academy/AcademySection');
const User = require('../../models/User');
const Role = require('../../models/Role');
const Session = require('../../models/Session');
const TeacherAssignment = require('../../models/timetable/TeacherAssignment');
const ScheduleSlot = require('../../models/timetable/ScheduleSlot');
// Register models used by timetable populate (TeacherAssignment / ScheduleSlot).
require('../../models/academy/AcademySubject');
const { renderBrandedPdf, renderBrandedExcel, formatDate } = require('./academyReportDocument');
const { STAFF_ROLE_NAMES, NON_TEACHING_ROLE } = require('../../config/staffRoles');

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function staffName(rec) {
  const s = rec.staffId;
  if (s && typeof s === 'object') return s.name || '—';
  return '—';
}

function staffRole(rec) {
  const s = rec.staffId && typeof rec.staffId === 'object' ? rec.staffId : null;
  const r = s?.role;
  if (!r || typeof r !== 'object') return '—';
  // Support staff show their job (Guard, Sweeper, …) instead of the generic role name.
  if (r.name === NON_TEACHING_ROLE) return s.designation || 'Non-teaching';
  return r.name || '—';
}

function shortVoucher(v) {
  const parts = String(v || '').split('-');
  if (parts.length >= 3 && parts[0].toUpperCase() === 'SAL') return parts[1];
  // Any other format: show the last part (e.g. "DUMMY-SAL-202610-001" → "001").
  if (parts.length >= 2 && parts[parts.length - 1]) return parts[parts.length - 1];
  return v || '—';
}

function isTeacherRecord(rec) {
  const s = rec.staffId && typeof rec.staffId === 'object' ? rec.staffId : null;
  const r = s?.role;
  return String(r?.name || '').toLowerCase() === 'teacher';
}

function payTypeOf(rec) {
  if (rec.payType === 'percentage') return 'percentage';
  const s = rec.staffId && typeof rec.staffId === 'object' ? rec.staffId : null;
  if (s?.payType === 'percentage') return 'percentage';
  return 'fixed';
}

function rateLabel(rec) {
  if (payTypeOf(rec) === 'percentage') {
    const pct =
      typeof rec.salaryPercentage === 'number'
        ? rec.salaryPercentage
        : Number(rec.staffId?.salaryPercentage || 0);
    return `${pct}%`;
  }
  const base = Number(rec.staffId?.salary || 0);
  return base > 0 ? base : 0;
}

/** "9th" + "A1" → "9TH-A1" (matches Staff Salary Excel sample). */
function classSectionLabel(className, sectionName) {
  const c = String(className || '')
    .trim()
    .toUpperCase();
  const s = String(sectionName || '')
    .trim()
    .toUpperCase();
  if (!c) return '';
  return s ? `${c}-${s}` : c;
}

function classSortKey(label) {
  const m = String(label).match(/(\d+)/);
  const n = m ? Number(m[1]) : 999;
  return `${String(n).padStart(3, '0')}|${label}`;
}

async function loadClassSectionLabels() {
  const session = await Session.findOne({ isActive: true }).select('_id').lean();
  const classQ = { status: 'active' };
  if (session?._id) classQ.sessionId = session._id;
  const classes = await AcademyClass.find(classQ).select('_id className').lean();
  if (!classes.length) return [];
  const sections = await AcademySection.find({
    classId: { $in: classes.map((c) => c._id) },
    status: 'active',
  })
    .select('classId sectionName')
    .lean();
  const byClass = new Map(classes.map((c) => [String(c._id), c.className]));
  const labels = [];
  for (const sec of sections) {
    const label = classSectionLabel(byClass.get(String(sec.classId)), sec.sectionName);
    if (label) labels.push(label);
  }
  return [...new Set(labels)].sort((a, b) => classSortKey(a).localeCompare(classSortKey(b)));
}

function amountsFromBreakdown(breakdown) {
  const map = new Map();
  for (const line of breakdown || []) {
    const label = classSectionLabel(line.className, line.sectionName);
    if (!label) continue;
    const salary = Number(line.salary) || 0;
    map.set(label, (map.get(label) || 0) + salary);
  }
  return map;
}

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

async function buildSalaryQuery({ staffId, status, month, year, roleName, search, ids }) {
  const q = {};
  if (status) q.status = status;
  if (month) q.month = Number(month);
  if (year) q.year = Number(year);
  if (Array.isArray(ids) && ids.length) {
    q._id = { $in: ids };
    return q;
  }
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
  const roles = await Role.find({ name: { $in: STAFF_ROLE_NAMES } }).select('_id');
  const users = await User.find({ role: { $in: roles.map((r) => r._id) }, isActive: true }).select(
    '_id'
  );
  q.staffId = { $in: users.map((u) => u._id) };

  const s = String(search || '').trim();
  if (s) {
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = { $regex: escaped, $options: 'i' };
    const matched = await User.find({
      $or: [{ name: rx }, { email: rx }, { phone: rx }, { designation: rx }],
    }).select('_id');
    return {
      $and: [
        q,
        {
          $or: [
            { staffId: { $in: matched.map((u) => u._id) } },
            { voucherNumber: rx },
            { notes: rx },
          ],
        },
      ],
    };
  }
  return q;
}

/**
 * One batched load of teaching class/section labels for many teachers.
 * Avoids per-teacher month attendance (listMonth) which made exports take 15–30s+.
 */
async function loadTeachingClassLabelsByStaff(staffIds) {
  const ids = [...new Set((staffIds || []).map(String).filter(Boolean))];
  const byStaff = new Map(ids.map((id) => [id, new Set()]));
  if (!ids.length) return byStaff;

  const objectIds = ids.map((id) => id);

  const [assignments, slots] = await Promise.all([
    TeacherAssignment.find({ teacher: { $in: objectIds }, isActive: true })
      .populate({ path: 'class', select: 'className' })
      .populate({ path: 'section', select: 'sectionName' })
      .populate({ path: 'subject', select: 'status' })
      .select('teacher class section subject')
      .lean(),
    ScheduleSlot.find({
      cancelled: { $ne: true },
      isSubstitute: { $ne: true },
      $or: [{ teacher: { $in: objectIds } }, { 'parallelEntries.teacher': { $in: objectIds } }],
    })
      .populate({ path: 'class', select: 'className' })
      .populate({ path: 'section', select: 'sectionName' })
      .populate({ path: 'subject', select: 'status' })
      .populate({ path: 'parallelEntries.subject', select: 'status' })
      .select('teacher class section subject parallelEntries')
      .lean(),
  ]);

  for (const a of assignments) {
    const tid = String(a.teacher || '');
    if (!byStaff.has(tid)) continue;
    if (a.subject?.status === 'inactive') continue;
    const label = classSectionLabel(a.class?.className, a.section?.sectionName);
    if (label) byStaff.get(tid).add(label);
  }

  for (const slot of slots) {
    const addFor = (teacherRef, subject) => {
      const tid = String(teacherRef || '');
      if (!tid || !byStaff.has(tid)) return;
      if (subject?.status === 'inactive') return;
      const label = classSectionLabel(slot.class?.className, slot.section?.sectionName);
      if (label) byStaff.get(tid).add(label);
    };
    addFor(slot.teacher, slot.subject);
    for (const pe of slot.parallelEntries || []) {
      addFor(pe.teacher, pe.subject);
    }
  }

  return byStaff;
}

/** Equal split of amount across class labels (export-fast path). */
function amountsEqualSplit(labels, amount) {
  const list = [...(labels || [])].filter(Boolean);
  const total = Number(amount) || 0;
  if (!list.length || total <= 0) return new Map();
  const map = new Map();
  let allocated = 0;
  list.forEach((label, idx) => {
    const value =
      idx === list.length - 1
        ? roundMoney(total - allocated)
        : roundMoney(total / list.length);
    allocated = roundMoney(allocated + value);
    map.set(label, value);
  });
  return map;
}

function classAmountsForRecord(rec, teachingLabelsByStaff) {
  const fromBreakdown = amountsFromBreakdown(rec.calculationBreakdown);
  if (fromBreakdown.size) return fromBreakdown;

  if (!isTeacherRecord(rec) || payTypeOf(rec) !== 'fixed') return new Map();

  const staffId = String(rec.staffId?._id || rec.staffId || '');
  if (!staffId) return new Map();
  const labels = teachingLabelsByStaff.get(staffId);
  return amountsEqualSplit(labels, rec.amount);
}

async function loadSalaryData(filters) {
  const q = await buildSalaryQuery(filters);
  const [records, classLabels] = await Promise.all([
    AcademySalaryRecord.find(q)
      .populate({
        path: 'staffId',
        select: 'name email phone salary payType salaryPercentage designation',
        populate: { path: 'role', select: 'name' },
      })
      .sort({ year: -1, month: -1, createdAt: -1 })
      .limit(2000)
      .lean(),
    loadClassSectionLabels(),
  ]);

  // Only fixed teachers without a stored breakdown need teaching-class lookup.
  const staffNeedingClasses = [];
  for (const r of records) {
    if (!isTeacherRecord(r) || payTypeOf(r) !== 'fixed') continue;
    if (Array.isArray(r.calculationBreakdown) && r.calculationBreakdown.length) continue;
    const id = String(r.staffId?._id || r.staffId || '');
    if (id) staffNeedingClasses.push(id);
  }
  const teachingLabelsByStaff = await loadTeachingClassLabelsByStaff(staffNeedingClasses);

  let totalAmount = 0;
  let paidAmount = 0;
  let pendingAmount = 0;

  const rows = records.map((r, idx) => {
    const amount = Number(r.amount) || 0;
    totalAmount += amount;
    if (r.status === 'paid') paidAmount += amount;
    if (r.status === 'pending') pendingAmount += amount;
    const payType = payTypeOf(r);
    const rate = rateLabel(r);
    const classMap = classAmountsForRecord(r, teachingLabelsByStaff);
    const classFields = {};
    for (const label of classLabels) {
      const key = `class:${label}`;
      if (classMap.has(label)) {
        classFields[key] = roundMoney(classMap.get(label));
      } else {
        classFields[key] = '-';
      }
    }

    return {
      serial: idx + 1,
      voucher: r.voucherNumber || '—',
      // PDF only: "SAL-C2C3BD-202611" → "C2C3BD".
      voucherShort: shortVoucher(r.voucherNumber),
      staff: String(staffName(r) || '—').toUpperCase(),
      role: staffRole(r),
      roleCap: String(staffRole(r)).replace(/^\w/, (c) => c.toUpperCase()),
      period: `${MONTHS[(r.month || 1) - 1] || ''} ${r.year || ''}`.trim(),
      payType: payType === 'percentage' ? 'Percentage' : 'Fixed',
      ...classFields,
      rate: typeof rate === 'number' ? rate : rate,
      amount,
      status: String(r.status || '').replace(/^\w/, (c) => c.toUpperCase()),
      paidAt: r.paidAt ? formatDate(r.paidAt) : '—',
      method: r.paymentMethod ? String(r.paymentMethod).replace(/_/g, ' ') : '—',
      // PDF only: "bank transfer" → "Bank Transfer".
      methodCap: r.paymentMethod
        ? String(r.paymentMethod)
            .replace(/_/g, ' ')
            .replace(/(^|\s)(\w)/g, (m, sp, c) => sp + c.toUpperCase())
        : '—',
    };
  });

  return {
    rows,
    classLabels,
    totalAmount,
    paidAmount,
    pendingAmount,
    count: rows.length,
  };
}

function filterLine({ month, year, status, roleName, search }) {
  const parts = [];
  if (month && year) parts.push(`${MONTHS[Number(month) - 1] || month} ${year}`);
  else if (year) parts.push(`Year ${year}`);
  if (roleName) {
    parts.push(
      roleName === 'teacher'
        ? 'Teachers'
        : roleName === NON_TEACHING_ROLE
          ? 'Non-teaching staff'
          : 'Accountants'
    );
  } else parts.push('All staff');
  if (status) parts.push(String(status).replace(/^\w/, (c) => c.toUpperCase()));
  else parts.push('All statuses');
  if (search) parts.push(`Search: ${search}`);
  return parts.join(' · ');
}

function buildColumns(classLabels, { forPdf = false } = {}) {
  const classCols = (classLabels || []).map((label) => ({
    key: `class:${label}`,
    header: label,
    excelWidth: 13,
    pdfWidth: forPdf ? 28 : 36,
    align: 'center',
  }));

  if (forPdf) {
    // PDF: no Period column, short voucher, capitalised role; widths are auto-fitted to content.
    const pdfClassCols = classCols.map((c) => ({ ...c, numFmt: '#,##0.00' }));
    return [
      { key: 'serial', header: 'S.No', excelWidth: 8, pdfWidth: 24, align: 'center' },
      { key: 'voucherShort', header: 'Voucher', excelWidth: 16, pdfWidth: 42, align: 'center' },
      { key: 'staff', header: 'Staff', excelWidth: 18, pdfWidth: 80, wrap: true },
      { key: 'roleCap', header: 'Role', excelWidth: 12, pdfWidth: 48, wrap: true },
      { key: 'payType', header: 'Pay type', excelWidth: 12, pdfWidth: 48, align: 'center' },
      ...pdfClassCols,
      { key: 'rate', header: 'Rate / Base', excelWidth: 12, pdfWidth: 42, align: 'center' },
      { key: 'amount', header: 'Amount', excelWidth: 14, pdfWidth: 60, align: 'center', numFmt: '#,##0.00' },
      { key: 'status', header: 'Status', excelWidth: 10, pdfWidth: 44, align: 'center' },
      // Paid on gets a little extra room; Method stays narrow (wraps "Bank / Transfer").
      { key: 'paidAt', header: 'Paid on', excelWidth: 12, pdfWidth: 48, align: 'center', autoFitExtra: 8 },
      {
        key: 'methodCap',
        header: 'Method',
        excelWidth: 14,
        pdfWidth: 52,
        align: 'center',
        wrap: true,
        autoFitNoGrow: true,
      },
    ];
  }

  return [
    { key: 'serial', header: 'S.No', excelWidth: 8, pdfWidth: 28, align: 'center' },
    { key: 'voucher', header: 'Voucher', excelWidth: 16, pdfWidth: 70 },
    { key: 'staff', header: 'Staff', excelWidth: 18, pdfWidth: 78, wrap: true },
    { key: 'role', header: 'Role', excelWidth: 12, pdfWidth: 48 },
    { key: 'period', header: 'Period', excelWidth: 14, pdfWidth: 58 },
    { key: 'payType', header: 'Pay type', excelWidth: 12, pdfWidth: 48, align: 'center' },
    ...classCols,
    { key: 'rate', header: 'Rate / Base', excelWidth: 12, pdfWidth: 48, align: 'center' },
    {
      key: 'amount',
      header: 'Amount',
      excelWidth: 14,
      pdfWidth: 58,
      align: 'center',
      numFmt: '#,##0.00',
    },
    { key: 'status', header: 'Status', excelWidth: 10, pdfWidth: 44, align: 'center' },
    { key: 'paidAt', header: 'Paid on', excelWidth: 12, pdfWidth: 48, align: 'center' },
    { key: 'method', header: 'Method', excelWidth: 14, pdfWidth: 52, align: 'center' },
  ];
}

async function exportSalaryReport(filters = {}) {
  const format = String(filters.format || 'xlsx').toLowerCase() === 'pdf' ? 'pdf' : 'xlsx';
  const { rows, classLabels, totalAmount, paidAmount, pendingAmount, count } =
    await loadSalaryData(filters);

  const periodBits = [];
  if (filters.month && filters.year) {
    periodBits.push(`${MONTHS[Number(filters.month) - 1] || filters.month} ${filters.year}`);
  } else if (filters.year) {
    periodBits.push(`Year ${filters.year}`);
  }
  if (filters.status) {
    periodBits.push(String(filters.status).replace(/^\w/, (c) => c.toUpperCase()));
  } else {
    periodBits.push('All statuses');
  }
  if (filters.search) periodBits.push(`Search: ${filters.search}`);

  const staffLabel =
    filters.roleName === 'teacher'
      ? 'Teachers'
      : filters.roleName === 'accountant'
        ? 'Accountants'
        : filters.roleName === NON_TEACHING_ROLE
          ? 'Non-teaching staff'
          : 'All staff';

  const meta = {
    leftFilter: staffLabel,
    centerFilter: `Total vouchers: ${count}`,
    rightFilter: periodBits.join(' · '),
    // Match sample: identity band | class+rate band | amount/status band
    filterLeftCols: 3,
    filterRightCols: 4,
    filterLine: filterLine(filters),
    countLabel: `Total vouchers: ${count}`,
    extraLine: `Total ${totalAmount.toLocaleString('en-PK')} · Paid ${paidAmount.toLocaleString(
      'en-PK'
    )} · Pending ${pendingAmount.toLocaleString('en-PK')}`,
    generatedAt: new Date(),
  };

  const reportRows = [...rows];
  if (rows.length) {
    const blankClasses = Object.fromEntries(
      (classLabels || []).map((label) => [`class:${label}`, ''])
    );
    reportRows.push({
      _isTotal: true,
      serial: '',
      voucher: '',
      voucherShort: '',
      roleCap: '',
      methodCap: '',
      staff: 'Total',
      role: '',
      period: '',
      payType: '',
      ...blankClasses,
      rate: '',
      amount: totalAmount,
      status: '',
      paidAt: '',
      method: '',
    });
  }

  const payload = {
    title: 'Staff Salary Report',
    sheetName: 'Salaries',
    confidentialLabel: 'Staff salary report',
    subject: 'Staff salaries',
    columns: buildColumns(classLabels, { forPdf: format === 'pdf' }),
    autoFitColumns: format === 'pdf',
    mergeTotalLabel: format === 'pdf',
    rows: reportRows,
    meta,
    emptyMessage: 'No salary vouchers match the selected filters.',
    plain: true,
  };

  if (format === 'pdf') {
    return renderBrandedPdf(payload);
  }
  return renderBrandedExcel(payload);
}

module.exports = {
  exportSalaryReport,
  loadSalaryRows: async (filters) => {
    const data = await loadSalaryData(filters);
    return {
      rows: data.rows,
      totalAmount: data.totalAmount,
      paidAmount: data.paidAmount,
      pendingAmount: data.pendingAmount,
      count: data.count,
      classLabels: data.classLabels,
    };
  },
};
