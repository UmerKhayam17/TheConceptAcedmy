import { useMemo, type ComponentType } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { LayoutGrid } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import type { Role, SessionUser } from "@/lib/auth";
import { usePermissions } from "@/hooks/usePermissions";
import { applyBackendModulePermissions, resolveModuleCaps } from "@/lib/permissions";
import {
  ADMIN_MOBILE_GROUP_IDS,
  MOBILE_PRIMARY_NAV_IDS,
  flattenSidebarNav,
  groupIsOpen,
  navItemIsActive,
  sidebarNavForRole,
  type SidebarNavGroup,
  type SidebarNavItem,
} from "@/lib/sidebarNav";
import { cn } from "@/lib/utils";

const MAX_ITEM_TABS = 4;

type MobileTab = {
  id: string;
  label: string;
  href: string;
  Icon: ComponentType<{ className?: string }>;
  active: boolean;
  end?: boolean;
};

function shortLabel(label: string): string {
  const map: Record<string, string> = {
    Dashboard: "Home",
    "Academic Setup": "Academic",
    "Student Management": "Students",
    Finance: "Finance",
    Administration: "Admin",
    Students: "Students",
    "Student Attendance": "Attend",
    "AI Attendance": "AI Face",
    Attendance: "Attend",
    Chat: "Chat",
    Fees: "Fees",
    "Fee Management": "Fees",
    Expenses: "Costs",
    "Academy Expenses": "Costs",
    "My Classes": "Classes",
    Homework: "Tasks",
    Timetable: "Time",
    "Student Timetable": "Time",
    Exams: "Exams",
    Announcements: "News",
    "Class Tests / Exams": "Exams",
    "Staff Salary": "Salary",
  };
  if (map[label]) return map[label];
  const first = label.split(/[\s/]/)[0] || label;
  return first.length > 9 ? `${first.slice(0, 8)}…` : first;
}

function itemIsActive(item: SidebarNavItem, pathname: string, role: Role): boolean {
  if (navItemIsActive(item, pathname, role)) return true;

  const base = `/panel/${role}`;
  if (!pathname.startsWith(base)) return false;
  const rest = pathname.slice(base.length);

  if (item.id === "dashboard") return pathname === base || pathname === `${base}/`;
  if (item.id === "students" || item.moduleKey === "students") {
    return rest.startsWith("/students") || rest.startsWith("/student-management");
  }
  if (item.id === "student-attendance" || item.id === "attendance" || item.moduleKey === "attendance") {
    return rest === "/attendance" || rest.startsWith("/attendance/");
  }
  if (item.moduleKey === "ai-attendance") {
    return rest === "/ai-attendance" || rest.startsWith("/ai-attendance/");
  }
  if (item.moduleKey === "chat") return rest.startsWith("/chat");
  if (item.moduleKey === "fees") return rest.startsWith("/fees");
  if (item.moduleKey === "expenses") return rest.startsWith("/expenses");
  if (item.moduleKey === "salary") return rest.startsWith("/salary");
  if (item.moduleKey === "exams") return rest.startsWith("/exams") || rest.startsWith("/test-exams");
  if (item.moduleKey === "announcements") return rest.startsWith("/announcements");
  if (item.moduleKey === "homework") return rest.startsWith("/homework");
  if (item.moduleKey === "my-classes") return rest.startsWith("/my-classes");
  if (item.moduleKey === "timetable") return rest.startsWith("/timetable");

  const slug = item.moduleKey;
  return Boolean(slug && rest.startsWith(`/${slug}`));
}

function TabButton({
  tab,
  onMore,
}: {
  tab: MobileTab;
  onMore?: () => void;
}) {
  const Icon = tab.Icon;
  const className = cn(
    "relative flex flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-semibold tracking-wide transition-colors",
    tab.active ? "text-primary" : "text-muted-foreground",
  );
  const inner = (
    <>
      {tab.active && (
        <span
          className="absolute top-0 left-1/2 h-0.5 w-7 -translate-x-1/2 rounded-full bg-primary"
          aria-hidden
        />
      )}
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
          tab.active ? "bg-primary text-primary-foreground" : "bg-transparent",
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={tab.active ? 2.25 : 1.75} />
      </span>
      <span className="truncate max-w-full leading-none">{tab.label}</span>
    </>
  );

  if (onMore) {
    return (
      <button type="button" onClick={onMore} className={className} aria-label="Open full menu">
        {inner}
      </button>
    );
  }

  return (
    <NavLink to={tab.href} end={tab.end} className={className}>
      {inner}
    </NavLink>
  );
}

