import { DoorOpen, Link2, User, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { scheduleSlotEntries, type PeriodSlot, type ScheduleSlot } from "@/lib/timetableApi";
import { DAY_FULL_LABELS, DAY_LABELS, slotMatchesPeriod, subjectColor } from "./constants";
import type { Weekday } from "@/lib/configApi";

/** Read-only lesson cell — matches Class Board LessonCard look. */
export function AcademyLessonCell({ slot }: { slot: ScheduleSlot }) {
  const entries = scheduleSlotEntries(slot);
  const title = entries.map((e) => e.subject.name).join(" / ");
  const teachers = entries.map((e) => e.teacher?.name || "—").join(" / ");
  const isParallel = entries.length > 1;
  const roomLabel = slot.room?.code || slot.room?.name;

  return (
    <div
      className={cn(
        "relative rounded-xl border px-2.5 py-2 text-left text-xs leading-snug shadow-sm",
        subjectColor(slot.subject._id)
      )}
    >
      {slot.combinedGroupId && (
        <span
          className="absolute right-1.5 top-1.5 text-emerald-600"
          title="Shared / combined lesson"
        >
          <Users className="h-3.5 w-3.5" />
        </span>
      )}
      <div className="pr-5">
        <div className="font-semibold text-[13px] truncate" title={title}>
          {title}
        </div>
        <div className="mt-1 flex items-center gap-1 text-muted-foreground truncate" title={teachers}>
          <User className="h-3 w-3 shrink-0" />
          <span className="truncate">{teachers}</span>
        </div>
        {roomLabel && (
          <div className="mt-0.5 flex items-center gap-1 text-muted-foreground truncate">
            <DoorOpen className="h-3 w-3 shrink-0" />
            <span className="truncate">{roomLabel}</span>
          </div>
        )}
        {isParallel && (
          <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-violet-600">
            <Link2 className="h-3 w-3" /> Parallel
          </div>
        )}
      </div>
    </div>
  );
}

type SheetRow = {
  key: string;
  label: string;
  /** Slots for this row (filtered by day when day-mode, or all week when week-mode). */
  slots: ScheduleSlot[];
  /** When set, only slots matching this day are shown in period columns. */
  day?: Weekday;
};

type Props = {
  periods: PeriodSlot[];
  rows: SheetRow[];
  firstColumnHeader?: string;
  emptyMessage?: string;
};

/**
 * Class Board–style matrix: sticky first column + period columns with times.
 */
export default function AcademyPeriodSheet({
  periods,
  rows,
  firstColumnHeader = "Class",
  emptyMessage = "No lessons in this view yet.",
}: Props) {
  const lecturePeriods = periods.filter((p) => p.type === "lecture");

  if (!lecturePeriods.length) {
    return (
      <p className="p-8 text-sm text-muted-foreground">
        Create an academy time configuration (periods) in System Config first.
      </p>
    );
  }

  if (!rows.length) {
    return <p className="p-8 text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  const hasAnySlot = rows.some((r) => r.slots.length > 0);

  return (
    <div className="overflow-auto">
      <table className="w-full min-w-[860px] text-sm border-collapse">
        <thead>
          <tr className="bg-slate-50 dark:bg-muted/50">
            <th className="sticky left-0 z-10 bg-slate-50 dark:bg-muted/50 border-b px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground min-w-[130px]">
              {firstColumnHeader}
            </th>
            {lecturePeriods.map((p) => (
              <th key={p._id} className="border-b px-2 py-3 text-center font-semibold min-w-[120px]">
                <div className="text-sm">{p.label || `P${p.order}`}</div>
                <div className="text-[11px] font-normal text-muted-foreground">
                  {p.startTime} – {p.endTime}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="align-top">
              <td className="sticky left-0 z-10 border-b bg-primary/5 px-3 py-3 font-semibold whitespace-nowrap">
                {row.label}
              </td>
              {lecturePeriods.map((period) => {
                const slot = row.slots.find(
                  (s) =>
                    slotMatchesPeriod(s, period._id) &&
                    (row.day ? s.day === row.day : true)
                );
                return (
                  <td key={period._id} className="border-b p-1.5 align-top">
                    {slot ? (
                      <AcademyLessonCell slot={slot} />
                    ) : (
                      <div className="flex w-full min-h-[72px] items-center justify-center rounded-xl border border-dashed text-xs text-muted-foreground">
                        —
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {!hasAnySlot && (
        <p className="p-4 text-sm text-muted-foreground border-t">{emptyMessage}</p>
      )}
    </div>
  );
}

/** Build week rows (one per weekday) for a single section's slots. */
export function weekRowsFromSlots(
  slots: ScheduleSlot[],
  days: Weekday[]
): SheetRow[] {
  return days.map((d) => ({
    key: d,
    label: DAY_FULL_LABELS[d] || DAY_LABELS[d],
    day: d,
    slots: slots.filter((s) => s.day === d),
  }));
}
