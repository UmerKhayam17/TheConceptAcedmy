const { renderBrandedExcel, renderBrandedPdf, formatDateTime } = require('./academyReportDocument');
const { sortStudentsByRollAsc } = require('../../utils/academyStudentSort');
const { formatTimeInTz } = require('../../utils/schoolDay');
const {
  renderRegisterPdf,
  renderRegisterExcel,
  weekdayOfYmd,
  MARK_YELLOW,
  MARK_MUTED,
} = require('./academyRegisterDocument');

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

/* ------------------------------------------------------------------ */
/* Date-range registers (printed like the monthly attendance sheet)   */
/* ------------------------------------------------------------------ */

const MARK_SOFT = '#DCE8F7';
const STATUS_MARK = {
  present: { text: 'P', fill: null },
  late: { text: 'T', fill: MARK_SOFT },
  leave: { text: 'L', fill: MARK_SOFT },
  absent: { text: 'A', fill: MARK_YELLOW },
};

const REGISTER_LEAD = [
  { key: 'regNo', title: 'Registration No', width: 70, compactWidth: 60, excelWidth: 18, align: 'center' },
  { key: 'name', title: 'Student Name', width: 130, compactWidth: 110, excelWidth: 28 },
];

function registrationNoOf(s) {
  return s.registrationNumber || s.studentId || s.rollNumber || '—';
}

const REGISTER_COMMON = {
  footerText: 'Confidential attendance register',
  leadColumns: REGISTER_LEAD,
  maxDaysPerPage: 31,
  sheetName: 'Register',
};

function registerDayCols(days, markedSet) {
  return days.map((day) => ({ day, weekday: weekdayOfYmd(day), muted: !markedSet.has(day) }));
}

/** Saved/derived status, or null when the student had no class that day. */
function statusFor(statusByStudentDay, student, day) {
  const status = statusByStudentDay.get(`${String(student._id)}|${day}`);
  return STATUS_MARK[status] ? status : null;
}

const NOT_SCHEDULED = { text: '–', fill: null };

function pct(part, whole) {
  return whole ? `${Math.round((part / whole) * 1000) / 10}%` : '0%';
}

/** Every student × every date: P / T / A / L. Grey columns = attendance not taken. */
function buildAttendanceRegister({ students, days, markedDays, statusByStudentDay }) {
  const markedSet = new Set(markedDays);
  const dayCols = registerDayCols(days, markedSet);
  const perDay = days.map(() => ({ attended: 0, total: 0 }));
  const totals = { present: 0, late: 0, absent: 0, leave: 0, days: 0, attended: 0 };

  const rows = sortStudentsByRollAsc(students).map((s) => {
    const counts = { present: 0, late: 0, absent: 0, leave: 0 };
    let expectedDays = 0;
    const cells = days.map((day, dayIndex) => {
      if (!markedSet.has(day)) return { text: '', fill: MARK_MUTED };
      const status = statusFor(statusByStudentDay, s, day);
      if (!status) return { ...NOT_SCHEDULED };
      expectedDays += 1;
      counts[status] += 1;
      perDay[dayIndex].total += 1;
      if (status === 'present' || status === 'late') perDay[dayIndex].attended += 1;
      return { ...STATUS_MARK[status] };
    });
    const attended = counts.present + counts.late;
    Object.keys(counts).forEach((k) => {
      totals[k] += counts[k];
    });
    totals.days += expectedDays;
    totals.attended += attended;
    return {
      regNo: registrationNoOf(s),
      name: s.studentName || '',
      cells,
      ...counts,
      days: expectedDays,
      attendance: pct(attended, expectedDays),
    };
  });

  const dayTotals = perDay.map((d, idx) =>
    markedSet.has(days[idx])
      ? { text: `${d.attended}/${d.total}`, fill: null }
      : { text: '', fill: MARK_MUTED }
  );

  return {
    dayCols,
    rows,
    dayTotals,
    totals: { ...totals, attendance: pct(totals.attended, totals.days) },
  };
}

