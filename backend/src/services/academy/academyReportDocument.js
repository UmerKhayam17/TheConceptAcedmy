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
  if (row?._isTotal) return true;
  const label = String(row?.studentName || row?.name || '').toLowerCase();
  return label === 'total' || label === 'grand total';
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

function plainCellAlign(col) {
  if (col.align) return col.align;
  if (col.key === 'serial' || col.key === 'className' || col.key === 'feeType' || col.key === 'paymentMethod') {
    return 'center';
  }
  if (col.numFmt || col.key === 'amount' || col.key === 'total') return 'right';
  return 'left';
}

function drawPdfTableHeader(doc, columns, startX, y, brand, { plain = false } = {}) {
  const tableWidth = columns.reduce((sum, c) => sum + c.pdfWidth, 0);
  const headerPad = 3;
  const headerFontSize = plain ? 7 : 7.5;
  doc.font('Helvetica-Bold').fontSize(headerFontSize);

  let headerH = plain ? 22 : 20;
  if (plain) {
    columns.forEach((col) => {
      const innerW = Math.max(8, col.pdfWidth - headerPad * 2);
      const textH = doc.heightOfString(String(col.header || ''), { width: innerW, align: 'center', lineGap: 0 });
      headerH = Math.max(headerH, Math.ceil(textH) + 8);
    });
  }

  doc.save();
  if (plain) {
    doc.rect(startX, y, tableWidth, headerH).fill('#3D3D3D');
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(headerFontSize);
  } else {
    doc.rect(startX, y, tableWidth, headerH).fill(brand.colors.navy);
    doc.fillColor(brand.colors.white).font('Helvetica-Bold').fontSize(headerFontSize);
  }

  let x = startX;
  columns.forEach((col) => {
    const innerW = Math.max(8, col.pdfWidth - headerPad * 2);
    const label = String(col.header || '');
    if (plain) {
      const textH = doc.heightOfString(label, { width: innerW, align: 'center', lineGap: 0 });
      const textY = y + Math.max(4, (headerH - textH) / 2);
      doc.text(label, x + headerPad, textY, {
        width: innerW,
        align: 'center',
        lineBreak: true,
        lineGap: 0,
      });
    } else {
      pdfLine(doc, label, x + headerPad, y + 7, {
        width: innerW,
        align: colAlign(col),
      });
    }
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
      const textH = doc.heightOfString(raw, { width: innerW, lineGap: 0.5 });
      rowH = Math.max(rowH, textH + 10);
    }
  });
  return rowH;
}

