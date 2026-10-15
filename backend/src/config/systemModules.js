/**
 * Canonical list of all academy modules (RBAC + UI routing).
 * Single source of truth — `moduleConfig.js` builds the permission map from this file.
 *
 * Labels/descriptions match frontend `MODULES` in `permissions.ts` so Permissions
 * and Users create/edit show the same names staff already know.
 *
 * - `key` — stored on User.modulePermissions (MongoDB Map keys)
 * - `panelSlug` — frontend panel route segment (must match `ModuleKey` in frontend permissions)
 * - `label` / `icon` — sidebar + permissions matrix display (Lucide icon name string)
 * - `actions` — allowed operations for staff module-permission matrix
 */

const SYSTEM_MODULES = [
  {
    key: 'exam',
    panelSlug: 'exams',
    label: 'Examination',
    icon: 'Award',
    description: 'Test scheduling and exams — enter marks for assigned subjects',
    order: 60,
    actions: ['view', 'create', 'edit', 'delete', 'publish'],
  },
  {
    key: 'attendance',
    panelSlug: 'attendance',
    label: 'Student Attendance',
    icon: 'ClipboardList',
    description: 'Daily student attendance',
    order: 40,
    actions: ['view', 'create', 'edit', 'delete', 'correct'],
  },
  {
    key: 'student',
    panelSlug: 'students',
    label: 'My Students',
    icon: 'GraduationCap',
    description: 'View assigned students',
    order: 30,
    actions: ['view', 'create', 'edit', 'delete', 'activate', 'suspend'],
  },
  {
    key: 'studentManagement',
    panelSlug: 'student-management',
    label: 'Classes & enrollment',
    icon: 'School',
    description: 'Classes, sections, subjects & student registration',
    order: 32,
    actions: ['view', 'create', 'edit', 'delete', 'record', 'generate'],
  },
  {
    key: 'fee',
    panelSlug: 'fees',
    label: 'Fee management',
    icon: 'Wallet',
    description: 'Collect and track fees',
    order: 70,
    actions: ['view', 'create', 'edit', 'delete', 'generate', 'record'],
  },
  {
    key: 'timetable',
    panelSlug: 'timetable',
    label: 'Timetable',
    icon: 'Calendar',
    description: 'View class and own schedules',
    order: 45,
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'announcement',
    panelSlug: 'announcements',
    label: 'Class Announcements',
    icon: 'Bell',
    description: 'Announcements for assigned classes',
    order: 80,
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'chat',
    panelSlug: 'chat',
    label: 'Messages',
    icon: 'MessageSquare',
    description: 'Messaging with students, parents, and staff',
    order: 90,
    actions: ['view', 'create', 'edit', 'delete', 'participate'],
  },
  {
    key: 'reports',
    panelSlug: 'reports',
    label: 'Reports',
    icon: 'BarChart3',
    description: 'Analytics & exports',
    order: 110,
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'datasheets',
    panelSlug: 'datasheets',
    label: 'Datasheets',
    icon: 'FileText',
    description: 'Create & manage spreadsheets',
    order: 120,
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'salary',
    panelSlug: 'salary',
    label: 'Staff salary',
    icon: 'DollarSign',
    description: 'Monthly teacher & staff payroll',
    order: 75,
    actions: ['view', 'create', 'edit', 'delete', 'process', 'generate', 'record'],
  },
  {
    key: 'academyExpense',
    panelSlug: 'expenses',
    label: 'Academy expenses',
    icon: 'Receipt',
    description: 'Operating costs & expenses',
    order: 76,
    actions: ['view', 'create', 'edit', 'delete', 'record'],
  },
  {
    key: 'config',
    panelSlug: 'system-config',
    label: 'Sessions & timetable',
    icon: 'SlidersHorizontal',
    description: 'Academic sessions and timetable infrastructure',
    order: 25,
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'role',
    panelSlug: 'permissions',
    label: 'Permissions',
    icon: 'KeyRound',
    description: 'Roles, API & module access',
    order: 210,
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'user',
    panelSlug: 'users',
    label: 'Users management',
    icon: 'Users',
    description: 'All accounts including parents',
    order: 220,
    actions: ['view', 'create', 'edit', 'delete'],
  },
  // Teacher portal modules
  {
    key: 'myClasses',
    panelSlug: 'my-classes',
    label: 'My Classes',
    icon: 'School',
    description: 'View assigned classes',
    order: 33,
    actions: ['view'],
  },
  {
    key: 'mySubjects',
    panelSlug: 'my-subjects',
    label: 'My Subjects',
    icon: 'BookOpen',
    description: 'View assigned subjects',
    order: 34,
    actions: ['view'],
  },
  {
    key: 'homework',
    panelSlug: 'homework',
    label: 'Homework / Assignments',
    icon: 'NotebookPen',
    description: 'Create and manage own homework',
    order: 50,
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'studyMaterials',
    panelSlug: 'study-materials',
    label: 'Study Materials',
    icon: 'FolderOpen',
    description: 'Upload and manage study materials',
    order: 51,
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'lessonPlans',
    panelSlug: 'lesson-plans',
    label: 'Lesson Plans',
    icon: 'ListChecks',
    description: 'Create and view lesson plans',
    order: 52,
    actions: ['view', 'create', 'edit'],
  },
  {
    key: 'studentProgress',
    panelSlug: 'student-progress',
    label: 'Student Progress',
    icon: 'TrendingUp',
    description: 'Progress reports for assigned students',
    order: 61,
    actions: ['view'],
  },
  {
    key: 'behaviour',
    panelSlug: 'behaviour',
    label: 'Behaviour / Discipline',
    icon: 'ShieldAlert',
    description: 'Behaviour notes and disciplinary remarks',
    order: 62,
    actions: ['view', 'create', 'edit'],
  },
  {
    key: 'parentMeetings',
    panelSlug: 'parent-meetings',
    label: 'Parent Meetings',
    icon: 'UsersRound',
    description: 'Schedule and manage PTM records',
    order: 63,
    actions: ['view', 'create', 'edit'],
  },
  {
    key: 'onlineClasses',
    panelSlug: 'online-classes',
    label: 'Online Classes',
    icon: 'Video',
    description: 'Create and manage online sessions',
    order: 64,
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'library',
    panelSlug: 'library',
    label: 'Library',
    icon: 'Library',
    description: 'View own issued books',
    order: 65,
    actions: ['view'],
  },
  {
    key: 'schoolCalendar',
    panelSlug: 'school-calendar',
    label: 'School Calendar',
    icon: 'CalendarRange',
    description: 'School events calendar',
    order: 66,
    actions: ['view'],
  },
  {
    key: 'notifications',
    panelSlug: 'notifications',
    label: 'Notifications',
    icon: 'BellRing',
    description: 'In-app notifications',
    order: 67,
    actions: ['view'],
  },
  {
    key: 'profile',
    panelSlug: 'settings',
    label: 'My Profile',
    icon: 'User',
    description: 'Update profile and change password',
    order: 200,
    actions: ['view', 'edit'],
  },
  {
    key: 'leave',
    panelSlug: 'leave',
    label: 'Leave Management',
    icon: 'Palmtree',
    description: 'Apply for leave and track status',
    order: 68,
    actions: ['view', 'create'],
  },
  {
    key: 'staffAttendance',
    panelSlug: 'staff-attendance',
    label: 'Teacher Attendance',
    icon: 'Clock',
    description: 'Mark and review teacher / staff attendance',
    order: 41,
    actions: ['view', 'create'],
  },
  {
    key: 'aiAttendance',
    panelSlug: 'ai-attendance',
    label: 'AI Attendance',
    icon: 'ScanFace',
    description: 'Face enrollment, cameras, and sync with recognition service',
    order: 42,
    actions: ['view', 'create', 'edit'],
  },
];

/**
 * Map shape expected by `moduleUtils` and `userController` (key → { name, description, actions }).
 */
function buildModulesMap() {
  const map = {};
  SYSTEM_MODULES.forEach((mod) => {
    map[mod.key] = {
      name: mod.label,
      description: mod.description,
      actions: mod.actions,
    };
  });
  return map;
}

/**
 * Payload for GET /config/system-modules (sidebar + permission UI).
 */
function getSystemModulesForApi() {
  return [...SYSTEM_MODULES]
    .sort((a, b) => a.order - b.order)
    .map((mod) => ({
      key: mod.key,
      panelSlug: mod.panelSlug,
      label: mod.label,
      icon: mod.icon,
      description: mod.description,
      actions: mod.actions,
      order: mod.order,
    }));
}

module.exports = {
  SYSTEM_MODULES,
  buildModulesMap,
  getSystemModulesForApi,
};
