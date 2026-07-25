// Per-role module defaults; live access comes from the server via `modulePermissions` on login.
// Levels (in increasing power): none < view < mark < grade < process < crud < full
// "process" / "mark" / "grade" are role-flavoured aliases that all imply read+write
// on a constrained scope (kept distinct so labels in the UI match the spec sheet).

import { Role } from "./auth";

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
  | "student-management"
  | "students"
  | "my-classes"
  | "my-subjects"
  | "attendance"
  | "staff-attendance"
  | "ai-attendance"
  | "timetable"
  | "homework"
  | "study-materials"
  | "lesson-plans"
  | "exams"
  | "student-progress"
  | "behaviour"
  | "parent-meetings"
  | "online-classes"
  | "library"
  | "school-calendar"
  | "notifications"
  | "leave"
  | "fees"
  | "salary"
  | "expenses"
  | "chat"
  | "announcements"
  | "reports"
  | "datasheets"
  | "system-config"
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
  {
    key: "system-config",
    label: "Sessions & timetable",
    shortLabel: "Sessions",
    icon: "SlidersHorizontal",
    desc: "Academic sessions and timetable infrastructure",
  },
  {
    key: "student-management",
    label: "Classes & enrollment",
    shortLabel: "Enrollment",
    icon: "School",
    desc: "Classes, sections, subjects & student registration",
  },
  {
    key: "students",
    label: "My Students",
    shortLabel: "Students",
    icon: "GraduationCap",
    desc: "View assigned students",
  },
  { key: "my-classes", label: "My Classes", icon: "School", desc: "View assigned classes" },
  { key: "my-subjects", label: "My Subjects", icon: "BookOpen", desc: "View assigned subjects" },
  { key: "attendance", label: "Attendance", icon: "ClipboardList", desc: "Daily student attendance" },
  {
    key: "staff-attendance",
    label: "My Attendance",
    icon: "Clock",
    desc: "Own attendance and correction requests",
  },
  {
    key: "ai-attendance",
    label: "AI Attendance",
    icon: "ScanFace",
    desc: "Face enrollment, cameras, and sync with recognition service",
  },
  { key: "timetable", label: "Timetable", icon: "Calendar", desc: "View class and own schedules" },
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
    key: "exams",
    label: "Exams & Marks",
    shortLabel: "Exams",
    icon: "Award",
    desc: "Enter and update marks for assigned subjects",
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
    modules: ["system-config", "student-management", "timetable"],
  },
  {
    id: "student-management",
    label: "Student Management",
    modules: ["students", "attendance", "ai-attendance", "staff-attendance"],
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
      "exams",
      "student-progress",
      "behaviour",
      "parent-meetings",
      "online-classes",
    ],
  },
  { id: "finance", label: "Finance", modules: ["fees", "salary", "expenses"] },
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

