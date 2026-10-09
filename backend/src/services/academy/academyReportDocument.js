const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { ACADEMY_BRAND, resolveLogoPath } = require('../../config/academyBrand');

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

function fitText(doc, text, width) {
  let t = String(text ?? '');
  if (!t) return '';
  if (doc.widthOfString(t) <= width) return t;
  while (t.length > 1 && doc.widthOfString(`${t}…`) > width) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}

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

function drawPdfLetterhead(doc, brand, logoPath, options = {}) {
  const { width, height } = doc.page;
  const navy = brand.colors.navy;
  const gold = brand.colors.gold;
  const logoSize = options.logoSize || 64;
  const logoBox = logoSize + 10;
  const barH = Math.max(88, logoBox + 24);

  doc.save();
  doc.rect(0, 0, width, barH).fill(navy);
  doc.rect(0, barH, width, 4).fill(gold);

  if (logoPath) {
    try {
      const logoY = (barH - logoBox) / 2;
      doc.roundedRect(24, logoY, logoBox, logoBox, 6).fill(brand.colors.white);
      doc.image(logoPath, 28, logoY + 4, { fit: [logoSize, logoSize] });
    } catch {
      /* skip broken logo */
    }
  }

  const textLeft = logoPath ? 24 + logoBox + 14 : 32;
  const rightW = 188;
  const rightX = width - 32 - rightW;
  const textTop = Math.max(16, (barH - 46) / 2);

  doc.fillColor(brand.colors.white).font('Helvetica-Bold').fontSize(16);
  pdfLine(doc, brand.name, textLeft, textTop);
  doc.fillColor(gold).font('Helvetica-Oblique').fontSize(8);
  pdfLine(doc, brand.tagline.toUpperCase(), textLeft, textTop + 22);
  doc.fillColor('#C5D0DC').font('Helvetica').fontSize(8);
  pdfLine(doc, brand.legalName, textLeft, textTop + 36);

  doc.fillColor(brand.colors.white).font('Helvetica').fontSize(8);
  pdfLine(doc, brand.address, rightX, textTop, { width: rightW, align: 'right' });
  pdfLine(doc, brand.phones.join('  ·  '), rightX, textTop + 14, { width: rightW, align: 'right' });
  pdfLine(doc, brand.email, rightX, textTop + 28, { width: rightW, align: 'right' });
  doc.restore();

  doc.save();
  doc.rect(0, height - 28, width, 28).fill(navy);
  doc.rect(0, height - 32, width, 4).fill(gold);
  doc.restore();

  return barH + 4;
}

function drawPdfFooterText(doc, brand, confidentialLabel, meta, page, pages) {
  const { width, height } = doc.page;
  const y = height - 18;
  doc.fillColor(brand.colors.white).font('Helvetica').fontSize(7.5);
  pdfLine(doc, `${brand.name}  ·  ${confidentialLabel}`, 32, y);
  pdfLine(doc, `Page ${page} of ${pages}`, width / 2 - 40, y, { width: 80, align: 'center' });
  pdfLine(doc, `Generated ${formatDateTime(meta.generatedAt)}`, width / 2 + 40, y, {
    width: width / 2 - 72,
    align: 'right',
  });
}

function drawPdfTitle(doc, { title, filterLine, countLabel, extraLine }, brand, y) {
  const innerW = doc.page.width - 64;
  doc.fillColor(brand.colors.navy).font('Helvetica-Bold').fontSize(13);
  pdfLine(doc, title, 32, y);
  doc.fillColor(brand.colors.muted).font('Helvetica').fontSize(8.5);
  pdfLine(doc, filterLine, 32, y + 18, { width: innerW - 140 });
  doc.fillColor(brand.colors.navy).font('Helvetica-Bold').fontSize(8.5);
  pdfLine(doc, countLabel, 32, y + 18, { width: innerW, align: 'right' });
  if (extraLine) {
    doc.fillColor(brand.colors.muted).font('Helvetica').fontSize(8);
    pdfLine(doc, extraLine, 32, y + 32, { width: innerW });
    return y + 50;
  }
  return y + 38;
}

