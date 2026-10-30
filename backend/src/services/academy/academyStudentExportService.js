const PDFDocument = require('pdfkit');
const {
  renderBrandedExcel,
  drawPdfLetterheadPlain,
  drawPdfTitlePlain,
  drawPdfFooterTextPlain,
  ACADEMY_BRAND,
  resolveLogoPath,
  fitText,
} = require('./academyReportDocument');
const { compareStudentsByRollAsc } = require('../../utils/academyStudentSort');

/**
 * Student List — class + section scoped sheet.
 * Columns: SR No, Roll # (narrow), Name, + 2 wide empty columns.
 * PDF: two side-by-side tables per page (award-list style).
 * Sorted ascending by roll number.
 */
const LIST_COLUMNS = [
  { key: 'serial', header: 'SR No', excelWidth: 6, pdfWidth: 28, align: 'center' },
  { key: 'regNo', header: 'Roll #', excelWidth: 11, pdfWidth: 54, align: 'center' },
  { key: 'name', header: 'Student Name', excelWidth: 22, pdfWidth: 120, wrap: true },
  { key: 'blank1', header: ' ', excelWidth: 22, pdfWidth: 124 },
  { key: 'blank2', header: ' ', excelWidth: 22, pdfWidth: 124 },
];

/**
 * Contact List — same scope; Roll # (not registration number).
 * Sorted ascending by roll number (same order as Student List).
 */
const CONTACT_COLUMNS = [
  { key: 'serial', header: 'SR No', excelWidth: 7, pdfWidth: 28, align: 'center' },
  { key: 'regNo', header: 'Roll #', excelWidth: 11, pdfWidth: 54, align: 'center' },
  { key: 'name', header: 'Student Name', excelWidth: 18, pdfWidth: 95, wrap: true },
  { key: 'father', header: 'Father Name', excelWidth: 17, pdfWidth: 90, wrap: true },
  { key: 'phone', header: 'Contact', excelWidth: 18, pdfWidth: 95, wrap: true },
  { key: 'blank1', header: ' ', excelWidth: 20, pdfWidth: 88 },
];

const REPORT_PRESETS = {
  list: {
    title: 'Student List',
    sheetName: 'Student List',
    subject: 'Official student list export',
    confidentialLabel: 'Confidential student list',
    emptyMessage: 'No students match the selected class and section.',
    filterFallback: 'Student list',
    columns: LIST_COLUMNS,
    kind: 'list',
  },
  contact: {
    title: 'Contact',
    sheetName: 'Contact',
    subject: 'Official contact list export',
    confidentialLabel: 'Confidential contact list',
    emptyMessage: 'No contacts match the selected class and section.',
    filterFallback: 'Contact list',
    columns: CONTACT_COLUMNS,
    kind: 'contact',
  },
  enrolled: {
    title: 'Enrolled Students List',
    sheetName: 'Enrolled Students',
    subject: 'Official enrolled student list',
    confidentialLabel: 'Confidential enrolled student list',
    emptyMessage: 'No enrolled active students match the selected class and section.',
    filterFallback: 'Enrolled students list',
    columns: LIST_COLUMNS,
    kind: 'list',
  },
};

const REPORT_OPTS = {
  plain: true,
  layout: 'portrait',
  fitOnePage: false,
  lightHeader: true,
};

const GRAY = '#C8C8C8';
const LINE = '#000000';

function normalizeReportType(reportType) {
  const key = String(reportType || 'list').toLowerCase();
  if (key === 'contact') return 'contact';
  if (key === 'enrolled') return 'enrolled';
  return 'list';
}

function resolvePreset(options = {}) {
  return REPORT_PRESETS[normalizeReportType(options.reportType)];
}

function columnsForExport(options = {}) {
  const columns = resolvePreset(options).columns;
  if (!options.omitSensitive) return columns;
  return columns.filter((c) => c.key !== 'phone');
}

function statusLabel(status) {
  if (status === 'pending_fee') return 'Pending fee';
  if (!status) return '';
  return String(status).charAt(0).toUpperCase() + String(status).slice(1);
}

function rollNoOf(s) {
  return (
    String(s.rollNumber || '').trim() ||
    String(s.studentId || '').trim() ||
    ''
  );
}

function classNameOf(s) {
  return s.classId?.className || '';
}

function sectionNameOf(s) {
  const sec = s.sectionId;
  if (sec && typeof sec === 'object') return sec.sectionName || '';
  return '';
}

/** Primary + residential/alternate contact when both exist (shown together in Contact). */
function phonesOf(s) {
  const seen = new Set();
  const parts = [];
  for (const raw of [s.phone, s.mobileNo, s.contactPhoneRes]) {
    const value = String(raw || '').trim();
    if (!value) continue;
    const key = value.replace(/\D/g, '') || value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(value);
  }
  return parts.join(' / ');
}

