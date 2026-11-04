const { renderBrandedExcel, renderBrandedPdf } = require('./academyReportDocument');
const { renderRegisterPdf, renderRegisterExcel, MARK_YELLOW } = require('./academyRegisterDocument');
const { formatWallClockRange } = require('../../utils/schoolDay');

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
  { key: 'attendance', header: 'Attendance %', excelWidth: 14, pdfWidth: 58, align: 'center' },
];

const PERIOD_COLUMNS = [
  { key: 'serial', header: 'S.No', excelWidth: 6, pdfWidth: 26, align: 'center' },
  { key: 'date', header: 'Date', excelWidth: 12, pdfWidth: 58 },
  { key: 'period', header: 'Period', excelWidth: 12, pdfWidth: 52, wrap: true },
  { key: 'time', header: 'Time', excelWidth: 24, pdfWidth: 96, align: 'center' },
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
  if (!status) return 'Present';
  return String(status)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function summaryLine(summary) {
  if (!summary) return '';
  const total = summary.totalClasses ?? summary.present ?? 0;
  return `Total classes ${total}  ·  Present ${summary.present ?? 0}  ·  Late ${summary.late ?? 0}  ·  Absent ${summary.absent ?? 0}  ·  Leave ${summary.leave ?? 0}`;
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
      attendance: `${t.attendancePercent ?? 0}%`,
    }));
}