function drawPdfRow(doc, columns, row, startX, y, zebra, brand, { plain = false } = {}) {
  const tableWidth = columns.reduce((sum, c) => sum + c.pdfWidth, 0);
  const pad = plain ? 4 : 4;
  const fontSize = plain ? 7 : 7.5;
  const totalRow = isPdfTotalRow(row);
  const rowH = Math.max(
    pdfRowHeight(doc, columns, row, { minRowH: totalRow ? 20 : 17, pad, fontSize }),
    totalRow ? 20 : 17
  );

  doc.save();
  if (plain && totalRow) {
    doc.rect(startX, y, tableWidth, rowH).fill('#E8E8E8');
  } else if (zebra) {
    doc.rect(startX, y, tableWidth, rowH).fill(plain ? '#F7F7F7' : brand.colors.zebra);
  }
  doc.restore();

  const textColor = plain ? '#111111' : '#1A2A3A';
  doc.fillColor(textColor).font(totalRow ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);

  if (plain && totalRow) {
    const amountCols = columns
      .map((col, idx) => ({ col, idx }))
      .filter(({ col }) => col.numFmt || col.key === 'amount' || col.key === 'total');
    const firstAmountIdx = amountCols.length ? amountCols[0].idx : columns.length - 1;
    const labelWidth = columns.slice(0, firstAmountIdx).reduce((sum, c) => sum + c.pdfWidth, 0);
    if (labelWidth > 0) {
      pdfLine(doc, 'Grand Total', startX + pad, y + (rowH - fontSize) / 2, {
        width: labelWidth - pad * 2,
        align: 'right',
      });
    }
    let x = startX;
    columns.forEach((col, idx) => {
      if (idx >= firstAmountIdx) {
        const raw = formatPdfCellValue(col, row[col.key]);
        const innerW = Math.max(8, col.pdfWidth - pad * 2);
        pdfLine(doc, fitText(doc, raw, innerW), x + pad, y + (rowH - fontSize) / 2, {
          width: innerW,
          align: plainCellAlign(col),
        });
      }
      x += col.pdfWidth;
    });
  } else {
    let x = startX;
    columns.forEach((col) => {
      const raw = formatPdfCellValue(col, row[col.key]);
      const innerW = Math.max(8, col.pdfWidth - pad * 2);
      const align = plain ? plainCellAlign(col) : colAlign(col);
      if (col.wrap && raw) {
        const textH = doc.heightOfString(raw, { width: innerW, lineGap: 0.5 });
        const textY = y + Math.max(3, (rowH - textH) / 2);
        doc.text(raw, x + pad, textY, { width: innerW, lineBreak: true, align, lineGap: 0.5 });
      } else {
        pdfLine(doc, fitText(doc, raw, innerW), x + pad, y + (rowH - fontSize) / 2, {
          width: innerW,
          align,
        });
      }
      x += col.pdfWidth;
    });
  }
  if (plain) {
    drawPdfColumnLines(doc, columns, startX, y, rowH, { plain: true, brand, outer: true });
    if (totalRow) {
      doc.save();
      doc.strokeColor('#111111').lineWidth(1.1);
      doc.moveTo(startX, y).lineTo(startX + tableWidth, y).stroke();
      doc.moveTo(startX, y + rowH).lineTo(startX + tableWidth, y + rowH).stroke();
      doc.restore();
    }
  } else {
    doc.save();
    doc.strokeColor(brand.colors.line).lineWidth(0.4);
    doc.moveTo(startX, y + rowH).lineTo(startX + tableWidth, y + rowH).stroke();
    doc.restore();
  }
  return y + rowH;
}

/** Classic college-style letterhead: centered logo + academy name, tagline, and contact info. */
function drawPdfLetterheadPlain(doc, brand, logoPath) {
  const { width } = doc.page;
  const top = 12;
  const logoSize = 54;
  const gap = 12;

  doc.font('Helvetica-Bold').fontSize(15);
  const nameW = doc.widthOfString(brand.name || '');
  doc.font('Helvetica-Oblique').fontSize(8);
  const tagW = brand.tagline ? doc.widthOfString(brand.tagline) : 0;
  const contactBits = [
    brand.address,
    Array.isArray(brand.phones) ? brand.phones.join('  ·  ') : brand.phones,
    brand.email,
  ].filter(Boolean);
  const contactLine = contactBits.join('  |  ');
  doc.font('Helvetica').fontSize(7.5);
  const contactW = contactLine ? doc.widthOfString(contactLine) : 0;
  doc.font('Helvetica').fontSize(7);
  const legalW =
    brand.legalName && brand.legalName !== brand.name ? doc.widthOfString(brand.legalName) : 0;

  const textBlockW = Math.max(nameW, tagW, contactW, legalW);
  const blockW = logoPath ? logoSize + gap + textBlockW : textBlockW;
  const blockX = (width - blockW) / 2;
  const textLeft = logoPath ? blockX + logoSize + gap : blockX;

  if (logoPath) {
    try {
      doc.image(logoPath, blockX, top, { fit: [logoSize, logoSize] });
    } catch {
      /* skip broken logo */
    }
  }

  doc.fillColor('#111111').font('Helvetica-Bold').fontSize(15);
  pdfLine(doc, brand.name, textLeft, top + 2);

  if (brand.tagline) {
    doc.fillColor('#555555').font('Helvetica-Oblique').fontSize(8);
    pdfLine(doc, brand.tagline, textLeft, top + 20);
  }

  if (contactLine) {
    doc.fillColor('#444444').font('Helvetica').fontSize(7.5);
    pdfLine(doc, contactLine, textLeft, top + 34);
  }

  if (brand.legalName && brand.legalName !== brand.name) {
    doc.fillColor('#666666').font('Helvetica').fontSize(7);
    pdfLine(doc, brand.legalName, textLeft, top + 46);
    return top + Math.max(logoSize, 56) + 6;
  }

  return top + Math.max(logoSize, 44) + 6;
}

