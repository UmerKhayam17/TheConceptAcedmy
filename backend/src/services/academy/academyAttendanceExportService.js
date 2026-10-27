const { renderBrandedExcel, renderBrandedPdf, formatDateTime } = require('./academyReportDocument');
const { sortStudentsByRollAsc } = require('../../utils/academyStudentSort');
const { formatTimeInTz } = require('../../utils/schoolDay');

/** Portrait A4 widths; plain mode scales to fit. */
const COLUMNS = [
  { key: 'serial', header: 'S.No', excelWidth: 7, pdfWidth: 28, align: 'center' },
  { key: 'studentId', header: 'Roll / ID', excelWidth: 14, pdfWidth: 78, wrap: true },
  { key: 'name', header: 'Student Name', excelWidth: 18, pdfWidth: 110, wrap: true },
  { key: 'className', header: 'Class', excelWidth: 10, pdfWidth: 48, align: 'center' },
  { key: 'section', header: 'Section', excelWidth: 10, pdfWidth: 48, align: 'center' },
  { key: 'status', header: 'Status', excelWidth: 11, pdfWidth: 58, align: 'center' },
  { key: 'checkIn', header: 'Time in', excelWidth: 11, pdfWidth: 55, align: 'center' },
  { key: 'checkOut', header: 'Time out', excelWidth: 11, pdfWidth: 55, align: 'center' },
];

const REPORT_OPTS = {
  plain: true,
  layout: 'portrait',
  confidentialLabel: 'Confidential attendance register',
};

function classNameOf(s) {
  const c = s.classId;
  if (c && typeof c === 'object') return c.className || '';
  return '';
}

function sectionNameOf(s) {
  const sec = s.sectionId;
  if (sec && typeof sec === 'object') return sec.sectionName || '';
  return '';
}

function studentRef(s) {
  return s.rollNumber || s.studentId || s.registrationNumber || '';
}

function statusLabel(status) {
  if (!status) return 'Unmarked';
  return String(status).charAt(0).toUpperCase() + String(status).slice(1);
}

function fmtTime(value) {
  if (!value) return '—';
  const label = formatTimeInTz(value);
  return label || '—';
}

function mapAttendanceRows(students, recordByStudent) {
  const sorted = sortStudentsByRollAsc(students);
  return sorted.map((s, i) => {
    const rec = recordByStudent.get(String(s._id));
    return {
      serial: i + 1,
      studentId: studentRef(s) || '—',
      name: s.studentName || '',
      className: classNameOf(s) || '—',
      section: sectionNameOf(s) || '—',
      status: statusLabel(rec?.status),
      checkIn: fmtTime(rec?.checkIn),
      checkOut: fmtTime(rec?.checkOut),
    };
  });
}

function reportMeta(meta, rows) {
  return {
    generatedAt: meta.generatedAt || new Date(),
    sessionLabel: meta.sessionName || '',
    leftFilter: meta.className ? `Class: ${meta.className}` : 'All classes',
    centerFilter: meta.sectionName ? `Section: ${meta.sectionName}` : '',
    rightFilter: meta.date ? `Date: ${meta.date}` : '',
    filterLine: [
      meta.date ? `Date: ${meta.date}` : null,
      meta.sessionName ? `Session: ${meta.sessionName}` : null,
      meta.className ? `Class: ${meta.className}` : null,
      meta.sectionName ? `Section: ${meta.sectionName}` : null,
      meta.studentName ? `Student: ${meta.studentName}` : null,
    ]
      .filter(Boolean)
      .join('   |   ') || 'All classes',
    extraLine: meta.summary
      ? `Present ${meta.summary.present ?? 0}  ·  Late ${meta.summary.late ?? 0}  ·  Absent ${meta.summary.absent ?? 0}  ·  Leave ${meta.summary.leave ?? 0}  ·  Unmarked ${meta.summary.unmarked ?? 0}`
      : '',
    countLabel: `${rows.length} student${rows.length === 1 ? '' : 's'}`,
  };
}

async function renderAttendanceExcel(students, recordByStudent, meta = {}) {
  const rows = mapAttendanceRows(students, recordByStudent);
  return renderBrandedExcel({
    title: 'Student Attendance',
    sheetName: 'Attendance',
    subject: 'Official daily attendance export',
    columns: COLUMNS,
    rows,
    meta: reportMeta(meta, rows),
    ...REPORT_OPTS,
  });
}

async function renderAttendancePdf(students, recordByStudent, meta = {}) {
  const rows = mapAttendanceRows(students, recordByStudent);
  return renderBrandedPdf({
    title: 'Student Attendance',
    subject: 'Official daily attendance export',
    columns: COLUMNS,
    rows,
    meta: reportMeta(meta, rows),
    emptyMessage: 'No students match the selected filters.',
    ...REPORT_OPTS,
  });
}

module.exports = {
  mapAttendanceRows,
  renderAttendanceExcel,
  renderAttendancePdf,
  filterLine: (meta) => reportMeta(meta, []).filterLine,
  formatDateTime,
};