function mapPeriodRows(periods, { includeDate = false } = {}) {
  return (periods || []).map((p, i) => ({
    serial: i + 1,
    date: includeDate ? p.day || '—' : '—',
    period: p.label || '—',
    time: p.startTime && p.endTime ? formatWallClockRange(p.startTime, p.endTime, '–') : '—',
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

const DEFAULT_WORKING_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function daysFromTeachers(teachers) {
  const map = new Map();
  (teachers || []).forEach((teacher) => {
    (teacher.periods || []).forEach((period) => {
      const day = String(period.day || '').slice(0, 10);
      if (!day || map.has(day)) return;
      map.set(day, { day, weekday: String(period.weekday || '').toLowerCase() });
    });
  });
  return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
}

function selectRegisterDays(days, workingDays, teachers) {
  const source = (Array.isArray(days) && days.length ? days : daysFromTeachers(teachers))
    .map((day) => ({
      day: String(day.day || '').slice(0, 10),
      weekday: String(day.weekday || '').toLowerCase(),
    }))
    .filter((day) => day.day)
    .sort((a, b) => a.day.localeCompare(b.day));
  const working = new Set(
    (Array.isArray(workingDays) && workingDays.length ? workingDays : DEFAULT_WORKING_DAYS).map((day) =>
      String(day).toLowerCase()
    )
  );
  const taught = new Set();
  (teachers || []).forEach((teacher) => {
    (teacher.periods || []).forEach((period) => {
      const day = String(period.day || '').slice(0, 10);
      if (day) taught.add(day);
    });
  });
  return source.filter((day) => working.has(day.weekday) || taught.has(day.day));
}

function subjectNames(teacher) {
  const names = [];
  (teacher.periods || []).forEach((period) => {
    String(period.subjectLabel || '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((name) => {
        if (!names.includes(name)) names.push(name);
      });
  });
  return names;
}

function primarySubject(teacher) {
  const counts = new Map();
  (teacher.periods || []).forEach((period) => {
    const name = String(period.subjectLabel || '')
      .split(',')
      .map((part) => part.trim())
      .find(Boolean);
    if (!name) return;
    counts.set(name, (counts.get(name) || 0) + 1);
  });
  let best = '—';
  let bestCount = -1;
  counts.forEach((count, name) => {
    if (count > bestCount || (count === bestCount && name.localeCompare(best) < 0)) {
      best = name;
      bestCount = count;
    }
  });
  return best;
}

function dayMark(periods) {
  if (!periods.length) return { text: '', fill: null, attended: 0, total: 0 };
  const counts = { present: 0, late: 0, absent: 0, leave: 0 };
  periods.forEach((period) => {
    // Statuses arrive resolved (saved mark → camera check-in → absent).
    const status = String(period.status || '').toLowerCase();
    counts[counts[status] != null ? status : 'absent'] += 1;
  });
  const total = periods.length;
  const attended = counts.present + counts.late;
  const kinds = ['present', 'late', 'absent', 'leave'].filter((kind) => counts[kind] > 0);
  if (kinds.length === 1) {
    const kind = kinds[0];
    const text = kind === 'present' ? 'P' : kind === 'late' ? 'T' : kind === 'absent' ? 'A' : 'L';
    return { text, fill: text === 'P' ? null : MARK_YELLOW, attended, total };
  }
  return {
    text: `${attended}/${total}`,
    fill: attended < total ? MARK_YELLOW : null,
    attended,
    total,
  };
}

function buildMonthlyRegister({ teachers, days, workingDays }) {
  const dayCols = selectRegisterDays(days, workingDays, teachers);
  const rows = [...(teachers || [])]
    .map((teacher) => {
      const byDay = new Map();
      (teacher.periods || []).forEach((period) => {
        const key = String(period.day || '').slice(0, 10);
        if (!key) return;
        if (!byDay.has(key)) byDay.set(key, []);
        byDay.get(key).push(period);
      });
      const subjects = subjectNames(teacher);
      const present = teacher.present || 0;
      const late = teacher.late || 0;
      return {
        name: teacher.name || '—',
        subject: subjects.join(', ') || '—',
        sortSubject: primarySubject(teacher),
        cells: dayCols.map((day) => dayMark(byDay.get(day.day) || [])),
        total: teacher.totalClasses || 0,
        delivered: present + late,
        late,
        absent: teacher.absent || 0,
        leave: teacher.leave || 0,
      };
    })
    .sort((a, b) => {
      const subjectOrder = a.sortSubject.localeCompare(b.sortSubject, undefined, { sensitivity: 'base' });
      if (subjectOrder !== 0) return subjectOrder;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    })
    .map((row, index) => ({ ...row, serial: index + 1 }));

  const dayTotals = dayCols.map((day, index) => {
    let attended = 0;
    let total = 0;
    rows.forEach((row) => {
      attended += row.cells[index].attended;
      total += row.cells[index].total;
    });
    return {
      day,
      text: total ? `${attended}/${total}` : '',
      fill: total && attended < total ? MARK_YELLOW : null,
      attended,
      total,
    };
  });

  const totals = rows.reduce(
    (sum, row) => {
      sum.total += row.total;
      sum.delivered += row.delivered;
      sum.late += row.late;
      sum.absent += row.absent;
      sum.leave += row.leave;
      return sum;
    },
    { total: 0, delivered: 0, late: 0, absent: 0, leave: 0 }
  );

  return { dayCols, rows, dayTotals, totals };
}

const MONTHLY_REGISTER_SPEC = {
  title: 'Monthly Attendance Register',
  pdfSubject: 'Teacher monthly attendance register',
  footerText: 'Staff attendance report',
  emptyMessage: 'No timetable classes for the selected month.',
  leadColumns: [
    { key: 'serial', title: 'S#', width: 18, excelWidth: 5 },
    { key: 'name', title: 'Teacher Name', width: 100, compactWidth: 78, excelWidth: 28 },
    { key: 'subject', title: 'Subject', width: 62, compactWidth: 46, excelWidth: 18 },
  ],
  tailColumns: [
    { key: 'total', title: 'Total', width: 28, excelWidth: 10 },
    { key: 'delivered', title: 'Attended', width: 40, excelWidth: 12 },
    { key: 'late', title: 'Late', width: 24, excelWidth: 8 },
    { key: 'absent', title: 'Absent', width: 32, excelWidth: 10 },
    { key: 'leave', title: 'Leave', width: 28, excelWidth: 10 },
  ],
  footerLabelKey: 'name',
  footerLabel: 'Attended / classes',
};

async function renderMonthlyRegisterPdf({ teachers, days, workingDays, meta = {} }) {
  return renderRegisterPdf(buildMonthlyRegister({ teachers, days, workingDays }), MONTHLY_REGISTER_SPEC, meta);
}

async function renderMonthlyRegisterExcel({ teachers, days, workingDays, meta = {} }) {
  return renderRegisterExcel(buildMonthlyRegister({ teachers, days, workingDays }), MONTHLY_REGISTER_SPEC, meta);
}

async function renderMonthlyStaffAttendanceExcel({ staffUser, periods, days, workingDays, meta }) {
  return renderMonthlyRegisterExcel({
    teachers: [{ ...(staffUser || {}), periods: periods || [] }],
    days,
    workingDays,
    meta,
  });
}

async function renderMonthlyStaffAttendancePdf({ staffUser, periods, days, workingDays, meta }) {
  return renderMonthlyRegisterPdf({
    teachers: [{ ...(staffUser || {}), periods: periods || [] }],
    days,
    workingDays,
    meta,
  });
}

async function renderAllStaffMonthlyAttendanceExcel({ teachers, days, workingDays, meta }) {
  return renderMonthlyRegisterExcel({ teachers, days, workingDays, meta });
}

async function renderAllStaffMonthlyAttendancePdf({ teachers, days, workingDays, meta }) {
  return renderMonthlyRegisterPdf({ teachers, days, workingDays, meta });
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
