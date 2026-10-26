const { renderBrandedExcel, renderBrandedPdf } = require('./academyReportDocument');

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

/** Portrait A4 widths (~523pt usable @ margin 36); plain mode scales to fit. */
const SUMMARY_COLUMNS = [
  { key: 'serial', header: 'S.No', excelWidth: 6, pdfWidth: 26, align: 'center' },
  { key: 'name', header: 'Staff Name', excelWidth: 22, pdfWidth: 110, wrap: true },
  { key: 'role', header: 'Role', excelWidth: 12, pdfWidth: 52, align: 'center' },
  { key: 'totalClasses', header: 'Total classes', excelWidth: 14, pdfWidth: 58, align: 'center' },
  { key: 'present', header: 'Present', excelWidth: 10, pdfWidth: 46, align: 'center' },
  { key: 'late', header: 'Late', excelWidth: 8, pdfWidth: 40, align: 'center' },
  { key: 'absent', header: 'Absent', excelWidth: 10, pdfWidth: 46, align: 'center' },
  { key: 'leave', header: 'Leave', excelWidth: 8, pdfWidth: 40, align: 'center' },
  { key: 'unmarked', header: 'Unmarked', excelWidth: 11, pdfWidth: 50, align: 'center' },
  { key: 'attendance', header: 'Attendance %', excelWidth: 14, pdfWidth: 58, align: 'center' },
];

const PERIOD_COLUMNS = [
  { key: 'serial', header: 'S.No', excelWidth: 6, pdfWidth: 26, align: 'center' },
  { key: 'date', header: 'Date', excelWidth: 12, pdfWidth: 58 },
  { key: 'period', header: 'Period', excelWidth: 12, pdfWidth: 52, wrap: true },
  { key: 'time', header: 'Time', excelWidth: 14, pdfWidth: 64, align: 'center' },
  { key: 'className', header: 'Class', excelWidth: 16, pdfWidth: 70, wrap: true },
  { key: 'section', header: 'Section', excelWidth: 10, pdfWidth: 44, align: 'center' },
  { key: 'subject', header: 'Subject', excelWidth: 16, pdfWidth: 80, wrap: true },
  { key: 'status', header: 'Status', excelWidth: 12, pdfWidth: 52, align: 'center' },
];

const REPORT_OPTS = {
  plain: true,
  layout: 'portrait',
  confidentialLabel: 'Staff attendance report',
};

function statusLabel(status) {
  if (!status) return 'Unmarked';
  return String(status)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function summaryLine(summary) {
  if (!summary) return '';
  const total = summary.totalClasses ?? summary.present ?? 0;
  return `Total classes ${total}  ·  Present ${summary.present ?? 0}  ·  Late ${summary.late ?? 0}  ·  Absent ${summary.absent ?? 0}  ·  Leave ${summary.leave ?? 0}  ·  Unmarked ${summary.unmarked ?? 0}`;
}

function buildReportMeta(meta, summary, countLabel) {
  return {
    generatedAt: meta.generatedAt || new Date(),
    leftFilter: meta.leftFilter || meta.filterLine || '',
    centerFilter: meta.centerFilter || '',
    rightFilter: meta.rightFilter || '',
    filterLine: meta.filterLine || '',
    sessionLabel: meta.sessionLabel || '',
    extraLine: meta.extraLine || summaryLine(summary),
    countLabel,
  };
}

function mapSummaryRows(teachers) {
  return [...(teachers || [])]
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }))
    .map((t, i) => ({
      serial: i + 1,
      name: t.name || '—',
      role: t.role || '—',
      totalClasses: t.totalClasses ?? 0,
      present: t.present ?? 0,
      late: t.late ?? 0,
      absent: t.absent ?? 0,
      leave: t.leave ?? 0,
      unmarked: t.unmarked ?? 0,
      attendance: `${t.attendancePercent ?? 0}%`,
    }));
}

function mapPeriodRows(periods, { includeDate = false } = {}) {
  return (periods || []).map((p, i) => ({
    serial: i + 1,
    date: includeDate ? p.day || '—' : '—',
    period: p.label || '—',
    time: p.startTime && p.endTime ? `${p.startTime}–${p.endTime}` : '—',
    className: p.classLabel || '—',
    section: p.sectionLabel || '—',
    subject: p.subjectLabel || '—',
    status: statusLabel(p.status),
  }));
}

function periodColumns(includeDate) {
  return includeDate ? PERIOD_COLUMNS : PERIOD_COLUMNS.filter((c) => c.key !== 'date');
}

