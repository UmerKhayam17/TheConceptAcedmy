import type { Weekday } from "@/lib/configApi";

export const DAY_LABELS: Record<Weekday, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

export const DAY_FULL_LABELS: Record<Weekday, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

export const DAY_ORDER: Weekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

/** Mon–Fri — used by “Apply to Full Week”. */
export const FULL_WEEK_DAYS: Weekday[] = DAY_ORDER.slice(0, 5);

export const DEFAULT_WORKING_DAYS: Weekday[] = DAY_ORDER.slice(0, 6);

export function normalizeWorkingDays(days?: Weekday[]) {
  if (!days?.length) return DEFAULT_WORKING_DAYS;
  const uniqueDays = [...new Set(days)];
  const isLegacyMondayToFriday =
    uniqueDays.length === 5 &&
    DAY_ORDER.slice(0, 5).every((day) => uniqueDays.includes(day));
  if (isLegacyMondayToFriday) return DEFAULT_WORKING_DAYS;
  return uniqueDays.sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b)) as Weekday[];
}

/** Soft card fills — keep in sync with SUBJECT_DOT_COLORS (same index = same subject). */
export const SUBJECT_COLORS = [
  "bg-blue-500/15 text-blue-700 border-blue-200",
  "bg-emerald-500/15 text-emerald-700 border-emerald-200",
  "bg-amber-500/15 text-amber-800 border-amber-200",
  "bg-violet-500/15 text-violet-700 border-violet-200",
  "bg-rose-500/15 text-rose-700 border-rose-200",
  "bg-cyan-500/15 text-cyan-800 border-cyan-200",
  "bg-orange-500/15 text-orange-800 border-orange-200",
  "bg-teal-500/15 text-teal-800 border-teal-200",
  "bg-indigo-500/15 text-indigo-700 border-indigo-200",
  "bg-pink-500/15 text-pink-700 border-pink-200",
  "bg-lime-500/15 text-lime-800 border-lime-200",
  "bg-sky-500/15 text-sky-800 border-sky-200",
  "bg-fuchsia-500/15 text-fuchsia-700 border-fuchsia-200",
  "bg-red-500/15 text-red-700 border-red-200",
  "bg-green-500/15 text-green-800 border-green-200",
  "bg-yellow-500/15 text-yellow-800 border-yellow-200",
  "bg-purple-500/15 text-purple-700 border-purple-200",
  "bg-slate-500/15 text-slate-700 border-slate-200",
  "bg-stone-500/15 text-stone-700 border-stone-200",
  "bg-blue-600/15 text-blue-800 border-blue-300",
  "bg-emerald-600/15 text-emerald-800 border-emerald-300",
  "bg-rose-600/15 text-rose-800 border-rose-300",
  "bg-cyan-600/15 text-cyan-900 border-cyan-300",
  "bg-violet-600/15 text-violet-800 border-violet-300",
];

/** Legend dots — same order as SUBJECT_COLORS (full class names for Tailwind). */
export const SUBJECT_DOT_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-pink-500",
  "bg-lime-500",
  "bg-sky-500",
  "bg-fuchsia-500",
  "bg-red-500",
  "bg-green-500",
  "bg-yellow-500",
  "bg-purple-500",
  "bg-slate-500",
  "bg-stone-500",
  "bg-blue-600",
  "bg-emerald-600",
  "bg-rose-600",
  "bg-cyan-600",
  "bg-violet-600",
];

/** Normalize subject name so the same title shares one color across classes. */
export function subjectColorKey(nameOrId: string) {
  return String(nameOrId || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function subjectColorIndex(id: string) {
  let h = 2166136261;
  const key = subjectColorKey(id);
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % SUBJECT_COLORS.length;
}

export function subjectColor(id: string) {
  return SUBJECT_COLORS[subjectColorIndex(id)];
}

/** Solid legend dot matching the card color for this subject id. */
export function subjectColorDot(id: string) {
  return SUBJECT_DOT_COLORS[subjectColorIndex(id)] || "bg-slate-400";
}

/**
 * Stable unique colors for a subject-name catalog.
 * Same sorted name list → same colors on Class Board and Timetable Builder.
 * Each distinct name gets a different palette index (wraps only if names > palette).
 */
export function assignUniqueSubjectColors(names: Iterable<string>): Map<string, number> {
  const unique = [
    ...new Set([...names].map((n) => subjectColorKey(n)).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));

  const map = new Map<string, number>();
  unique.forEach((key, i) => map.set(key, i % SUBJECT_COLORS.length));
  return map;
}

/** Card / legend color for a subject name using a shared catalog map. */
export function colorForSubjectName(
  name: string,
  colorByKey?: Map<string, number> | null
) {
  const key = subjectColorKey(name);
  if (!key) return SUBJECT_COLORS[0];
  const idx = colorByKey?.get(key);
  if (idx != null) return subjectColorAt(idx);
  return subjectColor(key);
}

export function dotForSubjectName(
  name: string,
  colorByKey?: Map<string, number> | null
) {
  const key = subjectColorKey(name);
  if (!key) return "bg-slate-400";
  const idx = colorByKey?.get(key);
  if (idx != null) return subjectColorDotAt(idx);
  return subjectColorDot(key);
}

export function subjectColorAt(index: number) {
  return SUBJECT_COLORS[index % SUBJECT_COLORS.length];
}

export function subjectColorDotAt(index: number) {
  return SUBJECT_DOT_COLORS[index % SUBJECT_DOT_COLORS.length] || "bg-slate-400";
}

/** Compare schedule slot period to template period (ObjectId vs string safe). */
export function slotMatchesPeriod(
  slot: { periodId: string | { _id?: string } },
  periodId: string
) {
  const slotPeriod =
    typeof slot.periodId === "object" && slot.periodId?._id
      ? slot.periodId._id
      : String(slot.periodId);
  return slotPeriod === String(periodId);
}
