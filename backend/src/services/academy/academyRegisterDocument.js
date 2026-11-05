/**
 * Shared "attendance register" renderer: one row per person, one column per date
 * (weekday + day number header), totals on the right and a per-day totals footer.
 * Used by the staff monthly register and the student date-range registers.
 */
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const {
  drawPdfLetterheadPlain,
  drawPdfFooterTextPlain,
  pdfLine,
  fitText,
  ACADEMY_BRAND,
  resolveLogoPath,
} = require('./academyReportDocument');

const WEEKDAY_SHORT = {
  monday: 'MON',
  tuesday: 'TUE',
  wednesday: 'WED',
  thursday: 'THU',
  friday: 'FRI',
  saturday: 'SAT',
  sunday: 'SUN',
};

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const MARK_YELLOW = '#FFE08A';
const MARK_MUTED = '#E3E3E3';

function weekdayOfYmd(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function argbOf(hex) {
  return `FF${String(hex).replace('#', '').toUpperCase()}`;
}

/**
 * spec = {
 *   title, pdfSubject, footerText, emptyMessage, legend?,
 *   leadColumns: [{ key, title, width, compactWidth?, excelWidth, align? }],
 *   tailColumns: [{ key, title, width, excelWidth }],
 *   footerLabelKey, footerLabel, maxDaysPerPage?
 * }
 * register = { dayCols: [{ day, weekday, muted? }], rows: [{ ...lead/tail values, cells: [{ text, fill }] }],
 *              dayTotals: [{ text, fill }], totals: { ...tail values } }
 */
function layoutRegisterColumns(spec, dayCount, pageWidth) {
  const margin = 12;
  const usable = Math.floor(pageWidth - margin * 2);
  const lead = spec.leadColumns.map((c) => ({ ...c }));
  const tail = spec.tailColumns.map((c) => ({ ...c }));
  const sum = (cols) => cols.reduce((s, c) => s + c.width, 0);
  const dayBudget = () => usable - sum(lead) - sum(tail);
  if (dayCount && dayBudget() < dayCount * 16) {
    lead.forEach((column) => {
      if (column.compactWidth) column.width = column.compactWidth;
    });
    tail.forEach((column) => {
      column.width = Math.max(20, column.width - 4);
    });
  }
  const budget = Math.max(0, dayBudget());
  const dayW = dayCount ? Math.floor(budget / dayCount) : 0;
  const remainder = dayCount ? budget - dayW * dayCount : 0;
  const columns = lead.map((column) => ({
    ...column,
    kind: column.key === 'serial' ? 'serial' : 'text',
  }));
  for (let i = 0; i < dayCount; i += 1) {
    columns.push({
      key: `d${i}`,
      width: dayW + (i < remainder ? 1 : 0),
      kind: 'day',
      dayIndex: i,
    });
  }
  tail.forEach((column) => columns.push({ ...column, kind: 'stat' }));
  const used = columns.reduce((s, column) => s + column.width, 0);
  columns[columns.length - 1].width += usable - used;
  return { margin, usable, columns };
}

function columnAlign(column) {
  if (column.align) return column.align;
  return column.kind === 'text' ? 'left' : 'center';
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
      fillRect(doc, x, y + half, column.width, half, day.muted ? '#C9C9C9' : '#E4EAF1');
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

function drawRegisterRow(doc, spec, columns, row, x, y, rowH, { footer = false } = {}) {
  columns.forEach((column) => {
    let text = '';
    let fill = footer ? '#F4F7FB' : null;
    if (column.kind === 'day') {
      const cell = footer ? row.dayTotals[column.dayIndex] : row.cells[column.dayIndex];
      text = cell?.text ?? '';
      if (cell?.fill) fill = cell.fill;
    } else if (footer) {
      if (column.key === spec.footerLabelKey) text = spec.footerLabel || '';
      else if (column.kind === 'stat') text = row.totals[column.key] ?? '';
    } else {
      text = row[column.key] ?? '';
    }
    if (fill) fillRect(doc, x, y, column.width, rowH, fill);
    paintText(doc, text, x, y, column.width, rowH, {
      align: columnAlign(column),
      font: footer || column.kind === 'day' ? 'Helvetica-Bold' : 'Helvetica',
      size: column.kind === 'day' ? 5.5 : 6.5,
    });
    strokeRect(doc, x, y, column.width, rowH);
    x += column.width;
  });
  return y + rowH;
}

function drawRegisterIntro(doc, spec, meta, margin, usable, continued) {
  if (!continued) {
    let y = drawPdfLetterheadPlain(doc, ACADEMY_BRAND, resolveLogoPath());
    doc.save();
    doc.strokeColor('#C8C8C8').lineWidth(0.6);
    doc.moveTo(margin, y).lineTo(margin + usable, y).stroke();
    doc.restore();
    y += 8;
    const title = spec.title;
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
    if (spec.legend) {
      y += 12;
      doc.font('Helvetica').fontSize(6.8).fillColor('#444444');
      pdfLine(doc, spec.legend, margin, y, { width: usable, align: 'center' });
    }
    return y + 16;
  }
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#111111');
  pdfLine(doc, `${spec.title} (continued)`, margin, 12);
  if (meta.rightFilter) pdfLine(doc, meta.rightFilter, margin, 12, { width: usable, align: 'right' });
  return 26;
}

/** How many day columns fit on one landscape page at a readable width. */
function daysThatFit(spec, pageWidth) {
  const margin = 12;
  const usable = Math.floor(pageWidth - margin * 2);
  const lead = (spec.leadColumns || []).reduce((sum, column) => sum + (column.compactWidth || column.width || 0), 0);
  const tail = (spec.tailColumns || []).reduce((sum, column) => sum + Math.max(20, (column.width || 24) - 4), 0);
  const budget = Math.max(0, usable - lead - tail);
  const minDayWidth = 14;
  return Math.max(1, Math.floor(budget / minDayWidth));
}

/** Split date columns only when they cannot fit on one page. */
function chunkRegister(register, size) {
  const total = register.dayCols.length;
  if (!size || total <= size) return [register];
  const blocks = [];
  for (let start = 0; start < total; start += size) {
    const end = Math.min(total, start + size);
    blocks.push({
      ...register,
      dayCols: register.dayCols.slice(start, end),
      dayTotals: register.dayTotals.slice(start, end),
      rows: register.rows.map((row) => ({ ...row, cells: row.cells.slice(start, end) })),
    });
  }
  return blocks;
}

async function renderRegisterPdf(register, spec, meta = {}) {
  const brand = ACADEMY_BRAND;
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 0,
        bufferPages: true,
        info: {
          Title: `${spec.title} — ${brand.name}`,
          Author: brand.name,
          Subject: spec.pdfSubject || spec.title,
          Creator: brand.legalName,
        },
      });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const rowH = 13;
      const bottom = doc.page.height - 40;
      const blocks = chunkRegister(register, daysThatFit(spec, doc.page.width));

      blocks.forEach((block, blockIndex) => {
        const { margin, usable, columns } = layoutRegisterColumns(spec, block.dayCols.length, doc.page.width);
        let y;
        if (blockIndex === 0) {
          y = drawRegisterIntro(doc, spec, meta, margin, usable, false);
        } else {
          doc.addPage({ size: 'A4', layout: 'landscape', margin: 0 });
          y = drawRegisterIntro(doc, spec, meta, margin, usable, true);
        }
        y = drawRegisterHeader(doc, columns, block.dayCols, margin, y);

        const nextPage = () => {
          doc.addPage({ size: 'A4', layout: 'landscape', margin: 0 });
          const nextY = drawRegisterIntro(doc, spec, meta, margin, usable, true);
          return drawRegisterHeader(doc, columns, block.dayCols, margin, nextY);
        };

        if (!block.rows.length) {
          doc.font('Helvetica').fontSize(8).fillColor('#333333');
          doc.text(spec.emptyMessage || 'No records.', margin, y + 8, { lineBreak: false });
          return;
        }
        block.rows.forEach((row) => {
          if (y + rowH > bottom) y = nextPage();
          y = drawRegisterRow(doc, spec, columns, row, margin, y, rowH);
        });
        if (y + rowH > bottom) y = nextPage();
        drawRegisterRow(
          doc,
          spec,
          columns,
          { dayTotals: block.dayTotals, totals: block.totals },
          margin,
          y,
          rowH,
          { footer: true }
        );
      });

      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i += 1) {
        doc.switchToPage(range.start + i);
        drawPdfFooterTextPlain(
          doc,
          brand,
          spec.footerText || spec.title,
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

async function renderRegisterExcel(register, spec, meta = {}) {
  const lead = spec.leadColumns;
  const tail = spec.tailColumns;
  const brand = ACADEMY_BRAND;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = brand.name;
  workbook.company = brand.legalName;
  workbook.created = new Date();

  const headerBandRows = 5; // name, session, contact, title, filters
  const tableHeaderRows = 2; // weekday + date
  const freezeAt = headerBandRows + tableHeaderRows;
  const sheet = workbook.addWorksheet(spec.sheetName || 'Attendance', {
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
      margins: { left: 0.45, right: 0.45, top: 0.5, bottom: 0.55, header: 0.2, footer: 0.25 },
    },
    views: [{ state: 'frozen', xSplit: lead.length, ySplit: freezeAt, showGridLines: false }],
  });

  const firstDayCol = lead.length + 1;
  const columnCount = lead.length + register.dayCols.length + tail.length;
  sheet.columns = [
    ...lead.map((column) => ({ width: column.excelWidth || 12 })),
    ...register.dayCols.map(() => ({ width: 5 })),
    ...tail.map((column) => ({ width: column.excelWidth || 10 })),
  ];

  const navy = 'FF0E2A4E';
  const gold = 'FFE8A317';
  const muted = 'FF5A6A7A';
  const zebra = 'FFF6F8FB';
  const thinNavy = { style: 'thin', color: { argb: navy } };
  const thinLine = { style: 'thin', color: { argb: 'FFD0D7E2' } };
  const border = { top: thinLine, left: thinLine, bottom: thinLine, right: thinLine };
  const mergeAll = (row) => sheet.mergeCells(row, 1, row, columnCount);

  sheet.getRow(1).height = 28;
  sheet.getRow(2).height = 16;
  sheet.getRow(3).height = 14;
  sheet.getRow(4).height = 22;
  sheet.getRow(5).height = 18;

  mergeAll(1);
  const nameCell = sheet.getCell(1, 1);
  nameCell.value = brand.name;
  nameCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: navy } };
  nameCell.alignment = { horizontal: 'center', vertical: 'middle' };

  mergeAll(2);
  const sessionCell = sheet.getCell(2, 1);
  sessionCell.value = meta.sessionLabel ? `Session: ${meta.sessionLabel}` : brand.tagline || '';
  sessionCell.font = {
    name: 'Calibri',
    size: 11,
    bold: Boolean(meta.sessionLabel),
    italic: !meta.sessionLabel,
    color: { argb: meta.sessionLabel ? navy : gold },
  };
  sessionCell.alignment = { horizontal: 'center', vertical: 'middle' };

  mergeAll(3);
  const contactCell = sheet.getCell(3, 1);
  const contactBits = [
    brand.address,
    Array.isArray(brand.phones) ? brand.phones.join('  ·  ') : brand.phones,
    brand.email,
  ].filter(Boolean);
  contactCell.value = contactBits.join('  |  ');
  contactCell.font = { name: 'Calibri', size: 8, color: { argb: muted } };
  contactCell.alignment = { horizontal: 'center', vertical: 'middle' };

  mergeAll(4);
  const titleCell = sheet.getCell(4, 1);
  titleCell.value = spec.title;
  titleCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.border = {
    top: thinNavy,
    left: thinNavy,
    right: thinNavy,
    bottom: { style: 'medium', color: { argb: gold } },
  };

  const leftText = meta.leftFilter || '';
  const centerText = [meta.centerFilter || meta.sessionLabel || '', spec.legend]
    .filter(Boolean)
    .join('  ·  ');
  const rightText = meta.rightFilter || '';
  if (spec.legend) sheet.getRow(5).height = 28;
  const leftEnd = Math.max(1, Math.floor(columnCount / 3));
  const midEnd = Math.max(leftEnd + 1, Math.floor((2 * columnCount) / 3));
  const filterFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F6FA' } };
  const filterFont = { name: 'Calibri', size: 9, bold: true, color: { argb: navy } };
  const applyFilterBand = (start, end, value, align) => {
    if (end > start) sheet.mergeCells(5, start, 5, end);
    const cell = sheet.getCell(5, start);
    cell.value = value;
    cell.font = filterFont;
    cell.fill = filterFill;
    cell.alignment = { vertical: 'middle', horizontal: align, wrapText: true };
    for (let c = start; c <= end; c += 1) {
      const band = sheet.getCell(5, c);
      band.fill = filterFill;
      band.border = {
        top: thinLine,
        bottom: thinNavy,
        left: c === 1 ? thinNavy : { style: 'hair', color: { argb: 'FFD0D7E2' } },
        right: c === columnCount ? thinNavy : { style: 'hair', color: { argb: 'FFD0D7E2' } },
      };
    }
  };
  applyFilterBand(1, leftEnd, leftText, 'left');
  applyFilterBand(leftEnd + 1, midEnd, centerText, 'center');
  applyFilterBand(midEnd + 1, columnCount, rightText, 'right');

  const weekdayRow = sheet.getRow(6);
  const dateRow = sheet.getRow(7);
  weekdayRow.height = 18;
  dateRow.height = 18;
  const headers = [
    ...lead.map((column) => ({ title: column.title })),
    ...register.dayCols.map((day) => ({
      weekday: WEEKDAY_SHORT[day.weekday] || '',
      date: Number(day.day.slice(8, 10)),
      muted: !!day.muted,
    })),
    ...tail.map((column) => ({ title: column.title })),
  ];
  headers.forEach((header, index) => {
    const col = index + 1;
    if (header.weekday != null) {
      const top = weekdayRow.getCell(col);
      const bottomCell = dateRow.getCell(col);
      top.value = header.weekday;
      bottomCell.value = header.date;
      [top, bottomCell].forEach((cell) => {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.font = {
          name: 'Calibri',
          bold: true,
          size: 9,
          color: { argb: top === cell ? 'FFFFFFFF' : 'FF111111' },
        };
        cell.border = border;
      });
      applyExcelFill(top, navy);
      applyExcelFill(bottomCell, header.muted ? 'FFC9C9C9' : 'FFE8EEF5');
      top.border = {
        top: thinNavy,
        left: thinNavy,
        right: thinNavy,
        bottom: { style: 'medium', color: { argb: gold } },
      };
    } else {
      sheet.mergeCells(6, col, 7, col);
      const cell = sheet.getCell(6, col);
      cell.value = header.title;
      cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: thinNavy,
        left: thinNavy,
        right: thinNavy,
        bottom: { style: 'medium', color: { argb: gold } },
      };
      applyExcelFill(cell, navy);
      sheet.getCell(7, col).border = border;
      applyExcelFill(sheet.getCell(7, col), navy);
    }
  });

  const leadAlign = lead.map((column) =>
    column.align || (column.key === 'serial' ? 'center' : 'left')
  );

  const writeRow = (excelRow, source, { footer = false, zebraRow = false } = {}) => {
    const values = footer
      ? [
          ...lead.map((column) => (column.key === spec.footerLabelKey ? spec.footerLabel || '' : '')),
          ...register.dayTotals.map((day) => day.text),
          ...tail.map((column) => source.totals[column.key]),
        ]
      : [
          ...lead.map((column) => source[column.key]),
          ...source.cells.map((cell) => cell.text),
          ...tail.map((column) => source[column.key]),
        ];
    values.forEach((value, index) => {
      const cell = excelRow.getCell(index + 1);
      cell.value = value === '' || value == null ? null : value;
      cell.border = footer
        ? {
            top: { style: 'medium', color: { argb: navy } },
            bottom: { style: 'medium', color: { argb: navy } },
            left: thinLine,
            right: thinLine,
          }
        : border;
      cell.alignment = {
        horizontal: index < lead.length ? leadAlign[index] : 'center',
        vertical: 'middle',
      };
      cell.font = {
        name: 'Calibri',
        bold: footer,
        size: footer ? 9.5 : 9.5,
        color: { argb: footer ? navy : 'FF1A2A3A' },
      };
      if (footer) applyExcelFill(cell, 'FFE8EEF5');
      else if (zebraRow) applyExcelFill(cell, zebra);
    });
    const marks = footer ? register.dayTotals : source.cells;
    marks.forEach((mark, index) => {
      if (!mark.fill) return;
      const cell = excelRow.getCell(firstDayCol + index);
      applyExcelFill(cell, argbOf(mark.fill));
      cell.font = { name: 'Calibri', bold: true, size: footer ? 9 : 10 };
    });
  };

  register.rows.forEach((row, idx) => writeRow(sheet.addRow([]), row, { zebraRow: idx % 2 === 1 }));
  if (register.rows.length) writeRow(sheet.addRow([]), { totals: register.totals }, { footer: true });
  else {
    const emptyRow = freezeAt + 1;
    sheet.mergeCells(emptyRow, 1, emptyRow, columnCount);
    sheet.getCell(emptyRow, 1).value = spec.emptyMessage || 'No records.';
    sheet.getCell(emptyRow, 1).font = { name: 'Calibri', italic: true, color: { argb: muted } };
    sheet.getCell(emptyRow, 1).alignment = { horizontal: 'center' };
  }

  sheet.headerFooter.oddFooter = `&L${brand.name}  |  ${spec.title}&CDated: ${new Date().toLocaleString(
    'en-GB'
  )}&RPage &P of &N`;

  return workbook.xlsx.writeBuffer();
}

module.exports = {
  WEEKDAY_SHORT,
  MARK_YELLOW,
  MARK_MUTED,
  weekdayOfYmd,
  renderRegisterPdf,
  renderRegisterExcel,
};
