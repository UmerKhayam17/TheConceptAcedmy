// Per-role module defaults; live access comes from the server via `modulePermissions` on login.
// Levels (in increasing power): none < view < mark < grade < process < crud < full
// "process" / "mark" / "grade" are role-flavoured aliases that all imply read+write
// on a constrained scope (kept distinct so labels in the UI match the spec sheet).

import { Role } from "./auth";
import { HUB_LEAF_KEYS } from "./sectionModuleKeys";

export type PermLevel =
  | "none"
  | "view"
  | "mark"
  | "grade"
  | "process"
  | "crud"
  | "full";

export const PERM_RANK: Record<PermLevel, number> = {
  none: 0, view: 1, mark: 2, grade: 3, process: 4, crud: 5, full: 6,
};

export const canRead  = (p: PermLevel) => PERM_RANK[p] >= PERM_RANK.view;
export const canWrite = (p: PermLevel) => PERM_RANK[p] >= PERM_RANK.mark;
export const canCRUD  = (p: PermLevel) => PERM_RANK[p] >= PERM_RANK.crud;

export type ModuleKey =
  | "dashboard"
  | "users"
  | "staff-management"
  /** Route hubs (URL slugs) — permission checks use leaf keys */
  | "student-management"
  | "system-config"
  | "timetable"
  | "exams"
  /** Academic setup leaves */
  | "sessions"
  | "session-history"
  | "classes"
  | "sections"
  | "subjects"
  | "disciplines"
  | "test-catalog"
  | "exam-catalog"
  | "rooms"
  | "periods"
  | "timetable-rules"
  | "teachers"
  | "subject-teachers"
  /** Student ops leaves */
  | "student-registration"
  | "change-section"
  | "students"
  | "my-classes"
  | "my-subjects"
  | "attendance"
  | "staff-attendance"
  | "ai-attendance"
  /** Timetable leaves */
  | "timetable-builder"
  | "timetable-board"
  | "timetable-view"
  /** Examination leaves */
  | "exam-tests"
  | "exam-term"
  | "exam-date-sheet"
  | "exam-report-card"
  | "homework"
  | "study-materials"
  | "lesson-plans"
  | "student-progress"
  | "behaviour"
  | "parent-meetings"
  | "online-classes"
  | "library"
  | "school-calendar"
  | "notifications"
  | "leave"
  | "finance-dashboard"
  | "fee-structure"
  | "fees"
  | "salary"
  | "expenses"
  | "chat"
  | "announcements"
  | "reports"
  | "datasheets"
  | "settings"
  | "permissions"
  | "permission-catalog";

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  /** Shorter label for sidebar when the full title would wrap or clip */
  shortLabel?: string;
  icon: string;       // lucide icon name
  desc: string;
  /** When false, hidden from sidebar and dashboard module tiles (route may still work). */
  showInNav?: boolean;
}