function mapStudentsToRows(students, { omitSensitive = false, reportType = 'list' } = {}) {
  const sorted = [...(students || [])].sort(compareStudentsByRollAsc);
  return sorted.map((s, i) => ({
    serial: i + 1,
    // Student List + Contact List both show Roll # (column key kept as regNo for layout).
    regNo: rollNoOf(s),
    name: s.studentName || '',
    father: s.fatherName || '',
    phone: omitSensitive ? '' : phonesOf(s),
    className: classNameOf(s) || '',
    section: sectionNameOf(s) || '',
    blank1: '',
    blank2: '',
    blank3: '',
  }));
}

function buildMeta(meta, count, preset) {
  return {
    generatedAt: meta.generatedAt || new Date(),
    sessionLabel: meta.sessionName || '',
    leftFilter: meta.className ? `Class: ${meta.className}` : 'Class required',
    centerFilter: meta.sectionName
      ? `Section: ${meta.sectionName}`
      : `${count} student${count === 1 ? '' : 's'}`,
    rightFilter: meta.status ? `Status: ${statusLabel(meta.status)}` : '',
    filterLine: [
      meta.sessionName ? `Session: ${meta.sessionName}` : null,
      meta.className ? `Class: ${meta.className}` : null,
      meta.sectionName ? `Section: ${meta.sectionName}` : null,
      meta.status ? `Status: ${statusLabel(meta.status)}` : null,
      meta.search ? `Search: ${meta.search}` : null,
    ]
      .filter(Boolean)
      .join('   |   ') || preset.filterFallback,
    countLabel: `${count} student${count === 1 ? '' : 's'}`,
  };
}

/**
 * Dual-column table defs (award-list style). Name/father/contact wrap fully —
 * no ellipsis truncation.
 */
function buildDualCols(tableW, kind, omitSensitive) {
  if (kind === 'contact' && !omitSensitive) {
    const cols = [
      { key: 'serial', w: 20, label: 'Sr #', align: 'center', wrap: false },
      { key: 'regNo', w: 52, label: 'Roll #', align: 'center', wrap: true },
      { key: 'name', w: 78, label: 'Student Name', align: 'left', wrap: true },
      { key: 'father', w: 62, label: 'Father Name', align: 'left', wrap: true },
      { key: 'phone', w: 0, label: 'Contact', align: 'left', wrap: true },
    ];
    cols[4].w = Math.max(40, tableW - cols[0].w - cols[1].w - cols[2].w - cols[3].w);
    return cols;
  }
  // Student list: narrow Roll #, no father, two wide empty columns.
  const cols = [
    { key: 'serial', w: 20, label: 'Sr #', align: 'center', wrap: false },
    { key: 'regNo', w: 52, label: 'Roll #', align: 'center', wrap: true },
    { key: 'name', w: 88, label: 'Student Name', align: 'left', wrap: true },
    { key: 'blank1', w: 0, label: ' ', align: 'center', wrap: false },
    { key: 'blank2', w: 0, label: ' ', align: 'center', wrap: false },
  ];
  const used = cols[0].w + cols[1].w + cols[2].w;
  const blankW = Math.max(40, Math.floor((tableW - used) / 2));
  cols[3].w = blankW;
  cols[4].w = Math.max(40, tableW - used - blankW);
  return cols;
}

function dualCellFontSize(key) {
  if (key === 'regNo' || key === 'phone') return 6;
  return 6.5;
}

/**
 * Roll # cell: "2026-27-9TH-10TH-001" -> line 1 "2026-27-9TH-10TH" (session + class),
 * line 2 "001". Line 1 font shrinks (to a floor) so it stays on one line.
 */
const ROLL_MIN_FONT = 4.5;

function rollCellLayout(doc, value, innerW) {
  const m = String(value).match(/^(.*\S)-(\d+)$/);
  const lines = m ? [m[1], m[2]] : [String(value)];
  let fontSize = dualCellFontSize('regNo');
  doc.font('Helvetica');
  while (fontSize > ROLL_MIN_FONT && doc.fontSize(fontSize).widthOfString(lines[0]) > innerW) {
    fontSize -= 0.25;
  }
  doc.fontSize(fontSize);
  const lineH = doc.currentLineHeight(true) + 0.5;
  // Still too wide at the floor: let line 1 wrap rather than overflow the cell.
  const headH = doc.heightOfString(lines[0], { width: innerW, lineGap: 0.5 });
  return { lines, fontSize, lineH, height: headH + (lines.length - 1) * lineH };
}

