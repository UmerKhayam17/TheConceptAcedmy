const { renderBrandedExcel, renderBrandedPdf } = require('./academyReportDocument');

/**
 * Student List — class + section scoped sheet.
 * Columns: SR No, Reg No, Name, Father, Contact, + 3 blank columns.
 * Portrait A4; names wrap fully (may continue onto page 2).
 */
const LIST_COLUMNS = [
  { key: 'serial', header: 'SR No', excelWidth: 7, pdfWidth: 28, align: 'center' },
  { key: 'regNo', header: 'Reg No', excelWidth: 13, pdfWidth: 62, wrap: true },
  { key: 'name', header: 'Student Name', excelWidth: 22, pdfWidth: 110, wrap: true },
  { key: 'father', header: 'Father Name', excelWidth: 20, pdfWidth: 100, wrap: true },
  { key: 'phone', header: 'Contact', excelWidth: 16, pdfWidth: 78, wrap: true },
  { key: 'blank1', header: ' ', excelWidth: 12, pdfWidth: 58 },
  { key: 'blank2', header: ' ', excelWidth: 12, pdfWidth: 58 },
  { key: 'blank3', header: ' ', excelWidth: 12, pdfWidth: 58 },
];

/**
 * Contact List — same scope; title "Contact"; one trailing blank column.
 */
const CONTACT_COLUMNS = [
  { key: 'serial', header: 'SR No', excelWidth: 8, pdfWidth: 32, align: 'center' },
  { key: 'regNo', header: 'Reg No', excelWidth: 14, pdfWidth: 68, wrap: true },
  { key: 'name', header: 'Student Name', excelWidth: 22, pdfWidth: 115, wrap: true },
  { key: 'father', header: 'Father Name', excelWidth: 20, pdfWidth: 105, wrap: true },
  { key: 'phone', header: 'Contact', excelWidth: 22, pdfWidth: 110, wrap: true },
  { key: 'blank1', header: ' ', excelWidth: 14, pdfWidth: 70 },
];

const REPORT_PRESETS = {
  list: {
    title: 'Student List',
    sheetName: 'Student List',
    subject: 'Official student list export',
    confidentialLabel: 'Confidential student list',
    emptyMessage: 'No students match the selected class and section.',
    filterFallback: 'Student list',
    columns: LIST_COLUMNS,
  },
  contact: {
    title: 'Contact',
    sheetName: 'Contact',
    subject: 'Official contact list export',
    confidentialLabel: 'Confidential contact list',
    emptyMessage: 'No contacts match the selected class and section.',
    filterFallback: 'Contact list',
    columns: CONTACT_COLUMNS,
  },
};

const REPORT_OPTS = {
  plain: true,
  layout: 'portrait',
  // Full names wrap; do not crush rows onto one page (that caused truncation/overlap).
  fitOnePage: false,
  lightHeader: true,
};

function normalizeReportType(reportType) {
  const key = String(reportType || 'list').toLowerCase();
  return key === 'contact' ? 'contact' : 'list';
}

function resolvePreset(options = {}) {
  return REPORT_PRESETS[normalizeReportType(options.reportType)];
}

function columnsForExport(options = {}) {
  const columns = resolvePreset(options).columns;
  if (!options.omitSensitive) return columns;
  return columns.filter((c) => c.key !== 'phone');
}

function statusLabel(status) {
  if (status === 'pending_fee') return 'Pending fee';
  if (!status) return '';
  return String(status).charAt(0).toUpperCase() + String(status).slice(1);
}

function regNoOf(s) {
  return (
    String(s.registrationNumber || '').trim() ||
    String(s.studentId || '').trim() ||
    String(s.rollNumber || '').trim() ||
    ''
  );
}

function classNameOf(s) {
  return s.classId?.className || '';
}

function sectionNameOf(s) {
  const sec = s.sectionId;
  if (sec && typeof sec === 'object') return sec.sectionName || '';
  return '';
}

/** Primary + residential/alternate contact when both exist (shown together in Contact). */
function phonesOf(s) {
  const seen = new Set();
  const parts = [];
  for (const raw of [s.phone, s.mobileNo, s.contactPhoneRes]) {
    const value = String(raw || '').trim();
    if (!value) continue;
    const key = value.replace(/\D/g, '') || value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(value);
  }
  return parts.join(' / ');
}

function mapStudentsToRows(students, { omitSensitive = false } = {}) {
  const sorted = [...(students || [])].sort((a, b) =>
    String(a.studentName || '').localeCompare(String(b.studentName || ''), undefined, {
      sensitivity: 'base',
    })
  );
  return sorted.map((s, i) => ({
    serial: i + 1,
    regNo: regNoOf(s),
    name: s.studentName || '',
    father: s.fatherName || '',
    phone: omitSensitive ? '' : phonesOf(s),
    className: classNameOf(s) || '',
    section: sectionNameOf(s) || '',
    blank1: '',
    blank2: '',
    blank3: '',
  }));
}

function buildMeta(meta, count, preset) {
  return {
    generatedAt: meta.generatedAt || new Date(),
    sessionLabel: meta.sessionName || '',
    leftFilter: meta.className ? `Class: ${meta.className}` : 'Class required',
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
      .join('   |   ') || preset.filterFallback,
    countLabel: `${count} student${count === 1 ? '' : 's'}`,
  };
}

async function renderStudentsExcel(students, meta = {}, options = {}) {
  const preset = resolvePreset(options);
  const columns = columnsForExport(options);
  const rows = mapStudentsToRows(students, options);
  return renderBrandedExcel({
    title: preset.title,
    sheetName: preset.sheetName,
    subject: preset.subject,
    columns,
    rows,
    meta: buildMeta(meta, rows.length, preset),
    confidentialLabel: preset.confidentialLabel,
    ...REPORT_OPTS,
  });
}

async function renderStudentsPdf(students, meta = {}, options = {}) {
  const preset = resolvePreset(options);
  const columns = columnsForExport(options);
  const rows = mapStudentsToRows(students, options);
  return renderBrandedPdf({
    title: preset.title,
    subject: preset.subject,
    columns,
    rows,
    meta: buildMeta(meta, rows.length, preset),
    emptyMessage: preset.emptyMessage,
    confidentialLabel: preset.confidentialLabel,
    ...REPORT_OPTS,
  });
}

module.exports = {
  mapStudentsToRows,
  renderStudentsExcel,
  renderStudentsPdf,
  statusLabel,
  normalizeReportType,
};