export const MODULES: ModuleDef[] = [
  { key: "dashboard", label: "Dashboard", icon: "LayoutDashboard", desc: "Overview & key metrics" },
  // Route hubs (URL slugs) — not shown as permission rows; leaves are granted instead
  {
    key: "system-config",
    label: "Sessions & timetable",
    shortLabel: "Sessions",
    icon: "SlidersHorizontal",
    desc: "Academic sessions and timetable infrastructure",
    showInNav: false,
  },
  {
    key: "student-management",
    label: "Classes & enrollment",
    shortLabel: "Enrollment",
    icon: "School",
    desc: "Classes, sections, subjects & student registration",
    showInNav: false,
  },
  {
    key: "timetable",
    label: "Timetable",
    icon: "Calendar",
    desc: "View class and own schedules",
    showInNav: false,
  },
  {
    key: "exams",
    label: "Examination",
    shortLabel: "Examination",
    icon: "Award",
    desc: "Test scheduling and exams — enter marks for assigned subjects",
    showInNav: false,
  },
  // Academic setup leaves
  { key: "sessions", label: "Sessions", icon: "GraduationCap", desc: "Academic sessions" },
  { key: "session-history", label: "Session History", icon: "History", desc: "Past academic sessions" },
  { key: "classes", label: "Classes", icon: "School", desc: "Class definitions" },
  { key: "sections", label: "Sections", icon: "Layers", desc: "Class sections" },
  { key: "subjects", label: "Subjects", icon: "BookOpen", desc: "Subjects and weightage" },
  { key: "disciplines", label: "Disciplines", icon: "Route", desc: "Discipline / stream definitions" },
  { key: "test-catalog", label: "Assessment Catalog — Tests", shortLabel: "Tests", icon: "ClipboardList", desc: "Test types and catalog" },
  { key: "exam-catalog", label: "Assessment Catalog — Exams", shortLabel: "Exam catalog", icon: "Award", desc: "Exam types and catalog" },
  { key: "rooms", label: "Rooms", icon: "DoorOpen", desc: "Classrooms and facilities" },
  { key: "periods", label: "Academy Time Configuration", shortLabel: "Periods", icon: "Clock", desc: "Period and bell schedule" },
  { key: "timetable-rules", label: "Timetable Rules", icon: "SlidersHorizontal", desc: "Timetable generation rules" },
  { key: "teachers", label: "Teachers", icon: "UserCircle", desc: "Teacher directory in setup" },
  { key: "subject-teachers", label: "Subject Teachers", icon: "Link2", desc: "Assign teachers to subjects" },
  { key: "timetable-builder", label: "Timetable Builder", icon: "LayoutGrid", desc: "Build and publish timetables" },
  { key: "timetable-board", label: "Class Board", icon: "Table2", desc: "Class timetable board" },
  // Student ops
  { key: "student-registration", label: "Register Student", icon: "UserPlus", desc: "Register and enroll students" },
  { key: "change-section", label: "Change Section", icon: "ArrowLeftRight", desc: "Move students between sections" },
  {
    key: "students",
    label: "My Students",
    shortLabel: "Students",
    icon: "GraduationCap",
    desc: "View assigned students",
  },
  { key: "my-classes", label: "My Classes", icon: "School", desc: "View assigned classes" },
  { key: "my-subjects", label: "My Subjects", icon: "BookOpen", desc: "View assigned subjects" },
  { key: "attendance", label: "Student Attendance", icon: "ClipboardList", desc: "Daily student attendance" },
  {
    key: "staff-attendance",
    label: "Teacher Attendance",
    icon: "Clock",
    desc: "Mark and review teacher / staff attendance",
  },
  {
    key: "ai-attendance",
    label: "AI Attendance",
    icon: "ScanFace",
    desc: "Face enrollment, cameras, and sync with recognition service",
  },
  { key: "timetable-view", label: "Student Timetable", icon: "CalendarDays", desc: "View class and student schedules" },
  // Examination leaves
  { key: "exam-tests", label: "Test Scheduling", icon: "ClipboardList", desc: "Schedule and mark class tests" },
  { key: "exam-term", label: "Exams", icon: "Award", desc: "Term / mid / final exams and marks" },
  { key: "exam-date-sheet", label: "Date sheet", icon: "CalendarDays", desc: "Exam date sheets and schedules" },
  { key: "exam-report-card", label: "Report Card", icon: "FileBadge", desc: "Generate and view report cards" },
  {
    key: "homework",
    label: "Homework / Assignments",
    shortLabel: "Homework",
    icon: "NotebookPen",
    desc: "Create and manage own homework",
  },
  {
    key: "study-materials",
    label: "Study Materials",
    icon: "FolderOpen",
    desc: "Upload and manage study materials",
  },
  {
    key: "lesson-plans",
    label: "Lesson Plans",
    icon: "ListChecks",
    desc: "Create and view lesson plans",
  },
  {
    key: "student-progress",
    label: "Student Progress",
    icon: "TrendingUp",
    desc: "Progress reports for assigned students",
  },
  {
    key: "behaviour",
    label: "Behaviour / Discipline",
    shortLabel: "Behaviour",
    icon: "ShieldAlert",
    desc: "Behaviour notes and disciplinary remarks",
  },
  {
    key: "parent-meetings",
    label: "Parent Meetings",
    icon: "UsersRound",
    desc: "Schedule and manage PTM records",
  },
  {
    key: "online-classes",
    label: "Online Classes",
    icon: "Video",
    desc: "Create and manage online sessions",
  },
  { key: "library", label: "Library", icon: "Library", desc: "View own issued books" },
  {
    key: "school-calendar",
    label: "School Calendar",
    icon: "CalendarRange",
    desc: "School events calendar",
  },
  {
    key: "notifications",
    label: "Notifications",
    icon: "BellRing",
    desc: "In-app notifications",
  },
  {
    key: "leave",
    label: "Leave Management",
    shortLabel: "Leave",
    icon: "Palmtree",
    desc: "Apply for leave and track status",
  },
  {
    key: "finance-dashboard",
    label: "Finance Dashboard",
    shortLabel: "Finance",
    icon: "Wallet",
    desc: "Fees, expenses, and financial analytics overview",
  },
  { key: "fee-structure", label: "Fee Structure", icon: "Wallet", desc: "Define fee structures" },
  { key: "fees", label: "Fee management", icon: "Wallet", desc: "Collect and track fees" },
  { key: "salary", label: "Staff salary", icon: "DollarSign", desc: "Monthly teacher & staff payroll" },
  { key: "expenses", label: "Academy expenses", icon: "Receipt", desc: "Operating costs & expenses" },
  { key: "chat", label: "Messages", icon: "MessageSquare", desc: "Messaging with students, parents, and staff" },
  {
    key: "announcements",
    label: "Class Announcements",
    shortLabel: "Announcements",
    icon: "Bell",
    desc: "Announcements for assigned classes",
  },
  { key: "reports", label: "Reports", icon: "BarChart3", desc: "Analytics & exports" },
  { key: "datasheets", label: "Datasheets", icon: "FileText", desc: "Create & manage spreadsheets" },
  { key: "users", label: "Users management", shortLabel: "Users", icon: "Users", desc: "All accounts including parents" },
  { key: "staff-management", label: "Staff management", shortLabel: "Staff", icon: "UserCog", desc: "Teachers and accountants only" },
  { key: "permissions", label: "Permissions", icon: "KeyRound", desc: "Roles, API & module access" },
  {
    key: "permission-catalog",
    label: "API permissions",
    shortLabel: "API permissions",
    icon: "ListTree",
    desc: "Full table of permission definitions",
    showInNav: false,
  },
  { key: "settings", label: "My Profile", icon: "User", desc: "Update profile and change password" },
];

