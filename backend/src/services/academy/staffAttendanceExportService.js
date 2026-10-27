const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const {
  renderBrandedExcel,
  renderBrandedPdf,
  drawPdfLetterheadPlain,
  drawPdfFooterTextPlain,
  pdfLine,
  fitText,
  ACADEMY_BRAND,
  resolveLogoPath,
} = require('./academyReportDocument');
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
  { key: 'unmarked', header: 'Unmarked', excelWidth: 11, pdfWidth: 50, align: 'center' },
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

const WEEKDAY_SHORT = {
  monday: 'MON',
  tuesday: 'TUE',
  wednesday: 'WED',
  thursday: 'THU',
  friday: 'FRI',
  saturday: 'SAT',
  sunday: 'SUN',
};

const DEFAULT_WORKING_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MARK_YELLOW = '#FFE08A';

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
  const counts = { present: 0, late: 0, absent: 0, leave: 0, unmarked: 0 };
  periods.forEach((period) => {
    const status = String(period.status || '').toLowerCase();
    if (status && counts[status] != null) counts[status] += 1;
    else counts.unmarked += 1;
  });
  const total = periods.length;
  const attended = counts.present + counts.late;
  const kinds = ['present', 'late', 'absent', 'leave'].filter((kind) => counts[kind] > 0);
  if (counts.unmarked === 0 && kinds.length === 1) {
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

function statValue(row, key) {
  if (key === 'serial') return row.serial;
  if (key === 'name') return row.name;
  if (key === 'subject') return row.subject;
  return row[key] ?? '';
}

function layoutRegisterColumns(dayCount, pageWidth) {
  const margin = 12;
  const usable = Math.floor(pageWidth - margin * 2);
  const tail = [
    { key: 'total', title: 'Total', width: 28 },
    { key: 'delivered', title: 'Attended', width: 40 },
    { key: 'late', title: 'Late', width: 24 },
    { key: 'absent', title: 'Absent', width: 32 },
    { key: 'leave', title: 'Leave', width: 28 },
  ];
  let serialW = 18;
  let nameW = 100;
  let subjectW = 62;
  const tailWidth = () => tail.reduce((sum, column) => sum + column.width, 0);
  const dayBudget = () => usable - serialW - nameW - subjectW - tailWidth();
  if (dayCount && dayBudget() < dayCount * 16) {
    nameW = 78;
    subjectW = 46;
    tail.forEach((column) => {
      column.width = Math.max(20, column.width - 4);
    });
  }
  const budget = Math.max(0, dayBudget());
  const dayW = dayCount ? Math.floor(budget / dayCount) : 0;
  const remainder = dayCount ? budget - dayW * dayCount : 0;
  const columns = [
    { key: 'serial', title: 'S#', width: serialW, kind: 'serial' },
    { key: 'name', title: 'Teacher Name', width: nameW, kind: 'text' },
    { key: 'subject', title: 'Subject', width: subjectW, kind: 'text' },
  ];
  for (let i = 0; i < dayCount; i += 1) {
    columns.push({
      key: `d${i}`,
      width: dayW + (i < remainder ? 1 : 0),
      kind: 'day',
      dayIndex: i,
    });
  }
  tail.forEach((column) => columns.push({ ...column, kind: 'stat' }));
  const used = columns.reduce((sum, column) => sum + column.width, 0);
  columns[columns.length - 1].width += usable - used;
  return { margin, usable, columns };
}

function fillRect(doc, x, y, w, h, color) {
  doc.save();
  doc.rect(x, y, w, h).fill(color);
  doc.restore();
}

function strokeRect(doc, x, y, w, h) {
  doc.save();
  doc.lineWidth(0.45).strokeColor('#222222');
  doc.rect(x, y, w, h).stroke();
  doc.restore();
}

function paintText(doc, text, x, y, w, h, { align = 'center', font = 'Helvetica', size = 6.5, color = '#111111' } = {}) {
  doc.font(font).fontSize(size).fillColor(color);
  const label = fitText(doc, String(text ?? ''), Math.max(4, w - 2));
  const tw = doc.widthOfString(label);
  const tx = align === 'left' ? x + 2 : x + Math.max(1, (w - tw) / 2);
  const ty = y + (h - size) / 2 + 0.4;
  doc.text(label, tx, ty, { lineBreak: false });
}

function drawRegisterHeader(doc, columns, dayCols, x, y) {
  const headerH = 22;
  const half = headerH / 2;
  columns.forEach((column) => {
    if (column.kind === 'day') {
      const day = dayCols[column.dayIndex];
      fillRect(doc, x, y, column.width, half, '#1F3A5F');
      fillRect(doc, x, y + half, column.width, half, '#E4EAF1');
      paintText(doc, WEEKDAY_SHORT[day.weekday] || '', x, y, column.width, half, {
        font: 'Helvetica-Bold',
        size: 5.5,
        color: '#FFFFFF',
      });
      paintText(doc, String(Number(day.day.slice(8, 10))), x, y + half, column.width, half, {
        font: 'Helvetica-Bold',
        size: 6.5,
      });
      strokeRect(doc, x, y, column.width, half);
      strokeRect(doc, x, y + half, column.width, half);
    } else {
      fillRect(doc, x, y, column.width, headerH, '#1F3A5F');
      paintText(doc, column.title, x, y, column.width, headerH, {
        font: 'Helvetica-Bold',
        size: column.kind === 'stat' ? 5.5 : 6.5,
        color: '#FFFFFF',
      });
      strokeRect(doc, x, y, column.width, headerH);
    }
    x += column.width;
  });
  return y + headerH;
}

function drawRegisterRow(doc, columns, row, x, y, rowH, { footer = false } = {}) {
  columns.forEach((column) => {
    let text = '';
    let fill = footer ? '#F4F7FB' : null;
    if (column.kind === 'day') {
      const cell = footer ? row.dayTotals[column.dayIndex] : row.cells[column.dayIndex];
      text = cell?.text || '';
      if (cell?.fill) fill = cell.fill;
    } else if (footer) {
      if (column.key === 'name') text = 'Attended / classes';
      else if (column.kind === 'stat') text = row.totals[column.key] ?? '';
    } else {
      text = statValue(row, column.key);
    }
    if (fill) fillRect(doc, x, y, column.width, rowH, fill);
    paintText(doc, text, x, y, column.width, rowH, {
      align: column.kind === 'text' ? 'left' : 'center',
      font: footer || column.kind === 'day' ? 'Helvetica-Bold' : 'Helvetica',
      size: column.kind === 'day' ? 5.5 : 6.5,
    });
    strokeRect(doc, x, y, column.width, rowH);
    x += column.width;
  });
  return y + rowH;
}

function drawRegisterIntro(doc, meta, margin, usable, continued) {
  if (!continued) {
    let y = drawPdfLetterheadPlain(doc, ACADEMY_BRAND, resolveLogoPath());
    doc.save();
    doc.strokeColor('#C8C8C8').lineWidth(0.6);
    doc.moveTo(margin, y).lineTo(margin + usable, y).stroke();
    doc.restore();
    y += 8;
    const title = 'Monthly Attendance Register';
    doc.font('Helvetica-Bold').fontSize(11);
    const titleW = doc.widthOfString(title);
    const boxW = titleW + 28;
    const boxX = margin + (usable - boxW) / 2;
    doc.save();
    doc.lineWidth(1).strokeColor('#222222');
    doc.rect(boxX, y, boxW, 16).stroke();
    doc.restore();
    doc.fillColor('#111111');
    pdfLine(doc, title, boxX, y + 3.5, { width: boxW, align: 'center' });
    y += 24;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#333333');
    const left = meta.leftFilter || '';
    const center = meta.centerFilter || meta.sessionLabel || '';
    const right = meta.rightFilter || '';
    if (left) pdfLine(doc, left, margin, y, { width: usable * 0.34 });
    if (center) pdfLine(doc, center, margin, y, { width: usable, align: 'center' });
    if (right) pdfLine(doc, right, margin, y, { width: usable, align: 'right' });
    return y + 16;
  }
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#111111');
  pdfLine(doc, 'Monthly Attendance Register (continued)', margin, 12);
  if (meta.rightFilter) pdfLine(doc, meta.rightFilter, margin, 12, { width: usable, align: 'right' });
  return 26;
}

async function renderMonthlyRegisterPdf({ teachers, days, workingDays, meta = {} }) {
  const register = buildMonthlyRegister({ teachers, days, workingDays });
  const brand = ACADEMY_BRAND;
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 0,
        bufferPages: true,
        info: {
          Title: `Monthly Attendance Register — ${brand.name}`,
          Author: brand.name,
          Subject: 'Teacher monthly attendance register',
          Creator: brand.legalName,
        },
      });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const { margin, usable, columns } = layoutRegisterColumns(register.dayCols.length, doc.page.width);
      const rowH = 13;
      const bottom = doc.page.height - 40;
      let y = drawRegisterIntro(doc, meta, margin, usable, false);
      y = drawRegisterHeader(doc, columns, register.dayCols, margin, y);

      const nextPage = () => {
        doc.addPage({ size: 'A4', layout: 'landscape', margin: 0 });
        let nextY = drawRegisterIntro(doc, meta, margin, usable, true);
        nextY = drawRegisterHeader(doc, columns, register.dayCols, margin, nextY);
        return nextY;
      };

      if (!register.rows.length) {
        doc.font('Helvetica').fontSize(8).fillColor('#333333');
        doc.text('No timetable classes for the selected month.', margin, y + 8, { lineBreak: false });
      } else {
        register.rows.forEach((row) => {
          if (y + rowH > bottom) y = nextPage();
          y = drawRegisterRow(doc, columns, row, margin, y, rowH);
        });
        if (y + rowH > bottom) y = nextPage();
        drawRegisterRow(
          doc,
          columns,
          { dayTotals: register.dayTotals, totals: register.totals },
          margin,
          y,
          rowH,
          { footer: true }
        );
      }

      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i += 1) {
        doc.switchToPage(range.start + i);
        drawPdfFooterTextPlain(
          doc,
          brand,
          'Staff attendance report',
          { generatedAt: meta.generatedAt || new Date() },
          i + 1,
          range.count
        );
      }
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function applyExcelFill(cell, argb) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

