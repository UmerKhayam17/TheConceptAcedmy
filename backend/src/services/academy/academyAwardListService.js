const PDFDocument = require('pdfkit');
const { ACADEMY_BRAND, resolveLogoPath } = require('../../config/academyBrand');
const { assessmentTypeLabel } = require('../../config/assessmentTaxonomy');
const classTestService = require('./academyClassTestService');
const Exam = require('../../models/Exam');
const AcademyStudent = require('../../models/academy/AcademyStudent');
const AcademySection = require('../../models/academy/AcademySection');
const AcademySubject = require('../../models/academy/AcademySubject');
const ApiError = require('../../utils/ApiError');
const { isEnrolledInSubject } = require('./studentEnrollment');

const GRAY = '#C8C8C8';
const LINE = '#000000';
const LOGO_SIZE = 46;

function formatDate(value) {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  const d = String(dt.getDate()).padStart(2, '0');
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${dt.getFullYear()}`;
}

function rollOf(student) {
  return String(student.rollNumber || student.studentId || '').trim();
}

function nameOf(student) {
  return String(student.studentName || '')
    .trim()
    .toUpperCase();
}

function sortStudents(students) {
  return [...students].sort((a, b) => {
    const ra = rollOf(a);
    const rb = rollOf(b);
    if (ra && rb && ra !== rb) return ra.localeCompare(rb, undefined, { numeric: true });
    return nameOf(a).localeCompare(nameOf(b));
  });
}

function disciplineNameOf(student) {
  if (!student) return '';
  if (student.disciplineName) return String(student.disciplineName).trim();
  const d = student.disciplineId;
  if (typeof d === 'object' && d) return String(d.name || '').trim();
  return '';
}

/** Unique discipline names on a roster (for award-list header). */
function disciplineLabelFromStudents(students) {
  const names = [
    ...new Set(
      (students || [])
        .map((s) => disciplineNameOf(s))
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b));
  if (!names.length) return '';
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} +${names.length - 3}`;
}

function buildProgramLabel(className, sectionName, disciplineLabel) {
  return [className, sectionName, disciplineLabel].filter(Boolean).join(' - ') || '—';
}

/** Truncate so text never wraps or bleeds into the next cell. */
function fitText(doc, text, maxWidth) {
  let t = String(text ?? '');
  if (!t) return '';
  if (doc.widthOfString(t) <= maxWidth) return t;
  while (t.length > 1 && doc.widthOfString(`${t}…`) > maxWidth) {
    t = t.slice(0, -1);
  }
  return t.length ? `${t}…` : '';
}

function drawField(doc, label, value, x, y, totalWidth, fontSize = 9) {
  doc.font('Helvetica-Bold').fontSize(fontSize).fillColor('#000');
  const labelW = doc.widthOfString(label);
  doc.text(label, x, y, { lineBreak: false });
  const lineStart = x + labelW + 3;
  const lineEnd = x + totalWidth;
  if (value) {
    doc.font('Helvetica').fontSize(fontSize).fillColor('#000');
    const shown = fitText(doc, value, Math.max(0, lineEnd - lineStart - 2));
    doc.text(shown, lineStart, y, { lineBreak: false });
  }
  doc
    .moveTo(lineStart, y + fontSize + 1)
    .lineTo(lineEnd, y + fontSize + 1)
    .strokeColor(LINE)
    .lineWidth(0.7)
    .stroke();
}