/** Every panel module key (from MODULES — add new modules there first). */
export function allModuleKeys(): ModuleKey[] {
  return MODULES.map((m) => m.key);
}

/** Full access on every module — used for admin (auto-updates when MODULES grows). */
export function fullAccessMatrix(): Record<ModuleKey, PermLevel> {
  const o = {} as Record<ModuleKey, PermLevel>;
  for (const m of MODULES) o[m.key] = "full";
  return o;
}

/** Baseline matrix: every module at `fill`, then apply overrides. */
export function modulePermMatrix(
  overrides: Partial<Record<ModuleKey, PermLevel>>,
  fill: PermLevel = "none",
): Record<ModuleKey, PermLevel> {
  const o = {} as Record<ModuleKey, PermLevel>;
  for (const m of MODULES) o[m.key] = fill;
  return { ...o, ...overrides };
}

/** Dashboard tile groups (sidebar uses `sidebarNav.ts`). */
export const SIDEBAR_NAV_GROUPS: { id: string; label: string; modules: ModuleKey[] }[] = [
  { id: "overview", label: "Dashboard", modules: ["dashboard"] },
  {
    id: "academic-setup",
    label: "Academic Setup",
    modules: [
      "sessions",
      "session-history",
      "classes",
      "sections",
      "subjects",
      "disciplines",
      "test-catalog",
      "exam-catalog",
      "rooms",
      "periods",
      "timetable-rules",
      "timetable-builder",
      "timetable-board",
    ],
  },
  {
    id: "student-management",
    label: "Student Management",
    modules: [
      "student-registration",
      "students",
      "attendance",
      "ai-attendance",
      "change-section",
      "timetable-view",
    ],
  },
  {
    id: "teacher-management",
    label: "Teacher Management",
    modules: ["teachers", "subject-teachers", "staff-attendance"],
  },
  {
    id: "teaching",
    label: "Teaching",
    modules: [
      "my-classes",
      "my-subjects",
      "homework",
      "study-materials",
      "lesson-plans",
      "exam-tests",
      "exam-term",
      "exam-date-sheet",
      "exam-report-card",
      "student-progress",
      "behaviour",
      "parent-meetings",
      "online-classes",
    ],
  },
  {
    id: "finance",
    label: "Finance",
    modules: ["finance-dashboard", "fee-structure", "fees", "salary", "expenses"],
  },
  {
    id: "communication",
    label: "Communication",
    modules: ["chat", "announcements", "notifications", "library", "school-calendar", "leave"],
  },
  { id: "reports", label: "Reports", modules: ["reports", "datasheets"] },
  {
    id: "administration",
    label: "Administration",
    modules: ["users", "staff-management", "permissions", "settings"],
  },
];

