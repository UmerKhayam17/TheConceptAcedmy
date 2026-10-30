/**
 * Printable salary slip for one voucher — always a single A4 page.
 * Uses the same plain letterhead, tables and footer as the other academy PDF exports.
 * When the slip is too long (many students), it is scaled down just enough to fit,
 * and the extra width this gives is used for more student columns.
 *
 * variant 'summary' prints the salary sheet (class-wise fee → teacher % → leave deduction →
 * total payable) and attendance only, without the student-wise lists.
 */

const PDFDocument = require('pdfkit');
const {
  formatDate,
  pdfLine,
  drawPdfLetterheadPlain,
  drawPdfTitlePlain,
  drawPdfFooterTextPlain,
  drawPdfTableHeader,
  drawPdfRow,
  ACADEMY_BRAND,
  resolveLogoPath,
} = require('./academyReportDocument');
const AcademySalaryRecord = require('../../models/academy/AcademySalaryRecord');
const { getSalaryRecordById } = require('./academySalaryService');

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MARGIN = 36;
const A4 = { width: 595.28, height: 841.89 };
/** Space kept clear at the bottom for the footer rule and text. */
const FOOTER_SPACE = 36;

function rs(n) {
  const v = Number(n) || 0;
  return `Rs ${v.toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
}

/** Amount without the "Rs" prefix, for narrow columns whose header already says Rs. */
function money(n) {
  return (Number(n) || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 });
}

function cap(s) {
  if (!s) return '—';
  return String(s)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function classLabel(className, sectionName) {
  return [className, sectionName].map((v) => String(v || '').trim()).filter(Boolean).join(' ') || '—';
}

function shortDate(ymd) {
  const d = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowThousand(n) {
  const parts = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }
  if (n >= 20) parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : ''));
  else if (n > 0) parts.push(ONES[n]);
  return parts.join(' ');
}

/** Pakistani numbering (lakh / crore). */
function amountInWords(amount) {
  let n = Math.round(Number(amount) || 0);
  if (n === 0) return 'Rupees Zero Only';
  const parts = [];
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${belowThousand(crore)} Crore`);
  if (lakh) parts.push(`${belowThousand(lakh)} Lakh`);
  if (thousand) parts.push(`${belowThousand(thousand)} Thousand`);
  if (n) parts.push(belowThousand(n));
  return `Rupees ${parts.join(' ')} Only`;
}

/** Scale relative column weights to the printable width. */
function sizeColumns(columns, usableWidth) {
  const total = columns.reduce((s, c) => s + c.w, 0);
  const sized = columns.map((c) => ({ ...c, pdfWidth: Math.floor((c.w / total) * usableWidth) }));
  const used = sized.reduce((s, c) => s + c.pdfWidth, 0);
  sized[sized.length - 1].pdfWidth += usableWidth - used;
  return sized;
}

/** Narrowest a student-list column may get (logical points) before names stop fitting. */
const MIN_STUDENT_COL_W = 220;

/** The teacher's classes (tuition pools, or fixed-pay class split) and the total they add up to. */
function classShares(rec, isPercentage) {
  if (isPercentage) {
    const pools = rec.calculationBreakdown || [];
    return { pools, total: pools.reduce((s, l) => s + (Number(l.salary) || 0), 0) };
  }
  const alloc = rec.classAllocation || { basis: 'none', lines: [] };
  const pools = alloc.lines || [];
  return {
    pools,
    basis: alloc.basis,
    total: pools.length
      ? pools.reduce((s, l) => s + (Number(l.salary) || 0), 0)
      : Number(rec.amount) || 0,
  };
}