function colAlign(col) {
  return col.align || (col.key === 'serial' ? 'center' : 'left');
}

function formatPdfCellValue(col, value) {
  if (value == null || value === '') return '';
  if (col.numFmt && typeof value === 'number') {
    return value.toLocaleString('en-PK');
  }
  return String(value);
}

function isPdfTotalRow(row) {
  return Boolean(row?._isTotal) || String(row?.studentName || '').toLowerCase() === 'total';
}

function drawPdfColumnLines(doc, columns, startX, y, height, { plain = false, brand, outer = false } = {}) {
  const tableWidth = columns.reduce((sum, c) => sum + c.pdfWidth, 0);
  doc.save();
  if (plain) {
    doc.strokeColor('#222222').lineWidth(outer ? 0.9 : 0.35);
  } else {
    doc.strokeColor(brand.colors.line).lineWidth(0.35);
  }
  let x = startX;
  for (let i = 0; i <= columns.length; i += 1) {
    doc.moveTo(x, y).lineTo(x, y + height).stroke();
    if (i < columns.length) x += columns[i].pdfWidth;
  }
  doc.moveTo(startX, y).lineTo(startX + tableWidth, y).stroke();
  doc.moveTo(startX, y + height).lineTo(startX + tableWidth, y + height).stroke();
  doc.restore();
}

function drawPdfTableHeader(doc, columns, startX, y, brand, { plain = false } = {}) {
  const tableWidth = columns.reduce((sum, c) => sum + c.pdfWidth, 0);
  const headerH = plain ? 22 : 20;
  doc.save();
  if (plain) {
    doc.rect(startX, y, tableWidth, headerH).fill('#1A1A1A');
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.5);
  } else {
    doc.rect(startX, y, tableWidth, headerH).fill(brand.colors.navy);
    doc.fillColor(brand.colors.white).font('Helvetica-Bold').fontSize(7.5);
  }
  const headerPad = plain ? 5 : 4;
  let x = startX;
  columns.forEach((col) => {
    pdfLine(doc, col.header, x + headerPad, y + 7, {
      width: col.pdfWidth - headerPad * 2,
      align: colAlign(col),
    });
    x += col.pdfWidth;
  });
  if (plain) {
    drawPdfColumnLines(doc, columns, startX, y, headerH, { plain: true, brand, outer: true });
  } else {
    doc.rect(startX, y + headerH, tableWidth, 2).fill(brand.colors.gold);
  }
  doc.restore();
  return y + (plain ? headerH : headerH + 2);
}

function pdfRowHeight(doc, columns, row, { minRowH = 16, pad = 4, fontSize = 7.5 } = {}) {
  doc.font('Helvetica').fontSize(fontSize);
  let rowH = minRowH;
  columns.forEach((col) => {
    const raw = formatPdfCellValue(col, row[col.key]);
    if (!raw) return;
    const innerW = Math.max(8, col.pdfWidth - pad * 2);
    if (col.wrap) {
      const textH = doc.heightOfString(raw, { width: innerW, lineGap: 0 });
      rowH = Math.max(rowH, textH + 8);
    }
  });
  return rowH;
}

