/**
 * Default core subjects created by "Auto initialize" on a class.
 * Idempotent — existing names/codes are skipped.
 */

const DEFAULT_ACADEMY_SUBJECTS = [
  { subjectName: 'English' },
  { subjectName: 'Urdu' },
  { subjectName: 'Mathematics' },
  { subjectName: 'Physics' },
  { subjectName: 'Chemistry' },
  { subjectName: 'Biology' },
  { subjectName: 'Computer Science' },
  { subjectName: 'Islamiat' },
  { subjectName: 'Pakistan Studies' },
];

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

module.exports = {
  DEFAULT_ACADEMY_SUBJECTS,
  generateSubjectCode,
};
