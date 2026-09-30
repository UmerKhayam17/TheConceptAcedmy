import { Clock3, Coffee } from "lucide-react";
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
  const colTemplate = `150px repeat(${Math.max(columns.length, 1)}, minmax(0, 1fr))`;

  if (loading) {
    return (
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="px-5 py-16 text-center text-sm text-slate-400">Loading your timetable…</div>
      </section>
    );
  }

  if (emptyMessage) {
    return (
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="px-5 py-16 text-center text-sm text-slate-400">{emptyMessage}</div>
      </section>
    );
  }

  return (
    <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="min-w-[1180px]">
        <div
          className="grid border-b border-slate-200 bg-slate-50/80"
          style={{ gridTemplateColumns: colTemplate }}
        >
          <div className="flex items-center gap-2 px-5 py-3 text-[10px] font-bold text-slate-500">
            <Clock3 className="size-3.5" aria-hidden />
            Time
          </div>
          {columns.map(({ day, date }) => {
            const isToday = isSameCalendarDay(date, today);
            return (
              <div
                key={day}
                className={cn(
                  "border-l border-slate-200 px-3 py-2.5",
                  isToday && "bg-blue-50/60",
                )}
              >
                <p className="text-[11px] font-extrabold text-[#0B2347]">{DAY_FULL_LABELS[day]}</p>
                <p className={cn("text-[8px]", isToday ? "text-blue-600" : "text-slate-400")}>
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
                className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-center text-[10px] font-semibold tracking-wide text-slate-400"
              >
                {row.label}
              </div>
            );
          }

          const timeLabel = row.endLabel
            ? `${row.startLabel} - ${row.endLabel}`
            : row.startLabel;

          return (
            <div
              key={row.key}
              className="grid border-b border-slate-200 last:border-b-0"
              style={{ gridTemplateColumns: colTemplate }}
            >
              <div className="flex items-center px-5 text-[9px] font-bold text-slate-500 whitespace-nowrap">
                {timeLabel}
              </div>
              {columns.map(({ day, date }) => {
                const slot = getSlot(day, row.key);
                const isToday = isSameCalendarDay(date, today);
                return (
                  <div
                    key={`${day}-${row.key}`}
                    className={cn(
                      "border-l border-slate-200 p-1.5",
                      isToday && "bg-blue-50/30",
                    )}
                  >
                    {slot ? (
                      <TimetableClassCard
                        slot={slot}
                        columnDate={date}
                        onClick={() => onSelectSlot(slot, date)}
                      />
                    ) : (
                      <div className="flex h-[68px] items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50/50">
                        <span className="flex items-center gap-1 text-[9px] font-medium text-slate-300">
                          <Coffee className="size-3" aria-hidden />
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
    </section>
  );
}
