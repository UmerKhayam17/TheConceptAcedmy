const PDFDocument = require('pdfkit');
const { ACADEMY_BRAND, resolveLogoPath } = require('../../config/academyBrand');
const {
  drawPdfLetterheadPlain,
  drawPdfTitlePlain,
} = require('./academyReportDocument');
const { assessmentTypeLabel } = require('../../config/assessmentTaxonomy');
const classTestService = require('./academyClassTestService');
const Exam = require('../../models/Exam');
const Result = require('../../models/Result');
const AcademyStudent = require('../../models/academy/AcademyStudent');
const AcademyClassTest = require('../../models/academy/AcademyClassTest');
const AcademyAssessment = require('../../models/academy/AcademyAssessment');
const ApiError = require('../../utils/ApiError');
const { isEnrolledInSubject } = require('./studentEnrollment');
const { letterGrade } = require('../exam/examGrading');
const { renderResultCardPdf } = require('../pdfService');

const LINE = '#000000';
const GRAY = '#D0D0D0';
const FAIL_PCT = 33;
const OVERALL_FAIL_PCT = 50;
/** Highlight cells at or below this share of subject total (matches sample sheet). */
const LOW_MARK_PCT = 40;

function formatDate(value) {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  const d = String(dt.getDate()).padStart(2, '0');
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${dt.getFullYear()}`;
}

/** Whole-number % like the Excel marksheet (48%, not 48.0%). */
function pctOf(obtained, total) {
  const t = Number(total) || 0;
  if (!t) return 0;
  return Math.round(((Number(obtained) || 0) / t) * 100);
}

function normalizeLabel(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[#.]/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Batch key so peer subject tests group into one marksheet:
 * - "Test No. 1" / "Test No1" across subjects
 * - Same seriesLabel + occurrenceIndex (e.g. Weekly Test week 1 for every subject)
 * - Exact same title otherwise
 */
function testBatchKey(test) {
  const title = normalizeLabel(test.title);
  const series = normalizeLabel(test.seriesLabel);
  const numbered =
    title.match(/\btest\s*(?:no|number)?\s*(\d+)\b/) ||
    series.match(/\btest\s*(?:no|number)?\s*(\d+)\b/);
  if (numbered) return `test-no-${numbered[1]}`;
  if (series && test.occurrenceIndex != null) {
    return `${series}::occ-${test.occurrenceIndex}`;
  }
  return title || series;
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

function rollOf(student) {
  return String(student?.rollNumber || student?.studentId || '').trim();
}

function nameOf(student) {
  return String(student?.studentName || '')
    .trim()
    .toUpperCase();
}

function studentCodeOf(student) {
  return String(student?.studentId || student?.rollNumber || '').trim();
}

function sortStudents(students) {
  return [...students].sort((a, b) => {
    const ra = rollOf(a);
    const rb = rollOf(b);
    if (ra && rb && ra !== rb) return ra.localeCompare(rb, undefined, { numeric: true });
    return nameOf(a).localeCompare(nameOf(b));
  });
}

function matricPctOf(student) {
  const hist = Array.isArray(student?.academicHistory) ? student.academicHistory : [];
  if (!hist.length) return '';
  const scored = hist.filter(
    (h) =>
      h &&
      (h.percentage != null ||
        (h.totalMarks != null && h.obtainedMarks != null && Number(h.totalMarks) > 0))
  );
  if (!scored.length) return '';
  const matric =
    scored.find((h) =>
      /matric|ssc|secondary|10th|tenth/i.test(
        `${h.className || ''} ${h.institutionName || ''}`
      )
    ) || scored[scored.length - 1];
  if (matric.percentage != null && Number.isFinite(Number(matric.percentage))) {
    return String(Math.round(Number(matric.percentage) * 10) / 10);
  }
  return String(pctOf(matric.obtainedMarks, matric.totalMarks));
}

function isAbsent(remarks) {
  return String(remarks || '')
    .toLowerCase()
    .includes('absent');
}

function isFailMark(obtained, total, remarks) {
  if (isAbsent(remarks)) return true;
  if (obtained == null || obtained === '') return false;
  const t = Number(total) || 0;
  const o = Number(obtained);
  if (Number.isNaN(o)) return true;
  if (t <= 0) return false;
  return (o / t) * 100 < FAIL_PCT;
}

function shouldHighlightMark(obtained, total, remarks) {
  if (isAbsent(remarks)) return true;
  if (obtained == null || obtained === '') return false;
  const o = Number(obtained);
  const t = Number(total) || 0;
  if (Number.isNaN(o)) return true;
  if (o === 0) return true;
  if (t > 0 && (o / t) * 100 <= LOW_MARK_PCT) return true;
  return isFailMark(obtained, total, remarks);
}

function overallResultLabel({ percentage, grade, subjectCells }) {
  const g = String(grade || '').toUpperCase();
  const pct = Number(percentage) || 0;
  if (g === 'F' || pct < OVERALL_FAIL_PCT) return 'Fail';
  if ((subjectCells || []).some((c) => c && isFailMark(c.obtained, c.total, c.remarks))) {
    return 'Fail';
  }
  if ((subjectCells || []).some((c) => c && isAbsent(c.remarks))) return 'Fail';
  return 'Pass';
}

function drawCell(doc, text, x, y, w, h, opts = {}) {
  const {
    align = 'center',
    bold = false,
    fontSize = 7,
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

function bufferFromDoc(build, { layout = 'landscape', margin = 18 } = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout,
        margin,
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

/**
 * Centered letterhead (same as paid-fee reports) + award-list style detail fields:
 * program bar, subjects, total/pass marks, examiner/invigilator, test/exam + date.
 */
function drawReportHeader(doc, meta, margin = 36, contentW) {
  const usableW = contentW != null ? contentW : doc.page.width - margin * 2;
  const logoPath = resolveLogoPath();
  let y = drawPdfLetterheadPlain(doc, ACADEMY_BRAND, logoPath);
  y = drawPdfTitlePlain(
    doc,
    {
      title: meta.title || 'MARKS REPORT',
      sessionLabel: meta.sessionLabel || '',
      leftFilter: '',
      centerFilter: meta.examLabel || meta.subtitle || '',
      rightFilter: '',
    },
    y
  );

  const barH = 16;
  doc.save();
  doc.rect(margin, y, usableW, barH).fill(GRAY);
  doc.restore();
  doc.rect(margin, y, usableW, barH).strokeColor(LINE).lineWidth(0.8).stroke();
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#000');
  const programText = meta.disciplineLabel
    ? `Program/Class/Section/Discipline : ${meta.programLabel || '—'}`
    : `Program/Class/Section : ${meta.programLabel || '—'}`;
  doc.text(fitText(doc, programText, usableW - 12), margin + 6, y + 4, { lineBreak: false });
  y += barH + 8;

  const rowGap = 14;
  const leftW = usableW * 0.42;
  const midX = margin + leftW + 8;
  const midW = usableW * 0.28;
  const rightX = midX + midW + 8;
  const rightW = usableW - (leftW + midW + 16);
  const subjectsText =
    meta.subjectsLabel ||
    meta.subjectName ||
    String(meta.subjectLabel || '').replace(/^Subject:\s*/i, '') ||
    '';
  const totalMarks =
    meta.totalMarks != null && meta.totalMarks !== ''
      ? String(meta.totalMarks)
      : '';
  const passMarks =
    meta.passMarks != null && meta.passMarks !== '' ? String(meta.passMarks) : '';

  drawHeaderField(doc, 'Subject: ', subjectsText, margin, y, leftW);
  drawHeaderField(doc, 'Total Marks: ', totalMarks, midX, y, midW);
  drawHeaderField(doc, 'Pass Marks: ', passMarks, rightX, y, rightW);
  y += rowGap;

  if (meta.disciplineLabel) {
    drawHeaderField(doc, 'Discipline: ', meta.disciplineLabel, margin, y, usableW);
    y += rowGap;
  }

  const half = (usableW - 10) / 2;
  drawHeaderField(doc, "Examiner's Name: ", meta.examinerName || '', margin, y, half);
  drawHeaderField(
    doc,
    "Invigilator's Name: ",
    meta.invigilatorName || '',
    margin + half + 10,
    y,
    half
  );
  y += rowGap;

  const typeLabel = meta.testTypeLabel || meta.examTypeLabel || 'Test';
  const typeValue =
    meta.testNumber != null && meta.testNumber !== ''
      ? String(meta.testNumber)
      : meta.examLabel || '';
  const dateValue = meta.testDate || meta.dateLabel || '';
  drawHeaderField(doc, `${typeLabel}: `, typeValue, margin, y, half);
  drawHeaderField(doc, 'Test Date: ', dateValue, margin + half + 10, y, half);
  y += rowGap + 2;

  doc
    .moveTo(margin, y)
    .lineTo(margin + usableW, y)
    .strokeColor(LINE)
    .lineWidth(1.4)
    .stroke();
  return y + 6;
}

/**
 * Excel-style class marksheet (matches academy Test/Exam result sheet):
 * Row1: Subject | Biology | … | Total | Result
 * Row2: Total Marks | 25 | … | 175 |
 * Row3: Sr.# | Student Id | Name | Matric % | O.M | %age | … | Obtained | %age |
 */
function renderClassMarksheetPdf(payload) {
  const { meta, subjects, rows } = payload;
  if (!subjects.length) throw new ApiError(400, 'No subjects to print');
  if (!rows.length) throw new ApiError(400, 'No students to print');

  return bufferFromDoc((doc) => {
    const margin = 12;
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const contentW = pageW - margin * 2;
    const hSubject = 16;
    const hTotalMarks = 14;
    const hCols = 14;
    const headerH = hSubject + hTotalMarks + hCols;
    const rowH = 14;
    const footerH = 22;

    const srW = 24;
    const idW = Math.min(86, Math.max(70, contentW * 0.11));
    const nameW = Math.min(120, Math.max(90, contentW * 0.14));
    const matricW = 40;
    const totalOmW = 44;
    const totalPctW = 40;
    const resultW = 40;
    const identityW = srW + idW + nameW + matricW;
    const fixedRight = totalOmW + totalPctW + resultW;
    const subjectBudget = Math.max(70, contentW - identityW - fixedRight);
    const perSubject = subjectBudget / subjects.length;
    const omW = perSubject * 0.52;
    const pctW = perSubject - omW;
    const marksSum = subjects.reduce((s, sub) => s + (Number(sub.total) || 0), 0);
    const fs = subjects.length > 6 ? 5.5 : subjects.length > 4 ? 6 : 6.5;

    function drawTableHeader(y) {
      let x = margin;

      // —— Row 1: Subject | subject names | Total | Result ——
      drawCell(doc, 'Subject', x, y, identityW, hSubject, {
        bold: true,
        fontSize: 7,
        fill: GRAY,
      });
      x += identityW;
      subjects.forEach((sub) => {
        const sw = omW + pctW;
        drawCell(doc, sub.name, x, y, sw, hSubject, { bold: true, fontSize: fs, fill: GRAY });
        x += sw;
      });
      drawCell(doc, 'Total', x, y, totalOmW + totalPctW, hSubject, {
        bold: true,
        fontSize: 7,
        fill: GRAY,
      });
      x += totalOmW + totalPctW;
      drawCell(doc, 'Result', x, y, resultW, headerH, {
        bold: true,
        fontSize: 7,
        fill: GRAY,
      });

      // —— Row 2: Total Marks | per-subject totals | grand total ——
      x = margin;
      const y2 = y + hSubject;
      drawCell(doc, 'Total Marks', x, y2, identityW, hTotalMarks, {
        bold: true,
        fontSize: 6.5,
        fill: GRAY,
      });
      x += identityW;
      subjects.forEach((sub) => {
        drawCell(doc, String(sub.total), x, y2, omW + pctW, hTotalMarks, {
          bold: true,
          fontSize: fs,
          fill: GRAY,
        });
        x += omW + pctW;
      });
      drawCell(doc, String(marksSum), x, y2, totalOmW + totalPctW, hTotalMarks, {
        bold: true,
        fontSize: 7,
        fill: GRAY,
      });

      // —— Row 3: identity + O.M / %age ——
      x = margin;
      const y3 = y2 + hTotalMarks;
      const identityCols = [
        { label: 'Sr. #', w: srW },
        { label: 'Student Id', w: idW },
        { label: 'Student Name', w: nameW },
        { label: 'Matric %', w: matricW },
      ];
      identityCols.forEach((c) => {
        drawCell(doc, c.label, x, y3, c.w, hCols, { bold: true, fontSize: fs, fill: GRAY });
        x += c.w;
      });
      subjects.forEach(() => {
        drawCell(doc, 'O.M', x, y3, omW, hCols, { bold: true, fontSize: fs, fill: GRAY });
        drawCell(doc, '%age', x + omW, y3, pctW, hCols, {
          bold: true,
          fontSize: fs,
          fill: GRAY,
        });
        x += omW + pctW;
      });
      drawCell(doc, 'Obtained', x, y3, totalOmW, hCols, {
        bold: true,
        fontSize: fs,
        fill: GRAY,
      });
      x += totalOmW;
      drawCell(doc, '%age', x, y3, totalPctW, hCols, {
        bold: true,
        fontSize: fs,
        fill: GRAY,
      });

      return y + headerH;
    }

    function drawDataRow(y, sr, row) {
      let x = margin;
      const student = row.student;
      drawCell(doc, String(sr), x, y, srW, rowH, { fontSize: fs });
      x += srW;
      drawCell(doc, studentCodeOf(student), x, y, idW, rowH, { fontSize: fs - 0.5 });
      x += idW;
      drawCell(doc, nameOf(student), x, y, nameW, rowH, { align: 'left', fontSize: fs });
      x += nameW;
      drawCell(doc, matricPctOf(student), x, y, matricW, rowH, { fontSize: fs });
      x += matricW;

      let obtainedSum = 0;
      let markedTotalSum = 0;
      let enrolledCount = 0;
      let completedCount = 0;
      let anyMarked = false;

      subjects.forEach((sub, i) => {
        const cell = row.cells[i];
        if (!cell) {
          // Not enrolled in this subject — blank cell, ignore in totals
          drawCell(doc, '', x, y, omW, rowH, { fontSize: fs });
          drawCell(doc, '', x + omW, y, pctW, rowH, { fontSize: fs });
          x += omW + pctW;
          return;
        }
        const total = Number(cell.total ?? sub.total) || 0;
        const absent = isAbsent(cell.remarks);
        const hasMark = cell.obtained != null && cell.obtained !== '';
        const omText = absent ? 'Absent' : hasMark ? String(cell.obtained) : '';
        const pct = absent ? 0 : hasMark ? pctOf(cell.obtained, total) : '';
        const highlight =
          hasMark || absent
            ? shouldHighlightMark(cell.obtained, total, cell.remarks)
            : false;
        drawCell(doc, omText, x, y, omW, rowH, {
          fontSize: fs,
          fill: highlight ? GRAY : null,
        });
        drawCell(doc, pct === '' ? '' : `${pct}%`, x + omW, y, pctW, rowH, {
          fontSize: fs,
          fill: highlight ? GRAY : null,
        });
        x += omW + pctW;

        enrolledCount += 1;
        if (hasMark || absent) {
          anyMarked = true;
          completedCount += 1;
          obtainedSum += absent ? 0 : Number(cell.obtained) || 0;
          markedTotalSum += total;
        }
      });

      // Pass/Fail only when every enrolled subject on this sheet is completed.
      // Partial entry → provisional % from marked subjects only; Result stays blank
      // (avoids false Pass on one subject and false Fail from blank columns).
      const sheetComplete =
        enrolledCount > 0 && completedCount === enrolledCount;

      const useStoredTotals =
        sheetComplete &&
        row.marksTotal != null &&
        row.obtainedTotal != null;

      const marksTotal = useStoredTotals
        ? Number(row.marksTotal)
        : anyMarked
          ? markedTotalSum
          : 0;
      const obtainedTotal = useStoredTotals
        ? Number(row.obtainedTotal)
        : anyMarked
          ? obtainedSum
          : null;
      const percentage =
        useStoredTotals && row.percentage != null
          ? Math.round(Number(row.percentage))
          : obtainedTotal != null && marksTotal > 0
            ? pctOf(obtainedTotal, marksTotal)
            : null;

      const result =
        row.result ||
        (sheetComplete && percentage != null
          ? overallResultLabel({
              percentage,
              grade: row.grade,
              subjectCells: row.cells,
            })
          : '');
      const isFail = result === 'Fail';

      drawCell(
        doc,
        obtainedTotal == null ? '' : String(obtainedTotal),
        x,
        y,
        totalOmW,
        rowH,
        { fontSize: fs, bold: true }
      );
      x += totalOmW;
      drawCell(doc, percentage == null ? '' : `${percentage}%`, x, y, totalPctW, rowH, {
        fontSize: fs,
        bold: true,
      });
      x += totalPctW;
      drawCell(doc, result, x, y, resultW, rowH, {
        fontSize: fs,
        bold: true,
        fill: result ? GRAY : null,
        textColor: isFail ? '#B91C1C' : '#000',
      });
    }

    const headerMeta = {
      ...meta,
      subjectsLabel:
        meta.subjectsLabel ||
        subjects.map((s) => s.name).filter(Boolean).join(', '),
      totalMarks:
        meta.totalMarks != null && meta.totalMarks !== ''
          ? meta.totalMarks
          : String(marksSum),
    };

    let y = drawReportHeader(doc, headerMeta, margin, contentW);
    y = drawTableHeader(y);
    const usableBottom = pageH - margin - footerH;
    let sr = 1;
    for (const row of rows) {
      if (y + rowH > usableBottom) {
        doc.addPage();
        y = drawReportHeader(doc, headerMeta, margin, contentW);
        y = drawTableHeader(y);
      }
      drawDataRow(y, sr++, row);
      y += rowH;
    }

    y = Math.max(y + 8, pageH - margin - 16);
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor('#5A6A7A')
      .text(
        `Generated ${formatDate(new Date())}  ·  ${studentsLabel(rows.length)}  ·  ${ACADEMY_BRAND.name}`,
        margin,
        y,
        { width: contentW, align: 'center' }
      );
  });
}

function studentsLabel(n) {
  return `${n} student${n === 1 ? '' : 's'}`;
}

async function loadExamWithResults(examId) {
  const exam = await Exam.findById(examId)
    .populate('academyClass', 'className')
    .populate('sectionId', 'sectionName')
    .populate('disciplineId', 'name code')
    .populate('dateSheet.subject', 'subjectName subjectCode')
    .lean();
  if (!exam) throw new ApiError(404, 'Exam not found');

  const studentQ = { classId: exam.academyClass?._id || exam.academyClass, status: 'active' };
  if (exam.sectionId) studentQ.sectionId = exam.sectionId?._id || exam.sectionId;
  if (exam.disciplineId) studentQ.disciplineId = exam.disciplineId?._id || exam.disciplineId;

  const [students, results] = await Promise.all([
    AcademyStudent.find(studentQ)
      .select(
        'studentId studentName fatherName rollNumber sectionId disciplineId academicHistory isFullPackage selectedSubjects'
      )
      .lean(),
    Result.find({ exam: examId })
      .populate('subjectMarks.subject', 'subjectName subjectCode')
      .lean(),
  ]);

  const resultByStudent = {};
  results.forEach((r) => {
    resultByStudent[String(r.academyStudent)] = r;
  });

  return { exam, students: sortStudents(students), resultByStudent };
}

function examProgramLabel(exam) {
  const className =
    typeof exam.academyClass === 'object' && exam.academyClass
      ? exam.academyClass.className
      : '';
  const sectionName =
    typeof exam.sectionId === 'object' && exam.sectionId ? exam.sectionId.sectionName : '';
  const disciplineName =
    typeof exam.disciplineId === 'object' && exam.disciplineId
      ? exam.disciplineId.name
      : '';
  return [className, sectionName, disciplineName].filter(Boolean).join(' · ') || '—';
}

function dateSheetSubjects(exam, subjectId) {
  const papers = (exam.dateSheet || []).filter((p) => p.subject);
  let list = papers.map((p) => {
    const sub = p.subject;
    const id = String(sub?._id || sub);
    const name =
      typeof sub === 'object' && sub ? String(sub.subjectName || sub.subjectCode || 'Subject') : 'Subject';
    const total = Number(p.totalMarks);
    return {
      id,
      name,
      total: Number.isFinite(total) && total > 0 ? total : 100,
    };
  });
  if (subjectId) {
    list = list.filter((s) => s.id === String(subjectId));
  }
  return list;
}

function buildExamRows(students, subjects, resultByStudent, { subjectOnly = false } = {}) {
  return students
    .filter((stu) => {
      if (!subjects.length) return true;
      if (subjectOnly && subjects.length === 1) {
        return isEnrolledInSubject(stu, subjects[0].id);
      }
      return subjects.some((s) => isEnrolledInSubject(stu, s.id));
    })
    .map((student) => {
      const result = resultByStudent[String(student._id)];
      const markBySubject = {};
      (result?.subjectMarks || []).forEach((sm) => {
        const sid = String(sm.subject?._id || sm.subject);
        markBySubject[sid] = sm;
      });
      const cells = subjects.map((sub) => {
        if (!isEnrolledInSubject(student, sub.id)) return null;
        const sm = markBySubject[sub.id];
        if (!sm) return { obtained: null, total: sub.total, remarks: '' };
        return {
          obtained: sm.obtained,
          total: sm.total != null ? sm.total : sub.total,
          remarks: sm.remarks || '',
        };
      });
      return {
        student,
        cells,
        obtainedTotal: result?.obtainedMarks,
        marksTotal: result?.totalMarks,
        percentage: result?.percentage,
        grade: result?.grade,
      };
    });
}

/**
 * @param {'exam'|'subject'|'student'} view
 */
async function renderExamMarksReportPdf(examId, { view = 'exam', subjectId, studentId } = {}) {
  const mode = String(view || 'exam').toLowerCase();
  const { exam, students, resultByStudent } = await loadExamWithResults(examId);
  const programLabel = examProgramLabel(exam);
  const examLabel = [exam.title, exam.type, exam.sessionLabel].filter(Boolean).join(' · ');

  if (mode === 'student') {
    return renderExamStudentWisePdf(exam, students, resultByStudent, studentId);
  }

  const subjects = dateSheetSubjects(exam, mode === 'subject' ? subjectId : undefined);
  if (!subjects.length) {
    throw new ApiError(
      400,
      mode === 'subject'
        ? 'Subject not found on this exam date sheet'
        : 'No subjects on this exam date sheet yet'
    );
  }
  if (mode === 'subject' && !subjectId && subjects.length !== 1) {
    throw new ApiError(400, 'subjectId is required for subject-wise report');
  }

  const rows = buildExamRows(students, subjects, resultByStudent, {
    subjectOnly: mode === 'subject',
  });
  if (!rows.length) throw new ApiError(400, 'No students enrolled for this report');

  const subjectsLabel = subjects.map((s) => s.name).filter(Boolean).join(', ');
  const totalMarks = subjects.reduce((sum, s) => sum + (Number(s.total) || 0), 0);

  return renderClassMarksheetPdf({
    meta: {
      title: mode === 'subject' ? 'SUBJECT-WISE MARKS REPORT' : 'EXAMINATION RESULT SHEET',
      programLabel,
      examLabel: [exam.title, exam.type].filter(Boolean).join(' · '),
      subjectsLabel,
      totalMarks: String(totalMarks),
      testTypeLabel: exam.type || 'Exam',
      testNumber: exam.title || '',
      testDate: formatDate(exam.startDate),
      sessionLabel: exam.sessionLabel || '',
    },
    subjects,
    rows,
  });
}

async function renderExamStudentWisePdf(exam, students, resultByStudent, studentId) {
  let list = students;
  if (studentId) {
    list = students.filter((s) => String(s._id) === String(studentId));
    if (!list.length) throw new ApiError(404, 'Student not found for this exam');
  }
  const withResults = list.filter((s) => resultByStudent[String(s._id)]);
  if (!withResults.length) {
    throw new ApiError(400, 'No result cards to print — enter marks first');
  }

  // Single student → polished result card; many students → compact multi-page report
  if (withResults.length === 1) {
    const student = withResults[0];
    const result = resultByStudent[String(student._id)];
    return renderResultCardPdf({
      ...result,
      academyStudent: student,
      exam: {
        ...exam,
        academyClass: exam.academyClass,
        sectionId: exam.sectionId,
      },
    });
  }

  return bufferFromDoc(
    (doc) => {
      const margin = 36;
      const contentW = doc.page.width - margin * 2;
      let first = true;

      withResults.forEach((student) => {
        if (!first) doc.addPage();
        first = false;
        const result = resultByStudent[String(student._id)];
        const subjects = Array.isArray(result.subjectMarks) ? result.subjectMarks : [];
        const resultLabel = overallResultLabel({
          percentage: result.percentage,
          grade: result.grade,
          subjectCells: subjects.map((sm) => ({
            obtained: sm.obtained,
            total: sm.total,
            remarks: sm.remarks,
          })),
        });
        const isFail = resultLabel === 'Fail';

        const subjectNames = subjects
          .map((sm) =>
            typeof sm.subject === 'object' && sm.subject
              ? sm.subject.subjectName || sm.subject.subjectCode
              : ''
          )
          .filter(Boolean)
          .join(', ');
        const totalMarks = subjects.reduce(
          (sum, sm) => sum + (Number(sm.total) || 0),
          0
        );
        let y = drawReportHeader(
          doc,
          {
            title: 'STUDENT-WISE EXAM REPORT',
            programLabel: examProgramLabel(exam),
            examLabel: [exam.title, exam.type].filter(Boolean).join(' · '),
            subjectsLabel: subjectNames,
            totalMarks: String(totalMarks || result.totalMarks || ''),
            testTypeLabel: exam.type || 'Exam',
            testNumber: exam.title || '',
            testDate: formatDate(exam.startDate),
            sessionLabel: exam.sessionLabel || '',
          },
          margin,
          contentW
        );

        const boxH = 70;
        doc.rect(margin, y, contentW, boxH).strokeColor(LINE).lineWidth(0.8).stroke();
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
        doc.text(`Student Name: ${nameOf(student)}`, margin + 10, y + 10);
        doc.text(`Student ID: ${studentCodeOf(student) || '—'}`, margin + contentW / 2, y + 10);
        doc.font('Helvetica').fontSize(9);
        doc.text(`Father Name: ${student.fatherName || '—'}`, margin + 10, y + 28);
        doc.text(
          `Class: ${examProgramLabel(exam)}`,
          margin + contentW / 2,
          y + 28
        );
        doc.text(
          `Position: ${result.position != null ? result.position : '—'}`,
          margin + 10,
          y + 46
        );
        doc.text(
          `Grade / GPA: ${result.grade || '—'} / ${result.gpa != null ? Number(result.gpa).toFixed(1) : '—'}`,
          margin + contentW / 2,
          y + 46
        );
        y += boxH + 14;

        const headers = ['Sr. #', 'Subject', 'Total', 'O.M', '%age', 'Grade'];
        const colWs = [36, contentW - 36 - 60 - 55 - 55 - 55, 60, 55, 55, 55];
        const rowH = 20;
        let x = margin;
        headers.forEach((h, i) => {
          drawCell(doc, h, x, y, colWs[i], 22, { bold: true, fontSize: 8, fill: GRAY });
          x += colWs[i];
        });
        y += 22;

        subjects.forEach((sm, idx) => {
          if (y + rowH > doc.page.height - 80) {
            doc.addPage();
            y = margin;
          }
          const absent = isAbsent(sm.remarks);
          const omText = absent ? 'Absent' : sm.obtained != null ? String(sm.obtained) : '—';
          const pct = absent ? 0 : pctOf(sm.obtained, sm.total);
          const fail = isFailMark(sm.obtained, sm.total, sm.remarks);
          const subName =
            typeof sm.subject === 'object' && sm.subject
              ? sm.subject.subjectName || sm.subject.subjectCode || 'Subject'
              : 'Subject';
          const vals = [
            String(idx + 1),
            subName,
            String(sm.total ?? '—'),
            omText,
            `${pct}%`,
            sm.grade || letterGrade(pct),
          ];
          x = margin;
          vals.forEach((text, i) => {
            drawCell(doc, text, x, y, colWs[i], rowH, {
              bold: i === 1,
              fontSize: 8,
              fill: fail && i >= 3 ? GRAY : null,
              align: i === 1 ? 'left' : 'center',
            });
            x += colWs[i];
          });
          y += rowH;
        });

        y += 10;
        const summary = [
          { label: 'Total', value: String(result.totalMarks ?? '') },
          { label: 'Obtained', value: String(result.obtainedMarks ?? '') },
          {
            label: '%age',
            value:
              result.percentage != null
                ? `${Math.round(Number(result.percentage) * 10) / 10}%`
                : '',
          },
          { label: 'Result', value: resultLabel },
        ];
        const sw = contentW / summary.length;
        summary.forEach((c, i) => {
          drawCell(doc, `${c.label}: ${c.value}`, margin + i * sw, y, sw, 24, {
            bold: true,
            fontSize: 9,
            fill: c.label === 'Result' ? GRAY : null,
            textColor: c.label === 'Result' && isFail ? '#B91C1C' : '#000',
          });
        });
      });
    },
    { layout: 'portrait', margin: 36 }
  );
}

/**
 * Find all subject tests in the same class that belong to the same batch
 * (e.g. every subject's "Test No. 1") so the marksheet matches the Excel layout.
 */
async function findPeerSubjectTests(test) {
  const classId = test.classId?._id || test.classId;
  const sectionId = test.sectionId?._id || test.sectionId || null;
  const disciplineId = test.disciplineId?._id || test.disciplineId || null;
  const batch = testBatchKey(test);
  if (!classId || !batch) return [test];

  const q = { classId };
  if (sectionId) q.sectionId = sectionId;
  if (disciplineId) q.disciplineId = disciplineId;

  const peers = await AcademyClassTest.find(q)
    .populate('subjectId', 'subjectName subjectCode')
    .populate('classId', 'className')
    .populate('sectionId', 'sectionName')
    .populate('disciplineId', 'name code')
    .lean();

  const matched = peers.filter((t) => testBatchKey(t) === batch);
  if (!matched.length) return [test];

  // One column per subject (prefer earliest examDate if duplicates)
  const bySubject = new Map();
  matched.forEach((t) => {
    const sid = String(t.subjectId?._id || t.subjectId || '');
    if (!sid) return;
    const prev = bySubject.get(sid);
    if (!prev) {
      bySubject.set(sid, t);
      return;
    }
    const prevTime = new Date(prev.examDate || 0).getTime();
    const nextTime = new Date(t.examDate || 0).getTime();
    if (nextTime < prevTime) bySubject.set(sid, t);
  });

  return [...bySubject.values()].sort((a, b) => {
    const na =
      typeof a.subjectId === 'object' && a.subjectId
        ? a.subjectId.subjectName || ''
        : '';
    const nb =
      typeof b.subjectId === 'object' && b.subjectId
        ? b.subjectId.subjectName || ''
        : '';
    return na.localeCompare(nb);
  });
}

/**
 * Class-test reports: test-wise (all subjects in the batch) / subject-wise / student-wise.
 * @param {'test'|'subject'|'student'} view
 */
async function renderClassTestMarksReportPdf(
  testId,
  actor,
  sessionId,
  { view = 'test', studentId, studentIds } = {}
) {
  const mode = String(view || 'test').toLowerCase();
  const entry = await classTestService.getClassTestMarksEntry(testId, actor, sessionId);
  const { test } = entry;
  const className =
    typeof test.classId === 'object' && test.classId ? test.classId.className : '';
  const sectionName =
    typeof test.sectionId === 'object' && test.sectionId ? test.sectionId.sectionName : '';
  const subjectName =
    typeof test.subjectId === 'object' && test.subjectId ? test.subjectId.subjectName : '';
  const disciplineName =
    typeof test.disciplineId === 'object' && test.disciplineId
      ? String(test.disciplineId.name || '').trim()
      : '';
  const programLabel = [className, sectionName, disciplineName].filter(Boolean).join(' · ') || '—';
  const total = Number(test.totalMarks) || 0;
  const subjectId = String(test.subjectId?._id || test.subjectId || '');

  const studentIdFilter = new Set(
    [
      ...(studentId ? [String(studentId)] : []),
      ...(Array.isArray(studentIds)
        ? studentIds.map(String)
        : String(studentIds || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)),
    ].filter(Boolean)
  );

  if (mode === 'student') {
    // Combine peer subjects in the same test batch (e.g. Test No. 1 Chemistry + Biology).
    const peerTests = await findPeerSubjectTests(test);
    const subjects = peerTests.map((t) => {
      const sid = String(t.subjectId?._id || t.subjectId || '');
      const name =
        typeof t.subjectId === 'object' && t.subjectId
          ? t.subjectId.subjectName || t.subjectId.subjectCode || 'Subject'
          : sid === subjectId
            ? subjectName || 'Subject'
            : 'Subject';
      return {
        id: sid || 'subject',
        name,
        total: Number(t.totalMarks) || total || 0,
        testId: String(t._id),
        examDate: t.examDate,
      };
    });
    const testIds = subjects.map((s) => s.testId).filter(Boolean);
    const assessments = await AcademyAssessment.find({ classTestId: { $in: testIds } }).lean();
    const markByTestStudent = {};
    assessments.forEach((a) => {
      markByTestStudent[`${a.classTestId}:${a.studentId}`] = a;
    });

    const classId = test.classId?._id || test.classId;
    const sectionRef = test.sectionId?._id || test.sectionId;
    const disciplineRef = test.disciplineId?._id || test.disciplineId;
    const studentQ = { classId, status: 'active' };
    if (sectionRef) studentQ.sectionId = sectionRef;
    if (disciplineRef) studentQ.disciplineId = disciplineRef;
    const allStudents = await AcademyStudent.find(studentQ)
      .select(
        'studentId studentName fatherName rollNumber sectionId disciplineId academicHistory isFullPackage selectedSubjects'
      )
      .lean();

    let students = sortStudents(
      allStudents.filter((stu) => subjects.some((s) => isEnrolledInSubject(stu, s.id)))
    );
    if (studentIdFilter.size) {
      students = students.filter((s) => studentIdFilter.has(String(s._id)));
    }

    let rows = students.map((student) => {
      const subjectRows = subjects
        .filter((sub) => isEnrolledInSubject(student, sub.id))
        .map((sub) => {
          const a = markByTestStudent[`${sub.testId}:${student._id}`];
          return {
            subjectName: sub.name,
            obtained: a ? a.obtainedMarks : null,
            total: a && a.totalMarks != null ? a.totalMarks : sub.total,
            remarks: a ? a.remarks || '' : '',
            hasMark: Boolean(a),
          };
        });
      return { student, subjectRows };
    });
    // Keep only subjects with entered marks so selective students aren't scored against empty peers.
    rows = rows
      .map((r) => ({
        ...r,
        subjectRows: r.subjectRows.filter((c) => c.hasMark),
      }))
      .filter((r) => r.subjectRows.length);
    if (!rows.length) throw new ApiError(400, 'No students to print');

    return renderClassTestStudentWisePdf(test, rows, {
      programLabel,
      disciplineLabel: disciplineName,
      subjectName: subjectName || '',
    });
  }

  // Subject-wise → only this test's subject. Test-wise → all peer subjects (Test No. 1 style).
  const peerTests =
    mode === 'subject' ? [test] : await findPeerSubjectTests(test);
  const subjects = peerTests.map((t) => {
    const sid = String(t.subjectId?._id || t.subjectId || '');
    const name =
      typeof t.subjectId === 'object' && t.subjectId
        ? t.subjectId.subjectName || t.subjectId.subjectCode || 'Subject'
        : sid === subjectId
          ? subjectName || 'Subject'
          : 'Subject';
    return {
      id: sid || 'subject',
      name,
      total: Number(t.totalMarks) || total || 0,
      testId: String(t._id),
    };
  });

  const testIds = subjects.map((s) => s.testId).filter(Boolean);
  const assessments = await AcademyAssessment.find({ classTestId: { $in: testIds } }).lean();
  const markByTestStudent = {};
  assessments.forEach((a) => {
    markByTestStudent[`${a.classTestId}:${a.studentId}`] = a;
  });

  // Union of enrolled students across peer subjects
  const classId = test.classId?._id || test.classId;
  const sectionRef = test.sectionId?._id || test.sectionId;
  const disciplineRef = test.disciplineId?._id || test.disciplineId;
  const studentQ = { classId, status: 'active' };
  if (sectionRef) studentQ.sectionId = sectionRef;
  if (disciplineRef) studentQ.disciplineId = disciplineRef;
  const allStudents = await AcademyStudent.find(studentQ)
    .select(
      'studentId studentName fatherName rollNumber sectionId disciplineId academicHistory isFullPackage selectedSubjects'
    )
    .lean();

  let students = sortStudents(
    allStudents.filter((stu) => subjects.some((s) => isEnrolledInSubject(stu, s.id)))
  );
  if (studentIdFilter.size) {
    students = students.filter((s) => studentIdFilter.has(String(s._id)));
  }
  if (!students.length) throw new ApiError(400, 'No students to print');

  const sheetRows = students.map((student) => {
    const cells = subjects.map((sub) => {
      if (!isEnrolledInSubject(student, sub.id)) return null;
      const a = markByTestStudent[`${sub.testId}:${student._id}`];
      if (!a) return { obtained: null, total: sub.total, remarks: '' };
      return {
        obtained: a.obtainedMarks,
        total: a.totalMarks != null ? a.totalMarks : sub.total,
        remarks: a.remarks || '',
      };
    });
    return { student, cells };
  });

  const batchTitle =
    test.seriesLabel ||
    test.title ||
    (assessmentTypeLabel(test.assessmentType) || 'Test');

  const subjectsLabel = subjects.map((s) => s.name).filter(Boolean).join(', ');
  const totalMarksSum = subjects.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
  const testTypeLabel = assessmentTypeLabel(test.assessmentType) || 'Test';
  const testNumber =
    test.occurrenceIndex != null && test.occurrenceIndex !== ''
      ? String(test.occurrenceIndex)
      : batchTitle || '1';

  return renderClassMarksheetPdf({
    meta: {
      title:
        mode === 'subject' ? 'SUBJECT-WISE MARKS REPORT' : 'TEST-WISE MARKS REPORT',
      programLabel,
      disciplineLabel: disciplineName,
      examLabel: [batchTitle, testTypeLabel].filter(Boolean).join(' · '),
      subjectsLabel:
        mode === 'subject' ? subjectName || subjectsLabel : subjectsLabel,
      totalMarks: String(totalMarksSum),
      testTypeLabel,
      testNumber,
      testDate: formatDate(test.examDate),
    },
    subjects,
    rows: sheetRows,
  });
}

async function renderClassTestStudentWisePdf(test, rows, labels) {
  // Support legacy single-assessment rows and multi-subject batch rows.
  const normalized = rows
    .map((row) => {
      if (Array.isArray(row.subjectRows) && row.subjectRows.length) {
        return {
          student: row.student,
          subjectRows: row.subjectRows.filter((c) => c && (c.hasMark || c.obtained != null)),
        };
      }
      if (row.assessment != null) {
        return {
          student: row.student,
          subjectRows: [
            {
              subjectName: labels.subjectName || 'Subject',
              obtained: row.assessment.obtainedMarks,
              total:
                row.assessment.totalMarks != null ? row.assessment.totalMarks : test.totalMarks,
              remarks: row.assessment.remarks || '',
              hasMark: true,
            },
          ],
        };
      }
      return null;
    })
    .filter((r) => r && r.subjectRows.length);

  if (!normalized.length) {
    throw new ApiError(400, 'No student marks to print — enter marks first');
  }

  const testTypeLabel = assessmentTypeLabel(test.assessmentType) || 'Test';
  const testNumber =
    test.occurrenceIndex != null && test.occurrenceIndex !== ''
      ? String(test.occurrenceIndex)
      : (() => {
          const m = String(test.title || '').match(/\b(?:test\s*(?:no|number)?\s*)?(\d+)\b/i);
          return m ? m[1] : '1';
        })();
  // Title shows test number (e.g. TEST NO. 1) instead of "STUDENT-WISE…".
  const reportTitle = `TEST NO. ${testNumber}`;

  return bufferFromDoc(
    (doc) => {
      const margin = 36;
      const contentW = doc.page.width - margin * 2;
      let first = true;

      normalized.forEach((row) => {
        if (!first) doc.addPage();
        first = false;
        const student = row.student;
        const subjectRows = row.subjectRows;
        const studentSubjectsLabel = subjectRows
          .map((c) => c.subjectName)
          .filter(Boolean)
          .join(', ');
        const subjectCells = subjectRows.map((c) => ({
          obtained: c.obtained,
          total: c.total,
          remarks: c.remarks,
        }));
        const obtainedSum = subjectRows.reduce(
          (sum, c) => sum + (isAbsent(c.remarks) ? 0 : Number(c.obtained) || 0),
          0
        );
        // Totals only for subjects with marks on this card (selective / partial entry).
        const totalSum = subjectRows.reduce((sum, c) => sum + (Number(c.total) || 0), 0);
        const pct = pctOf(obtainedSum, totalSum);
        const grade = letterGrade(pct);
        const overallResult = overallResultLabel({
          percentage: pct,
          grade,
          subjectCells,
        });
        const failOverall = overallResult === 'Fail';

        let y = drawReportHeader(
          doc,
          {
            title: reportTitle,
            programLabel: labels.programLabel,
            disciplineLabel: labels.disciplineLabel || '',
            examLabel: test.title,
            subjectsLabel: studentSubjectsLabel || labels.subjectName || '',
            totalMarks: String(totalSum || ''),
            testTypeLabel,
            testNumber,
            testDate: formatDate(test.examDate),
          },
          margin,
          contentW
        );

        // —— Student particulars ——
        const boxH = 72;
        doc.save();
        doc.rect(margin, y, contentW, boxH).fill('#F7F7F7');
        doc.restore();
        doc.rect(margin, y, contentW, boxH).strokeColor(LINE).lineWidth(0.8).stroke();
        doc.save();
        doc.rect(margin, y, 4, boxH).fill('#1a2b4b');
        doc.restore();

        doc.font('Helvetica-Bold').fontSize(8).fillColor('#1a2b4b');
        doc.text('STUDENT PARTICULARS', margin + 12, y + 8, { lineBreak: false });

        const colL = margin + 12;
        const colR = margin + contentW / 2 + 4;
        const halfW = contentW / 2 - 20;
        doc.font('Helvetica').fontSize(8).fillColor('#555555');
        doc.text('Student Name', colL, y + 24, { lineBreak: false });
        doc.text('Student ID', colR, y + 24, { lineBreak: false });
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
        doc.text(fitText(doc, nameOf(student), halfW), colL, y + 36, {
          width: halfW,
          lineBreak: false,
        });
        doc.text(fitText(doc, studentCodeOf(student) || '—', halfW), colR, y + 36, {
          width: halfW,
          lineBreak: false,
        });
        doc.font('Helvetica').fontSize(8).fillColor('#555555');
        doc.text("Father's Name", colL, y + 52, { lineBreak: false });
        doc.text('Subjects Appeared', colR, y + 52, { lineBreak: false });
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
        doc.text(fitText(doc, student.fatherName || '—', halfW), colL, y + 62, {
          width: halfW,
          lineBreak: false,
        });
        doc.text(String(subjectRows.length), colR, y + 62, { lineBreak: false });
        y += boxH + 14;

        // —— Subject marks ——
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#1a2b4b');
        doc.text('SUBJECT-WISE RESULT', margin, y, { lineBreak: false });
        y += 10;

        const headers = ['Sr.', 'Subject', 'Total', 'Obtained', '%age', 'Grade', 'Result'];
        const colWs = [36, contentW - 36 - 58 - 62 - 52 - 48 - 58, 58, 62, 52, 48, 58];
        const rowH = 22;
        const headerH = 24;
        let x = margin;
        headers.forEach((h, i) => {
          drawCell(doc, h, x, y, colWs[i], headerH, {
            bold: true,
            fontSize: 8,
            fill: GRAY,
          });
          x += colWs[i];
        });
        y += headerH;

        subjectRows.forEach((cell, idx) => {
          const absent = isAbsent(cell.remarks);
          const cellPct = absent ? 0 : pctOf(cell.obtained, cell.total);
          const cellGrade = absent ? '—' : letterGrade(cellPct);
          const cellFail = isFailMark(cell.obtained, cell.total, cell.remarks);
          const subjectResult = absent ? 'Absent' : cellFail ? 'Fail' : 'Pass';
          const zebra = idx % 2 === 1 ? '#F4F4F4' : null;
          const vals = [
            String(idx + 1),
            cell.subjectName || 'Subject',
            String(cell.total ?? ''),
            absent ? 'Absent' : cell.obtained == null ? '—' : String(cell.obtained),
            cell.obtained == null && !absent ? '—' : `${cellPct}%`,
            cellGrade,
            subjectResult,
          ];
          x = margin;
          vals.forEach((text, i) => {
            const isResultCol = i === 6;
            drawCell(doc, text, x, y, colWs[i], rowH, {
              bold: i === 1 || isResultCol,
              fontSize: 9,
              fill: isResultCol && cellFail ? GRAY : zebra,
              textColor: isResultCol && cellFail ? '#B91C1C' : '#000',
              align: i === 1 ? 'left' : 'center',
            });
            x += colWs[i];
          });
          y += rowH;
        });

        // —— Overall summary bar ——
        y += 10;
        const sumH = 28;
        doc.save();
        doc.rect(margin, y, contentW, sumH).fill(failOverall ? GRAY : '#E8EEF5');
        doc.restore();
        doc.rect(margin, y, contentW, sumH).strokeColor(LINE).lineWidth(0.8).stroke();

        const summaryCols = [
          { label: 'Obtained', value: `${obtainedSum} / ${totalSum}` },
          { label: 'Percentage', value: `${pct}%` },
          { label: 'Grade', value: grade || '—' },
          { label: 'Overall Result', value: overallResult },
        ];
        const sw = contentW / summaryCols.length;
        summaryCols.forEach((c, i) => {
          const sx = margin + i * sw;
          doc.font('Helvetica').fontSize(7).fillColor('#555555');
          doc.text(c.label, sx + 6, y + 4, { width: sw - 12, align: 'center', lineBreak: false });
          doc
            .font('Helvetica-Bold')
            .fontSize(10)
            .fillColor(c.label === 'Overall Result' && failOverall ? '#B91C1C' : '#000');
          doc.text(c.value, sx + 6, y + 14, { width: sw - 12, align: 'center', lineBreak: false });
        });
      });
    },
    { layout: 'portrait', margin: 36 }
  );
}

module.exports = {
  renderExamMarksReportPdf,
  renderClassTestMarksReportPdf,
};
