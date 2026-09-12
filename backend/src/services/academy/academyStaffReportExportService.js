const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const {
  formatDate,
  formatDateTime,
  pdfLine,
  drawPdfLetterhead,
  drawPdfFooterText,
  drawPdfTableHeader,
  drawPdfRow,
} = require('./academyReportDocument');
const { ACADEMY_BRAND, resolveLogoPath } = require('../../config/academyBrand');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_LABELS = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

function money(n) {
  const num = Number(n) || 0;
  return `PKR ${num.toLocaleString('en-PK')}`;
}

function roleNameOf(user) {
  const r = user?.role;
  if (r && typeof r === 'object') return r.name || '';
  return String(r || '');
}

function fmtTime(value) {
  if (!value) return '—';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });
}

function cap(s) {
  if (!s) return '';
  return String(s).charAt(0).toUpperCase() + String(s).slice(1);
}

function payrollTotals(records) {
  let paid = 0;
  let pending = 0;
  records.forEach((r) => {
    if (r.status === 'paid') paid += Number(r.amount) || 0;
    if (r.status === 'pending') pending += Number(r.amount) || 0;
  });
  return { paid, pending };
}

function attendanceSummary(records) {
  const counts = { present: 0, late: 0, absent: 0, half_day: 0, leave: 0 };
  records.forEach((r) => {
    if (counts[r.status] != null) counts[r.status] += 1;
  });
  return counts;
}

function slotLabel(slot) {
  const cls = slot.class?.name || slot.class?.className || '';
  const sec = slot.section?.name || slot.section?.sectionName || '';
  const sub = slot.subject?.name || slot.subject?.subjectName || '';
  return { day: DAY_LABELS[slot.day] || slot.day, subject: sub, className: cls, section: sec, room: slot.room?.name || '—' };
}

function drawSectionTitle(doc, title, y, brand) {
  doc.fillColor(brand.colors.navy).font('Helvetica-Bold').fontSize(11);
  pdfLine(doc, title, 32, y);
  doc.save();
  doc.rect(32, y + 14, doc.page.width - 64, 2).fill(brand.colors.gold);
  doc.restore();
  return y + 22;
}

