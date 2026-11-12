import { DoorOpen, Link2, User, Users } from "lucide-react";
import { cn, formatWallClockRange } from "@/lib/utils";
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
export function AcademyLessonCell({
  slot,
  variant = "grid",
}: {
  slot: ScheduleSlot;
  /** `stack` is the full-width phone row; `grid` is the period-column cell. */
  variant?: "grid" | "stack";
}) {
  const entries = scheduleSlotEntries(slot);
  const title = scheduleSlotTitle(slot);
  const missing = Boolean(slot.subjectMissing) || isDeletedSubject(slot.subject);
  const teachers = entries.map((e) => e.teacher?.name || "—").join(" / ") || "—";
  const isParallel = entries.length > 1;
  const roomLabel = slot.room?.code || slot.room?.name || "—";
  const PrimaryIcon = subjectIcon(
    missing ? "Deleted subject" : entries[0]?.subject?.name || slot.subject?.name,
  );
  const stacked = variant === "stack";

  return (
    <div
      className={cn(
        "relative flex w-full min-w-0 flex-col justify-center overflow-hidden rounded-xl border text-left text-xs leading-snug shadow-sm",
        stacked ? "min-h-[56px] px-3 py-2" : "h-[72px] px-2.5 py-1.5",
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
  /**
   * Parent portal: list each day on small screens, and keep period columns
   * wide enough to scroll instead of crushing labels on a phone.
   */
  responsive?: boolean;
};

function slotForRow(row: SheetRow, period: PeriodSlot) {
  return row.slots.find(
    (s) => slotMatchesPeriod(s, period._id) && (row.day ? s.day === row.day : true),
  );
}

/** One day at a time, so period names and lessons stay readable on a phone. */
function MobileDayList({
  periods,
  rows,
}: {
  periods: PeriodSlot[];
  rows: SheetRow[];
}) {
  return (
    <div className="divide-y divide-slate-100">
      {rows.map((row) => (
        <section key={row.key} className="px-3 py-3 sm:px-4">
          <div className="mb-2.5 flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900">{row.label}</h3>
            {row.sublabel ? (
              <p className="shrink-0 text-xs text-muted-foreground">{row.sublabel}</p>
            ) : null}
          </div>
          <ul className="space-y-2">
            {periods.map((period) => {
              const slot = slotForRow(row, period);
              const time = formatWallClockRange(period.startTime, period.endTime);
              return (
                <li key={period._id} className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                    <span className="text-[12px] font-semibold text-slate-800">
                      {period.label || `Period ${period.order}`}
                    </span>
                    {time ? (
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {time}
                      </span>
                    ) : null}
                  </div>
                  {slot ? (
                    <AcademyLessonCell slot={slot} variant="stack" />
                  ) : (
                    <div className="flex min-h-[44px] items-center rounded-xl border border-dashed px-3 text-xs text-muted-foreground">
                      Free
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Class Board–style matrix: sticky first column + period columns with times. */
function PeriodTable({
  periods,
  rows,
  firstColumnHeader,
  scrollable,
}: {
  periods: PeriodSlot[];
  rows: SheetRow[];
  firstColumnHeader: string;
  scrollable: boolean;
}) {
  return (
    <div className={scrollable ? "w-full overflow-x-auto" : "w-full overflow-hidden"}>
      <table
        className={cn(
          "border-collapse text-sm",
          scrollable ? "w-max min-w-full" : "w-full table-fixed",
        )}
      >
        <thead>
          <tr className="bg-slate-50 dark:bg-muted/50">
            <th
              className={cn(
                "border-b px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground",
                scrollable
                  ? "sticky left-0 z-10 w-[7.5rem] min-w-[7.5rem] bg-slate-50 dark:bg-muted/50"
                  : "w-[120px]",
              )}
            >
              {firstColumnHeader}
            </th>
            {periods.map((p) => (
              <th
                key={p._id}
                className={cn(
                  "border-b px-2 py-3 text-center font-semibold",
                  scrollable ? "w-[10.5rem] min-w-[10.5rem]" : "overflow-hidden px-1.5",
                )}
              >
                <div className={cn("text-sm", !scrollable && "truncate")}>
                  {p.label || `P${p.order}`}
                </div>
                <div
                  className={cn(
                    "text-[11px] font-normal text-muted-foreground",
                    scrollable ? "whitespace-nowrap" : "truncate",
                  )}
                >
                  {formatWallClockRange(p.startTime, p.endTime)}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="align-top">
              <td
                className={cn(
                  "border-b px-3 py-3 font-semibold",
                  scrollable
                    ? "sticky left-0 z-10 w-[7.5rem] min-w-[7.5rem] bg-background shadow-[1px_0_0_0_hsl(var(--border))]"
                    : "w-[120px] overflow-hidden bg-primary/5",
                )}
              >
                <div className={scrollable ? "whitespace-nowrap" : "truncate"}>{row.label}</div>
                {row.sublabel ? (
                  <div className="mt-0.5 text-[11px] font-normal text-muted-foreground">
                    {row.sublabel}
                  </div>
                ) : null}
              </td>
              {periods.map((period) => {
                const slot = slotForRow(row, period);
                return (
                  <td
                    key={period._id}
                    className={cn(
                      "border-b p-1.5 align-top",
                      scrollable ? "w-[10.5rem] min-w-[10.5rem]" : "overflow-hidden",
                    )}
                  >
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
    </div>
  );
}

export default function AcademyPeriodSheet({
  periods,
  rows,
  firstColumnHeader = "Class",
  emptyMessage = "No lessons in this view yet.",
  responsive = false,
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
    <div className="w-full">
      {responsive ? (
        <div className="lg:hidden">
          <MobileDayList periods={lecturePeriods} rows={rows} />
        </div>
      ) : null}
      <div className={responsive ? "hidden lg:block" : undefined}>
        <PeriodTable
          periods={lecturePeriods}
          rows={rows}
          firstColumnHeader={firstColumnHeader}
          scrollable={responsive}
        />
      </div>
      {!hasAnySlot && (
        <p className="border-t p-4 text-sm text-muted-foreground">{emptyMessage}</p>
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
