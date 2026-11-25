const AcademyStaffAdvance = require('../../models/academy/AcademyStaffAdvance');
const User = require('../../models/User');
// Registers the model used by `repayments.salaryRecordId` populate.
require('../../models/academy/AcademySalaryRecord');
const { renderBrandedPdf, renderBrandedExcel, formatDate } = require('./academyReportDocument');
const { NON_TEACHING_ROLE } = require('../../config/staffRoles');

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TYPE_LABEL = { advance: 'Advance', loan: 'Loan' };
const STATUS_LABEL = { active: 'Active', closed: 'Closed', cancelled: 'Cancelled' };
const METHOD_LABEL = { cash: 'Cash', bank_transfer: 'Bank transfer', online: 'Online', other: 'Other' };
const MONEY = '#,##0.00';

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pkr = (n) => round(n).toLocaleString('en-PK');

function staffName(adv) {
  return adv.staffId && typeof adv.staffId === 'object' ? adv.staffId.name || '—' : '—';
}

function staffRole(adv) {
  const s = adv.staffId && typeof adv.staffId === 'object' ? adv.staffId : null;
  const r = s?.role;
  if (!r || typeof r !== 'object') return '—';
  // Support staff show their job (Guard, Sweeper, …) instead of the generic role name.
  if (r.name === NON_TEACHING_ROLE) return s.designation || 'Non-teaching';
  return r.name ? r.name.replace(/^\w/, (c) => c.toUpperCase()) : '—';
}

function methodLabel(m) {
  if (!m) return '—';
  return METHOD_LABEL[m] || String(m).replace(/_/g, ' ');
}

function periodShort(month, year) {
  if (!month || !year) return '—';
  return `${MONTHS_SHORT[month - 1] || month} ${year}`;
}