async function renderStaffReportPdf(payload) {
  const brand = ACADEMY_BRAND;
  const logoPath = resolveLogoPath();
  const user = payload.user;
  const salaries = payload.salaries || [];
  const attendance = payload.attendance || [];
  const slots = payload.slots || [];
  const totals = payrollTotals(salaries);
  const att = attendanceSummary(attendance);
  const generatedAt = new Date();
  const confidentialLabel = 'Confidential staff report';

  const payrollCols = [
    { key: 'period', header: 'Period', pdfWidth: 90 },
    { key: 'voucher', header: 'Voucher', pdfWidth: 110 },
    { key: 'amount', header: 'Amount', pdfWidth: 90, align: 'center' },
    { key: 'status', header: 'Status', pdfWidth: 80, align: 'center' },
    { key: 'paidAt', header: 'Paid on', pdfWidth: 90, align: 'center' },
    { key: 'method', header: 'Method', pdfWidth: 90 },
  ];
  const attCols = [
    { key: 'date', header: 'Date', pdfWidth: 90 },
    { key: 'status', header: 'Status', pdfWidth: 80, align: 'center' },
    { key: 'checkIn', header: 'Check-in', pdfWidth: 90, align: 'center' },
    { key: 'checkOut', header: 'Check-out', pdfWidth: 90, align: 'center' },
    { key: 'source', header: 'Source', pdfWidth: 80, align: 'center' },
  ];
  const ttCols = [
    { key: 'day', header: 'Day', pdfWidth: 90 },
    { key: 'subject', header: 'Subject', pdfWidth: 140 },
    { key: 'className', header: 'Class', pdfWidth: 90 },
    { key: 'section', header: 'Section', pdfWidth: 80, align: 'center' },
    { key: 'room', header: 'Room', pdfWidth: 90 },
  ];

  const payrollRows = salaries.map((r) => ({
    period: `${MONTHS[(r.month || 1) - 1]} ${r.year}`,
    voucher: r.voucherNumber || '—',
    amount: money(r.amount),
    status: cap(r.status),
    paidAt: r.paidAt ? formatDate(r.paidAt) : '—',
    method: r.paymentMethod ? cap(String(r.paymentMethod).replace('_', ' ')) : '—',
  }));
  const attRows = attendance.map((r) => ({
    date: formatDate(r.date),
    status: cap(r.status).replace('_', ' '),
    checkIn: fmtTime(r.checkIn),
    checkOut: fmtTime(r.checkOut),
    source: String(r.source || '').toUpperCase() || '—',
  }));
  const ttRows = slots.map(slotLabel);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 32,
        bufferPages: true,
        info: {
          Title: `Staff Report — ${user.name}`,
          Author: brand.name,
          Subject: 'Complete staff report',
          Creator: brand.legalName,
        },
      });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const bottomLimit = () => doc.page.height - 44;

      const startPage = (first) => {
        drawPdfLetterhead(doc, brand, logoPath);
        if (!first) return 96;
        doc.fillColor(brand.colors.navy).font('Helvetica-Bold').fontSize(13);
        pdfLine(doc, 'STAFF REPORT', 32, 96);
        doc.fillColor(brand.colors.muted).font('Helvetica').fontSize(8.5);
        pdfLine(doc, `${user.name}  ·  ${cap(roleNameOf(user))}  ·  ${user.email || ''}`, 32, 114);
        return 134;
      };

      const ensure = (y, need) => {
        if (y + need > bottomLimit()) {
          doc.addPage();
          return startPage(false);
        }
        return y;
      };

      let y = startPage(true);

      y = drawSectionTitle(doc, 'Profile', y, brand);
      doc.fillColor('#1A2A3A').font('Helvetica').fontSize(9);
      const profileBits = [
        `Name: ${user.name}`,
        `Role: ${cap(roleNameOf(user))}`,
        `Email: ${user.email || '—'}`,
        `Phone: ${user.phone || '—'}`,
        `Monthly salary: ${money(user.salary)}`,
        `Status: ${user.isActive ? 'Active' : 'Inactive'}`,
      ];
      profileBits.forEach((line, i) => {
        pdfLine(doc, line, 32 + (i % 3) * 250, y + Math.floor(i / 3) * 16);
      });
      y += 44;

      y = ensure(y, 80);
      y = drawSectionTitle(doc, 'Payroll', y, brand);
      doc.fillColor(brand.colors.navy).font('Helvetica-Bold').fontSize(9);
      pdfLine(doc, `Paid ${money(totals.paid)}    Pending ${money(totals.pending)}`, 32, y);
      y += 16;
      {
        const tableWidth = payrollCols.reduce((s, c) => s + c.pdfWidth, 0);
        const startX = (doc.page.width - tableWidth) / 2;
        y = drawPdfTableHeader(doc, payrollCols, startX, y, brand);
        if (!payrollRows.length) {
          doc.fillColor(brand.colors.muted).font('Helvetica-Oblique').fontSize(9);
          pdfLine(doc, 'No salary vouchers found.', startX, y + 8);
          y += 28;
        } else {
          payrollRows.forEach((row, idx) => {
            y = ensure(y, 16);
            if (y === 96) {
              y = drawPdfTableHeader(doc, payrollCols, startX, y, brand);
            }
            y = drawPdfRow(doc, payrollCols, row, startX, y, idx % 2 === 1, brand);
          });
          y += 12;
        }
      }

      y = ensure(y, 80);
      y = drawSectionTitle(doc, `Attendance (${payload.attendanceLabel || 'selected period'})`, y, brand);
      doc.fillColor(brand.colors.navy).font('Helvetica-Bold').fontSize(9);
      pdfLine(
        doc,
        `Present ${att.present}  ·  Late ${att.late}  ·  Absent ${att.absent}  ·  Half-day ${att.half_day}  ·  Leave ${att.leave}`,
        32,
        y
      );
      y += 16;
      {
        const tableWidth = attCols.reduce((s, c) => s + c.pdfWidth, 0);
        const startX = (doc.page.width - tableWidth) / 2;
        y = drawPdfTableHeader(doc, attCols, startX, y, brand);
        if (!attRows.length) {
          doc.fillColor(brand.colors.muted).font('Helvetica-Oblique').fontSize(9);
          pdfLine(doc, 'No attendance records for this period.', startX, y + 8);
          y += 28;
        } else {
          attRows.forEach((row, idx) => {
            y = ensure(y, 16);
            if (y === 96) y = drawPdfTableHeader(doc, attCols, startX, y, brand);
            y = drawPdfRow(doc, attCols, row, startX, y, idx % 2 === 1, brand);
          });
          y += 12;
        }
      }

      y = ensure(y, 80);
      y = drawSectionTitle(doc, `Timetable (${payload.sessionName || 'session'})`, y, brand);
      {
        const tableWidth = ttCols.reduce((s, c) => s + c.pdfWidth, 0);
        const startX = (doc.page.width - tableWidth) / 2;
        y = drawPdfTableHeader(doc, ttCols, startX, y, brand);
        if (!ttRows.length) {
          doc.fillColor(brand.colors.muted).font('Helvetica-Oblique').fontSize(9);
          pdfLine(doc, 'No published timetable slots for this teacher.', startX, y + 8);
        } else {
          ttRows.forEach((row, idx) => {
            y = ensure(y, 16);
            if (y === 96) y = drawPdfTableHeader(doc, ttCols, startX, y, brand);
            y = drawPdfRow(doc, ttCols, row, startX, y, idx % 2 === 1, brand);
          });
        }
      }

      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i += 1) {
        doc.switchToPage(range.start + i);
        drawPdfFooterText(doc, brand, confidentialLabel, { generatedAt }, i + 1, range.count);
      }
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