function drawPdfRow(doc, columns, row, startX, y, zebra, brand, { plain = false } = {}) {
  const tableWidth = columns.reduce((sum, c) => sum + c.pdfWidth, 0);
  const pad = plain ? 5 : 4;
  const fontSize = 7.5;
  const totalRow = isPdfTotalRow(row);
  const rowH = Math.max(
    pdfRowHeight(doc, columns, row, { minRowH: totalRow ? 18 : 16, pad, fontSize }),
    totalRow ? 18 : 16
  );

  doc.save();
  if (plain && totalRow) {
    doc.rect(startX, y, tableWidth, rowH).fill('#EFEFEF');
  } else if (zebra && !plain) {
    doc.rect(startX, y, tableWidth, rowH).fill(brand.colors.zebra);
  } else if (plain && zebra) {
    doc.rect(startX, y, tableWidth, rowH).fill('#F7F7F7');
  }
  doc.restore();

  const textColor = plain ? '#111111' : '#1A2A3A';
  doc.fillColor(textColor).font(totalRow ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
  let x = startX;
  columns.forEach((col) => {
    const raw = formatPdfCellValue(col, row[col.key]);
    const innerW = Math.max(8, col.pdfWidth - pad * 2);
    const align = colAlign(col);
    if (col.wrap && raw) {
      doc.text(raw, x + pad, y + 4, { width: innerW, lineBreak: true, align });
    } else {
      pdfLine(doc, fitText(doc, raw, innerW), x + pad, y + 4, {
        width: innerW,
        align,
      });
    }
    x += col.pdfWidth;
  });
  if (plain) {
    drawPdfColumnLines(doc, columns, startX, y, rowH, { plain: true, brand, outer: totalRow });
  } else {
    doc.save();
    doc.strokeColor(brand.colors.line).lineWidth(0.4);
    doc.moveTo(startX, y + rowH).lineTo(startX + tableWidth, y + rowH).stroke();
    doc.restore();
  }
  return y + rowH;
}

function drawPdfLetterheadPlain(doc, brand, logoPath) {
  const { width } = doc.page;
  const left = 32;
  const right = width - 32;
  const logoSize = 44;
  const top = 22;
  let textLeft = left;

  if (logoPath) {
    try {
      doc.save();
      doc.strokeColor('#222222').lineWidth(0.7);
      doc.rect(left, top, logoSize + 6, logoSize + 6).stroke();
      doc.image(logoPath, left + 3, top + 3, { fit: [logoSize, logoSize] });
      doc.restore();
      textLeft = left + logoSize + 16;
    } catch {
      /* skip broken logo */
    }
  }

  const contactW = 210;
  const contactX = right - contactW;

  doc.fillColor('#111111').font('Helvetica-Bold').fontSize(15);
  pdfLine(doc, brand.name, textLeft, top + 2);
  doc.font('Helvetica-Oblique').fontSize(8);
  pdfLine(doc, brand.tagline, textLeft, top + 20);
  doc.font('Helvetica').fontSize(8);
  pdfLine(doc, brand.legalName, textLeft, top + 34);

  doc.font('Helvetica').fontSize(8);
  pdfLine(doc, brand.address, contactX, top + 4, { width: contactW, align: 'right' });
  pdfLine(doc, brand.phones.join('  ·  '), contactX, top + 18, { width: contactW, align: 'right' });
  pdfLine(doc, brand.email, contactX, top + 32, { width: contactW, align: 'right' });

  const ruleY = top + logoSize + 14;
  doc.save();
  doc.strokeColor('#111111').lineWidth(1.2);
  doc.moveTo(left, ruleY).lineTo(right, ruleY).stroke();
  doc.strokeColor('#111111').lineWidth(0.35);
  doc.moveTo(left, ruleY + 3).lineTo(right, ruleY + 3).stroke();
  doc.restore();
  return ruleY + 12;
}

function drawPdfTitlePlain(doc, { title, filterLine, countLabel, extraLine }, y) {
  const left = 32;
  const innerW = doc.page.width - 64;

  doc.fillColor('#111111').font('Helvetica-Bold').fontSize(12);
  pdfLine(doc, String(title || '').toUpperCase(), left, y);

  doc.save();
  doc.strokeColor('#333333').lineWidth(0.6);
  doc.moveTo(left, y + 16).lineTo(left + Math.min(220, innerW * 0.35), y + 16).stroke();
  doc.restore();

  doc.fillColor('#333333').font('Helvetica').fontSize(8.5);
  pdfLine(doc, filterLine || 'All paid vouchers', left, y + 24, { width: innerW - 160 });
  doc.font('Helvetica-Bold').fontSize(8.5);
  pdfLine(doc, countLabel, left, y + 24, { width: innerW, align: 'right' });

  if (extraLine) {
    doc.font('Helvetica').fontSize(8);
    pdfLine(doc, extraLine, left, y + 38, { width: innerW });
    return y + 54;
  }
  return y + 42;
}

function drawPdfFooterTextPlain(doc, brand, confidentialLabel, meta, page, pages) {
  const { width, height } = doc.page;
  const left = 32;
  const right = width - 32;
  const lineY = height - 34;

  doc.save();
  doc.strokeColor('#111111').lineWidth(0.35);
  doc.moveTo(left, lineY).lineTo(right, lineY).stroke();
  doc.strokeColor('#111111').lineWidth(1);
  doc.moveTo(left, lineY + 3).lineTo(right, lineY + 3).stroke();
  doc.restore();

  const y = height - 20;
  doc.fillColor('#333333').font('Helvetica').fontSize(7);
  pdfLine(doc, `${brand.name}  ·  ${confidentialLabel}`, left, y);
  pdfLine(doc, `Page ${page} of ${pages}`, width / 2 - 40, y, { width: 80, align: 'center' });
  pdfLine(doc, `Generated ${formatDateTime(meta.generatedAt)}`, width / 2 + 40, y, {
    width: width / 2 - 72,
    align: 'right',
  });
}

async function renderBrandedPdf({
  title,
  subject,
  confidentialLabel,
  columns,
  rows,
  meta = {},
  emptyMessage = 'No records match the selected filters.',
  plain = false,
}) {
  const brand = ACADEMY_BRAND;
  const logoPath = resolveLogoPath();
  const reportMeta = { ...meta, generatedAt: meta.generatedAt || new Date() };
  const countLabel = meta.countLabel || `${rows.length} record${rows.length === 1 ? '' : 's'}`;

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 32,
        bufferPages: true,
        info: {
          Title: `${title} — ${brand.name}`,
          Author: brand.name,
          Subject: subject || title,
          Creator: brand.legalName,
        },
      });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const tableWidth = columns.reduce((sum, c) => sum + c.pdfWidth, 0);
      const startX = (doc.page.width - tableWidth) / 2;
      const bottomLimit = () => doc.page.height - (plain ? 42 : 44);

      const startTablePage = () => {
        let nextY;
        if (plain) {
          nextY = drawPdfLetterheadPlain(doc, brand, logoPath);
          nextY = drawPdfTitlePlain(
            doc,
            {
              title,
              filterLine: meta.filterLine || '',
              countLabel,
              extraLine: meta.extraLine,
            },
            nextY
          );
        } else {
          const letterheadBottom = drawPdfLetterhead(doc, brand, logoPath, { logoSize: 64 });
          nextY = drawPdfTitle(
            doc,
            {
              title,
              filterLine: meta.filterLine || '',
              countLabel,
              extraLine: meta.extraLine,
            },
            brand,
            letterheadBottom + 12
          );
        }
        return drawPdfTableHeader(doc, columns, startX, nextY, brand, { plain });
      };

      let y = startTablePage();
      if (rows.length === 0) {
        doc.fillColor(plain ? '#444444' : brand.colors.muted).font('Helvetica-Oblique').fontSize(10);
        pdfLine(doc, emptyMessage, startX, y + 16, { width: tableWidth, align: 'center' });
      } else {
        rows.forEach((row, idx) => {
          const nextRowH = pdfRowHeight(doc, columns, row, {
            pad: plain ? 5 : 4,
            minRowH: isPdfTotalRow(row) ? 18 : 16,
          });
          if (y + nextRowH > bottomLimit()) {
            doc.addPage();
            y = startTablePage();
          }
          const zebra = idx % 2 === 1 && !isPdfTotalRow(row);
          y = drawPdfRow(doc, columns, row, startX, y, zebra, brand, { plain });
        });
      }

      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i += 1) {
        doc.switchToPage(range.start + i);
        if (plain) {
          drawPdfFooterTextPlain(doc, brand, confidentialLabel, reportMeta, i + 1, range.count);
        } else {
          drawPdfFooterText(doc, brand, confidentialLabel, reportMeta, i + 1, range.count);
        }
      }
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

