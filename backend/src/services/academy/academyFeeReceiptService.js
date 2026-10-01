const PDFDocument = require('pdfkit');
const { ACADEMY_BRAND, resolveLogoPath } = require('../../config/academyBrand');
const { formatDate, formatDateTime, pdfLine, fitText, drawPdfLetterhead, drawPdfFooterText } =
  require('./academyReportDocument');

const MONTH_NAMES = [
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

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function underHundred(n) {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o ? `${TENS[t]} ${ONES[o]}` : TENS[t];
}

function underThousand(n) {
  if (n < 100) return underHundred(n);
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return rest ? `${ONES[h]} Hundred ${underHundred(rest)}` : `${ONES[h]} Hundred`;
}

function amountInWords(amount) {
  const num = Math.round(Math.abs(Number(amount) || 0));
  if (num === 0) return 'Zero Rupees Only';
  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const rest = num % 1000;
  const parts = [];
  if (crore) parts.push(`${underThousand(crore)} Crore`);
  if (lakh) parts.push(`${underThousand(lakh)} Lakh`);
  if (thousand) parts.push(`${underThousand(thousand)} Thousand`);
  if (rest) parts.push(underThousand(rest));
  return `${parts.join(' ')} Rupees Only`;
}

function formatPkr(n) {
  const num = Number(n);
  if (Number.isNaN(num)) return '—';
  return `PKR ${num.toLocaleString('en-PK')}`;
}

function paymentMethodLabel(method) {
  const map = {
    cash: 'Cash',
    bank_transfer: 'Bank transfer',
    online: 'Online',
    other: 'Other',
  };
  return map[method] || (method ? String(method) : '—');
}

function periodLabel(record) {
  if (record.feeType === 'admission') return 'Admission';
  const monthName = MONTH_NAMES[(Number(record.month) || 1) - 1] || '';
  return `${monthName} ${record.year || ''}`.trim();
}

function feeTypeLabel(feeType, { short = false } = {}) {
  if (feeType === 'admission') return short ? 'Admission' : 'Admission fee';
  if (feeType === 'stationery') return short ? 'Stationery' : 'Stationery charge';
  return short ? 'Monthly' : 'Monthly fee';
}

function feeComponents(record) {
  if (!Array.isArray(record?.components)) return [];
  return record.components.filter((line) => line && Number(line.amount) > 0 && line.name);
}

function studentOf(record) {
  const s = record.studentId;
  return s && typeof s === 'object' ? s : null;
}

function classNameOf(student) {
  const c = student?.classId;
  if (c && typeof c === 'object') return c.className || '—';
  return '—';
}

function sessionNameOf(student) {
  const sess = student?.classId?.sessionId;
  if (sess && typeof sess === 'object') return sess.name || '';
  return '';
}

function drawRow(doc, label, value, x, y, labelW, valueW, brand) {
  doc.fillColor(brand.colors.muted).font('Helvetica').fontSize(8.5);
  pdfLine(doc, label, x, y, { width: labelW });
  doc.fillColor('#1A2A3A').font('Helvetica-Bold').fontSize(9.5);
  pdfLine(doc, fitText(doc, value, valueW), x + labelW, y, { width: valueW });
}

function receiptContext(record) {
  const student = studentOf(record);
  const className = classNameOf(student);
  const sessionName = sessionNameOf(student);
  const classLine = sessionName ? `${className}  ·  ${sessionName}` : className;
  const recordedBy =
    record.recordedBy && typeof record.recordedBy === 'object'
      ? record.recordedBy.name || record.recordedBy.email || ''
      : '';
  return { student, classLine, recordedBy };
}

const THERMAL_WIDTH_PT = Math.round((80 / 25.4) * 72);

function dashLine(doc, x, y, w) {
  doc.save();
  doc.strokeColor('#222222').lineWidth(0.7).dash(2.2, { space: 1.6 });
  doc.moveTo(x, y).lineTo(x + w, y).stroke();
  doc.restore();
}

function thermalKv(doc, label, value, x, y, w) {
  const labelW = 52;
  const gap = 6;
  const valueW = Math.max(80, w - labelW - gap);
  const valueX = x + labelW + gap;
  const text = String(value ?? '—');

  doc.fillColor('#444444').font('Helvetica').fontSize(7);
  doc.text(label, x, y, { width: labelW, lineBreak: false, height: 10 });

  doc.fillColor('#000000').font('Helvetica-Bold').fontSize(8);
  const h = Math.max(11, doc.heightOfString(text, { width: valueW, lineGap: 0 }));
  doc.text(text, valueX, y, { width: valueW, align: 'left', lineGap: 0 });
  return y + h + 3;
}

function pdfWrapCenter(doc, text, x, y, width, lineH) {
  const words = String(text || '')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return y;
  let line = '';
  let cy = y;
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (line && doc.widthOfString(trial) > width) {
      doc.text(line, x, cy, { width, align: 'center', lineBreak: false, height: lineH });
      cy += lineH;
      line = word;
    } else {
      line = trial;
    }
  }
  if (line) {
    doc.text(line, x, cy, { width, align: 'center', lineBreak: false, height: lineH });
    cy += lineH;
  }
  return cy;
}

