import { Coffee } from "lucide-react";
import type { Weekday } from "@/lib/configApi";
import type { ScheduleSlot } from "@/lib/timetableApi";
import { DAY_FULL_LABELS } from "../constants";
import { cn } from "@/lib/utils";
import { formatColumnDate, isSameCalendarDay, type GridRow } from "./dateUtils";
import { TimetableClassCard } from "./TimetableClassCard";

export function TimetableGrid({
  rows,
  columns,
  getSlot,
  loading,
  emptyMessage,
  weekLabel,
  scheduledCount,
  onSelectSlot,
}: {
  rows: GridRow[];
  columns: { day: Weekday; date: Date }[];
  getSlot: (day: Weekday, periodKey: string) => ScheduleSlot | undefined;
  loading?: boolean;
  emptyMessage?: string;
  weekLabel?: string;
  scheduledCount?: number;
  onSelectSlot: (slot: ScheduleSlot, columnDate: Date) => void;
}) {
  const today = new Date();
  const colTemplate = `130px repeat(${Math.max(columns.length, 1)}, minmax(165px, 1fr))`;
  const periodRows = rows.filter((r) => r.kind === "period");
  let periodIndex = 0;

  if (loading) {
    return (
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="px-5 py-16 text-center text-sm text-slate-400">Loading your timetable…</div>
      </section>
    );
  }

  if (emptyMessage) {
    return (
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="px-5 py-16 text-center text-sm text-slate-400">{emptyMessage}</div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[#0B2347]">Weekly Teaching Schedule</h3>
            {weekLabel ? <p className="mt-0.5 text-xs text-slate-400">{weekLabel}</p> : null}
          </div>
          {scheduledCount != null ? (
            <span className="hidden rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 sm:inline-flex">
              {scheduledCount} scheduled classes
            </span>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[1100px]">
          <div
            className="grid border-b border-slate-200 bg-slate-50"
            style={{ gridTemplateColumns: colTemplate }}
          >
            <div className="flex items-center border-r border-slate-200 px-4 py-4">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Time
              </span>
            </div>
            {columns.map(({ day, date }) => {
              const isToday = isSameCalendarDay(date, today);
              return (
                <div
                  key={day}
                  className={cn(
                    "border-r border-slate-200 px-4 py-3 last:border-r-0",
                    isToday && "bg-blue-50/70",
                  )}
                >
                  <p className="text-sm font-bold text-[#0B2347]">{DAY_FULL_LABELS[day]}</p>
                  <p
                    className={cn(
                      "mt-0.5 text-[10px] font-medium",
                      isToday ? "text-blue-600" : "text-slate-400",
                    )}
                  >
                    {formatColumnDate(date)}
                  </p>
                </div>
              );
            })}
          </div>

          {rows.map((row) => {
            if (row.kind === "break") {
              return (
                <div
                  key={row.key}
                  className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-center text-[11px] font-semibold tracking-wide text-slate-400"
                >
                  {row.label}
                </div>
              );
            }

            periodIndex += 1;
            const index = periodIndex;
            const isLastPeriod = index === periodRows.length;

            return (
              <div
                key={row.key}
                className={cn(
                  "grid min-h-[150px] border-b border-slate-100",
                  isLastPeriod && "last:border-b-0",
                )}
                style={{ gridTemplateColumns: colTemplate }}
              >
                <div className="border-r border-slate-200 bg-slate-50/60 px-3 py-4">
                  <p className="text-[11px] font-bold text-slate-600 whitespace-nowrap">
                    {row.endLabel ? `${row.startLabel} – ${row.endLabel}` : row.startLabel}
                  </p>
                  <p className="mt-2 text-[9px] uppercase tracking-wide text-slate-400">
                    Period {row.sample.periodOrder ?? index}
                  </p>
                </div>

                {columns.map(({ day, date }) => {
                  const slot = getSlot(day, row.key);
                  const isToday = isSameCalendarDay(date, today);
                  return (
                    <div
                      key={`${day}-${row.key}`}
                      className={cn(
                        "border-r border-slate-100 p-2 last:border-r-0",
                        isToday ? "bg-blue-50/20" : "bg-white",
                      )}
                    >
                      {slot ? (
                        <TimetableClassCard
                          slot={slot}
                          columnDate={date}
                          onClick={() => onSelectSlot(slot, date)}
                        />
                      ) : (
                        <div className="flex h-full min-h-[130px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
                          <span className="flex items-center gap-1.5 text-[10px] font-medium text-slate-300">
                            <Coffee className="h-3.5 w-3.5" aria-hidden />
                            Free
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
