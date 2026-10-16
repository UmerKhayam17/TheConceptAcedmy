/**
 * Map hub route slug + section → leaf ModuleKey for granular RBAC.
 * URL paths stay `/exams/date-sheet`, `/system-config/rooms`, etc.
 */
import type { ModuleActionCaps, ModuleKey, PermLevel } from "./permissions";
import type { Role } from "./auth";
// Value imports from permissions.ts are forbidden here (permissions imports this file).

export const EXAM_SECTION_MAP: Record<string, ModuleKey> = {
  "enter-tests": "exam-tests",
  "term-exams": "exam-term",
  "date-sheet": "exam-date-sheet",
  "report-card": "exam-report-card",
};

export const SYSTEM_CONFIG_SECTION_MAP: Record<string, ModuleKey> = {
  academic: "sessions",
  history: "session-history",
  "test-catalog": "test-catalog",
  "exam-catalog": "exam-catalog",
  assessments: "test-catalog",
  rooms: "rooms",
  periods: "periods",
  "timetable-rules": "timetable-rules",
  teachers: "teachers",
  "subject-teachers": "subject-teachers",
};

export const STUDENT_MGMT_SECTION_MAP: Record<string, ModuleKey> = {
  classes: "classes",
  sections: "sections",
  subjects: "subjects",
  disciplines: "disciplines",
  registration: "student-registration",
  "change-section": "change-section",
  "fees-structure": "fee-structure",
};

export const TIMETABLE_SECTION_MAP: Record<string, ModuleKey> = {
  builder: "timetable-builder",
  board: "timetable-board",
  view: "timetable-view",
  mine: "timetable-view",
};

/** Leaf keys that belong to a route hub (for “any leaf view” redirects). */
export const HUB_LEAF_KEYS: Record<string, ModuleKey[]> = {
  exams: ["exam-tests", "exam-term", "exam-date-sheet", "exam-report-card"],
  "system-config": [
    "sessions",
    "session-history",
    "rooms",
    "periods",
    "timetable-rules",
    "test-catalog",
    "exam-catalog",
    "teachers",
    "subject-teachers",
  ],
  "student-management": [
    "classes",
    "sections",
    "subjects",
    "disciplines",
    "student-registration",
    "change-section",
    "fee-structure",
  ],
  timetable: ["timetable-builder", "timetable-board", "timetable-view"],
};

/**
 * Resolve the permission ModuleKey for a hub route + optional section.
 * Falls back to the hub key when section is unknown.
 */
export function resolveHubSectionModuleKey(
  hubKey: ModuleKey | string,
  section?: string | null,
): ModuleKey {
  const hub = hubKey as string;
  if (!section) {
    return hubKey as ModuleKey;
  }
  if (hub === "exams") {
    return EXAM_SECTION_MAP[section] || (hubKey as ModuleKey);
  }
  if (hub === "system-config") {
    return SYSTEM_CONFIG_SECTION_MAP[section] || (hubKey as ModuleKey);
  }
  if (hub === "student-management") {
    return STUDENT_MGMT_SECTION_MAP[section] || (hubKey as ModuleKey);
  }
  if (hub === "timetable") {
    return TIMETABLE_SECTION_MAP[section] || (hubKey as ModuleKey);
  }
  return hubKey as ModuleKey;
}

type CapsResolver = (
  key: ModuleKey,
  level: PermLevel,
  backend?: Record<string, string[]>,
  role?: Role,
  isSystemAdmin?: boolean,
) => ModuleActionCaps;

/** First hub section the user can view (for default redirects). */
export function firstAccessibleSection(
  sectionMap: Record<string, ModuleKey>,
  resolveCaps: CapsResolver,
  rolePerms: Record<ModuleKey, PermLevel>,
  backendPerms?: Record<string, string[]>,
  role?: Role,
  isSystemAdmin?: boolean,
): string | undefined {
  for (const [section, leaf] of Object.entries(sectionMap)) {
    if (section === "assessments") continue;
    const caps = resolveCaps(leaf, rolePerms[leaf] || "none", backendPerms, role, isSystemAdmin);
    if (caps.canView) return section;
  }
  return undefined;
}
