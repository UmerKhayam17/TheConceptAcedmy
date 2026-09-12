const { renderBrandedExcel, renderBrandedPdf, formatDateTime } = require('./academyReportDocument');

const COLUMNS = [
  { key: 'serial', header: 'S.No', excelWidth: 8, pdfWidth: 32, align: 'center' },
  { key: 'studentId', header: 'Roll / ID', excelWidth: 16, pdfWidth: 88 },
  { key: 'name', header: 'Student Name', excelWidth: 24, pdfWidth: 140 },
  { key: 'className', header: 'Class', excelWidth: 14, pdfWidth: 80 },
  { key: 'section', header: 'Section', excelWidth: 12, pdfWidth: 64, align: 'center' },
  { key: 'status', header: 'Status', excelWidth: 14, pdfWidth: 78, align: 'center' },
  { key: 'checkIn', header: 'First check-in', excelWidth: 16, pdfWidth: 90, align: 'center' },
  { key: 'checkOut', header: 'Last check-out', excelWidth: 16, pdfWidth: 90, align: 'center' },
];

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
  return s.studentId || s.rollNumber || s.registrationNumber || '';
}

function statusLabel(status) {
  if (!status) return 'Unmarked';
  return String(status).charAt(0).toUpperCase() + String(status).slice(1);
}

function fmtTime(value) {
  if (!value) return '—';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });
}

function mapAttendanceRows(students, recordByStudent) {
  return students.map((s, i) => {
    const rec = recordByStudent.get(String(s._id));
    return {
      serial: i + 1,
      studentId: studentRef(s),
      name: s.studentName || '',
      className: classNameOf(s),
      section: sectionNameOf(s) || '—',
      status: statusLabel(rec?.status),
      checkIn: fmtTime(rec?.checkIn),
      checkOut: fmtTime(rec?.checkOut),
    };
  });
}

function filterLine(meta) {
  const parts = [];
  if (meta.date) parts.push(`Date: ${meta.date}`);
  if (meta.sessionName) parts.push(`Session: ${meta.sessionName}`);
  if (meta.className) parts.push(`Class: ${meta.className}`);
  if (meta.sectionName) parts.push(`Section: ${meta.sectionName}`);
  if (meta.studentName) parts.push(`Student: ${meta.studentName}`);
  return parts.length ? parts.join('   |   ') : 'All classes';
}

function summaryLine(summary) {
  if (!summary) return '';
  return `Present ${summary.present ?? 0}  ·  Late ${summary.late ?? 0}  ·  Absent ${summary.absent ?? 0}  ·  Leave ${summary.leave ?? 0}  ·  Unmarked ${summary.unmarked ?? 0}`;
}

function reportMeta(meta, rows) {
  return {
    generatedAt: meta.generatedAt || new Date(),
    filterLine: filterLine(meta),
    extraLine: summaryLine(meta.summary),
    countLabel: `${rows.length} student${rows.length === 1 ? '' : 's'}`,
  };
}

async function renderAttendanceExcel(students, recordByStudent, meta = {}) {
  const rows = mapAttendanceRows(students, recordByStudent);
  return renderBrandedExcel({
    title: 'Attendance Register',
    sheetName: 'Attendance',
    confidentialLabel: 'Confidential attendance register',
    columns: COLUMNS,
    rows,
    meta: reportMeta(meta, rows),
  });
}

async function renderAttendancePdf(students, recordByStudent, meta = {}) {
  const rows = mapAttendanceRows(students, recordByStudent);
  return renderBrandedPdf({
    title: 'ATTENDANCE REGISTER',
    subject: 'Official daily attendance export',
    confidentialLabel: 'Confidential attendance register',
    columns: COLUMNS,
    rows,
    meta: reportMeta(meta, rows),
    emptyMessage: 'No students match the selected filters.',
  });
}

module.exports = {
  mapAttendanceRows,
  renderAttendanceExcel,
  renderAttendancePdf,
  filterLine,
  formatDateTime,
};