async function renderStaffReportExcel(payload) {
  const brand = ACADEMY_BRAND;
  const user = payload.user;
  const salaries = payload.salaries || [];
  const attendance = payload.attendance || [];
  const slots = payload.slots || [];
  const totals = payrollTotals(salaries);
  const att = attendanceSummary(attendance);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = brand.name;
  workbook.company = brand.legalName;
  workbook.created = new Date();

  const profile = workbook.addWorksheet('Profile');
  profile.columns = [{ width: 22 }, { width: 40 }];
  profile.getCell('A1').value = brand.name;
  profile.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF0E2A4E' } };
  profile.mergeCells('A1:B1');
  profile.getCell('A2').value = 'Staff report';
  [
    ['Name', user.name],
    ['Role', cap(roleNameOf(user))],
    ['Email', user.email || ''],
    ['Phone', user.phone || ''],
    ['Monthly salary', money(user.salary)],
    ['Status', user.isActive ? 'Active' : 'Inactive'],
    ['Total paid', money(totals.paid)],
    ['Total pending', money(totals.pending)],
    [
      'Attendance',
      `Present ${att.present} · Late ${att.late} · Absent ${att.absent} · Half-day ${att.half_day} · Leave ${att.leave}`,
    ],
  ].forEach((row, i) => {
    profile.getCell(`A${i + 4}`).value = row[0];
    profile.getCell(`A${i + 4}`).font = { bold: true, color: { argb: 'FF0E2A4E' } };
    profile.getCell(`B${i + 4}`).value = row[1];
  });

  const paySheet = workbook.addWorksheet('Payroll');
  paySheet.columns = [
    { header: 'Period', key: 'period', width: 14 },
    { header: 'Voucher', key: 'voucher', width: 18 },
    { header: 'Amount', key: 'amount', width: 14 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Paid on', key: 'paidAt', width: 14 },
    { header: 'Method', key: 'method', width: 16 },
  ];
  salaries.forEach((r) => {
    paySheet.addRow({
      period: `${MONTHS[(r.month || 1) - 1]} ${r.year}`,
      voucher: r.voucherNumber || '',
      amount: Number(r.amount) || 0,
      status: cap(r.status),
      paidAt: r.paidAt ? formatDate(r.paidAt) : '',
      method: r.paymentMethod || '',
    });
  });
  paySheet.getColumn('amount').numFmt = '"PKR "#,##0';

  const attSheet = workbook.addWorksheet('Attendance');
  attSheet.columns = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Check-in', key: 'checkIn', width: 12 },
    { header: 'Check-out', key: 'checkOut', width: 12 },
    { header: 'Source', key: 'source', width: 10 },
  ];
  attendance.forEach((r) => {
    attSheet.addRow({
      date: formatDate(r.date),
      status: cap(r.status).replace('_', ' '),
      checkIn: fmtTime(r.checkIn),
      checkOut: fmtTime(r.checkOut),
      source: String(r.source || '').toUpperCase(),
    });
  });

  const ttSheet = workbook.addWorksheet('Timetable');
  ttSheet.columns = [
    { header: 'Day', key: 'day', width: 14 },
    { header: 'Subject', key: 'subject', width: 22 },
    { header: 'Class', key: 'className', width: 14 },
    { header: 'Section', key: 'section', width: 12 },
    { header: 'Room', key: 'room', width: 14 },
  ];
  slots.forEach((s) => ttSheet.addRow(slotLabel(s)));

  [paySheet, attSheet, ttSheet].forEach((sheet) => {
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E2A4E' } };
  });

  return workbook.xlsx.writeBuffer();
}

module.exports = {
  renderStaffReportPdf,
  renderStaffReportExcel,
  payrollTotals,
  attendanceSummary,
};