/** Full text height for a row — wraps name/father/contact/reg so nothing is cut off. */
function dualRowHeight(doc, row, cols, { minRowH = 15, pad = 3 } = {}) {
  let maxH = minRowH;
  cols.forEach((c) => {
    const raw = row[c.key];
    const value = raw == null || raw === '' ? '' : String(raw);
    if (!value || !c.wrap) return;
    if (c.key === 'regNo') {
      const { height } = rollCellLayout(doc, value, Math.max(8, c.w - 4));
      maxH = Math.max(maxH, Math.ceil(height + pad * 2));
      return;
    }
    const fontSize = dualCellFontSize(c.key);
    doc.font('Helvetica').fontSize(fontSize);
    const textH = doc.heightOfString(value, { width: Math.max(8, c.w - 4), lineGap: 0.5 });
    maxH = Math.max(maxH, Math.ceil(textH + pad * 2));
  });
  return maxH;
}

function drawDualTableHeader(doc, blockX, y, tableW, cols, headerH) {
  doc.save();
  doc.rect(blockX, y, tableW, headerH).fill(GRAY);
  doc.restore();
  doc.rect(blockX, y, tableW, headerH).strokeColor(LINE).lineWidth(0.8).stroke();
  let x = blockX;
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#000');
  cols.forEach((c, i) => {
    const label = fitText(doc, c.label, c.w - 2);
    doc.text(label, x + 1, y + 4.5, {
      width: c.w - 2,
      height: 9,
      align: 'center',
      lineBreak: false,
    });
    x += c.w;
    if (i < cols.length - 1) {
      doc
        .moveTo(x, y)
        .lineTo(x, y + headerH)
        .strokeColor(LINE)
        .lineWidth(0.6)
        .stroke();
    }
  });
}

function drawDualStudentRow(doc, blockX, y, row, tableW, cols, rowH) {
  doc.rect(blockX, y, tableW, rowH).strokeColor(LINE).lineWidth(0.5).stroke();
  let x = blockX;
  cols.forEach((c, i) => {
    const raw = row[c.key];
    const value = raw == null || raw === '' ? '' : String(raw);
    if (value) {
      const fontSize = dualCellFontSize(c.key);
      doc.font('Helvetica').fontSize(fontSize).fillColor('#000');
      const innerW = Math.max(8, c.w - 4);
      if (c.key === 'regNo') {
        const { lines, fontSize: rollFont, height } = rollCellLayout(doc, value, innerW);
        doc.fontSize(rollFont).fillColor('#000');
        const textY = y + Math.max(2, (rowH - height) / 2);
        doc.text(lines.join('\n'), x + 2, textY, {
          width: innerW,
          align: c.align || 'center',
          lineGap: 0.5,
        });
      } else if (c.wrap) {
        const textH = doc.heightOfString(value, { width: innerW, lineGap: 0.5 });
        const textY = y + Math.max(2, (rowH - textH) / 2);
        doc.text(value, x + 2, textY, {
          width: innerW,
          align: c.align || 'left',
          lineGap: 0.5,
        });
      } else {
        doc.text(value, x + 2, y + (rowH - fontSize) / 2, {
          width: innerW,
          height: fontSize + 2,
          align: c.align || 'left',
          lineBreak: false,
        });
      }
    }
    x += c.w;
    if (i < cols.length - 1) {
      doc
        .moveTo(x, y)
        .lineTo(x, y + rowH)
        .strokeColor(LINE)
        .lineWidth(0.5)
        .stroke();
    }
  });
}

async function renderStudentsExcel(students, meta = {}, options = {}) {
  const preset = resolvePreset(options);
  const columns = columnsForExport(options);
  const rows = mapStudentsToRows(students, options);
  return renderBrandedExcel({
    title: preset.title,
    sheetName: preset.sheetName,
    subject: preset.subject,
    columns,
    rows,
    meta: buildMeta(meta, rows.length, preset),
    confidentialLabel: preset.confidentialLabel,
    ...REPORT_OPTS,
  });
}

/**
 * PDF: branded letterhead + two side-by-side tables (same format as award list).
 * Data/columns stay Student List / Contact List — layout is dual-column.
 */
async function renderStudentsPdf(students, meta = {}, options = {}) {
  const preset = resolvePreset(options);
  const rows = mapStudentsToRows(students, options);
  const omitSensitive = Boolean(options.omitSensitive);
  return renderDualTablePdf({
    title: preset.title,
    subject: preset.subject,
    confidentialLabel: preset.confidentialLabel,
    emptyMessage: preset.emptyMessage,
    rows,
    meta: buildMeta(meta, rows.length, preset),
    buildCols: (tableW) => buildDualCols(tableW, preset.kind, omitSensitive),
  });
}

/**
 * Portrait A4, letterhead, then rows packed into two side-by-side tables per page.
 * `buildCols(tableW)` returns [{ key, w, label, align, wrap }] for one half-width table;
 * a `regNo` column gets the two-line roll number layout.
 */
