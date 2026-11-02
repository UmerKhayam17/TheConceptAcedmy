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

/** Multi-day range summary: one row per student. */
const RANGE_COLUMNS = [
  { key: 'serial', header: 'S.No', excelWidth: 7, pdfWidth: 28, align: 'center' },
  { key: 'studentId', header: 'Roll / ID', excelWidth: 14, pdfWidth: 70, wrap: true },
  { key: 'name', header: 'Student Name', excelWidth: 18, pdfWidth: 100, wrap: true },
  { key: 'className', header: 'Class', excelWidth: 10, pdfWidth: 44, align: 'center' },
  { key: 'section', header: 'Section', excelWidth: 10, pdfWidth: 44, align: 'center' },
  { key: 'present', header: 'Present', excelWidth: 10, pdfWidth: 42, align: 'center' },
  { key: 'late', header: 'Late', excelWidth: 8, pdfWidth: 36, align: 'center' },
  { key: 'absent', header: 'Absent', excelWidth: 10, pdfWidth: 42, align: 'center' },
  { key: 'leave', header: 'Leave', excelWidth: 8, pdfWidth: 36, align: 'center' },
  { key: 'totalDays', header: 'Days', excelWidth: 8, pdfWidth: 36, align: 'center' },
  { key: 'attendance', header: 'Att %', excelWidth: 10, pdfWidth: 42, align: 'center' },
];

