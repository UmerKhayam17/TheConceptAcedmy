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

export const SUBJECT_COLORS = [
  "bg-blue-500/15 text-blue-700 border-blue-200",
  "bg-emerald-500/15 text-emerald-700 border-emerald-200",
  "bg-amber-500/15 text-amber-800 border-amber-200",
  "bg-violet-500/15 text-violet-700 border-violet-200",
  "bg-rose-500/15 text-rose-700 border-rose-200",
  "bg-cyan-500/15 text-cyan-800 border-cyan-200",
];

export function subjectColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i)) % SUBJECT_COLORS.length;
  return SUBJECT_COLORS[h];
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
