import {
  ShieldCheck, Calculator, GraduationCap, Users, LayoutDashboard,
  BookOpen, DollarSign, Calendar, Bell, BarChart3, UserCog, ClipboardList,
  Wallet, MessageSquare, Award, Receipt, Settings as SettingsIcon, FileText, School, KeyRound, ListTree,
  SlidersHorizontal, NotebookPen, FolderOpen, ListChecks, TrendingUp, ShieldAlert, UsersRound,
  ScanFace,
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
  Video, Library, CalendarRange, BellRing, Palmtree, Clock, User, ScanFace,
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
): MenuItem | null {
  if (m.key !== "dashboard" && !resolveModuleCaps(m.key, rolePerms[m.key], backendModulePerms, role).canView) {
    return null;
  }
  return { ...m, Icon: ICONS[m.icon] || LayoutDashboard };
}

/** Build the visible flat menu (legacy / dashboard tiles). */
export const buildMenu = (
  rolePerms: Record<ModuleKey, PermLevel>,
  backendModulePerms?: Record<string, string[]>,
  role?: Role,
): MenuItem[] => {
  const byKey = Object.fromEntries(MODULES.map((m) => [m.key, m])) as Record<ModuleKey, ModuleDef>;
  const orderedKeys = SIDEBAR_NAV_GROUPS.flatMap((g) => g.modules);
  const seen = new Set<ModuleKey>();
  const items: MenuItem[] = [];
  for (const key of orderedKeys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const item = moduleToMenuItem(byKey[key], rolePerms, backendModulePerms, role);
    if (item) items.push(item);
  }
  for (const m of MODULES) {
    if (seen.has(m.key) || m.showInNav === false) continue;
    const item = moduleToMenuItem(m, rolePerms, backendModulePerms, role);
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

export const findModule = (slug: string | undefined): ModuleDef | undefined =>
  MODULES.find((m) => (slug ? m.key === slug : m.key === "dashboard"));

export const moduleHref = (
  role: Role,
  key: ModuleKey,
  opts?: { caps?: ModuleActionCaps },
) =>
  key === "dashboard"
    ? `/panel/${role}`
    : key === "system-config"
      ? systemConfigHref(role)
      : key === "student-management"
        ? studentManagementHref(role)
        : key === "timetable" && opts?.caps
          ? timetableHref(role, defaultTimetableSection({ caps: opts.caps, role }))
          : key === "exams"
            ? testExamsHref(role)
        : key === "staff-management"
          ? `/panel/${role}/staff-management`
            : `/panel/${role}/${key}`;
