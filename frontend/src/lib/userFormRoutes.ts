import type { Role } from "@/lib/auth";
import { moduleHref } from "@/lib/panelMenus";
import type { ModuleKey } from "@/lib/permissions";

export type UserFormScope = "parents" | "staff" | "admins";

const SCOPE_MODULE: Record<UserFormScope, ModuleKey> = {
  parents: "parents",
  staff: "staff-management",
  admins: "admins",
};

export function usersListHref(role: Role, scope: UserFormScope = "parents") {
  return moduleHref(role, SCOPE_MODULE[scope]);
}

export function userCreateHref(role: Role, scope: UserFormScope = "parents") {
  return `${usersListHref(role, scope)}/new`;
}

export function userEditHref(role: Role, userId: string, scope: UserFormScope = "parents") {
  return `${usersListHref(role, scope)}/${userId}/edit`;
}
