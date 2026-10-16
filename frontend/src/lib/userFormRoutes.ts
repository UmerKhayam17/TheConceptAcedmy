import type { Role } from "@/lib/auth";
import { moduleHref } from "@/lib/panelMenus";

export type UserFormScope = "all" | "staff";

export function usersListHref(role: Role, scope: UserFormScope = "all") {
  return moduleHref(role, scope === "staff" ? "staff-management" : "users");
}

export function userCreateHref(role: Role, scope: UserFormScope = "all") {
  return `${usersListHref(role, scope)}/new`;
}

export function userEditHref(role: Role, userId: string, scope: UserFormScope = "all") {
  return `${usersListHref(role, scope)}/${userId}/edit`;
}