async function renderMonthlyRegisterExcel({ teachers, days, workingDays, meta = {} }) {
  const register = buildMonthlyRegister({ teachers, days, workingDays });
  const workbook = new ExcelJS.Workbook();
  workbook.creator = ACADEMY_BRAND.name;
  const sheet = workbook.addWorksheet('Attendance', {
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
    },
    views: [{ state: 'frozen', xSplit: 3, ySplit: 5 }],
  });

  const tail = [
    { key: 'total', title: 'Total', width: 10 },
    { key: 'delivered', title: 'Attended', width: 12 },
    { key: 'late', title: 'Late', width: 8 },
    { key: 'absent', title: 'Absent', width: 10 },
    { key: 'leave', title: 'Leave', width: 10 },
  ];
  const columnCount = 3 + register.dayCols.length + tail.length;
  sheet.columns = [
    { width: 5 },
    { width: 28 },
    { width: 18 },
    ...register.dayCols.map(() => ({ width: 5 })),
    ...tail.map((column) => ({ width: column.width })),
  ];

  const thin = { style: 'thin', color: { argb: 'FF222222' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const title = 'Monthly Attendance Register';
  sheet.mergeCells(1, 1, 1, columnCount);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 16, color: { argb: 'FF1F3A5F' } };
  titleCell.alignment = { horizontal: 'center' };

  sheet.mergeCells(2, 1, 2, columnCount);
  sheet.getCell(2, 1).value = [meta.leftFilter, meta.centerFilter || meta.sessionLabel, meta.rightFilter]
    .filter(Boolean)
    .join('    |    ');
  sheet.getCell(2, 1).alignment = { horizontal: 'center' };

  const weekdayRow = sheet.getRow(4);
  const dateRow = sheet.getRow(5);
  const headers = [
    { title: 'S#' },
    { title: 'Teacher Name' },
    { title: 'Subject' },
    ...register.dayCols.map((day) => ({
      weekday: WEEKDAY_SHORT[day.weekday] || '',
      date: Number(day.day.slice(8, 10)),
    })),
    ...tail.map((column) => ({ title: column.title })),
  ];
  headers.forEach((header, index) => {
    const col = index + 1;
    if (header.weekday != null) {
      const top = weekdayRow.getCell(col);
      const bottom = dateRow.getCell(col);
      top.value = header.weekday;
      bottom.value = header.date;
      [top, bottom].forEach((cell) => {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.font = { bold: true, size: 9, color: { argb: top === cell ? 'FFFFFFFF' : 'FF111111' } };
        cell.border = border;
      });
      applyExcelFill(top, 'FF1F3A5F');
      applyExcelFill(bottom, 'FFE4EAF1');
    } else {
      sheet.mergeCells(4, col, 5, col);
      const cell = sheet.getCell(4, col);
      cell.value = header.title;
      cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = border;
      applyExcelFill(cell, 'FF1F3A5F');
      sheet.getCell(5, col).border = border;
      applyExcelFill(sheet.getCell(5, col), 'FF1F3A5F');
    }
  });

  const writeStat = (excelRow, source, { footer = false } = {}) => {
    const values = footer
      ? ['', 'Attended / classes', '', ...register.dayTotals.map((day) => day.text), ...tail.map((column) => source.totals[column.key])]
      : [
          source.serial,
          source.name,
          source.subject,
          ...source.cells.map((cell) => cell.text),
          ...tail.map((column) => source[column.key]),
        ];
    values.forEach((value, index) => {
      const cell = excelRow.getCell(index + 1);
      cell.value = value === '' ? null : value;
      cell.border = border;
      cell.alignment = {
        horizontal: index === 1 || index === 2 ? 'left' : 'center',
        vertical: 'middle',
      };
      if (footer) {
        cell.font = { bold: true, size: 9 };
        applyExcelFill(cell, 'FFF4F7FB');
      }
    });
    if (!footer) {
      source.cells.forEach((mark, index) => {
        if (!mark.fill) return;
        const cell = excelRow.getCell(4 + index);
        applyExcelFill(cell, 'FFFFE08A');
        cell.font = { bold: true, size: 10 };
      });
    } else {
      register.dayTotals.forEach((day, index) => {
        if (!day.fill) return;
        applyExcelFill(excelRow.getCell(4 + index), 'FFFFE08A');
      });
    }
  };

  register.rows.forEach((row) => writeStat(sheet.addRow([]), row));
  if (register.rows.length) writeStat(sheet.addRow([]), { totals: register.totals }, { footer: true });
  else {
    sheet.mergeCells(6, 1, 6, columnCount);
    sheet.getCell(6, 1).value = 'No timetable classes for the selected month.';
  }

  return workbook.xlsx.writeBuffer();
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
