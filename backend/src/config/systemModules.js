/**
 * Canonical list of all academy modules (RBAC + UI routing).
 * Single source of truth — `moduleConfig.js` builds the permission map from this file.
 *
 * - `key` — stored on User.modulePermissions (MongoDB Map keys)
 * - `panelSlug` — frontend panel route segment (must match `ModuleKey` in frontend permissions)
 * - `label` / `icon` — sidebar display (Lucide icon name string)
 * - `actions` — allowed operations for staff module-permission matrix
 */

const SYSTEM_MODULES = [
  {
    key: 'exam',
    panelSlug: 'exams',
    label: 'Exam & Results',
    icon: 'Award',
    description: 'Exams, marks, results, and report cards',
    order: 60,
    actions: ['view', 'create', 'edit', 'delete', 'publish'],
  },
  {
    key: 'attendance',
    panelSlug: 'attendance',
    label: 'Attendance',
    icon: 'ClipboardList',
    description: 'Daily attendance and corrections',
    order: 40,
    actions: ['view', 'create', 'edit', 'delete', 'correct'],
  },
  {
    key: 'student',
    panelSlug: 'students',
    label: 'Students',
    icon: 'GraduationCap',
    description: 'Admission, profiles, and student records',
    order: 30,
    actions: ['view', 'create', 'edit', 'delete', 'activate', 'suspend'],
  },
  {
    key: 'studentManagement',
    panelSlug: 'student-management',
    label: 'Student Management',
    icon: 'School',
    description: 'Classes, subjects, fee structure, enrollment & tuition fees',
    order: 32,
    actions: ['view', 'create', 'edit', 'delete', 'record', 'generate'],
  },
  {
    key: 'fee',
    panelSlug: 'fees',
    label: 'Fees',
    icon: 'Wallet',
    description: 'Fee structures, vouchers, and payments',
    order: 70,
    actions: ['view', 'create', 'edit', 'delete', 'generate', 'record'],
  },
  {
    key: 'timetable',
    panelSlug: 'timetable',
    label: 'Timetable',
    icon: 'Calendar',
    description: 'Build, publish and view class schedules',
    order: 45,
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'announcement',
    panelSlug: 'announcements',
    label: 'Announcements',
    icon: 'Bell',
    description: 'Notices and school-wide messages',
    order: 80,
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'chat',
    panelSlug: 'chat',
    label: 'Chat',
    icon: 'MessageSquare',
    description: 'Messaging between staff, parents, and students',
    order: 90,
    actions: ['view', 'create', 'edit', 'delete', 'participate'],
  },
  {
    key: 'reports',
    panelSlug: 'reports',
    label: 'Reports',
    icon: 'BarChart3',
    description: 'Analytics and exports',
    order: 110,
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'datasheets',
    panelSlug: 'datasheets',
    label: 'Datasheets',
    icon: 'FileText',
    description: 'Spreadsheets and structured data',
    order: 120,
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'salary',
    panelSlug: 'salary',
    label: 'Teacher salary',
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
    description: 'Rent, utilities, supplies & operating costs',
    order: 76,
    actions: ['view', 'create', 'edit', 'delete', 'record'],
  },
  {
    key: 'config',
    panelSlug: 'system-config',
    label: 'System Configuration',
    icon: 'SlidersHorizontal',
    description: 'Sessions, classes, sections, subjects, periods, rooms, teachers & timetable rules',
    order: 25,
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'role',
    panelSlug: 'settings',
    label: 'Roles & permissions',
    icon: 'UserCog',
    description: 'Role definitions and permission overrides',
    order: 210,
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    key: 'user',
    panelSlug: 'users',
    label: 'Staff / users',
    icon: 'UserCog',
    description: 'Staff accounts, salary, and module access',
    order: 220,
    actions: ['view', 'create', 'edit', 'delete'],
  },
  // Teacher portal modules
  {
    key: 'myClasses',
    panelSlug: 'my-classes',
    label: 'My Classes',
    icon: 'School',
    description: 'Classes assigned to the teacher',
    order: 33,
    actions: ['view'],
  },
  {
    key: 'mySubjects',
    panelSlug: 'my-subjects',
    label: 'My Subjects',
    icon: 'BookOpen',
    description: 'Subjects assigned to the teacher',
    order: 34,
    actions: ['view'],
  },
  {
    key: 'homework',
    panelSlug: 'homework',
    label: 'Homework / Assignments',
    icon: 'NotebookPen',
    description: 'Create and manage homework for assigned classes',
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
    description: 'View issued books',
    order: 65,
    actions: ['view'],
  },
  {
    key: 'schoolCalendar',
    panelSlug: 'school-calendar',
    label: 'School Calendar',
    icon: 'CalendarRange',
    description: 'School events and calendar',
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
    description: 'Update own profile and password',
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
    label: 'My Attendance',
    icon: 'Clock',
    description: 'View own attendance and request corrections',
    order: 41,
    actions: ['view', 'create'],
  },
  {
    key: 'aiAttendance',
    panelSlug: 'ai-attendance',
    label: 'AI Attendance',
    icon: 'ScanFace',
    description: 'Face enrollment, cameras, and AI attendance sync',
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
