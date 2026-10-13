const PDFDocument = require('pdfkit');
const { ACADEMY_BRAND, resolveLogoPath } = require('../config/academyBrand');

const LINE = '#000000';
const GRAY = '#E8E8E8';
const MUTED = '#5A6A7A';
const NAVY = ACADEMY_BRAND.colors.navy;

function formatDate(value) {
  if (!value) return '—';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '—';
  const d = String(dt.getDate()).padStart(2, '0');
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${dt.getFullYear()}`;
}

function pctOf(obtained, total) {
  const t = Number(total) || 0;
  if (!t) return 0;
  return Math.round(((Number(obtained) || 0) / t) * 1000) / 10;
}

function subjectNameOf(sm) {
  const s = sm?.subject;
  if (s && typeof s === 'object') return String(s.subjectName || s.subjectCode || 'Subject').trim();
  return 'Subject';
}

function isFailMark(obtained, total, remarks) {
  const rem = String(remarks || '').toLowerCase();
  if (rem.includes('absent')) return true;
  const t = Number(total) || 0;
  const o = Number(obtained);
  if (Number.isNaN(o)) return true;
  if (t <= 0) return false;
  return (o / t) * 100 < 33;
}

function overallResultLabel(result) {
  const grade = String(result.grade || '').toUpperCase();
  const pct = Number(result.percentage) || 0;
  if (grade === 'F' || pct < 50) return 'Fail';
  const marks = result.subjectMarks || [];
  if (marks.some((sm) => isFailMark(sm.obtained, sm.total, sm.remarks))) return 'Fail';
  return 'Pass';
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
    fontSize = 9,
    fill = null,
    textColor = '#000000',
    valign = 'middle',
  } = opts;

  if (fill) {
    doc.rect(x, y, w, h).fill(fill);
  }
  doc.rect(x, y, w, h).strokeColor(LINE).lineWidth(0.6).stroke();

  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize).fillColor(textColor);
  const shown = fitText(doc, text, w - 6);
  const textH = fontSize;
  const ty =
    valign === 'top' ? y + 3 : valign === 'bottom' ? y + h - textH - 3 : y + (h - textH) / 2;
  doc.text(shown, x + 3, ty, {
    width: w - 6,
    align,
    lineBreak: false,
  });
}

function infoRow(doc, label, value, x, y, labelW, valueW) {
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
  doc.text(label, x, y, { width: labelW, lineBreak: false });
  doc.font('Helvetica').fontSize(9).fillColor('#000');
  const shown = fitText(doc, value || '—', valueW - 2);
  doc.text(shown, x + labelW, y, { width: valueW, lineBreak: false });
}

/**
 * Single-student result card PDF (subject rows + totals), styled like a mark sheet card.
 */
async function renderResultCardPdf(result) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const margin = 40;
      const pageW = doc.page.width;
      const contentW = pageW - margin * 2;
      const logoPath = resolveLogoPath();

      const student = result.academyStudent || result.student || {};
      const exam = result.exam || {};
      const className =
        (typeof exam.academyClass === 'object' && exam.academyClass?.className) ||
        (typeof student.classId === 'object' && student.classId?.className) ||
        '';
      const sectionName =
        (typeof exam.sectionId === 'object' && exam.sectionId?.sectionName) ||
        (typeof student.sectionId === 'object' && student.sectionId?.sectionName) ||
        '';
      const studentName = String(student.studentName || '').trim().toUpperCase() || '—';
      const studentId = String(student.studentId || student.rollNumber || '').trim() || '—';
      const fatherName = String(student.fatherName || '').trim() || '—';
      const program = [className, sectionName].filter(Boolean).join(' · ') || '—';
      const examTitle = String(exam.title || 'Examination').trim();
      const examType = String(exam.type || '').trim();
      const sessionLabel = String(exam.sessionLabel || '').trim();
      const subjects = Array.isArray(result.subjectMarks) ? result.subjectMarks : [];
      const resultLabel = overallResultLabel(result);
      const isFail = resultLabel === 'Fail';

      // —— Header / brand ——
      let y = margin;
      if (logoPath) {
        try {
          doc.image(logoPath, margin, y, { width: 48, height: 48 });
        } catch {
          /* ignore missing logo decode */
        }
      }
      doc
        .font('Helvetica-Bold')
        .fontSize(16)
        .fillColor(NAVY)
        .text(ACADEMY_BRAND.name, margin + 58, y + 4, { width: contentW - 58 });
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(MUTED)
        .text(ACADEMY_BRAND.tagline, margin + 58, y + 24, { width: contentW - 58 });
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(MUTED)
        .text(
          [ACADEMY_BRAND.address, ACADEMY_BRAND.phones?.join(' · '), ACADEMY_BRAND.email]
            .filter(Boolean)
            .join('  |  '),
          margin + 58,
          y + 38,
          { width: contentW - 58 }
        );

      y += 62;
      doc
        .moveTo(margin, y)
        .lineTo(margin + contentW, y)
        .strokeColor(LINE)
        .lineWidth(1.2)
        .stroke();
      y += 14;

      doc
        .font('Helvetica-Bold')
        .fontSize(14)
        .fillColor(NAVY)
        .text('RESULT CARD', margin, y, { width: contentW, align: 'center' });
      y += 18;
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#000')
        .text(examTitle, margin, y, { width: contentW, align: 'center' });
      y += 14;
      const subLine = [examType, sessionLabel].filter(Boolean).join(' · ');
      if (subLine) {
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor(MUTED)
          .text(subLine, margin, y, { width: contentW, align: 'center' });
        y += 12;
      }
      y += 6;

      // —— Student info box ——
      const infoH = 72;
      doc.rect(margin, y, contentW, infoH).strokeColor(LINE).lineWidth(0.8).stroke();
      const col1 = margin + 10;
      const col2 = margin + contentW / 2 + 10;
      const labelW = 78;
      const valueW = contentW / 2 - 30;
      let iy = y + 10;
      infoRow(doc, 'Student Name:', studentName, col1, iy, labelW, valueW);
      infoRow(doc, 'Student ID:', studentId, col2, iy, labelW, valueW);
      iy += 16;
      infoRow(doc, 'Father Name:', fatherName, col1, iy, labelW, valueW);
      infoRow(doc, 'Class / Sec:', program, col2, iy, labelW, valueW);
      iy += 16;
      infoRow(
        doc,
        'Exam period:',
        `${formatDate(exam.startDate)} – ${formatDate(exam.endDate)}`,
        col1,
        iy,
        labelW,
        valueW
      );
      infoRow(
        doc,
        'Position:',
        result.position != null ? String(result.position) : '—',
        col2,
        iy,
        labelW,
        valueW
      );
      iy += 16;
      infoRow(doc, 'Grade:', result.grade || '—', col1, iy, labelW, valueW);
      infoRow(
        doc,
        'GPA:',
        result.gpa != null ? Number(result.gpa).toFixed(1) : '—',
        col2,
        iy,
        labelW,
        valueW
      );
      y += infoH + 16;

      // —— Subject marks table (vertical card layout from mark sheet columns) ——
      const headers = ['Sr. #', 'Subject', 'Total Marks', 'O.M', '%age', 'Grade'];
      const colWs = [36, contentW - 36 - 72 - 56 - 56 - 56, 72, 56, 56, 56];
      const rowH = 22;
      const headerH = 24;

      let x = margin;
      headers.forEach((h, i) => {
        drawCell(doc, h, x, y, colWs[i], headerH, {
          bold: true,
          fontSize: 9,
          fill: GRAY,
        });
        x += colWs[i];
      });
      y += headerH;

      if (!subjects.length) {
        drawCell(doc, 'No subject marks recorded', margin, y, contentW, 28, {
          fontSize: 9,
          fill: '#FAFAFA',
        });
        y += 28;
      } else {
        subjects.forEach((sm, idx) => {
          if (y + rowH > doc.page.height - 100) {
            doc.addPage();
            y = margin;
          }
          const obtained = sm.obtained;
          const total = sm.total;
          const rem = String(sm.remarks || '');
          const absent = rem.toLowerCase().includes('absent');
          const omText = absent ? 'Absent' : obtained != null ? String(obtained) : '—';
          const pct = absent ? 0 : pctOf(obtained, total);
          const failCell = isFailMark(obtained, total, rem);
          const grade = sm.grade || (absent ? '—' : '');

          const cells = [
            String(idx + 1),
            subjectNameOf(sm),
            String(total ?? '—'),
            omText,
            `${pct}%`,
            grade || '—',
          ];
          x = margin;
          cells.forEach((text, i) => {
            const highlight = failCell && (i === 3 || i === 4 || i === 5);
            drawCell(doc, text, x, y, colWs[i], rowH, {
              bold: i === 1,
              fontSize: 9,
              fill: highlight ? GRAY : null,
              align: i === 1 ? 'left' : 'center',
            });
            x += colWs[i];
          });
          y += rowH;
        });
      }

      // —— Totals / Result footer ——
      y += 10;
      const totalMarks = Number(result.totalMarks) || subjects.reduce((s, sm) => s + (Number(sm.total) || 0), 0);
      const obtainedMarks =
        Number(result.obtainedMarks) ||
        subjects.reduce((s, sm) => s + (Number(sm.obtained) || 0), 0);
      const overallPct =
        result.percentage != null
          ? Math.round(Number(result.percentage) * 10) / 10
          : pctOf(obtainedMarks, totalMarks);

      const summaryH = 28;
      const sCols = [
        { label: 'Total Marks', value: String(totalMarks), w: contentW * 0.2 },
        { label: 'Obtained', value: String(obtainedMarks), w: contentW * 0.2 },
        { label: '%age', value: `${overallPct}%`, w: contentW * 0.2 },
        { label: 'Result', value: resultLabel, w: contentW * 0.4 },
      ];
      x = margin;
      sCols.forEach((c) => {
        doc.rect(x, y, c.w, summaryH).strokeColor(LINE).lineWidth(0.8).stroke();
        if (c.label === 'Result') {
          doc.rect(x, y, c.w, summaryH).fillAndStroke(GRAY, LINE);
        }
        doc
          .font('Helvetica')
          .fontSize(7)
          .fillColor(MUTED)
          .text(c.label, x + 4, y + 3, { width: c.w - 8, align: 'center' });
        doc
          .font('Helvetica-Bold')
          .fontSize(11)
          .fillColor(c.label === 'Result' && isFail ? '#B91C1C' : NAVY)
          .text(c.value, x + 4, y + 12, { width: c.w - 8, align: 'center' });
        x += c.w;
      });
      y += summaryH + 18;

      if (result.remarks) {
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#000').text('Remarks:', margin, y);
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor('#000')
          .text(String(result.remarks), margin + 55, y, { width: contentW - 55 });
        y += 16;
      }

      // —— Footer ——
      y = Math.max(y + 8, doc.page.height - 70);
      doc
        .moveTo(margin, y)
        .lineTo(margin + contentW, y)
        .strokeColor(LINE)
        .lineWidth(0.6)
        .stroke();
      y += 10;
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(MUTED)
        .text(
          `Generated on ${formatDate(new Date())}  ·  ${ACADEMY_BRAND.legalName || ACADEMY_BRAND.name}`,
          margin,
          y,
          { width: contentW, align: 'center' }
        );
      y += 20;
      const sigW = 140;
      doc
        .moveTo(margin + 20, y + 24)
        .lineTo(margin + 20 + sigW, y + 24)
        .strokeColor(LINE)
        .lineWidth(0.7)
        .stroke();
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#000')
        .text('Controller of Examinations', margin + 20, y + 28, {
          width: sigW,
          align: 'center',
        });
      doc
        .moveTo(margin + contentW - 20 - sigW, y + 24)
        .lineTo(margin + contentW - 20, y + 24)
        .strokeColor(LINE)
        .lineWidth(0.7)
        .stroke();
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#000')
        .text('Principal', margin + contentW - 20 - sigW, y + 28, {
          width: sigW,
          align: 'center',
        });

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { renderResultCardPdf };
