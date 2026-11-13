const AcademyExpense = require('../../models/academy/AcademyExpense');
const { renderBrandedPdf, renderBrandedExcel, formatDate } = require('./academyReportDocument');
const { categoryNameMap, displayCategory, listCategories } = require('./expenseCategoryService');

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
    .limit(20000)
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
      _expenseDate: r.expenseDate,
      _categoryName: displayCategory(r, names),
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

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MAX_FILLED_DAYS = 400;

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "2-Nov-26" like the paper expense sheet. */
function sheetDate(d) {
  return `${d.getDate()}-${SHORT_MONTHS[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`;
}

/** Report period used to list every day (including days with no expense). */
function reportPeriod(filters, rows) {
  const from = parseYmdStart(filters.from);
  const to = parseYmdStart(filters.to);
  if (from && to) return from <= to ? [from, to] : [to, from];
  if (filters.month && filters.year) {
    return [new Date(filters.year, filters.month - 1, 1), new Date(filters.year, filters.month, 0)];
  }
  if (filters.year) return [new Date(filters.year, 0, 1), new Date(filters.year, 11, 31)];
  if (!rows.length) return null;
  const times = rows.map((r) => new Date(r._expenseDate).getTime()).filter(Number.isFinite);
  if (!times.length) return null;
  const min = new Date(Math.min(...times));
  const max = new Date(Math.max(...times));
  return [
    new Date(min.getFullYear(), min.getMonth(), min.getDate()),
    new Date(max.getFullYear(), max.getMonth(), max.getDate()),
  ];
}

/** Category columns: configured order first, then any extra names found in the data. */
async function pivotCategoryNames(rows, filters, names) {
  if (filters.category) {
    const used = [...new Set(rows.map((r) => r._categoryName))];
    return used.length ? used : [names[filters.category] || filters.category];
  }
  const configured = await listCategories();
  const usedNames = new Set(rows.map((r) => r._categoryName));
  const ordered = configured
    .filter((c) => c.isActive || usedNames.has(c.name))
    .map((c) => c.name);
  const seen = new Set(ordered);
  const extras = [...usedNames].filter((n) => n && n !== '—' && !seen.has(n)).sort();
  return [...ordered, ...extras];
}

function buildPivot(rows, categoryNames, period) {
  const catKeys = categoryNames.map((name, i) => ({ name, key: `cat${i}` }));
  const keyByName = Object.fromEntries(catKeys.map((c) => [c.name, c.key]));
  const byDay = new Map();
  const ensureDay = (d) => {
    const k = dayKey(d);
    if (!byDay.has(k)) byDay.set(k, { date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), sums: {} });
    return byDay.get(k);
  };

  if (period) {
    const [start, end] = period;
    const spanDays = Math.round((end - start) / 86400000) + 1;
    if (spanDays <= MAX_FILLED_DAYS) {
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) ensureDay(d);
    }
  }

  rows.forEach((r) => {
    const d = new Date(r._expenseDate);
    if (Number.isNaN(d.getTime())) return;
    const key = keyByName[r._categoryName];
    if (!key) return;
    const day = ensureDay(d);
    day.sums[key] = (day.sums[key] || 0) + r.amount;
  });

  const colTotals = {};
  let grandTotal = 0;
  const pivotRows = [...byDay.values()]
    .sort((a, b) => a.date - b.date)
    .map(({ date, sums }) => {
      const out = { date: sheetDate(date) };
      let dayTotal = 0;
      catKeys.forEach(({ key }) => {
        const v = sums[key] || 0;
        out[key] = v ? v : '';
        dayTotal += v;
        colTotals[key] = (colTotals[key] || 0) + v;
      });
      grandTotal += dayTotal;
      out.totalExpenses = dayTotal ? dayTotal : '-';
      return out;
    });

  if (pivotRows.length) {
    const totalRow = { _isTotal: true, date: 'Total' };
    catKeys.forEach(({ key }) => {
      totalRow[key] = colTotals[key] ? colTotals[key] : '';
    });
    totalRow.totalExpenses = grandTotal;
    pivotRows.push(totalRow);
  }

  const columns = [
    { key: 'date', header: 'Date', excelWidth: 11, pdfWidth: 38, align: 'right' },
    ...catKeys.map(({ name, key }) => ({
      key,
      header: name,
      excelWidth: 12,
      pdfWidth: 40,
      align: 'right',
      numFmt: '#,##0',
    })),
    {
      key: 'totalExpenses',
      header: 'Total Expenses',
      excelWidth: 13,
      pdfWidth: 40,
      align: 'right',
      numFmt: '#,##0',
    },
  ];

  return { columns, rows: pivotRows };
}

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

  const detailRows = [...rows];
  if (rows.length) {
    detailRows.push({
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

  const categoryNames = await pivotCategoryNames(rows, filters, names);
  const pivot = buildPivot(rows, categoryNames, reportPeriod(filters, rows));

  const payload = {
    title: 'Academy Expenses Report',
    sheetName: 'Expenses',
    confidentialLabel: 'Academy expenses report',
    subject: 'Academy expenses',
    columns: pivot.columns,
    rows: pivot.rows,
    meta,
    emptyMessage: 'No expenses match the selected filters.',
    plain: true,
    headerFill: '#FFFF00',
    // PDF: squeeze a month onto one page like the paper sheet (falls back to multi-page).
    fitOnePage: format === 'pdf',
    additionalSheets: [
      {
        title: 'Academy Expenses — Detail',
        sheetName: 'Detail',
        columns: COLUMNS,
        rows: detailRows,
        headerFill: null,
      },
    ],
  };

  if (format === 'pdf') {
    return renderBrandedPdf(payload);
  }
  return renderBrandedExcel(payload);
}

module.exports = {
  exportExpenseReport,
};
