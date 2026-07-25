/**
 * Stable AIAttendance employee_id values (max 40 chars after Django bump).
 * Format: STU-<mongoId> | STF-<mongoId>
 */

function studentAiEmployeeId(student) {
  if (student?.aiEmployeeId) return String(student.aiEmployeeId);
  const id = String(student?._id || student?.id || '');
  return `STU-${id}`;
}

function staffAiEmployeeId(user) {
  if (user?.aiEmployeeId) return String(user.aiEmployeeId);
  const id = String(user?._id || user?.id || '');
  return `STF-${id}`;
}

function parseAiEmployeeId(employeeId) {
  const id = String(employeeId || '');
  if (id.startsWith('STU-')) {
    return { kind: 'student', mongoId: id.slice(4) };
  }
  if (id.startsWith('STF-')) {
    return { kind: 'staff', mongoId: id.slice(4) };
  }
  return { kind: 'unknown', mongoId: null };
}

function splitPersonName(fullName) {
  const parts = String(fullName || 'Unknown')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { first_name: 'Unknown', last_name: '' };
  if (parts.length === 1) return { first_name: parts[0], last_name: '' };
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
}

function syntheticEmail(employeeId) {
  const local = String(employeeId || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .slice(0, 48);
  return `${local}@ai.attendance.local`;
}

module.exports = {
  studentAiEmployeeId,
  staffAiEmployeeId,
  parseAiEmployeeId,
  splitPersonName,
  syntheticEmail,
};