const STUDENT_MGMT_LEAF_VIEW: Partial<Record<ModuleKey, PermLevel>> = {
  classes: "view",
  sections: "view",
  subjects: "view",
  disciplines: "view",
  "student-registration": "view",
  "change-section": "view",
  "fee-structure": "view",
};

const STUDENT_MGMT_LEAF_PROCESS: Partial<Record<ModuleKey, PermLevel>> = {
  classes: "process",
  sections: "process",
  subjects: "process",
  disciplines: "process",
  "student-registration": "process",
  "change-section": "process",
  "fee-structure": "process",
};

const EXAM_LEAF_VIEW: Partial<Record<ModuleKey, PermLevel>> = {
  "exam-tests": "view",
  "exam-term": "view",
  "exam-date-sheet": "view",
  "exam-report-card": "view",
};

const TIMETABLE_LEAF_VIEW: Partial<Record<ModuleKey, PermLevel>> = {
  "timetable-builder": "view",
  "timetable-board": "view",
  "timetable-view": "view",
};

// Default matrix — admin is always full on every MODULES entry (do not list by hand).
export const DEFAULT_PERMISSIONS: Record<Role, Record<ModuleKey, PermLevel>> = {
  admin: fullAccessMatrix(),
  accountant: modulePermMatrix({
    dashboard: "view",
    ...STUDENT_MGMT_LEAF_PROCESS,
    students: "view",
    attendance: "view",
    "staff-attendance": "view",
    ...EXAM_LEAF_VIEW,
    "school-calendar": "view",
    notifications: "view",
    leave: "mark",
    "finance-dashboard": "view",
    fees: "crud",
    salary: "process",
    expenses: "crud",
    chat: "view",
    reports: "view",
    datasheets: "crud",
    settings: "view",
  }),
  teacher: modulePermMatrix({
    dashboard: "full",
    ...STUDENT_MGMT_LEAF_VIEW,
    students: "view",
    "my-classes": "view",
    "my-subjects": "view",
    attendance: "mark",
    "staff-attendance": "view",
    ...TIMETABLE_LEAF_VIEW,
    homework: "crud",
    "study-materials": "crud",
    "lesson-plans": "grade",
    ...EXAM_LEAF_VIEW,
    "student-progress": "view",
    behaviour: "grade",
    "parent-meetings": "grade",
    "online-classes": "crud",
    library: "view",
    "school-calendar": "view",
    notifications: "view",
    leave: "mark",
    salary: "view",
    chat: "view",
    announcements: "grade",
    reports: "view",
    settings: "view",
  }),
  parent: modulePermMatrix({
    dashboard: "view",
    students: "view",
    attendance: "view",
    ...TIMETABLE_LEAF_VIEW,
    ...EXAM_LEAF_VIEW,
    chat: "view",
    announcements: "view",
    notifications: "view",
    "school-calendar": "view",
  }),
  student: modulePermMatrix({
    dashboard: "view",
    students: "view",
    attendance: "view",
    ...TIMETABLE_LEAF_VIEW,
    homework: "view",
    "study-materials": "view",
    ...EXAM_LEAF_VIEW,
    "student-progress": "view",
    "online-classes": "view",
    library: "view",
    "school-calendar": "view",
    notifications: "view",
    fees: "view",
    chat: "view",
    announcements: "view",
    datasheets: "view",
    settings: "view",
  }),
};

const PERM_KEY = "tces_permissions_v1";
const PERM_EVT = "tces-permissions-change";

