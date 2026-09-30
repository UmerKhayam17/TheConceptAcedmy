import type { Weekday } from "@/lib/configApi";
import type { ScheduleSlot } from "@/lib/timetableApi";
import { DAY_ORDER } from "../constants";

export function startOfWeekMonday(date: Date) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function weekDates(weekStart: Date, days: Weekday[]) {
  return days.map((day) => {
    const offset = DAY_ORDER.indexOf(day);
    const mondayOffset = DAY_ORDER.indexOf("monday");
    return { day, date: addDays(weekStart, offset - mondayOffset) };
  });
}

export function formatWeekRange(weekStart: Date, dayCount = 6) {
  const end = addDays(weekStart, Math.max(0, dayCount - 1));
  const sameMonth = weekStart.getMonth() === end.getMonth();
  const startDay = weekStart.getDate();
  const endDay = end.getDate();
  const monthEnd = end.toLocaleString("en", { month: "short" });
  const year = end.getFullYear();
  if (sameMonth) return `${startDay} – ${endDay} ${monthEnd} ${year}`;
  const monthStart = weekStart.toLocaleString("en", { month: "short" });
  return `${startDay} ${monthStart} – ${endDay} ${monthEnd} ${year}`;
}

export function formatColumnDate(date: Date) {
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatMonthYear(date: Date) {
  return date.toLocaleString("en", { month: "long", year: "numeric" });
}

export function isSameCalendarDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function monthOptions(around = new Date(), span = 8) {
  const items: { value: string; label: string; date: Date }[] = [];
  for (let i = -span; i <= span; i++) {
    const d = new Date(around.getFullYear(), around.getMonth() + i, 1);
    d.setHours(12, 0, 0, 0);
    items.push({
      value: `${d.getFullYear()}-${d.getMonth() + 1}`,
      label: formatMonthYear(d),
      date: d,
    });
  }
  return items;
}

export function weekStartForMonth(monthDate: Date, referenceWeekStart?: Date) {
  if (
    referenceWeekStart &&
    referenceWeekStart.getFullYear() === monthDate.getFullYear() &&
    referenceWeekStart.getMonth() === monthDate.getMonth()
  ) {
    return startOfWeekMonday(referenceWeekStart);
  }
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1, 12, 0, 0, 0);
  return startOfWeekMonday(first);
}

export function classKey(slot: ScheduleSlot) {
  const classId =
    typeof slot.class === "object" && slot.class?._id ? slot.class._id : String(slot.class || "");
  const sectionId =
    typeof slot.section === "object" && slot.section?._id
      ? slot.section._id
      : String(slot.section || "");
  return `${classId}:${sectionId}`;
}

export function classLabel(slot: ScheduleSlot) {
  const className =
    typeof slot.class === "object" && slot.class?.name ? slot.class.name : "";
  const sectionName =
    typeof slot.section === "object" && slot.section?.name ? slot.section.name : "";
  return [className, sectionName].filter(Boolean).join(" ") || "Class";
}

export function roomLabel(slot: ScheduleSlot) {
  if (!slot.room) return "";
  const name = slot.room.name || slot.room.code || "";
  if (!name) return "";
  return /^room\b/i.test(name) ? name : `Room ${name}`;
}

export function sortSlots(a: ScheduleSlot, b: ScheduleSlot) {
  const ao = a.periodOrder ?? 999;
  const bo = b.periodOrder ?? 999;
  if (ao !== bo) return ao - bo;
  return String(a.startTime || a.periodId).localeCompare(String(b.startTime || b.periodId));
}

export function periodKey(slot: ScheduleSlot) {
  return slot.periodId || `${slot.startTime || ""}-${slot.endTime || ""}-${slot.periodLabel || ""}`;
}

function parseTimeToMinutes(raw?: string | null): number | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  const ampm = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    let h = Number(ampm[1]);
    const m = Number(ampm[2]);
    const mer = ampm[3].toUpperCase();
    if (mer === "PM" && h < 12) h += 12;
    if (mer === "AM" && h === 12) h = 0;
    return h * 60 + m;
  }
  const hhmm = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) return Number(hhmm[1]) * 60 + Number(hhmm[2]);
  return null;
}

export function slotDurationHours(slot: ScheduleSlot) {
  const start = parseTimeToMinutes(slot.startTime);
  const end = parseTimeToMinutes(slot.endTime);
  if (start == null || end == null || end <= start) return 40 / 60;
  return (end - start) / 60;
}

export type GridRow =
  | {
      kind: "period";
      key: string;
      label: string;
      startLabel: string;
      endLabel: string;
      order: number;
      sample: ScheduleSlot;
    }
  | {
      kind: "break";
      key: string;
      label: string;
      order: number;
    };

function formatMinutes(mins: number) {
  const h24 = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatClock(raw?: string | null) {
  const mins = parseTimeToMinutes(raw);
  if (mins == null) return raw || "";
  return formatMinutes(mins);
}

export function buildGridRows(slots: ScheduleSlot[]): GridRow[] {
  const map = new Map<string, Extract<GridRow, { kind: "period" }>>();
  for (const s of slots) {
    const key = periodKey(s);
    if (map.has(key)) continue;
    const startLabel = formatClock(s.startTime) || s.periodLabel || "—";
    const endLabel = formatClock(s.endTime);
    map.set(key, {
      kind: "period",
      key,
      label: endLabel ? `${startLabel} - ${endLabel}` : startLabel,
      startLabel,
      endLabel,
      order: s.periodOrder ?? 999,
      sample: s,
    });
  }

  const periods = [...map.values()].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return String(a.sample.startTime || a.key).localeCompare(String(b.sample.startTime || b.key));
  });

  const rows: GridRow[] = [];
  for (let i = 0; i < periods.length; i++) {
    const cur = periods[i];
    if (/break/i.test(cur.sample.periodLabel || "") || /break/i.test(cur.label)) {
      rows.push({
        kind: "break",
        key: `break-${cur.key}`,
        label: `BREAK • ${cur.label}`,
        order: cur.order,
      });
      continue;
    }
    rows.push(cur);
    const next = periods[i + 1];
    if (!next) continue;
    const end = parseTimeToMinutes(cur.sample.endTime);
    const start = parseTimeToMinutes(next.sample.startTime);
    if (end != null && start != null && start - end >= 15) {
      rows.push({
        kind: "break",
        key: `gap-${cur.key}-${next.key}`,
        label: `BREAK • ${cur.endLabel || formatClock(cur.sample.endTime)} – ${next.startLabel || formatClock(next.sample.startTime)}`,
        order: cur.order + 0.5,
      });
    }
  }
  return rows;
}