// Default matrix — admin is always full on every MODULES entry (do not list by hand).
export const DEFAULT_PERMISSIONS: Record<Role, Record<ModuleKey, PermLevel>> = {
  admin: fullAccessMatrix(),
  accountant: modulePermMatrix({
    dashboard: "view",
    "student-management": "process",
    students: "view",
    attendance: "view",
    "staff-attendance": "view",
    exams: "view",
    "school-calendar": "view",
    notifications: "view",
    leave: "mark",
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
    "student-management": "view",
    students: "view",
    "my-classes": "view",
    "my-subjects": "view",
    attendance: "mark",
    "staff-attendance": "view",
    timetable: "view",
    homework: "crud",
    "study-materials": "crud",
    "lesson-plans": "grade",
    exams: "grade",
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
    timetable: "view",
    homework: "view",
    "study-materials": "view",
    exams: "view",
    "student-progress": "view",
    "parent-meetings": "view",
    "online-classes": "view",
    "school-calendar": "view",
    notifications: "view",
    fees: "view",
    chat: "view",
  }),
  student: modulePermMatrix({
    dashboard: "view",
    students: "view",
    attendance: "view",
    timetable: "view",
    homework: "view",
    "study-materials": "view",
    exams: "view",
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

export const BACKEND_MODULE_KEY_MAP: Record<string, ModuleKey> = {
  exam: "exams",
  attendance: "attendance",
  student: "students",
  studentManagement: "student-management",
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
  timetable: "timetable",
  announcement: "announcements",
  chat: "chat",
  reports: "reports",
  datasheets: "datasheets",
  salary: "salary",
  academyExpense: "expenses",
  config: "system-config",
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

/** Panel Fee Management uses academy APIs under studentManagement permissions. */
function capsForFeesModule(backendPerms: Record<string, string[]>): ModuleActionCaps {
  const feeCaps = capsFromBackendActions(backendPerms.fee || []);
  const academyCaps = capsFromBackendActions(backendPerms.studentManagement || []);
  return mergeActionCaps(feeCaps, academyCaps);
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

export function resolveModuleCaps(
  moduleKey: ModuleKey,
  rolePermLevel: PermLevel,
  backendPerms?: Record<string, string[]>,
  role?: Role,
): ModuleActionCaps {
  // Admin always has full UI access to every module (including newly added ones).
  if (role === "admin") return capsFromPermLevel("full");

  const explicit = sessionHasExplicitModulePayload(backendPerms);
  const backendKey = PANEL_MODULE_TO_BACKEND_KEY[moduleKey];
  if (explicit && backendPerms) {
    if (moduleKey === "fees") {
      return capsForFeesModule(backendPerms);
    }
    if (moduleKey === "salary") {
      return capsForSalaryModule(backendPerms);
    }
    if (moduleKey === "expenses") {
      return capsForExpensesModule(backendPerms);
    }
    if (backendKey !== undefined) {
      if (Object.prototype.hasOwnProperty.call(backendPerms, backendKey)) {
        const arr = backendPerms[backendKey];
        return capsFromBackendActions(Array.isArray(arr) ? arr : []);
      }
      return emptyActionCaps();
    }
    if (moduleKey === "staff-management") {
      const arr = backendPerms.user;
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
 * Admin always gets full access to every entry in MODULES (ignores sparse backend maps).
 * When the API sends real module rows for other roles, the menu is built from that payload.
 */
export function applyBackendModulePermissions(
  rolePerms: Record<ModuleKey, PermLevel>,
  backendPerms?: Record<string, string[]>,
  role?: Role,
): Record<ModuleKey, PermLevel> {
  if (role === "admin") return fullAccessMatrix();

  if (!backendPerms || typeof backendPerms !== "object") return rolePerms;

  const hasExplicitBackend = Object.entries(backendPerms).some(
    ([, actions]) => Array.isArray(actions) && actions.length > 0,
  );
  if (!hasExplicitBackend) return rolePerms;

  const next: Record<ModuleKey, PermLevel> = emptyPanelMatrix();

  Object.entries(backendPerms).forEach(([moduleName, actions]) => {
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

  if (backendPerms.studentManagement) {
    const feeLevel = permLevelFromActionCaps(capsForFeesModule(backendPerms));
    if (feeLevel !== "none") next.fees = feeLevel;
    const salaryLevel = permLevelFromActionCaps(capsForSalaryModule(backendPerms));
    if (salaryLevel !== "none") next.salary = salaryLevel;
    const expenseLevel = permLevelFromActionCaps(capsForExpensesModule(backendPerms));
    if (expenseLevel !== "none") next.expenses = expenseLevel;
  }
  if (backendPerms.user) {
    const userLevel = permLevelFromActionCaps(capsFromBackendActions(backendPerms.user));
    if (userLevel !== "none") next["staff-management"] = userLevel;
  }
  if (backendPerms.salary) {
    const salaryLevel = permLevelFromActionCaps(capsForSalaryModule(backendPerms));
    if (salaryLevel !== "none") next.salary = salaryLevel;
  }
  if (backendPerms.academyExpense) {
    const expenseLevel = permLevelFromActionCaps(capsForExpensesModule(backendPerms));
    if (expenseLevel !== "none") next.expenses = expenseLevel;
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
