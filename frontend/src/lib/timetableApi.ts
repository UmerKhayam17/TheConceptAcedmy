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
    const details = Array.isArray(body.details)
      ? (body.details as { message?: string; code?: string; day?: string; className?: string; sectionName?: string }[])
      : null;
    // Prefer the server summary message (already includes class · section); fall back to detail lines
    const detailMsg = details
      ?.map((d) => d.message || d.code)
      .filter(Boolean)
      .join(" · ");
    throw new Error(body.message || detailMsg || `Request failed (${res.status})`);
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

export interface ScheduleSlotEntry {
  subject: { _id: string; name: string; code: string; choiceGroupName?: string };
  teacher: { _id: string; name: string; email?: string };
}

export interface ScheduleSlot {
  _id: string;
  day: Weekday;
  periodId: string;
  subject: { _id: string; name: string; code: string; choiceGroupName?: string };
  teacher: { _id: string; name: string; email?: string };
  /** Extra concurrent subjects for a choice group (same period, different teachers). */
  parallelEntries?: ScheduleSlotEntry[];
  room?: { _id: string; name: string; code: string } | null;
  class?: { _id: string; name: string };
  section?: { _id: string; name: string };
  locked?: boolean;
  source?: string;
}

export function scheduleSlotEntries(slot: ScheduleSlot): ScheduleSlotEntry[] {
  return [
    { subject: slot.subject, teacher: slot.teacher },
    ...(slot.parallelEntries || []),
  ];
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

export const createTeacherProfile = (body: {
  user: string;
  session: string;
  subjects?: string[];
  maxLecturesPerDay?: number;
  maxLecturesPerWeek?: number;
}) => api<TeacherProfile>("/setup/teacher-profiles", { method: "POST", body: JSON.stringify(body) });

export const updateTeacherProfile = (id: string, body: Partial<TeacherProfile>) =>
  api<TeacherProfile>(`/setup/teacher-profiles/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const deleteTeacherProfile = (id: string) =>
  api<{ deleted: boolean }>(`/setup/teacher-profiles/${id}`, { method: "DELETE" });

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