/** Legacy coarse backend keys → leaf panel keys (client-side expand). */
export const LEGACY_BACKEND_EXPANSION: Record<string, string[]> = {
  exam: ["examTests", "examTerm", "examDateSheet", "examReportCard"],
  config: [
    "sessions",
    "sessionHistory",
    "rooms",
    "periods",
    "timetableRules",
    "testCatalog",
    "examCatalog",
    "teachers",
    "subjectTeachers",
  ],
  studentManagement: [
    "classes",
    "sections",
    "subjects",
    "disciplines",
    "studentRegistration",
    "changeSection",
    "feeStructure",
  ],
  timetable: ["timetableBuilder", "timetableBoard", "timetableView"],
};

export function expandBackendModulePermissions(
  backendPerms?: Record<string, string[]>,
): Record<string, string[]> {
  if (!backendPerms || typeof backendPerms !== "object") return {};
  const out: Record<string, string[]> = { ...backendPerms };
  const merge = (a: string[] | undefined, b: string[]) =>
    [...new Set([...(a || []), ...b])];

  Object.entries(LEGACY_BACKEND_EXPANSION).forEach(([legacy, leaves]) => {
    const actions = backendPerms[legacy];
    if (!Array.isArray(actions) || actions.length === 0) return;
    leaves.forEach((leaf) => {
      out[leaf] = merge(out[leaf], actions);
    });
  });
  return out;
}

export const BACKEND_MODULE_KEY_MAP: Record<string, ModuleKey> = {
  // Coarse hubs (still mapped for routing / legacy payloads)
  exam: "exams",
  config: "system-config",
  studentManagement: "student-management",
  timetable: "timetable",
  // Examination leaves
  examTests: "exam-tests",
  examTerm: "exam-term",
  examDateSheet: "exam-date-sheet",
  examReportCard: "exam-report-card",
  // Academic setup leaves
  sessions: "sessions",
  sessionHistory: "session-history",
  classes: "classes",
  sections: "sections",
  subjects: "subjects",
  disciplines: "disciplines",
  testCatalog: "test-catalog",
  examCatalog: "exam-catalog",
  rooms: "rooms",
  periods: "periods",
  timetableRules: "timetable-rules",
  teachers: "teachers",
  subjectTeachers: "subject-teachers",
  studentRegistration: "student-registration",
  changeSection: "change-section",
  feeStructure: "fee-structure",
  timetableBuilder: "timetable-builder",
  timetableBoard: "timetable-board",
  timetableView: "timetable-view",
  // Existing
  attendance: "attendance",
  student: "students",
  myClasses: "my-classes",
  mySubjects: "my-subjects",
  homework: "homework",
  studyMaterials: "study-materials",
  lessonPlans: "lesson-plans",
  studentProgress: "student-progress",
  behaviour: "behaviour",
  parentMeetings: "parent-meetings",
  onlineClasses: "online-classes",
  library: "library",
  schoolCalendar: "school-calendar",
  notifications: "notifications",
  profile: "settings",
  leave: "leave",
  staffAttendance: "staff-attendance",
  aiAttendance: "ai-attendance",
  fee: "fees",
  announcement: "announcements",
  chat: "chat",
  reports: "reports",
  datasheets: "datasheets",
  salary: "salary",
  academyExpense: "expenses",
  role: "permissions",
  user: "users",
};

const PANEL_MODULE_TO_BACKEND_KEY: Partial<Record<ModuleKey, string>> = (() => {
  const m: Partial<Record<ModuleKey, string>> = {};
  (Object.entries(BACKEND_MODULE_KEY_MAP) as [string, ModuleKey][]).forEach(([backendKey, panelKey]) => {
    m[panelKey] = backendKey;
  });
  return m;
})();

/** Fine-grained UI gates from backend `modulePermissions` action lists or from coarse `PermLevel` defaults. */
export interface ModuleActionCaps {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  /** Chat: send messages (backend action `participate`). */
  canParticipate: boolean;
}

export function emptyActionCaps(): ModuleActionCaps {
  return {
    canView: false,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canParticipate: false,
  };
}

export function sessionHasExplicitModulePayload(
  backendPerms?: Record<string, string[]>,
): boolean {
  if (!backendPerms || typeof backendPerms !== "object") return false;
  return Object.values(backendPerms).some(
    (actions) => Array.isArray(actions) && actions.length > 0,
  );
}

