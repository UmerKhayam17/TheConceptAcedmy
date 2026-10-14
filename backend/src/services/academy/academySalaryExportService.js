const AcademySalaryRecord = require('../../models/academy/AcademySalaryRecord');
const User = require('../../models/User');
const Role = require('../../models/Role');
const { renderBrandedPdf, renderBrandedExcel, formatDate } = require('./academyReportDocument');

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
  const r = rec.staffId && typeof rec.staffId === 'object' ? rec.staffId.role : null;
  if (r && typeof r === 'object') return r.name || '—';
  return '—';
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
  const roles = await Role.find({ name: { $in: ['teacher', 'accountant'] } }).select('_id');
  const users = await User.find({ role: { $in: roles.map((r) => r._id) }, isActive: true }).select(
    '_id'
  );
  q.staffId = { $in: users.map((u) => u._id) };

  const s = String(search || '').trim();
  if (s) {
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = { $regex: escaped, $options: 'i' };
    const matched = await User.find({
      $or: [{ name: rx }, { email: rx }, { phone: rx }],
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

async function loadSalaryData(filters) {
  const q = await buildSalaryQuery(filters);
  const records = await AcademySalaryRecord.find(q)
    .populate({
      path: 'staffId',
      select: 'name email phone salary payType salaryPercentage',
      populate: { path: 'role', select: 'name' },
    })
    .sort({ year: -1, month: -1, createdAt: -1 })
    .limit(2000)
    .lean();

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
    return {
      serial: idx + 1,
      voucher: r.voucherNumber || '—',
      staff: staffName(r),
      role: staffRole(r),
      period: `${MONTHS[(r.month || 1) - 1] || ''} ${r.year || ''}`.trim(),
      payType: payType === 'percentage' ? 'Percentage' : 'Fixed',
      rate: typeof rate === 'number' ? rate : rate,
      amount,
      status: String(r.status || '').replace(/^\w/, (c) => c.toUpperCase()),
      paidAt: r.paidAt ? formatDate(r.paidAt) : '—',
      method: r.paymentMethod ? String(r.paymentMethod).replace(/_/g, ' ') : '—',
    };
  });

  return {
    rows,
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
  if (roleName) parts.push(roleName === 'teacher' ? 'Teachers' : 'Accountants');
  else parts.push('All staff');
  if (status) parts.push(String(status).replace(/^\w/, (c) => c.toUpperCase()));
  else parts.push('All statuses');
  if (search) parts.push(`Search: ${search}`);
  return parts.join(' · ');
}

const COLUMNS = [
  { key: 'serial', header: 'S.No', excelWidth: 8, pdfWidth: 32, align: 'center' },
  { key: 'voucher', header: 'Voucher', excelWidth: 16, pdfWidth: 78 },
  { key: 'staff', header: 'Staff', excelWidth: 18, pdfWidth: 95, wrap: true },
  { key: 'role', header: 'Role', excelWidth: 12, pdfWidth: 55 },
  { key: 'period', header: 'Period', excelWidth: 14, pdfWidth: 70 },
  { key: 'payType', header: 'Pay type', excelWidth: 12, pdfWidth: 58, align: 'center' },
  { key: 'rate', header: 'Rate / Base', excelWidth: 12, pdfWidth: 58, align: 'right' },
  {
    key: 'amount',
    header: 'Amount',
    excelWidth: 14,
    pdfWidth: 68,
    align: 'right',
    numFmt: '#,##0.00',
  },
  { key: 'status', header: 'Status', excelWidth: 10, pdfWidth: 50, align: 'center' },
  { key: 'paidAt', header: 'Paid on', excelWidth: 12, pdfWidth: 55, align: 'center' },
  { key: 'method', header: 'Method', excelWidth: 14, pdfWidth: 60 },
];

async function exportSalaryReport(filters = {}) {
  const format = String(filters.format || 'xlsx').toLowerCase() === 'pdf' ? 'pdf' : 'xlsx';
  const { rows, totalAmount, paidAmount, pendingAmount, count } = await loadSalaryData(filters);

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
        : 'All staff';

  const meta = {
    leftFilter: staffLabel,
    centerFilter: `Total vouchers: ${count}`,
    rightFilter: periodBits.join(' · '),
    filterLine: filterLine(filters),
    countLabel: `Total vouchers: ${count}`,
    extraLine: `Total ${totalAmount.toLocaleString('en-PK')} · Paid ${paidAmount.toLocaleString(
      'en-PK'
    )} · Pending ${pendingAmount.toLocaleString('en-PK')}`,
    generatedAt: new Date(),
  };

  const reportRows = [...rows];
  if (rows.length) {
    reportRows.push({
      _isTotal: true,
      serial: '',
      voucher: '',
      staff: 'Total',
      role: '',
      period: '',
      payType: '',
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
    columns: COLUMNS,
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
    };
  },
};