const PanelMobileNav = ({ user }: { user: SessionUser }) => {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  const { perms } = usePermissions();
  const rolePerms = applyBackendModulePermissions(perms[user.role], user.modulePermissions, user.role);
  const isAdmin = user.role === "admin";

  const canViewItem = (item: SidebarNavItem) => {
    if (item.moduleKey === "dashboard") return true;
    const caps = resolveModuleCaps(
      item.moduleKey,
      rolePerms[item.moduleKey],
      user.modulePermissions,
      user.role,
    );
    if (!caps.canView) return false;
    if (item.requireManage && !(caps.canEdit || caps.canCreate)) return false;
    return true;
  };

  const tabs = useMemo((): MobileTab[] => {
    if (isAdmin) {
      const groups = sidebarNavForRole("admin")
        .map((group) => ({
          ...group,
          items: group.items.filter(canViewItem),
        }))
        .filter((group) => group.items.length > 0);

      const byId = new Map(groups.map((g) => [g.id, g]));
      /** Prefer a useful home screen per main menu (not always the first sidebar link). */
      const preferredLanding: Record<string, string> = {
        dashboard: "dashboard",
        "academic-setup": "sessions",
        "student-management": "students",
        finance: "fee-management",
        administration: "users",
      };
      const out: MobileTab[] = [];

      for (const id of ADMIN_MOBILE_GROUP_IDS) {
        const group = byId.get(id) as SidebarNavGroup | undefined;
        if (!group?.items.length) continue;
        const preferId = preferredLanding[group.id];
        const landing =
          group.items.find((i) => i.id === preferId) || group.items[0];
        out.push({
          id: group.id,
          label: shortLabel(group.label),
          href: landing.href("admin"),
          Icon: group.icon,
          active: groupIsOpen(group, pathname, "admin"),
          end: group.id === "dashboard",
        });
      }
      return out;
    }

    const flat = flattenSidebarNav(user.role);
    const byId = new Map(flat.map((item) => [item.id, item]));
    const preferredIds = MOBILE_PRIMARY_NAV_IDS[user.role] || MOBILE_PRIMARY_NAV_IDS.teacher;

    const preferred = preferredIds
      .map((id) => byId.get(id))
      .filter((item): item is SidebarNavItem => Boolean(item && canViewItem(item)));

    const used = new Set(preferred.map((i) => i.id));
    const fallback = flat.filter((item) => canViewItem(item) && !used.has(item.id));
    return [...preferred, ...fallback].slice(0, MAX_ITEM_TABS).map((item) => ({
      id: item.id,
      label: shortLabel(item.label),
      href: item.href(user.role),
      Icon: item.icon,
      active: itemIsActive(item, pathname, user.role),
      end: item.id === "dashboard",
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.role, user.modulePermissions, perms, pathname, isAdmin]);

  const primaryActive = tabs.some((t) => t.active);
  const showMore = true;

  return (
    <nav
      data-panel-mobile-nav
      className={cn(
        "md:hidden shrink-0 z-40 border-t border-border bg-background",
        "pb-[env(safe-area-inset-bottom,0px)]",
        "shadow-[0_-6px_20px_rgba(15,23,42,0.06)]",
      )}
      aria-label="Main navigation"
    >
      <div
        className="grid h-14 w-full max-w-lg mx-auto px-0.5"
        style={{
          gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))`,
        }}
      >
        {tabs.map((tab) => (
          <TabButton key={tab.id} tab={tab} />
        ))}

        <TabButton
          tab={{
            id: "more",
            label: "More",
            href: "#",
            Icon: LayoutGrid,
            active: !primaryActive,
          }}
          onMore={() => setOpenMobile(true)}
        />
      </div>
    </nav>
  );
};

export default PanelMobileNav;
