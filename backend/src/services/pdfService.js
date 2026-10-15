const PDFDocument = require('pdfkit');
const { ACADEMY_BRAND, resolveLogoPath } = require('../config/academyBrand');
const { letterGrade } = require('./exam/examGrading');

const LINE = '#C5CED9';
const LINE_STRONG = '#0E2A4E';
const MUTED = ACADEMY_BRAND.colors.muted;
const NAVY = ACADEMY_BRAND.colors.navy;
const NAVY_DARK = ACADEMY_BRAND.colors.navyDark;
const GOLD = ACADEMY_BRAND.colors.gold;
const ZEBRA = ACADEMY_BRAND.colors.zebra;
const WHITE = ACADEMY_BRAND.colors.white;
const FAIL_BG = '#FDECEC';
const FAIL_TEXT = '#B91C1C';
const PASS_TEXT = '#166534';

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

function ordinal(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num <= 0) return '—';
  const v = num % 100;
  if (v >= 11 && v <= 13) return `${num}th`;
  switch (num % 10) {
    case 1:
      return `${num}st`;
    case 2:
      return `${num}nd`;
    case 3:
      return `${num}rd`;
    default:
      return `${num}th`;
  }
}

function drawRoundedRect(doc, x, y, w, h, r, opts = {}) {
  const radius = Math.min(r, w / 2, h / 2);
  doc.save();
  doc.moveTo(x + radius, y);
  doc.lineTo(x + w - radius, y);
  doc.quadraticCurveTo(x + w, y, x + w, y + radius);
  doc.lineTo(x + w, y + h - radius);
  doc.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  doc.lineTo(x + radius, y + h);
  doc.quadraticCurveTo(x, y + h, x, y + h - radius);
  doc.lineTo(x, y + radius);
  doc.quadraticCurveTo(x, y, x + radius, y);
  doc.closePath();
  if (opts.fill && opts.stroke) {
    doc.fillColor(opts.fill).strokeColor(opts.stroke).lineWidth(opts.lineWidth || 0.8);
    doc.fillAndStroke();
  } else if (opts.fill) {
    doc.fillColor(opts.fill).fill();
  } else if (opts.stroke) {
    doc.strokeColor(opts.stroke).lineWidth(opts.lineWidth || 0.8).stroke();
  }
  doc.restore();
}

function drawCell(doc, text, x, y, w, h, opts = {}) {
  const {
    align = 'center',
    bold = false,
    fontSize = 9,
    fill = null,
    textColor = '#111111',
    stroke = LINE,
    lineWidth = 0.5,
  } = opts;

  if (fill) {
    doc.save();
    doc.rect(x, y, w, h).fill(fill);
    doc.restore();
  }
  doc.save();
  doc.rect(x, y, w, h).strokeColor(stroke).lineWidth(lineWidth).stroke();
  doc.restore();

  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize).fillColor(textColor);
  const shown = fitText(doc, text, w - 8);
  const ty = y + (h - fontSize) / 2;
  doc.text(shown, x + 4, ty, {
    width: w - 8,
    align,
    lineBreak: false,
  });
}

