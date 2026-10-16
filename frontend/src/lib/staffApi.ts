import { getApiRoot, parseJson } from "@/lib/api";
import { authedFetch } from "@/lib/auth";

export interface RoleOption {
  _id: string;
  name: string;
}

export interface ModuleRegistryEntry {
  key: string;
  name: string;
  description: string;
  actions: string[];
  /** Sidebar-aligned group for the permissions matrix UI */
  parentGroup?: string | null;
}

export interface LinkedStudentSummary {
  _id: string;
  studentId: string;
  studentName: string;
  classId?: string | null;
  sectionId?: string | null;
  className?: string | null;
  sectionName?: string | null;
  status?: string;
}

/** Permission row from Mongo (GET /permissions). */
export interface PermissionDefinition {
  _id: string;
  name: string;
  module: string;
  action: string;
  description?: string;
}

export interface StaffUser {
  _id: string;
  name: string;
  email: string;
  phone: string;
  isActive: boolean;
  /** fixed = monthly salary; percentage = share of fees (rate in salaryPercentage). */
  payType?: "fixed" | "percentage";
  salary?: number;
  salaryPercentage?: number;
  profileImage?: string;
  modulePermissions?: Record<string, string[]>;
  role?: RoleOption | string;
  createdAt?: string;
  updatedAt?: string;
  lastLogin?: string;
  permissions?: PermissionDefinition[];
  /** Populated for parent users on GET /users (all-users list). */
  linkedStudents?: LinkedStudentSummary[];
}

export interface UserWithAccess extends StaffUser {
  permissions?: PermissionDefinition[];
}

export function normalizeModulePermissions(raw: StaffUser["modulePermissions"]): Record<string, string[]> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string[]> = {};
  Object.entries(raw).forEach(([k, v]) => {
    if (Array.isArray(v)) out[k] = [...v];
  });
  return out;
}

export async function fetchStaffUsers(): Promise<StaffUser[]> {
  const res = await authedFetch("/users?scope=staff");
  const body = await parseJson<{ success?: boolean; data?: StaffUser[] }>(res);
  if (!res.ok || !body.data) return [];
  return body.data;
}

export async function fetchParentUsers(): Promise<StaffUser[]> {
  const res = await authedFetch("/users?scope=parents");
  const body = await parseJson<{ success?: boolean; data?: StaffUser[] }>(res);
  if (!res.ok || !body.data) return [];
  return body.data;
}

export async function fetchAdminUsers(): Promise<StaffUser[]> {
  const res = await authedFetch("/users?scope=admins");
  const body = await parseJson<{ success?: boolean; data?: StaffUser[] }>(res);
  if (!res.ok || !body.data) return [];
  return body.data;
}

export async function fetchUsersByScope(
  scope: "parents" | "staff" | "admins",
): Promise<StaffUser[]> {
  if (scope === "staff") return fetchStaffUsers();
  if (scope === "admins") return fetchAdminUsers();
  return fetchParentUsers();
}

export async function fetchAllUsers(): Promise<UserWithAccess[]> {
  const res = await authedFetch("/users");
  const body = await parseJson<{ success?: boolean; data?: UserWithAccess[] }>(res);
  if (!res.ok || !body.data) return [];
  return body.data;
}

export async function fetchPermissionCatalog(): Promise<PermissionDefinition[]> {
  const res = await authedFetch("/permissions");
  const body = await parseJson<{ success?: boolean; data?: PermissionDefinition[] }>(res);
  if (!res.ok || !body.data) return [];
  return body.data;
}

export async function fetchModuleRegistry(): Promise<ModuleRegistryEntry[]> {
  const res = await authedFetch("/users/modules-registry");
  const body = await parseJson<{ success?: boolean; data?: { modules?: ModuleRegistryEntry[] } }>(res);
  if (!res.ok || !body.data?.modules) return [];
  return body.data.modules;
}

export async function fetchAllRoles(): Promise<RoleOption[]> {
  const res = await authedFetch("/roles");
  const body = await parseJson<{ success?: boolean; data?: RoleOption[] }>(res);
  if (!res.ok || !body.data) return [];
  return body.data;
}

export function staffRolesOnly(roles: RoleOption[]): RoleOption[] {
  const allow = new Set(["teacher", "accountant"]);
  return roles.filter((r) => allow.has(String(r.name).toLowerCase()));
}

export function parentRolesOnly(roles: RoleOption[]): RoleOption[] {
  return roles.filter((r) => String(r.name).toLowerCase() === "parent");
}

