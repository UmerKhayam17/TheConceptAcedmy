import { Clock3 } from "lucide-react";
import type { Weekday } from "@/lib/configApi";
import type { PeriodSlot, ScheduleSlot } from "@/lib/timetableApi";
import { DAY_FULL_LABELS } from "../constants";
import { cn, formatWallClock } from "@/lib/utils";
import { formatColumnDate, isSameCalendarDay } from "../my-schedule/dateUtils";
import { ParentEmptyCell, ParentLessonCard } from "./ParentLessonCard";

export function ParentTimetableGrid({
  periods,
  columns,
  getSlot,
  loading,
  emptyMessage,
}: {
  periods: PeriodSlot[];
  columns: { day: Weekday; date: Date }[];
  getSlot: (day: Weekday, periodId: string) => ScheduleSlot | undefined;
  loading?: boolean;
  emptyMessage?: string;
}) {
  const today = new Date();
  const colTemplate = `120px repeat(${Math.max(columns.length, 1)}, minmax(0, 1fr))`;

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-16 text-center text-sm text-slate-400">
        Loading timetable…
      </div>
    );
  }

  if (emptyMessage) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-16 text-center text-sm text-slate-400">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <div className="min-w-[980px]">
        <div
          className="grid border-b border-slate-200 bg-slate-50/90"
          style={{ gridTemplateColumns: colTemplate }}
        >
          <div className="flex items-center gap-2 px-4 py-3 text-[11px] font-bold text-slate-500">
            <Clock3 className="size-3.5" aria-hidden />
            Time
          </div>
          {columns.map(({ day, date }) => {
            const isToday = isSameCalendarDay(date, today);
            return (
              <div
                key={day}
                className={cn("border-l border-slate-200 px-3 py-2.5", isToday && "bg-blue-50/70")}
              >
                <p className="text-[12px] font-extrabold text-[#0B2347]">{DAY_FULL_LABELS[day]}</p>
                <p className={cn("text-[10px]", isToday ? "text-blue-600" : "text-slate-400")}>
                  {formatColumnDate(date).replace(/ \d{4}$/, "")}
                </p>
              </div>
            );
          })}
        </div>

        {periods.map((period) => {
          const start = formatWallClock(period.startTime);
          const end = formatWallClock(period.endTime);
          const timeLabel = start && end ? `${start} – ${end}` : period.label || "—";

          return (
            <div
              key={period._id}
              className="grid border-b border-slate-100 last:border-b-0"
              style={{ gridTemplateColumns: colTemplate }}
            >
              <div className="flex items-center px-4 py-2 text-[11px] font-semibold text-slate-500 whitespace-nowrap">
                {timeLabel}
              </div>
              {columns.map(({ day, date }) => {
                const slot = getSlot(day, period._id);
                const isToday = isSameCalendarDay(date, today);
                return (
                  <div
                    key={`${day}-${period._id}`}
                    className={cn("border-l border-slate-100 p-1.5", isToday && "bg-blue-50/20")}
                  >
                    {slot ? <ParentLessonCard slot={slot} /> : <ParentEmptyCell />}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
