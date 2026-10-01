import type { ComponentType } from "react";
import { BookOpen, GraduationCap, Layers, Route, UserPlus, Wallet } from "lucide-react";
import type { Role } from "./auth";
import { buildSidebarSubmenuGroups } from "./sidebarSubmenu";

export type StudentManagementSection =
  | "classes"
  | "sections"
  | "subjects"
  | "disciplines"
  | "fees-structure"
  | "registration"
  | "fees"
  | "fee-defaulters";

/** Academy setup — follow order: session → class → section → subjects → disciplines → fee → student. */
export const STUDENT_MANAGEMENT_SECTIONS: {
  key: StudentManagementSection;
  label: string;
  icon: ComponentType<{ className?: string }>;
}[] = [
  { key: "classes", label: "Classes", icon: GraduationCap },
  { key: "sections", label: "Sections", icon: Layers },
  { key: "subjects", label: "Subjects", icon: BookOpen },
  { key: "disciplines", label: "Disciplines", icon: Route },
  { key: "fees-structure", label: "Fee structure", icon: Wallet },
  { key: "registration", label: "Register students", icon: UserPlus },
];

export const STUDENT_MANAGEMENT_SIDEBAR_GROUPS = buildSidebarSubmenuGroups(STUDENT_MANAGEMENT_SECTIONS, [
  { label: "1. Structure", keys: ["classes", "sections", "subjects", "disciplines"] },
  { label: "2. Enrollment", keys: ["registration"] },
  { label: "3. Fees", keys: ["fees-structure"] },
]);

export const DEFAULT_STUDENT_MANAGEMENT_SECTION: StudentManagementSection = "classes";

export function isStudentManagementSection(value: string | undefined): value is StudentManagementSection {
  return STUDENT_MANAGEMENT_SECTIONS.some((s) => s.key === value);
}

export function studentManagementHref(
  role: Role,
  section: StudentManagementSection = DEFAULT_STUDENT_MANAGEMENT_SECTION
) {
  return `/panel/${role}/student-management/${section}`;
}

export type AcademyStudentRoutes = {
  list: string;
  new: string;
  register: string;
  detail: (studentId: string) => string;
  edit: (studentId: string) => string;
  activate: (studentId: string) => string;
};

export function academyStudentRoutes(
  role: Role,
  base: "registration" | "records" = "registration"
): AcademyStudentRoutes {
  if (base === "records") {
    const root = `/panel/${role}/students`;
    return {
      list: root,
      new: `${root}/new`,
      register: `${root}/register`,
      detail: (studentId) => `${root}/${studentId}`,
      edit: (studentId) => `${root}/${studentId}/edit`,
      activate: (studentId) => `${root}/${studentId}/activate`,
    };
  }
  const root = `/panel/${role}/student-management/registration`;
  return {
    list: root,
    new: `${root}/new`,
    register: `${root}/register`,
    detail: (studentId) => `${root}/${studentId}`,
    edit: (studentId) => `${root}/${studentId}/edit`,
    activate: (studentId) => `${root}/${studentId}/activate`,
  };
}

export function studentRegistrationNewHref(role: Role) {
  return academyStudentRoutes(role, "registration").new;
}

const MONGO_ID = /^[a-f0-9]{24}$/i;

export function isAcademyStudentId(value: string | undefined): value is string {
  return Boolean(value && MONGO_ID.test(value));
}

export function isAcademyClassId(value: string | undefined): value is string {
  return isAcademyStudentId(value);
}

export type AcademyClassRoutes = {
  list: string;
  detail: (classId: string) => string;
};

export function academyClassRoutes(role: Role): AcademyClassRoutes {
  const root = `/panel/${role}/student-management/classes`;
  return {
    list: root,
    detail: (classId) => `${root}/${classId}`,
  };
}

export function classDetailHref(role: Role, classId: string) {
  return academyClassRoutes(role).detail(classId);
}

export function studentRegistrationListHref(role: Role) {
  return academyStudentRoutes(role, "registration").list;
}

export function studentDetailHref(role: Role, studentId: string) {
  return academyStudentRoutes(role, "registration").detail(studentId);
}

export function studentEditHref(role: Role, studentId: string) {
  return academyStudentRoutes(role, "registration").edit(studentId);
}

export function studentRecordsListHref(role: Role) {
  return academyStudentRoutes(role, "records").list;
}

export function findStudentManagementSection(section: string | undefined): StudentManagementSection {
  return isStudentManagementSection(section) ? section : DEFAULT_STUDENT_MANAGEMENT_SECTION;
}
