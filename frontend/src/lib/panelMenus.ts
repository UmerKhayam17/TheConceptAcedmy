import {
  ShieldCheck, Calculator, GraduationCap, Users, LayoutDashboard,
  BookOpen, DollarSign, Calendar, Bell, BarChart3, UserCog, ClipboardList,
  Wallet, MessageSquare, Award, Receipt, Settings as SettingsIcon, FileText, School, KeyRound, ListTree,
  SlidersHorizontal, NotebookPen, FolderOpen, ListChecks, TrendingUp, ShieldAlert, UsersRound,
  ScanFace, Shield,
  Video, Library, CalendarRange, BellRing, Palmtree, Clock, User,
} from "lucide-react";
import { Role } from "./auth";
import { systemConfigHref } from "./systemConfigMenus";
import { studentManagementHref } from "./studentManagementMenus";
import { defaultTimetableSection, timetableHref } from "./timetableMenus";
import { testExamsHref } from "./testExamsMenus";
import {
  MODULES,
  SIDEBAR_NAV_GROUPS,
  ModuleKey,
  ModuleDef,
  ModuleActionCaps,
  PermLevel,
  resolveModuleCaps,
} from "./permissions";

export const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, Users, UserCog, GraduationCap, ClipboardList, Calendar,
  BookOpen, Award, Wallet, DollarSign, MessageSquare, Bell, BarChart3,
  Settings: SettingsIcon, FileText, KeyRound, ListTree, School, SlidersHorizontal, Receipt,
  NotebookPen, FolderOpen, ListChecks, TrendingUp, ShieldAlert, UsersRound,
  Video, Library, CalendarRange, BellRing, Palmtree, Clock, User, ScanFace, Shield,
};

export type MenuItem = ModuleDef & {
  Icon: React.ComponentType<{ className?: string }>;
};

export const roleMeta: Record<Role, {
  title: string;
  accentLabel: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = {
  admin:      { title: "Administrator Panel", accentLabel: "System Overview",   Icon: ShieldCheck },
  accountant: { title: "Accountant Panel",    accentLabel: "Finance Overview",  Icon: Calculator },
  teacher:    { title: "Teacher Panel",       accentLabel: "Today's Classroom", Icon: GraduationCap },
  parent:     { title: "Parent Panel",        accentLabel: "Child's Progress",  Icon: Users },
  student:    { title: "Student Panel",       accentLabel: "My Learning",       Icon: School },
};

function moduleToMenuItem(
  m: ModuleDef,
  rolePerms: Record<ModuleKey, PermLevel>,
  backendModulePerms?: Record<string, string[]>,
  role?: Role,
  isSystemAdmin?: boolean,
): MenuItem | null {
  if (
    m.key !== "dashboard" &&
    !resolveModuleCaps(m.key, rolePerms[m.key], backendModulePerms, role, isSystemAdmin).canView
  ) {
    return null;
  }
  return { ...m, Icon: ICONS[m.icon] || LayoutDashboard };
}

/** Build the visible flat menu (legacy / dashboard tiles). */
export const buildMenu = (
  rolePerms: Record<ModuleKey, PermLevel>,
  backendModulePerms?: Record<string, string[]>,
  role?: Role,
  isSystemAdmin?: boolean,
): MenuItem[] => {
  const byKey = Object.fromEntries(MODULES.map((m) => [m.key, m])) as Record<ModuleKey, ModuleDef>;
  const orderedKeys = SIDEBAR_NAV_GROUPS.flatMap((g) => g.modules);
  const seen = new Set<ModuleKey>();
  const items: MenuItem[] = [];
  for (const key of orderedKeys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const item = moduleToMenuItem(byKey[key], rolePerms, backendModulePerms, role, isSystemAdmin);
    if (item) items.push(item);
  }
  for (const m of MODULES) {
    if (seen.has(m.key) || m.showInNav === false) continue;
    const item = moduleToMenuItem(m, rolePerms, backendModulePerms, role, isSystemAdmin);
    if (item) items.push(item);
  }
  return items;
};

export type SidebarNavGroup = { id: string; label: string; items: MenuItem[] };

/** Sidebar: grouped navigation in workflow order. */
export const buildGroupedMenu = (
  rolePerms: Record<ModuleKey, PermLevel>,
  backendModulePerms?: Record<string, string[]>,
  role?: Role,
): SidebarNavGroup[] => {
  const byKey = Object.fromEntries(MODULES.map((m) => [m.key, m])) as Record<ModuleKey, ModuleDef>;
  return SIDEBAR_NAV_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    items: group.modules
      .map((key) => byKey[key])
      .filter((def): def is ModuleDef => Boolean(def && def.showInNav !== false))
      .map((def) => moduleToMenuItem(def, rolePerms, backendModulePerms, role))
      .filter((item): item is MenuItem => item != null),
  })).filter((g) => g.items.length > 0);
};