/** Map Mongo action strings to UI capabilities (matrix toggles are independent). */
export function capsFromBackendActions(actions: string[]): ModuleActionCaps {
  const s = new Set((actions || []).map((a) => String(a).toLowerCase()));
  const has = (x: string) => s.has(x);
  const canParticipate = has("participate");
  const canCreate = has("create") || has("generate") || has("publish") || has("approve");
  const canEdit =
    has("edit")
    || has("correct")
    || has("record")
    || has("mark")
    || has("grade")
    || has("process")
    || has("submit")
    || has("activate")
    || has("suspend");
  const canDelete = has("delete");
  const canView =
    has("view")
    || canParticipate
    || canCreate
    || canEdit
    || canDelete;
  return { canView, canCreate, canEdit, canDelete, canParticipate };
}

/** When there is no per-action payload, infer caps from the legacy level matrix. */
export function capsFromPermLevel(p: PermLevel): ModuleActionCaps {
  if (!p || p === "none") return emptyActionCaps();
  if (p === "full" || p === "crud") {
    return { canView: true, canCreate: true, canEdit: true, canDelete: true, canParticipate: true };
  }
  if (p === "view") {
    return { canView: true, canCreate: false, canEdit: false, canDelete: false, canParticipate: false };
  }
  if (p === "mark") {
    return { canView: true, canCreate: false, canEdit: true, canDelete: false, canParticipate: false };
  }
  if (p === "grade") {
    return { canView: true, canCreate: true, canEdit: true, canDelete: false, canParticipate: false };
  }
  if (p === "process") {
    return { canView: true, canCreate: false, canEdit: true, canDelete: false, canParticipate: false };
  }
  return emptyActionCaps();
}

/** Minimal `PermLevel` for routing / coarse checks; use `ModuleActionCaps` for buttons. */
export function permLevelFromActionCaps(caps: ModuleActionCaps): PermLevel {
  if (!caps.canView) return "none";
  if (caps.canDelete) return "crud";
  if (caps.canCreate || caps.canEdit || caps.canParticipate) return "mark";
  return "view";
}

function mergeActionCaps(a: ModuleActionCaps, b: ModuleActionCaps): ModuleActionCaps {
  return {
    canView: a.canView || b.canView,
    canCreate: a.canCreate || b.canCreate,
    canEdit: a.canEdit || b.canEdit,
    canDelete: a.canDelete || b.canDelete,
    canParticipate: a.canParticipate || b.canParticipate,
  };
}

/** Panel Fee Management merges fee + feeStructure (and legacy studentManagement). */
function capsForFeesModule(backendPerms: Record<string, string[]>): ModuleActionCaps {
  const feeCaps = capsFromBackendActions(backendPerms.fee || []);
  const structureCaps = capsFromBackendActions(backendPerms.feeStructure || []);
  const academyCaps = capsFromBackendActions(backendPerms.studentManagement || []);
  return mergeActionCaps(mergeActionCaps(feeCaps, structureCaps), academyCaps);
}

function capsForSalaryModule(backendPerms: Record<string, string[]>): ModuleActionCaps {
  const salaryCaps = capsFromBackendActions(backendPerms.salary || []);
  const academyCaps = capsFromBackendActions(backendPerms.studentManagement || []);
  return mergeActionCaps(salaryCaps, academyCaps);
}

function capsForExpensesModule(backendPerms: Record<string, string[]>): ModuleActionCaps {
  const expenseCaps = capsFromBackendActions(backendPerms.academyExpense || []);
  const academyCaps = capsFromBackendActions(backendPerms.studentManagement || []);
  return mergeActionCaps(expenseCaps, academyCaps);
}

