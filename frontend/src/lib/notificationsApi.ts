import { authedFetch } from "@/lib/auth";
import { parseJson } from "@/lib/api";

export interface AppNotification {
  _id: string;
  type: string;
  title: string;
  body: string;
  path: string;
  moduleKey: string;
  resource: string;
  resourceId: string;
  meta?: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
}

export async function fetchNotifications(params?: { limit?: number; unread?: boolean }) {
  const q = new URLSearchParams();
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.unread) q.set("unread", "1");
  const res = await authedFetch(`/notifications?${q}`);
  const body = await parseJson<{
    success?: boolean;
    data?: AppNotification[];
    unreadCount?: number;
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(body.message || "Failed to load notifications");
  return { items: body.data || [], unreadCount: body.unreadCount ?? 0 };
}

export async function markNotificationRead(id: string) {
  const res = await authedFetch(`/notifications/${id}/read`, { method: "PATCH" });
  const body = await parseJson<{ success?: boolean; message?: string }>(res);
  if (!res.ok) throw new Error(body.message || "Failed to mark notification read");
}

export async function markAllNotificationsRead() {
  const res = await authedFetch("/notifications/read-all", { method: "PATCH" });
  const body = await parseJson<{ success?: boolean; message?: string }>(res);
  if (!res.ok) throw new Error(body.message || "Failed to mark all read");
}

export function notificationHref(role: string, path: string) {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `/panel/${role}${clean}`;
}

/** Parent-mobile destinations for alerts (path, moduleKey, type, or title). */
export function resolveParentNotificationHref(item: {
  path?: string | null;
  moduleKey?: string | null;
  type?: string | null;
  title?: string | null;
  resource?: string | null;
}): string | null {
  const path = String(item.path || "").trim();
  const blob = `${item.type || ""} ${item.moduleKey || ""} ${item.resource || ""} ${item.title || ""} ${path}`.toLowerCase();

  const fromHint = (): string | null => {
    if (/fee|challan|voucher|due|unpaid/.test(blob)) return "/panel/parent?view=fees";
    if (/attendance|absent|late|leave/.test(blob)) return "/panel/parent/attendance";
    if (/date.?sheet|exam.?schedule/.test(blob)) return "/panel/parent/exams/date-sheet";
    if (/report.?card|result|marks/.test(blob)) return "/panel/parent/exams/report-card";
    if (/term.?exam|enter.?test|weekly.?test|assessment/.test(blob)) return "/panel/parent/exams/date-sheet";
    if (/announce|notice/.test(blob)) return "/panel/parent/announcements";
    if (/chat|message/.test(blob)) return "/panel/parent/chat";
    if (/timetable|schedule/.test(blob)) return "/panel/parent/timetable/view";
    if (/academic.?calendar|homework|lesson/.test(blob)) return "/panel/parent/academic-calendar";
    return null;
  };

  if (path) {
    if (path.startsWith("/panel/")) return path;
    const clean = path.startsWith("/") ? path : `/${path}`;
    // Parent Fee lives on home ?view=fees, not /fees module.
    if (/^\/fees(\/|$)/i.test(clean) || clean.toLowerCase() === "/fee") {
      return "/panel/parent?view=fees";
    }
    if (/^\/attendance/i.test(clean)) return "/panel/parent/attendance";
    if (/^\/announcements?/i.test(clean)) return "/panel/parent/announcements";
    if (/^\/chat/i.test(clean)) return "/panel/parent/chat";
    if (/^\/timetable/i.test(clean)) return "/panel/parent/timetable/view";
    if (/exams\/report-card|\/report-card/i.test(clean)) return "/panel/parent/exams/report-card";
    if (/exams\/date-sheet|\/date-sheet/i.test(clean)) return "/panel/parent/exams/date-sheet";
    return notificationHref("parent", clean);
  }

  return fromHint();
}
