import { TrendingUp } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui/card";
import type { TeacherAnalytics } from "@/lib/teacherDashboard";
import { cn } from "@/lib/utils";

function ProgressRing({ value, color }: { value: number; color: string }) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const offset = c - (pct / 100) * c;
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" className="shrink-0" aria-hidden>
      <circle cx="36" cy="36" r={r} fill="none" stroke="#E2E8F0" strokeWidth="7" />
      <circle
        cx="36"
        cy="36"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 36 36)"
      />
      <text
        x="36"
        y="40"
        textAnchor="middle"
        className="fill-[#102A56]"
        style={{ fontSize: 13, fontWeight: 700 }}
      >
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

function MiniSpark({ color }: { color: string }) {
  const data = [62, 68, 65, 72, 78, 74, 84].map((v, i) => ({ i, v }));
  return (
    <div className="h-10 w-20">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            fill={color}
            fillOpacity={0.15}
            strokeWidth={2}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TeacherAnalyticsRow({
  analytics,
  notices,
}: {
  analytics: TeacherAnalytics;
  notices: string[];
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-12">
      <div className="xl:col-span-8 grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Card className="rounded-[14px] border-[#DCE5F0] bg-white p-4 shadow-[0_1px_2px_rgba(16,42,86,0.04)]">
          <p className="text-xs font-medium text-[#64748B]">Attendance Today</p>
          <div className="mt-3 flex items-center justify-between gap-2">
            <ProgressRing value={analytics.attendanceTodayPct} color="#1677E8" />
            <div className="text-right">
              <p className="text-lg font-bold text-[#102A56] tabular-nums">
                {Math.round(analytics.attendanceTodayPct)}%
              </p>
              <p className="text-[11px] text-[#94A3B8]">Present</p>
            </div>
          </div>
        </Card>

        <Card className="rounded-[14px] border-[#DCE5F0] bg-white p-4 shadow-[0_1px_2px_rgba(16,42,86,0.04)]">
          <p className="text-xs font-medium text-[#64748B]">Assignments Completion</p>
          <p className="mt-3 text-2xl font-bold text-[#102A56] tabular-nums">
            {Math.round(analytics.assignmentsCompletionPct)}%
          </p>
          <p className="text-[11px] text-[#94A3B8] mt-1">Completed</p>
          <div className="mt-3 h-2 rounded-full bg-[#EEF2F7] overflow-hidden">
            <div
              className="h-full rounded-full bg-[#16A66A] transition-all"
              style={{ width: `${Math.max(0, Math.min(100, analytics.assignmentsCompletionPct))}%` }}
            />
          </div>
        </Card>

        <Card className="rounded-[14px] border-[#DCE5F0] bg-white p-4 shadow-[0_1px_2px_rgba(16,42,86,0.04)]">
          <p className="text-xs font-medium text-[#64748B]">Average Class Score</p>
          <div className="mt-3 flex items-end justify-between gap-2">
            <div>
              <p className="text-2xl font-bold text-[#102A56] tabular-nums">
                {Math.round(analytics.averageClassScore)}%
              </p>
              <p className="text-[11px] text-[#94A3B8] mt-1">Current average</p>
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 mb-1">
              <TrendingUp className="h-3.5 w-3.5" aria-hidden />
              +2.4%
            </span>
          </div>
        </Card>

        <Card className="rounded-[14px] border-[#DCE5F0] bg-white p-4 shadow-[0_1px_2px_rgba(16,42,86,0.04)]">
          <p className="text-xs font-medium text-[#64748B]">Student Engagement</p>
          <div className="mt-3 flex items-end justify-between gap-2">
            <div>
              <p className="text-2xl font-bold text-[#102A56] tabular-nums">
                {Math.round(analytics.engagementPct)}%
              </p>
              <p className="text-[11px] text-[#94A3B8] mt-1">Active participation</p>
            </div>
            <MiniSpark color="#7C3AED" />
          </div>
        </Card>
      </div>

      <Card className="xl:col-span-4 rounded-[14px] border-[#DCE5F0] bg-white p-5 shadow-[0_1px_2px_rgba(16,42,86,0.04)]">
        <h2 className="text-[15px] font-semibold text-[#102A56] mb-3">Teacher Notifications</h2>
        <ul className="space-y-2.5">
          {notices.map((n, i) => (
            <li
              key={`${i}-${n.slice(0, 12)}`}
              className={cn(
                "rounded-xl border border-[#EEF2F7] bg-[#F8FAFC] px-3.5 py-2.5 text-[13px] text-[#334155] leading-snug",
              )}
            >
              {n}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