async function renderDualTablePdf({
  title,
  subject,
  confidentialLabel,
  emptyMessage,
  rows,
  meta: reportMeta,
  buildCols,
}) {
  const brand = ACADEMY_BRAND;
  const logoPath = resolveLogoPath();

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'portrait',
        margin: 28,
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

      const margin = 28;
      const contentW = doc.page.width - margin * 2;
      const pageH = doc.page.height;
      const gap = 8;
      const rowH = 15;
      const headerH = 16;
      const footerReserve = 36;

      const startBodyY = () => {
        let y = drawPdfLetterheadPlain(doc, brand, logoPath);
        y = drawPdfTitlePlain(
          doc,
          {
            title,
            filterLine: reportMeta.filterLine || '',
            countLabel: reportMeta.countLabel,
            sessionLabel: reportMeta.sessionLabel || '',
            leftFilter: reportMeta.leftFilter || '',
            centerFilter: reportMeta.centerFilter || '',
            rightFilter: reportMeta.rightFilter || '',
          },
          y
        );
        return y + 2;
      };

      if (rows.length === 0) {
        const y = startBodyY();
        doc.fillColor('#444444').font('Helvetica-Oblique').fontSize(10);
        doc.text(emptyMessage, margin, y + 16, {
          width: contentW,
          align: 'center',
        });
        drawPdfFooterTextPlain(doc, brand, confidentialLabel, reportMeta, 1, 1);
        doc.end();
        return;
      }

      // Probe letterhead height on page 1, then pack rows with full-name wrapping.
      const probeY = startBodyY();
      let remaining = rows.slice();
      let firstPage = true;
      // Always half-width. A full-width fallback made later pages single-column
      // once the leftover count looked like it fit in one column — wrapped roll
      // numbers are taller than that estimate, so those pages never matched page 1.
      const tableW = (contentW - gap) / 2;
      const cols = buildCols(tableW);

      const fillColumn = (source, availableH) => {
        const packed = [];
        let used = 0;
        const rest = source.slice();
        while (rest.length) {
          const next = rest[0];
          const h = dualRowHeight(doc, next, cols, { minRowH: rowH });
          if (packed.length > 0 && used + h > availableH) break;
          // Always place at least one row even if it is taller than the column.
          if (packed.length === 0 && h > availableH) {
            packed.push({ row: rest.shift(), h });
            used += h;
            break;
          }
          packed.push({ row: rest.shift(), h });
          used += h;
        }
        return { packed, rest };
      };

      /** Last page: share leftover rows across both columns when both fit. */
      const splitBalanced = (packed, availableH) => {
        if (packed.length <= 1) return null;
        const heights = packed.map((p) => p.h);
        const total = heights.reduce((sum, h) => sum + h, 0);
        let bestIndex = -1;
        let bestDiff = Infinity;
        let acc = 0;
        for (let i = 0; i < heights.length - 1; i += 1) {
          acc += heights[i];
          const rightH = total - acc;
          if (acc > availableH || rightH > availableH) continue;
          const diff = Math.abs(acc - rightH);
          if (diff < bestDiff) {
            bestDiff = diff;
            bestIndex = i + 1;
          }
        }
        if (bestIndex < 0) return null;
        return {
          left: packed.slice(0, bestIndex),
          right: packed.slice(bestIndex),
        };
      };

      const drawColumn = (blockX, top, packed) => {
        drawDualTableHeader(doc, blockX, top, tableW, cols, headerH);
        let y = top + headerH;
        packed.forEach(({ row, h }) => {
          drawDualStudentRow(doc, blockX, y, row, tableW, cols, h);
          y += h;
        });
      };

      while (remaining.length > 0) {
        let top;
        if (firstPage) {
          top = probeY;
          firstPage = false;
        } else {
          doc.addPage();
          top = startBodyY();
        }

        const availableH = Math.max(rowH, pageH - top - footerReserve - margin - headerH);
        let left = fillColumn(remaining, availableH);
        let right = fillColumn(left.rest, availableH);
        remaining = right.rest;

        if (!remaining.length) {
          const balanced = splitBalanced([...left.packed, ...right.packed], availableH);
          if (balanced && balanced.right.length) {
            left = { packed: balanced.left };
            right = { packed: balanced.right };
          }
        }

        drawColumn(margin, top, left.packed);
        if (right.packed.length) {
          drawColumn(margin + tableW + gap, top, right.packed);
        }
      }

      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i += 1) {
        doc.switchToPage(range.start + i);
        drawPdfFooterTextPlain(
          doc,
          brand,
          confidentialLabel,
          reportMeta,
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

module.exports = {
  mapStudentsToRows,
  renderStudentsExcel,
  renderStudentsPdf,
  renderDualTablePdf,
  statusLabel,
  normalizeReportType,
};