/** Draws the whole slip from the top of the current page. Returns the bottom y. */
function drawSlip(doc, ctx) {
  const { rec, staff, role, period, isPercentage, pct, amount, brand, logoPath } = ctx;
  const summary = ctx.variant === 'summary';
  const usable = doc.page.width - MARGIN * 2;
  let y;

  const heading = (text) => {
    y += 8;
    doc.save();
    doc.rect(MARGIN, y, usable, 15).fill('#3D3D3D');
    doc.restore();
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5);
    pdfLine(doc, text.toUpperCase(), MARGIN + 6, y + 4);
    y += 18;
  };

  const note = (text, { italic = true, color = '#555555', size = 7.5 } = {}) => {
    if (!text) return;
    doc.fillColor(color).font(italic ? 'Helvetica-Oblique' : 'Helvetica').fontSize(size);
    const h = doc.heightOfString(text, { width: usable });
    doc.text(text, MARGIN, y + 2, { width: usable });
    y += h + 4;
  };

  const table = (columnsSpec, rows) => {
    const columns = sizeColumns(columnsSpec, usable);
    y = drawPdfTableHeader(doc, columns, MARGIN, y, brand, { plain: true });
    rows.forEach((row, idx) => {
      y = drawPdfRow(doc, columns, row, MARGIN, y, idx % 2 === 1 && !row._isTotal, brand, {
        plain: true,
        fontSize: 8,
        minRowH: 15,
      });
    });
  };

  /** Small grey header row for the compact student lists. */
  const gridHeader = (columns, x, top) => {
    const w = columns.reduce((s, c) => s + c.pdfWidth, 0);
    doc.save();
    doc.rect(x, top, w, 13).fill('#3D3D3D');
    doc.restore();
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
    let cx = x;
    columns.forEach((c) => {
      pdfLine(doc, c.header, cx + 3, top + 3.5, { width: c.pdfWidth - 6, align: c.align === 'left' ? 'left' : c.align });
      cx += c.pdfWidth;
    });
    return top + 13;
  };

  /** Compact student list: rows split top-to-bottom into as many columns as the width allows. */
  const grid = (columnsSpec, rows) => {
    const gap = 8;
    const maxCols = Math.max(1, Math.floor((usable + gap) / (MIN_STUDENT_COL_W + gap)));
    const cols = Math.max(1, Math.min(maxCols, Math.ceil(rows.length / 5)));
    const colW = (usable - gap * (cols - 1)) / cols;
    const columns = sizeColumns(columnsSpec, colW);
    const perCol = Math.ceil(rows.length / cols);
    const top = y;
    let maxY = top;
    for (let c = 0; c < cols; c += 1) {
      const chunk = rows.slice(c * perCol, (c + 1) * perCol);
      if (!chunk.length) continue;
      const x = MARGIN + c * (colW + gap);
      let cy = gridHeader(columns, x, top);
      chunk.forEach((row, idx) => {
        cy = drawPdfRow(doc, columns, row, x, cy, idx % 2 === 1, brand, {
          plain: true,
          fontSize: 8.5,
          fixedRowH: 12.5,
        });
      });
      maxY = Math.max(maxY, cy);
    }
    y = maxY;
  };

  /** Register-style salary sheet: bordered grid like the school's paper salary sheet. */
  const salarySheet = () => {
    const pools = new Map();
    (rec.calculationBreakdown || []).forEach((l) => {
      const key = classLabel(l.className, l.sectionName);
      pools.set(key, (pools.get(key) || 0) + (Number(l.pool) || 0));
    });
    const classCols = isPercentage ? [...pools.entries()] : [];
    const showPools = classCols.length > 0;
    const poolTotal = classCols.reduce((sum, [, v]) => sum + v, 0);

    const att = rec.attendance?.classes;
    const daily = rec.attendance?.daily;
    const fullLeaves = att?.fullLeaveDays ?? (daily ? (daily.absent || 0) + (daily.leave || 0) : 0);
    const daysInMonth = new Date(rec.year, rec.month, 0).getDate() || 30;
    const perDay = Math.round(amount / daysInMonth);
    const deduction = fullLeaves * perDay;
    const advance = 0;
    const extra = 0;
    const net = Math.max(0, amount - advance - deduction);
    const totalPayable = net + extra;

    const whole = (n) => (Math.round(Number(n) || 0) ? Math.round(n).toLocaleString('en-PK') : '-');
    const labelW = 118;
    const totalW = 80;
    const midW = usable - labelW - totalW;
    const classW = showPools ? midW / classCols.length : midW;
    const fs = classCols.length > 7 ? 7 : 8.5;
    const rowH = 18;

    const box = (x, w, text, { align = 'left', bold = false, fill = null, size = fs } = {}) => {
      doc.save();
      if (fill) doc.rect(x, y, w, rowH).fill(fill);
      doc.strokeColor('#222222').lineWidth(0.6).rect(x, y, w, rowH).stroke();
      doc.restore();
      if (text === '' || text == null) return;
      doc.fillColor('#111111').font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
      pdfLine(doc, String(text), x + 4, y + (rowH - size) / 2 + 0.5, { width: w - 8, align });
    };
    const totalX = MARGIN + labelW + midW;
    const row = (label, value, mid = '', opts = {}) => {
      box(MARGIN, labelW, label, { bold: true, fill: opts.fill });
      box(MARGIN + labelW, midW, mid, { fill: opts.fill, size: 8 });
      box(totalX, totalW, value, { align: 'right', bold: true, fill: opts.fill, size: opts.size || fs });
      y += rowH;
    };

    if (showPools) {
      box(MARGIN, labelW, '', { fill: '#F0F0F0' });
      box(MARGIN + labelW, midW + totalW, 'SUBJECT-WISE TOTAL FEE', { align: 'center', bold: true, fill: '#F0F0F0' });
      y += rowH;
      box(MARGIN, labelW, 'Month', { align: 'center', bold: true, fill: '#F0F0F0' });
      classCols.forEach(([label], i) => {
        box(MARGIN + labelW + i * classW, classW, label, { align: 'center', bold: true, fill: '#F0F0F0' });
      });
      box(totalX, totalW, 'Total', { align: 'center', bold: true, fill: '#F0F0F0' });
      y += rowH;
      box(MARGIN, labelW, period.toUpperCase(), { align: 'center', bold: true });
      classCols.forEach(([, pool], i) => {
        box(MARGIN + labelW + i * classW, classW, whole(pool), { align: 'right' });
      });
      box(totalX, totalW, whole(poolTotal), { align: 'right', bold: true });
      y += rowH;
      row('Teacher Percentage', `${pct}%`);
    } else {
      row('Month', period.toUpperCase(), 'Fixed monthly salary');
    }
    row('Total Salary Payable', whole(amount));
    row('Advance Payment', whole(advance));
    row(
      'Leave Deduction',
      whole(deduction),
      `Full leaves during the month: ${fullLeaves}    Per day salary: ${whole(perDay)} (${daysInMonth} days)`
    );
    row('Net Salary Payable', whole(net));
    row('Extra', whole(extra));
    row('TOTAL PAYABLE', `Rs ${whole(totalPayable)}`, '', { fill: '#E4E4E4', size: 9.5 });
    note(amountInWords(totalPayable), { color: '#333333' });
  };

  // ── Header ──────────────────────────────────────────────────────────
  y = drawPdfLetterheadPlain(doc, brand, logoPath);
  y = drawPdfTitlePlain(
    doc,
    {
      title: summary
        ? `SALARY SLIP — ${period.toUpperCase()}`
        : `SALARY SLIP WITH STUDENT DETAILS — ${period.toUpperCase()}`,
      leftFilter: `Voucher: ${rec.voucherNumber || '—'}`,
      rightFilter: `Status: ${cap(rec.status)}`,
    },
    y
  );
  y += 2;

  // ── Employee / payment details ──────────────────────────────────────
  const left = [
    ['Employee name', staff.name || '—'],
    ['Designation', cap(role)],
    ['Contact no.', staff.phone || '—'],
  ];
  const right = [
    ['Pay type', isPercentage ? `Percentage (${pct}%)` : 'Fixed monthly'],
    ['Paid on', rec.status === 'paid' && rec.paidAt ? formatDate(rec.paidAt) : 'Not paid yet'],
    ['Payment method', rec.status === 'paid' ? cap(rec.paymentMethod) : '—'],
  ];
  const colW = usable / 2;
  const rowH = 13;
  const boxH = left.length * rowH + 8;
  doc.save();
  doc.strokeColor('#222222').lineWidth(0.8);
  doc.rect(MARGIN, y, usable, boxH).stroke();
  doc.moveTo(MARGIN + colW, y).lineTo(MARGIN + colW, y + boxH).stroke();
  doc.restore();
  [left, right].forEach((items, ci) => {
    const x = MARGIN + ci * colW + 8;
    items.forEach(([label, value], i) => {
      const ry = y + 6 + i * rowH;
      doc.fillColor('#555555').font('Helvetica').fontSize(8.5);
      pdfLine(doc, label, x, ry);
      doc.fillColor('#111111').font('Helvetica-Bold').fontSize(8.5);
      pdfLine(doc, String(value ?? '—'), x + 88, ry, { width: colW - 104 });
    });
  });
  y += boxH;

  const shares = classShares(rec, isPercentage);
  if (summary) {
    heading('1. Salary detail');
    salarySheet();
  } else {
  // ── 1. Salary by class ──────────────────────────────────────────────
  heading('1. Salary by class');
  // Class-wise salary table; the amount column is keyed `salary` so the Grand Total lines up.
  const summaryRows = shares.pools.length
    ? shares.pools.map((l, i) => ({
        serial: i + 1,
        cls: classLabel(l.className, l.sectionName),
        subject: l.subjectName || '—',
        students: isPercentage ? (l.students || []).length || l.studentCount || 0 : (l.students || []).length,
        basis: isPercentage ? rs(l.pool) : `${l.periods}`,
        rate: isPercentage ? `${l.teacherCutPercent ?? pct}%` : `${l.sharePercent}%`,
        salary: rs(l.salary),
      }))
    : [{ serial: 1, cls: 'Fixed monthly salary', subject: '—', students: '—', basis: '—', rate: '100%', salary: rs(amount) }];
  summaryRows.push({ _isTotal: true, salary: rs(shares.total) });
  table(
    [
      { key: 'serial', header: '#', w: 5, align: 'center' },
      { key: 'cls', header: 'Class', w: 14, align: 'left' },
      { key: 'subject', header: 'Subject', w: 22, align: 'left' },
      { key: 'students', header: 'Students', w: 10, align: 'center' },
      { key: 'basis', header: isPercentage ? 'Subject revenue' : 'Periods taught', w: 17, align: isPercentage ? 'right' : 'center' },
      { key: 'rate', header: isPercentage ? 'Teacher %' : 'Share', w: 12, align: 'center' },
      { key: 'salary', header: 'Salary', w: 20, align: 'right' },
    ],
    summaryRows
  );

  // ── 2. Student-wise calculation, every class ────────────────────────
  heading('2. Student-wise calculation — every class');
  if (!shares.pools.length) note('No classes to show.');
  shares.pools.forEach((l) => {
    const students = l.students || [];
    y += 3;
    doc.save();
    doc.rect(MARGIN, y, usable, 15).fill('#E4E4E4');
    doc.restore();
    doc.fillColor('#111111').font('Helvetica-Bold').fontSize(8.5);
    pdfLine(doc, `${classLabel(l.className, l.sectionName)} · ${l.subjectName || 'Subject'}`, MARGIN + 6, y + 4);
    const summary = isPercentage
      ? `${students.length || l.studentCount || 0} students  ·  Subject revenue ${rs(l.pool)} × ${l.teacherCutPercent ?? pct}%  =  Teacher share ${rs(l.salary)}`
      : `${students.length} students  ·  ${l.periods} periods (${l.sharePercent}%)  =  Class share ${rs(l.salary)}`;
    pdfLine(doc, summary, MARGIN, y + 4, { width: usable - 6, align: 'right' });
    y += 15;

    if (!students.length) {
      note(
        isPercentage
          ? 'Student details were not saved on this voucher (generated before per-student lines were stored).'
          : 'No active students enrolled in this subject.'
      );
      return;
    }
    if (isPercentage) {
      grid(
        [
          { key: 'serial', header: '#', w: 10, align: 'center' },
          { key: 'student', header: 'Student', w: 36, align: 'left' },
          { key: 'how', header: 'Counted', w: 32, align: 'center' },
          { key: 'salary', header: 'Share (Rs)', w: 22, align: 'right' },
        ],
        students.map((st, i) => ({
          serial: i + 1,
          student: st.studentName || '—',
          how: String(st.howCounted || '—').replace(/^Whole fee:\s*/i, ''),
          salary: money(st.contribution),
        }))
      );
    } else {
      const perStudent = Math.round(((Number(l.salary) || 0) / students.length) * 100) / 100;
      grid(
        [
          { key: 'serial', header: '#', w: 10, align: 'center' },
          { key: 'student', header: 'Student', w: 43, align: 'left' },
          { key: 'roll', header: 'Roll no.', w: 24, align: 'center' },
          { key: 'salary', header: 'Share (Rs)', w: 22, align: 'right' },
        ],
        students.map((st, i) => ({
          serial: i + 1,
          student: st.studentName || '—',
          roll: st.rollNumber || '—',
          salary: money(perStudent),
        }))
      );
    }
  });
  note(
    isPercentage
      ? '"Counted": "15% of 8,500" = full-package student (subject share % of the monthly fee); "9,100 ÷ 8" = selective student ' +
          `(monthly fee split equally across subjects taken). Subject revenue = total of the "Share" column; the teacher receives ${pct}% of it. Admission fee not included.`
      : shares.basis === 'periods'
        ? `Fixed salary of ${rs(amount)} divided between classes by periods taught this month; per-student share is for reference only.`
        : `Fixed salary of ${rs(amount)} divided equally between classes; per-student share is for reference only.`
  );
  }

  // ── 3. Attendance ───────────────────────────────────────────────────
  heading(`${summary ? 2 : 3}. Attendance — ${period}`);
  const cls = rec.attendance?.classes;
  const daily = rec.attendance?.daily;
  let anyAttendance = false;
  if (cls && cls.summary.totalClasses > 0) {
    anyAttendance = true;
    const s = cls.summary;
    const isDaily = cls.attendanceType === 'daily';
    const rows = isDaily
      ? [{ cls: 'Full day', subject: '—', total: s.totalClasses, present: s.present, late: s.late, absent: s.absent, leave: s.leave, pctv: `${s.attendancePercent}%` }]
      : cls.byClass.map((r) => ({
          cls: classLabel(r.className, r.sectionName),
          subject: r.subjectName || '—',
          total: r.totalClasses,
          present: r.present,
          late: r.late,
          absent: r.absent,
          leave: r.leave,
          pctv: `${r.attendancePercent}%`,
        }));
    if (!isDaily && rows.length > 1) {
      rows.push({ _isTotal: true, total: s.totalClasses, present: s.present, late: s.late, absent: s.absent, leave: s.leave, pctv: `${s.attendancePercent}%` });
    }
    table(
      [
        { key: 'cls', header: 'Class', w: 15, align: 'left' },
        { key: 'subject', header: 'Subject', w: 23, align: 'left' },
        { key: 'total', header: isDaily ? 'Working days' : 'Classes held', w: 12, align: 'center' },
        { key: 'present', header: 'Present', w: 10, align: 'center' },
        { key: 'late', header: 'Late', w: 9, align: 'center' },
        { key: 'absent', header: 'Absent', w: 10, align: 'center' },
        { key: 'leave', header: 'Leave', w: 9, align: 'center' },
        { key: 'pctv', header: 'Attendance', w: 12, align: 'center' },
      ],
      rows
    );
    const off = (cls.exceptions || []).map((e) => {
      const kinds = [...new Set(e.items.map((i) => (i.status === 'leave' ? 'leave' : 'absent')))];
      return `${shortDate(e.day)} (${kinds.join('/')})`;
    });
    note(
      `Present in ${s.present + s.late} of ${s.totalClasses} ${isDaily ? 'working days' : 'classes'}` +
        (s.late ? `, late ${s.late} time${s.late === 1 ? '' : 's'}` : '') +
        '. ' +
        (off.length ? `Absent / leave on: ${off.join(', ')}.` : 'No absences this month.') +
        ' Classes not marked count as present.' +
        (daily && daily.totalDays > 0
          ? ` Daily check-in: ${daily.totalDays} day${daily.totalDays === 1 ? '' : 's'} recorded (${daily.present} present, ${daily.late} late, ${daily.absent} absent, ${daily.leave} leave).`
          : '')
    );
  } else if (daily && daily.totalDays > 0) {
    anyAttendance = true;
    note(
      `Daily check-in: ${daily.totalDays} day${daily.totalDays === 1 ? '' : 's'} recorded — ` +
        `${daily.present} present, ${daily.late} late, ${daily.half_day} half day, ${daily.absent} absent, ${daily.leave} leave.`,
      { italic: false, color: '#333333' }
    );
  }
  if (!anyAttendance) note('No attendance was recorded for this month.');

  // ── 4. Payment summary (the summary variant shows this inside the sheet) ──
  if (!summary) {
  heading('4. Payment summary');
  // Deductions / adjustment on the left, net salary box on the right.
  const adjustment = Math.round((amount - shares.total) * 100) / 100;
  const lines = [[isPercentage ? 'Total from all classes' : 'Total fixed salary', rs(shares.total)]];
  if (adjustment !== 0) {
    lines.push(['Adjustment (amount changed on voucher)', `${adjustment > 0 ? '+' : '-'} ${rs(Math.abs(adjustment))}`]);
  }
  lines.push(['Deductions', rs(0)]);
  const leftW = usable * 0.55;
  const netX = MARGIN + leftW + 12;
  const netW = usable - leftW - 12;
  const lineH = 15;
  doc.font('Helvetica-Oblique').fontSize(7);
  const wordsH = doc.heightOfString(amountInWords(amount), { width: netW - 20 });
  const sumH = Math.max(50, 38 + wordsH + 6);
  lines.forEach(([label, value], i) => {
    const ly = y + 4 + i * lineH;
    doc.fillColor('#222222').font('Helvetica').fontSize(8.5);
    pdfLine(doc, label, MARGIN + 4, ly, { width: leftW * 0.7 });
    pdfLine(doc, value, MARGIN, ly, { width: leftW - 4, align: 'right' });
    doc.save();
    doc.strokeColor('#D0D0D0').lineWidth(0.4);
    doc.moveTo(MARGIN, ly + 11).lineTo(MARGIN + leftW, ly + 11).stroke();
    doc.restore();
  });
  doc.save();
  doc.rect(netX, y, netW, sumH).fill('#F0F0F0');
  doc.strokeColor('#111111').lineWidth(1.2).rect(netX, y, netW, sumH).stroke();
  doc.restore();
  doc.fillColor('#555555').font('Helvetica-Bold').fontSize(7.5);
  pdfLine(doc, 'NET SALARY PAYABLE', netX + 10, y + 7);
  doc.fillColor('#111111').font('Helvetica-Bold').fontSize(15);
  pdfLine(doc, rs(amount), netX + 10, y + 18);
  doc.fillColor('#333333').font('Helvetica-Oblique').fontSize(7);
  doc.text(amountInWords(amount), netX + 10, y + 36, { width: netW - 20 });
  y += Math.max(sumH, lines.length * lineH + 4) + 2;
  }

  // Notes typed by staff (auto-generated calculation notes are already explained above).
  const remarks = String(rec.notes || '').trim();
  if (remarks && !/^auto:/i.test(remarks)) note(`Remarks: ${remarks}`, { italic: false, color: '#333333' });

  // ── Signatures ──────────────────────────────────────────────────────
  y += 28;
  const labels = ['Prepared by', 'Accounts', 'Principal', 'Employee signature'];
  const gap = 18;
  const sw = (usable - gap * (labels.length - 1)) / labels.length;
  labels.forEach((label, i) => {
    const x = MARGIN + i * (sw + gap);
    doc.save();
    doc.strokeColor('#222222').lineWidth(0.7);
    doc.moveTo(x, y).lineTo(x + sw, y).stroke();
    doc.restore();
    doc.fillColor('#444444').font('Helvetica').fontSize(8);
    pdfLine(doc, label, x, y + 4, { width: sw, align: 'center' });
  });
  y += 16;
  doc.fillColor('#777777').font('Helvetica-Oblique').fontSize(7);
  pdfLine(doc, 'This is a computer-generated salary slip.', MARGIN, y);
  return y + 10;
}