export function adminRolesOnly(roles: RoleOption[]): RoleOption[] {
  return roles.filter((r) => String(r.name).toLowerCase() === "admin");
}

/** @deprecated Prefer scope-specific helpers; kept for Permissions screens. */
export function userCreateRoles(roles: RoleOption[]): RoleOption[] {
  const allow = new Set(["parent", "teacher", "accountant", "admin"]);
  return roles.filter((r) => allow.has(String(r.name).toLowerCase()));
}

export function roleDisplayLabel(name: string): string {
  const n = String(name || "").toLowerCase();
  if (n === "accountant") return "Accountant";
  if (n === "admin") return "Admin";
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : name;
}

/** Default module grants for a new teacher account (matches seeded teacher role). */
export const TEACHER_DEFAULT_MODULE_PERMISSIONS: Record<string, string[]> = {
  student: ["view"],
  classes: ["view"],
  sections: ["view"],
  subjects: ["view"],
  disciplines: ["view"],
  studentRegistration: ["view"],
  changeSection: ["view"],
  feeStructure: ["view"],
  myClasses: ["view"],
  mySubjects: ["view"],
  timetableBuilder: ["view"],
  timetableBoard: ["view"],
  timetableView: ["view"],
  homework: ["view", "create", "edit", "delete"],
  studyMaterials: ["view", "create", "edit", "delete"],
  lessonPlans: ["view", "create", "edit"],
  examTests: ["view"],
  examTerm: ["view"],
  examDateSheet: ["view"],
  examReportCard: ["view"],
  studentProgress: ["view"],
  chat: ["view", "create", "participate"],
  announcement: ["view", "create", "edit"],
  behaviour: ["view", "create", "edit"],
  parentMeetings: ["view", "create", "edit"],
  onlineClasses: ["view", "create", "edit", "delete"],
  library: ["view"],
  schoolCalendar: ["view"],
  notifications: ["view"],
  profile: ["view", "edit"],
  leave: ["view", "create"],
  staffAttendance: ["view", "create"],
  attendance: ["view", "create", "edit", "correct"],
  reports: ["view"],
};

/** Default module grants for a new accountant account (matches seeded accountant role). */
export const ACCOUNTANT_DEFAULT_MODULE_PERMISSIONS: Record<string, string[]> = {
  student: ["view", "activate"],
  classes: ["view", "create", "edit", "record", "generate"],
  sections: ["view", "create", "edit", "record", "generate"],
  subjects: ["view", "create", "edit", "record", "generate"],
  disciplines: ["view", "create", "edit", "record", "generate"],
  studentRegistration: ["view", "create", "edit", "record", "generate"],
  changeSection: ["view", "create", "edit", "record", "generate"],
  feeStructure: ["view", "create", "edit", "record", "generate"],
  fee: ["view", "create", "edit", "generate", "record"],
  salary: ["view", "process", "generate", "record"],
  academyExpense: ["view", "create", "edit", "delete", "record"],
  attendance: ["view"],
  examTests: ["view"],
  examTerm: ["view"],
  examDateSheet: ["view"],
  examReportCard: ["view"],
  chat: ["view", "create", "participate"],
  datasheets: ["view", "create", "edit", "delete"],
  reports: ["view"],
  notifications: ["view"],
  profile: ["view", "edit"],
  schoolCalendar: ["view"],
  leave: ["view", "create"],
  staffAttendance: ["view", "create"],
};

/** Default module grants for a new parent account (matches seeded parent role / parentDefaults.js). */
export const PARENT_DEFAULT_MODULE_PERMISSIONS: Record<string, string[]> = {
  student: ["view"],
  attendance: ["view"],
  examTests: ["view"],
  examTerm: ["view"],
  examDateSheet: ["view"],
  examReportCard: ["view"],
  timetableView: ["view"],
  chat: ["view", "create", "participate"],
  announcement: ["view"],
  notifications: ["view"],
  schoolCalendar: ["view"],
};

/** Modules selectable for parent accounts (portal matrix only). */
export const PARENT_ALLOWED_MODULE_KEYS = new Set(Object.keys(PARENT_DEFAULT_MODULE_PERMISSIONS));

export async function fetchParentStudents(parentUserId: string): Promise<LinkedStudentSummary[]> {
  const res = await authedFetch(`/users/${parentUserId}/parent-students`);
  const body = await parseJson<{ success?: boolean; data?: LinkedStudentSummary[]; message?: string }>(res);
  if (!res.ok) throw new Error(body.message || "Failed to load parent students");
  return body.data || [];
}

