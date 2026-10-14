const PDFDocument = require('pdfkit');
const { ACADEMY_BRAND, resolveLogoPath } = require('../../config/academyBrand');
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
const MUTED = '#5A6A7A';
const NAVY = ACADEMY_BRAND.colors?.navy || '#0B2A4A';
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

function drawReportHeader(doc, meta, margin, contentW) {
  const logoPath = resolveLogoPath();
  let y = margin;
  if (logoPath) {
    try {
      doc.image(logoPath, margin, y, { width: 40, height: 40 });
    } catch {
      /* ignore */
    }
  }
  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .fillColor(NAVY)
    .text(ACADEMY_BRAND.name, margin + 48, y + 2, { width: contentW - 48 });
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(MUTED)
    .text(meta.subtitle || 'Marks Report', margin + 48, y + 20, { width: contentW - 48 });
  y += 48;
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor('#000')
    .text(meta.title || 'MARKS REPORT', margin, y, { width: contentW, align: 'center' });
  y += 16;
  const bits = [
    meta.programLabel,
    meta.examLabel,
    meta.subjectLabel,
    meta.dateLabel ? `Date: ${meta.dateLabel}` : '',
  ].filter(Boolean);
  if (bits.length) {
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#000')
      .text(bits.join('   ·   '), margin, y, { width: contentW, align: 'center' });
    y += 12;
  }
  return y + 4;
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
      let totalSum = 0;
      let anyMarked = false;

      subjects.forEach((sub, i) => {
        const cell = row.cells[i];
        if (!cell) {
          drawCell(doc, '', x, y, omW, rowH, { fontSize: fs });
          drawCell(doc, '', x + omW, y, pctW, rowH, { fontSize: fs });
          x += omW + pctW;
          return;
        }
        const total = cell.total ?? sub.total;
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
        if (hasMark || absent) {
          anyMarked = true;
          obtainedSum += absent ? 0 : Number(cell.obtained) || 0;
          totalSum += Number(total) || 0;
        } else if (row.marksTotal == null) {
          totalSum += Number(total) || 0;
        }
      });

      const marksTotal =
        row.marksTotal != null
          ? Number(row.marksTotal)
          : totalSum || marksSum;
      const obtainedTotal =
        row.obtainedTotal != null ? Number(row.obtainedTotal) : anyMarked ? obtainedSum : null;
      const percentage =
        row.percentage != null
          ? Math.round(Number(row.percentage))
          : obtainedTotal != null
            ? pctOf(obtainedTotal, marksTotal)
            : null;
      const result =
        row.result ||
        (percentage == null && !anyMarked
          ? ''
          : overallResultLabel({
              percentage: percentage ?? 0,
              grade: row.grade,
              subjectCells: row.cells,
            }));
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

    let y = drawReportHeader(doc, meta, margin, contentW);
    y = drawTableHeader(y);
    const usableBottom = pageH - margin - footerH;
    let sr = 1;
    for (const row of rows) {
      if (y + rowH > usableBottom) {
        doc.addPage();
        y = drawReportHeader(doc, meta, margin, contentW);
        y = drawTableHeader(y);
      }
      drawDataRow(y, sr++, row);
      y += rowH;
    }

    y = Math.max(y + 8, pageH - margin - 16);
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor(MUTED)
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

  const subjectLabel =
    mode === 'subject' ? `Subject: ${subjects.map((s) => s.name).join(', ')}` : '';

  return renderClassMarksheetPdf({
    meta: {
      title: mode === 'subject' ? 'SUBJECT-WISE MARKS REPORT' : 'EXAMINATION RESULT SHEET',
      subtitle: examLabel || 'Examination marks report',
      programLabel,
      examLabel,
      subjectLabel,
      dateLabel: formatDate(exam.startDate),
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

        let y = drawReportHeader(
          doc,
          {
            title: 'STUDENT-WISE EXAM REPORT',
            subtitle: 'Examination result card',
            programLabel: examProgramLabel(exam),
            examLabel: [exam.title, exam.type, exam.sessionLabel].filter(Boolean).join(' · '),
            dateLabel: formatDate(exam.startDate),
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
    const ids = entry.students.map((r) => r.student._id);
    const historyRows = await AcademyStudent.find({ _id: { $in: ids } })
      .select('academicHistory')
      .lean();
    const historyById = {};
    historyRows.forEach((s) => {
      historyById[String(s._id)] = s.academicHistory || [];
    });
    let rows = entry.students.map((r) => ({
      student: {
        ...r.student,
        academicHistory: historyById[String(r.student._id)] || [],
      },
      assessment: r.assessment,
    }));
    if (studentIdFilter.size) {
      rows = rows.filter((r) => studentIdFilter.has(String(r.student._id)));
    }
    if (!rows.length) throw new ApiError(400, 'No students to print');
    return renderClassTestStudentWisePdf(test, rows, {
      programLabel,
      subjectName,
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

  return renderClassMarksheetPdf({
    meta: {
      title:
        mode === 'subject' ? 'SUBJECT-WISE MARKS REPORT' : 'TEST-WISE MARKS REPORT',
      subtitle: 'Class test marks report',
      programLabel,
      examLabel: [
        batchTitle,
        assessmentTypeLabel(test.assessmentType) || 'Test',
        mode === 'subject' ? subjectName : `${subjects.length} subjects`,
      ]
        .filter(Boolean)
        .join(' · '),
      subjectLabel:
        mode === 'subject'
          ? `Subject: ${subjectName || '—'}`
          : subjects.map((s) => s.name).join(', '),
      dateLabel: formatDate(test.examDate),
    },
    subjects,
    rows: sheetRows,
  });
}

async function renderClassTestStudentWisePdf(test, rows, labels) {
  const marked = rows.filter((r) => r.assessment != null);
  if (!marked.length) {
    throw new ApiError(400, 'No student marks to print — enter marks first');
  }

  return bufferFromDoc(
    (doc) => {
      const margin = 36;
      const contentW = doc.page.width - margin * 2;
      let first = true;

      marked.forEach((row) => {
        if (!first) doc.addPage();
        first = false;
        const student = row.student;
        const a = row.assessment;
        const total = a.totalMarks != null ? a.totalMarks : test.totalMarks;
        const obtained = a.obtainedMarks;
        const absent = isAbsent(a.remarks);
        const pct = absent ? 0 : pctOf(obtained, total);
        const grade = absent ? '—' : letterGrade(pct);
        const result = overallResultLabel({
          percentage: pct,
          grade,
          subjectCells: [{ obtained, total, remarks: a.remarks }],
        });

        let y = drawReportHeader(
          doc,
          {
            title: 'STUDENT-WISE TEST REPORT',
            subtitle: 'Class test result',
            programLabel: labels.programLabel,
            examLabel: test.title,
            subjectLabel: labels.subjectName ? `Subject: ${labels.subjectName}` : '',
            dateLabel: formatDate(test.examDate),
          },
          margin,
          contentW
        );

        const boxH = 64;
        doc.rect(margin, y, contentW, boxH).strokeColor(LINE).lineWidth(0.8).stroke();
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
        doc.text(`Student Name: ${nameOf(student)}`, margin + 10, y + 10);
        doc.text(`Student ID: ${studentCodeOf(student) || '—'}`, margin + contentW / 2, y + 10);
        doc.font('Helvetica').fontSize(9);
        doc.text(`Father Name: ${student.fatherName || '—'}`, margin + 10, y + 28);
        doc.text(`Subject: ${labels.subjectName || '—'}`, margin + contentW / 2, y + 28);
        doc.text(`Test: ${test.title || '—'}`, margin + 10, y + 46);
        doc.text(`Date: ${formatDate(test.examDate)}`, margin + contentW / 2, y + 46);
        y += boxH + 16;

        const headers = ['Sr. #', 'Subject', 'Total Marks', 'O.M', '%age', 'Grade', 'Result'];
        const colWs = [40, contentW - 40 - 70 - 55 - 55 - 50 - 55, 70, 55, 55, 50, 55];
        const rowH = 22;
        let x = margin;
        headers.forEach((h, i) => {
          drawCell(doc, h, x, y, colWs[i], 24, { bold: true, fontSize: 8, fill: GRAY });
          x += colWs[i];
        });
        y += 24;
        const omText = absent ? 'Absent' : String(obtained);
        const fail = result === 'Fail';
        const vals = [
          '1',
          labels.subjectName || 'Subject',
          String(total),
          omText,
          `${pct}%`,
          grade,
          result,
        ];
        x = margin;
        vals.forEach((text, i) => {
          drawCell(doc, text, x, y, colWs[i], rowH, {
            bold: i === 1 || i === 6,
            fontSize: 9,
            fill: fail && i >= 3 ? GRAY : null,
            align: i === 1 ? 'left' : 'center',
          });
          x += colWs[i];
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
