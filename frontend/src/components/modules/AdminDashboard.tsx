import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  Users,
  GraduationCap,
  BookOpen,
  Wallet,
  Megaphone,
  CalendarDays,
  Cake,
  UserPlus,
  Receipt,
  RefreshCw,
  UserCog,
  Library,
  AlertTriangle,
  CheckCircle2,
  Clock,
  UserX,
  Plane,
  CircleDashed,
  TrendingUp,
  Building2,
  Calculator,
  ScanFace,
  Banknote,
  ArrowUpRight,
  Activity,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { fetchDashboardOverview, type DashboardOverview } from "@/lib/studentManagementApi";
import { moduleHref } from "@/lib/panelMenus";
import type { Role } from "@/lib/auth";
import { cn } from "@/lib/utils";

const MONEY = (n: number) => `₨ ${Math.round(n || 0).toLocaleString()}`;
const fmtDate = (iso?: string | Date) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
};

const financeConfig: ChartConfig = {
  feesCollected: { label: "Fees collected", color: "hsl(var(--accent))" },
  feesPending: { label: "Fees outstanding", color: "hsl(var(--destructive))" },
  expenses: { label: "Expenses", color: "hsl(var(--primary))" },
};

const attendanceTrendConfig: ChartConfig = {
  attendancePresent: { label: "Present + late", color: "hsl(152 55% 40%)" },
  attendanceAbsent: { label: "Absent", color: "hsl(var(--destructive))" },
  attendanceLeave: { label: "Leave", color: "hsl(210 70% 50%)" },
};

const attendanceTodayConfig: ChartConfig = {
  Present: { label: "Present", color: "hsl(152 55% 40%)" },
  Late: { label: "Late", color: "hsl(38 90% 48%)" },
  Absent: { label: "Absent", color: "hsl(var(--destructive))" },
  Leave: { label: "Leave", color: "hsl(210 70% 50%)" },
  Unmarked: { label: "Unmarked", color: "hsl(220 10% 65%)" },
};

const feeStatusConfig: ChartConfig = {
  Paid: { label: "Paid", color: "hsl(152 55% 40%)" },
  Pending: { label: "Pending", color: "hsl(38 90% 48%)" },
  Overdue: { label: "Overdue", color: "hsl(var(--destructive))" },
  Waived: { label: "Waived", color: "hsl(220 10% 65%)" },
};

const genderConfig: ChartConfig = {
  Male: { label: "Male", color: "hsl(210 70% 48%)" },
  Female: { label: "Female", color: "hsl(330 55% 55%)" },
  Other: { label: "Other", color: "hsl(var(--primary))" },
  Unspecified: { label: "Unspecified", color: "hsl(220 10% 65%)" },
};

const CLASS_COLORS = [
  "hsl(220 70% 35%)",
  "hsl(42 90% 48%)",
  "hsl(152 55% 38%)",
  "hsl(210 70% 48%)",
  "hsl(330 55% 50%)",
  "hsl(280 40% 45%)",
  "hsl(18 80% 50%)",
  "hsl(190 55% 40%)",
];

