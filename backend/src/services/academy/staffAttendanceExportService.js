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
const DAILY_COLUMNS = [
  { key: 'serial', header: 'S.No', excelWidth: 7, pdfWidth: 28, align: 'center' },
  { key: 'name', header: 'Staff Name', excelWidth: 20, pdfWidth: 110, wrap: true },
  { key: 'role', header: 'Role', excelWidth: 12, pdfWidth: 58, align: 'center' },
  { key: 'status', header: 'Status', excelWidth: 11, pdfWidth: 52, align: 'center' },
  { key: 'checkIn', header: 'Time in', excelWidth: 10, pdfWidth: 48, align: 'center' },
  { key: 'checkOut', header: 'Time out', excelWidth: 10, pdfWidth: 48, align: 'center' },
  { key: 'notes', header: 'Notes', excelWidth: 18, pdfWidth: 90, wrap: true },
];

const MONTHLY_COLUMNS = [
  { key: 'serial', header: 'S.No', excelWidth: 7, pdfWidth: 28, align: 'center' },
  { key: 'date', header: 'Date', excelWidth: 12, pdfWidth: 70 },
  { key: 'status', header: 'Status', excelWidth: 11, pdfWidth: 58, align: 'center' },
  { key: 'checkIn', header: 'Time in', excelWidth: 10, pdfWidth: 52, align: 'center' },
  { key: 'checkOut', header: 'Time out', excelWidth: 10, pdfWidth: 52, align: 'center' },
  { key: 'source', header: 'Source', excelWidth: 10, pdfWidth: 48, align: 'center' },
  { key: 'notes', header: 'Notes', excelWidth: 18, pdfWidth: 100, wrap: true },
];

