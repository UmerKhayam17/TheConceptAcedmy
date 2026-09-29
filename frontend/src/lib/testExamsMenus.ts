import type { ComponentType } from "react";
import { CalendarDays, ClipboardList, GraduationCap, Link2 } from "lucide-react";
import type { Role } from "./auth";

export type TestExamsSection = "assign" | "enter-tests" | "term-exams" | "date-sheet";

export const TEST_EXAMS_SECTIONS: {
  key: TestExamsSection;
  label: string;
  icon: ComponentType<{ className?: string }>;
}[] = [
  { key: "assign", label: "Assign", icon: Link2 },
  { key: "enter-tests", label: "Tests", icon: ClipboardList },
  { key: "term-exams", label: "Exams", icon: GraduationCap },
  { key: "date-sheet", label: "Date sheet", icon: CalendarDays },
];

export const DEFAULT_TEST_EXAMS_SECTION: TestExamsSection = "assign";

export function isTestExamsSection(value: string | undefined): value is TestExamsSection {
  return TEST_EXAMS_SECTIONS.some((s) => s.key === value);
}

const MONGO_ID = /^[a-f0-9]{24}$/i;

export function isClassTestId(value: string | undefined): value is string {
  return Boolean(value && MONGO_ID.test(value));
}

export function isClassTestSeriesId(value: string | undefined): value is string {
  return isClassTestId(value);
}

/** Series schedule detail — all dates in one recurring test. */
export function classTestSeriesHref(role: Role, seriesId: string) {
  return `/panel/${role}/exams/enter-tests/series/${seriesId}`;
}

export function testExamsHref(role: Role, section: TestExamsSection = DEFAULT_TEST_EXAMS_SECTION) {
  return `/panel/${role}/exams/${section}`;
}

/** Marks entry page for one class test — all students in the class. */
export function classTestMarksHref(role: Role, testId: string) {
  return `/panel/${role}/exams/enter-tests/${testId}`;
}

export function findTestExamsSection(section: string | undefined): TestExamsSection {
  return isTestExamsSection(section) ? section : DEFAULT_TEST_EXAMS_SECTION;
}