function drawPdfTitlePlain(
  doc,
  { title, filterLine, countLabel, extraLine, sessionLabel, leftFilter, rightFilter, centerFilter },
  y
) {
  const { width } = doc.page;
  const left = 36;
  const right = width - 36;
  const innerW = right - left;
  let cursor = y;

  // Subtle rule under letterhead
  doc.save();
  doc.strokeColor('#C8C8C8').lineWidth(0.6);
  doc.moveTo(left, cursor).lineTo(right, cursor).stroke();
  doc.restore();
  cursor += 10;

  if (sessionLabel) {
    doc.fillColor('#333333').font('Helvetica-Bold').fontSize(9);
    const sessionText = `Session: ${sessionLabel}`;
    const sw = doc.widthOfString(sessionText);
    pdfLine(doc, sessionText, (width - sw) / 2, cursor);
    cursor += 14;
  }

  const boxTitle = String(title || '').trim();
  doc.font('Helvetica-Bold').fontSize(11);
  const titleW = doc.widthOfString(boxTitle);
  const boxPadX = 16;
  const boxPadY = 5;
  const boxW = titleW + boxPadX * 2;
  const boxH = 18;
  const boxX = (width - boxW) / 2;
  doc.save();
  doc.strokeColor('#222222').lineWidth(1);
  doc.rect(boxX, cursor, boxW, boxH).stroke();
  doc.restore();
  doc.fillColor('#111111');
  pdfLine(doc, boxTitle, boxX + boxPadX, cursor + boxPadY);
  cursor += boxH + 12;

  const leftText = leftFilter || filterLine || '';
  const centerText = centerFilter || '';
  const rightText = rightFilter || '';
  doc.fillColor('#555555').font('Helvetica-Bold').fontSize(7.5);
  if (leftText) pdfLine(doc, leftText, left, cursor, { width: innerW * 0.32 });
  if (centerText) {
    doc.fillColor('#111111').font('Helvetica-Bold').fontSize(8);
    pdfLine(doc, centerText, left, cursor, { width: innerW, align: 'center' });
    doc.fillColor('#555555').font('Helvetica-Bold').fontSize(7.5);
  } else if (countLabel && !centerText) {
    pdfLine(doc, countLabel, left, cursor, { width: innerW, align: 'center' });
  }
  if (rightText) pdfLine(doc, rightText, left, cursor, { width: innerW, align: 'right' });
  cursor += 10;

  if (extraLine) {
    doc.fillColor('#666666').font('Helvetica').fontSize(7);
    pdfLine(doc, extraLine, left, cursor, { width: innerW });
    cursor += 10;
  }

  return cursor;
}