function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div className="flex items-start gap-3 min-w-0">
        <div className="mt-1.5 h-8 w-1 rounded-full bg-gold-gradient shrink-0" />
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold text-primary tracking-tight">{title}</h2>
          {subtitle ? <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  href,
  progress,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "good" | "warn" | "bad" | "info" | "gold";
  href?: string;
  progress?: number | null;
}) {
  const toneBar = {
    default: "from-primary/80 to-primary/40",
    good: "from-emerald-500 to-emerald-400/60",
    warn: "from-amber-500 to-amber-400/60",
    bad: "from-red-500 to-red-400/60",
    info: "from-sky-500 to-sky-400/60",
    gold: "from-accent to-amber-400/70",
  }[tone];

  const toneIcon = {
    default: "bg-primary/10 text-primary",
    good: "bg-emerald-500/10 text-emerald-600",
    warn: "bg-amber-500/10 text-amber-600",
    bad: "bg-red-500/10 text-red-600",
    info: "bg-sky-500/10 text-sky-600",
    gold: "bg-accent/15 text-amber-700",
  }[tone];

  const toneValue = {
    default: "text-primary",
    good: "text-emerald-700",
    warn: "text-amber-700",
    bad: "text-red-600",
    info: "text-sky-700",
    gold: "text-amber-700",
  }[tone];

  const inner = (
    <Card
      className={cn(
        "relative overflow-hidden p-4 h-full rounded-2xl shadow-card border-border/70 bg-card",
        "transition-spring hover:-translate-y-1 hover:shadow-elegant hover:border-accent/30",
        href && "cursor-pointer",
      )}
    >
      <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", toneBar)} />
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground leading-tight">
          {label}
        </div>
        {Icon ? (
          <div className={cn("h-9 w-9 rounded-xl grid place-items-center shrink-0", toneIcon)}>
            <Icon className="h-4 w-4" />
          </div>
        ) : null}
      </div>
      <div className={cn("font-display text-2xl sm:text-[1.65rem] font-bold mt-2.5 break-words leading-none tabular-nums", toneValue)}>
        {value}
      </div>
      {hint ? <div className="text-[11px] text-muted-foreground mt-2 leading-snug">{hint}</div> : null}
      {typeof progress === "number" ? (
        <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-700", toneBar)}
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      ) : null}
      {href ? (
        <ArrowUpRight className="absolute bottom-3 right-3 h-3.5 w-3.5 text-muted-foreground/40" />
      ) : null}
    </Card>
  );

  return href ? <Link to={href} className="block h-full">{inner}</Link> : inner;
}

