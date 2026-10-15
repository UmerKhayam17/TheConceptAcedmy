import { parseJson } from "@/lib/api";
import { authedFetch } from "@/lib/auth";
import type { Weekday } from "@/lib/configApi";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authedFetch(`/timetable${path}`, init);
  const body = await parseJson<{
    success?: boolean;
    data?: T;
    message?: string;
    details?: unknown;
  }>(res);
  if (!res.ok) {
    const details = Array.isArray(body.details) ? body.details : null;
    // Joi returns string[]; conflict checks return { message, code, ... }[]
    const detailMsg = details
      ?.map((d) => {
        if (typeof d === "string") return d;
        if (d && typeof d === "object") {
          const row = d as {
            message?: string;
            code?: string;
            day?: string;
            sectionName?: string;
          };
          const where = [row.day, row.sectionName].filter(Boolean).join(" ");
          const msg = row.message || row.code;
          return where && msg ? `${where}: ${msg}` : msg || null;
        }
        return null;
      })
      .filter(Boolean)
      .join(" · ");
    // Prefer concrete detail lines over a bare "Validation failed"
    const summary = String(body.message || "").trim();
    const preferDetails =
      detailMsg &&
      (!summary || /^validation failed$/i.test(summary) || /^request failed/i.test(summary));
    throw new Error(
      preferDetails ? detailMsg! : summary || detailMsg || `Request failed (${res.status})`,
    );
  }
  return body.data as T;
}

export interface PeriodSlot {
  _id: string;
  order: number;
  label: string;
  startTime: string;
  endTime: string;
  type: "lecture" | "break" | "assembly" | "prayer";
}

export interface PeriodTemplate {
  _id: string;
  session: string;
  name?: string;
  academyStartTime: string;
  academyEndTime: string;
  periodDurationMinutes: number;
  breaks: Array<{ breakName: string; startTime: string; endTime: string }>;
  slots: PeriodSlot[];
  isDefault: boolean;
  isActive: boolean;
}

export interface Room {
  _id: string;
  session: string;
  name: string;
  code: string;
  capacity: number;
  type: string;
  assignedClass?: { _id: string; className?: string; name?: string } | string | null;
  equipment?: string[];
  isActive: boolean;
}

export interface TeacherProfile {
  _id: string;
  user: { _id: string; name: string; email: string; phone?: string };
  session: string;
  subjects: { _id: string; name: string; code: string }[];
  maxLecturesPerDay: number;
  maxLecturesPerWeek: number;
  availability: { day: Weekday; periodIds: string[] }[];
  preferredRooms?: { _id: string; name: string; code?: string }[];
  isActive: boolean;
}

export interface TeacherAssignment {
  _id: string;
  session: string;
  class: { _id: string; name: string };
  section: { _id: string; name: string };
  subject: { _id: string; name: string; code: string };
  teacher: { _id: string; name: string; email?: string };
  isPrimary: boolean;
  priority: number;
}

export interface TimetableSettings {
  _id: string;
  session: string;
  defaultPeriodTemplate?: PeriodTemplate | string;
  defaultMaxTeacherPerDay: number;
  defaultMaxConsecutive: number;
  allowDoublePeriods: boolean;
  autoAssignRooms: boolean;
  conflictCheckOnDraft: boolean;
  publishRequiresCompleteQuotas: boolean;
  gridStartDay: Weekday;
}

export interface TimetableVersion {
  _id: string;
  session: string | { _id: string; name: string; workingDays?: Weekday[] };
  class: { _id: string; name: string };
  section: { _id: string; name: string };
  periodTemplate: PeriodTemplate | string;
  status: "draft" | "published" | "archived";
  version: number;
  effectiveFrom?: string;
  publishedAt?: string;
  notes?: string;
}

export interface ScheduleSlotSubject {
  _id: string;
  name: string;
  code: string;
  choiceGroupName?: string;
  /** Set by API when the AcademySubject was deleted but the slot still exists. */
  deleted?: boolean;
}

export interface ScheduleSlotEntry {
  /** Null when the referenced subject was deleted after the slot was saved. */
  subject: ScheduleSlotSubject | null;
  teacher: { _id: string; name: string; email?: string; deleted?: boolean } | null;
}

