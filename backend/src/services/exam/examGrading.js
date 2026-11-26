/**
 * Academy grading scale (percentage is rounded to a whole number first):
 * A++ 96–100 Extraordinary · A+ 91–95 Exceptional · A 86–90 Outstanding ·
 * B++ 81–85 Excellent · B+ 76–80 Very Good · B 71–75 Good · C+ 61–70 Fairly Good ·
 * C 51–60 Above Average · D 40–50 Emerging · U below 40 Ungraded.
 */
const GRADE_SCALE = [
  { min: 96, grade: 'A++', remarks: 'Extraordinary' },
  { min: 91, grade: 'A+', remarks: 'Exceptional' },
  { min: 86, grade: 'A', remarks: 'Outstanding' },
  { min: 81, grade: 'B++', remarks: 'Excellent' },
  { min: 76, grade: 'B+', remarks: 'Very Good' },
  { min: 71, grade: 'B', remarks: 'Good' },
  { min: 61, grade: 'C+', remarks: 'Fairly Good' },
  { min: 51, grade: 'C', remarks: 'Above Average' },
  { min: 40, grade: 'D', remarks: 'Emerging' },
  { min: -Infinity, grade: 'U', remarks: 'Ungraded' },
];

function gradeBand(pct) {
  const p = Math.round(Number(pct) || 0);
  return GRADE_SCALE.find((b) => p >= b.min);
}

function letterGrade(pct) {
  return gradeBand(pct).grade;
}

/** Scale description shown as "Remarks" on result cards (not Pass/Fail). */
function gradeRemarks(pct) {
  return gradeBand(pct).remarks;
}

/** Below this % the grade is U / Ungraded. */
const PASS_MIN_PCT = 40;

function isUngraded(pct) {
  return Math.round(Number(pct) || 0) < PASS_MIN_PCT;
}

function gpaFromPct(pct) {
  if (pct >= 95) return 4.0;
  if (pct >= 85) return 3.7;
  if (pct >= 75) return 3.3;
  if (pct >= 60) return 3.0;
  if (pct >= 50) return 2.0;
  return 0.0;
}

function subjectIsAbsent(sm) {
  if (sm?.isAbsent) return true;
  if (Number(sm?.obtained) === -1) return true;
  return /absent/i.test(String(sm?.remarks || ''));
}

function computeResultTotals(subjectMarks) {
  let totalMarks = 0;
  let obtainedMarks = 0;
  const enriched = (subjectMarks || []).map((sm) => {
    const isAbsent = subjectIsAbsent(sm);
    const obtained = isAbsent ? 0 : Number(sm.obtained) || 0;
    const total = Number(sm.total) || 0;
    const pct = total ? (obtained / total) * 100 : 0;
    const grade = isAbsent ? 'Ab' : sm.grade || letterGrade(pct);
    totalMarks += total;
    obtainedMarks += obtained;
    return {
      ...sm,
      obtained,
      total,
      isAbsent,
      remarks: isAbsent
        ? String(sm.remarks || '').trim() || 'Absent'
        : sm.remarks,
      grade,
    };
  });
  const percentage = totalMarks ? (obtainedMarks / totalMarks) * 100 : 0;
  const grade = letterGrade(percentage);
  const gpa = gpaFromPct(percentage);
  return { subjectMarks: enriched, totalMarks, obtainedMarks, percentage, grade, gpa };
}

module.exports = {
  GRADE_SCALE,
  PASS_MIN_PCT,
  letterGrade,
  gradeRemarks,
  isUngraded,
  gpaFromPct,
  computeResultTotals,
};