/** Only students absent at least once; "A" on each date they were absent. */
function buildAbsentRegister({ students, days, markedDays, statusByStudentDay }) {
  const markedSet = new Set(markedDays);
  const dayCols = registerDayCols(days, markedSet);
  const perDay = days.map(() => 0);
  let totalAbsent = 0;

  const rows = [];
  sortStudentsByRollAsc(students).forEach((s) => {
    let absent = 0;
    const cells = days.map((day, dayIndex) => {
      if (!markedSet.has(day)) return { text: '', fill: MARK_MUTED };
      if (statusFor(statusByStudentDay, s, day) !== 'absent') return { text: '', fill: null };
      absent += 1;
      perDay[dayIndex] += 1;
      return { text: 'A', fill: MARK_YELLOW };
    });
    if (!absent) return;
    totalAbsent += absent;
    rows.push({
      regNo: registrationNoOf(s),
      name: s.studentName || '',
      cells,
      absent,
    });
  });

  const dayTotals = perDay.map((count, idx) =>
    markedSet.has(days[idx])
      ? { text: count, fill: count ? MARK_YELLOW : null }
      : { text: '', fill: MARK_MUTED }
  );

  return { dayCols, rows, dayTotals, totals: { absent: totalAbsent, days: markedSet.size } };
}

function registerMeta(meta) {
  const base = reportMeta(meta, []);
  return {
    generatedAt: base.generatedAt,
    leftFilter: [base.leftFilter, meta.studentName ? `Student: ${meta.studentName}` : null]
      .filter(Boolean)
      .join('   |   '),
    centerFilter: [base.centerFilter, base.sessionLabel ? `Session: ${base.sessionLabel}` : null]
      .filter(Boolean)
      .join('   |   '),
    rightFilter: base.rightFilter,
  };
}

function attendanceRegisterSpec(register) {
  const t = register.totals;
  return {
    ...REGISTER_COMMON,
    title: 'Student Attendance Register',
    pdfSubject: 'Student day-wise attendance register',
    emptyMessage: 'No students match the selected filters.',
    legend: `P = Present  ·  T = Late  ·  A = Absent  ·  L = Leave  ·  – = no class that day  ·  Grey = no classes   |   Students ${register.rows.length}  ·  Present ${t.present}  ·  Late ${t.late}  ·  Absent ${t.absent}  ·  Leave ${t.leave}`,
    tailColumns: [
      { key: 'present', title: 'Present', width: 32, excelWidth: 9 },
      { key: 'late', title: 'Late', width: 24, excelWidth: 7 },
      { key: 'absent', title: 'Absent', width: 30, excelWidth: 9 },
      { key: 'leave', title: 'Leave', width: 26, excelWidth: 8 },
      { key: 'days', title: 'Days', width: 26, excelWidth: 7 },
      { key: 'attendance', title: 'Att %', width: 32, excelWidth: 9 },
    ],
    footerLabelKey: 'name',
    footerLabel: 'Present / marked',
  };
}

function absentRegisterSpec(register) {
  return {
    ...REGISTER_COMMON,
    title: 'Student Absent Register',
    pdfSubject: 'Student day-wise absent register',
    emptyMessage: 'No absentees in the selected date range.',
    legend: `A = Absent  ·  Blank = present or no class that day  ·  Grey = no classes   |   Students absent ${register.rows.length}  ·  Absent entries ${register.totals.absent}`,
    tailColumns: [
      { key: 'absent', title: 'Total Absent', width: 44, excelWidth: 12 },
    ],
    footerLabelKey: 'name',
    footerLabel: 'Absent per day',
  };
}

async function renderAttendanceRegisterPdf(data, meta = {}) {
  const register = buildAttendanceRegister(data);
  return renderRegisterPdf(register, attendanceRegisterSpec(register), registerMeta(meta));
}

async function renderAttendanceRegisterExcel(data, meta = {}) {
  const register = buildAttendanceRegister(data);
  return renderRegisterExcel(register, attendanceRegisterSpec(register), registerMeta(meta));
}

async function renderAbsentRegisterPdf(data, meta = {}) {
  const register = buildAbsentRegister(data);
  return renderRegisterPdf(register, absentRegisterSpec(register), registerMeta(meta));
}

async function renderAbsentRegisterExcel(data, meta = {}) {
  const register = buildAbsentRegister(data);
  return renderRegisterExcel(register, absentRegisterSpec(register), registerMeta(meta));
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
  renderAttendanceRegisterPdf,
  renderAttendanceRegisterExcel,
  renderAbsentRegisterPdf,
  renderAbsentRegisterExcel,
  filterLine: (meta) => reportMeta(meta, []).filterLine,
  formatDateTime,
};
