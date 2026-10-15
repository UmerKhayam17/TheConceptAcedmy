const PDFDocument = require('pdfkit');
const { ACADEMY_BRAND, resolveLogoPath } = require('../../config/academyBrand');
const {
  drawPdfLetterheadPlain,
  drawPdfTitlePlain,
} = require('./academyReportDocument');
const { assessmentTypeLabel } = require('../../config/assessmentTaxonomy');
const planService = require('./assessmentPlanService');
const ApiError = require('../../utils/ApiError');

const LINE = '#000000';
const GRAY = '#D0D0D0';

function formatDate(value) {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  const d = String(dt.getDate()).padStart(2, '0');
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const y = dt.getFullYear();
  return `${d}/${m}/${y}`;
}

function fitText(doc, text, maxWidth) {
  let t = String(text ?? '');
  if (!t) return '';
  if (doc.widthOfString(t) <= maxWidth) return t;
  while (t.length > 1 && doc.widthOfString(`${t}…`) > maxWidth) {
    t = t.slice(0, -1);
  }
  return t.length ? `${t}…` : '';
}

function drawCell(doc, text, x, y, w, h, opts = {}) {
  const {
    align = 'center',
    bold = false,
    fontSize = 8,
    fill = null,
    textColor = '#000000',
  } = opts;
  if (fill) doc.rect(x, y, w, h).fill(fill);
  doc.rect(x, y, w, h).strokeColor(LINE).lineWidth(0.45).stroke();
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize).fillColor(textColor);
  const shown = fitText(doc, text, w - 4);
  const ty = y + Math.max(1, (h - fontSize) / 2);
  doc.text(shown, x + 2, ty, { width: w - 4, align, lineBreak: false });
}

function drawHeaderField(doc, label, value, x, y, totalWidth, fontSize = 8) {
  doc.font('Helvetica-Bold').fontSize(fontSize).fillColor('#000');
  const labelW = doc.widthOfString(label);
  doc.text(label, x, y, { lineBreak: false });
  const lineStart = x + labelW + 3;
  const lineEnd = x + totalWidth;
  if (value) {
    doc.font('Helvetica').fontSize(fontSize).fillColor('#000');
    doc.text(fitText(doc, value, Math.max(0, lineEnd - lineStart - 2)), lineStart, y, {
      lineBreak: false,
    });
  }
  doc
    .moveTo(lineStart, y + fontSize + 1)
    .lineTo(lineEnd, y + fontSize + 1)
    .strokeColor(LINE)
    .lineWidth(0.7)
    .stroke();
}

function drawReportHeader(doc, meta, margin, contentW) {
  const logoPath = resolveLogoPath();
  let y = drawPdfLetterheadPlain(doc, ACADEMY_BRAND, logoPath);
  y = drawPdfTitlePlain(
    doc,
    {
      title: meta.title || 'DATE SHEET',
      sessionLabel: meta.sessionLabel || '',
      leftFilter: '',
      centerFilter: meta.examLabel || meta.subtitle || '',
      rightFilter: '',
    },
    y
  );

  const barH = 16;
  doc.save();
  doc.rect(margin, y, contentW, barH).fill(GRAY);
  doc.restore();
  doc.rect(margin, y, contentW, barH).strokeColor(LINE).lineWidth(0.8).stroke();
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#000');
  const programText = meta.disciplineLabel
    ? `Program/Class/Section/Discipline : ${meta.programLabel || '—'}`
    : `Program/Class/Section : ${meta.programLabel || '—'}`;
  doc.text(fitText(doc, programText, contentW - 12), margin + 6, y + 4, { lineBreak: false });
  y += barH + 8;

  const rowGap = 14;
  const leftW = contentW * 0.42;
  const midX = margin + leftW + 8;
  const midW = contentW * 0.28;
  const rightX = midX + midW + 8;
  const rightW = contentW - (leftW + midW + 16);

  drawHeaderField(doc, 'Subject: ', meta.subjectsLabel || '', margin, y, leftW);
  drawHeaderField(doc, 'Total Marks: ', meta.totalMarks || '', midX, y, midW);
  drawHeaderField(doc, 'Pass Marks: ', meta.passMarks || '', rightX, y, rightW);
  y += rowGap;

  if (meta.disciplineLabel) {
    drawHeaderField(doc, 'Discipline: ', meta.disciplineLabel, margin, y, contentW);
    y += rowGap;
  }

  const half = (contentW - 10) / 2;
  drawHeaderField(doc, "Examiner's Name: ", '', margin, y, half);
  drawHeaderField(doc, "Invigilator's Name: ", '', margin + half + 10, y, half);
  y += rowGap;

  const typeLabel = meta.testTypeLabel || 'Test';
  drawHeaderField(doc, `${typeLabel}: `, meta.testNumber || '', margin, y, half);
  drawHeaderField(doc, 'Test Date: ', meta.testDate || '', margin + half + 10, y, half);
  y += rowGap + 2;

  doc
    .moveTo(margin, y)
    .lineTo(margin + contentW, y)
    .strokeColor(LINE)
    .lineWidth(1.4)
    .stroke();
  return y + 8;
}