function drawInfoPair(doc, label, value, x, y, labelW, valueW) {
  doc.font('Helvetica').fontSize(8).fillColor(MUTED);
  doc.text(label, x, y, { width: labelW, lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#111111');
  doc.text(fitText(doc, value || '—', valueW), x + labelW, y - 0.5, {
    width: valueW,
    lineBreak: false,
  });
}

function drawLetterhead(doc, brand, logoPath, margin) {
  const pageW = doc.page.width;
  const contentW = pageW - margin * 2;
  const top = 28;
  const logoSize = 52;

  // Top accent bar
  doc.save();
  doc.rect(0, 0, pageW, 6).fill(NAVY);
  doc.rect(0, 6, pageW, 2).fill(GOLD);
  doc.restore();

  let textLeft = margin;
  if (logoPath) {
    try {
      doc.image(logoPath, margin, top, { fit: [logoSize, logoSize] });
      textLeft = margin + logoSize + 12;
    } catch {
      /* skip broken logo */
    }
  }

  const textTop = top + 2;
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(16);
  doc.text(brand.name, textLeft, textTop, { lineBreak: false });

  if (brand.tagline) {
    doc.fillColor(GOLD).font('Helvetica-Oblique').fontSize(8);
    doc.text(brand.tagline, textLeft, textTop + 20, { lineBreak: false });
  }

  if (brand.legalName && brand.legalName !== brand.name) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(7.5);
    doc.text(brand.legalName, textLeft, textTop + 34, { lineBreak: false });
  }

  const rightX = margin + contentW / 2 + 20;
  const rightW = contentW / 2 - 20;
  doc.fillColor(MUTED).font('Helvetica').fontSize(7.5);
  const contactLines = [
    brand.address,
    Array.isArray(brand.phones) ? brand.phones.join('  ·  ') : brand.phones,
    brand.email,
  ].filter(Boolean);
  contactLines.forEach((line, i) => {
    doc.text(line, rightX, textTop + 4 + i * 12, {
      width: rightW,
      align: 'right',
      lineBreak: false,
    });
  });

  const bottom = Math.max(top + logoSize, textTop + 48) + 8;
  doc
    .moveTo(margin, bottom)
    .lineTo(margin + contentW, bottom)
    .strokeColor(LINE)
    .lineWidth(0.8)
    .stroke();
  doc
    .moveTo(margin, bottom + 2.5)
    .lineTo(margin + contentW, bottom + 2.5)
    .strokeColor(GOLD)
    .lineWidth(1.2)
    .stroke();

  return bottom + 12;
}

/**
 * Single-student report card PDF — branded academic result card.
 */
async function renderResultCardPdf(result) {
  return new Promise((resolve, reject) => {
    try {
      // margin: 0 so branded footer can sit at the page edge without auto page-break
      const doc = new PDFDocument({ size: 'A4', margin: 0 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const margin = 40;
      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const contentW = pageW - margin * 2;
      const logoPath = resolveLogoPath();
      const footerReserve = 28;

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
      const rollNumber = String(student.rollNumber || '').trim() || '—';
      const program = [className, sectionName].filter(Boolean).join(' / ') || '—';
      const examTitle = String(exam.title || 'Examination').trim();
      const examType = String(exam.type || '').trim();
      const sessionLabel = String(exam.sessionLabel || '').trim();
      const subjects = Array.isArray(result.subjectMarks) ? result.subjectMarks : [];
      const resultLabel = overallResultLabel(result);
      const isFail = resultLabel === 'Fail';

      // —— Letterhead ——
      let y = drawLetterhead(doc, ACADEMY_BRAND, logoPath, margin);

      // —— Document title ——
      const title = 'REPORT CARD';
      doc.font('Helvetica-Bold').fontSize(12);
      const titleW = doc.widthOfString(title);
      const titleBoxW = titleW + 36;
      const titleBoxH = 24;
      const titleBoxX = margin + (contentW - titleBoxW) / 2;
      drawRoundedRect(doc, titleBoxX, y, titleBoxW, titleBoxH, 3, {
        fill: NAVY,
      });
      doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(11);
      doc.text(title, titleBoxX, y + 6.5, { width: titleBoxW, align: 'center', lineBreak: false });
      y += titleBoxH + 6;

      // Exam / session subtitle
      const subtitleParts = [examTitle, examType, sessionLabel ? `Session ${sessionLabel}` : '']
        .filter(Boolean)
        .join('  ·  ');
      doc.fillColor(MUTED).font('Helvetica').fontSize(9);
      doc.text(subtitleParts, margin, y, { width: contentW, align: 'center', lineBreak: false });
      y += 12;

      const periodText = `Examination Period: ${formatDate(exam.startDate)} – ${formatDate(exam.endDate)}`;
      doc.fillColor('#333333').font('Helvetica').fontSize(8);
      doc.text(periodText, margin, y, { width: contentW, align: 'center', lineBreak: false });
      y += 14;

      // —— Student particulars ——
      const infoH = 74;
      drawRoundedRect(doc, margin, y, contentW, infoH, 4, {
        fill: ZEBRA,
        stroke: LINE,
        lineWidth: 0.7,
      });

      // Left accent
      doc.save();
      doc.rect(margin, y, 4, infoH).fill(GOLD);
      doc.restore();

      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8);
      doc.text('STUDENT PARTICULARS', margin + 14, y + 8, { lineBreak: false });

      const col1 = margin + 14;
      const col2 = margin + contentW / 2 + 8;
      const labelW = 72;
      const valueW = contentW / 2 - 36;
      let iy = y + 24;
      drawInfoPair(doc, 'Student Name', studentName, col1, iy, labelW, valueW);
      drawInfoPair(doc, 'Student ID', studentId, col2, iy, labelW, valueW);
      iy += 16;
      drawInfoPair(doc, "Father's Name", fatherName, col1, iy, labelW, valueW);
      drawInfoPair(doc, 'Roll No.', rollNumber, col2, iy, labelW, valueW);
      iy += 16;
      drawInfoPair(doc, 'Class / Section', program, col1, iy, labelW, valueW);
      drawInfoPair(
        doc,
        'Class Position',
        result.position != null ? ordinal(result.position) : '—',
        col2,
        iy,
        labelW,
        valueW
      );
      y += infoH + 12;

      // —— Marks table ——
      const headers = ['Sr.', 'Subject', 'Total', 'Obtained', '%age', 'Grade'];
      const colWs = [32, contentW - 32 - 58 - 62 - 52 - 48, 58, 62, 52, 48];
      const rowH = 20;
      const headerH = 22;

      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8);
      doc.text('ACADEMIC PERFORMANCE', margin, y, { lineBreak: false });
      y += 10;

      let x = margin;
      headers.forEach((h, i) => {
        drawCell(doc, h, x, y, colWs[i], headerH, {
          bold: true,
          fontSize: 8.5,
          fill: NAVY,
          textColor: WHITE,
          stroke: NAVY_DARK,
          lineWidth: 0.6,
        });
        x += colWs[i];
      });
      y += headerH;

      if (!subjects.length) {
        drawCell(doc, 'No subject marks recorded', margin, y, contentW, 28, {
          fontSize: 9,
          fill: '#FAFBFC',
          textColor: MUTED,
        });
        y += 28;
      } else {
        subjects.forEach((sm, idx) => {
          if (y + rowH > pageH - footerReserve - 150) {
            doc.addPage();
            // Mini header on continuation pages
            doc.save();
            doc.rect(0, 0, pageW, 4).fill(NAVY);
            doc.rect(0, 4, pageW, 1.5).fill(GOLD);
            doc.restore();
            y = 36;
            doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9);
            doc.text(`${studentName}  ·  ${examTitle} (continued)`, margin, y, {
              width: contentW,
              lineBreak: false,
            });
            y += 18;
            x = margin;
            headers.forEach((h, i) => {
              drawCell(doc, h, x, y, colWs[i], headerH, {
                bold: true,
                fontSize: 8.5,
                fill: NAVY,
                textColor: WHITE,
                stroke: NAVY_DARK,
              });
              x += colWs[i];
            });
            y += headerH;
          }

          const obtained = sm.obtained;
          const total = sm.total;
          const rem = String(sm.remarks || '');
          const absent = rem.toLowerCase().includes('absent');
          const omText = absent ? 'Absent' : obtained != null ? String(obtained) : '—';
          const pct = absent ? 0 : pctOf(obtained, total);
          const failCell = isFailMark(obtained, total, rem);
          const grade =
            sm.grade ||
            (absent ? '—' : Number.isFinite(pct) ? letterGrade(pct) : '—');
          const zebra = idx % 2 === 1 ? ZEBRA : WHITE;

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
              bold: i === 1 || highlight,
              fontSize: 9,
              fill: highlight ? FAIL_BG : zebra,
              textColor: highlight ? FAIL_TEXT : '#111111',
              align: i === 1 ? 'left' : 'center',
            });
            x += colWs[i];
          });
          y += rowH;
        });
      }

      // —— Summary strip ——
      y += 10;
      const totalMarks =
        Number(result.totalMarks) || subjects.reduce((s, sm) => s + (Number(sm.total) || 0), 0);
      const obtainedMarks =
        Number(result.obtainedMarks) ||
        subjects.reduce((s, sm) => s + (Number(sm.obtained) || 0), 0);
      const overallPct =
        result.percentage != null
          ? Math.round(Number(result.percentage) * 10) / 10
          : pctOf(obtainedMarks, totalMarks);
      const overallGrade = result.grade || letterGrade(overallPct);
      const gpaText = result.gpa != null ? Number(result.gpa).toFixed(1) : '—';

      const summaryH = 42;
      const sCols = [
        { label: 'TOTAL MARKS', value: String(totalMarks) },
        { label: 'MARKS OBTAINED', value: String(obtainedMarks) },
        { label: 'PERCENTAGE', value: `${overallPct}%` },
        { label: 'GRADE', value: overallGrade || '—' },
        { label: 'GPA', value: gpaText },
        { label: 'RESULT', value: resultLabel.toUpperCase(), isResult: true },
      ];
      const sColW = contentW / sCols.length;

      drawRoundedRect(doc, margin, y, contentW, summaryH, 4, {
        fill: WHITE,
        stroke: LINE,
        lineWidth: 0.8,
      });

      sCols.forEach((c, i) => {
        const cx = margin + i * sColW;
        if (i > 0) {
          doc
            .moveTo(cx, y + 6)
            .lineTo(cx, y + summaryH - 6)
            .strokeColor(LINE)
            .lineWidth(0.5)
            .stroke();
        }
        doc.font('Helvetica').fontSize(6.5).fillColor(MUTED);
        doc.text(c.label, cx + 4, y + 7, { width: sColW - 8, align: 'center', lineBreak: false });

        if (c.isResult) {
          const badgeW = Math.min(64, sColW - 12);
          const badgeH = 15;
          const badgeX = cx + (sColW - badgeW) / 2;
          const badgeY = y + 20;
          drawRoundedRect(doc, badgeX, badgeY, badgeW, badgeH, 8, {
            fill: isFail ? FAIL_BG : '#E8F5E9',
            stroke: isFail ? FAIL_TEXT : PASS_TEXT,
            lineWidth: 0.7,
          });
          doc
            .font('Helvetica-Bold')
            .fontSize(8.5)
            .fillColor(isFail ? FAIL_TEXT : PASS_TEXT)
            .text(c.value, badgeX, badgeY + 3, {
              width: badgeW,
              align: 'center',
              lineBreak: false,
            });
        } else {
          doc
            .font('Helvetica-Bold')
            .fontSize(11)
            .fillColor(NAVY)
            .text(c.value, cx + 4, y + 20, {
              width: sColW - 8,
              align: 'center',
              lineBreak: false,
            });
        }
      });
      y += summaryH + 10;

      // —— Remarks ——
      if (result.remarks) {
        const remarksH = 32;
        drawRoundedRect(doc, margin, y, contentW, remarksH, 3, {
          fill: '#FAFBFC',
          stroke: LINE,
        });
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(NAVY);
        doc.text('REMARKS', margin + 10, y + 6, { lineBreak: false });
        doc.font('Helvetica').fontSize(8.5).fillColor('#222222');
        doc.text(fitText(doc, String(result.remarks), contentW - 20), margin + 10, y + 17, {
          width: contentW - 20,
          lineBreak: false,
        });
        y += remarksH + 8;
      }

      // —— Grade key (compact) ——
      doc.font('Helvetica').fontSize(6.5).fillColor(MUTED);
      doc.text(
        'Grading: A+ ≥95  ·  A ≥85  ·  B ≥75  ·  C ≥60  ·  D ≥50  ·  F <50    |    Subject fail below 33%',
        margin,
        y,
        { width: contentW, align: 'center', lineBreak: false }
      );
      y += 14;

      // —— Signatures (pinned above footer) ——
      const sigBlockH = 52;
      // Keep signatures above the branded footer; float down when content is short
      const sigY = Math.min(y + 6, pageH - footerReserve - sigBlockH - 8);
      const sigW = 150;
      const leftSigX = margin + 10;
      const rightSigX = margin + contentW - 10 - sigW;

      doc
        .moveTo(leftSigX, sigY + 22)
        .lineTo(leftSigX + sigW, sigY + 22)
        .strokeColor(LINE_STRONG)
        .lineWidth(0.7)
        .stroke();
      doc.font('Helvetica-Bold').fontSize(8).fillColor(NAVY);
      doc.text('Controller of Examinations', leftSigX, sigY + 28, {
        width: sigW,
        align: 'center',
        lineBreak: false,
      });
      doc.font('Helvetica').fontSize(7).fillColor(MUTED);
      doc.text(ACADEMY_BRAND.name, leftSigX, sigY + 40, {
        width: sigW,
        align: 'center',
        lineBreak: false,
      });

      doc
        .moveTo(rightSigX, sigY + 22)
        .lineTo(rightSigX + sigW, sigY + 22)
        .strokeColor(LINE_STRONG)
        .lineWidth(0.7)
        .stroke();
      doc.font('Helvetica-Bold').fontSize(8).fillColor(NAVY);
      doc.text('Principal', rightSigX, sigY + 28, {
        width: sigW,
        align: 'center',
        lineBreak: false,
      });
      doc.font('Helvetica').fontSize(7).fillColor(MUTED);
      doc.text(ACADEMY_BRAND.name, rightSigX, sigY + 40, {
        width: sigW,
        align: 'center',
        lineBreak: false,
      });

      // —— Footer ——
      doc.save();
      doc.rect(0, pageH - 22, pageW, 22).fill(NAVY);
      doc.rect(0, pageH - 24, pageW, 2).fill(GOLD);
      doc.restore();
      doc.fillColor(WHITE).font('Helvetica').fontSize(7);
      doc.text(
        `${ACADEMY_BRAND.legalName || ACADEMY_BRAND.name}  ·  Generated ${formatDate(new Date())}  ·  Confidential`,
        margin,
        pageH - 14,
        { width: contentW, align: 'center', lineBreak: false }
      );

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { renderResultCardPdf };
