import { AlertCircle, CalendarClock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ViewLink } from "./WelcomeBanner";
import type { DeadlineItem } from "@/lib/teacherDashboard";
import { cn } from "@/lib/utils";

const DUE_TONES = [
  "bg-[#FEE2E2] text-[#DC2626]",
  "bg-[#FFEDD5] text-[#EA580C]",
  "bg-[#DBEAFE] text-[#2563EB]",
  "bg-[#DCFCE7] text-[#16A66A]",
] as const;

export function UpcomingDeadlinesCard({
  items,
  viewAllHref,
}: {
  items: DeadlineItem[];
  viewAllHref: string;
}) {
  return (
    <Card className="rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_2px_8px_rgba(15,42,86,0.04)] p-5 h-full flex flex-col min-h-[260px]">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-[#FEE2E2] grid place-items-center shrink-0">
            <CalendarClock className="h-4 w-4 text-[#EF4444]" aria-hidden />
          </div>
          <h2 className="text-[15px] font-semibold text-[#0F2A56] truncate">Upcoming Deadlines</h2>
        </div>
        <ViewLink to={viewAllHref}>View All</ViewLink>
      </div>

      <ul className="space-y-3.5 flex-1">
        {items.length === 0 ? (
          <li className="text-sm text-[#94A3B8] py-8 text-center">No upcoming deadlines.</li>
        ) : (
          items.map((item, i) => {
            const dueTone = DUE_TONES[i % DUE_TONES.length];
            const dateTone = item.urgent
              ? "bg-[#FEE2E2] border-[#FECACA] text-[#DC2626]"
              : i % 2 === 0
                ? "bg-[#FFEDD5] border-[#FED7AA] text-[#EA580C]"
                : "bg-[#DBEAFE] border-[#BFDBFE] text-[#2563EB]";
            return (
              <li key={item.id} className="flex items-start gap-3">
                <div
                  className={cn(
                    "h-12 w-12 rounded-xl grid place-content-center text-center shrink-0 border",
                    dateTone,
                  )}
                >
                  <span className="text-sm font-bold leading-none">{item.day}</span>
                  <span className="text-[10px] font-semibold uppercase mt-0.5">{item.month}</span>
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  {item.href ? (
                    <ViewLink
                      to={item.href}
                      className="text-[13px] font-semibold text-[#0F2A56] hover:text-[#1677E8] no-underline hover:underline"
                    >
                      {item.title}
                    </ViewLink>
                  ) : (
                    <p className="text-[13px] font-semibold text-[#0F2A56] leading-snug">
                      {item.title}
                    </p>
                  )}
                  <p className="text-xs text-[#64748B] mt-0.5 truncate">{item.subtitle}</p>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 mt-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      dueTone,
                    )}
                  >
                    {item.urgent ? (
                      <AlertCircle className="h-3 w-3" aria-hidden />
                    ) : (
                      <CalendarClock className="h-3 w-3" aria-hidden />
                    )}
                    {item.dueLabel}
                  </span>
                </div>
              </li>
            );
          })
        )}
      </ul>
    </Card>
  );
}
