const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { ACADEMY_BRAND, resolveLogoPath } = require('../../config/academyBrand');

const EXPORT_COLUMNS = [
  { key: 'serial', header: 'S.No', excelWidth: 8, pdfWidth: 28 },
  { key: 'studentId', header: 'Roll / ID', excelWidth: 18, pdfWidth: 82 },
  { key: 'name', header: 'Student Name', excelWidth: 22, pdfWidth: 112 },
  { key: 'father', header: 'Father Name', excelWidth: 20, pdfWidth: 100 },
  { key: 'phone', header: 'Phone', excelWidth: 16, pdfWidth: 76 },
  { key: 'className', header: 'Class', excelWidth: 14, pdfWidth: 72 },
  { key: 'session', header: 'Session', excelWidth: 16, pdfWidth: 70 },
  { key: 'created', header: 'Created', excelWidth: 12, pdfWidth: 62 },
  { key: 'monthlyFee', header: 'Monthly Fee', excelWidth: 14, pdfWidth: 70 },
  { key: 'status', header: 'Status', excelWidth: 14, pdfWidth: 68 },
];

function statusLabel(status) {
  if (status === 'pending_fee') return 'Pending fee';
  if (!status) return '';
  return String(status).charAt(0).toUpperCase() + String(status).slice(1);
}

function studentRef(s) {
  if (s.status === 'pending_fee') {
    return s.rollNumber || s.registrationNumber || 'Pending';
  }
  return s.studentId || s.rollNumber || '';
}

function classNameOf(s) {
  return s.classId?.className || '';
}

function sessionNameOf(s) {
  const sess = s.classId?.sessionId;
  if (sess && typeof sess === 'object') return sess.name || '';
  return '';
}

