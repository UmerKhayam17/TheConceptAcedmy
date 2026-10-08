/**
 * Academic class order for academy:
 * 9th → 10th → … → 12th → 1st Year → 2nd Year (sections A, B, C within each).
 */

function ordinalSuffix(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  switch (n % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

function formatClassLevelLabel(raw) {
  const input = String(raw || '').trim();
  if (!input) return '';

  const lower = input.toLowerCase().replace(/\s+/g, ' ');

  if (/^(1st|first|1)\s*year$/i.test(lower)) return '1st Year';
  if (/^(2nd|second|2)\s*year$/i.test(lower)) return '2nd Year';

  const yearWithSection = input.match(/^(1st|first|1)\s*year\s*([-–—/\s]+)(.+)$/i);
  if (yearWithSection) return `1st Year-${yearWithSection[3].trim()}`;
  const year2WithSection = input.match(/^(2nd|second|2)\s*year\s*([-–—/\s]+)(.+)$/i);
  if (year2WithSection) return `2nd Year-${year2WithSection[3].trim()}`;

  if (/^(1|1st)$/i.test(input)) return '1st Year';
  if (/^(2|2nd)$/i.test(input)) return '2nd Year';

  const bareYearSection = input.match(/^([12])\s*([-–—/])\s*(.+)$/);
  if (bareYearSection) {
    const year = bareYearSection[1] === '1' ? '1st Year' : '2nd Year';
    return `${year}-${bareYearSection[3].trim()}`;
  }

  const grade = input.match(/^(?:class\s*)?(\d{1,2})(?:st|nd|rd|th)?\s*([-–—/\s]*)(.*)$/i);
  if (grade) {
    const n = Number(grade[1]);
    if (n >= 1 && n <= 12) {
      if ((n === 1 || n === 2) && !String(grade[3] || '').trim()) {
        return n === 1 ? '1st Year' : '2nd Year';
      }
      const ord = `${n}${ordinalSuffix(n)}`;
      const rest = String(grade[3] || '').trim();
      if (!rest) return ord;
      const sep = grade[2] && /[-–—/]/.test(grade[2]) ? '-' : grade[2]?.trim() ? ' ' : '-';
      return `${ord}${sep}${rest}`;
    }
  }

  return input;
}

/** Sort weight: grades 3–12 by number; 1st Year=101; 2nd Year=102. */
function classLevelWeight(raw) {
  const label = formatClassLevelLabel(raw);
  if (/^1st\s*year/i.test(label)) return 101;
  if (/^2nd\s*year/i.test(label)) return 102;
  const m = label.match(/^(\d{1,2})/);
  if (m) {
    const n = Number(m[1]);
    if (n === 1 || n === 2) return 100 + n; // safety
    return n;
  }
  return 999;
}

function sectionSuffix(raw) {
  const label = formatClassLevelLabel(raw);
  const year = label.match(/^(?:1st Year|2nd Year)-(.+)$/i);
  if (year) return year[1].trim();
  const g = label.match(/^\d{1,2}(?:st|nd|rd|th)?[-–—/\s]+(.+)$/i);
  if (g) return g[1].trim();
  return '';
}

function compareClassNames(a, b) {
  const wa = classLevelWeight(a);
  const wb = classLevelWeight(b);
  if (wa !== wb) return wa - wb;
  const sa = sectionSuffix(a);
  const sb = sectionSuffix(b);
  if (sa || sb) {
    const sec = sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' });
    if (sec !== 0) return sec;
  }
  return String(a || '').localeCompare(String(b || ''), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function sortClassesByLevel(classes) {
  return [...classes].sort((a, b) =>
    compareClassNames(a.className || a.name || '', b.className || b.name || '')
  );
}

function sortSectionsByName(sections) {
  return [...sections].sort((a, b) =>
    String(a.sectionName || a.name || '').localeCompare(String(b.sectionName || b.name || ''), undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  );
}

/**
 * Soft academic program bucket from className (no separate Program model).
 * School = grades; College = 1st/2nd Year intermediate; Other = everything else.
 */
function academicProgram(raw) {
  const weight = classLevelWeight(raw);
  if (weight >= 101 && weight <= 102) return 'college';
  if (weight >= 1 && weight <= 12) return 'school';
  return 'other';
}

function academicProgramLabel(program) {
  if (program === 'college') return 'College / Intermediate';
  if (program === 'school') return 'School';
  return 'Other programs';
}

module.exports = {
  formatClassLevelLabel,
  classLevelWeight,
  compareClassNames,
  sortClassesByLevel,
  sortSectionsByName,
  academicProgram,
  academicProgramLabel,
};
