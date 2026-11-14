import { parseJson } from "@/lib/api";
import { authedFetch } from "@/lib/auth";
import type { CreatedByUser } from "@/lib/createdBy";

export type AnnouncementAudience = "all" | "class" | "section" | "teachers" | "parents";

export interface AnnouncementAttachment {
  name?: string;
  url?: string;
}

export interface Announcement {
  _id: string;
  title: string;
  body: string;
  type?: string;
  targetAudience: AnnouncementAudience;
  isPinned?: boolean;
  publishedAt?: string;
  createdAt: string;
  expiresAt?: string;
  attachments?: AnnouncementAttachment[];
  createdBy?: CreatedByUser | string;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authedFetch(path, init);
  const body = await parseJson<{ success?: boolean; data?: T; message?: string }>(res);
  if (!res.ok) throw new Error(body.message || `Request failed (${res.status})`);
  return body.data as T;
}

export const fetchAnnouncements = (params?: { audience?: string }) => {
  const q = new URLSearchParams();
  if (params?.audience) q.set("audience", params.audience);
  const qs = q.toString();
  return api<Announcement[]>(`/announcements${qs ? `?${qs}` : ""}`);
};

export const createAnnouncement = (body: {
  title: string;
  body: string;
  targetAudience: AnnouncementAudience;
  type?: string;
}) =>
  api<Announcement>("/announcements", {
    method: "POST",
    body: JSON.stringify({ type: "general", ...body }),
  });

export const deleteAnnouncement = (id: string) =>
  api<{ deleted: boolean }>(`/announcements/${id}`, { method: "DELETE" });
