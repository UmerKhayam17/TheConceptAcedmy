import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  MapPin,
  PlayCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ViewLink } from "./WelcomeBanner";
import type { ScheduleRow, ScheduleStatus } from "@/lib/teacherDashboard";
import { formatDashboardDate } from "@/lib/teacherDashboard";
import { subjectIcon } from "@/lib/subjectTheme";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<
  ScheduleStatus,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  completed: {
    label: "Completed",
    className: "bg-[#DCFCE7] text-[#16A66A]",
    Icon: CheckCircle2,
  },
  ongoing: {
    label: "Ongoing",
    className: "bg-[#DBEAFE] text-[#3B82F6]",
    Icon: PlayCircle,
  },
  upcoming: {
    label: "Upcoming",
    className: "bg-[#F1F5F9] text-[#64748B]",
    Icon: Circle,
  },
};

export function TodaysScheduleCard({
  date,
  rows,
  scheduleHref,
  onPrev,
  onNext,
  loading,
}: {
  date: Date;
  rows: ScheduleRow[];
  scheduleHref: string;
  onPrev: () => void;
  onNext: () => void;
  loading?: boolean;
}) {
  return (
    <Card className="rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_2px_10px_rgba(15,42,86,0.05)] h-full flex flex-col min-h-[340px] overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <CalendarDays className="h-5 w-5 text-[#3B82F6] shrink-0" strokeWidth={2} aria-hidden />
          <h2 className="text-[15px] font-bold text-[#0F2A56] truncate tracking-tight">
            Today&apos;s Class Schedule
          </h2>
        </div>

        <div className="inline-flex items-center gap-0.5 rounded-full bg-[#EFF6FF] px-1 py-0.5 border border-[#DBEAFE]/80">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-full text-[#3B82F6] hover:bg-[#DBEAFE] hover:text-[#1D4ED8]"
            onClick={onPrev}
            aria-label="Previous day"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
          </Button>
          <span className="px-1.5 text-[12.5px] font-semibold text-[#0F2A56] tabular-nums min-w-[7.75rem] text-center select-none">
            {formatDashboardDate(date)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-full text-[#3B82F6] hover:bg-[#DBEAFE] hover:text-[#1D4ED8]"
            onClick={onNext}
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto px-5 pb-2">
        <table className="w-full min-w-[520px] border-separate border-spacing-0">
          <caption className="sr-only">Class schedule for {formatDashboardDate(date)}</caption>
          <thead>
            <tr className="bg-[#F1F5F9]">
              <th className="rounded-l-xl px-3.5 py-2.5 text-left text-[12px] font-semibold text-[#475569]">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  Time
                </span>
              </th>
              <th className="px-3.5 py-2.5 text-left text-[12px] font-semibold text-[#475569]">
                Class
              </th>
              <th className="px-3.5 py-2.5 text-left text-[12px] font-semibold text-[#475569]">
                Subject
              </th>
              <th className="px-3.5 py-2.5 text-left text-[12px] font-semibold text-[#475569]">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" aria-hidden />
                  Room
                </span>
              </th>
              <th className="rounded-r-xl px-3.5 py-2.5 text-left text-[12px] font-semibold text-[#475569]">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3.5 py-12 text-center text-sm text-[#94A3B8]">
                  Loading schedule…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3.5 py-12 text-center text-sm text-[#94A3B8]">
                  No classes scheduled for this day.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const st = STATUS_STYLE[row.status];
                const StatusIcon = st.Icon;
                const SubjectIcon = subjectIcon(row.subject);
                return (
                  <tr key={row.id}>
                    <td className="px-3.5 py-3.5 text-[13px] font-medium text-[#334155] whitespace-nowrap border-t border-[#F1F5F9]">
                      {row.timeLabel}
                    </td>
                    <td className="px-3.5 py-3.5 text-[13px] text-[#475569] whitespace-nowrap border-t border-[#F1F5F9]">
                      {row.classLabel}
                    </td>
                    <td className="px-3.5 py-3.5 text-[13px] text-[#475569] border-t border-[#F1F5F9]">
                      <span className="inline-flex items-center gap-1.5 min-w-0">
                        <SubjectIcon className="h-3.5 w-3.5 shrink-0 text-[#64748B]" aria-hidden />
                        <span className="truncate">{row.subject}</span>
                      </span>
                    </td>
                    <td className="px-3.5 py-3.5 text-[13px] text-[#64748B] whitespace-nowrap border-t border-[#F1F5F9]">
                      {row.room}
                    </td>
                    <td className="px-3.5 py-3.5 border-t border-[#F1F5F9]">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                          st.className,
                        )}
                      >
                        <StatusIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
                        {st.label}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-4 mt-auto">
        <ViewLink to={scheduleHref}>View Full Schedule</ViewLink>
      </div>
    </Card>
  );
}
