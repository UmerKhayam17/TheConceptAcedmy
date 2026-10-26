import { parseJson } from "@/lib/api";
import { authedFetch } from "@/lib/auth";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authedFetch(`/ai-attendance${path}`, init);
  const body = await parseJson<{ success?: boolean; data?: T; message?: string }>(res);
  if (!res.ok) throw new Error(body.message || "AI Attendance request failed");
  return body.data as T;
}

export type AiAttendanceStatus = {
  database?: string;
  configured: boolean;
  faceWorkerUrl?: string | null;
  baseUrl?: string | null;
  studentsLinked: number;
  staffLinked: number;
  gallery?: { enrolled?: number; trained?: number; min_images?: number };
  worker?: unknown;
  workerError?: string | null;
  remote?: { gallery?: unknown; summary?: unknown } | null;
  remoteError?: string | null;
};

export type AiPerson = {
  kind: "student" | "staff";
  id: string;
  name: string;
  /** Present for students — used to disambiguate same names. */
  fatherName?: string;
  label: string;
  aiEmployeeId: string;
  hasPhoto: boolean;
  /** Profile / student photo path when present in the roster. */
  photoUrl?: string;
  isTrained?: boolean;
  totalImages?: number;
};

export type AiEnrollmentStatus = {
  person_key?: string;
  kind?: string;
  display_name?: string;
  total_images?: number;
  image_count?: number;
  min_required?: number;
  is_enrolled?: boolean;
  is_trained?: boolean;
  last_train_error?: string | null;
};

export type StaffAttendanceRecord = {
  _id: string;
  userId:
    | {
        _id: string;
        name?: string;
        email?: string;
        role?: { _id: string; name?: string } | string;
      }
    | string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  status: string;
  source: string;
  confidence?: number;
  notes?: string;
};

export const fetchAiAttendanceStatus = () => api<AiAttendanceStatus>("/status");

export const syncAiRoster = () =>
  api<{ students: { linked: number; updated: number }; staff: { linked: number; updated: number } }>(
    "/sync-roster",
    { method: "POST", body: "{}" },
  );

export const syncAiAttendance = (date?: string) =>
  api<{ date: string; students: number; staff: number; totalRecords: number }>("/sync-attendance", {
    method: "POST",
    body: JSON.stringify({ date }),
  });

export const fetchAiPeople = () =>
  api<{ students: AiPerson[]; staff: AiPerson[] }>("/people");

export const fetchEnrollmentStatus = (employeeId: string) =>
  api<AiEnrollmentStatus>(`/enroll/${encodeURIComponent(employeeId)}`);