/** Union caps across hub leaves (for hub-level redirects when no section yet). */
export function resolveHubAnyLeafCaps(
  hubKey: ModuleKey,
  rolePermLevel: PermLevel,
  backendPerms?: Record<string, string[]>,
  role?: Role,
  isSystemAdmin?: boolean,
): ModuleActionCaps {
  const leaves = HUB_LEAF_KEYS[hubKey];
  if (!leaves?.length) {
    return emptyActionCaps();
  }
  // Resolve leaf caps without re-entering hub branch
  const expanded = expandBackendModulePermissions(backendPerms);
  const secondaryAdmin = role === "admin" && !isSystemAdmin;
  if (isSystemAdmin) return capsFromPermLevel("full");
  if (secondaryAdmin || sessionHasExplicitModulePayload(expanded)) {
    return leaves.reduce((acc, leaf) => {
      const bk = PANEL_MODULE_TO_BACKEND_KEY[leaf];
      const arr = bk ? expanded[bk] : undefined;
      return mergeActionCaps(acc, capsFromBackendActions(Array.isArray(arr) ? arr : []));
    }, emptyActionCaps());
  }
  return leaves.reduce(
    (acc, leaf) => mergeActionCaps(acc, capsFromPermLevel(rolePermLevel)),
    emptyActionCaps(),
  );
}

export function resolveModuleCaps(
  moduleKey: ModuleKey,
  rolePermLevel: PermLevel,
  backendPerms?: Record<string, string[]>,
  role?: Role,
  isSystemAdmin?: boolean,
): ModuleActionCaps {
  // Seeded system admin only — full UI access to every module (including newly added ones).
  if (isSystemAdmin) return capsFromPermLevel("full");

  const expanded = expandBackendModulePermissions(backendPerms);

  // Secondary admins always use their dynamic matrix (empty = no access).
  const secondaryAdmin = role === "admin" && !isSystemAdmin;
  const explicit = secondaryAdmin || sessionHasExplicitModulePayload(expanded);
  const backendKey = PANEL_MODULE_TO_BACKEND_KEY[moduleKey];
  if (explicit) {
    if (!backendPerms) return emptyActionCaps();
    if (moduleKey === "fees") {
      return capsForFeesModule(expanded);
    }
    if (moduleKey === "salary") {
      return capsForSalaryModule(expanded);
    }
    if (moduleKey === "expenses") {
      return capsForExpensesModule(expanded);
    }
    if (moduleKey === "permission-catalog") {
      const arr = expanded.role;
      return capsFromBackendActions(Array.isArray(arr) ? arr : []);
    }
    // Hub keys: any leaf grants view for the hub shell
    if (
      moduleKey === "exams" ||
      moduleKey === "system-config" ||
      moduleKey === "student-management" ||
      moduleKey === "timetable"
    ) {
      return resolveHubAnyLeafCaps(moduleKey, rolePermLevel, expanded, role, isSystemAdmin);
    }
    if (backendKey !== undefined) {
      if (Object.prototype.hasOwnProperty.call(expanded, backendKey)) {
        const arr = expanded[backendKey];
        return capsFromBackendActions(Array.isArray(arr) ? arr : []);
      }
      return emptyActionCaps();
    }
    if (moduleKey === "staff-management") {
      const arr = expanded.user;
      return capsFromBackendActions(Array.isArray(arr) ? arr : []);
    }
    return emptyActionCaps();
  }
  return capsFromPermLevel(rolePermLevel);
}

function emptyPanelMatrix(): Record<ModuleKey, PermLevel> {
  return modulePermMatrix({}, "none");
}

/**
 * Combine default/local role matrix with modulePermissions from `/auth/me`.
 * System admin always gets full access; secondary admins and staff use the backend matrix.
 * When the API sends real module rows, the menu is built from that payload.
 */