export interface ScheduleSlot {
  _id: string;
  day: Weekday;
  periodId: string;
  /** Null when the referenced subject was deleted after the slot was saved. */
  subject: ScheduleSlotSubject | null;
  teacher: { _id: string; name: string; email?: string; deleted?: boolean } | null;
  /** Extra concurrent subjects for a choice group (same period, different teachers). */
  parallelEntries?: ScheduleSlotEntry[];
  room?: { _id: string; name: string; code: string } | null;
  class?: { _id: string; name: string };
  section?: { _id: string; name: string };
  /** Shared lesson across sections — same id waives teacher/room conflicts. */
  combinedGroupId?: string | null;
  locked?: boolean;
  source?: string;
  /** True when primary subject is missing and API returned a placeholder. */
  subjectMissing?: boolean;
  /** Present on teacher "My schedule" responses. */
  startTime?: string;
  endTime?: string;
  periodLabel?: string;
  periodOrder?: number | null;
}

export interface ClassBoardSectionRow {
  class?: { _id: string; name: string };
  section: { _id: string; name: string; label?: string };
  version: { _id: string; status: string; version: number } | null;
  slots: ScheduleSlot[];
}

/** draft = prefer draft for review; published = official sheet only */
export type ClassBoardVersionMode = "draft" | "published";

export interface ClassBoardStructureClass {
  _id: string;
  name: string;
  label: string;
  sections: { _id: string; name: string; label?: string }[];
}

export interface ClassBoardStructureProgram {
  key: string;
  label: string;
  classes: ClassBoardStructureClass[];
}

export interface ClassBoard {
  session: { _id: string; name: string; workingDays?: Weekday[] };
  class: { _id: string; name: string } | null;
  day: Weekday;
  versionMode?: ClassBoardVersionMode;
  periods: PeriodSlot[];
  periodTemplateId: string | null;
  sections: ClassBoardSectionRow[];
  slots: ScheduleSlot[];
  structure?: ClassBoardStructureProgram[];
}

export function isDeletedSubject(
  subject: ScheduleSlotSubject | null | undefined
): boolean {
  if (!subject) return true;
  return Boolean(subject.deleted) || subject._id === "deleted" || !String(subject._id || "").trim();
}

/** Slot entries with a subject object (includes deleted placeholders for display). */
export function scheduleSlotEntries(slot: ScheduleSlot): ScheduleSlotEntry[] {
  return [
    { subject: slot.subject, teacher: slot.teacher },
    ...(slot.parallelEntries || []),
  ].filter((e): e is ScheduleSlotEntry & { subject: ScheduleSlotSubject } =>
    Boolean(e?.subject && (e.subject._id || e.subject.name))
  );
}

/** Entries that can still be saved / assigned (excludes deleted subjects). */
export function scheduleSlotActiveEntries(slot: ScheduleSlot): ScheduleSlotEntry[] {
  return scheduleSlotEntries(slot).filter((e) => !isDeletedSubject(e.subject));
}

/** Display title for a slot; safe when subjects were deleted. */
export function scheduleSlotTitle(slot: ScheduleSlot, fallback = "Deleted subject"): string {
  const names = scheduleSlotEntries(slot)
    .map((e) => {
      if (isDeletedSubject(e.subject)) return "Deleted subject";
      return e.subject?.name?.trim() || "";
    })
    .filter(Boolean);
  if (!names.length) return fallback;
  // If every entry is deleted, show a single label
  if (names.every((n) => n === "Deleted subject")) return "Deleted subject";
  return names.join(" / ");
}

export interface TimetableGrid {
  version: TimetableVersion;
  workingDays: Weekday[];
  periods: PeriodSlot[];
  slots: ScheduleSlot[];
}

export interface ValidationResult {
  valid: boolean;
  errors: { code: string; message: string; subjectId?: string; day?: string }[];
  warnings: { code: string; message: string; subjectId?: string }[];
}

// Rooms
export const fetchRooms = (sessionId: string) =>
  api<Room[]>(`/setup/rooms?sessionId=${sessionId}`);

export const createRoom = (body: {
  session: string;
  name: string;
  code: string;
  capacity?: number;
  type?: string;
  assignedClass?: string | null;
}) => api<Room>("/setup/rooms", { method: "POST", body: JSON.stringify(body) });

