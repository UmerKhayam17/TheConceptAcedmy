import { describe, it, expect } from "vitest";
import { PARENT_DEFAULT_MODULE_PERMISSIONS } from "@/lib/staffApi";
import {
  DEFAULT_PERMISSIONS,
  applyBackendModulePermissions,
  canRead,
} from "@/lib/permissions";
import { PARENT_SIDEBAR_NAV, MOBILE_PRIMARY_NAV_IDS } from "@/lib/sidebarNav";

const FORBIDDEN_PARENT_BACKEND_KEYS = [
  "timetableBuilder",
  "timetableBoard",
  "fee",
  "feeStructure",
  "studentRegistration",
  "salary",
  "academyExpense",
  "profile",
  "parentUsers",
  "staffUsers",
  "adminUsers",
];

describe("parent role matrix", () => {
  it("defaults include portal modules and view-only timetable", () => {
    expect(PARENT_DEFAULT_MODULE_PERMISSIONS.timetableView).toEqual(["view"]);
    expect(PARENT_DEFAULT_MODULE_PERMISSIONS.timetableBuilder).toBeUndefined();
    expect(PARENT_DEFAULT_MODULE_PERMISSIONS.timetableBoard).toBeUndefined();
    expect(PARENT_DEFAULT_MODULE_PERMISSIONS.notifications).toEqual(["view"]);
    expect(PARENT_DEFAULT_MODULE_PERMISSIONS.schoolCalendar).toEqual(["view"]);
    expect(PARENT_DEFAULT_MODULE_PERMISSIONS.student).toEqual(["view"]);
    expect(PARENT_DEFAULT_MODULE_PERMISSIONS.attendance).toEqual(["view"]);
    expect(PARENT_DEFAULT_MODULE_PERMISSIONS.examTests).toEqual(["view"]);
    expect(PARENT_DEFAULT_MODULE_PERMISSIONS.chat).toContain("view");
    expect(PARENT_DEFAULT_MODULE_PERMISSIONS.announcement).toEqual(["view"]);
  });

  it("excludes fees, registration, staff, salary, settings, admin modules", () => {
    for (const key of FORBIDDEN_PARENT_BACKEND_KEYS) {
      expect(PARENT_DEFAULT_MODULE_PERMISSIONS[key]).toBeUndefined();
    }
  });

  it("frontend parent defaults match view-only timetable (no builder/board)", () => {
    const parent = DEFAULT_PERMISSIONS.parent;
    expect(canRead(parent["timetable-view"])).toBe(true);
    expect(canRead(parent["timetable-builder"])).toBe(false);
    expect(canRead(parent["timetable-board"])).toBe(false);
    expect(canRead(parent.students)).toBe(true);
    expect(canRead(parent.attendance)).toBe(true);
    expect(canRead(parent["exam-tests"])).toBe(true);
    expect(canRead(parent.chat)).toBe(true);
    expect(canRead(parent.announcements)).toBe(true);
    expect(canRead(parent.notifications)).toBe(true);
    expect(canRead(parent["school-calendar"])).toBe(true);
    expect(canRead(parent.fees)).toBe(false);
    expect(canRead(parent["student-registration"])).toBe(false);
    expect(canRead(parent.salary)).toBe(false);
    expect(canRead(parent.settings)).toBe(false);
    expect(canRead(parent.parents)).toBe(false);
  });

  it("backend modulePermissions drive the same panel access", () => {
    const next = applyBackendModulePermissions(
      DEFAULT_PERMISSIONS.parent,
      PARENT_DEFAULT_MODULE_PERMISSIONS,
      "parent",
      false,
    );
    expect(canRead(next["timetable-view"])).toBe(true);
    expect(canRead(next["timetable-builder"])).toBe(false);
    expect(canRead(next["timetable-board"])).toBe(false);
    expect(canRead(next.notifications)).toBe(true);
    expect(canRead(next["school-calendar"])).toBe(true);
    expect(canRead(next.fees)).toBe(false);
  });

  it("parent sidebar includes exams, notifications, calendar; not builder/board", () => {
    const keys = PARENT_SIDEBAR_NAV.flatMap((g) => g.items.map((i) => i.moduleKey));
    expect(keys).toContain("dashboard");
    expect(keys).toContain("students");
    expect(keys).toContain("attendance");
    expect(keys).toContain("timetable-view");
    expect(keys).toContain("exam-term");
    expect(keys).toContain("exam-date-sheet");
    expect(keys).toContain("exam-report-card");
    expect(keys).toContain("chat");
    expect(keys).toContain("announcements");
    expect(keys).toContain("notifications");
    expect(keys).toContain("school-calendar");
    expect(keys).not.toContain("timetable-builder");
    expect(keys).not.toContain("timetable-board");
    expect(keys).not.toContain("fees");
    expect(MOBILE_PRIMARY_NAV_IDS.parent).toContain("dashboard");
    expect(MOBILE_PRIMARY_NAV_IDS.parent).toContain("term-results");
  });

  it("parent exam nav includes Exam and Results, Date Sheet, and Report Card", () => {
    const examGroup = PARENT_SIDEBAR_NAV.find((g) => g.id === "examinations");
    expect(examGroup?.label).toBe("Exam and Results");
    expect(examGroup?.collapsible).toBe(true);
    const labels = (examGroup?.items || []).map((i) => i.label);
    expect(labels).toEqual(["Exam and Results", "Date Sheet", "Report Card"]);
  });
});