export async function fetchAiFaceImageBlob(employeeId: string, index: number): Promise<string> {
  const res = await authedFetch(
    `/ai-attendance/enroll/${encodeURIComponent(employeeId)}/image/${index}`,
  );
  if (!res.ok) throw new Error("Could not load captured face image");
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export const captureAiFace = (employeeId: string, image: string) =>
  api<Record<string, unknown>>(`/enroll/${encodeURIComponent(employeeId)}/capture`, {
    method: "POST",
    body: JSON.stringify({ image }),
  });

export const deleteAiFaceImage = (employeeId: string, index: number) =>
  api<Record<string, unknown>>(`/enroll/${encodeURIComponent(employeeId)}/image/${index}`, {
    method: "DELETE",
  });

export const deleteAllAiFaceImages = (employeeId: string) =>
  api<Record<string, unknown>>(`/enroll/${encodeURIComponent(employeeId)}/images`, {
    method: "DELETE",
  });

export const trainAiFace = (employeeId: string) =>
  api<Record<string, unknown>>(`/enroll/${encodeURIComponent(employeeId)}/train`, {
    method: "POST",
    body: "{}",
  });

export const identifyAiFace = (image: string, markAttendance = true) =>
  api<Record<string, unknown>>("/identify", {
    method: "POST",
    body: JSON.stringify({ image, markAttendance, source: "webcam" }),
  });

export type AiCameraRuntime = {
  running: boolean;
  connected?: boolean;
  hasFrame?: boolean;
  lastError?: string;
  lastFrameAt?: string | null;
  lastMatch?: {
    at?: string;
    personKey?: string;
    name?: string;
    confidence?: number;
    attendance?: string;
  } | null;
};

export type AiCamera = {
  _id: string;
  name: string;
  location?: string;
  isActive: boolean;
  sortOrder?: number;
  rtspHost?: string;
  runtime: AiCameraRuntime;
};

export type AiCamerasResponse = {
  cameras: AiCamera[];
  overview: {
    total: number;
    active: number;
    running: number;
    note?: string;
  };
};

export type AiCameraSnapshot = {
  cameraId: string;
  name: string;
  location?: string;
  ok: boolean;
  image?: string;
  running?: boolean;
  connected?: boolean;
  lastFrameAt?: string | null;
  lastMatch?: AiCameraRuntime["lastMatch"];
  lastError?: string;
  error?: string;
};

export const fetchAiCameras = () => api<AiCamerasResponse>("/cameras");

export const fetchAiCameraSnapshot = (cameraId: string) =>
  api<AiCameraSnapshot>(`/cameras/${encodeURIComponent(cameraId)}/snapshot`);

export const aiCameraAction = (action: string, cameraId?: string) =>
  api<unknown>("/cameras/action", {
    method: "POST",
    body: JSON.stringify({ action, cameraId }),
  });

export type StaffTeacherOption = {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  isActive?: boolean;
  role?: { _id: string; name?: string } | string;
};

export type StaffAttendanceStatus = "present" | "late" | "absent" | "half_day" | "leave";

export type MarkStaffAttendancePayload = {
  date: string;
  userId: string;
  status: StaffAttendanceStatus;
  checkIn?: string;
  checkOut?: string;
  notes?: string;
};

export const fetchStaffAttendanceDay = (date: string, userId?: string) => {
  const q = new URLSearchParams({ date });
  if (userId) q.set("userId", userId);
  return api<{ date: string; records: StaffAttendanceRecord[]; summary: Record<string, number> }>(
    `/staff-attendance?${q}`,
  );
};

export const fetchStaffTeachers = () => api<StaffTeacherOption[]>("/staff-attendance/teachers");

export const fetchStaffAttendanceMonth = (month: number, year: number, userId?: string) => {
  const q = new URLSearchParams({ month: String(month), year: String(year) });
  if (userId) q.set("userId", userId);
  return api<{
    month: number;
    year: number;
    records: StaffAttendanceRecord[];
    summary: Record<string, number>;
  }>(`/staff-attendance/month?${q}`);
};

export const fetchMyStaffAttendance = (month?: number, year?: number) => {
  const q = new URLSearchParams();
  if (month) q.set("month", String(month));
  if (year) q.set("year", String(year));
  const qs = q.toString();
  return api<StaffAttendanceRecord[]>(`/staff-attendance/mine${qs ? `?${qs}` : ""}`);
};

export const fetchStaffAttendanceHistory = (userId: string, month?: number, year?: number) => {
  const q = new URLSearchParams({ userId });
  if (month) q.set("month", String(month));
  if (year) q.set("year", String(year));
  return api<StaffAttendanceRecord[]>(`/staff-attendance/history?${q}`);
};

export const markStaffAttendanceManual = (payload: MarkStaffAttendancePayload) =>
  api<StaffAttendanceRecord>("/staff-attendance/manual", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export type StaffPeriodStatus = "present" | "late" | "absent" | "leave" | "";

export type StaffPeriodRow = {
  periodKey: string;
  label: string;
  startTime: string;
  endTime: string;
  classLabel: string;
  sectionLabel: string;
  subjectLabel: string;
  status: StaffPeriodStatus | string;
  day?: string;
  weekday?: string;
};

export type StaffPeriodTeacher = {
  userId: string;
  name: string;
  email?: string;
  role?: string;
  isActive?: boolean;
  totalClasses: number;
  present: number;
  late: number;
  absent: number;
  leave: number;
  unmarked: number;
  attendancePercent: number;
  periods: StaffPeriodRow[];
};

export type StaffPeriodReport = {
  date?: string;
  weekday?: string;
  month?: number;
  year?: number;
  sessionName?: string;
  teachers: StaffPeriodTeacher[];
  summary: {
    totalClasses: number;
    present: number;
    late: number;
    absent: number;
    leave: number;
    unmarked: number;
    attendancePercent: number;
  };
};

export const fetchStaffPeriodDay = (date: string, sessionId: string, userId?: string) => {
  const q = new URLSearchParams({ date, sessionId });
  if (userId) q.set("userId", userId);
  return api<StaffPeriodReport>(`/staff-attendance/periods?${q}`);
};

export const fetchStaffPeriodMonth = (
  month: number,
  year: number,
  sessionId: string,
  userId?: string,
) => {
  const q = new URLSearchParams({ month: String(month), year: String(year), sessionId });
  if (userId) q.set("userId", userId);
  return api<StaffPeriodReport>(`/staff-attendance/periods/month?${q}`);
};

export const saveStaffPeriodMarks = (payload: {
  date: string;
  sessionId: string;
  marks: { userId: string; periodKey: string; status: StaffPeriodStatus }[];
}) =>
  api<StaffPeriodReport>("/staff-attendance/periods", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export type StaffAttendanceExportFormat = "xlsx" | "pdf";

export const exportStaffAttendanceReport = async (
  params: {
    scope: "daily" | "monthly";
    format?: StaffAttendanceExportFormat;
    date?: string;
    month?: number;
    year?: number;
    userId?: string;
    role?: string;
    sessionId?: string;
  },
) => {
  const format = params.format || "pdf";
  const q = new URLSearchParams({ scope: params.scope, format });
  if (params.date) q.set("date", params.date);
  if (params.month) q.set("month", String(params.month));
  if (params.year) q.set("year", String(params.year));
  if (params.userId) q.set("userId", params.userId);
  if (params.role) q.set("role", params.role);
  if (params.sessionId) q.set("sessionId", params.sessionId);
  const res = await authedFetch(`/ai-attendance/staff-attendance/export?${q}`, { method: "GET" });
  if (!res.ok) {
    let message = "Export failed";
    try {
      const body = await parseJson<{ message?: string }>(res);
      if (body.message) message = body.message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return res.blob();
};
