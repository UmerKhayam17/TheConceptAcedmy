import type { ComponentType } from "react";
import {
  Award,
  ClipboardList,
  Clock,
  DoorOpen,
  GraduationCap,
  History,
  Layers,
  Link2,
  SlidersHorizontal,
  UserCircle,
} from "lucide-react";
import type { Role } from "./auth";
import { buildSidebarSubmenuGroups } from "./sidebarSubmenu";

export type SystemConfigSection =
  | "academic"
  | "test-catalog"
  | "exam-catalog"
  | "sections"
  | "periods"
  | "rooms"
  | "teachers"
  | "teacher-assignments"
  | "subject-teachers"
  | "timetable-rules"
  | "history";

export const SYSTEM_CONFIG_SECTIONS: {
  key: SystemConfigSection;
  label: string;
  icon: ComponentType<{ className?: string }>;
}[] = [
    { key: "academic", label: "Sessions", icon: GraduationCap },
    { key: "history", label: "Session History", icon: History },
    { key: "test-catalog", label: "Test Catalog", icon: ClipboardList },
    { key: "exam-catalog", label: "Exam Catalog", icon: Award },
    { key: "sections", label: "Timetable Sections", icon: Layers },
    { key: "periods", label: "Academy Time Configuration", icon: Clock },
    { key: "rooms", label: "Rooms", icon: DoorOpen },
    { key: "teachers", label: "Teachers", icon: UserCircle },
    { key: "subject-teachers", label: "Subject Teachers", icon: Link2 },
    { key: "timetable-rules", label: "Timetable Rules", icon: SlidersHorizontal },
  ];

export const SYSTEM_CONFIG_SIDEBAR_GROUPS = buildSidebarSubmenuGroups(SYSTEM_CONFIG_SECTIONS, [
  { label: "Academic year", keys: ["academic", "history", "test-catalog", "exam-catalog"] },
  {
    label: "Timetable setup",
    keys: ["rooms", "teachers", "subject-teachers", "periods", "sections", "timetable-rules"],
  },
]);

export const DEFAULT_SYSTEM_CONFIG_SECTION: SystemConfigSection = "academic";

export function isSystemConfigSection(value: string | undefined): value is SystemConfigSection {
  return SYSTEM_CONFIG_SECTIONS.some((s) => s.key === value);
}

export function systemConfigHref(role: Role, section: SystemConfigSection = DEFAULT_SYSTEM_CONFIG_SECTION) {
  return `/panel/${role}/system-config/${section}`;
}

const SESSION_MONGO_ID = /^[a-f0-9]{24}$/i;

export function isSessionMongoId(value: string | undefined): value is string {
  return Boolean(value && SESSION_MONGO_ID.test(value));
}

export function sessionDetailHref(role: Role, sessionId: string) {
  return `/panel/${role}/system-config/academic/${sessionId}`;
}

export function findSystemConfigSection(section: string | undefined): SystemConfigSection {
  return isSystemConfigSection(section) ? section : DEFAULT_SYSTEM_CONFIG_SECTION;
}