export function applyBackendModulePermissions(
  rolePerms: Record<ModuleKey, PermLevel>,
  backendPerms?: Record<string, string[]>,
  role?: Role,
  isSystemAdmin?: boolean,
): Record<ModuleKey, PermLevel> {
  if (isSystemAdmin) return fullAccessMatrix();

  const secondaryAdmin = role === "admin" && !isSystemAdmin;
  if (!backendPerms || typeof backendPerms !== "object") {
    return secondaryAdmin ? emptyPanelMatrix() : rolePerms;
  }

  const expanded = expandBackendModulePermissions(backendPerms);

  const hasExplicitBackend = Object.entries(expanded).some(
    ([, actions]) => Array.isArray(actions) && actions.length > 0,
  );
  if (!hasExplicitBackend) {
    return secondaryAdmin ? emptyPanelMatrix() : rolePerms;
  }

  const next: Record<ModuleKey, PermLevel> = emptyPanelMatrix();

  Object.entries(expanded).forEach(([moduleName, actions]) => {
    const key = BACKEND_MODULE_KEY_MAP[moduleName];
    if (!key || !Array.isArray(actions)) return;
    if (actions.length === 0) {
      next[key] = "none";
      return;
    }
    const caps = capsFromBackendActions(actions);
    const level = permLevelFromActionCaps(caps);
    if (level !== "none") next[key] = level;
  });

  // Infer hub levels from leaves for any code still checking hub keys
  (Object.keys(HUB_LEAF_KEYS) as ModuleKey[]).forEach((hub) => {
    const leaves = HUB_LEAF_KEYS[hub] || [];
    const best = leaves.reduce((rank, leaf) => {
      const lvl = next[leaf] || "none";
      return Math.max(rank, PERM_RANK[lvl] || 0);
    }, 0);
    if (best > 0) {
      const level = (Object.entries(PERM_RANK).find(([, r]) => r === best)?.[0] || "view") as PermLevel;
      next[hub] = level;
    }
  });

  if (expanded.studentManagement || expanded.feeStructure) {
    const feeLevel = permLevelFromActionCaps(capsForFeesModule(expanded));
    if (feeLevel !== "none") next.fees = feeLevel;
    const salaryLevel = permLevelFromActionCaps(capsForSalaryModule(expanded));
    if (salaryLevel !== "none") next.salary = salaryLevel;
    const expenseLevel = permLevelFromActionCaps(capsForExpensesModule(expanded));
    if (expenseLevel !== "none") next.expenses = expenseLevel;
  }
  if (expanded.user) {
    const userLevel = permLevelFromActionCaps(capsFromBackendActions(expanded.user));
    if (userLevel !== "none") next["staff-management"] = userLevel;
  }
  if (expanded.role) {
    const roleLevel = permLevelFromActionCaps(capsFromBackendActions(expanded.role));
    if (roleLevel !== "none") next["permission-catalog"] = roleLevel;
  }
  if (expanded.salary) {
    const salaryLevel = permLevelFromActionCaps(capsForSalaryModule(expanded));
    if (salaryLevel !== "none") next.salary = salaryLevel;
  }
  if (expanded.academyExpense) {
    const expenseLevel = permLevelFromActionCaps(capsForExpensesModule(expanded));
    if (expenseLevel !== "none") next.expenses = expenseLevel;
  }

  // Finance dashboard is a client analytics view for anyone with fee access.
  if (next.fees && next.fees !== "none") {
    next["finance-dashboard"] = "view";
  }

  return next;
}

export const loadPermissions = (): Record<Role, Record<ModuleKey, PermLevel>> => {
  try {
    const raw = localStorage.getItem(PERM_KEY);
    if (!raw) return DEFAULT_PERMISSIONS;
    const parsed = JSON.parse(raw);
    // Merge with defaults so newly added modules still appear; admin always stays full.
    const merged = {} as Record<Role, Record<ModuleKey, PermLevel>>;
    (Object.keys(DEFAULT_PERMISSIONS) as Role[]).forEach((r) => {
      if (r === "admin") {
        merged[r] = fullAccessMatrix();
        return;
      }
      merged[r] = { ...DEFAULT_PERMISSIONS[r], ...(parsed[r] || {}) };
    });
    return merged;
  } catch {
    return DEFAULT_PERMISSIONS;
  }
};

export const savePermissions = (
  perms: Record<Role, Record<ModuleKey, PermLevel>>,
) => {
  localStorage.setItem(PERM_KEY, JSON.stringify(perms));
  window.dispatchEvent(new Event(PERM_EVT));
};

export const resetPermissions = () => {
  localStorage.removeItem(PERM_KEY);
  window.dispatchEvent(new Event(PERM_EVT));
};

export const PERM_CHANGE_EVENT = PERM_EVT;

export const PERM_LABELS: Record<PermLevel, string> = {
  none: "None", view: "View", mark: "Mark/View", grade: "View/Grade",
  process: "Process", crud: "CRUD", full: "Full",
};

export const PERM_OPTIONS: PermLevel[] = ["none", "view", "mark", "grade", "process", "crud", "full"];
