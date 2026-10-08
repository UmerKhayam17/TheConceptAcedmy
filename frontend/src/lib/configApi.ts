import { getApiRoot, parseJson } from "@/lib/api";
import { authedFetch } from "@/lib/auth";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authedFetch(`/config${path}`, init);
  const body = await parseJson<{ success?: boolean; data?: T; message?: string; details?: unknown }>(res);
  if (!res.ok) {
    const msg =
      body.message ||
      (Array.isArray(body.details) ? (body.details as { message?: string }[]).map((d) => d.message).join(", ") : null) ||
      `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body.data as T;
}

export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type SessionStatus = "active" | "completed" | "archived";

export interface AcademicSession {
  _id: string;
  name: string;
  startDate: string;
  endDate: string;
  status?: SessionStatus;
  isActive: boolean;
  isClosed?: boolean;
  workingDays?: Weekday[];
  timezone?: string;
  completedAt?: string;
  archivedAt?: string;
  clonedFrom?: string;
  notes?: string;
  writable?: boolean;
}

export interface SessionHistory {
  session: AcademicSession;
  summary: {
    classCount: number;
    sectionCount: number;
    studentCount: number;
    timetableVersions: number;
    scheduleSlots: number;
    versionsByStatus: Record<string, number>;
  };
  academy: {
    classCount: number;
    sectionCount: number;
    studentCount: number;
    classes: {
      _id: string;
      className: string;
      status: string;
      sections: { _id: string; sectionName: string; status: string }[];
    }[];
  };
  classes: { _id: string; name: string; sections: { _id: string; name: string }[]; subjects: { _id: string; name: string; code: string }[] }[];
  timetableVersions: {
    _id: string;
    version: number;
    status: string;
    class?: { name: string };
    section?: { name: string };
    publishedAt?: string;
    createdAt?: string;
  }[];
  auditLogs: {
    _id: string;
    action: string;
    details?: Record<string, unknown>;
    createdAt: string;
    user?: { name: string; email?: string };
  }[];
}

export interface SchoolClass {
  _id: string;
  name: string;
  className?: string;
  session: string | AcademicSession;
  sections?: SchoolSection[];
  subjects?: SchoolSubject[];
  classTeacher?: { _id: string; name: string };
  order?: number;
}

export interface SchoolSection {
  _id: string;
  name: string;
  sectionName?: string;
  class: string | { _id: string; name: string; session?: string };
  teacher?: { _id: string; name: string; email?: string } | null;
  maxStudents?: number;
  studentCount?: number;
}

export interface SchoolSubject {
  _id: string;
  name: string;
  subjectName?: string;
  code: string;
  subjectCode?: string;
  class: string | { _id: string; name: string };
  teacher?: { _id: string; name: string };
  enrollmentType?: "required" | "choice";
  choiceGroupName?: string;
  pickCount?: number;
}

/** Ordinal suffix: 1→st, 2→nd, 3→rd, else th (11–13 → th). */
function ordinalSuffix(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return "th";
  switch (n % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

/**
 * Friendly class labels for academy display / print:
 * 9 → 9th, 10 → 10th, 1 → 1st Year, 2 → 2nd Year.
 * Preserves section suffixes (e.g. 9-A1 → 9th-A1).
 */
export function formatClassLevelLabel(raw?: string | null): string {
  const input = String(raw || "").trim();
  if (!input) return "";

  const lower = input.toLowerCase().replace(/\s+/g, " ");

  // Already / mostly "1st year" / "2nd year"
  const yearOnly = lower.match(/^(1st|first|1)\s*year$/i);
  if (yearOnly) return "1st Year";
  const year2Only = lower.match(/^(2nd|second|2)\s*year$/i);
  if (year2Only) return "2nd Year";

  // "1st year-A1" / "1st Year A1"
  const yearWithSection = input.match(/^(1st|first|1)\s*year\s*([-–—/\s]+)(.+)$/i);
  if (yearWithSection) return `1st Year-${yearWithSection[3].trim()}`;
  const year2WithSection = input.match(/^(2nd|second|2)\s*year\s*([-–—/\s]+)(.+)$/i);
  if (year2WithSection) return `2nd Year-${year2WithSection[3].trim()}`;

  // Bare 1 / 2 → intermediate years (academy)
  if (/^(1|1st)$/i.test(input)) return "1st Year";
  if (/^(2|2nd)$/i.test(input)) return "2nd Year";

  // "1-A1" / "2-A1" → "1st Year-A1"
  const bareYearSection = input.match(/^([12])\s*([-–—/])\s*(.+)$/);
  if (bareYearSection) {
    const year = bareYearSection[1] === "1" ? "1st Year" : "2nd Year";
    return `${year}-${bareYearSection[3].trim()}`;
  }

  // Leading grade number: 9, 9th, 9-A1, 10th A1, Class 9, etc.
  const grade = input.match(/^(?:class\s*)?(\d{1,2})(?:st|nd|rd|th)?\s*([-–—/\s]*)(.*)$/i);
  if (grade) {
    const n = Number(grade[1]);
    if (n >= 1 && n <= 12) {
      // 1–2 with no section already handled; with empty rest treat as year
      if ((n === 1 || n === 2) && !String(grade[3] || "").trim()) {
        return n === 1 ? "1st Year" : "2nd Year";
      }
      const ord = `${n}${ordinalSuffix(n)}`;
      const rest = String(grade[3] || "").trim();
      if (!rest) return ord;
      const sep = grade[2] && /[-–—/]/.test(grade[2]) ? "-" : grade[2]?.trim() ? " " : "-";
      return `${ord}${sep}${rest}`;
    }
  }

  return input;
}

export function classDisplayName(c: { name?: string; className?: string } | null | undefined): string {
  const raw = c?.name || c?.className || "";
  return formatClassLevelLabel(raw) || "—";
}

export function sectionDisplayName(s: { name?: string; sectionName?: string } | null | undefined): string {
  return s?.name || s?.sectionName || "—";
}

/** Class board / print row label: "9th-A1", "1st Year-A1". */
export function classSectionBoardLabel(
  className?: string | null,
  sectionName?: string | null,
  existingLabel?: string | null
): string {
  if (existingLabel?.trim()) return formatClassLevelLabel(existingLabel);
  const cls = formatClassLevelLabel(className);
  const sec = String(sectionName || "").trim();
  if (cls && sec) return formatClassLevelLabel(`${cls}-${sec}`);
  return cls || sec || "—";
}

/** Sort weight: 9→9, 10→10, 1st Year→101, 2nd Year→102. */
export function classLevelSortWeight(raw?: string | null): number {
  const label = formatClassLevelLabel(raw);
  if (/^1st\s*year/i.test(label)) return 101;
  if (/^2nd\s*year/i.test(label)) return 102;
  const m = label.match(/^(\d{1,2})/);
  if (m) {
    const n = Number(m[1]);
    if (n === 1 || n === 2) return 100 + n;
    return n;
  }
  return 999;
}

function sectionSuffixFromLabel(raw?: string | null): string {
  const label = formatClassLevelLabel(raw);
  const year = label.match(/^(?:1st Year|2nd Year)-(.+)$/i);
  if (year) return year[1].trim();
  const g = label.match(/^\d{1,2}(?:st|nd|rd|th)?[-–—/\s]+(.+)$/i);
  if (g) return g[1].trim();
  return "";
}

export function compareClassLevels(a?: string | null, b?: string | null): number {
  const wa = classLevelSortWeight(a);
  const wb = classLevelSortWeight(b);
  if (wa !== wb) return wa - wb;
  const sa = sectionSuffixFromLabel(a);
  const sb = sectionSuffixFromLabel(b);
  if (sa || sb) {
    const sec = sa.localeCompare(sb, undefined, { numeric: true, sensitivity: "base" });
    if (sec !== 0) return sec;
  }
  return String(a || "").localeCompare(String(b || ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

/** Sort class list for filters / dropdowns: 9th → 10th → 1st Year → 2nd Year. */
export function sortClassesByLevel<T extends { name?: string; className?: string }>(classes: T[]): T[] {
  return [...classes].sort((a, b) =>
    compareClassLevels(a.name || a.className || "", b.name || b.className || "")
  );
}

/** Soft program bucket from class name (School grades vs College 1st/2nd Year). */
export type AcademicProgramKey = "school" | "college" | "other";

export function academicProgram(raw?: string | null): AcademicProgramKey {
  const weight = classLevelSortWeight(raw);
  if (weight >= 101 && weight <= 102) return "college";
  if (weight >= 1 && weight <= 12) return "school";
  return "other";
}

export function academicProgramLabel(program: AcademicProgramKey): string {
  if (program === "college") return "College / Intermediate";
  if (program === "school") return "School";
  return "Other programs";
}

/** Group classes for optgroup dropdowns: School → College → Other. */
export function groupClassesByProgram<T extends { name?: string; className?: string; _id: string }>(
  classes: T[]
): { key: AcademicProgramKey; label: string; classes: T[] }[] {
  const buckets: Record<AcademicProgramKey, T[]> = { school: [], college: [], other: [] };
  for (const c of sortClassesByLevel(classes)) {
    buckets[academicProgram(c.name || c.className)].push(c);
  }
  return (["school", "college", "other"] as AcademicProgramKey[])
    .filter((k) => buckets[k].length)
    .map((k) => ({ key: k, label: academicProgramLabel(k), classes: buckets[k] }));
}

export function subjectDisplayName(s: { name?: string; subjectName?: string; code?: string; subjectCode?: string } | null | undefined): string {
  return s?.name || s?.subjectName || "—";
}

export function subjectDisplayCode(s: { code?: string; subjectCode?: string } | null | undefined): string {
  return s?.code || s?.subjectCode || "";
}

const SESSION_STATUSES: SessionStatus[] = ["active", "completed", "archived"];

export function sessionStatus(s: AcademicSession): SessionStatus {
  if (s.status && SESSION_STATUSES.includes(s.status)) return s.status;
  if (s.isClosed) return "completed";
  if (s.isActive) return "active";
  return "active";
}

export function isSessionWritable(s: AcademicSession): boolean {
  return s.writable ?? sessionStatus(s) === "active";
}

/** Completed and archived sessions cannot be made active again. */
export function canActivateSession(s: AcademicSession): boolean {
  const st = sessionStatus(s);
  return st !== "active" && st !== "completed" && st !== "archived";
}

/** Sentinel for the session bar “All sessions” option (not persisted across refresh). */
export const ALL_SESSIONS_ID = "__all__";

export function isAllSessions(sessionId: string | undefined | null): boolean {
  return sessionId === ALL_SESSIONS_ID;
}

/** Mongo session id for API queries, or undefined when browsing all sessions. */
export function sessionQueryId(sessionId: string | undefined | null): string | undefined {
  if (!sessionId || isAllSessions(sessionId)) return undefined;
  return sessionId;
}

export function isSessionScopeWritable(
  sessionId: string | undefined | null,
  sessions: AcademicSession[]
): boolean {
  if (!sessionId || isAllSessions(sessionId)) return false;
  const selected = sessions.find((s) => s._id === sessionId);
  return selected ? isSessionWritable(selected) : false;
}

export const fetchSessions = (status?: SessionStatus) => {
  const q =
    status && typeof status === "string" && SESSION_STATUSES.includes(status as SessionStatus)
      ? `?status=${status}`
      : "";
  return api<AcademicSession[]>(`/sessions${q}`);
};

export const createSession = (body: {
  name: string;
  startDate: string;
  endDate: string;
  isActive?: boolean;
  status?: SessionStatus;
  workingDays?: Weekday[];
  timezone?: string;
  notes?: string;
}) => api<AcademicSession>("/sessions", { method: "POST", body: JSON.stringify(body) });

export const patchSession = (id: string, body: Partial<AcademicSession>) =>
  api<AcademicSession>(`/sessions/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const fetchSessionHistory = (sessionId: string) =>
  api<SessionHistory>(`/sessions/${sessionId}/history`);

export const completeSession = (sessionId: string) =>
  api<AcademicSession>(`/sessions/${sessionId}/complete`, { method: "POST" });

export const archiveSession = (sessionId: string) =>
  api<AcademicSession>(`/sessions/${sessionId}/archive`, { method: "POST" });

export const activateSession = (sessionId: string) =>
  api<AcademicSession>(`/sessions/${sessionId}/activate`, { method: "POST" });

export const cloneSessionStructure = (
  sourceSessionId: string,
  body: {
    name: string;
    startDate: string;
    endDate: string;
    activate?: boolean;
    workingDays?: Weekday[];
    timezone?: string;
    notes?: string;
  }
) =>
  api<{ session: AcademicSession; maps: Record<string, number> }>(
    `/sessions/${sourceSessionId}/clone-structure`,
    { method: "POST", body: JSON.stringify(body) }
  );

export type SessionEnrollmentImportInput = {
  sourceSessionId: string;
  classIds?: string[];
  includeFeeStructure?: boolean;
};

export type SessionEnrollmentImportResult = {
  classes: number;
  sections: number;
  subjects: number;
  feeStructures: number;
  skipped: { className: string; reason: string }[];
  importedClassNames: string[];
};

export type SessionShiftResult = {
  enrollment: SessionEnrollmentImportResult;
  timetable: {
    periodTemplates: number;
    classes: number;
    sections: number;
    subjects: number;
  };
  sourceSession: { _id: string; name: string };
  targetSession: { _id: string; name: string };
};

export const importSessionEnrollment = (targetSessionId: string, body: SessionEnrollmentImportInput) =>
  api<SessionEnrollmentImportResult>(`/sessions/${targetSessionId}/import-enrollment`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const shiftSessionConfiguration = (targetSessionId: string, body: SessionEnrollmentImportInput) =>
  api<SessionShiftResult>(`/sessions/${targetSessionId}/shift-configuration`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const fetchClasses = async (sessionId?: string) => {
  const q = sessionId ? `?sessionId=${sessionId}` : "";
  const classes = await api<SchoolClass[]>(`/classes${q}`);
  return sortClassesByLevel(classes);
};

export const createClass = (body: { name: string; session: string; classTeacher?: string; order?: number }) =>
  api<SchoolClass>("/classes", { method: "POST", body: JSON.stringify(body) });

export const patchClass = (id: string, body: Partial<{ name: string; classTeacher: string; order: number }>) =>
  api<SchoolClass>(`/classes/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const fetchSections = (params?: { classId?: string; sessionId?: string }) => {
  const q = new URLSearchParams();
  if (params?.classId) q.set("classId", params.classId);
  if (params?.sessionId) q.set("sessionId", params.sessionId);
  const qs = q.toString();
  return api<SchoolSection[]>(`/sections${qs ? `?${qs}` : ""}`);
};

export const createSection = (body: { name: string; class: string; teacher?: string; maxStudents?: number }) =>
  api<SchoolSection>("/sections", { method: "POST", body: JSON.stringify(body) });

export const patchSection = (id: string, body: Partial<{ name: string; teacher: string | null; maxStudents: number }>) =>
  api<SchoolSection>(`/sections/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const deleteSection = (id: string) =>
  api<{ deleted: boolean }>(`/sections/${id}`, { method: "DELETE" });

export const fetchSubjects = (classId?: string) => {
  const q = classId ? `?classId=${classId}` : "";
  return api<SchoolSubject[]>(`/subjects${q}`);
};

export const createSubject = (body: {
  name: string;
  code: string;
  class: string;
  teacher?: string;
  totalMarks?: number;
  passingMarks?: number;
}) => api<SchoolSubject>("/subjects", { method: "POST", body: JSON.stringify(body) });

export const patchSubject = (id: string, body: Partial<SchoolSubject & { class: string }>) =>
  api<SchoolSubject>(`/subjects/${id}`, { method: "PATCH", body: JSON.stringify(body) });

/* ── Session Assessment Catalog + Assignments ─────────────────────── */

export type AssessmentPlanStatus = "empty" | "ready";

export type AssessmentPlanPaper = {
  _id?: string;
  subjectId:
    | string
    | { _id: string; subjectName?: string; subjectCode?: string; classId?: string };
  totalMarks?: number;
  examDate?: string;
  syllabus?: string;
  classTestId?: string;
};

export type AssessmentPlanItem = {
  _id: string;
  category: "test" | "exam";
  name: string;
  assessmentType: string;
  assignmentCount?: number;
  publishedCount?: number;
};

export type SessionAssessmentPlan = {
  _id: string;
  sessionId: string;
  status: AssessmentPlanStatus;
  items: AssessmentPlanItem[];
};

export type AssessmentPlanSummary = {
  totalItems: number;
  testCount: number;
  examCount: number;
  status: AssessmentPlanStatus;
  assignmentCount: number;
  publishedAssignmentCount: number;
};

export type AssessmentPlanPayload = {
  plan: SessionAssessmentPlan;
  session: AcademicSession;
  summary: AssessmentPlanSummary;
};

export type AssessmentAssignment = {
  _id: string;
  sessionId: string;
  planId: string;
  planItemId: string;
  category: "test" | "exam";
  name: string;
  assessmentType: string;
  classId: string | { _id: string; className?: string };
  sectionId?: string | { _id: string; sectionName?: string };
  papers: AssessmentPlanPaper[];
  status: "draft" | "published";
  examId?: string;
  publishedAt?: string;
};

export type AssessmentAssignmentsPayload = {
  plan: { _id: string; status: AssessmentPlanStatus; items: AssessmentPlanItem[] };
  assignments: AssessmentAssignment[];
};

export type DateSheetRow = {
  category: "test" | "exam";
  assessmentType: string;
  assessmentTypeLabel: string;
  testName: string;
  className: string;
  classId: string;
  sectionName: string;
  sectionId: string;
  subjectName: string;
  subjectId: string;
  totalMarks: number;
  examDate: string;
  syllabus: string;
  classTestId: string;
  examId: string;
  assignmentId?: string;
};

export type DateSheetPayload = {
  session: AcademicSession;
  publishedAt?: string;
  rows: DateSheetRow[];
};

export const fetchAssessmentPlan = (sessionId: string) =>
  api<AssessmentPlanPayload>(`/sessions/${sessionId}/assessment-plan`);

export const addAssessmentPlanItem = (
  sessionId: string,
  body: { name: string; assessmentType: string },
) =>
  api<AssessmentPlanPayload>(`/sessions/${sessionId}/assessment-plan/items`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const deleteAssessmentPlanItem = (sessionId: string, itemId: string) =>
  api<AssessmentPlanPayload>(`/sessions/${sessionId}/assessment-plan/items/${itemId}`, {
    method: "DELETE",
  });

export const clearAssessmentPlan = (sessionId: string) =>
  api<AssessmentPlanPayload>(`/sessions/${sessionId}/assessment-plan/clear`, { method: "POST" });

export const updateAssessmentPlanItem = (
  sessionId: string,
  itemId: string,
  body: { name?: string; assessmentType?: string },
) =>
  api<AssessmentPlanPayload>(`/sessions/${sessionId}/assessment-plan/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const fetchAssessmentAssignments = (
  sessionId: string,
  params?: { category?: string; planItemId?: string; status?: string },
) => {
  const q = new URLSearchParams();
  if (params?.category) q.set("category", params.category);
  if (params?.planItemId) q.set("planItemId", params.planItemId);
  if (params?.status) q.set("status", params.status);
  const qs = q.toString();
  return api<AssessmentAssignmentsPayload>(
    `/sessions/${sessionId}/assessment-assignments${qs ? `?${qs}` : ""}`,
  );
};

export type TeacherTestScopeAssignment = {
  _id: string;
  classId: string;
  className: string;
  sectionId: string;
  sectionName: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
};

export type TeacherTestScopePayload = {
  combos: {
    assignmentId: string;
    sessionId: string;
    classId: string;
    sectionId: string;
    subjectId: string;
  }[];
  assignments: TeacherTestScopeAssignment[];
};

export const fetchTeacherTestScope = (sessionId: string) =>
  api<TeacherTestScopePayload>(`/sessions/${sessionId}/teacher-test-scope`);

export const createAssessmentAssignment = (
  sessionId: string,
  body: { planItemId: string; classId: string; sectionId?: string },
) =>
  api<{ assignment: AssessmentAssignment; session: AcademicSession }>(
    `/sessions/${sessionId}/assessment-assignments`,
    { method: "POST", body: JSON.stringify(body) },
  );

export const updateAssessmentAssignment = (
  sessionId: string,
  assignmentId: string,
  body: { classId?: string; sectionId?: string | null },
) =>
  api<{ assignment: AssessmentAssignment }>(
    `/sessions/${sessionId}/assessment-assignments/${assignmentId}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );

export const upsertAssessmentAssignmentPapers = (
  sessionId: string,
  assignmentId: string,
  papers: { subjectId: string; totalMarks?: number | string; examDate?: string; syllabus?: string }[],
) =>
  api<{ assignment: AssessmentAssignment }>(
    `/sessions/${sessionId}/assessment-assignments/${assignmentId}/papers`,
    { method: "PUT", body: JSON.stringify({ papers }) },
  );

export const deleteAssessmentAssignment = (sessionId: string, assignmentId: string) =>
  api<{ ok: boolean }>(`/sessions/${sessionId}/assessment-assignments/${assignmentId}`, {
    method: "DELETE",
  });

export const publishAssessmentAssignment = (sessionId: string, assignmentId: string) =>
  api<{ assignment: AssessmentAssignment; published: { testsCreated: number; examsCreated: number } }>(
    `/sessions/${sessionId}/assessment-assignments/${assignmentId}/publish`,
    { method: "POST" },
  );

export const fetchAssessmentDateSheet = (
  sessionId: string,
  params?: { classId?: string; sectionId?: string },
) => {
  const q = new URLSearchParams();
  if (params?.classId) q.set("classId", params.classId);
  if (params?.sectionId) q.set("sectionId", params.sectionId);
  const qs = q.toString();
  return api<DateSheetPayload>(
    `/sessions/${sessionId}/assessment-plan/date-sheet${qs ? `?${qs}` : ""}`,
  );
};