function drawPdfFooterTextPlain(doc, brand, confidentialLabel, meta, page, pages) {
  const { width, height } = doc.page;
  const left = 36;
  const right = width - 36;
  const lineY = height - 28;

  doc.save();
  doc.strokeColor('#222222').lineWidth(0.7);
  doc.moveTo(left, lineY).lineTo(right, lineY).stroke();
  doc.restore();

  const y = height - 18;
  doc.fillColor('#333333').font('Helvetica').fontSize(7);
  pdfLine(doc, `Dated: ${formatDateTime(meta.generatedAt)}`, left, y);
  pdfLine(doc, `${brand.name}`, left, y, { width: right - left, align: 'center' });
  pdfLine(doc, `Page ${page} of ${pages}`, left, y, { width: right - left, align: 'right' });
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
        margin: plain ? 36 : 32,
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

      const pageMargin = plain ? 36 : 32;
      const usableWidth = doc.page.width - pageMargin * 2;
      // Scale columns to exactly fill the printable width (no side gaps / no clipping).
      let scaledColumns = columns;
      const rawWidth = columns.reduce((sum, c) => sum + (Number(c.pdfWidth) || 0), 0);
      if (plain && rawWidth > 0) {
        const scale = usableWidth / rawWidth;
        scaledColumns = columns.map((c) => ({
          ...c,
          pdfWidth: Math.max(18, Math.floor((Number(c.pdfWidth) || 0) * scale)),
        }));
        const scaledSum = scaledColumns.reduce((sum, c) => sum + c.pdfWidth, 0);
        scaledColumns[scaledColumns.length - 1].pdfWidth += usableWidth - scaledSum;
      }
      const tableWidth = scaledColumns.reduce((sum, c) => sum + c.pdfWidth, 0);
      const startX = pageMargin;
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
              sessionLabel: meta.sessionLabel || '',
              leftFilter: meta.leftFilter || '',
              centerFilter: meta.centerFilter || '',
              rightFilter: meta.rightFilter || '',
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
        return drawPdfTableHeader(doc, scaledColumns, startX, nextY, brand, { plain });
      };

      let y = startTablePage();
      if (rows.length === 0) {
        doc.fillColor(plain ? '#444444' : brand.colors.muted).font('Helvetica-Oblique').fontSize(10);
        pdfLine(doc, emptyMessage, startX, y + 16, { width: tableWidth, align: 'center' });
      } else {
        rows.forEach((row, idx) => {
          const nextRowH = pdfRowHeight(doc, scaledColumns, row, {
            pad: plain ? 4 : 4,
            minRowH: isPdfTotalRow(row) ? 18 : 16,
          });
          if (y + nextRowH > bottomLimit()) {
            doc.addPage();
            y = startTablePage();
          }
          const zebra = idx % 2 === 1 && !isPdfTotalRow(row);
          y = drawPdfRow(doc, scaledColumns, row, startX, y, zebra, brand, { plain });
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
  plain = false,
}) {
  const brand = ACADEMY_BRAND;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = brand.name;
  workbook.company = brand.legalName;
  workbook.created = new Date();
  workbook.modified = new Date();

  const headerRows = plain ? 5 : 6;
  const sheet = workbook.addWorksheet(sheetName || 'Report', {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
    views: [{ state: 'frozen', ySplit: headerRows }],
  });

  sheet.columns = columns.map((c) => ({ key: c.key, width: c.excelWidth }));
  const lastCol = columns.length;
  const merge = (r1, r2 = r1) => sheet.mergeCells(r1, 1, r2, lastCol);
  const countLabel = meta.countLabel || `${rows.length} record${rows.length === 1 ? '' : 's'}`;
  const logoPath = resolveLogoPath();
  const thinBlack = { style: 'thin', color: { argb: 'FF222222' } };
  const gridBorder = { top: thinBlack, bottom: thinBlack, left: thinBlack, right: thinBlack };

  if (plain) {
    sheet.getRow(1).height = 28;
    sheet.getRow(2).height = 16;
    sheet.getRow(3).height = 20;
    sheet.getRow(4).height = 16;

    merge(1);
    const heading = sheet.getCell(1, 1);
    heading.value = brand.name;
    heading.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF000000' } };
    heading.alignment = { vertical: 'middle', horizontal: 'center' };

    merge(2);
    const session = sheet.getCell(2, 1);
    session.value = meta.sessionLabel ? `Session: ${meta.sessionLabel}` : '';
    session.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
    session.alignment = { vertical: 'middle', horizontal: 'center' };

    merge(3);
    const titleCell = sheet.getCell(3, 1);
    titleCell.value = title;
    titleCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF000000' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    titleCell.border = gridBorder;

    merge(4);
    const filters = sheet.getCell(4, 1);
    const leftText = meta.leftFilter || meta.filterLine || '';
    const centerText = meta.centerFilter || countLabel || '';
    const rightText = meta.rightFilter || '';
    filters.value = [leftText, centerText, rightText].filter(Boolean).join('          ');
    filters.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF696969' } };
    filters.alignment = { vertical: 'middle', horizontal: 'center' };

    if (logoPath) {
      try {
        const imageId = workbook.addImage({ filename: logoPath, extension: 'png' });
        sheet.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: 48, height: 48 } });
      } catch {
        /* skip broken logo */
      }
    }

    const headerRow = sheet.getRow(5);
    headerRow.height = 20;
    columns.forEach((col, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = col.header;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF555555' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = gridBorder;
    });
  } else {
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
    subtitle.value = [title, meta.filterLine, `Generated ${formatDateTime(meta.generatedAt)}`, countLabel]
      .filter(Boolean)
      .join('  ·  ');
    subtitle.font = { name: 'Calibri', size: 9, color: { argb: 'FF0E2A4E' } };
    subtitle.alignment = { vertical: 'middle', horizontal: 'center' };

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
  }

  rows.forEach((row, idx) => {
    const totalRow = isPdfTotalRow(row);
    const values = {};
    columns.forEach((col) => {
      values[col.key] = row[col.key] == null ? '' : row[col.key];
    });
    if (plain && totalRow) {
      const amountCols = columns
        .map((col, i) => ({ col, i }))
        .filter(({ col }) => col.numFmt || col.key === 'amount' || col.key === 'total');
      const firstAmountIdx = amountCols.length ? amountCols[0].i : columns.length - 1;
      columns.forEach((col, i) => {
        if (i < firstAmountIdx) values[col.key] = i === 0 ? 'Grand Total' : '';
      });
    }
    const excelRow = sheet.addRow(values);
    excelRow.height = 18;
    if (plain && totalRow) {
      const amountCols = columns
        .map((col, i) => ({ col, i }))
        .filter(({ col }) => col.numFmt || col.key === 'amount' || col.key === 'total');
      const firstAmountIdx = amountCols.length ? amountCols[0].i : columns.length - 1;
      if (firstAmountIdx > 1) {
        try {
          sheet.mergeCells(excelRow.number, 1, excelRow.number, firstAmountIdx);
        } catch {
          /* already merged */
        }
      }
    }
    excelRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const col = columns[colNumber - 1];
      cell.font = {
        name: 'Calibri',
        size: 10,
        bold: totalRow,
        color: { argb: plain ? 'FF000000' : 'FF1A2A3A' },
      };
      cell.alignment = {
        vertical: col?.wrap ? 'top' : 'middle',
        horizontal: plain ? 'center' : colAlign(col),
        wrapText: Boolean(col?.wrap),
      };
      if (plain) {
        cell.border = gridBorder;
        if (totalRow) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
        }
      } else {
        if (idx % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6F8FB' } };
        }
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFD6DEE8' } } };
      }
      if (col?.numFmt) cell.numFmt = col.numFmt;
    });
  });

  if (!plain && meta.extraLine) {
    const extra = sheet.addRow([]);
    extra.getCell(1).value = meta.extraLine;
    extra.getCell(1).font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF5A6A7A' } };
    sheet.mergeCells(extra.number, 1, extra.number, lastCol);
  }

  if (!plain) {
    const summaryRow = sheet.addRow([]);
    summaryRow.getCell(1).value = countLabel;
    summaryRow.getCell(1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0E2A4E' } };
    sheet.mergeCells(summaryRow.number, 1, summaryRow.number, lastCol);
  }

  sheet.headerFooter.oddFooter = plain
    ? `&LDated: ${formatDateTime(meta.generatedAt || new Date())}&RPage &P of &N`
    : `&L${brand.name}  |  ${confidentialLabel}&C&P / &N&RGenerated ${formatDate(
        meta.generatedAt || new Date()
      )}`;
  sheet.autoFilter = {
    from: { row: headerRows, column: 1 },
    to: { row: headerRows + rows.length, column: lastCol },
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
