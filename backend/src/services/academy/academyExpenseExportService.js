const AcademyExpense = require('../../models/academy/AcademyExpense');
const { renderBrandedPdf, renderBrandedExcel, formatDate } = require('./academyReportDocument');
const { categoryNameMap, displayCategory } = require('./expenseCategoryService');

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

function parseYmdStart(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime()) || d.getMonth() !== Number(m[2]) - 1) return null;
  return d;
}

function endOfYmd(value) {
  const d = parseYmdStart(value);
  if (!d) return null;
  d.setHours(23, 59, 59, 999);
  return d;
}

function displayYmd(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function buildExpenseQuery({ category, status, month, year, search, from, to }) {
  const q = {};
  if (category) q.category = category;
  if (status) q.status = status;
  const start = parseYmdStart(from);
  const end = parseYmdStart(to);
  if (start && end) {
    q.expenseDate =
      start <= end
        ? { $gte: start, $lte: endOfYmd(to) }
        : { $gte: end, $lte: endOfYmd(from) };
  } else if (month && year) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    q.expenseDate = { $gte: start, $lte: end };
  } else if (year) {
    q.expenseDate = {
      $gte: new Date(year, 0, 1),
      $lte: new Date(year, 11, 31, 23, 59, 59, 999),
    };
  }
  if (search?.trim()) {
    const s = search.trim();
    q.$or = [
      { title: { $regex: s, $options: 'i' } },
      { vendor: { $regex: s, $options: 'i' } },
      { description: { $regex: s, $options: 'i' } },
      { referenceNumber: { $regex: s, $options: 'i' } },
      { categoryOther: { $regex: s, $options: 'i' } },
    ];
  }
  return q;
}

async function loadExpenseData(filters) {
  const names = await categoryNameMap();
  const q = buildExpenseQuery(filters);
  const records = await AcademyExpense.find(q)
    .sort({ expenseDate: -1, createdAt: -1 })
    .limit(2000)
    .lean();

  let totalAmount = 0;
  let paidAmount = 0;
  let plannedAmount = 0;

  const rows = records.map((r, idx) => {
    const amount = Number(r.amount) || 0;
    totalAmount += amount;
    if (r.status === 'paid') paidAmount += amount;
    if (r.status === 'planned') plannedAmount += amount;
    return {
      serial: idx + 1,
      date: formatDate(r.expenseDate),
      title: r.title || '—',
      category: displayCategory(r, names),
      vendor: r.vendor || '—',
      amount,
      status: String(r.status || '').replace(/^\w/, (c) => c.toUpperCase()),
      method: r.paymentMethod ? String(r.paymentMethod).replace(/_/g, ' ') : '—',
      invoice: r.referenceNumber || '—',
      notes: r.description?.trim() || '—',
    };
  });

  return {
    rows,
    totalAmount,
    paidAmount,
    plannedAmount,
    count: rows.length,
    names,
  };
}

function filterLine({ month, year, category, status, search, from, to }, names = {}) {
  const parts = [];
  if (from && to) parts.push(`${displayYmd(from)} to ${displayYmd(to)}`);
  else if (month && year) parts.push(`${MONTHS[Number(month) - 1] || month} ${year}`);
  else if (year) parts.push(`Year ${year}`);
  if (category) parts.push(names[category] || category);
  else parts.push('All categories');
  if (status) parts.push(String(status).replace(/^\w/, (c) => c.toUpperCase()));
  else parts.push('All statuses');
  if (search) parts.push(`Search: ${search}`);
  return parts.join(' · ');
}

const COLUMNS = [
  { key: 'serial', header: 'S.No', excelWidth: 8, pdfWidth: 28, align: 'center' },
  { key: 'date', header: 'Date', excelWidth: 12, pdfWidth: 52, align: 'center' },
  { key: 'title', header: 'Title', excelWidth: 18, pdfWidth: 90, wrap: true },
  { key: 'category', header: 'Category', excelWidth: 12, pdfWidth: 58 },
  { key: 'vendor', header: 'Vendor', excelWidth: 14, pdfWidth: 65, wrap: true },
  {
    key: 'amount',
    header: 'Amount',
    excelWidth: 12,
    pdfWidth: 58,
    align: 'right',
    numFmt: '#,##0.00',
  },
  { key: 'status', header: 'Status', excelWidth: 10, pdfWidth: 42, align: 'center' },
  { key: 'method', header: 'Method', excelWidth: 12, pdfWidth: 52 },
  { key: 'invoice', header: 'Invoice / Slip No.', excelWidth: 16, pdfWidth: 70 },
  { key: 'notes', header: 'Notes', excelWidth: 24, pdfWidth: 95, wrap: true },
];

async function exportExpenseReport(filters = {}) {
  const format = String(filters.format || 'xlsx').toLowerCase() === 'pdf' ? 'pdf' : 'xlsx';
  const { rows, totalAmount, paidAmount, plannedAmount, count, names } = await loadExpenseData(filters);

  const periodBits = [];
  if (filters.from && filters.to) {
    periodBits.push(`${displayYmd(filters.from)} to ${displayYmd(filters.to)}`);
  } else if (filters.month && filters.year) {
    periodBits.push(`${MONTHS[Number(filters.month) - 1] || filters.month} ${filters.year}`);
  } else if (filters.year) {
    periodBits.push(`Year ${filters.year}`);
  }
  if (filters.category) {
    periodBits.push(names[filters.category] || filters.category);
  } else {
    periodBits.push('All categories');
  }
  if (filters.status) {
    periodBits.push(String(filters.status).replace(/^\w/, (c) => c.toUpperCase()));
  } else {
    periodBits.push('All statuses');
  }
  if (filters.search) periodBits.push(`Search: ${filters.search}`);

  const meta = {
    leftFilter: filters.category
      ? names[filters.category] || filters.category
      : 'All categories',
    centerFilter: `Total entries: ${count}`,
    rightFilter: periodBits.join(' · '),
    filterLine: filterLine(filters, names),
    countLabel: `Total entries: ${count}`,
    extraLine: `Total ${totalAmount.toLocaleString('en-PK')} · Paid ${paidAmount.toLocaleString(
      'en-PK'
    )} · Planned ${plannedAmount.toLocaleString('en-PK')}`,
    generatedAt: new Date(),
  };

  const reportRows = [...rows];
  if (rows.length) {
    reportRows.push({
      _isTotal: true,
      serial: '',
      date: '',
      title: 'Total',
      category: '',
      vendor: '',
      amount: totalAmount,
      status: '',
      method: '',
      invoice: '',
      notes: '',
    });
  }

  const payload = {
    title: 'Academy Expenses Report',
    sheetName: 'Expenses',
    confidentialLabel: 'Academy expenses report',
    subject: 'Academy expenses',
    columns: COLUMNS,
    rows: reportRows,
    meta,
    emptyMessage: 'No expenses match the selected filters.',
    plain: true,
  };

  if (format === 'pdf') {
    return renderBrandedPdf(payload);
  }
  return renderBrandedExcel(payload);
}

module.exports = {
  exportExpenseReport,
};