/** Date-wise absent register. */
const ABSENT_COLUMNS = [
  { key: 'serial', header: 'S.No', excelWidth: 7, pdfWidth: 28, align: 'center' },
  { key: 'date', header: 'Date', excelWidth: 12, pdfWidth: 62, align: 'center' },
  { key: 'studentId', header: 'Roll / ID', excelWidth: 14, pdfWidth: 72, wrap: true },
  { key: 'name', header: 'Student Name', excelWidth: 20, pdfWidth: 120, wrap: true },
  { key: 'className', header: 'Class', excelWidth: 12, pdfWidth: 52, align: 'center' },
  { key: 'section', header: 'Section', excelWidth: 12, pdfWidth: 52, align: 'center' },
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
  // No saved mark → absent by default
  if (!status) return 'Absent';
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

function dateFilterLabel(meta) {
  if (meta.dateFrom && meta.dateTo && meta.dateFrom !== meta.dateTo) {
    return `From ${meta.dateFrom}  To ${meta.dateTo}`;
  }
  return meta.date ? `Date: ${meta.date}` : meta.dateFrom ? `Date: ${meta.dateFrom}` : '';
}

function reportMeta(meta, rows) {
  const dateLabel = dateFilterLabel(meta);
  return {
    generatedAt: meta.generatedAt || new Date(),
    sessionLabel: meta.sessionName || '',
    leftFilter: meta.className ? `Class: ${meta.className}` : 'All classes',
    centerFilter: meta.sectionName ? `Section: ${meta.sectionName}` : '',
    rightFilter: dateLabel,
    filterLine: [
      dateLabel || null,
      meta.sessionName ? `Session: ${meta.sessionName}` : null,
      meta.className ? `Class: ${meta.className}` : null,
      meta.sectionName ? `Section: ${meta.sectionName}` : null,
      meta.studentName ? `Student: ${meta.studentName}` : null,
    ]
      .filter(Boolean)
      .join('   |   ') || 'All classes',
    extraLine: meta.summary
      ? `Present ${meta.summary.present ?? 0}  ·  Late ${meta.summary.late ?? 0}  ·  Absent ${meta.summary.absent ?? 0}  ·  Leave ${meta.summary.leave ?? 0}`
      : '',
    countLabel: `${rows.length} student${rows.length === 1 ? '' : 's'}`,
  };
}

function mapRangeSummaryRows(studentSummaries) {
  return (studentSummaries || []).map((row, i) => {
    const s = row.student || {};
    return {
      serial: i + 1,
      studentId: studentRef(s) || '—',
      name: s.studentName || '',
      className: classNameOf(s) || '—',
      section: sectionNameOf(s) || '—',
      present: row.present ?? 0,
      late: row.late ?? 0,
      absent: row.absent ?? 0,
      leave: row.leave ?? 0,
      totalDays: row.totalDays ?? 0,
      attendance: `${row.attendancePercent ?? 0}%`,
    };
  });
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

async function renderAttendanceRangeExcel(studentSummaries, meta = {}) {
  const rows = mapRangeSummaryRows(studentSummaries);
  return renderBrandedExcel({
    title: 'Student Attendance — Date Range',
    sheetName: 'Attendance',
    subject: 'Official attendance range summary',
    columns: RANGE_COLUMNS,
    rows,
    meta: reportMeta(meta, rows),
    ...REPORT_OPTS,
  });
}

async function renderAttendanceRangePdf(studentSummaries, meta = {}) {
  const rows = mapRangeSummaryRows(studentSummaries);
  return renderBrandedPdf({
    title: 'Student Attendance — Date Range',
    subject: 'Official attendance range summary',
    columns: RANGE_COLUMNS,
    rows,
    meta: reportMeta(meta, rows),
    emptyMessage: 'No students match the selected filters.',
    ...REPORT_OPTS,
  });
}

function mapAbsentRows(absentDays) {
  const rows = [];
  let serial = 0;
  (absentDays || []).forEach((day) => {
    const sorted = sortStudentsByRollAsc(day.students || []);
    sorted.forEach((s) => {
      serial += 1;
      rows.push({
        serial,
        date: day.date || '—',
        studentId: studentRef(s) || '—',
        name: s.studentName || '',
        className: classNameOf(s) || '—',
        section: sectionNameOf(s) || '—',
      });
    });
  });
  return rows;
}

function absentReportMeta(meta, rows, dayCount) {
  const base = reportMeta(meta, rows);
  return {
    ...base,
    extraLine: `Absent entries ${rows.length}  ·  Days listed ${dayCount}`,
    countLabel: `${rows.length} absent entr${rows.length === 1 ? 'y' : 'ies'}`,
  };
}

function dayAbsentRows(day) {
  return sortStudentsByRollAsc(day?.students || []).map((s, i) => ({
    serial: i + 1,
    studentId: studentRef(s) || '—',
    name: s.studentName || '',
    className: classNameOf(s) || '—',
    section: sectionNameOf(s) || '—',
  }));
}

function dayAbsentMeta(meta, day) {
  const count = day?.count ?? (day?.students || []).length;
  return {
    ...reportMeta(meta, []),
    rightFilter: day?.date ? `Date: ${day.date}` : reportMeta(meta, []).rightFilter,
    extraLine: `Absent ${count}`,
    countLabel: `${count} student${count === 1 ? '' : 's'}`,
  };
}

async function renderAbsentListExcel(absentDays, meta = {}) {
  const rows = mapAbsentRows(absentDays);
  return renderBrandedExcel({
    title: 'Absent List — Date Wise',
    sheetName: 'Absent List',
    subject: 'Date-wise student absent register',
    columns: ABSENT_COLUMNS,
    rows,
    meta: absentReportMeta(meta, rows, (absentDays || []).length),
    ...REPORT_OPTS,
  });
}

async function renderAbsentListPdf(absentDays, meta = {}) {
  const days = absentDays || [];
  const dayColumns = ABSENT_COLUMNS.filter((c) => c.key !== 'date');

  // One letterhead page per date keeps the register easy to hand out day-wise.
  if (days.length > 1) {
    const [first, ...restDays] = days;
    return renderBrandedPdf({
      title: `Absent List — ${first.date}`,
      subject: 'Date-wise student absent register',
      columns: dayColumns,
      rows: dayAbsentRows(first),
      meta: dayAbsentMeta(meta, first),
      emptyMessage: 'No absentees for this date.',
      additionalSections: restDays.map((day) => ({
        title: `Absent List — ${day.date}`,
        columns: dayColumns,
        rows: dayAbsentRows(day),
        meta: dayAbsentMeta(meta, day),
        emptyMessage: 'No absentees for this date.',
      })),
      ...REPORT_OPTS,
    });
  }

  const rows = mapAbsentRows(days);
  return renderBrandedPdf({
    title: 'Absent List — Date Wise',
    subject: 'Date-wise student absent register',
    columns: days.length === 1 ? dayColumns : ABSENT_COLUMNS,
    rows: days.length === 1 ? dayAbsentRows(days[0]) : rows,
    meta:
      days.length === 1
        ? dayAbsentMeta(meta, days[0])
        : absentReportMeta(meta, rows, days.length),
    emptyMessage: 'No absentees in the selected date range.',
    ...REPORT_OPTS,
  });
}

module.exports = {
  mapAttendanceRows,
  mapRangeSummaryRows,
  mapAbsentRows,
  renderAttendanceExcel,
  renderAttendancePdf,
  renderAttendanceRangeExcel,
  renderAttendanceRangePdf,
  renderAbsentListExcel,
  renderAbsentListPdf,
  filterLine: (meta) => reportMeta(meta, []).filterLine,
  formatDateTime,
};