function drawThermalReceipt(doc, record, brand, logoPath) {
  const { student, classLine, recordedBy } = receiptContext(record);
  const pageW = doc.page.width;
  const x = 10;
  const w = pageW - 20;
  let y = 10;

  if (logoPath) {
    try {
      const logo = 32;
      doc.image(logoPath, x + (w - logo) / 2, y, { fit: [logo, logo] });
      y += logo + 6;
    } catch {
      /* skip broken logo */
    }
  }

  doc.fillColor('#000000').font('Helvetica-Bold').fontSize(10);
  pdfLine(doc, brand.name.toUpperCase(), x, y, { width: w, align: 'center' });
  y += 13;
  doc.fillColor('#222222').font('Helvetica').fontSize(7);
  pdfLine(doc, brand.tagline, x, y, { width: w, align: 'center' });
  y += 10;
  pdfLine(doc, brand.phones.join('  |  '), x, y, { width: w, align: 'center' });
  y += 10;
  pdfLine(doc, brand.address, x, y, { width: w, align: 'center' });
  y += 12;
  dashLine(doc, x, y, w);
  y += 8;

  doc.fillColor('#000000').font('Helvetica-Bold').fontSize(11);
  pdfLine(doc, 'FEE RECEIPT', x, y, { width: w, align: 'center' });
  y += 14;
  doc.save();
  doc.rect(x + w / 2 - 22, y, 44, 14).fill('#000000');
  doc.restore();
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
  pdfLine(doc, 'PAID', x, y + 3, { width: w, align: 'center' });
  y += 20;
  dashLine(doc, x, y, w);
  y += 10;

  y = thermalKv(doc, 'Receipt', record.receiptNumber || '—', x, y, w);
  y = thermalKv(doc, 'Date', formatDate(record.paidAt || record.updatedAt || new Date()), x, y, w);
  y = thermalKv(doc, 'Payment', paymentMethodLabel(record.paymentMethod), x, y, w);
  y += 2;
  dashLine(doc, x, y, w);
  y += 10;

  y = thermalKv(doc, 'Student', student?.studentName || '—', x, y, w);
  y = thermalKv(doc, 'Father', student?.fatherName || '—', x, y, w);
  y = thermalKv(doc, 'Student ID', student?.studentId || '—', x, y, w);
  y = thermalKv(doc, 'Class', classLine || '—', x, y, w);
  if (student?.phone) {
    y = thermalKv(doc, 'Phone', student.phone, x, y, w);
  }
  y += 2;
  dashLine(doc, x, y, w);
  y += 10;

  y = thermalKv(doc, 'Fee', feeTypeLabel(record.feeType), x, y, w);
  y = thermalKv(doc, 'Period', periodLabel(record), x, y, w);
  const lines = feeComponents(record);
  if (lines.length) {
    y += 4;
    lines.forEach((line) => {
      y = thermalKv(doc, line.name, formatPkr(line.amount), x, y, w);
    });
  }
  y += 6;
  doc.fillColor('#000000').font('Helvetica-Bold').fontSize(12);
  pdfLine(doc, formatPkr(record.amount), x, y, { width: w, align: 'center' });
  y += 15;
  doc.fillColor('#222222').font('Helvetica').fontSize(7);
  y = pdfWrapCenter(doc, amountInWords(record.amount), x, y, w, 10);
  y += 4;

  if (record.notes) {
    dashLine(doc, x, y, w);
    y += 8;
    doc.fillColor('#333333').font('Helvetica').fontSize(7);
    pdfLine(doc, 'Remarks', x, y, { width: w, align: 'center' });
    y += 10;
    y = pdfWrapCenter(doc, record.notes, x, y, w, 10);
    y += 2;
  }

  dashLine(doc, x, y, w);
  y += 10;
  doc.fillColor('#333333').font('Helvetica').fontSize(7);
  pdfLine(doc, recordedBy ? `Received by: ${recordedBy}` : 'Received by: Cashier', x, y, {
    width: w,
    align: 'center',
  });
  y += 12;
  pdfLine(doc, 'Thank you', x, y, { width: w, align: 'center' });
  y += 10;
  doc.font('Helvetica-Oblique').fontSize(6.5);
  pdfLine(doc, 'Computer-generated receipt', x, y, { width: w, align: 'center' });
  y += 12;
  return y;
}

