/**
 * Shared ascending roll-number order for every student roster
 * (exams, fees, attendance, awards, registration lists, exports).
 */

const { compareClassNames } = require('./classLevelSort');

function rollSortKey(student) {
  if (!student) return '';
  return String(
    student.rollNumber || student.studentId || student.registrationNumber || ''
  ).trim();
}

function nameSortKey(student) {
  return String(student?.studentName || student?.name || '').trim();
}

/** Ascending by roll (1, 2, 10…), empty rolls last, then name. */
function compareStudentsByRollAsc(a, b) {
  const ra = rollSortKey(a);
  const rb = rollSortKey(b);
  if (ra && rb && ra !== rb) {
    return ra.localeCompare(rb, undefined, { numeric: true, sensitivity: 'base' });
  }
  if (ra && !rb) return -1;
  if (!ra && rb) return 1;
  return nameSortKey(a).localeCompare(nameSortKey(b), undefined, { sensitivity: 'base' });
}

function sortStudentsByRollAsc(students) {
  return [...(students || [])].sort(compareStudentsByRollAsc);
}

function classNameOf(student) {
  const c = student?.classId;
  if (c && typeof c === 'object') return c.className || c.name || '';
  return '';
}

function sectionNameOf(student) {
  const s = student?.sectionId;
  if (s && typeof s === 'object') return s.sectionName || s.name || '';
  return '';
}

/** 9th → 10th → 1st Year → 2nd Year, then section, then roll. */
function compareStudentsByClassThenRoll(a, b) {
  const byClass = compareClassNames(classNameOf(a), classNameOf(b));
  if (byClass !== 0) return byClass;
  const bySection = sectionNameOf(a).localeCompare(sectionNameOf(b), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
  if (bySection !== 0) return bySection;
  return compareStudentsByRollAsc(a, b);
}

function sortStudentsByClassThenRoll(students) {
  return [...(students || [])].sort(compareStudentsByClassThenRoll);
}

module.exports = {
  rollSortKey,
  compareStudentsByRollAsc,
  sortStudentsByRollAsc,
  compareStudentsByClassThenRoll,
  sortStudentsByClassThenRoll,
};