async function renderDailyStaffAttendanceExcel({ teachers, meta }) {
  const rows = mapSummaryRows(teachers);
  return renderBrandedExcel({
    title: 'Staff Attendance — Daily',
    sheetName: 'Daily',
    subject: 'Daily staff class attendance',
    columns: SUMMARY_COLUMNS,
    rows,
    meta: buildReportMeta(meta, meta.summary, `${rows.length} staff`),
    ...REPORT_OPTS,
  });
}

async function renderDailyStaffAttendancePdf({ teachers, meta }) {
  const rows = mapSummaryRows(teachers);
  return renderBrandedPdf({
    title: 'Staff Attendance — Daily',
    subject: 'Official daily staff class attendance',
    columns: SUMMARY_COLUMNS,
    rows,
    meta: buildReportMeta(meta, meta.summary, `${rows.length} staff`),
    emptyMessage: 'No timetable classes for this day.',
    ...REPORT_OPTS,
  });
}

async function renderMonthlyStaffAttendanceExcel({ staffUser, periods, meta }) {
  const rows = mapPeriodRows(periods, { includeDate: true });
  const name = staffUser?.name || 'Staff';
  return renderBrandedExcel({
    title: `Staff Attendance — ${name}`,
    sheetName: 'Classes',
    subject: `Period attendance — ${name}`,
    columns: periodColumns(true),
    rows,
    meta: buildReportMeta(meta, meta.summary, `${rows.length} classes`),
    ...REPORT_OPTS,
  });
}

async function renderMonthlyStaffAttendancePdf({ staffUser, periods, meta }) {
  const rows = mapPeriodRows(periods, { includeDate: true });
  const name = staffUser?.name || 'Staff';
  return renderBrandedPdf({
    title: `Staff Attendance — ${name}`,
    subject: `Period attendance — ${name}`,
    columns: periodColumns(true),
    rows,
    meta: buildReportMeta(meta, meta.summary, `${rows.length} classes`),
    emptyMessage: 'No timetable classes for this teacher in the selected month.',
    ...REPORT_OPTS,
    layout: 'landscape',
  });
}

async function renderAllStaffMonthlyAttendanceExcel({ teachers, meta }) {
  const rows = mapSummaryRows(teachers);
  return renderBrandedExcel({
    title: 'Staff Attendance — All Staff',
    sheetName: 'Attendance',
    subject: 'Monthly class attendance',
    columns: SUMMARY_COLUMNS,
    rows,
    meta: buildReportMeta(meta, meta.summary, `${rows.length} staff`),
    ...REPORT_OPTS,
  });
}

async function renderAllStaffMonthlyAttendancePdf({ teachers, meta }) {
  const rows = mapSummaryRows(teachers);
  return renderBrandedPdf({
    title: 'Staff Attendance — All Staff',
    subject: 'Monthly class attendance',
    columns: SUMMARY_COLUMNS,
    rows,
    meta: buildReportMeta(meta, meta.summary, `${rows.length} staff`),
    emptyMessage: 'No timetable classes for the selected month.',
    ...REPORT_OPTS,
    layout: 'landscape',
  });
}

async function renderTeacherDayExcel({ staffUser, periods, meta }) {
  const rows = mapPeriodRows(periods, { includeDate: false });
  const name = staffUser?.name || 'Staff';
  return renderBrandedExcel({
    title: `Staff Attendance — ${name}`,
    sheetName: 'Periods',
    subject: `Period attendance — ${name}`,
    columns: periodColumns(false),
    rows,
    meta: buildReportMeta(meta, meta.summary, `${rows.length} classes`),
    ...REPORT_OPTS,
  });
}

async function renderTeacherDayPdf({ staffUser, periods, meta }) {
  const rows = mapPeriodRows(periods, { includeDate: false });
  const name = staffUser?.name || 'Staff';
  return renderBrandedPdf({
    title: `Staff Attendance — ${name}`,
    subject: `Period attendance — ${name}`,
    columns: periodColumns(false),
    rows,
    meta: buildReportMeta(meta, meta.summary, `${rows.length} classes`),
    emptyMessage: 'No timetable classes for this teacher on the selected day.',
    ...REPORT_OPTS,
  });
}

module.exports = {
  renderDailyStaffAttendanceExcel,
  renderDailyStaffAttendancePdf,
  renderMonthlyStaffAttendanceExcel,
  renderMonthlyStaffAttendancePdf,
  renderAllStaffMonthlyAttendanceExcel,
  renderAllStaffMonthlyAttendancePdf,
  renderTeacherDayExcel,
  renderTeacherDayPdf,
  MONTHS,
};