function renderThermalFeeReceiptPdf(record, meta = {}) {
  const brand = ACADEMY_BRAND;
  const logoPath = resolveLogoPath();

  const probe = new PDFDocument({ size: [THERMAL_WIDTH_PT, 2000], margin: 0 });
  probe.on('data', () => {});
  probe.on('error', () => {});
  const contentBottom = drawThermalReceipt(probe, record, brand, logoPath);
  probe.end();

  const pageHeight = Math.min(900, Math.max(300, Math.ceil(contentBottom + 16)));

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: [THERMAL_WIDTH_PT, pageHeight],
        margin: 0,
        bufferPages: false,
        info: {
          Title: `Fee Receipt ${record.receiptNumber || ''} (Thermal) — ${brand.name}`,
          Author: brand.name,
          Subject: 'Thermal fee receipt 80mm',
          Creator: brand.legalName,
        },
      });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      drawThermalReceipt(doc, record, brand, logoPath);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function renderA4FeeReceiptPdf(record, meta = {}) {
  const brand = ACADEMY_BRAND;
  const logoPath = resolveLogoPath();
  const { student, classLine, recordedBy } = receiptContext(record);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'portrait',
        margin: 32,
        bufferPages: true,
        info: {
          Title: `Fee Receipt ${record.receiptNumber || ''} — ${brand.name}`,
          Author: brand.name,
          Subject: 'Official fee receipt',
          Creator: brand.legalName,
        },
      });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      drawPdfLetterhead(doc, brand, logoPath);

      const pageW = doc.page.width;
      const innerX = 40;
      const innerW = pageW - 80;
      let y = 98;

      doc.fillColor(brand.colors.navy).font('Helvetica-Bold').fontSize(16);
      pdfLine(doc, 'FEE RECEIPT', innerX, y, { width: innerW, align: 'center' });
      y += 20;
      doc.fillColor(brand.colors.gold).font('Helvetica-Oblique').fontSize(9);
      pdfLine(doc, 'Official payment voucher  ·  Student copy', innerX, y, {
        width: innerW,
        align: 'center',
      });
      y += 22;

      doc.save();
      doc.roundedRect(innerX, y, innerW, 52, 6).fill('#F6F8FB');
      doc.roundedRect(innerX, y, innerW, 52, 6).strokeColor(brand.colors.gold).lineWidth(1.2).stroke();
      doc.restore();

      doc.fillColor(brand.colors.muted).font('Helvetica').fontSize(8);
      pdfLine(doc, 'RECEIPT NO.', innerX + 14, y + 10);
      doc.fillColor(brand.colors.navy).font('Helvetica-Bold').fontSize(12);
      pdfLine(doc, record.receiptNumber || '—', innerX + 14, y + 24);

      doc.fillColor(brand.colors.muted).font('Helvetica').fontSize(8);
      pdfLine(doc, 'DATE', innerX + innerW / 2, y + 10);
      doc.fillColor(brand.colors.navy).font('Helvetica-Bold').fontSize(12);
      pdfLine(doc, formatDate(record.paidAt || record.updatedAt || new Date()), innerX + innerW / 2, y + 24);

      doc.save();
      doc.roundedRect(innerX + innerW - 78, y + 12, 64, 28, 4).fill('#059669');
      doc.restore();
      doc.fillColor(brand.colors.white).font('Helvetica-Bold').fontSize(11);
      pdfLine(doc, 'PAID', innerX + innerW - 78, y + 20, { width: 64, align: 'center' });
      y += 68;

      doc.fillColor(brand.colors.navy).font('Helvetica-Bold').fontSize(9);
      pdfLine(doc, 'RECEIVED FROM', innerX, y);
      y += 8;
      doc.save();
      doc.moveTo(innerX, y).lineTo(innerX + innerW, y).strokeColor(brand.colors.gold).lineWidth(1.5).stroke();
      doc.restore();
      y += 14;

      const colW = innerW / 2;
      const labelW = 88;
      const valueW = colW - labelW - 8;
      drawRow(doc, 'Student', student?.studentName || '—', innerX, y, labelW, valueW, brand);
      drawRow(doc, 'Father', student?.fatherName || '—', innerX + colW, y, labelW, valueW, brand);
      y += 18;
      drawRow(doc, 'Student ID', student?.studentId || '—', innerX, y, labelW, valueW, brand);
      drawRow(doc, 'Class', classLine || '—', innerX + colW, y, labelW, valueW, brand);
      y += 18;
      drawRow(doc, 'Phone', student?.phone || '—', innerX, y, labelW, valueW, brand);
      y += 28;

      doc.fillColor(brand.colors.navy).font('Helvetica-Bold').fontSize(9);
      pdfLine(doc, 'FEE PARTICULARS', innerX, y);
      y += 8;
      doc.save();
      doc.moveTo(innerX, y).lineTo(innerX + innerW, y).strokeColor(brand.colors.gold).lineWidth(1.5).stroke();
      doc.restore();
      y += 14;

      drawRow(doc, 'Fee type', feeTypeLabel(record.feeType), innerX, y, labelW, valueW, brand);
      drawRow(doc, 'Period', periodLabel(record), innerX + colW, y, labelW, valueW, brand);
      y += 18;
      drawRow(doc, 'Payment', paymentMethodLabel(record.paymentMethod), innerX, y, labelW, valueW, brand);
      y += 18;
      feeComponents(record).forEach((line) => {
        drawRow(doc, line.name, formatPkr(line.amount), innerX, y, labelW, valueW, brand);
        y += 16;
      });
      drawRow(doc, 'Amount', formatPkr(record.amount), innerX + colW, y, labelW, valueW, brand);
      y += 22;

      doc.save();
      doc.roundedRect(innerX, y, innerW, 44, 6).fill(brand.colors.navy);
      doc.restore();
      doc.fillColor('#C5D0DC').font('Helvetica').fontSize(8);
      pdfLine(doc, 'AMOUNT IN WORDS', innerX + 14, y + 8);
      doc.fillColor(brand.colors.white).font('Helvetica-Bold').fontSize(11);
      pdfLine(doc, fitText(doc, amountInWords(record.amount), innerW - 28), innerX + 14, y + 22, {
        width: innerW - 28,
      });
      y += 58;

      if (record.notes) {
        doc.fillColor(brand.colors.muted).font('Helvetica').fontSize(8.5);
        pdfLine(doc, 'Remarks', innerX, y, { width: 88 });
        doc.fillColor('#1A2A3A').font('Helvetica').fontSize(9);
        pdfLine(doc, fitText(doc, record.notes, innerW - 96), innerX + 88, y, { width: innerW - 96 });
        y += 22;
      }

      y += 24;
      const signW = (innerW - 40) / 2;
      doc.save();
      doc.moveTo(innerX, y).lineTo(innerX + signW, y).strokeColor(brand.colors.line).lineWidth(0.8).stroke();
      doc
        .moveTo(innerX + innerW - signW, y)
        .lineTo(innerX + innerW, y)
        .strokeColor(brand.colors.line)
        .lineWidth(0.8)
        .stroke();
      doc.restore();
      y += 8;
      doc.fillColor(brand.colors.muted).font('Helvetica').fontSize(8);
      pdfLine(doc, recordedBy ? `Received by  ·  ${recordedBy}` : 'Received by', innerX, y, {
        width: signW,
        align: 'center',
      });
      pdfLine(doc, 'Student / Parent signature', innerX + innerW - signW, y, {
        width: signW,
        align: 'center',
      });
      y += 28;

      doc.fillColor(brand.colors.muted).font('Helvetica-Oblique').fontSize(8);
      pdfLine(
        doc,
        'This is a computer-generated receipt and is valid without a physical stamp.',
        innerX,
        y,
        { width: innerW, align: 'center' }
      );

      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i += 1) {
        doc.switchToPage(range.start + i);
        drawPdfFooterText(
          doc,
          brand,
          'Official fee receipt',
          { generatedAt: meta.generatedAt || new Date() },
          i + 1,
          range.count
        );
      }
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function challanHeading(records) {
  const monthly = records.filter((r) => r.feeType === 'monthly').length;
  if (monthly === records.length && monthly > 0) {
    return records.length === 1 ? '1 MONTH FEE CHALLAN' : `${records.length} MONTH FEE CHALLAN`;
  }
  return records.length === 1 ? 'FEE CHALLAN' : `${records.length} FEE CHALLAN`;
}