/** Same filters as the Advances & Loans list page. */
async function buildQuery({ staffId, type, status, search, ids }) {
  const q = {};
  if (Array.isArray(ids) && ids.length) {
    q._id = { $in: ids };
    return q;
  }
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

async function loadAdvances(filters) {
  const q = await buildQuery(filters);
  return AcademyStaffAdvance.find(q)
    .populate({
      path: 'staffId',
      select: 'name designation',
      populate: { path: 'role', select: 'name' },
    })
    .populate({ path: 'repayments.salaryRecordId', select: 'voucherNumber month year' })
    .sort({ status: 1, givenDate: -1, createdAt: -1 })
    .limit(2000)
    .lean();
}

function filterBits({ type, status, search, ids }) {
  if (Array.isArray(ids) && ids.length) {
    return [ids.length === 1 ? 'One record' : `${ids.length} selected records`];
  }
  const parts = [];
  parts.push(type ? `${TYPE_LABEL[type] || type}s` : 'Advances & loans');
  parts.push(status ? STATUS_LABEL[status] || status : 'All statuses');
  if (search) parts.push(`Search: ${search}`);
  return parts;
}

// ─── Report 1: Advances & Loans list ─────────────────────────────────────────

const LIST_COLUMNS = [
  { key: 'serial', header: 'S.No', excelWidth: 7, pdfWidth: 30, align: 'center' },
  { key: 'staff', header: 'Staff', excelWidth: 20, pdfWidth: 92, wrap: true },
  { key: 'role', header: 'Role', excelWidth: 13, pdfWidth: 58 },
  { key: 'type', header: 'Type', excelWidth: 9, pdfWidth: 44, align: 'center' },
  { key: 'givenOn', header: 'Given on', excelWidth: 12, pdfWidth: 56, align: 'center' },
  { key: 'amount', header: 'Amount', excelWidth: 13, pdfWidth: 60, align: 'right', numFmt: MONEY },
  { key: 'installment', header: 'Per month', excelWidth: 12, pdfWidth: 56, align: 'right', numFmt: MONEY },
  { key: 'startFrom', header: 'Deduct from', excelWidth: 12, pdfWidth: 54, align: 'center' },
  { key: 'recovered', header: 'Recovered', excelWidth: 13, pdfWidth: 60, align: 'right', numFmt: MONEY },
  { key: 'remaining', header: 'Still owed', excelWidth: 13, pdfWidth: 60, align: 'right', numFmt: MONEY },
  { key: 'status', header: 'Status', excelWidth: 10, pdfWidth: 50, align: 'center' },
  { key: 'method', header: 'Paid out by', excelWidth: 13, pdfWidth: 56 },
];

async function exportListReport(filters, format) {
  const advances = await loadAdvances(filters);
  let given = 0;
  let recovered = 0;
  let owed = 0;
  let active = 0;

  const rows = advances.map((a, idx) => {
    const amount = round(a.amount);
    const rec = round(a.recoveredAmount);
    const cancelled = a.status === 'cancelled';
    const remaining = cancelled ? 0 : round(Math.max(0, amount - rec));
    if (!cancelled) {
      given += amount;
      recovered += rec;
      owed += remaining;
    }
    if (a.status === 'active') active += 1;
    return {
      serial: idx + 1,
      staff: staffName(a),
      role: staffRole(a),
      type: TYPE_LABEL[a.type] || a.type,
      givenOn: a.givenDate ? formatDate(a.givenDate) : '—',
      amount,
      // An advance is taken back in full from the next salary.
      installment: a.type === 'loan' ? round(a.installmentAmount) : amount,
      startFrom: periodShort(a.startMonth, a.startYear),
      recovered: rec,
      remaining: cancelled ? '—' : remaining,
      status: STATUS_LABEL[a.status] || a.status,
      method: methodLabel(a.paymentMethod),
    };
  });

  if (rows.length) {
    rows.push({
      _isTotal: true,
      serial: '',
      staff: 'Total',
      role: '',
      type: '',
      givenOn: '',
      amount: round(given),
      installment: '',
      startFrom: '',
      recovered: round(recovered),
      remaining: round(owed),
      status: '',
      method: '',
    });
  }

  const bits = filterBits(filters);
  const count = advances.length;
  const payload = {
    title: 'Staff Advances & Loans Report',
    sheetName: 'Advances & Loans',
    confidentialLabel: 'Staff advances & loans report',
    subject: 'Staff advances and loans',
    columns: LIST_COLUMNS,
    rows,
    meta: {
      leftFilter: bits[0],
      centerFilter: `Total records: ${count}`,
      rightFilter: bits.slice(1).join(' · '),
      filterLine: bits.join(' · '),
      countLabel: `Total records: ${count}`,
      extraLine: `Given ${pkr(given)} · Recovered ${pkr(recovered)} · Still owed ${pkr(owed)} · Active ${active}`,
      generatedAt: new Date(),
    },
    emptyMessage: 'No advances or loans match the selected filters.',
    plain: true,
  };
  return format === 'pdf' ? renderBrandedPdf(payload) : renderBrandedExcel(payload);
}

// ─── Report 2: Repayment history ─────────────────────────────────────────────

const REPAY_COLUMNS = [
  { key: 'serial', header: 'S.No', excelWidth: 7, pdfWidth: 30, align: 'center' },
  { key: 'date', header: 'Date', excelWidth: 12, pdfWidth: 60, align: 'center' },
  { key: 'staff', header: 'Staff', excelWidth: 20, pdfWidth: 100, wrap: true },
  { key: 'role', header: 'Role', excelWidth: 13, pdfWidth: 60 },
  { key: 'type', header: 'Type', excelWidth: 9, pdfWidth: 46, align: 'center' },
  { key: 'given', header: 'Original amount', excelWidth: 15, pdfWidth: 72, align: 'right', numFmt: MONEY },
  { key: 'via', header: 'Recovered by', excelWidth: 15, pdfWidth: 80 },
  { key: 'reference', header: 'Salary voucher', excelWidth: 18, pdfWidth: 96 },
  { key: 'amount', header: 'Amount', excelWidth: 13, pdfWidth: 66, align: 'right', numFmt: MONEY },
  { key: 'status', header: 'Record status', excelWidth: 12, pdfWidth: 62, align: 'center' },
];

async function exportRepaymentReport(filters, format) {
  const advances = await loadAdvances(filters);
  const lines = [];
  advances.forEach((a) => {
    (a.repayments || []).forEach((r) => {
      const value = round(r.amount);
      if (value <= 0) return;
      const voucher = r.salaryRecordId && typeof r.salaryRecordId === 'object' ? r.salaryRecordId : null;
      const viaSalary = Boolean(r.salaryRecordId);
      lines.push({
        when: r.paidAt ? new Date(r.paidAt) : a.givenDate ? new Date(a.givenDate) : new Date(0),
        staff: staffName(a),
        role: staffRole(a),
        type: TYPE_LABEL[a.type] || a.type,
        given: round(a.amount),
        via: viaSalary ? 'Salary deduction' : 'Paid back directly',
        reference: viaSalary
          ? `${voucher?.voucherNumber || 'Voucher'} (${periodShort(r.month || voucher?.month, r.year || voucher?.year)})`
          : '—',
        amount: value,
        viaSalary,
        status: STATUS_LABEL[a.status] || a.status,
      });
    });
  });
  lines.sort((x, y) => y.when - x.when);

  let total = 0;
  let salaryTotal = 0;
  let cashTotal = 0;
  const rows = lines.map((l, idx) => {
    total += l.amount;
    if (l.viaSalary) salaryTotal += l.amount;
    else cashTotal += l.amount;
    return {
      serial: idx + 1,
      date: formatDate(l.when),
      staff: l.staff,
      role: l.role,
      type: l.type,
      given: l.given,
      via: l.via,
      reference: l.reference,
      amount: l.amount,
      status: l.status,
    };
  });
  if (rows.length) {
    rows.push({
      _isTotal: true,
      serial: '',
      date: '',
      staff: 'Total',
      role: '',
      type: '',
      given: '',
      via: '',
      reference: '',
      amount: round(total),
      status: '',
    });
  }

  const bits = filterBits(filters);
  const single = Array.isArray(filters.ids) && filters.ids.length === 1 && advances[0];
  const leftFilter = single
    ? `${staffName(advances[0])} — ${TYPE_LABEL[advances[0].type] || 'Advance'} of Rs ${pkr(advances[0].amount)}`
    : bits[0];
  const payload = {
    title: 'Advance & Loan Repayment Report',
    sheetName: 'Repayments',
    confidentialLabel: 'Staff advance & loan repayments',
    subject: 'Staff advance and loan repayments',
    columns: REPAY_COLUMNS,
    rows,
    meta: {
      leftFilter,
      centerFilter: `Total repayments: ${lines.length}`,
      rightFilter: single ? '' : bits.slice(1).join(' · '),
      filterLine: single ? leftFilter : bits.join(' · '),
      countLabel: `Total repayments: ${lines.length}`,
      extraLine: `Total recovered ${pkr(total)} · Through salary ${pkr(salaryTotal)} · Paid back directly ${pkr(cashTotal)}`,
      generatedAt: new Date(),
    },
    emptyMessage: 'No repayments recorded for the selected advances / loans.',
    plain: true,
  };
  return format === 'pdf' ? renderBrandedPdf(payload) : renderBrandedExcel(payload);
}

/**
 * @param {{ format?: string, kind?: 'list'|'repayments', staffId?, type?, status?, search?, ids? }} filters
 */
async function exportStaffAdvanceReport(filters = {}) {
  const format = String(filters.format || 'xlsx').toLowerCase() === 'pdf' ? 'pdf' : 'xlsx';
  if (filters.kind === 'repayments') return exportRepaymentReport(filters, format);
  return exportListReport(filters, format);
}

module.exports = { exportStaffAdvanceReport };
