import { DoorOpen, Link2, User, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isDeletedSubject,
  scheduleSlotEntries,
  scheduleSlotTitle,
  type PeriodSlot,
  type ScheduleSlot,
} from "@/lib/timetableApi";
import { subjectIcon } from "@/lib/subjectTheme";
import { DAY_FULL_LABELS, DAY_LABELS, slotMatchesPeriod, subjectColor } from "./constants";
import type { Weekday } from "@/lib/configApi";

/** Read-only lesson cell — matches Class Board LessonCard look. */
export function AcademyLessonCell({ slot }: { slot: ScheduleSlot }) {
  const entries = scheduleSlotEntries(slot);
  const title = scheduleSlotTitle(slot);
  const missing = Boolean(slot.subjectMissing) || isDeletedSubject(slot.subject);
  const teachers = entries.map((e) => e.teacher?.name || "—").join(" / ") || "—";
  const isParallel = entries.length > 1;
  const roomLabel = slot.room?.code || slot.room?.name || "—";
  const PrimaryIcon = subjectIcon(
    missing ? "Deleted subject" : entries[0]?.subject?.name || slot.subject?.name,
  );

  return (
    <div
      className={cn(
        "relative flex h-[72px] w-full min-w-0 flex-col justify-center overflow-hidden rounded-xl border px-2.5 py-1.5 text-left text-xs leading-snug shadow-sm",
        missing
          ? "border-dashed border-amber-400/80 bg-amber-50 text-amber-900"
          : subjectColor(entries[0]?.subject?._id || slot.subject?._id || ""),
      )}
      title={missing ? "Subject was deleted" : title}
    >
      {(slot.combinedGroupId || isParallel) && (
        <span
          className={cn(
            "absolute bottom-1.5 right-1.5",
            slot.combinedGroupId ? "text-emerald-600" : "text-violet-600",
          )}
          title={slot.combinedGroupId ? "Shared / combined lesson" : "Parallel entry"}
        >
          {slot.combinedGroupId ? (
            <Users className="h-3.5 w-3.5" />
          ) : (
            <Link2 className="h-3 w-3" />
          )}
        </span>
      )}
      <div className="min-w-0 overflow-hidden pr-5">
        <div className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-[13px]" title={title}>
          <PrimaryIcon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
          <span className="truncate">{title}</span>
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1 text-muted-foreground" title={teachers}>
          <User className="h-3 w-3 shrink-0" />
          <span className="truncate">{teachers}</span>
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1 pr-4 text-muted-foreground" title={roomLabel}>
          <DoorOpen className="h-3 w-3 shrink-0" />
          <span className="truncate">{roomLabel}</span>
        </div>
      </div>
    </div>
  );
}

export type SheetRow = {
  key: string;
  label: string;
  /** Optional secondary line under the row label (e.g. "Oct 12"). */
  sublabel?: string;
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
    <div className="w-full overflow-hidden">
      <table className="w-full table-fixed text-sm border-collapse">
        <thead>
          <tr className="bg-slate-50 dark:bg-muted/50">
            <th className="w-[120px] border-b px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {firstColumnHeader}
            </th>
            {lecturePeriods.map((p) => (
              <th key={p._id} className="border-b px-1.5 py-3 text-center font-semibold overflow-hidden">
                <div className="text-sm truncate">{p.label || `P${p.order}`}</div>
                <div className="text-[11px] font-normal text-muted-foreground truncate">
                  {p.startTime} – {p.endTime}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="align-top">
              <td className="w-[120px] border-b bg-primary/5 px-3 py-3 font-semibold overflow-hidden">
                <div className="truncate">{row.label}</div>
                {row.sublabel ? (
                  <div className="mt-0.5 text-[11px] font-normal text-muted-foreground truncate">
                    {row.sublabel}
                  </div>
                ) : null}
              </td>
              {lecturePeriods.map((period) => {
                const slot = row.slots.find(
                  (s) =>
                    slotMatchesPeriod(s, period._id) && (row.day ? s.day === row.day : true),
                );
                return (
                  <td key={period._id} className="border-b p-1.5 align-top overflow-hidden">
                    {slot ? (
                      <AcademyLessonCell slot={slot} />
                    ) : (
                      <div className="flex h-[72px] w-full min-w-0 items-center justify-center rounded-xl border border-dashed text-xs text-muted-foreground">
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
  days: Weekday[],
  dateByDay?: Partial<Record<Weekday, Date>>,
): SheetRow[] {
  return days.map((d) => {
    const date = dateByDay?.[d];
    const sublabel = date
      ? date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : undefined;
    return {
      key: d,
      label: DAY_FULL_LABELS[d] || DAY_LABELS[d],
      sublabel,
      day: d,
      slots: slots.filter((s) => s.day === d),
    };
  });
}