function statusLabel(status) {
  if (status === 'overdue') return 'OVERDUE';
  if (status === 'pending') return 'PENDING';
  return String(status || 'UNPAID').toUpperCase();
}

function challanLineItems(records) {
  const many = records.length > 1;
  const lines = [];
  records.forEach((record) => {
    const parts = feeComponents(record);
    const period = periodLabel(record);
    if (parts.length) {
      parts.forEach((line) => {
        lines.push({
          name: many ? `${line.name} · ${period}` : line.name,
          amount: Number(line.amount) || 0,
        });
      });
      return;
    }
    lines.push({
      name: many ? `${feeTypeLabel(record.feeType)} · ${period}` : feeTypeLabel(record.feeType),
      amount: Number(record.amount) || 0,
    });
  });
  return lines;
}

function challanTotal(records) {
  return challanLineItems(records).reduce((sum, line) => sum + line.amount, 0);
}

const CHALLAN_COPIES = [
  { label: 'STUDENT COPY', signRight: 'Accounts' },
  { label: 'BANK COPY', signRight: 'Bank officer' },
  { label: 'ACCOUNTS COPY', signRight: 'Cashier' },
];

function drawChallanCopy(doc, box, copy, records, brand) {
  const { x, y, w, h } = box;
  const pad = 10;
  const innerX = x + pad;
  const innerW = w - pad * 2;
  const first = records[0];
  const { student, classLine } = receiptContext(first);
  const lines = challanLineItems(records);
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  const periods = [...new Set(records.map((record) => periodLabel(record)))].join(', ');
  const dueDates = [...new Set(records.map((record) => formatDate(record.dueDate)).filter((value) => value && value !== '—'))];

  doc.save();
  doc.rect(x, y, w, h).lineWidth(1.1).strokeColor(brand.colors.navy).stroke();
  doc.restore();

  doc.save();
  doc.rect(x, y, w, 20).fill(brand.colors.navy);
  doc.restore();
  doc.fillColor(brand.colors.white).font('Helvetica-Bold').fontSize(10);
  pdfLine(doc, copy.label, x, y + 5, { width: w, align: 'center' });

  let cy = y + 28;
  doc.fillColor(brand.colors.navy).font('Helvetica-Bold').fontSize(12);
  pdfLine(doc, brand.name, innerX, cy, { width: innerW, align: 'center' });
  cy += 15;
  doc.fillColor(brand.colors.muted).font('Helvetica').fontSize(8);
  pdfLine(doc, brand.phones.join('   |   '), innerX, cy, { width: innerW, align: 'center' });
  cy += 12;
  doc.fillColor(brand.colors.navy).font('Helvetica-Bold').fontSize(11);
  pdfLine(doc, 'FEE CHALLAN', innerX, cy, { width: innerW, align: 'center' });
  cy += 16;

  const writeField = (label, value) => {
    doc.fillColor(brand.colors.muted).font('Helvetica').fontSize(8);
    pdfLine(doc, label, innerX, cy, { width: 68 });
    doc.fillColor('#10244A').font('Helvetica-Bold').fontSize(9);
    pdfLine(doc, fitText(doc, value || '—', innerW - 70), innerX + 70, cy, { width: innerW - 70 });
    cy += 13;
  };

  writeField('Student', student?.studentName);
  writeField('Father', student?.fatherName);
  writeField('Student ID', student?.studentId);
  writeField('Class', classLine);
  writeField('Period', periods);
  writeField('Due date', dueDates.join(', ') || '—');
  cy += 6;

  doc.save();
  doc.rect(innerX, cy, innerW, 16).fill('#EEF5FF');
  doc.restore();
  doc.fillColor(brand.colors.navy).font('Helvetica-Bold').fontSize(8);
  pdfLine(doc, 'Particular', innerX + 6, cy + 4, { width: innerW * 0.58 });
  pdfLine(doc, 'Amount', innerX + innerW - 86, cy + 4, { width: 80, align: 'right' });
  cy += 18;

  const lineLimit = y + h - 118;
  lines.forEach((line) => {
    if (cy > lineLimit) return;
    doc.fillColor('#10244A').font('Helvetica').fontSize(9);
    pdfLine(doc, fitText(doc, line.name, innerW - 96), innerX + 6, cy, { width: innerW - 96 });
    doc.font('Helvetica-Bold').fontSize(9);
    pdfLine(doc, formatPkr(line.amount), innerX + innerW - 90, cy, { width: 84, align: 'right' });
    cy += 14;
  });

  cy += 4;
  doc.save();
  doc.rect(innerX, cy, innerW, 24).fill(brand.colors.navy);
  doc.restore();
  doc.fillColor(brand.colors.white).font('Helvetica-Bold').fontSize(10);
  pdfLine(doc, 'TOTAL', innerX + 6, cy + 7, { width: 70 });
  pdfLine(doc, formatPkr(total), innerX + innerW - 120, cy + 7, { width: 114, align: 'right' });
  cy += 32;

  doc.fillColor('#10244A').font('Helvetica').fontSize(8);
  const words = amountInWords(total);
  const wordHeight = doc.heightOfString(words, { width: innerW, align: 'center' });
  doc.text(words, innerX, cy, { width: innerW, align: 'center' });
  cy += wordHeight + 8;

  doc.fillColor(brand.colors.muted).font('Helvetica').fontSize(7.5);
  doc.text('Valid as a demand until payment is recorded. This is not a receipt.', innerX, cy, {
    width: innerW,
    align: 'center',
  });

  const sigY = y + h - 28;
  doc.save();
  doc.strokeColor(brand.colors.line).lineWidth(0.8);
  doc.moveTo(innerX + 4, sigY).lineTo(innerX + 78, sigY).stroke();
  doc.moveTo(innerX + innerW - 78, sigY).lineTo(innerX + innerW - 4, sigY).stroke();
  doc.restore();
  doc.fillColor(brand.colors.muted).font('Helvetica').fontSize(7.5);
  pdfLine(doc, 'Depositor', innerX + 4, sigY + 4, { width: 74, align: 'center' });
  pdfLine(doc, copy.signRight, innerX + innerW - 78, sigY + 4, { width: 74, align: 'center' });
}

