import { authedFetch } from "@/lib/auth";
import { parseJson } from "@/lib/api";

export type HolidayCategory = "public" | "islamic" | "government" | "vacation";
export type HolidayStatus = "pending" | "approved";
export type HolidaySource = "builtin" | "hijri" | "government" | "manual";

export interface HolidayAppliesTo {
  students: boolean;
  teachers: boolean;
  staff: boolean;
}

export interface SchoolHoliday {
  _id: string;
  sessionId: string;
  code: string;
  name: string;
  shortName?: string;
  category: HolidayCategory;
  source: HolidaySource;
  startDate: string;
  endDate: string;
  status: HolidayStatus;
  appliesTo: HolidayAppliesTo;
  estimated?: boolean;
  notes?: string;
  approvedAt?: string;
}

export interface HolidayListResponse {
  session: {
    _id: string;
    name: string;
    startDate: string;
    endDate: string;
    isActive?: boolean;
    status?: string;
  };
  holidays: SchoolHoliday[];
  counts: { total: number; confirmed: number; pending: number; vacations: number };
}

export interface HolidayWriteBody {
  name: string;
  shortName?: string;
  category: HolidayCategory;
  startDate: string;
  endDate: string;
  status?: HolidayStatus;
  appliesTo?: HolidayAppliesTo;
  notes?: string;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authedFetch(`/config${path}`, init);
  const body = await parseJson<{ success?: boolean; data?: T; message?: string; details?: unknown }>(res);
  if (!res.ok) {
    const details = Array.isArray(body.details) ? body.details.map(String).join(", ") : "";
    throw new Error(body.message || details || `Request failed (${res.status})`);
  }
  return body.data as T;
}

export const fetchSessionHolidays = (sessionId: string) =>
  api<HolidayListResponse>(`/sessions/${sessionId}/holidays`);

export const createHoliday = (sessionId: string, body: HolidayWriteBody) =>
  api<{ holiday: SchoolHoliday; cleared?: { students: number; staff: number } }>(
    `/sessions/${sessionId}/holidays`,
    { method: "POST", body: JSON.stringify(body) },
  );

export const updateHoliday = (id: string, body: Partial<HolidayWriteBody>) =>
  api<{ holiday: SchoolHoliday; cleared?: { students: number; staff: number } }>(`/holidays/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const approveHoliday = (id: string) =>
  api<{ holiday: SchoolHoliday; cleared?: { students: number; staff: number } }>(`/holidays/${id}/approve`, {
    method: "POST",
  });

export const deleteHoliday = (id: string) =>
  api<{ deleted: boolean }>(`/holidays/${id}`, { method: "DELETE" });
