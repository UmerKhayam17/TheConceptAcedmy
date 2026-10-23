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
const { resolveRegistrationDisplay } = require('../../utils/academyRegistrationNumber');

/**
 * Student List — class + section scoped sheet.
 * Columns: SR No, Roll # (narrow), Name, + 2 wide empty columns.
 * PDF: two side-by-side tables per page (award-list style).
 * Sorted ascending by roll number.
 */
const LIST_COLUMNS = [
  { key: 'serial', header: 'SR No', excelWidth: 6, pdfWidth: 28, align: 'center' },
  { key: 'regNo', header: 'Roll #', excelWidth: 8, pdfWidth: 42, align: 'center' },
  { key: 'name', header: 'Student Name', excelWidth: 22, pdfWidth: 120, wrap: true },
  { key: 'blank1', header: ' ', excelWidth: 22, pdfWidth: 130 },
  { key: 'blank2', header: ' ', excelWidth: 22, pdfWidth: 130 },
];

/**
 * Contact List — same scope; title "Contact"; one trailing blank column.
 * Sorted ascending by roll number (same order as Student List).
 */
const CONTACT_COLUMNS = [
  { key: 'serial', header: 'SR No', excelWidth: 7, pdfWidth: 28, align: 'center' },
  { key: 'regNo', header: 'Reg No', excelWidth: 14, pdfWidth: 74, align: 'center' },
  { key: 'name', header: 'Student Name', excelWidth: 18, pdfWidth: 95, wrap: true },
  { key: 'father', header: 'Father Name', excelWidth: 17, pdfWidth: 90, wrap: true },
  { key: 'phone', header: 'Contact', excelWidth: 18, pdfWidth: 95, wrap: true },
  { key: 'blank1', header: ' ', excelWidth: 20, pdfWidth: 100 },
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
  return key === 'contact' ? 'contact' : 'list';
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

function regNoOf(s) {
  return resolveRegistrationDisplay(s);
}

function rollNoOf(s) {
  return (
    String(s.rollNumber || '').trim() ||
    String(s.studentId || '').trim() ||
    ''
  );
}

/** Sort key for ascending numeric order (1, 2, 10… not 1, 10, 2). */
function rollSortKey(s) {
  return String(s.rollNumber || s.studentId || s.registrationNumber || '').trim();
}

function compareByRollAsc(a, b) {
  const ra = rollSortKey(a);
  const rb = rollSortKey(b);
  if (ra && rb && ra !== rb) {
    return ra.localeCompare(rb, undefined, { numeric: true, sensitivity: 'base' });
  }
  if (ra && !rb) return -1;
  if (!ra && rb) return 1;
  return String(a.studentName || '').localeCompare(String(b.studentName || ''), undefined, {
    sensitivity: 'base',
  });
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
  const kind = normalizeReportType(reportType);
  const sorted = [...(students || [])].sort(compareByRollAsc);
  return sorted.map((s, i) => ({
    serial: i + 1,
    // Student List shows Roll #; Contact List keeps Reg No (same column key for layout).
    regNo: kind === 'list' ? rollNoOf(s) : regNoOf(s),
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
      { key: 'regNo', w: 54, label: 'Reg No', align: 'center', wrap: true },
      { key: 'name', w: 72, label: 'Student Name', align: 'left', wrap: true },
      { key: 'father', w: 62, label: 'Father Name', align: 'left', wrap: true },
      { key: 'phone', w: 0, label: 'Contact', align: 'left', wrap: true },
    ];
    cols[4].w = Math.max(40, tableW - cols[0].w - cols[1].w - cols[2].w - cols[3].w);
    return cols;
  }
  // Student list: narrow Roll #, no father, two wide empty columns.
  const cols = [
    { key: 'serial', w: 20, label: 'Sr #', align: 'center', wrap: false },
    { key: 'regNo', w: 36, label: 'Roll #', align: 'center', wrap: true },
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

/** Full text height for a row — wraps name/father/contact/reg so nothing is cut off. */
function dualRowHeight(doc, row, cols, { minRowH = 15, pad = 3 } = {}) {
  let maxH = minRowH;
  cols.forEach((c) => {
    const raw = row[c.key];
    const value = raw == null || raw === '' ? '' : String(raw);
    if (!value || !c.wrap) return;
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
      if (c.wrap) {
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
  const reportMeta = buildMeta(meta, rows.length, preset);
  const brand = ACADEMY_BRAND;
  const logoPath = resolveLogoPath();
  const omitSensitive = Boolean(options.omitSensitive);
  const kind = preset.kind;

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'portrait',
        margin: 28,
        bufferPages: true,
        info: {
          Title: `${preset.title} — ${brand.name}`,
          Author: brand.name,
          Subject: preset.subject,
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
            title: preset.title,
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
        doc.text(preset.emptyMessage, margin, y + 16, {
          width: contentW,
          align: 'center',
        });
        drawPdfFooterTextPlain(doc, brand, preset.confidentialLabel, reportMeta, 1, 1);
        doc.end();
        return;
      }

      // Probe letterhead height on page 1, then pack rows with full-name wrapping.
      const probeY = startBodyY();
      let remaining = rows.slice();
      let firstPage = true;

      const fillColumn = (cols, availableH) => {
        const packed = [];
        let used = 0;
        while (remaining.length) {
          const next = remaining[0];
          const h = dualRowHeight(doc, next, cols, { minRowH: rowH });
          if (packed.length > 0 && used + h > availableH) break;
          // Always place at least one row even if it is taller than the column.
          if (packed.length === 0 && h > availableH) {
            packed.push({ row: remaining.shift(), h });
            used += h;
            break;
          }
          packed.push({ row: remaining.shift(), h });
          used += h;
        }
        return packed;
      };

      const drawColumn = (blockX, top, tableW, cols, packed) => {
        drawDualTableHeader(doc, blockX, top, tableW, cols, headerH);
        let y = top + headerH;
        packed.forEach(({ row, h }) => {
          drawDualStudentRow(doc, blockX, y, row, tableW, cols, h);
          y += h;
        });
      };

      while (remaining.length > 0 || firstPage) {
        let top;
        if (firstPage) {
          top = probeY;
          firstPage = false;
        } else {
          doc.addPage();
          top = startBodyY();
        }

        const availableH = Math.max(rowH, pageH - top - footerReserve - margin - headerH);
        // Prefer dual columns whenever more than ~one column of min-height rows remain.
        const preferDual = remaining.length > Math.max(1, Math.floor(availableH / rowH));
        const tableW = preferDual ? (contentW - gap) / 2 : contentW;
        const cols = buildDualCols(tableW, kind, omitSensitive);

        const leftPacked = fillColumn(cols, availableH);
        drawColumn(margin, top, tableW, cols, leftPacked);

        if (preferDual && remaining.length > 0) {
          const rightPacked = fillColumn(cols, availableH);
          if (rightPacked.length) {
            drawColumn(margin + tableW + gap, top, tableW, cols, rightPacked);
          }
        }

        if (!remaining.length) break;
      }

      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i += 1) {
        doc.switchToPage(range.start + i);
        drawPdfFooterTextPlain(
          doc,
          brand,
          preset.confidentialLabel,
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
  statusLabel,
  normalizeReportType,
};
