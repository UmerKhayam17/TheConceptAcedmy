import { useId, type ComponentType, type ReactNode, type SVGProps } from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Clock3,
  ReceiptText,
  TriangleAlert,
  WalletCards,
} from "lucide-react";
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer } from "recharts";
import type { AcademyFeeSummary } from "@/lib/studentManagementApi";
import { cn } from "@/lib/utils";

type LucideIcon = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;

type FeeMetricVariant = "success" | "danger" | "primary" | "purple";

type FeeMetricItem = {
  id: string;
  title: string;
  value: ReactNode;
  change?: string;
  changePositive?: boolean;
  /** When false, an increase is styled as warning (e.g. outstanding). */
  positiveIsGood?: boolean;
  description?: string;
  footer?: ReactNode;
  icon: LucideIcon;
  variant: FeeMetricVariant;
  chart: ReactNode;
};

const VARIANT: Record<
  FeeMetricVariant,
  { icon: string; iconBg: string; softTint: string; chart: string }
> = {
  success: {
    icon: "#16A66A",
    iconBg: "#DCFCE7",
    softTint: "from-emerald-50/80 to-transparent",
    chart: "#16A66A",
  },
  danger: {
    icon: "#EF4444",
    iconBg: "#FEE2E2",
    softTint: "from-rose-50/80 to-transparent",
    chart: "#EF4444",
  },
  primary: {
    icon: "#2563EB",
    iconBg: "#DBEAFE",
    softTint: "from-blue-50/80 to-transparent",
    chart: "#2563EB",
  },
  purple: {
    icon: "#8B5CF6",
    iconBg: "#EDE9FE",
    softTint: "from-violet-50/80 to-transparent",
    chart: "#8B5CF6",
  },
};

function pctChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 100);
}

function formatRs(n?: number) {
  if (n == null || Number.isNaN(n)) return "Rs —";
  return `Rs ${n.toLocaleString()}`;
}

function AreaSpark({ data, color }: { data: number[]; color: string }) {
  const uid = useId().replace(/:/g, "");
  const series = (data.length ? data : [2, 3, 2.5, 4, 3.5, 5]).map((v, i) => ({ i, v }));
  const gradId = `fee-area-${uid}`;
  return (
    <div className="h-9 w-[72px] shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradId})`}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function BarSpark({ data, color }: { data: number[]; color: string }) {
  const series = (data.length ? data : [1, 2, 2.5, 3.5, 5]).map((v, i) => ({
    i,
    v: Math.max(Number(v) || 0, 0.2),
  }));
  return (
    <div className="h-9 w-[64px] shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={series} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <Bar dataKey="v" fill={color} radius={[2, 2, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function PendingChart({ pending, overdue }: { pending: number; overdue: number }) {
  const total = Math.max(pending + overdue, 1);
  const pendingPct = Math.round((pending / total) * 100);
  return (
    <div className="relative grid h-11 w-11 shrink-0 place-items-center">
      <svg viewBox="0 0 36 36" className="h-11 w-11 -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r="14" fill="none" stroke="#EDE9FE" strokeWidth="4" />
        <circle
          cx="18"
          cy="18"
          r="14"
          fill="none"
          stroke="#8B5CF6"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${pendingPct} ${100 - pendingPct}`}
        />
        {overdue > 0 ? (
          <circle
            cx="18"
            cy="18"
            r="14"
            fill="none"
            stroke="#EF4444"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${Math.round((overdue / total) * 100)} ${100 - Math.round((overdue / total) * 100)}`}
            strokeDashoffset={-pendingPct}
          />
        ) : null}
      </svg>
      <CalendarClock className="pointer-events-none absolute h-4 w-4 text-[#8B5CF6]" />
    </div>
  );
}