function HeroMetric({
  label,
  value,
  icon: Icon,
  tone = "muted",
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: "muted" | "good" | "warn" | "bad" | "info";
}) {
  const styles = {
    muted: {
      value: "text-white",
      icon: "bg-white/12 text-white",
      glow: "bg-white/15",
    },
    good: {
      value: "text-emerald-300",
      icon: "bg-emerald-400/15 text-emerald-300",
      glow: "bg-emerald-400/25",
    },
    warn: {
      value: "text-amber-300",
      icon: "bg-amber-400/15 text-amber-300",
      glow: "bg-amber-400/25",
    },
    bad: {
      value: "text-rose-300",
      icon: "bg-rose-400/15 text-rose-300",
      glow: "bg-rose-400/25",
    },
    info: {
      value: "text-sky-300",
      icon: "bg-sky-400/15 text-sky-300",
      glow: "bg-sky-400/25",
    },
  }[tone];

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/12 bg-white/[0.07] px-4 py-3.5 min-w-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.12]">
      <div className={cn("pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl", styles.glow)} />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70 truncate">
            {label}
          </div>
          <div className={cn("font-display font-bold text-xl sm:text-2xl mt-1.5 tabular-nums tracking-tight truncate leading-none", styles.value)}>
            {value}
          </div>
        </div>
        <div className={cn("h-9 w-9 rounded-xl grid place-items-center shrink-0", styles.icon)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function AttendanceMeter({
  label,
  value,
  total,
  color,
  icon: Icon,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
  icon: LucideIcon;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />
          <span className="text-muted-foreground truncate">{label}</span>
        </div>
        <span className="font-semibold text-primary tabular-nums shrink-0">
          {value} <span className="text-muted-foreground font-normal text-xs">({pct}%)</span>
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

function WidgetList({
  title,
  icon: Icon,
  linkTo,
  linkLabel,
  empty,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  linkTo?: string;
  linkLabel?: string;
  empty: string;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  const hasChildren = items.length > 0;
  return (
    <Card className="p-0 h-full flex flex-col overflow-hidden rounded-2xl shadow-card border-border/70">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/70 bg-gradient-to-r from-secondary/80 to-card">
        <div className="flex items-center gap-2 min-w-0">
          {Icon ? (
            <div className="h-8 w-8 rounded-lg bg-accent/15 grid place-items-center shrink-0">
              <Icon className="h-4 w-4 text-amber-700" />
            </div>
          ) : null}
          <h3 className="font-semibold text-primary text-sm truncate">{title}</h3>
        </div>
        {linkTo ? (
          <Link to={linkTo} className="text-[11px] font-medium text-accent hover:underline shrink-0">
            {linkLabel || "View all"}
          </Link>
        ) : null}
      </div>
      <div className="flex-1 p-3 space-y-2 min-h-[11rem] max-h-[16rem] overflow-y-auto">
        {hasChildren ? items : <p className="text-xs text-muted-foreground py-8 text-center">{empty}</p>}
      </div>
    </Card>
  );
}

function ChartCard({
  title,
  subtitle,
  linkTo,
  linkLabel,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  linkTo?: string;
  linkLabel?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("p-4 sm:p-5 rounded-2xl shadow-card border-border/70 h-full", className)}>
      <div className="flex items-start justify-between gap-2 mb-4 pb-3 border-b border-border/60">
        <div className="min-w-0">
          <h3 className="font-semibold text-primary text-sm">{title}</h3>
          {subtitle ? <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p> : null}
        </div>
        {linkTo ? (
          <Link to={linkTo} className="text-xs font-medium text-accent hover:underline shrink-0">
            {linkLabel || "Open"}
          </Link>
        ) : null}
      </div>
      {children}
    </Card>
  );
}

function SkeletonBlock() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="h-72 rounded-2xl bg-muted" />
        <div className="h-72 rounded-2xl bg-muted" />
      </div>
    </div>
  );
}

export default function AdminDashboard({ role, name }: { role: Role; name: string }) {
  const [months, setMonths] = useState(6);
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-dashboard-overview", months],
    queryFn: () => fetchDashboardOverview(months),
    refetchInterval: 60_000,
    retry: false,
  });

  const k = data?.kpis;
  const charts = data?.charts;
  const widgets = data?.widgets as DashboardOverview["widgets"] | undefined;

  const feePie = useMemo(
    () => (charts?.feeStatusMonth || []).filter((d) => d.value > 0),
    [charts?.feeStatusMonth],
  );
  const attendancePie = useMemo(
    () => (charts?.attendanceToday || []).filter((d) => d.value > 0),
    [charts?.attendanceToday],
  );
  const genderPie = useMemo(
    () => (charts?.genderDistribution || []).filter((d) => d.value > 0),
    [charts?.genderDistribution],
  );
  const expenseBars = useMemo(
    () =>
      (charts?.expensesByCategory || []).map((e) => ({
        ...e,
        label: String(e.category || "other").replace(/_/g, " "),
      })),
    [charts?.expensesByCategory],
  );

  const periodLabel = data
    ? new Date(data.period.year, data.period.month - 1, 1).toLocaleString("en", {
        month: "long",
        year: "numeric",
      })
    : "—";

  const studentTotal = k ? k.activeStudents + k.inactiveStudents : 0;
  const markedToday = k
    ? k.presentToday + k.lateToday + k.absentToday + k.leaveToday
    : 0;

  return (
    <section className="bg-[hsl(220_25%_97%)] min-h-full">
      {/* Hero */}
      <div className="bg-[image:var(--gradient-hero)] text-primary-foreground relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 88% 12%, hsl(42 90% 52% / 0.28), transparent 36%), radial-gradient(circle at 8% 88%, hsl(210 80% 50% / 0.22), transparent 32%)",
          }}
        />
        <div className="pointer-events-none absolute -bottom-28 -right-20 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
        <div className="pointer-events-none absolute -top-24 -left-16 h-56 w-56 rounded-full bg-sky-500/15 blur-3xl" />
        <div className="relative px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/8 border border-white/15 px-3 py-1 text-[10px] sm:text-xs tracking-[0.22em] uppercase text-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                <Building2 className="h-3.5 w-3.5" />
                Academy Command Center
              </div>
              <h1 className="font-display text-3xl sm:text-4xl font-bold leading-tight mt-3 tracking-tight">
                Dashboard
              </h1>
              <p className="text-white/75 text-sm mt-2 max-w-xl flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>
                  Welcome back, <span className="font-semibold text-white">{name}</span>
                </span>
                {data ? (
                  <>
                    <span className="text-white/35 hidden sm:inline">·</span>
                    <span>{data.today}</span>
                    <span className="text-white/35 hidden sm:inline">·</span>
                    <span className="inline-flex items-center gap-1.5 text-emerald-300">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                      </span>
                      Live {new Date(data.generatedAt).toLocaleTimeString()}
                    </span>
                  </>
                ) : null}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-full p-1 bg-white/8 border border-white/15">
                {[3, 6, 12].map((m) => (
                  <Button
                    key={m}
                    size="sm"
                    variant="ghost"
                    className={cn(
                      "rounded-full h-8 px-3.5 text-xs font-semibold",
                      months === m
                        ? "bg-accent text-accent-foreground shadow-gold hover:bg-accent hover:text-accent-foreground"
                        : "text-white/75 hover:bg-white/10 hover:text-white",
                    )}
                    onClick={() => setMonths(m)}
                  >
                    {m} mo
                  </Button>
                ))}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="rounded-full h-10 bg-white/8 text-white border-white/20 gap-1.5 hover:bg-white/15 hover:text-white hover:border-white/35"
                disabled={isFetching}
                onClick={() => void refetch()}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </div>

          {k ? (
            <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
              <HeroMetric icon={Users} label="Students" value={k.activeStudents} tone="info" />
              <HeroMetric icon={GraduationCap} label="Teachers" value={k.teacherCount} tone="muted" />
              <HeroMetric icon={CheckCircle2} label="Present" value={k.presentToday + k.lateToday} tone="good" />
              <HeroMetric icon={UserX} label="Absent" value={k.absentToday} tone="bad" />
              <HeroMetric icon={Wallet} label="Pending fees" value={MONEY(k.feesOutstandingAll)} tone="warn" />
              <HeroMetric
                icon={Activity}
                label="Attendance"
                value={k.attendanceRateToday != null ? `${k.attendanceRateToday}%` : "—"}
                tone="good"
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-10">
        {isLoading && <SkeletonBlock />}
        {isError && (
          <Card className="p-4 rounded-2xl border-destructive/40 bg-red-50">
            <p className="text-sm text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {(error as Error)?.message || "Failed to load dashboard"}
            </p>
          </Card>
        )}

        {k && (
          <>
            {/* Today's attendance spotlight */}
            <div>
              <SectionTitle
                title="Today at a glance"
                subtitle="Live student & staff attendance"
                action={
                  <Link
                    to={moduleHref(role, "attendance")}
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    Open attendance
                  </Link>
                }
              />
              <div className="grid lg:grid-cols-3 gap-4">
                <Card className="lg:col-span-2 p-5 sm:p-6 rounded-2xl shadow-card border-border/70 bg-gradient-to-br from-card via-card to-secondary/40">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Student attendance</div>
                      <div className="font-display text-3xl font-bold text-primary mt-1">
                        {k.attendanceRateToday != null ? `${k.attendanceRateToday}%` : "—"}
                        <span className="text-sm font-normal text-muted-foreground ml-2">
                          rate · {markedToday}/{k.activeStudents} marked
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link to={moduleHref(role, "ai-attendance")}>
                        <Button size="sm" variant="outline" className="gap-1.5 rounded-full">
                          <ScanFace className="h-3.5 w-3.5" />
                          AI monitor
                        </Button>
                      </Link>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
                    <AttendanceMeter
                      label="Present"
                      value={k.presentToday}
                      total={k.activeStudents}
                      color="hsl(152 55% 40%)"
                      icon={CheckCircle2}
                    />
                    <AttendanceMeter
                      label="Late"
                      value={k.lateToday}
                      total={k.activeStudents}
                      color="hsl(38 90% 48%)"
                      icon={Clock}
                    />
                    <AttendanceMeter
                      label="Absent"
                      value={k.absentToday}
                      total={k.activeStudents}
                      color="hsl(0 75% 50%)"
                      icon={UserX}
                    />
                    <AttendanceMeter
                      label="On leave"
                      value={k.leaveToday}
                      total={k.activeStudents}
                      color="hsl(210 70% 50%)"
                      icon={Plane}
                    />
                    <AttendanceMeter
                      label="Unmarked"
                      value={k.unmarkedToday}
                      total={k.activeStudents}
                      color="hsl(220 10% 65%)"
                      icon={CircleDashed}
                    />
                    <div className="rounded-2xl border border-border/70 bg-background/80 p-3.5 flex flex-col justify-center">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Staff today</div>
                      <div className="mt-1 flex items-baseline gap-3">
                        <span className="font-display text-2xl font-bold text-emerald-700">
                          {k.staffPresentToday}
                        </span>
                        <span className="text-xs text-muted-foreground">present</span>
                        <span className="font-display text-xl font-bold text-red-600">
                          {k.staffAbsentToday}
                        </span>
                        <span className="text-xs text-muted-foreground">absent</span>
                      </div>
                    </div>
                  </div>
                </Card>

                <ChartCard title="Attendance mix" subtitle={data?.today}>
                  {attendancePie.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-16 text-center">No marks yet today</p>
                  ) : (
                    <ChartContainer config={attendanceTodayConfig} className="h-[260px] w-full aspect-auto">
                      <PieChart>
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Pie data={attendancePie} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={2}>
                          {attendancePie.map((e) => (
                            <Cell key={e.name} fill={`var(--color-${e.name})`} stroke="hsl(var(--background))" />
                          ))}
                        </Pie>
                        <Legend />
                      </PieChart>
                    </ChartContainer>
                  )}
                </ChartCard>
              </div>
            </div>

            {/* Full KPI grid — everything visible */}
            <div>
              <SectionTitle title="School overview" subtitle="Every key metric in one place" />
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-3">
                <KpiCard
                  icon={Users}
                  label="Active students"
                  value={String(k.activeStudents)}
                  hint={`${k.inactiveStudents} inactive · ${studentTotal} total`}
                  tone="info"
                  href={moduleHref(role, "students")}
                  progress={studentTotal ? (k.activeStudents / studentTotal) * 100 : null}
                />
                <KpiCard
                  icon={UserPlus}
                  label="Pending admissions"
                  value={String(k.pendingAdmissions)}
                  hint="Awaiting fee / activation"
                  tone="warn"
                  href={moduleHref(role, "student-management")}
                />
                <KpiCard
                  icon={GraduationCap}
                  label="Teachers"
                  value={String(k.teacherCount)}
                  hint={`${k.accountantCount} accountants`}
                  href={moduleHref(role, "staff-management")}
                />
                <KpiCard
                  icon={UserCog}
                  label="Staff total"
                  value={String(k.staffCount)}
                  hint="Teachers + accountants"
                  href={moduleHref(role, "users")}
                />
                <KpiCard
                  icon={BookOpen}
                  label="Classes"
                  value={String(k.classCount)}
                  hint={`${k.sectionCount} sections`}
                  tone="gold"
                  href={moduleHref(role, "system-config")}
                />
                <KpiCard
                  icon={Library}
                  label="Subjects"
                  value={String(k.subjectCount)}
                  hint="Active subjects"
                  href={moduleHref(role, "system-config")}
                />
                <KpiCard
                  icon={CheckCircle2}
                  label="Present today"
                  value={String(k.presentToday)}
                  hint={`+ ${k.lateToday} late`}
                  tone="good"
                  href={moduleHref(role, "attendance")}
                />
                <KpiCard
                  icon={UserX}
                  label="Absent today"
                  value={String(k.absentToday)}
                  hint={`${k.leaveToday} on leave`}
                  tone="bad"
                  href={moduleHref(role, "attendance")}
                />
                <KpiCard
                  icon={Clock}
                  label="Late arrivals"
                  value={String(k.lateToday)}
                  hint="Students marked late"
                  tone="warn"
                />
                <KpiCard
                  icon={CircleDashed}
                  label="Unmarked"
                  value={String(k.unmarkedToday)}
                  hint="Not marked yet today"
                  tone="warn"
                />
                <KpiCard
                  icon={CalendarDays}
                  label="Upcoming exams"
                  value={String(k.upcomingExamsCount)}
                  hint="Scheduled / ongoing"
                  href={moduleHref(role, "exams")}
                />
                <KpiCard
                  icon={AlertTriangle}
                  label="Fee defaulters"
                  value={String(k.defaulterCount)}
                  hint={MONEY(k.defaulterOutstanding)}
                  tone="bad"
                  href={moduleHref(role, "fees")}
                />
              </div>
            </div>

            {/* Finance strip */}
            <div>
              <SectionTitle title="Fees & finance" subtitle={periodLabel} />
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                <KpiCard
                  icon={Wallet}
                  label="Collected (month)"
                  value={MONEY(k.feesCollectedMonth)}
                  hint={`${k.feeVouchersMonth} vouchers`}
                  tone="good"
                  href={moduleHref(role, "fees")}
                />
                <KpiCard
                  icon={AlertTriangle}
                  label="Outstanding (month)"
                  value={MONEY(k.feesOutstandingMonth)}
                  tone="bad"
                  href={moduleHref(role, "fees")}
                />
                <KpiCard
                  icon={TrendingUp}
                  label="Lifetime collected"
                  value={MONEY(k.feesCollectedAll)}
                  hint="All-time paid fees"
                  tone="gold"
                />
                <KpiCard
                  icon={Receipt}
                  label="Pending (all)"
                  value={MONEY(k.feesOutstandingAll)}
                  hint="All unpaid dues"
                  tone="warn"
                />
                <KpiCard
                  icon={Calculator}
                  label="Expenses"
                  value={MONEY(k.expensesMonth)}
                  hint="This month"
                  href={moduleHref(role, "expenses")}
                />
                <KpiCard
                  icon={Banknote}
                  label={`Net · ${periodLabel.split(" ")[0]}`}
                  value={MONEY(k.netCashMonth)}
                  hint={`Salary paid ${MONEY(k.salaryPaidMonth)} · pending ${MONEY(k.salaryPendingMonth)}`}
                  tone={k.netCashMonth >= 0 ? "good" : "bad"}
                  href={moduleHref(role, "salary")}
                />
              </div>
            </div>

            {/* Analytics */}
            <div>
              <SectionTitle title="Analytics" subtitle={`Trends · last ${months} months`} />
              <div className="grid lg:grid-cols-2 gap-4">
                <ChartCard
                  title="Fee collection trend"
                  subtitle="Paid vs outstanding vs expenses"
                  linkTo={moduleHref(role, "fees")}
                  linkLabel="Fees"
                >
                  <ChartContainer config={financeConfig} className="h-[280px] w-full aspect-auto">
                    <AreaChart data={charts?.monthlyTrends || []}>
                      <defs>
                        <linearGradient id="collectedFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--color-feesCollected)" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="var(--color-feesCollected)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={52}
                        tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Area
                        type="monotone"
                        dataKey="feesCollected"
                        stroke="var(--color-feesCollected)"
                        fill="url(#collectedFill)"
                        strokeWidth={2.5}
                      />
                      <Area
                        type="monotone"
                        dataKey="feesPending"
                        stroke="var(--color-feesPending)"
                        fill="transparent"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                      />
                      <Line type="monotone" dataKey="expenses" stroke="var(--color-expenses)" strokeWidth={2} dot={false} />
                      <ChartLegend content={<ChartLegendContent />} />
                    </AreaChart>
                  </ChartContainer>
                </ChartCard>

                <ChartCard
                  title="Student attendance trend"
                  subtitle="Monthly present, absent & leave"
                  linkTo={moduleHref(role, "attendance")}
                  linkLabel="Attendance"
                >
                  <ChartContainer config={attendanceTrendConfig} className="h-[280px] w-full aspect-auto">
                    <LineChart data={charts?.monthlyTrends || []}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} width={36} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Line type="monotone" dataKey="attendancePresent" stroke="var(--color-attendancePresent)" strokeWidth={2.5} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="attendanceAbsent" stroke="var(--color-attendanceAbsent)" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="attendanceLeave" stroke="var(--color-attendanceLeave)" strokeWidth={2} dot={false} />
                      <ChartLegend content={<ChartLegendContent />} />
                    </LineChart>
                  </ChartContainer>
                </ChartCard>
              </div>

              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">
                <ChartCard title="Fees this month" subtitle="Paid vs pending mix">
                  {feePie.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-16 text-center">No fee data</p>
                  ) : (
                    <ChartContainer config={feeStatusConfig} className="h-[230px] w-full aspect-auto">
                      <PieChart>
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              formatter={(value, name, item) => (
                                <div className="flex flex-col gap-0.5">
                                  <span>{String(name)}</span>
                                  <span className="font-medium">{MONEY(Number(value))}</span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {item?.payload?.count ?? 0} vouchers
                                  </span>
                                </div>
                              )}
                            />
                          }
                        />
                        <Pie data={feePie} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={2}>
                          {feePie.map((e) => (
                            <Cell key={e.name} fill={`var(--color-${e.name})`} stroke="hsl(var(--background))" />
                          ))}
                        </Pie>
                        <Legend />
                      </PieChart>
                    </ChartContainer>
                  )}
                </ChartCard>

                <ChartCard title="Gender distribution" subtitle="Active students">
                  {genderPie.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-16 text-center">No gender data</p>
                  ) : (
                    <ChartContainer config={genderConfig} className="h-[230px] w-full aspect-auto">
                      <PieChart>
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Pie data={genderPie} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={2}>
                          {genderPie.map((e) => (
                            <Cell key={e.name} fill={`var(--color-${e.name})`} stroke="hsl(var(--background))" />
                          ))}
                        </Pie>
                        <Legend />
                      </PieChart>
                    </ChartContainer>
                  )}
                </ChartCard>

                <ChartCard title="Enrollment trend" subtitle="New students / month">
                  <ChartContainer
                    config={{ enrollments: { label: "Enrollments", color: "hsl(210 70% 48%)" } }}
                    className="h-[230px] w-full aspect-auto"
                  >
                    <BarChart data={charts?.monthlyTrends || []}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="enrollments" fill="var(--color-enrollments)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                </ChartCard>
              </div>

              <div className="grid lg:grid-cols-2 gap-4 mt-4">
                <ChartCard title="Class-wise students" subtitle="Active enrollments by class">
                  <ChartContainer
                    config={{ count: { label: "Students", color: "hsl(var(--accent))" } }}
                    className="h-[280px] w-full aspect-auto"
                  >
                    <BarChart data={charts?.studentsByClass || []}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis
                        dataKey="className"
                        tickLine={false}
                        axisLine={false}
                        interval={0}
                        angle={-20}
                        textAnchor="end"
                        height={56}
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                        {(charts?.studentsByClass || []).map((_, i) => (
                          <Cell key={i} fill={CLASS_COLORS[i % CLASS_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                </ChartCard>

                <ChartCard
                  title="Expenses by category"
                  subtitle={periodLabel}
                  linkTo={moduleHref(role, "expenses")}
                  linkLabel="Expenses"
                >
                  {expenseBars.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-20 text-center">No expenses this month</p>
                  ) : (
                    <ChartContainer
                      config={{ total: { label: "Amount", color: "hsl(var(--primary))" } }}
                      className="h-[280px] w-full aspect-auto"
                    >
                      <BarChart data={expenseBars} layout="vertical" margin={{ left: 4 }}>
                        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                        <XAxis
                          type="number"
                          tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                        />
                        <YAxis type="category" dataKey="label" width={90} tickLine={false} tick={{ fontSize: 11 }} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="total" fill="var(--color-total)" radius={6} />
                      </BarChart>
                    </ChartContainer>
                  )}
                </ChartCard>
              </div>
            </div>

            {/* Widgets */}
            <div>
              <SectionTitle title="Activity feed" subtitle="Exams, birthdays, admissions, payments & notices" />
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                <WidgetList
                  title="Upcoming exams"
                  icon={CalendarDays}
                  linkTo={moduleHref(role, "exams")}
                  empty="No upcoming exams"
                >
                  {(widgets?.upcomingExams || []).map((e) => (
                    <div
                      key={e.id}
                      className="flex items-start gap-2.5 rounded-xl border border-border/70 bg-background/80 px-3 py-2.5 text-sm hover:border-accent/50 hover:bg-secondary/40 transition-smooth"
                    >
                      <div className="h-8 w-8 rounded-lg bg-primary/10 grid place-items-center shrink-0">
                        <GraduationCap className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-primary truncate">{e.title}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {e.className || "All classes"} · {fmtDate(e.startDate)}
                        </div>
                        <div className="mt-1 inline-flex text-[10px] uppercase tracking-wide rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">
                          {e.status}
                        </div>
                      </div>
                    </div>
                  ))}
                </WidgetList>

                <WidgetList title="Upcoming birthdays" icon={Cake} empty="No birthdays soon">
                  {(widgets?.upcomingBirthdays || []).map((b) => (
                    <div
                      key={b.id}
                      className="flex items-start gap-2.5 rounded-xl border border-border/70 bg-background/80 px-3 py-2.5 text-sm hover:border-accent/40 hover:bg-secondary/30 transition-smooth"
                    >
                      <div className="h-8 w-8 rounded-lg bg-accent/15 grid place-items-center shrink-0">
                        <Cake className="h-4 w-4 text-amber-700" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-primary truncate">
                          {b.name}
                          {b.isToday ? (
                            <span className="ml-1.5 text-[10px] uppercase text-accent font-semibold">Today</span>
                          ) : null}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {b.className} · {b.nextBirthday}
                          {b.daysUntil > 0 ? ` · in ${b.daysUntil}d` : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </WidgetList>

                <WidgetList
                  title="Recent admissions"
                  icon={UserPlus}
                  linkTo={moduleHref(role, "students")}
                  empty="No recent admissions"
                >
                  {(widgets?.recentAdmissions || []).map((s) => (
                    <div
                      key={s.id}
                      className="flex items-start gap-2.5 rounded-xl border border-border/70 bg-background/80 px-3 py-2.5 text-sm hover:border-accent/40 hover:bg-secondary/30 transition-smooth"
                    >
                      <div className="h-8 w-8 rounded-lg bg-sky-500/10 grid place-items-center shrink-0">
                        <UserPlus className="h-4 w-4 text-sky-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-primary truncate">{s.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {s.className || "—"} · {s.status} · {fmtDate(s.at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </WidgetList>

                <WidgetList
                  title="Recent payments"
                  icon={Receipt}
                  linkTo={moduleHref(role, "fees")}
                  empty="No recent payments"
                >
                  {(widgets?.recentPayments || []).map((p) => (
                    <div
                      key={p.id}
                      className="flex items-start gap-2.5 rounded-xl border border-border/70 bg-background/80 px-3 py-2.5 text-sm hover:border-accent/40 hover:bg-secondary/30 transition-smooth"
                    >
                      <div className="h-8 w-8 rounded-lg bg-emerald-500/10 grid place-items-center shrink-0">
                        <Receipt className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium text-primary truncate">{p.studentName}</div>
                          <div className="font-semibold text-emerald-700 shrink-0 text-xs">{MONEY(p.amount)}</div>
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {p.feeType} · {fmtDate(p.paidAt)}
                          {p.voucherNumber ? ` · ${p.voucherNumber}` : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </WidgetList>

                <WidgetList
                  title="Recent announcements"
                  icon={Megaphone}
                  linkTo={moduleHref(role, "announcements")}
                  empty="No announcements yet"
                >
                  {(widgets?.recentAnnouncements || []).map((a) => (
                    <div
                      key={a.id}
                      className="flex items-start gap-2.5 rounded-xl border border-border/70 bg-background/80 px-3 py-2.5 text-sm hover:border-accent/40 hover:bg-secondary/30 transition-smooth"
                    >
                      <div className="h-8 w-8 rounded-lg bg-primary/10 grid place-items-center shrink-0">
                        <Megaphone className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-primary truncate">{a.title}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {fmtDate(a.at)}
                          {a.audience ? ` · ${a.audience}` : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </WidgetList>

                <Card className="p-0 overflow-hidden rounded-2xl shadow-card border-border/70 h-full">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-border/70 bg-gradient-to-r from-secondary/80 to-card">
                    <div className="h-8 w-8 rounded-lg bg-accent/15 grid place-items-center">
                      <Wallet className="h-4 w-4 text-amber-700" />
                    </div>
                    <h3 className="font-semibold text-primary text-sm">Finance snapshot · {periodLabel}</h3>
                  </div>
                  <div className="p-4 space-y-3 text-sm">
                    {[
                      { label: "Collected this month", value: MONEY(k.feesCollectedMonth), tone: "text-emerald-700" },
                      { label: "Outstanding (month)", value: MONEY(k.feesOutstandingMonth), tone: "text-red-600" },
                      { label: "Expenses", value: MONEY(k.expensesMonth), tone: "text-primary" },
                      { label: "Salary paid", value: MONEY(k.salaryPaidMonth), tone: "text-primary" },
                      { label: "Salary pending", value: MONEY(k.salaryPendingMonth), tone: "text-amber-700" },
                      { label: "Net cash", value: MONEY(k.netCashMonth), tone: k.netCashMonth >= 0 ? "text-emerald-700" : "text-red-600" },
                      { label: "Lifetime collected", value: MONEY(k.feesCollectedAll), tone: "text-primary" },
                      { label: "All pending dues", value: MONEY(k.feesOutstandingAll), tone: "text-red-600" },
                    ].map((row) => (
                      <div key={row.label} className="flex justify-between gap-3 border-b border-border/60 last:border-0 pb-2 last:pb-0">
                        <span className="text-muted-foreground">{row.label}</span>
                        <span className={cn("font-semibold tabular-nums", row.tone)}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