export async function assignParentStudents(parentUserId: string, studentIds: string[]): Promise<void> {
  const res = await authedFetch(`/users/${parentUserId}/parent-students`, {
    method: "PATCH",
    body: JSON.stringify({ studentIds }),
  });
  const body = await parseJson<{ success?: boolean; message?: string }>(res);
  if (!res.ok) throw new Error(body.message || "Failed to assign parent students");
}

export async function createStaffUser(payload: {
  name: string;
  email: string;
  password: string;
  phone: string;
  role: string;
  isActive?: boolean;
  payType?: "fixed" | "percentage";
  salary?: number;
  salaryPercentage?: number;
  modulePermissions?: Record<string, string[]>;
}): Promise<StaffUser> {
  const res = await authedFetch("/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const body = await parseJson<{ success?: boolean; message?: string; data?: StaffUser }>(res);
  if (!res.ok) throw new Error(body.message || "Failed to create staff");
  if (!body.data) throw new Error("Invalid response");
  return body.data;
}

export async function updateStaffUser(
  id: string,
  payload: Partial<{
    name: string;
    email: string;
    phone: string;
    role: string;
    isActive: boolean;
    payType: "fixed" | "percentage";
    salary: number;
    salaryPercentage: number;
    password: string;
    modulePermissions: Record<string, string[]>;
  }>,
): Promise<StaffUser> {
  const res = await authedFetch(`/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  const body = await parseJson<{ success?: boolean; message?: string; data?: StaffUser }>(res);
  if (!res.ok) throw new Error(body.message || "Failed to update staff");
  if (!body.data) throw new Error("Invalid response");
  return body.data;
}

export async function deleteStaffUser(id: string): Promise<void> {
  const res = await authedFetch(`/users/${id}`, { method: "DELETE" });
  const body = await parseJson<{ success?: boolean; message?: string }>(res);
  if (!res.ok) throw new Error(body.message || "Failed to delete user");
}

export type BulkUserAction = "activate" | "deactivate" | "delete" | "resetPassword";

export interface BulkUsersResult {
  action: BulkUserAction;
  processed: number;
  skipped?: number;
  failed: { id: string; reason: string }[];
  /** Present after resetPassword — show once to the operator. */
  password?: string;
}

export async function bulkUsersAction(
  action: BulkUserAction,
  ids: string[],
  password?: string,
): Promise<BulkUsersResult> {
  const res = await authedFetch("/users/bulk", {
    method: "POST",
    body: JSON.stringify({ action, ids, ...(password ? { password } : {}) }),
  });
  const body = await parseJson<{
    success?: boolean;
    message?: string;
    data?: BulkUsersResult;
  }>(res);
  if (!res.ok || !body.data) throw new Error(body.message || "Bulk action failed");
  return body.data;
}

export async function patchUserPermissionIds(userId: string, permissionIds: string[]): Promise<UserWithAccess> {
  const res = await authedFetch(`/users/${userId}/permissions`, {
    method: "PATCH",
    body: JSON.stringify({ permissionIds }),
  });
  const body = await parseJson<{ success?: boolean; message?: string; data?: UserWithAccess }>(res);
  if (!res.ok) throw new Error(body.message || "Failed to update API permissions");
  if (!body.data) throw new Error("Invalid response");
  return body.data;
}

export async function uploadStaffProfilePhoto(userId: string, file: File): Promise<StaffUser> {
  const fd = new FormData();
  fd.append("photo", file);
  const res = await authedFetch(`/users/${userId}/profile-photo`, { method: "POST", body: fd });
  const body = await parseJson<{ success?: boolean; message?: string; data?: StaffUser }>(res);
  if (!res.ok) throw new Error(body.message || "Upload failed");
  if (!body.data) throw new Error("Invalid response");
  return body.data;
}

export type StaffReportFormat = "xlsx" | "pdf";

export async function exportStaffReport(
  staffId: string,
  params: { format?: StaffReportFormat; month?: number; year?: number; sessionId?: string } = {},
) {
  const format = params.format || "xlsx";
  const q = new URLSearchParams({ format });
  if (params.month) q.set("month", String(params.month));
  if (params.year) q.set("year", String(params.year));
  if (params.sessionId) q.set("sessionId", params.sessionId);
  const res = await authedFetch(`/users/${staffId}/report?${q}`, { method: "GET" });
  if (!res.ok) throw new Error("Export failed");
  return res.blob();
}