const ALL_STAFF_MONTHLY_COLUMNS = [
  { key: 'serial', header: 'S.No', excelWidth: 7, pdfWidth: 26, align: 'center' },
  { key: 'date', header: 'Date', excelWidth: 11, pdfWidth: 58 },
  { key: 'name', header: 'Staff Name', excelWidth: 16, pdfWidth: 90, wrap: true },
  { key: 'role', header: 'Role', excelWidth: 10, pdfWidth: 48, align: 'center' },
  { key: 'status', header: 'Status', excelWidth: 10, pdfWidth: 48, align: 'center' },
  { key: 'checkIn', header: 'Time in', excelWidth: 9, pdfWidth: 44, align: 'center' },
  { key: 'checkOut', header: 'Time out', excelWidth: 9, pdfWidth: 44, align: 'center' },
  { key: 'source', header: 'Source', excelWidth: 9, pdfWidth: 42, align: 'center' },
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

function fmtTime(value) {
  if (!value) return '—';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(value) {
  if (!value) return '—';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value).slice(0, 10);
  return dt.toLocaleDateString('en-PK', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function roleNameOf(user) {
  const r = user?.role;
  if (r && typeof r === 'object') return r.name || '';
  return String(r || '');
}

function attendanceSummary(records) {
  const counts = { present: 0, late: 0, absent: 0, half_day: 0, leave: 0, unmarked: 0 };
  records.forEach((r) => {
    if (!r?.status) {
      counts.unmarked += 1;
      return;
    }
    if (counts[r.status] != null) counts[r.status] += 1;
  });
  return counts;
}

function summaryLine(summary) {
  if (!summary) return '';
  return `Present ${summary.present ?? 0}  ·  Late ${summary.late ?? 0}  ·  Absent ${summary.absent ?? 0}  ·  Half day ${summary.half_day ?? 0}  ·  Leave ${summary.leave ?? 0}`;
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

function mapDailyRows(staffList, recordByUser) {
  const sorted = [...(staffList || [])].sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })
  );
  return sorted.map((u, i) => {
    const rec = recordByUser.get(String(u._id));
    return {
      serial: i + 1,
      name: u.name || '—',
      role: roleNameOf(u) || '—',
      status: statusLabel(rec?.status),
      checkIn: fmtTime(rec?.checkIn),
      checkOut: fmtTime(rec?.checkOut),
      notes: rec?.notes || '—',
    };
  });
}

function mapMonthlyRows(records) {
  const sorted = [...(records || [])].sort((a, b) => {
    const da = new Date(a.date).getTime() || 0;
    const db = new Date(b.date).getTime() || 0;
    return da - db;
  });
  return sorted.map((r, i) => ({
    serial: i + 1,
    date: fmtDate(r.date),
    status: statusLabel(r.status),
    checkIn: fmtTime(r.checkIn),
    checkOut: fmtTime(r.checkOut),
    source: r.source ? String(r.source).toUpperCase() : '—',
    notes: r.notes || '—',
  }));
}

function staffNameOf(record) {
  const u = record?.userId;
  if (u && typeof u === 'object') return u.name || '—';
  return '—';
}

function staffRoleOf(record) {
  const u = record?.userId;
  if (u && typeof u === 'object') return roleNameOf(u) || '—';
  return '—';
}

function mapAllStaffMonthlyRows(records) {
  const sorted = [...(records || [])].sort((a, b) => {
    const da = new Date(a.date).getTime() || 0;
    const db = new Date(b.date).getTime() || 0;
    if (da !== db) return da - db;
    return String(staffNameOf(a)).localeCompare(String(staffNameOf(b)), undefined, {
      sensitivity: 'base',
    });
  });
  return sorted.map((r, i) => ({
    serial: i + 1,
    date: fmtDate(r.date),
    name: staffNameOf(r),
    role: staffRoleOf(r),
    status: statusLabel(r.status),
    checkIn: fmtTime(r.checkIn),
    checkOut: fmtTime(r.checkOut),
    source: r.source ? String(r.source).toUpperCase() : '—',
  }));
}

async function renderDailyStaffAttendanceExcel({ staffList, recordByUser, meta }) {
  const rows = mapDailyRows(staffList, recordByUser);
  const summary = meta.summary || attendanceSummary([...recordByUser.values()]);
  return renderBrandedExcel({
    title: 'Staff Attendance — Daily',
    sheetName: 'Daily',
    subject: 'Daily staff attendance',
    columns: DAILY_COLUMNS,
    rows,
    meta: buildReportMeta(meta, summary, `${rows.length} staff`),
    ...REPORT_OPTS,
  });
}

async function renderDailyStaffAttendancePdf({ staffList, recordByUser, meta }) {
  const rows = mapDailyRows(staffList, recordByUser);
  const summary = meta.summary || attendanceSummary([...recordByUser.values()]);
  return renderBrandedPdf({
    title: 'Staff Attendance — Daily',
    subject: 'Official daily staff attendance register',
    columns: DAILY_COLUMNS,
    rows,
    meta: buildReportMeta(meta, summary, `${rows.length} staff`),
    emptyMessage: 'No staff match the selected filters.',
    ...REPORT_OPTS,
  });
}

async function renderMonthlyStaffAttendanceExcel({ staffUser, records, meta }) {
  const rows = mapMonthlyRows(records);
  const summary = attendanceSummary(records);
  const name = staffUser?.name || 'Staff';
  return renderBrandedExcel({
    title: `Staff Attendance — ${name}`,
    sheetName: 'Attendance',
    subject: `Staff-wise attendance — ${name}`,
    columns: MONTHLY_COLUMNS,
    rows,
    meta: buildReportMeta(
      meta,
      summary,
      `${rows.length} day${rows.length === 1 ? '' : 's'}`
    ),
    ...REPORT_OPTS,
  });
}

async function renderMonthlyStaffAttendancePdf({ staffUser, records, meta }) {
  const rows = mapMonthlyRows(records);
  const summary = attendanceSummary(records);
  const name = staffUser?.name || 'Staff';
  return renderBrandedPdf({
    title: 'Staff Attendance Report',
    subject: `Staff-wise attendance — ${name}`,
    columns: MONTHLY_COLUMNS,
    rows,
    meta: buildReportMeta(
      meta,
      summary,
      `${rows.length} day${rows.length === 1 ? '' : 's'}`
    ),
    emptyMessage: 'No attendance records for this staff member in the selected period.',
    ...REPORT_OPTS,
  });
}

async function renderAllStaffMonthlyAttendanceExcel({ records, meta }) {
  const rows = mapAllStaffMonthlyRows(records);
  const summary = attendanceSummary(records);
  return renderBrandedExcel({
    title: 'Staff Attendance — All Staff',
    sheetName: 'Attendance',
    subject: 'Monthly staff attendance register',
    columns: ALL_STAFF_MONTHLY_COLUMNS,
    rows,
    meta: buildReportMeta(
      meta,
      summary,
      `${rows.length} record${rows.length === 1 ? '' : 's'}`
    ),
    ...REPORT_OPTS,
  });
}

async function renderAllStaffMonthlyAttendancePdf({ records, meta }) {
  const rows = mapAllStaffMonthlyRows(records);
  const summary = attendanceSummary(records);
  return renderBrandedPdf({
    title: 'Staff Attendance — All Staff',
    subject: 'Monthly staff attendance register',
    columns: ALL_STAFF_MONTHLY_COLUMNS,
    rows,
    meta: buildReportMeta(
      meta,
      summary,
      `${rows.length} record${rows.length === 1 ? '' : 's'}`
    ),
    emptyMessage: 'No attendance records for the selected period.',
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
  attendanceSummary,
  MONTHS,
};
