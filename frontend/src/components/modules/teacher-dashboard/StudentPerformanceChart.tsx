import { useId, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";
import { ChartLine } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { PerformancePoint } from "@/lib/teacherDashboard";

const COLORS = {
  averageScore: "#3B82F6",
  passRate: "#10B981",
  attendanceRate: "#8B5CF6",
} as const;

const chartConfig: ChartConfig = {
  averageScore: { label: "Average Score", color: COLORS.averageScore },
  passRate: { label: "Pass Rate", color: COLORS.passRate },
  attendanceRate: { label: "Attendance Rate", color: COLORS.attendanceRate },
};

const LEGEND = [
  { key: "averageScore", label: "Average Score", color: COLORS.averageScore },
  { key: "passRate", label: "Pass Rate", color: COLORS.passRate },
  { key: "attendanceRate", label: "Attendance Rate", color: COLORS.attendanceRate },
] as const;

export function StudentPerformanceChart({ data }: { data: PerformancePoint[] }) {
  const [period, setPeriod] = useState("6");
  const gradId = useId().replace(/:/g, "");
  const points = data.slice(-Number(period || 6));

  return (
    <Card className="rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_2px_8px_rgba(15,42,86,0.05)] p-5 h-full flex flex-col min-h-[340px]">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <ChartLine className="h-4 w-4 text-[#3B82F6] shrink-0" strokeWidth={2.25} aria-hidden />
          <h2 className="text-[15px] font-bold text-[#0F172A] tracking-tight truncate">
            Student Performance Overview
          </h2>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger
            className="h-8 w-[8.5rem] rounded-full text-xs border-[#E5E7EB] bg-white shadow-none text-[#64748B] font-medium px-3"
            aria-label="Performance period"
          >
            <SelectValue placeholder="Period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3">Last 3 Months</SelectItem>
            <SelectItem value="6">Last 6 Months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ChartContainer config={chartConfig} className="h-[230px] w-full aspect-auto flex-1">
        <ComposedChart data={points} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id={`perf-fill-${gradId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.attendanceRate} stopOpacity={0.18} />
              <stop offset="55%" stopColor={COLORS.averageScore} stopOpacity={0.08} />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#E8EDF5" strokeDasharray="0" />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#94A3B8", fontSize: 11 }}
            dy={6}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 20, 40, 60, 80, 100]}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#94A3B8", fontSize: 11 }}
            width={32}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Area
            type="monotone"
            dataKey="attendanceRate"
            stroke="none"
            fill={`url(#perf-fill-${gradId})`}
            isAnimationActive={false}
            legendType="none"
          />
          <Line
            type="monotone"
            dataKey="passRate"
            name="Pass Rate"
            stroke={COLORS.passRate}
            strokeWidth={2.5}
            dot={{ r: 4, fill: COLORS.passRate, strokeWidth: 0 }}
            activeDot={{ r: 5.5 }}
          />
          <Line
            type="monotone"
            dataKey="averageScore"
            name="Average Score"
            stroke={COLORS.averageScore}
            strokeWidth={2.5}
            dot={{ r: 4, fill: COLORS.averageScore, strokeWidth: 0 }}
            activeDot={{ r: 5.5 }}
          />
          <Line
            type="monotone"
            dataKey="attendanceRate"
            name="Attendance Rate"
            stroke={COLORS.attendanceRate}
            strokeWidth={2.5}
            dot={{ r: 4, fill: COLORS.attendanceRate, strokeWidth: 0 }}
            activeDot={{ r: 5.5 }}
          />
        </ComposedChart>
      </ChartContainer>

      <ul className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        {LEGEND.map((item) => (
          <li key={item.key} className="inline-flex items-center gap-1.5 text-xs text-[#8E95A9]">
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: item.color }}
              aria-hidden
            />
            {item.label}
          </li>
        ))}
      </ul>

      <p className="sr-only">
        Line chart comparing average score, pass rate, and attendance rate over recent months.
      </p>
    </Card>
  );
}
