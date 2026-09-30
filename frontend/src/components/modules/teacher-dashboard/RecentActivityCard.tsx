import {
  Activity,
  FileCheck,
  MessageSquare,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { ViewLink } from "./WelcomeBanner";
import type { ActivityItem } from "@/lib/teacherDashboard";
import { cn } from "@/lib/utils";

const TONE_ICON = {
  blue: { wrap: "bg-[#DBEAFE] text-[#1677E8]", Icon: FileCheck },
  green: { wrap: "bg-[#DCFCE7] text-[#16A66A]", Icon: FileCheck },
  purple: { wrap: "bg-[#EDE9FE] text-[#7C3AED]", Icon: FileCheck },
  orange: { wrap: "bg-[#FFEDD5] text-[#EA580C]", Icon: MessageSquare },
  rose: { wrap: "bg-[#FFE4E6] text-[#E11D48]", Icon: Activity },
} as const;

export function RecentActivityCard({
  items,
  viewAllHref,
}: {
  items: ActivityItem[];
  viewAllHref: string;
}) {
  return (
    <Card className="rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_2px_8px_rgba(15,42,86,0.04)] p-5 h-full flex flex-col min-h-[260px]">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-[#DBEAFE] grid place-items-center shrink-0">
            <Activity className="h-4 w-4 text-[#3B82F6]" aria-hidden />
          </div>
          <h2 className="text-[15px] font-semibold text-[#0F2A56]">Recent Activity</h2>
        </div>
        <ViewLink to={viewAllHref}>View All</ViewLink>
      </div>

      <ol className="relative flex-1">
        {items.length === 0 ? (
          <li className="text-sm text-[#94A3B8] py-8 text-center">No recent activity.</li>
        ) : (
          items.map((item, idx) => {
            const tone = TONE_ICON[item.tone];
            const Icon = tone.Icon;
            const last = idx === items.length - 1;
            return (
              <li key={item.id} className="relative flex gap-3 pb-4 last:pb-0">
                {!last ? (
                  <span
                    className="absolute left-[15px] top-8 bottom-0 w-px bg-[#E2E8F0]"
                    aria-hidden
                  />
                ) : null}
                <span
                  className={cn(
                    "relative z-[1] h-8 w-8 rounded-full grid place-items-center shrink-0",
                    tone.wrap,
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </span>
                <div className="min-w-0 pt-0.5">
                  <p className="text-[13px] font-semibold text-[#0F2A56] leading-snug">
                    {item.title}
                  </p>
                  <p className="text-xs text-[#64748B] mt-0.5">{item.detail}</p>
                  <p className="text-[11px] text-[#94A3B8] mt-1">{item.timeAgo}</p>
                </div>
              </li>
            );
          })
        )}
      </ol>
    </Card>
  );
}
