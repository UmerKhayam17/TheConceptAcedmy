import { authedFetch } from "@/lib/auth";
import { parseJson } from "@/lib/api";

export type CalendarEventKind =
  | "session"
  | "holiday"
  | "vacation"
  | "test"
  | "exam"
  | "lesson_plan"
  | "homework"
  | "event";

export type CalendarItemType = "lesson_plan" | "homework" | "event";
export type EventCategory =
  | "ptm"
  | "sports"
  | "function"
  | "trip"
  | "meeting"
  | "competition"
  | "other";

export interface CalendarEvent {
  id: string;
  kind: CalendarEventKind;
  title: string;
  /** Inclusive YYYY-MM-DD (school timezone). */
  startDate: string;
  endDate: string;
  /** Draft schedule / pending or estimated holiday. */
  tentative?: boolean;
  status?: string;
  category?: string;
  notes?: string;
  assessmentName?: string;
  assessmentTypeLabel?: string;
  classId?: string;
  className?: string;
  sectionId?: string;
  sectionName?: string;
  disciplineName?: string;
  subjectName?: string;
  totalMarks?: number | null;
  syllabus?: string;
  /** Planned calendar item extras */
  itemId?: string;
  description?: string;
  objectives?: string;
  activities?: string;
  startTime?: string;
  endTime?: string;
  eventCategory?: string;
  subjectId?: string;
  createdByName?: string;
  canEdit?: boolean;
}

export interface AcademicCalendarResponse {
  sessions: { _id: string; name: string; isActive: boolean; status: string }[];
  session: {
    _id: string;
    name: string;
    startDate: string;
    endDate: string;
    workingDays: string[];
    timezone: string;
  } | null;
  events: CalendarEvent[];
  filters: {
    classes: { _id: string; className: string }[];
    sections: { _id: string; sectionName: string; classId: string }[];
  };
  scope: {
    parent?: boolean;
    seeDrafts?: boolean;
    seePendingHolidays?: boolean;
    canPlan?: boolean;
    canManageAll?: boolean;
    canManageHolidays?: boolean;
  };
}

export interface PlannerOptions {
  classes: { _id: string; className: string }[];
  sections: { _id: string; sectionName: string; classId: string }[];
  subjects: { _id: string; subjectName: string; classId: string }[];
  eventCategories: EventCategory[];
}

export interface CalendarItemWriteBody {
  sessionId: string;
  type: CalendarItemType;
  title: string;
  description?: string;
  objectives?: string;
  activities?: string;
  startDate?: string;
  endDate?: string;
  /** Bulk: one item per date (homework due = date + durationDays). */
  dates?: string[];
  durationDays?: number;
  startTime?: string;
  endTime?: string;
  eventCategory?: EventCategory | "";
  classId?: string | null;
  sectionId?: string | null;
  subjectId?: string | null;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authedFetch(`/academic-calendar${path}`, init);
  const body = await parseJson<{ success?: boolean; data?: T; message?: string }>(res);
  if (!res.ok) throw new Error(body.message || `Request failed (${res.status})`);
  return body.data as T;
}

export async function fetchAcademicCalendar(params: {
  sessionId?: string;
  classId?: string;
  sectionId?: string;
}): Promise<AcademicCalendarResponse> {
  const qs = new URLSearchParams();
  if (params.sessionId) qs.set("sessionId", params.sessionId);
  if (params.classId) qs.set("classId", params.classId);
  if (params.sectionId) qs.set("sectionId", params.sectionId);
  const q = qs.toString();
  return api<AcademicCalendarResponse>(q ? `?${q}` : "");
}

export function fetchPlannerOptions(sessionId: string) {
  return api<PlannerOptions>(`/options?sessionId=${encodeURIComponent(sessionId)}`);
}

export function createCalendarItems(body: CalendarItemWriteBody) {
  return api<{ count: number; items: unknown[] }>("/items", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateCalendarItem(id: string, body: Partial<CalendarItemWriteBody>) {
  return api<unknown>(`/items/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteCalendarItem(id: string) {
  return api<{ deleted: number }>(`/items/${id}`, { method: "DELETE" });
}
