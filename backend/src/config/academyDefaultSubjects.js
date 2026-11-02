/**
 * Default subjects created by "Auto initialize" on a class.
 * Idempotent — existing names/codes are skipped.
 *
 * For 9th / 10th: Biology + Computer Science form a choice group (pick 1).
 */

const { classLevelWeight } = require('../utils/classLevelSort');

/** Core subjects shared by all grades (always enrollmentType: required). */
const DEFAULT_REQUIRED_SUBJECTS = [
  { subjectName: 'English' },
  { subjectName: 'Urdu' },
  { subjectName: 'Mathematics' },
  { subjectName: 'Physics' },
  { subjectName: 'Chemistry' },
  { subjectName: 'Islamiat' },
  { subjectName: 'Pakistan Studies' },
];

/** 9th / 10th elective group — student picks exactly one. */
const NINTH_TENTH_CHOICE_GROUP = {
  groupName: 'Biology / Computer',
  pickCount: 1,
  subjects: [{ subjectName: 'Biology' }, { subjectName: 'Computer Science' }],
};

/** Full list used when grade is not 9th/10th (all required, including Bio + CS). */
const DEFAULT_ACADEMY_SUBJECTS = [
  ...DEFAULT_REQUIRED_SUBJECTS.slice(0, 5),
  { subjectName: 'Biology' },
  { subjectName: 'Computer Science' },
  ...DEFAULT_REQUIRED_SUBJECTS.slice(5),
];

function isNinthOrTenthClass(className) {
  const w = classLevelWeight(className);
  return w === 9 || w === 10;
}

function extractClassGradeSuffix(className) {
  const text = String(className || '').trim();
  if (!text) return '';
  const match =
    text.match(/\b(\d{1,2})\s*(?:st|nd|rd|th)\b/i) ||
    text.match(/\b(?:class|grade|year|std|standard)\s*[-.]?\s*(\d{1,2})\b/i) ||
    text.match(/\b(\d{1,2})\b/);
  if (!match) return '';
  const n = parseInt(match[1], 10);
  if (Number.isNaN(n) || n < 1 || n > 99) return '';
  return n < 10 ? `0${n}` : String(n);
}

function subjectPrefix(subjectName) {
  const cleaned = String(subjectName || '').trim();
  if (!cleaned) return 'SUB';
  const words = cleaned.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w));
  if (!words.length) return 'SUB';
  if (words.length > 1) {
    const initials = words
      .map((w) => w.replace(/[^a-zA-Z]/g, '')[0])
      .filter(Boolean)
      .join('');
    if (initials.length >= 2) return initials.toUpperCase().slice(0, 6);
  }
  const word = words[0].replace(/[^a-zA-Z]/g, '');
  if (!word) return 'SUB';
  return word.length <= 4 ? word.toUpperCase() : word.slice(0, 4).toUpperCase();
}

/** e.g. Mathematics + "9th" → "MATH-09" */
function generateSubjectCode(subjectName, className) {
  const prefix = subjectPrefix(subjectName);
  const grade = extractClassGradeSuffix(className);
  if (!grade) return prefix;
  return `${prefix}-${grade}`;
}

function normalizeSubjectKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Match Biology / Computer Science (and common aliases) on a class. */
function matchChoiceSubject(subject, defName) {
  const key = normalizeSubjectKey(subject.subjectName);
  const code = normalizeSubjectKey(subject.subjectCode);
  const want = normalizeSubjectKey(defName);
  if (want === 'biology') {
    return key === 'biology' || key === 'bio' || key.startsWith('biol') || code === 'bio' || code.startsWith('biol');
  }
  if (want === 'computerscience') {
    return (
      key === 'computerscience' ||
      key === 'computer' ||
      key === 'cs' ||
      key === 'ict' ||
      key.includes('computer') ||
      code === 'cs' ||
      code === 'comp' ||
      code.startsWith('cs')
    );
  }
  return key === want || key.includes(want);
}

module.exports = {
  DEFAULT_ACADEMY_SUBJECTS,
  DEFAULT_REQUIRED_SUBJECTS,
  NINTH_TENTH_CHOICE_GROUP,
  isNinthOrTenthClass,
  generateSubjectCode,
  normalizeSubjectKey,
  matchChoiceSubject,
};
