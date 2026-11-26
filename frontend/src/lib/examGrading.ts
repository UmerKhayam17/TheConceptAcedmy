/**
 * Academy grading scale (percentage is rounded to a whole number first).
 * Remarks replace Pass/Fail / Description on result cards.
 */
export const GRADE_SCALE = [
  { min: 96, grade: "A++", remarks: "Extraordinary" },
  { min: 91, grade: "A+", remarks: "Exceptional" },
  { min: 86, grade: "A", remarks: "Outstanding" },
  { min: 81, grade: "B++", remarks: "Excellent" },
  { min: 76, grade: "B+", remarks: "Very Good" },
  { min: 71, grade: "B", remarks: "Good" },
  { min: 61, grade: "C+", remarks: "Fairly Good" },
  { min: 51, grade: "C", remarks: "Above Average" },
  { min: 40, grade: "D", remarks: "Emerging" },
  { min: -Infinity, grade: "U", remarks: "Ungraded" },
] as const;

/** Minimum percentage that earns a grade (below → U / Ungraded). */
export const PASS_MIN_PCT = 40;

function gradeBand(pct: number) {
  const p = Math.round(Number(pct) || 0);
  return GRADE_SCALE.find((b) => p >= b.min) || GRADE_SCALE[GRADE_SCALE.length - 1];
}

export function letterGrade(pct: number): string {
  return gradeBand(pct).grade;
}

export function gradeRemarks(pct: number): string {
  return gradeBand(pct).remarks;
}

export function isUngraded(pct: number): boolean {
  return Math.round(Number(pct) || 0) < PASS_MIN_PCT;
}

export const GRADE_KEY_LABEL =
  "A++ 96–100 Extraordinary · A+ 91–95 Exceptional · A 86–90 Outstanding · B++ 81–85 Excellent · B+ 76–80 Very Good · B 71–75 Good · C+ 61–70 Fairly Good · C 51–60 Above Average · D 40–50 Emerging · U below 40 Ungraded";