function drawThermalChallan(doc, records, brand, logoPath) {
  const first = records[0];
  const { student, classLine } = receiptContext(first);
  const pageW = doc.page.width;
  const x = 10;
  const w = pageW - 20;
  let y = 10;

  if (logoPath) {
    try {
      const logo = 32;
      doc.image(logoPath, x + (w - logo) / 2, y, { fit: [logo, logo] });
      y += logo + 6;
    } catch {
      /* skip broken logo */
    }
  }

  doc.fillColor('#000000').font('Helvetica-Bold').fontSize(10);
  pdfLine(doc, brand.name.toUpperCase(), x, y, { width: w, align: 'center' });
  y += 13;
  doc.fillColor('#222222').font('Helvetica').fontSize(7);
  pdfLine(doc, brand.tagline, x, y, { width: w, align: 'center' });
  y += 10;
  pdfLine(doc, brand.phones.join('  |  '), x, y, { width: w, align: 'center' });
  y += 10;
  pdfLine(doc, brand.address, x, y, { width: w, align: 'center' });
  y += 12;
  dashLine(doc, x, y, w);
  y += 8;

  doc.fillColor('#000000').font('Helvetica-Bold').fontSize(10);
  pdfLine(doc, challanHeading(records), x, y, { width: w, align: 'center' });
  y += 14;
  doc.save();
  doc.rect(x + w / 2 - 32, y, 64, 14).fill('#000000');
  doc.restore();
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
  pdfLine(doc, 'UNPAID', x, y + 3, { width: w, align: 'center' });
  y += 20;
  dashLine(doc, x, y, w);
  y += 10;

  y = thermalKv(doc, 'Student', student?.studentName || '—', x, y, w);
  y = thermalKv(doc, 'Father', student?.fatherName || '—', x, y, w);
  y = thermalKv(doc, 'Student ID', student?.studentId || '—', x, y, w);
  y = thermalKv(doc, 'Class', classLine || '—', x, y, w);
  if (student?.phone) y = thermalKv(doc, 'Phone', student.phone, x, y, w);
  y += 2;
  dashLine(doc, x, y, w);
  y += 10;

  records.forEach((record, index) => {
    doc.fillColor('#000000').font('Helvetica-Bold').fontSize(8);
    pdfLine(doc, `${index + 1}. ${periodLabel(record)}`, x, y, { width: w });
    y += 12;
    y = thermalKv(doc, 'Type', feeTypeLabel(record.feeType, { short: true }), x, y, w);
    y = thermalKv(doc, 'Status', statusLabel(record.status), x, y, w);
    y = thermalKv(doc, 'Due', formatDate(record.dueDate), x, y, w);
    y = thermalKv(doc, 'Amount', formatPkr(record.amount), x, y, w);
    y += 2;
    dashLine(doc, x, y, w);
    y += 8;
  });

  const total = challanTotal(records);
  doc.fillColor('#000000').font('Helvetica-Bold').fontSize(11);
  pdfLine(doc, `Total due  ${formatPkr(total)}`, x, y, { width: w, align: 'center' });
  y += 14;
  doc.fillColor('#222222').font('Helvetica').fontSize(7);
  y = pdfWrapCenter(doc, amountInWords(total), x, y, w, 10);
  y += 6;
  dashLine(doc, x, y, w);
  y += 10;
  doc.fillColor('#333333').font('Helvetica').fontSize(7);
  pdfLine(doc, 'Pay at the accounts office', x, y, { width: w, align: 'center' });
  y += 12;
  doc.font('Helvetica-Oblique').fontSize(6.5);
  pdfLine(doc, 'Computer-generated challan  ·  not a receipt', x, y, { width: w, align: 'center' });
  y += 12;
  return y;
}