async function renderBrandedExcel({
  title,
  sheetName,
  confidentialLabel,
  columns,
  rows,
  meta = {},
}) {
  const brand = ACADEMY_BRAND;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = brand.name;
  workbook.company = brand.legalName;
  workbook.created = new Date();
  workbook.modified = new Date();

  const sheet = workbook.addWorksheet(sheetName || 'Report', {
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

  sheet.columns = columns.map((c) => ({ key: c.key, width: c.excelWidth }));
  const lastCol = columns.length;
  const merge = (r1, r2 = r1) => sheet.mergeCells(r1, 1, r2, lastCol);

  sheet.getRow(1).height = 22;
  sheet.getRow(2).height = 16;
  sheet.getRow(3).height = 16;
  sheet.getRow(4).height = 16;
  sheet.getRow(5).height = 8;

  merge(1);
  const heading = sheet.getCell(1, 1);
  heading.value = brand.name.toUpperCase();
  heading.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FF0E2A4E' } };
  heading.alignment = { vertical: 'middle', horizontal: 'center' };

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
  const countLabel = meta.countLabel || `${rows.length} record${rows.length === 1 ? '' : 's'}`;
  subtitle.value = [title, meta.filterLine, `Generated ${formatDateTime(meta.generatedAt)}`, countLabel]
    .filter(Boolean)
    .join('  ·  ');
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
  columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E2A4E' } };
    cell.alignment = { vertical: 'middle', horizontal: colAlign(col) };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF0E2A4E' } },
      bottom: { style: 'thin', color: { argb: 'FFE8A317' } },
    };
  });

  rows.forEach((row, idx) => {
    const values = {};
    columns.forEach((col) => {
      values[col.key] = row[col.key] == null ? '' : row[col.key];
    });
    const excelRow = sheet.addRow(values);
    excelRow.height = 18;
    excelRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const col = columns[colNumber - 1];
      cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF1A2A3A' } };
      cell.alignment = {
        vertical: col?.wrap ? 'top' : 'middle',
        horizontal: colAlign(col),
        wrapText: Boolean(col?.wrap),
      };
      if (idx % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6F8FB' } };
      }
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFD6DEE8' } } };
      if (col?.numFmt) cell.numFmt = col.numFmt;
    });
  });

  if (meta.extraLine) {
    const extra = sheet.addRow([]);
    extra.getCell(1).value = meta.extraLine;
    extra.getCell(1).font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF5A6A7A' } };
    sheet.mergeCells(extra.number, 1, extra.number, lastCol);
  }

  const summaryRow = sheet.addRow([]);
  summaryRow.getCell(1).value = countLabel;
  summaryRow.getCell(1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0E2A4E' } };
  sheet.mergeCells(summaryRow.number, 1, summaryRow.number, lastCol);

  sheet.headerFooter.oddFooter = `&L${brand.name}  |  ${confidentialLabel}&C&P / &N&RGenerated ${formatDate(
    meta.generatedAt || new Date()
  )}`;
  sheet.autoFilter = {
    from: { row: 6, column: 1 },
    to: { row: 6 + rows.length, column: lastCol },
  };

  return workbook.xlsx.writeBuffer();
}

module.exports = {
  formatDate,
  formatDateTime,
  pdfLine,
  fitText,
  drawPdfLetterhead,
  drawPdfFooterText,
  drawPdfTitle,
  drawPdfColumnLines,
  drawPdfTableHeader,
  drawPdfRow,
  pdfRowHeight,
  renderBrandedPdf,
  renderBrandedExcel,
  ACADEMY_BRAND: require('../../config/academyBrand').ACADEMY_BRAND,
  resolveLogoPath: require('../../config/academyBrand').resolveLogoPath,
};