/**
 * Render at a given scale. The slip is laid out on a logical page of A4 ÷ scale,
 * so a smaller scale also gives the student lists more width (more columns).
 */
function renderToBuffer(ctx, { scale, info, measureOnly = false }) {
  return new Promise((resolve, reject) => {
    try {
      const logicalW = A4.width / scale;
      const logicalH = A4.height / scale;
      // Measuring uses a very tall page so nothing wraps onto a second page.
      const doc = new PDFDocument({
        size: measureOnly ? [logicalW, 20000] : 'A4',
        margin: MARGIN,
        info,
      });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('error', reject);

      if (!measureOnly && scale < 1) {
        doc.scale(scale);
        doc.page.width = logicalW;
        doc.page.height = logicalH;
      }
      const bottom = drawSlip(doc, ctx);
      if (!measureOnly) {
        drawPdfFooterTextPlain(doc, ctx.brand, 'Salary slip', { generatedAt: ctx.generatedAt }, 1, 1);
      }
      doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), bottom }));
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/** Largest scale (≤ 1) at which the slip fits one A4 page. */
async function findFitScale(ctx, info) {
  const fits = async (scale) => {
    const { bottom } = await renderToBuffer(ctx, { scale, info, measureOnly: true });
    return bottom + FOOTER_SPACE <= A4.height / scale;
  };
  if (await fits(1)) return 1;
  let lo = 0.2;
  let hi = 1;
  for (let i = 0; i < 9; i += 1) {
    const mid = (lo + hi) / 2;
    if (await fits(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

async function renderSalarySlipPdf(id, { variant = 'students' } = {}) {
  const rec = await getSalaryRecordById(id);
  // A paid slip shows what was actually paid: the breakdown saved on the voucher,
  // not today's live recalculation (fees or assignments may have changed since).
  if (rec.status === 'paid') {
    const stored = await AcademySalaryRecord.findById(id).select('calculationBreakdown').lean();
    if (stored?.calculationBreakdown?.length) rec.calculationBreakdown = stored.calculationBreakdown;
  }
  const staff = rec.staffId && typeof rec.staffId === 'object' ? rec.staffId : {};
  const period = `${MONTHS[(rec.month || 1) - 1]} ${rec.year}`;
  const ctx = {
    rec,
    staff,
    // Support staff show their job (Guard, Sweeper, …) as the designation.
    role:
      staff.role && typeof staff.role === 'object'
        ? (staff.role.name === 'non_teaching_staff' && staff.designation) || staff.role.name
        : '',
    period,
    isPercentage: rec.payType === 'percentage' || rec.calculationSource === 'tuition_pool',
    pct: rec.detailMeta?.teacherPercentage ?? rec.salaryPercentage ?? 0,
    amount: Number(rec.amount) || 0,
    brand: ACADEMY_BRAND,
    logoPath: resolveLogoPath(),
    generatedAt: new Date(),
    variant,
  };
  const info = {
    Title: `Salary Slip — ${staff.name || ''} — ${period}`,
    Author: ACADEMY_BRAND.name,
    Subject: 'Salary slip',
    Creator: ACADEMY_BRAND.legalName,
  };

  const scale = await findFitScale(ctx, info);
  const { buffer } = await renderToBuffer(ctx, { scale, info });

  return {
    buffer,
    scale,
    fileName: `Salary-Slip${variant === 'summary' ? '-Summary' : ''}_${MONTHS[(rec.month || 1) - 1]}-${rec.year}.pdf`,
  };
}

module.exports = { renderSalarySlipPdf };