export function FeeMetricCard({
  title,
  value,
  change,
  changePositive = true,
  positiveIsGood = true,
  description,
  footer,
  icon: Icon,
  variant,
  chart,
  className,
}: {
  title: string;
  value: ReactNode;
  change?: string;
  changePositive?: boolean;
  positiveIsGood?: boolean;
  description?: string;
  footer?: ReactNode;
  icon: LucideIcon;
  variant: FeeMetricVariant;
  chart?: ReactNode;
  className?: string;
}) {
  const theme = VARIANT[variant];
  const changeIsGood = positiveIsGood ? changePositive : !changePositive;

  return (
    <div
      className={cn(
        "group relative flex h-[132px] flex-col overflow-hidden rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-[0_2px_8px_rgba(15,23,42,0.04)] transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(15,23,42,0.08)]",
        className,
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-2/5 bg-gradient-to-l opacity-70",
          theme.softTint,
        )}
      />

      <div className="relative flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
            style={{ backgroundColor: theme.iconBg }}
          >
            <Icon className="h-5 w-5" style={{ color: theme.icon }} strokeWidth={2} />
          </div>
          <p className="truncate text-[12px] font-semibold text-slate-500">{title}</p>
        </div>
        <div className="shrink-0 pt-0.5">{chart}</div>
      </div>

      <div className="relative mt-auto min-w-0">
        <div className="truncate text-[24px] font-bold leading-none tracking-tight text-[#10244A]">
          {value}
        </div>

        {footer ?? (
          <div className="mt-2.5 flex items-center gap-1.5">
            {change != null ? (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 text-[11px] font-semibold",
                  changeIsGood ? "text-[#16A66A]" : "text-[#EF4444]",
                )}
              >
                {changePositive ? (
                  <ArrowUp className="h-3 w-3" strokeWidth={2.5} />
                ) : (
                  <ArrowDown className="h-3 w-3" strokeWidth={2.5} />
                )}
                {change}
              </span>
            ) : null}
            {description ? (
              <span className="text-[10px] font-medium text-slate-400">{description}</span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export function FeeMetricCards({
  summary,
  loading,
  compact,
}: {
  summary?: AcademyFeeSummary;
  loading?: boolean;
  /** Parent view: hide Pending/Overdue card */
  compact?: boolean;
}) {
  const paid = summary?.totalPaid ?? 0;
  const outstanding = summary?.totalPending ?? 0;
  const records = summary?.recordsCount ?? 0;
  const pendingCount = summary?.byStatus?.pending ?? 0;
  const overdueCount = summary?.byStatus?.overdue ?? 0;
  const prev = summary?.previous;
  const paidDelta = prev ? pctChange(paid, prev.totalPaid) : null;
  const outstandingDelta = prev ? pctChange(outstanding, prev.totalPending) : null;
  const recordsDelta = prev ? records - prev.recordsCount : null;
  const age = summary?.oldestPending?.ageMonths;
  const ageLabel =
    age == null ? "—" : age === 0 ? "This month" : age === 1 ? "1 month" : `${age} months`;

  const metrics: FeeMetricItem[] = [
    {
      id: "collected",
      title: "Total Collected",
      value: loading ? "…" : formatRs(paid),
      change:
        paidDelta == null ? undefined : `${paidDelta >= 0 ? "+" : ""}${paidDelta}%`,
      changePositive: (paidDelta ?? 0) >= 0,
      description: paidDelta == null ? undefined : "vs. last month",
      icon: WalletCards,
      variant: "success",
      chart: <AreaSpark data={summary?.trends?.paid || []} color={VARIANT.success.chart} />,
    },
    {
      id: "outstanding",
      title: "Outstanding",
      value: loading ? "…" : formatRs(outstanding),
      change:
        outstandingDelta == null
          ? undefined
          : `${outstandingDelta >= 0 ? "+" : ""}${outstandingDelta}%`,
      changePositive: (outstandingDelta ?? 0) >= 0,
      positiveIsGood: false,
      description: outstandingDelta == null ? undefined : "vs. last month",
      icon: TriangleAlert,
      variant: "danger",
      chart: <AreaSpark data={summary?.trends?.pending || []} color={VARIANT.danger.chart} />,
    },
    {
      id: "records",
      title: "Total Records",
      value: loading ? "…" : String(records),
      change:
        recordsDelta == null
          ? undefined
          : `${recordsDelta >= 0 ? "+" : ""}${recordsDelta}`,
      changePositive: (recordsDelta ?? 0) >= 0,
      description: recordsDelta == null ? undefined : "vs. last month",
      icon: ReceiptText,
      variant: "primary",
      chart: <BarSpark data={summary?.trends?.records || []} color={VARIANT.primary.chart} />,
    },
  ];

  if (!compact) {
    metrics.push({
      id: "pending",
      title: "Pending / Overdue",
      value: loading ? (
        "…"
      ) : (
        <span className="inline-flex items-baseline gap-1">
          <span className="text-[#F59E0B]">{pendingCount}</span>
          <span className="text-slate-300">/</span>
          <span className="text-[#EF4444]">{overdueCount}</span>
        </span>
      ),
      icon: CalendarClock,
      variant: "purple",
      chart: <PendingChart pending={pendingCount} overdue={overdueCount} />,
      footer: (
        <div className="mt-2.5 flex items-start gap-1.5">
          <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8B5CF6]" />
          <div className="min-w-0 leading-tight">
            <p className="text-[11px] font-semibold text-[#10244A]">{ageLabel}</p>
            <p className="text-[10px] font-medium text-slate-400">oldest pending</p>
          </div>
        </div>
      ),
    });
  }

  return (
    <div
      className={cn(
        "grid gap-3",
        compact
          ? "grid-cols-1 sm:grid-cols-3"
          : "grid-cols-1 sm:grid-cols-2 min-[1101px]:grid-cols-4",
      )}
    >
      {metrics.map((m) => (
        <FeeMetricCard
          key={m.id}
          title={m.title}
          value={m.value}
          change={m.change}
          changePositive={m.changePositive}
          positiveIsGood={m.positiveIsGood}
          description={m.description}
          footer={m.footer}
          icon={m.icon}
          variant={m.variant}
          chart={m.chart}
        />
      ))}
    </div>
  );
}