function formatDate(value) {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${d}/${m}/${y}`;
}

function formatDateTime(value) {
  const dt = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(dt.getTime())) return '';
  return `${formatDate(dt)} ${dt.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}`;
}

function formatPkr(n) {
  if (n == null || n === '') return '—';
  const num = Number(n);
  if (Number.isNaN(num)) return '—';
  return `PKR ${num.toLocaleString('en-PK')}`;
}

function moneyValue(n) {
  if (n == null || n === '') return null;
  const num = Number(n);
  return Number.isNaN(num) ? null : num;
}

function mapStudentsToRows(students) {
  return students.map((s, i) => ({
    serial: i + 1,
    studentId: studentRef(s),
    name: s.studentName || '',
    father: s.fatherName || '',
    phone: s.phone || '',
    className: classNameOf(s),
    session: sessionNameOf(s),
    created: formatDate(s.createdAt),
    monthlyFee: s.status === 'pending_fee' ? null : moneyValue(s.monthlyFee),
    monthlyFeeLabel: s.status === 'pending_fee' ? '—' : formatPkr(s.monthlyFee),
    admissionFee: moneyValue(s.admissionFee),
    totalFee: moneyValue(s.totalFee),
    status: statusLabel(s.status),
  }));
}

function filterSummary(meta) {
  const parts = [];
  if (meta.sessionName) parts.push(`Session: ${meta.sessionName}`);
  if (meta.className) parts.push(`Class: ${meta.className}`);
  if (meta.status) parts.push(`Status: ${statusLabel(meta.status)}`);
  if (meta.search) parts.push(`Search: ${meta.search}`);
  if (!parts.length) parts.push('All students');
  return parts.join('   |   ');
}

async function renderStudentsExcel(students, meta = {}) {
  const brand = ACADEMY_BRAND;
  const rows = mapStudentsToRows(students);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = brand.name;
  workbook.company = brand.legalName;
  workbook.created = new Date();
  workbook.modified = new Date();

  const sheet = workbook.addWorksheet('Student Register', {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
    views: [{ state: 'frozen', ySplit: 6 }],
  });

  sheet.columns = EXPORT_COLUMNS.map((c) => ({ key: c.key, width: c.excelWidth }));

  const lastCol = EXPORT_COLUMNS.length;
  const merge = (r1, r2 = r1) => sheet.mergeCells(r1, 1, r2, lastCol);

  sheet.getRow(1).height = 22;
  sheet.getRow(2).height = 16;
  sheet.getRow(3).height = 16;
  sheet.getRow(4).height = 16;
  sheet.getRow(5).height = 8;

  merge(1);
  const title = sheet.getCell(1, 1);
  title.value = brand.name.toUpperCase();
  title.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FF0E2A4E' } };
  title.alignment = { vertical: 'middle', horizontal: 'center' };

  merge(2);
  const tag = sheet.getCell(2, 1);
  tag.value = brand.tagline;
  tag.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FFE8A317' } };
  tag.alignment = { vertical: 'middle', horizontal: 'center' };

  merge(3);
  const contact = sheet.getCell(3, 1);
  contact.value = `${brand.address}  ·  ${brand.phones.join(' / ')}  ·  ${brand.email}`;
  contact.font = { name: 'Calibri', size: 9, color: { argb: 'FF5A6A7A' } };
  contact.alignment = { vertical: 'middle', horizontal: 'center' };

  merge(4);
  const subtitle = sheet.getCell(4, 1);
  subtitle.value = `Student Register  ·  ${filterSummary(meta)}  ·  Generated ${formatDateTime(meta.generatedAt)}  ·  ${rows.length} student${rows.length === 1 ? '' : 's'}`;
  subtitle.font = { name: 'Calibri', size: 9, color: { argb: 'FF0E2A4E' } };
  subtitle.alignment = { vertical: 'middle', horizontal: 'center' };

  const logoPath = resolveLogoPath();
  if (logoPath) {
    try {
      const imageId = workbook.addImage({ filename: logoPath, extension: 'png' });
      sheet.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: 52, height: 52 } });
    } catch {
      /* skip broken logo */
    }
  }

  const headerRow = sheet.getRow(6);
  headerRow.height = 20;
  EXPORT_COLUMNS.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E2A4E' } };
    cell.alignment = { vertical: 'middle', horizontal: i === 0 || col.key === 'monthlyFee' ? 'center' : 'left' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF0E2A4E' } },
      bottom: { style: 'thin', color: { argb: 'FFE8A317' } },
    };
  });

  rows.forEach((row, idx) => {
    const excelRow = sheet.addRow({
      serial: row.serial,
      studentId: row.studentId,
      name: row.name,
      father: row.father,
      phone: row.phone,
      className: row.className,
      session: row.session,
      created: row.created,
      monthlyFee: row.monthlyFee,
      status: row.status,
    });
    excelRow.height = 18;
    excelRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const key = EXPORT_COLUMNS[colNumber - 1]?.key;
      cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF1A2A3A' } };
      cell.alignment = {
        vertical: 'middle',
        horizontal: key === 'serial' || key === 'monthlyFee' ? 'center' : 'left',
      };
      if (idx % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6F8FB' } };
      }
      cell.border = {
        bottom: { style: 'hair', color: { argb: 'FFD6DEE8' } },
      };
      if (key === 'monthlyFee') {
        cell.numFmt = '"PKR "#,##0';
      }
    });
  });

  const summaryRow = sheet.addRow([]);
  summaryRow.getCell(1).value = `Total students: ${rows.length}`;
  summaryRow.getCell(1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0E2A4E' } };
  sheet.mergeCells(summaryRow.number, 1, summaryRow.number, lastCol);

  sheet.headerFooter.oddFooter = `&L${brand.name}  |  Confidential&C&P / &N&RGenerated ${formatDate(meta.generatedAt || new Date())}`;
  sheet.autoFilter = {
    from: { row: 6, column: 1 },
    to: { row: 6 + rows.length, column: lastCol },
  };

  return workbook.xlsx.writeBuffer();
}

function fitText(doc, text, width) {
  let t = String(text ?? '');
  if (!t) return '';
  if (doc.widthOfString(t) <= width) return t;
  while (t.length > 1 && doc.widthOfString(`${t}…`) > width) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}

/** Draw a single line without PDFKit wrapping (wrapping auto-creates extra pages). */
function pdfLine(doc, text, x, y, { width, align = 'left' } = {}) {
  const t = String(text ?? '');
  if (!t) return;
  let drawX = x;
  if (width && align !== 'left') {
    const tw = Math.min(doc.widthOfString(t), width);
    if (align === 'right') drawX = x + width - tw;
    else if (align === 'center') drawX = x + (width - tw) / 2;
  }
  doc.text(t, drawX, y, { lineBreak: false });
}

function drawPdfLetterhead(doc, brand, logoPath) {
  const { width, height } = doc.page;
  const navy = brand.colors.navy;
  const gold = brand.colors.gold;

  doc.save();
  doc.rect(0, 0, width, 78).fill(navy);
  doc.rect(0, 78, width, 4).fill(gold);

  if (logoPath) {
    try {
      doc.roundedRect(28, 12, 54, 54, 6).fill(brand.colors.white);
      doc.image(logoPath, 31, 15, { fit: [48, 48] });
    } catch {
      /* skip broken logo */
    }
  }

  const textLeft = logoPath ? 94 : 32;
  const rightW = 188;
  const rightX = width - 32 - rightW;

  doc.fillColor(brand.colors.white).font('Helvetica-Bold').fontSize(16);
  pdfLine(doc, brand.name, textLeft, 18);
  doc.fillColor(gold).font('Helvetica-Oblique').fontSize(8);
  pdfLine(doc, brand.tagline.toUpperCase(), textLeft, 40);
  doc.fillColor('#C5D0DC').font('Helvetica').fontSize(8);
  pdfLine(doc, brand.legalName, textLeft, 54);

  doc.fillColor(brand.colors.white).font('Helvetica').fontSize(8);
  pdfLine(doc, brand.address, rightX, 18, { width: rightW, align: 'right' });
  pdfLine(doc, brand.phones.join('  ·  '), rightX, 32, { width: rightW, align: 'right' });
  pdfLine(doc, brand.email, rightX, 46, { width: rightW, align: 'right' });
  doc.restore();

  doc.save();
  doc.rect(0, height - 28, width, 28).fill(navy);
  doc.rect(0, height - 32, width, 4).fill(gold);
  doc.restore();
}

function drawPdfFooterText(doc, brand, meta, page, pages) {
  const { width, height } = doc.page;
  const y = height - 18;
  doc.fillColor(brand.colors.white).font('Helvetica').fontSize(7.5);
  pdfLine(doc, `${brand.name}  ·  Confidential student register`, 32, y);
  pdfLine(doc, `Page ${page} of ${pages}`, width / 2 - 40, y, { width: 80, align: 'center' });
  pdfLine(doc, `Generated ${formatDateTime(meta.generatedAt)}`, width / 2 + 40, y, {
    width: width / 2 - 72,
    align: 'right',
  });
}

function drawPdfTitle(doc, meta, brand, y) {
  const innerW = doc.page.width - 64;
  doc.fillColor(brand.colors.navy).font('Helvetica-Bold').fontSize(13);
  pdfLine(doc, 'STUDENT REGISTER', 32, y);
  doc.fillColor(brand.colors.muted).font('Helvetica').fontSize(8.5);
  pdfLine(doc, filterSummary(meta), 32, y + 18, { width: innerW - 120 });
  doc.fillColor(brand.colors.navy).font('Helvetica-Bold').fontSize(8.5);
  pdfLine(doc, `${meta.total} student${meta.total === 1 ? '' : 's'}`, 32, y + 18, {
    width: innerW,
    align: 'right',
  });
  return y + 38;
}

function drawPdfTableHeader(doc, columns, startX, y, brand) {
  const tableWidth = columns.reduce((sum, c) => sum + c.pdfWidth, 0);
  doc.save();
  doc.rect(startX, y, tableWidth, 20).fill(brand.colors.navy);
  doc.fillColor(brand.colors.white).font('Helvetica-Bold').fontSize(7.5);
  let x = startX;
  columns.forEach((col) => {
    const pad = 4;
    const align = col.key === 'serial' || col.key === 'monthlyFee' ? 'center' : 'left';
    pdfLine(doc, col.header, x + pad, y + 6, { width: col.pdfWidth - pad * 2, align });
    x += col.pdfWidth;
  });
  doc.rect(startX, y + 20, tableWidth, 2).fill(brand.colors.gold);
  doc.restore();
  return y + 22;
}

function drawPdfRow(doc, columns, row, startX, y, zebra, brand) {
  const tableWidth = columns.reduce((sum, c) => sum + c.pdfWidth, 0);
  const rowH = 16;
  if (zebra) {
    doc.save();
    doc.rect(startX, y, tableWidth, rowH).fill(brand.colors.zebra);
    doc.restore();
  }
  doc.fillColor('#1A2A3A').font('Helvetica').fontSize(7.5);
  let x = startX;
  columns.forEach((col) => {
    const pad = 4;
    const raw =
      col.key === 'monthlyFee' ? row.monthlyFeeLabel : row[col.key] == null ? '' : String(row[col.key]);
    const align = col.key === 'serial' || col.key === 'monthlyFee' ? 'center' : 'left';
    pdfLine(doc, fitText(doc, raw, col.pdfWidth - pad * 2), x + pad, y + 4, {
      width: col.pdfWidth - pad * 2,
      align,
    });
    x += col.pdfWidth;
  });
  doc.save();
  doc.strokeColor(brand.colors.line).lineWidth(0.4);
  doc.moveTo(startX, y + rowH).lineTo(startX + tableWidth, y + rowH).stroke();
  doc.restore();
  return y + rowH;
}

async function renderStudentsPdf(students, meta = {}) {
  const brand = ACADEMY_BRAND;
  const rows = mapStudentsToRows(students);
  const logoPath = resolveLogoPath();
  const reportMeta = { ...meta, total: rows.length, generatedAt: meta.generatedAt || new Date() };

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 32,
        bufferPages: true,
        info: {
          Title: `Student Register — ${brand.name}`,
          Author: brand.name,
          Subject: 'Official student register export',
          Creator: brand.legalName,
        },
      });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const columns = EXPORT_COLUMNS;
      const tableWidth = columns.reduce((sum, c) => sum + c.pdfWidth, 0);
      const startX = (doc.page.width - tableWidth) / 2;
      const bottomLimit = () => doc.page.height - 44;

      const startTablePage = () => {
        drawPdfLetterhead(doc, brand, logoPath);
        const nextY = drawPdfTitle(doc, reportMeta, brand, 96);
        return drawPdfTableHeader(doc, columns, startX, nextY, brand);
      };

      let y = startTablePage();
      if (rows.length === 0) {
        doc.fillColor(brand.colors.muted).font('Helvetica-Oblique').fontSize(10);
        pdfLine(doc, 'No students match the selected filters.', startX, y + 16, {
          width: tableWidth,
          align: 'center',
        });
      } else {
        rows.forEach((row, idx) => {
          if (y + 16 > bottomLimit()) {
            doc.addPage();
            y = startTablePage();
          }
          y = drawPdfRow(doc, columns, row, startX, y, idx % 2 === 1, brand);
        });
      }

      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i += 1) {
        doc.switchToPage(range.start + i);
        drawPdfFooterText(doc, brand, reportMeta, i + 1, range.count);
      }
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  mapStudentsToRows,
  renderStudentsExcel,
  renderStudentsPdf,
  statusLabel,
};