function renderThermalFeeChallanPdf(records, meta = {}) {
  const brand = ACADEMY_BRAND;
  const logoPath = resolveLogoPath();
  const probe = new PDFDocument({ size: [THERMAL_WIDTH_PT, 2000], margin: 0 });
  probe.on('data', () => {});
  probe.on('error', () => {});
  const contentBottom = drawThermalChallan(probe, records, brand, logoPath);
  probe.end();
  const pageHeight = Math.min(1400, Math.max(320, Math.ceil(contentBottom + 16)));

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: [THERMAL_WIDTH_PT, pageHeight],
        margin: 0,
        bufferPages: false,
        info: {
          Title: `${challanHeading(records)} (Thermal) — ${brand.name}`,
          Author: brand.name,
          Subject: 'Thermal fee challan 80mm',
          Creator: brand.legalName,
        },
      });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      drawThermalChallan(doc, records, brand, logoPath);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function renderA4FeeChallanPdf(records, meta = {}) {
  const brand = ACADEMY_BRAND;

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 0,
        info: {
          Title: `${challanHeading(records)} — ${brand.name}`,
          Author: brand.name,
          Subject: 'Fee challan',
          Creator: brand.legalName,
        },
      });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const margin = 14;
      const gap = 12;
      const panelW = (pageW - margin * 2 - gap * 2) / 3;
      const panelH = pageH - margin * 2;

      CHALLAN_COPIES.forEach((copy, index) => {
        const x = margin + index * (panelW + gap);
        drawChallanCopy(doc, { x, y: margin, w: panelW, h: panelH }, copy, records, brand);
        if (index < CHALLAN_COPIES.length - 1) {
          const cutX = x + panelW + gap / 2;
          doc.save();
          doc.strokeColor('#B7C3D1').lineWidth(0.8).dash(3, { space: 3 });
          doc.moveTo(cutX, margin - 4).lineTo(cutX, pageH - margin + 4).stroke();
          doc.restore();
        }
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function renderFeeChallanPdf(records, meta = {}, size = 'a4') {
  const list = Array.isArray(records) ? records.filter(Boolean) : [];
  if (!list.length) {
    return Promise.reject(new Error('No unpaid fees to print'));
  }
  if (String(size).toLowerCase() === 'thermal') {
    return renderThermalFeeChallanPdf(list, meta);
  }
  return renderA4FeeChallanPdf(list, meta);
}

function renderFeeReceiptPdf(record, meta = {}, size = 'a4') {
  if (record && (record.status === 'pending' || record.status === 'overdue')) {
    return renderFeeChallanPdf([record], meta, size);
  }
  if (String(size).toLowerCase() === 'thermal') {
    return renderThermalFeeReceiptPdf(record, meta);
  }
  return renderA4FeeReceiptPdf(record, meta);
}

module.exports = {
  renderFeeReceiptPdf,
  renderFeeChallanPdf,
  renderA4FeeReceiptPdf,
  renderThermalFeeReceiptPdf,
  amountInWords,
  periodLabel,
};
