import { authedFetch } from "@/lib/auth";
import { parseJson } from "@/lib/api";

export type CalendarEventKind = "session" | "holiday" | "vacation" | "test" | "exam";

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
  scope: { parent?: boolean; seeDrafts?: boolean; seePendingHolidays?: boolean };
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
  const res = await authedFetch(`/academic-calendar${q ? `?${q}` : ""}`);
  const body = await parseJson<{ success?: boolean; data?: AcademicCalendarResponse; message?: string }>(res);
  if (!res.ok) throw new Error(body.message || `Request failed (${res.status})`);
  return body.data as AcademicCalendarResponse;
}
