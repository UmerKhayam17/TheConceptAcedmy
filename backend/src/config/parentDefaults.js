/**
 * Canonical parent portal RBAC — keep in sync with frontend
 * `PARENT_DEFAULT_MODULE_PERMISSIONS` in staffApi.ts.
 *
 * Allowed: dashboard (always in UI), students, attendance, timetable view only,
 * exams, chat, announcements, notifications.
 * Forbidden: fees, registration, staff/admin, salary, settings, timetable builder/board,
 * school calendar (no parent feature).
 */

const PARENT_DEFAULT_MODULE_PERMISSIONS = {
  student: ['view'],
  attendance: ['view'],
  examTests: ['view'],
  examTerm: ['view'],
  examDateSheet: ['view'],
  examReportCard: ['view'],
  timetableView: ['view'],
  chat: ['view', 'create', 'participate'],
  announcement: ['view'],
  notifications: ['view'],
};

/** Module keys parents must never retain (even if previously granted). */
const PARENT_FORBIDDEN_MODULE_KEYS = [
  'timetableBuilder',
  'timetableBoard',
  'timetable',
  'fee',
  'feeStructure',
  'studentRegistration',
  'changeSection',
  'salary',
  'academyExpense',
  'profile',
  'role',
  'parentUsers',
  'staffUsers',
  'adminUsers',
  'user',
  'studentManagement',
  'config',
  'classes',
  'sections',
  'subjects',
  'disciplines',
  'sessions',
  'sessionHistory',
  'rooms',
  'periods',
  'timetableRules',
  'teachers',
  'subjectTeachers',
  'testCatalog',
  'examCatalog',
  'staffAttendance',
  'aiAttendance',
  'datasheets',
  'reports',
  'myClasses',
  'mySubjects',
  'schoolCalendar',
];

const PARENT_PERMISSION_NAMES = [
  'view_attendance',
  'view_results',
  'use_chat',
  'view_timetables',
  'view_academy_students',
];

function parentModulePermissionsMap() {
  return new Map(Object.entries(PARENT_DEFAULT_MODULE_PERMISSIONS));
}

function parentModulePermissionsObject() {
  return { ...PARENT_DEFAULT_MODULE_PERMISSIONS };
}

/**
 * Normalize an existing parent modulePermissions map/object to the canonical portal set:
 * drop forbidden keys, ensure required defaults exist.
 */
function normalizeParentModulePermissions(existing) {
  const asMap =
    existing instanceof Map
      ? new Map(existing)
      : new Map(Object.entries(existing && typeof existing === 'object' ? existing : {}));

  PARENT_FORBIDDEN_MODULE_KEYS.forEach((key) => {
    asMap.delete(key);
  });

  Object.entries(PARENT_DEFAULT_MODULE_PERMISSIONS).forEach(([key, actions]) => {
    if (!asMap.has(key) || !Array.isArray(asMap.get(key)) || asMap.get(key).length === 0) {
      asMap.set(key, [...actions]);
    }
  });

  return asMap;
}

module.exports = {
  PARENT_DEFAULT_MODULE_PERMISSIONS,
  PARENT_FORBIDDEN_MODULE_KEYS,
  PARENT_PERMISSION_NAMES,
  parentModulePermissionsMap,
  parentModulePermissionsObject,
  normalizeParentModulePermissions,
};
