/**
 * Assessment taxonomy — single source of truth (mirrors backend).
 *
 * Assessment = umbrella for anything that measures student learning.
 *   ├── Tests  (ongoing / formative)
 *   └── Exams  (formal / summative)
 */

export type AssessmentCategory = "test" | "exam";

export type AssessmentType =
  | "weekly"
  | "monthly"
  | "unit"
  | "full_length"
  | "full_book"
  | "midterm"
  | "final"
  /** @deprecated legacy values kept for existing records */
  | "quiz"
  | "assignment"
  | "practice"
  | "other";

export type CanonicalAssessmentType = Exclude<
  AssessmentType,
  "quiz" | "assignment" | "practice" | "other"
>;

export const ASSESSMENT_CATEGORIES: Record<
  AssessmentCategory,
  { key: AssessmentCategory; label: string; description: string }
> = {
  test: {
    key: "test",
    label: "Tests",
    description: "Ongoing assessments used during the session (weekly, monthly, unit).",
  },
  exam: {
    key: "exam",
    label: "Exams",
    description: "Formal papers and term examinations.",
  },
};

export const ASSESSMENT_TYPES: Record<
  CanonicalAssessmentType,
  { key: CanonicalAssessmentType; label: string; category: AssessmentCategory }
> = {
  weekly: { key: "weekly", label: "Weekly Test", category: "test" },
  monthly: { key: "monthly", label: "Monthly Test", category: "test" },
  unit: { key: "unit", label: "Unit Test", category: "test" },
  full_length: { key: "full_length", label: "Full Length Paper", category: "exam" },
  full_book: { key: "full_book", label: "Full Book Paper", category: "exam" },
  midterm: { key: "midterm", label: "Mid Term", category: "exam" },
  final: { key: "final", label: "Final Exam", category: "exam" },
};

const LEGACY_ASSESSMENT_TYPES: Record<
  Extract<AssessmentType, "quiz" | "assignment" | "practice" | "other">,
  { key: AssessmentType; label: string; category: AssessmentCategory }
> = {
  quiz: { key: "quiz", label: "Quiz", category: "test" },
  assignment: { key: "assignment", label: "Assignment", category: "test" },
  practice: { key: "practice", label: "Practice Test", category: "test" },
  other: { key: "other", label: "Other", category: "test" },
};

const ALL_TYPE_DEFS = { ...ASSESSMENT_TYPES, ...LEGACY_ASSESSMENT_TYPES };

export const ASSESSMENT_TYPE_KEYS = Object.keys(ASSESSMENT_TYPES) as CanonicalAssessmentType[];

export const TEST_TYPE_KEYS = ASSESSMENT_TYPE_KEYS.filter((k) => ASSESSMENT_TYPES[k].category === "test");

export const EXAM_TYPE_KEYS = ASSESSMENT_TYPE_KEYS.filter((k) => ASSESSMENT_TYPES[k].category === "exam");

/** Labels for the term Exam `type` field. */
export const EXAM_TYPE_LABELS = EXAM_TYPE_KEYS.map((k) => ASSESSMENT_TYPES[k].label);

export const ASSESSMENT_TYPE_LABELS: Record<AssessmentType, string> = {
  weekly: "Weekly Test",
  monthly: "Monthly Test",
  unit: "Unit Test",
  full_length: "Full Length Paper",
  full_book: "Full Book Paper",
  midterm: "Mid Term",
  final: "Final Exam",
  quiz: "Quiz",
  assignment: "Assignment",
  practice: "Practice Test",
  other: "Other",
};

export function assessmentTypeLabel(type: string | undefined | null): string {
  if (!type) return "";
  return (ASSESSMENT_TYPE_LABELS as Record<string, string>)[type] || type;
}

export function assessmentCategoryOf(type: string | undefined | null): AssessmentCategory | null {
  if (!type) return null;
  return ALL_TYPE_DEFS[type as AssessmentType]?.category ?? null;
}

export function isTestType(type: string | undefined | null): boolean {
  return assessmentCategoryOf(type) === "test";
}

export function isExamType(type: string | undefined | null): boolean {
  return assessmentCategoryOf(type) === "exam";
}

export function typesForCategory(category: AssessmentCategory): CanonicalAssessmentType[] {
  return ASSESSMENT_TYPE_KEYS.filter((k) => ASSESSMENT_TYPES[k].category === category);
}

/** Default test slots when a session assessment plan is initialized. */
export const TEST_NAME_TEMPLATES = Array.from({ length: 15 }, (_, i) => ({
  name: `TEST NO.${i + 1}`,
  assessmentType: (i === 0 ? "weekly" : i === 1 ? "monthly" : "weekly") as CanonicalAssessmentType,
  category: "test" as const,
}));

/** Default exam slots when a session assessment plan is initialized. */
export const EXAM_NAME_TEMPLATES = [
  { name: "FULL LENGTH PAPER-I", assessmentType: "full_length" as const, category: "exam" as const },
  { name: "FULL LENGTH PAPER-II", assessmentType: "full_length" as const, category: "exam" as const },
  { name: "FULL LENGTH PAPER-III", assessmentType: "full_length" as const, category: "exam" as const },
  { name: "FULL BOOK PAPER", assessmentType: "full_book" as const, category: "exam" as const },
];
