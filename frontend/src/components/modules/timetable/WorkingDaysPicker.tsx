import type { Weekday } from "@/lib/configApi";
import { Label } from "@/components/ui/label";
import { DAY_FULL_LABELS, DAY_LABELS, DAY_ORDER } from "./constants";

/** Mon–Fri: Saturday and Sunday are weekly off for students and staff. */
export const NEW_SESSION_WORKING_DAYS: Weekday[] = DAY_ORDER.slice(0, 5);

/** "Saturday", "Saturday and Sunday", "Friday, Saturday and Sunday". */
export function weeklyOffText(off: Weekday[]) {
  const names = off.map((d) => DAY_FULL_LABELS[d]);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function weeklyOffDays(workingDays: Weekday[]) {
  return DAY_ORDER.filter((d) => !workingDays.includes(d));
}

export default function WorkingDaysPicker({
  value,
  onChange,
  disabled,
  label = "Working days",
}: {
  value: Weekday[];
  onChange: (days: Weekday[]) => void;
  disabled?: boolean;
  label?: string;
}) {
  const off = weeklyOffDays(value);
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {DAY_ORDER.map((d) => {
          const on = value.includes(d);
          return (
            <button
              key={d}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              title={DAY_FULL_LABELS[d]}
              onClick={() =>
                onChange(on ? value.filter((x) => x !== d) : DAY_ORDER.filter((x) => x === d || value.includes(x)))
              }
              className={`h-9 min-w-[3rem] rounded-md border px-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {DAY_LABELS[d]}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {value.length === 0
          ? "Select at least one working day."
          : off.length
            ? `Weekly off: ${weeklyOffText(off)}. Attendance is not recorded for students or staff on ${
                off.length === 1 ? "this day" : "these days"
              }.`
            : "All days are working days. No weekly off is set."}
      </p>
    </div>
  );
}
