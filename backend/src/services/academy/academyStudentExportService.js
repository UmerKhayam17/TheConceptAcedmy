const { renderBrandedExcel, renderBrandedPdf } = require('./academyReportDocument');

/** Portrait A4 widths; plain mode scales to fit. */
const EXPORT_COLUMNS = [
  { key: 'serial', header: 'S.No', excelWidth: 7, pdfWidth: 26, align: 'center' },
  { key: 'studentId', header: 'Roll / ID', excelWidth: 15, pdfWidth: 72, wrap: true },
  { key: 'name', header: 'Student Name', excelWidth: 15, pdfWidth: 78, wrap: true },
  { key: 'father', header: 'Father Name', excelWidth: 13, pdfWidth: 68, wrap: true },
  { key: 'phone', header: 'Phone', excelWidth: 14, pdfWidth: 68, wrap: true },
  { key: 'className', header: 'Class', excelWidth: 9, pdfWidth: 38, align: 'center' },
  { key: 'section', header: 'Section', excelWidth: 9, pdfWidth: 42, align: 'center' },
  { key: 'monthlyFeeLabel', header: 'Monthly Fee', excelWidth: 11, pdfWidth: 52, align: 'right' },
  { key: 'status', header: 'Status', excelWidth: 10, pdfWidth: 44, align: 'center' },
  { key: 'blank1', header: ' ', excelWidth: 10, pdfWidth: 40 },
  { key: 'blank2', header: ' ', excelWidth: 10, pdfWidth: 40 },
  { key: 'blank3', header: ' ', excelWidth: 10, pdfWidth: 40 },
];

const REPORT_OPTS = {
  plain: true,
  layout: 'portrait',
  confidentialLabel: 'Confidential student register',
};

function columnsForExport({ omitSensitive = false } = {}) {
  if (!omitSensitive) return EXPORT_COLUMNS;
  return EXPORT_COLUMNS.filter((c) => c.key !== 'phone' && c.key !== 'monthlyFeeLabel');
}

function statusLabel(status) {
  if (status === 'pending_fee') return 'Pending fee';
  if (!status) return '';
  return String(status).charAt(0).toUpperCase() + String(status).slice(1);
}

function studentRef(s) {
  if (s.status === 'pending_fee') {
    return s.rollNumber || s.registrationNumber || 'Pending';
  }
  return s.studentId || s.rollNumber || '';
}

function classNameOf(s) {
  return s.classId?.className || '';
}

function sectionNameOf(s) {
  const sec = s.sectionId;
  if (sec && typeof sec === 'object') return sec.sectionName || '';
  return '';
}

function formatPkr(n) {
  if (n == null || n === '') return '';
  const num = Number(n);
  if (Number.isNaN(num)) return '';
  return `PKR ${num.toLocaleString('en-PK')}`;
}

function moneyValue(n) {
  if (n == null || n === '') return null;
  const num = Number(n);
  return Number.isNaN(num) ? null : num;
}

/** Primary + residential/alternate contact when both exist. */
function phonesOf(s) {
  const primary = String(s.phone || '').trim();
  const residential = String(s.contactPhoneRes || '').trim();
  if (primary && residential && primary !== residential) {
    return `${primary}\n${residential}`;
  }
  return primary || residential || '';
}

function mapStudentsToRows(students) {
  const sorted = [...(students || [])].sort((a, b) =>
    String(a.studentName || '').localeCompare(String(b.studentName || ''), undefined, {
      sensitivity: 'base',
    })
  );
  return sorted.map((s, i) => ({
    serial: i + 1,
    studentId: studentRef(s),
    name: s.studentName || '',
    father: s.fatherName || '',
    phone: phonesOf(s),
    className: classNameOf(s) || '',
    section: sectionNameOf(s) || '',
    monthlyFee: s.status === 'pending_fee' ? null : moneyValue(s.monthlyFee),
    monthlyFeeLabel: s.status === 'pending_fee' ? '' : formatPkr(s.monthlyFee),
    admissionFee: moneyValue(s.admissionFee),
    totalFee: moneyValue(s.totalFee),
    status: statusLabel(s.status),
    blank1: '',
    blank2: '',
    blank3: '',
  }));
}

function buildMeta(meta, count) {
  return {
    generatedAt: meta.generatedAt || new Date(),
    sessionLabel: meta.sessionName || '',
    leftFilter: meta.className ? `Class: ${meta.className}` : 'All classes',
    centerFilter: meta.sectionName
      ? `Section: ${meta.sectionName}`
      : `${count} student${count === 1 ? '' : 's'}`,
    rightFilter: meta.status ? `Status: ${statusLabel(meta.status)}` : '',
    filterLine: [
      meta.sessionName ? `Session: ${meta.sessionName}` : null,
      meta.className ? `Class: ${meta.className}` : null,
      meta.sectionName ? `Section: ${meta.sectionName}` : null,
      meta.status ? `Status: ${statusLabel(meta.status)}` : null,
      meta.search ? `Search: ${meta.search}` : null,
    ]
      .filter(Boolean)
      .join('   |   ') || 'All students',
    countLabel: `${count} student${count === 1 ? '' : 's'}`,
  };
}

async function renderStudentsExcel(students, meta = {}, options = {}) {
  const columns = columnsForExport(options);
  const rows = mapStudentsToRows(students);
  return renderBrandedExcel({
    title: 'Student Register',
    sheetName: 'Student Register',
    subject: 'Official student register export',
    columns,
    rows,
    meta: buildMeta(meta, rows.length),
    ...REPORT_OPTS,
  });
}

async function renderStudentsPdf(students, meta = {}, options = {}) {
  const columns = columnsForExport(options);
  const rows = mapStudentsToRows(students);
  return renderBrandedPdf({
    title: 'Student Register',
    subject: 'Official student register export',
    columns,
    rows,
    meta: buildMeta(meta, rows.length),
    emptyMessage: 'No students match the selected filters.',
    ...REPORT_OPTS,
  });
}

module.exports = {
  mapStudentsToRows,
  renderStudentsExcel,
  renderStudentsPdf,
  statusLabel,
};
