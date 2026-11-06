/** Local calendar YYYY-MM-DD (avoids UTC shift for Asia/Karachi mornings). */
export function localTodayYmd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function localDateYmd(date: Date) {
  return localTodayYmd(date);
}

/** The academy's timezone. School days (attendance, etc.) are stored as midnight in this zone. */
export const SCHOOL_TIME_ZONE = "Asia/Karachi";

const schoolDayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: SCHOOL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * School calendar day (YYYY-MM-DD) of a stored date.
 * The API sends 5 Nov as "2026-11-04T19:00:00.000Z" (midnight Karachi in UTC), so
 * `value.slice(0, 10)` would wrongly give 4 Nov. A bare "YYYY-MM-DD" is returned unchanged.
 * Uses the school timezone, not the browser's, so the day is right on any device.
 */
/**
 * School day of an attendance-style record. Prefers the server's own `ymd` (computed in the
 * academy's configured timezone), and only falls back to converting `date` here.
 */
export function recordDayYmd(record: { ymd?: string | null; date: string | Date }): string {
  if (record.ymd && /^\d{4}-\d{2}-\d{2}$/.test(record.ymd)) return record.ymd;
  return schoolDayYmd(record.date);
}

export function schoolDayYmd(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return typeof value === "string" ? value.slice(0, 10) : "";
  return schoolDayFormat.format(d);
}
