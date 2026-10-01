/**
 * Helpers for college stream classes (1st Year / 2nd Year).
 * Other classes (9th, 10th, …) should not use disciplines.
 *
 * Shared subjects (English, Urdu, Islamiyat / Pakistan Studies) stay on the class
 * and are NOT listed in discipline subjectIds.
 */

const STANDARD_DISCIPLINES = [
  {
    name: 'Medical',
    code: 'medical',
    /** Match class subject names (case-insensitive). */
    subjectHints: ['biology', 'chemistry', 'physics'],
  },
  {
    name: 'Engineering',
    code: 'engineering',
    subjectHints: ['mathematics', 'chemistry', 'physics'],
  },
  {
    name: 'ICS',
    code: 'ics',
    subjectHints: ['computer science', 'mathematics', 'physics'],
  },
];

/** Aliases so "Math" matches "mathematics", "CS" matches "computer science", etc. */
const SUBJECT_ALIASES = {
  mathematics: ['mathematics', 'math', 'maths'],
  biology: ['biology', 'bio'],
  chemistry: ['chemistry', 'chem'],
  physics: ['physics', 'phy'],
  'computer science': ['computer science', 'computer', 'computers', 'ics', 'cs'],
};

/** True when class name looks like intermediate 1st/2nd year. */
function classNameSuggestsDisciplines(className) {
  const n = String(className || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!n) return false;
  const firstYear =
    /\b1st\b/.test(n) ||
    /\bfirst\b/.test(n) ||
    /\byear\s*1\b/.test(n) ||
    /\bxi\b/.test(n) ||
    /\b11th\b/.test(n) ||
    /\bfsc\b/.test(n) ||
    /\bf\.?\s*sc\b/.test(n);
  const secondYear =
    /\b2nd\b/.test(n) ||
    /\bsecond\b/.test(n) ||
    /\byear\s*2\b/.test(n) ||
    /\bxii\b/.test(n) ||
    /\b12th\b/.test(n);
  if (/\b(1st|2nd|first|second)\s*year\b/.test(n)) return true;
  if (/\byear\s*(1|2|i{1,2})\b/.test(n)) return true;
  if (/\b(xi|xii|11th|12th)\b/.test(n)) return true;
  if ((firstYear || secondYear) && /\byear\b/.test(n)) return true;
  return false;
}

function slugifyCode(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Pick subject ids for a standard stream from class subjects.
 * Called independently per discipline (Chemistry/Physics may appear in multiple streams).
 */
function matchSubjectIdsForHints(subjects, hints) {
  const remaining = [...(subjects || [])];
  const picked = [];

  for (const hint of hints) {
    const aliases = SUBJECT_ALIASES[String(hint).toLowerCase()] || [String(hint).toLowerCase()];
    let idx = -1;
    for (const alias of aliases) {
      idx = remaining.findIndex((s) => {
        const name = String(s.subjectName || '').toLowerCase().trim();
        return name === alias || name.startsWith(alias) || name.includes(alias);
      });
      if (idx >= 0) break;
    }
    if (idx < 0) continue;
    picked.push(remaining[idx]._id);
    remaining.splice(idx, 1);
  }

  return picked;
}

module.exports = {
  STANDARD_DISCIPLINES,
  classNameSuggestsDisciplines,
  slugifyCode,
  matchSubjectIdsForHints,
};
