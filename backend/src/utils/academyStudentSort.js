/**
 * Shared ascending roll-number order for every student roster
 * (exams, fees, attendance, awards, registration lists, exports).
 */

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

module.exports = {
  rollSortKey,
  compareStudentsByRollAsc,
  sortStudentsByRollAsc,
};