function drawHeaderBlock(doc, meta, margin, contentW, logoPath) {
  const {
    campus,
    programLabel,
    disciplineLabel,
    subjectName,
    totalMarks,
    testTypeLabel,
    testNumber,
    testDate,
  } = meta;
  let y = margin;

  const titleGap = 12;
  const titleBlockH = 34;
  const sheetTitle = 'Award List + Attendance Sheet';
  if (logoPath) {
    doc.font('Helvetica-Bold').fontSize(14);
    const campusW = doc.widthOfString(campus);
    doc.font('Helvetica-Bold').fontSize(12);
    const sheetW = doc.widthOfString(sheetTitle);
    const textColW = Math.max(campusW, sheetW);
    const groupW = LOGO_SIZE + titleGap + textColW;
    const groupX = margin + Math.max(0, (contentW - groupW) / 2);

    try {
      doc.image(logoPath, groupX, y, { fit: [LOGO_SIZE, LOGO_SIZE] });
    } catch {
      /* skip broken logo */
    }

    const titleX = groupX + LOGO_SIZE + titleGap;
    const titleTop = y + Math.max(0, (LOGO_SIZE - titleBlockH) / 2);
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#000');
    doc.text(campus, titleX, titleTop, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(12);
    doc.text(sheetTitle, titleX, titleTop + 18, { lineBreak: false });
    y += LOGO_SIZE + 8;
  } else {
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#000');
    doc.text(campus, margin, y, { width: contentW, align: 'center', lineBreak: false });
    y += 18;
    doc.font('Helvetica-Bold').fontSize(12);
    doc.text(sheetTitle, margin, y, {
      width: contentW,
      align: 'center',
      lineBreak: false,
    });
    y += 20;
  }

  const barH = 18;
  doc.save();
  doc.rect(margin, y, contentW, barH).fill(GRAY);
  doc.restore();
  doc.rect(margin, y, contentW, barH).strokeColor(LINE).lineWidth(0.8).stroke();
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
  const programText = disciplineLabel
    ? `Program/Class/Section/Discipline : ${programLabel}`
    : `Program/Class/Section : ${programLabel}`;
  doc.text(fitText(doc, programText, contentW - 12), margin + 6, y + 5, { lineBreak: false });
  y += barH + 10;

  const rowGap = 16;
  const leftW = contentW * 0.42;
  const midX = margin + leftW + 10;
  const midW = contentW * 0.28;
  const rightX = midX + midW + 10;
  const rightW = contentW - (leftW + midW + 20);

  drawField(doc, 'Subject: ', subjectName, margin, y, leftW);
  drawField(doc, 'Total Marks: ', totalMarks, midX, y, midW);
  drawField(doc, 'Pass Marks: ', '', rightX, y, rightW);
  y += rowGap;

  if (disciplineLabel) {
    drawField(doc, 'Discipline: ', disciplineLabel, margin, y, contentW);
    y += rowGap;
  }

  const half = (contentW - 12) / 2;
  drawField(doc, "Examiner's Name: ", '', margin, y, half);
  drawField(doc, "Invigilator's Name: ", '', margin + half + 12, y, half);
  y += rowGap;

  drawField(doc, `${testTypeLabel}: `, testNumber, margin, y, half);
  drawField(doc, 'Test Date: ', testDate, margin + half + 12, y, half);
  y += rowGap + 2;

  doc
    .moveTo(margin, y)
    .lineTo(margin + contentW, y)
    .strokeColor(LINE)
    .lineWidth(1.6)
    .stroke();
  y += 8;

  return y;
}

/** Base header height; +16 when a Discipline row is printed. */
const HEADER_BLOCK_H = LOGO_SIZE + 8 + 18 + 10 + 16 * 3 + 2 + 8;
const HEADER_DISCIPLINE_EXTRA = 16;

function drawFooterBlock(doc, studentCount, margin, contentW, pageH) {
  const footerH = 78;
  let y = pageH - margin - footerH;
  const rowGap = 16;
  const third = (contentW - 16) / 3;
  const half = (contentW - 12) / 2;

  drawField(doc, 'Total Students: ', String(studentCount), margin, y, third);
  drawField(doc, 'App Students: ', '', margin + third + 8, y, third);
  drawField(doc, 'Pass Students: ', '', margin + (third + 8) * 2, y, third);
  y += rowGap;

  drawField(doc, 'Absent Students: ', '', margin, y, half);
  drawField(doc, 'Pass Percentage: ', '', margin + half + 12, y, half);
  y += rowGap;

  drawField(doc, "Examiner's Sign: ", '', margin, y, half);
  drawField(doc, "Invigilator's Sign: ", '', margin + half + 12, y, half);
  y += rowGap;

  drawField(doc, 'Date Recieved: ', '', margin, y, half);
  drawField(doc, 'Signature: ', '', margin + half + 12, y, half);
}

/**
 * @param {Array<{ meta: object, students: object[] }>} sheets
 */
function buildPdfFromSheets(sheets) {
  if (!sheets.length) throw new ApiError(400, 'No award list data to print');
  const logoPath = resolveLogoPath();
  const campus = ACADEMY_BRAND.name;

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'portrait',
        margin: 24,
        info: {
          Title: `Award List - ${sheets[0].meta.programLabel || ''}`,
          Author: campus,
        },
      });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageH = doc.page.height;
      const margin = 24;
      const contentW = doc.page.width - margin * 2;
      const gap = 8;
      const rowH = 16;
      const headerH = 17;
      const footerReserve = 84;

      function rowsPerColumn(meta) {
        const headerBlock =
          HEADER_BLOCK_H + (meta?.disciplineLabel ? HEADER_DISCIPLINE_EXTRA : 0);
        const tableTop = margin + headerBlock;
        const usableH = pageH - tableTop - footerReserve - margin;
        return Math.max(1, Math.floor((usableH - headerH) / rowH));
      }

      function buildCols(tableW, dual) {
        const cols = [
          { key: 'sr', w: 28, label: 'Sr #' },
          { key: 'roll', w: dual ? 78 : 120, label: 'Roll #' },
          { key: 'name', w: dual ? 78 : 200, label: 'Student Name' },
          { key: 'marks', w: dual ? 28 : 50, label: 'Marks' },
          { key: 'sign', w: 0, label: 'Signature' },
        ];
        cols[4].w = tableW - cols[0].w - cols[1].w - cols[2].w - cols[3].w;
        return cols;
      }

      function drawTableHeader(blockX, y, tableW, cols) {
        doc.save();
        doc.rect(blockX, y, tableW, headerH).fill(GRAY);
        doc.restore();
        doc.rect(blockX, y, tableW, headerH).strokeColor(LINE).lineWidth(0.8).stroke();
        let x = blockX;
        doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#000');
        cols.forEach((c, i) => {
          doc.text(c.label, x + 1, y + 4.5, {
            width: c.w - 2,
            height: 9,
            align: 'center',
            lineBreak: false,
            ellipsis: true,
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

      function drawStudentRow(blockX, y, sr, student, tableW, cols) {
        doc.rect(blockX, y, tableW, rowH).strokeColor(LINE).lineWidth(0.5).stroke();
        const values = [String(sr), rollOf(student), nameOf(student), '', ''];
        let x = blockX;
        cols.forEach((c, i) => {
          const fontSize = c.key === 'roll' ? 6.5 : 7;
          doc.font('Helvetica').fontSize(fontSize).fillColor('#000');
          if (values[i]) {
            doc.text(values[i], x + 2, y + (rowH - fontSize) / 2, {
              width: c.w - 4,
              height: fontSize + 2,
              align: c.key === 'name' ? 'left' : 'center',
              lineBreak: false,
              ellipsis: true,
            });
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

      let firstPage = true;
      for (const sheet of sheets) {
        const students = sortStudents(sheet.students || []);
        const meta = { ...sheet.meta, campus: sheet.meta.campus || campus };
        const maxRowsPerCol = rowsPerColumn(meta);
        const useTwoColumns = students.length > maxRowsPerCol;
        const perPage = useTwoColumns ? maxRowsPerCol * 2 : maxRowsPerCol;
        const pages = Math.max(1, Math.ceil(students.length / perPage) || 1);

        for (let page = 0; page < pages; page++) {
          if (!firstPage) doc.addPage();
          firstPage = false;

          const top = drawHeaderBlock(doc, meta, margin, contentW, logoPath);
          const pageStart = page * perPage;
          const pageStudents = students.slice(pageStart, pageStart + perPage);
          const leftStudents = pageStudents.slice(0, maxRowsPerCol);
          const rightStudents = pageStudents.slice(maxRowsPerCol);
          const pageUsesTwoCols = rightStudents.length > 0;
          const tableW = pageUsesTwoCols ? (contentW - gap) / 2 : contentW;
          const cols = buildCols(tableW, pageUsesTwoCols);
          const leftX = margin;
          const rightX = margin + tableW + gap;

          drawTableHeader(leftX, top, tableW, cols);
          leftStudents.forEach((s, i) => {
            drawStudentRow(leftX, top + headerH + i * rowH, pageStart + i + 1, s, tableW, cols);
          });

          if (pageUsesTwoCols) {
            drawTableHeader(rightX, top, tableW, cols);
            rightStudents.forEach((s, i) => {
              drawStudentRow(
                rightX,
                top + headerH + i * rowH,
                pageStart + leftStudents.length + i + 1,
                s,
                tableW,
                cols
              );
            });
          }

          if (page === pages - 1) {
            drawFooterBlock(doc, students.length, margin, contentW, pageH);
          }
        }
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

async function renderAwardListPdf(testId, actor, sessionId) {
  const entry = await classTestService.getClassTestMarksEntry(testId, actor, sessionId);
  const { test } = entry;
  const students = entry.students.map((row) => row.student);

  const className =
    typeof test.classId === 'object' && test.classId ? test.classId.className : '';
  const sectionName =
    typeof test.sectionId === 'object' && test.sectionId ? test.sectionId.sectionName : '';
  const subjectName =
    typeof test.subjectId === 'object' && test.subjectId ? test.subjectId.subjectName : '';
  const disciplineLabel = disciplineLabelFromStudents(students);
  const programLabel = buildProgramLabel(className, sectionName, disciplineLabel);
  const testTypeLabel = assessmentTypeLabel(test.assessmentType) || 'Test';
  const testNumber =
    test.occurrenceIndex != null && test.occurrenceIndex !== ''
      ? String(test.occurrenceIndex)
      : '1';

  return buildPdfFromSheets([
    {
      meta: {
        campus: ACADEMY_BRAND.name,
        programLabel,
        disciplineLabel,
        subjectName,
        totalMarks: test.totalMarks != null ? String(test.totalMarks) : '',
        testTypeLabel,
        testNumber,
        testDate: formatDate(test.examDate),
      },
      students,
    },
  ]);
}

async function loadExamStudents(exam) {
  const studentQ = { classId: exam.academyClass, status: 'active' };
  if (exam.sectionId) studentQ.sectionId = exam.sectionId;
  const rows = await AcademyStudent.find(studentQ)
    .select(
      'studentId studentName fatherName rollNumber sectionId isFullPackage selectedSubjects disciplineId'
    )
    .populate('disciplineId', 'name code')
    .lean();
  return rows.map((s) => ({
    ...s,
    disciplineName:
      typeof s.disciplineId === 'object' && s.disciplineId ? s.disciplineId.name : undefined,
  }));
}

function studentsForSubject(allStudents, subjectRef) {
  const sid = subjectRef?._id || subjectRef;
  if (!sid) return allStudents;
  return allStudents.filter((s) => isEnrolledInSubject(s, sid));
}

/**
 * Exam award list(s). Optional subjectId → one subject sheet; otherwise all date-sheet subjects.
 * Each sheet lists only students enrolled in that subject.
 */
async function renderExamAwardListPdf(examId, subjectId) {
  const exam = await Exam.findById(examId)
    .populate('academyClass', 'className')
    .populate('sectionId', 'sectionName')
    .populate('dateSheet.subject', 'subjectName subjectCode')
    .lean();
  if (!exam) throw new ApiError(404, 'Exam not found');

  const className =
    typeof exam.academyClass === 'object' && exam.academyClass
      ? exam.academyClass.className
      : '';
  let sectionName =
    typeof exam.sectionId === 'object' && exam.sectionId ? exam.sectionId.sectionName : '';
  if (!sectionName && exam.sectionId) {
    const sec = await AcademySection.findById(exam.sectionId).select('sectionName').lean();
    sectionName = sec?.sectionName || '';
  }
  const testTypeLabel = exam.type || 'Exam';
  const allStudents = await loadExamStudents(exam);

  const dateSheet = Array.isArray(exam.dateSheet) ? exam.dateSheet : [];
  let papers = dateSheet.filter((p) => p.subject);
  if (subjectId) {
    papers = papers.filter((p) => String(p.subject?._id || p.subject) === String(subjectId));
    if (!papers.length) {
      const subject = await AcademySubject.findById(subjectId).select('subjectName').lean();
      if (!subject) throw new ApiError(404, 'Subject not found on this exam');
      papers = [
        {
          subject,
          date: exam.startDate,
          totalMarks: undefined,
          syllabus: '',
        },
      ];
    }
  }
  if (!papers.length) {
    throw new ApiError(400, 'No subjects on this exam date sheet yet');
  }

  const sheets = papers.map((p, index) => {
    const subjectName =
      typeof p.subject === 'object' && p.subject ? p.subject.subjectName : '';
    const students = studentsForSubject(allStudents, p.subject);
    const disciplineLabel = disciplineLabelFromStudents(students);
    const programLabel = buildProgramLabel(className, sectionName, disciplineLabel);
    return {
      meta: {
        campus: ACADEMY_BRAND.name,
        programLabel,
        disciplineLabel,
        subjectName,
        totalMarks: p.totalMarks != null ? String(p.totalMarks) : '',
        testTypeLabel,
        testNumber: String(index + 1),
        testDate: formatDate(p.date || exam.startDate),
      },
      students,
    };
  });

  return buildPdfFromSheets(sheets);
}

module.exports = { renderAwardListPdf, renderExamAwardListPdf };