function bufferFromDoc(build) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'portrait',
        margin: 36,
        info: { Author: ACADEMY_BRAND.name },
      });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      build(doc);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function testNumberOf(testName) {
  const m = String(testName || '').match(/\b(?:test\s*(?:no|number)?\s*)?(\d+)\b/i);
  return m ? m[1] : '';
}

/**
 * Branded date-sheet PDF for one assessment batch (same letterhead as marks reports).
 */
async function renderDateSheetPdf(sessionId, filters = {}) {
  const data = await planService.getPublishedDateSheet(sessionId, {
    classId: filters.classId,
    sectionId: filters.sectionId,
  });

  let rows = data.rows || [];
  if (filters.assignmentId) {
    const ids = String(filters.assignmentId)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    rows = rows.filter((r) => ids.includes(String(r.assignmentId || '')));
  }
  if (filters.testName) {
    const want = String(filters.testName).trim().toLowerCase();
    rows = rows.filter((r) => String(r.testName || '').trim().toLowerCase() === want);
  }

  if (!rows.length) throw new ApiError(400, 'No date sheet papers to print');

  rows = [...rows].sort((a, b) => {
    const da = new Date(a.examDate || 0).getTime();
    const db = new Date(b.examDate || 0).getTime();
    if (da !== db) return da - db;
    return String(a.subjectName || '').localeCompare(String(b.subjectName || ''));
  });

  const first = rows[0];
  const className = first.className || '';
  const sectionName = first.sectionName || '';
  const disciplineName = first.disciplineName || '';
  const programLabel = [className, sectionName, disciplineName].filter(Boolean).join(' · ') || '—';
  const subjectsLabel = rows.map((r) => r.subjectName).filter(Boolean).join(', ');
  const totalMarks = rows.reduce((sum, r) => sum + (Number(r.totalMarks) || 0), 0);
  const typeLabel = first.assessmentTypeLabel || assessmentTypeLabel(first.assessmentType) || 'Test';
  const testNumber = testNumberOf(first.testName) || first.testName || '1';
  const dates = rows.map((r) => formatDate(r.examDate)).filter(Boolean);
  const testDate =
    dates.length > 1 && dates[0] !== dates[dates.length - 1]
      ? `${dates[0]} – ${dates[dates.length - 1]}`
      : dates[0] || '';
  const sessionLabel =
    typeof data.session === 'object' && data.session ? data.session.name || '' : '';

  return bufferFromDoc((doc) => {
    const margin = 36;
    const contentW = doc.page.width - margin * 2;
    let y = drawReportHeader(
      doc,
      {
        title: `TEST NO. ${testNumber}`,
        sessionLabel,
        examLabel: first.testName || typeLabel,
        programLabel,
        disciplineLabel: disciplineName,
        subjectsLabel,
        totalMarks: String(totalMarks),
        testTypeLabel: typeLabel,
        testNumber,
        testDate,
      },
      margin,
      contentW
    );

    const headers = ['Sr.', 'Date', 'Class', 'Section', 'Subject', 'Marks', 'Syllabus'];
    const colWs = [36, 78, 70, 60, 120, 55, contentW - 36 - 78 - 70 - 60 - 120 - 55];
    const headerH = 22;
    const rowH = 20;
    let x = margin;
    headers.forEach((h, i) => {
      drawCell(doc, h, x, y, colWs[i], headerH, { bold: true, fontSize: 8, fill: GRAY });
      x += colWs[i];
    });
    y += headerH;

    rows.forEach((row, idx) => {
      if (y + rowH > doc.page.height - 48) {
        doc.addPage();
        y = margin;
        x = margin;
        headers.forEach((h, i) => {
          drawCell(doc, h, x, y, colWs[i], headerH, { bold: true, fontSize: 8, fill: GRAY });
          x += colWs[i];
        });
        y += headerH;
      }
      const zebra = idx % 2 === 1 ? '#F4F4F4' : null;
      const vals = [
        String(idx + 1),
        formatDate(row.examDate),
        row.className || '—',
        row.sectionName || '—',
        row.subjectName || '—',
        String(row.totalMarks ?? ''),
        row.syllabus || '—',
      ];
      x = margin;
      vals.forEach((text, i) => {
        drawCell(doc, text, x, y, colWs[i], rowH, {
          bold: i === 4,
          fontSize: 8,
          fill: zebra,
          align: i === 4 || i === 6 ? 'left' : 'center',
        });
        x += colWs[i];
      });
      y += rowH;
    });
  });
}

module.exports = {
  renderDateSheetPdf,
};