/** URL slug → module key (keeps Teacher Attendance on its own path). */
const MODULE_SLUG_ALIASES: Record<string, ModuleKey> = {
  "teacher-attendance": "staff-attendance",
  "staff-attendance": "staff-attendance",
};

export const findModule = (slug: string | undefined): ModuleDef | undefined => {
  if (!slug) return MODULES.find((m) => m.key === "dashboard");
  const key = MODULE_SLUG_ALIASES[slug] || slug;
  return MODULES.find((m) => m.key === key);
};

const LEAF_HREF: Partial<Record<ModuleKey, (role: Role) => string>> = {
  sessions: (role) => systemConfigHref(role, "academic"),
  "session-history": (role) => systemConfigHref(role, "history"),
  "test-catalog": (role) => systemConfigHref(role, "test-catalog"),
  "exam-catalog": (role) => systemConfigHref(role, "exam-catalog"),
  rooms: (role) => systemConfigHref(role, "rooms"),
  periods: (role) => systemConfigHref(role, "periods"),
  "timetable-rules": (role) => systemConfigHref(role, "timetable-rules"),
  teachers: (role) => systemConfigHref(role, "teachers"),
  "subject-teachers": (role) => systemConfigHref(role, "subject-teachers"),
  classes: (role) => studentManagementHref(role, "classes"),
  sections: (role) => studentManagementHref(role, "sections"),
  subjects: (role) => studentManagementHref(role, "subjects"),
  disciplines: (role) => studentManagementHref(role, "disciplines"),
  "student-registration": (role) => studentManagementHref(role, "registration"),
  "change-section": (role) => studentManagementHref(role, "change-section"),
  "fee-structure": (role) => studentManagementHref(role, "fees-structure"),
  "timetable-builder": (role) => timetableHref(role, "builder"),
  "timetable-board": (role) => timetableHref(role, "board"),
  "timetable-view": (role) => timetableHref(role, "view"),
  "exam-tests": (role) => testExamsHref(role, "enter-tests"),
  "exam-term": (role) => testExamsHref(role, "term-exams"),
  "exam-date-sheet": (role) => testExamsHref(role, "date-sheet"),
  "exam-report-card": (role) => testExamsHref(role, "report-card"),
};

export const moduleHref = (
  role: Role,
  key: ModuleKey,
  opts?: { caps?: ModuleActionCaps },
) => {
  if (key === "dashboard") return `/panel/${role}`;
  const leaf = LEAF_HREF[key];
  if (leaf) return leaf(role);
  if (key === "system-config") return systemConfigHref(role);
  if (key === "student-management") return studentManagementHref(role);
  if (key === "timetable") {
    return opts?.caps
      ? timetableHref(role, defaultTimetableSection({ caps: opts.caps, role }))
      : timetableHref(role, "view");
  }
  if (key === "exams") return testExamsHref(role);
  if (key === "staff-management") return `/panel/${role}/staff-management`;
  if (key === "staff-attendance") return `/panel/${role}/teacher-attendance`;
  return `/panel/${role}/${key}`;
};

/** Staff salary voucher detail page. */
export const salaryDetailHref = (role: Role, salaryId: string) =>
  `${moduleHref(role, "salary")}/${salaryId}`;
