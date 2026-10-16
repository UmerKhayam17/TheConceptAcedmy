import { GraduationCap } from "lucide-react";
import type { Role } from "@/lib/auth";
import { moduleHref } from "@/lib/panelMenus";
import type { SidebarNavGroup, SidebarNavItem } from "@/lib/sidebarNav";

export type ParentChildNav = {
  _id: string;
  studentName: string;
};

/**
 * Replace the static "My Children" submenu link with one entry per linked student (by name).
 * Group label stays "My Children"; Attendance / Timetable are unchanged.
 */
export function injectParentChildrenIntoSidebar(
  groups: SidebarNavGroup[],
  children: ParentChildNav[],
): SidebarNavGroup[] {
  if (!children.length) return groups;

  return groups.map((group) => {
    if (group.id !== "my-children") return group;

    const rest = group.items.filter((item) => item.id !== "students");
    const childItems: SidebarNavItem[] = children.map((child, index) => ({
      // Keep first id as "students" so mobile primary nav still resolves.
      id: index === 0 ? "students" : `student-${child._id}`,
      label: child.studentName,
      icon: GraduationCap,
      moduleKey: "students",
      href: (role: Role) => `${moduleHref(role, "students")}?student=${child._id}`,
      isActive: (pathname: string, role: Role) => {
        const base = moduleHref(role, "students");
        if (pathname !== base && !pathname.startsWith(`${base}/`)) return false;
        try {
          const params = new URLSearchParams(window.location.search);
          const fromQuery = params.get("student");
          if (fromQuery) return fromQuery === child._id;
          return localStorage.getItem("parent_selected_student_id") === child._id;
        } catch {
          return index === 0;
        }
      },
    }));

    return { ...group, items: [...childItems, ...rest] };
  });
}