export const updateRoom = (
  id: string,
  body: Partial<Omit<Room, "assignedClass">> & { assignedClass?: string | null },
) => api<Room>(`/setup/rooms/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const deleteRoom = (id: string) =>
  api<{ deleted: boolean }>(`/setup/rooms/${id}`, { method: "DELETE" });

// Period templates
export const fetchPeriodTemplates = (sessionId: string) =>
  api<PeriodTemplate[]>(`/setup/period-templates?sessionId=${sessionId}`);

export const createPeriodTemplate = (body: {
  session: string;
  name?: string;
  academyStartTime: string;
  academyEndTime: string;
  periodDurationMinutes: number;
  breaks: Array<{ breakName: string; startTime: string; endTime: string }>;
  isDefault?: boolean;
}) => api<PeriodTemplate>("/setup/period-templates", { method: "POST", body: JSON.stringify(body) });

export const updatePeriodTemplate = (id: string, body: Partial<PeriodTemplate>) =>
  api<PeriodTemplate>(`/setup/period-templates/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const deletePeriodTemplate = (id: string) =>
  api<{ deleted: boolean }>(`/setup/period-templates/${id}`, { method: "DELETE" });

// Teacher profiles
export const fetchTeacherProfiles = (sessionId: string) =>
  api<TeacherProfile[]>(`/setup/teacher-profiles?sessionId=${sessionId}`);

export type TeacherProfileInput = {
  user?: string;
  session?: string;
  subjects?: string[];
  maxLecturesPerDay?: number;
  maxLecturesPerWeek?: number;
  availability?: { day: Weekday; periodIds: string[] }[];
  preferredRooms?: string[];
  isActive?: boolean;
};

export const createTeacherProfile = (body: TeacherProfileInput & { user: string; session: string }) =>
  api<TeacherProfile>("/setup/teacher-profiles", { method: "POST", body: JSON.stringify(body) });

export const updateTeacherProfile = (id: string, body: TeacherProfileInput) =>
  api<TeacherProfile>(`/setup/teacher-profiles/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const deleteTeacherProfile = (id: string) =>
  api<{ deleted: boolean }>(`/setup/teacher-profiles/${id}`, { method: "DELETE" });

export type SyncAllTeacherProfilesResult = {
  created: number;
  skipped: number;
  totalStaffTeachers: number;
  totalProfiles: number;
};

export const syncAllTeacherProfiles = (sessionId: string) =>
  api<SyncAllTeacherProfilesResult>("/setup/teacher-profiles/sync-all", {
    method: "POST",
    body: JSON.stringify({ session: sessionId }),
  });

// Assignments
export const fetchTeacherAssignments = (params: {
  sessionId: string;
  sectionId?: string;
  classId?: string;
}) => {
  const q = new URLSearchParams({ sessionId: params.sessionId });
  if (params.sectionId) q.set("sectionId", params.sectionId);
  if (params.classId) q.set("classId", params.classId);
  return api<TeacherAssignment[]>(`/setup/teacher-assignments?${q}`);
};

export const createTeacherAssignment = (body: {
  session: string;
  class: string;
  section: string;
  subject: string;
  teacher: string;
}) => api<TeacherAssignment>("/setup/teacher-assignments", { method: "POST", body: JSON.stringify(body) });

export const bulkSyncTeacherAssignments = (body: {
  session: string;
  teacher: string;
  assignments: Array<{ class: string; section: string; subject: string }>;
}) =>
  api<TeacherAssignment[]>("/setup/teacher-assignments/bulk", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const upsertSubjectTeacher = (body: {
  session: string;
  class: string;
  section: string;
  subject: string;
  teacher: string | null;
}) =>
  api<{ cleared: boolean; data: TeacherAssignment | null }>("/setup/teacher-assignments/subject-teacher", {
    method: "PUT",
    body: JSON.stringify(body),
  });

export const syncSectionSubjectTeachers = (body: {
  session: string;
  class: string;
  section: string;
  items: Array<{ subject: string; teacher: string | null }>;
}) =>
  api<TeacherAssignment[]>("/setup/teacher-assignments/section-subjects", {
    method: "PUT",
    body: JSON.stringify(body),
  });

export const deleteTeacherAssignment = (id: string) =>
  api<{ deleted: boolean }>(`/setup/teacher-assignments/${id}`, { method: "DELETE" });

// Settings
export const fetchTimetableSettings = (sessionId: string) =>
  api<TimetableSettings>(`/setup/settings/${sessionId}`);

export const updateTimetableSettings = (sessionId: string, body: Partial<TimetableSettings>) =>
  api<TimetableSettings>(`/setup/settings/${sessionId}`, { method: "PUT", body: JSON.stringify(body) });

// Versions
export const fetchTimetableVersions = (params: {
  sessionId?: string;
  sectionId?: string;
  status?: string;
}) => {
  const q = new URLSearchParams();
  if (params.sessionId) q.set("sessionId", params.sessionId);
  if (params.sectionId) q.set("sectionId", params.sectionId);
  if (params.status) q.set("status", params.status);
  const qs = q.toString();
  return api<TimetableVersion[]>(`/versions${qs ? `?${qs}` : ""}`);
};

export const createTimetableVersion = (body: {
  session: string;
  class: string;
  section: string;
  periodTemplate: string;
}) => api<TimetableVersion>("/versions", { method: "POST", body: JSON.stringify(body) });

export const fetchTimetableGrid = (versionId: string) =>
  api<TimetableGrid>(`/versions/${versionId}/grid`);

export const validateTimetableVersion = (versionId: string, forPublish = false) =>
  api<ValidationResult>(`/versions/${versionId}/validate?forPublish=${forPublish}`, { method: "POST" });

export const publishTimetableVersion = (versionId: string) =>
  api<TimetableVersion>(`/versions/${versionId}/publish`, { method: "POST" });

export const duplicateTimetableVersion = (versionId: string) =>
  api<TimetableVersion>(`/versions/${versionId}/duplicate`, { method: "POST" });

export const upsertScheduleSlot = (
  versionId: string,
  body: {
    day: Weekday;
    /** Explicit weekdays to create (same period/subject/teachers). */
    days?: Weekday[];
    /** Create Mon–Fri at once. */
    applyToFullWeek?: boolean;
    periodId: string;
    subject?: string;
    teacher?: string;
    entries?: { subject: string; teacher: string }[];
    room?: string | null;
  }
) =>
  api<ScheduleSlot | { days: Weekday[]; created: number; slots: ScheduleSlot[] }>(
    `/versions/${versionId}/slots`,
    { method: "POST", body: JSON.stringify(body) }
  );
export const deleteScheduleSlot = (slotId: string) =>
  api<{ deleted: boolean }>(`/slots/${slotId}`, { method: "DELETE" });

export const moveScheduleSlot = (
  slotId: string,
  body: { day: Weekday; periodId: string }
) => api<ScheduleSlot>(`/slots/${slotId}`, { method: "PATCH", body: JSON.stringify(body) });

export const fetchSectionSchedule = async (sessionId: string, sectionId: string) => {
  const res = await api<TimetableGrid | { version: null; grid: null }>(
    `/sections/schedule?sessionId=${sessionId}&sectionId=${sectionId}`
  );
  if (res && "version" in res && res.version === null) return null;
  return res as TimetableGrid;
};

export const fetchMyTeacherSchedule = (sessionId: string, teacherId?: string) =>
  api<{ slots: ScheduleSlot[]; versions: TimetableVersion[] }>(
    `/me/teacher?sessionId=${sessionId}${teacherId ? `&teacherId=${teacherId}` : ""}`
  );

export const fetchClassBoard = (params: {
  sessionId: string;
  classId?: string;
  day: Weekday;
  versionMode?: ClassBoardVersionMode;
}) => {
  const q = new URLSearchParams({
    sessionId: params.sessionId,
    day: params.day,
    versionMode: params.versionMode || "draft",
  });
  if (params.classId) q.set("classId", params.classId);
  return api<ClassBoard>(`/class-board?${q}`);
};

export const upsertSharedLesson = (body: {
  sessionId: string;
  classId: string;
  day: Weekday;
  days?: Weekday[];
  applyToFullWeek?: boolean;
  periodId: string;
  sectionIds: string[];
  subject?: string;
  teacher?: string;
  entries?: { subject: string; teacher: string }[];
  room?: string | null;
  combinedGroupId?: string | null;
}) =>
  api<{
    combinedGroupId: string | null;
    days: Weekday[];
    sectionCount: number;
    slots: ScheduleSlot[];
  }>("/class-board/shared-lesson", { method: "POST", body: JSON.stringify(body) });

export const deleteCombinedGroup = (combinedGroupId: string) =>
  api<{ deleted: number }>(`/class-board/combined/${combinedGroupId}`, { method: "DELETE" });

export type PublishClassDraftFailure = {
  versionId: string;
  sectionId: string;
  classId?: string;
  className?: string;
  sectionName?: string;
  place?: string;
  message: string;
  reasons?: string[];
  details?: { code?: string; message?: string; day?: string; teacherName?: string }[];
};

export const publishClassDrafts = (body: { sessionId: string; classId?: string }) =>
  api<{ published: number; failed: PublishClassDraftFailure[] }>("/class-board/publish", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const moveClassBoardLesson = (body: {
  slotId: string;
  toSectionId: string;
  toPeriodId: string;
  day: Weekday;
}) =>
  api<{ moved: number; shared: boolean; swapped?: boolean; slots: ScheduleSlot[] }>(
    "/class-board/move",
    { method: "POST", body: JSON.stringify(body) }
  );

export interface AutoGenerateOptions {
  sessionId: string;
  classIds?: string[];
  defaultWeeklyPeriods?: number;
  balanceSubjects?: boolean;
  preventTeacherConflicts?: boolean;
  preventRoomConflicts?: boolean;
  applyParallel?: boolean;
  allowSharedLessons?: boolean;
  replaceUnlocked?: boolean;
  /** Copy teacher assignments from a filled section to sibling sections missing them */
  propagateAssignments?: boolean;
}

export interface AutoGenerateResult {
  jobId: string;
  engine: string;
  session: { _id: string; name: string };
  versionMode: string;
  summary: {
    lessonsPlaced: number;
    sharedLessons: number;
    parallelLessons: number;
    conflicts: number;
    unplaced: number;
    score: number;
    sectionsProcessed: number;
    classesProcessed: number;
    skipped?: number;
    assignmentsPropagated?: number;
  };
  classes: {
    classId: string;
    className: string;
    classLabel?: string;
    program?: string;
    programLabel?: string;
    placed: number;
    unplaced: number;
    shared: number;
    parallel: number;
  }[];
  skipped?: {
    classId: string;
    classLabel: string;
    program?: string;
    sectionLabel: string;
    reasons: string[];
  }[];
  unplaced: {
    label: string;
    kind: string;
    classId: string;
    sectionIds: string[];
    weeklyPeriods: number;
    remaining: number;
  }[];
  options: Record<string, unknown>;
}

/** Scheduling engine: fills draft ScheduleSlots for selected classes. */
export const autoGenerateAllTimetables = (body: AutoGenerateOptions) =>
  api<AutoGenerateResult>("/generate", { method: "POST", body: JSON.stringify(body) });

export interface SectionDashboardRow {
  program: string;
  programLabel: string;
  class: { _id: string; name: string; label: string };
  section: { _id: string; name: string; label: string } | null;
  students: number;
  teachersAssigned: number;
  subjectsOnClass: number;
  subjectsAssigned: number;
  weeklyLessons: number;
  capacityPerWeek: number;
  dayFill: Record<string, number>;
  lecturePeriodsPerDay: number;
  timetableStatus: "none" | "draft" | "published";
  version: {
    _id: string;
    status: string;
    version: number;
    generationMeta?: { engine?: string; score?: number; unplacedCount?: number } | null;
  } | null;
  readiness: string[];
  readyForGenerate: boolean;
}

export interface SectionDashboard {
  session: { _id: string; name: string; workingDays?: Weekday[] };
  periodsPerDay: number;
  capacityPerWeek: number;
  programs: { key: string; label: string; classes: number; sections: number }[];
  sections: SectionDashboardRow[];
  summary: {
    classes: number;
    sections: number;
    readyForGenerate: number;
    withDraft: number;
    withPublished: number;
    missingAssignments: number;
  };
}

export const fetchSectionDashboard = (params: {
  sessionId: string;
  classId?: string;
  program?: "all" | "school" | "college" | "other";
}) => {
  const q = new URLSearchParams({
    sessionId: params.sessionId,
    program: params.program || "all",
  });
  if (params.classId) q.set("classId", params.classId);
  return api<SectionDashboard>(`/section-dashboard?${q}`);
};
