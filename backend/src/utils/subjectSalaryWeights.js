/**
 * Default tuition-share rates matching the academy Excel salary sheets.
 * Teacher cut % is NOT stored on subjects — it is set on the teacher (User.salaryPercentage).
 *
 * Salary = teacherPct × Σ (tuition × subjectShare)
 *   9th–10th: ENG/URDU/ISL/PST 10%, sciences 15%
 *   11th–12th / college: ENG/URDU/PST ~13.333%, sciences 20%
 */

const { classLevelWeight } = require('./classLevelSort');

const LANG_SHARE_SCHOOL = 10;
const SCIENCE_SHARE_SCHOOL = 15;
const LANG_SHARE_COLLEGE = 13.333;
const SCIENCE_SHARE_COLLEGE = 20;

function isCollegeBand(className) {
  const w = classLevelWeight(className);
  return w === 11 || w === 12 || w >= 101;
}

function normalizeSubjectKey(nameOrCode) {
  return String(nameOrCode || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Map common names/codes → weight category. */
function subjectCategory(subjectName, subjectCode) {
  const keys = [normalizeSubjectKey(subjectName), normalizeSubjectKey(subjectCode)];
  const hit = (needles) => keys.some((k) => needles.some((n) => k === n || k.startsWith(n)));

  if (hit(['biology', 'bio', 'biol'])) return 'biology';
  if (hit(['english', 'eng', 'englit'])) return 'language';
  if (hit(['urdu', 'urd'])) return 'language';
  if (hit(['islamiat', 'islamiyat', 'islamicstudies', 'isl', 'islamic'])) return 'language';
  if (hit(['pakistanstudies', 'pakstudies', 'pst', 'ps', 'pakstudy'])) return 'language';
  if (hit(['chemistry', 'chem', 'che'])) return 'science';
  if (hit(['mathematics', 'maths', 'math', 'mat'])) return 'science';
  if (hit(['physics', 'phy', 'phys'])) return 'science';
  if (hit(['computerscience', 'computer', 'comp', 'cs', 'ict'])) return 'science';
  return 'other';
}

/**
 * Resolve default tuition share for a subject in a class.
 * @returns {{ tuitionSharePercent: number }}
 */
function defaultSalaryWeights(className, subjectName, subjectCode) {
  const college = isCollegeBand(className);
  const category = subjectCategory(subjectName, subjectCode);

  let tuitionSharePercent = 0;
  if (category === 'language') {
    tuitionSharePercent = college ? LANG_SHARE_COLLEGE : LANG_SHARE_SCHOOL;
  } else if (category === 'science' || category === 'biology') {
    tuitionSharePercent = college ? SCIENCE_SHARE_COLLEGE : SCIENCE_SHARE_SCHOOL;
  } else {
    tuitionSharePercent = college ? SCIENCE_SHARE_COLLEGE : SCIENCE_SHARE_SCHOOL;
  }

  return { tuitionSharePercent };
}

module.exports = {
  LANG_SHARE_SCHOOL,
  SCIENCE_SHARE_SCHOOL,
  LANG_SHARE_COLLEGE,
  SCIENCE_SHARE_COLLEGE,
  isCollegeBand,
  subjectCategory,
  defaultSalaryWeights,
};
