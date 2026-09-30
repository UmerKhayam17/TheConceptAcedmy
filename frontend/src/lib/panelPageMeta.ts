import type { ComponentType } from "react";
import { LayoutDashboard } from "lucide-react";
import type { Role } from "@/lib/auth";
import { findModule, ICONS, roleMeta } from "@/lib/panelMenus";
import {
  navItemIsActive,
  sidebarNavForRole,
  type SidebarNavItem,
} from "@/lib/sidebarNav";

export type PanelPageMeta = {
  title: string;
  icon: ComponentType<{ className?: string }>;
  breadcrumbParent: string;
  breadcrumbCurrent: string;
  /** Show academic-year selector in the portal header. */
  showSession: boolean;
  /** Hide “All sessions” (e.g. session detail). */
  allowAllSessions: boolean;
};

function flattenNav(
  items: SidebarNavItem[],
): SidebarNavItem[] {
  const out: SidebarNavItem[] = [];
  for (const item of items) {
    out.push(item);
    if (item.children?.length) out.push(...flattenNav(item.children));
  }
  return out;
}

/**
 * Resolve portal header title / icon / breadcrumb / session visibility
 * from the active route and sidebar navigation.
 */
export function resolvePanelPageMeta(
  role: Role,
  pathname: string,
  params: { slug?: string; section?: string; action?: string },
): PanelPageMeta {
  const { slug, section, action } = params;
  const groups = sidebarNavForRole(role);

  const allowAllSessions = !(
    slug === "system-config" &&
    section === "academic" &&
    Boolean(action)
  );

  let best: { groupLabel: string; item: SidebarNavItem; score: number } | null = null;

  for (const group of groups) {
    for (const item of flattenNav(group.items)) {
      if (!navItemIsActive(item, pathname, role)) continue;
      const href = item.href(role);
      const score = href.length + (item.isActive ? 50 : 0);
      if (!best || score > best.score) {
        best = { groupLabel: group.label, item, score };
      }
    }
  }

  if (best) {
    return {
      title: best.item.label,
      icon: best.item.icon,
      breadcrumbParent: best.groupLabel,
      breadcrumbCurrent: best.item.label,
      showSession: true,
      allowAllSessions,
    };
  }

  // Fallback: MODULES catalog / dashboard
  if (!slug) {
    const cfg = roleMeta[role];
    return {
      title: "Dashboard",
      icon: LayoutDashboard,
      breadcrumbParent: cfg?.title ?? "Portal",
      breadcrumbCurrent: "Dashboard",
      showSession: true,
      allowAllSessions: true,
    };
  }

  const mod = findModule(slug);
  const Icon = (mod && ICONS[mod.icon]) || LayoutDashboard;
  return {
    title: mod?.label ?? slug,
    icon: Icon,
    breadcrumbParent: "Portal",
    breadcrumbCurrent: mod?.label ?? slug,
    showSession: true,
    allowAllSessions,
  };
}
