import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Clock time as 12-hour AM/PM, using the viewer's local timezone. */
export function formatClockTime(value?: string | Date | null) {
  if (!value) return "—";
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(dt);
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;
  const period = (parts.find((part) => part.type === "dayPeriod")?.value || "").toUpperCase();
  if (!hour || !minute) return "—";
  return period ? `${hour}:${minute} ${period}` : `${hour}:${minute}`;
}

function clockFrom24(hour24: number, minute: number) {
  if (!Number.isFinite(hour24) || !Number.isFinite(minute) || hour24 > 23 || minute > 59) return "";
  const mer = hour24 >= 12 ? "PM" : "AM";
  const h12 = hour24 % 12 || 12;
  return `${String(h12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${mer}`;
}

/** "08:40" or "8:40 PM" → "08:40 AM" / "08:40 PM". Non-clock text is left as-is. */
export function formatWallClock(value?: string | null) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  const ampm = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (ampm) {
    let hour = Number(ampm[1]);
    const minute = Number(ampm[2]);
    const mer = ampm[3].toUpperCase();
    if (mer === "PM" && hour < 12) hour += 12;
    if (mer === "AM" && hour === 12) hour = 0;
    return clockFrom24(hour, minute) || trimmed;
  }
  const hhmm = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!hhmm) return trimmed;
  return clockFrom24(Number(hhmm[1]), Number(hhmm[2])) || trimmed;
}

/** Display a start–end pair in 12-hour AM/PM. */
export function formatWallClockRange(start?: string | null, end?: string | null, sep = " – ") {
  const a = formatWallClock(start);
  const b = formatWallClock(end);
  if (a && b) return `${a}${sep}${b}`;
  return a || b || "";
}
