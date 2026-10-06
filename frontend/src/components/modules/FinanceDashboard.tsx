import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CreditCard,
  Download,
  Eye,
  FileBarChart2,
  Filter,
  Loader2,
  Receipt,
  Search,
  TrendingUp,
  Wallet,
  AlertTriangle,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Role } from "@/lib/auth";
import { moduleHref } from "@/lib/panelMenus";
import { cn } from "@/lib/utils";
import {
  FINANCE_COLORS,
  type FinanceTransaction,
  type PaymentMethod,
  type TxStatus,
  type TxType,
  downloadCsv,
  formatPkr,
  formatPkrAxis,
  pctOf,
} from "@/lib/financeDashboardData";
import {
  EXPENSE_CATEGORY_LABELS,
  fetchDashboardOverview,
  fetchFeeDefaulters,
  type ExpenseCategory,
} from "@/lib/studentManagementApi";

type PeriodView = "monthly" | "quarterly" | "yearly";

const cardClass =
  "rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(16,38,77,0.06)]";

const CHART_COLORS = [
  "#16A36A",
  "#2478E8",
  "#8B5CF6",
  "#F59E0B",
  "#0D9488",
  "#EF4444",
  "#64748B",
  "#0EA5E9",
  "#A855F7",
  "#F97316",
];

const METHOD_COLORS: Record<string, string> = {
  Cash: "#16A36A",
  "Bank Transfer": "#2478E8",
  Online: "#8B5CF6",
  Other: "#94A3B8",
};

const STATUS_COLORS: Record<string, string> = {
  "Fully Paid": "#16A36A",
  "Partially Paid": "#2478E8",
  Unpaid: "#F59E0B",
  Overdue: "#EF4444",
};

const AGING_COLORS = ["#F59E0B", "#F97316", "#EF4444", "#B91C1C"];

function momPct(current: number, previous: number): number {
  if (!previous) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function mapPaymentMethod(raw?: string | null): PaymentMethod {
  const key = String(raw || "other").toLowerCase();
  if (key === "cash") return "Cash";
  if (key === "bank_transfer") return "Bank Transfer";
  if (key === "online") return "Mobile Wallet";
  if (key === "cheque") return "Cheque";
  return "Other";
}

function formatShortDate(value?: string | Date | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function monthLabel(month: number, year: number): string {
  return new Date(year, month - 1, 1).toLocaleString("en", { month: "short" });
}

function Sparkline({ data, color }: { data: readonly number[]; color: string }) {
  const chartData = data.map((v, i) => ({ i, v }));
  return (
    <div className="h-10 w-24 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <Bar dataKey="v" fill={color} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function KpiCard({
  label,
  value,
  changePct,
  icon: Icon,
  iconBg,
  iconColor,
  sparkData,
  sparkColor,
}: {
  label: string;
  value: string;
  changePct: number;
  icon: typeof Wallet;
  iconBg: string;
  iconColor: string;
  sparkData: readonly number[];
  sparkColor: string;
}) {
  const up = changePct >= 0;
  return (
    <div className={cn(cardClass, "p-4 sm:p-5 flex flex-col gap-3 transition-shadow hover:shadow-md")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="h-10 w-10 rounded-xl grid place-items-center shrink-0"
            style={{ backgroundColor: iconBg }}
          >
            <Icon className="h-5 w-5" style={{ color: iconColor }} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 truncate">{label}</p>
            <p className="text-lg sm:text-xl font-bold tracking-tight text-[#10264D] truncate">{value}</p>
          </div>
        </div>
        <Sparkline data={sparkData} color={sparkColor} />
      </div>
      <div
        className={cn(
          "inline-flex items-center gap-1 text-xs font-semibold w-fit",
          up ? "text-[#16A36A]" : "text-[#EF4444]",
        )}
      >
        {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
        {up ? "+" : ""}
        {changePct}% <span className="font-normal text-slate-500">vs. last month</span>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  children,
  className,
  action,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div className={cn(cardClass, "p-4 sm:p-5 flex flex-col", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[#10264D]">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function MoneyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs">
      {label && <p className="mb-1 font-semibold text-[#10264D]">{label}</p>}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-slate-600">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}:</span>
          <span className="font-semibold text-[#10264D]">{formatPkr(Number(p.value || 0))}</span>
        </div>
      ))}
    </div>
  );
}

function statusBadge(status: string) {
  if (status === "Paid" || status === "Fully Paid") {
    return (
      <Badge className="border-transparent bg-emerald-50 text-[#16A36A] hover:bg-emerald-50 font-medium">
        {status}
      </Badge>
    );
  }
  if (status === "Pending" || status === "Due Soon") {
    return (
      <Badge className="border-transparent bg-amber-50 text-[#F59E0B] hover:bg-amber-50 font-medium">
        {status}
      </Badge>
    );
  }
  return (
    <Badge className="border-transparent bg-red-50 text-[#EF4444] hover:bg-red-50 font-medium">
      {status}
    </Badge>
  );
}

function BarSpark({ className, style }: { className?: string; style?: CSSProperties }) {
  return <FileBarChart2 className={className} style={style} />;
}

const FinanceDashboard = () => {
  const { role } = useParams<{ role: Role }>();
  const r = (role || "admin") as Role;
  const navigate = useNavigate();

  const [periodView, setPeriodView] = useState<PeriodView>("monthly");
  const [monthFilter, setMonthFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState<"all" | PaymentMethod>("all");
  const [txStatusFilter, setTxStatusFilter] = useState<"all" | TxStatus>("all");
  const [txTypeFilter, setTxTypeFilter] = useState<"all" | TxType>("all");
  const [txSearch, setTxSearch] = useState("");
  const [dueSearch, setDueSearch] = useState("");
  const [txPage, setTxPage] = useState(1);
  const [duePage, setDuePage] = useState(1);
  const [selectedTx, setSelectedTx] = useState<FinanceTransaction | null>(null);
  const pageSize = 5;

  const {
    data: overview,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["finance-dashboard-overview"],
    queryFn: () => fetchDashboardOverview(12),
    staleTime: 60_000,
  });

  const { data: defaultersData } = useQuery({
    queryKey: ["finance-dashboard-defaulters"],
    queryFn: () => fetchFeeDefaulters({ page: 1, limit: 100 }),
    staleTime: 60_000,
  });

  const trends = overview?.charts.monthlyTrends || [];
  const last = trends[trends.length - 1];
  const prev = trends[trends.length - 2];

  const feesCollected = overview?.kpis.feesCollectedAll || 0;
  const outstandingFees = overview?.kpis.feesOutstandingAll || 0;
  const assessedFees = feesCollected + outstandingFees;
  const expensesMonth = overview?.kpis.expensesMonth || 0;
  const salaryPaidMonth = overview?.kpis.salaryPaidMonth || 0;
  const totalExpensesPeriod = trends.reduce((n, m) => n + (m.expenses || 0) + (m.salaryPaid || 0), 0);
  const totalRevenuePeriod = trends.reduce((n, m) => n + (m.feesCollected || 0), 0);
  const net = totalRevenuePeriod - totalExpensesPeriod;

  const revenueGrowthPct = momPct(last?.feesCollected || 0, prev?.feesCollected || 0);
  const expensesGrowthPct = momPct(
    (last?.expenses || 0) + (last?.salaryPaid || 0),
    (prev?.expenses || 0) + (prev?.salaryPaid || 0),
  );
  const outstandingChangePct = momPct(last?.feesPending || 0, prev?.feesPending || 0);
  const collectedGrowthPct = revenueGrowthPct;
  const rate = pctOf(feesCollected, assessedFees);

  const monthlyTrend = useMemo(
    () =>
      trends.map((m) => {
        const income = m.feesCollected || 0;
        const expenses = (m.expenses || 0) + (m.salaryPaid || 0);
        return {
          month: m.label,
          monthKey: `${m.year}-${String(m.month).padStart(2, "0")}`,
          monthNum: m.month,
          year: m.year,
          income,
          expenses,
          feesCollected: m.feesCollected || 0,
          feesPending: m.feesPending || 0,
          net: income - expenses,
        };
      }),
    [trends],
  );

  const sparklines = useMemo(
    () => ({
      revenue: monthlyTrend.map((m) => m.income),
      expenses: monthlyTrend.map((m) => m.expenses),
      outstanding: monthlyTrend.map((m) => m.feesPending),
      collected: monthlyTrend.map((m) => m.feesCollected),
    }),
    [monthlyTrend],
  );

  const expenseBreakdown = useMemo(() => {
    const cats = (overview?.charts.expensesByCategory || []).map((c, i) => ({
      name: EXPENSE_CATEGORY_LABELS[c.category as ExpenseCategory] || c.category,
      amount: c.total,
      color: CHART_COLORS[i % CHART_COLORS.length],
      count: c.count,
    }));
    if (salaryPaidMonth > 0) {
      cats.unshift({
        name: "Staff Salaries",
        amount: salaryPaidMonth,
        color: FINANCE_COLORS.primary,
        count: 0,
      });
    }
    return cats;
  }, [overview, salaryPaidMonth]);

  const expenseTotal = expenseBreakdown.reduce((n, c) => n + c.amount, 0) || totalExpensesPeriod;

  const paymentMethods = useMemo(() => {
    const rows = overview?.charts.paymentMethods || [];
    return rows.map((m) => ({
      name: m.name === "Online" ? "Mobile Wallet" : m.name,
      amount: m.amount,
      count: m.count,
      color: METHOD_COLORS[m.name] || METHOD_COLORS.Other,
    }));
  }, [overview]);

  const classCollections = useMemo(
    () =>
      (overview?.charts.feesByClass || []).map((c, i) => ({
        ...c,
        color: CHART_COLORS[i % CHART_COLORS.length],
      })),
    [overview],
  );

  const revenueSources = useMemo(
    () =>
      (overview?.charts.revenueByFeeType || []).map((m) => ({
        month: m.label,
        tuition: m.monthly,
        admission: m.admission,
        examination: 0,
        transport: 0,
        other: m.stationery,
      })),
    [overview],
  );

  const agingAnalysis = useMemo(
    () =>
      (overview?.charts.agingBuckets || []).map((b, i) => ({
        ...b,
        color: AGING_COLORS[i % AGING_COLORS.length],
      })),
    [overview],
  );

  const studentPaymentStatus = useMemo(
    () =>
      (overview?.charts.studentPaymentStatus || []).map((s) => ({
        ...s,
        color: STATUS_COLORS[s.name] || FINANCE_COLORS.slate,
      })),
    [overview],
  );

  const transactions = useMemo(() => {
    const fees: FinanceTransaction[] = (overview?.widgets.recentPayments || []).map((p) => ({
      id: `FEE-${p.id.slice(-6).toUpperCase()}`,
      date: formatShortDate(p.paidAt),
      type: "Fee Payment",
      studentOrPayee: p.studentName,
      description: `${p.feeType} · ${monthLabel(p.month, p.year)}${p.voucherNumber ? ` · ${p.voucherNumber}` : ""}`,
      method: mapPaymentMethod(p.paymentMethod),
      amount: p.amount,
      status: "Paid",
    }));
    const expenses: FinanceTransaction[] = (overview?.widgets.recentExpenses || []).map((e) => ({
      id: `EXP-${e.id.slice(-6).toUpperCase()}`,
      date: formatShortDate(e.expenseDate),
      type: "Expense",
      studentOrPayee: e.vendor || e.title,
      description: EXPENSE_CATEGORY_LABELS[e.category as ExpenseCategory] || e.category,
      method: mapPaymentMethod(e.paymentMethod),
      amount: e.amount,
      status: e.status === "paid" ? "Paid" : "Pending",
    }));
    const salaries: FinanceTransaction[] = (overview?.widgets.recentSalaries || []).map((s) => ({
      id: `SAL-${s.id.slice(-6).toUpperCase()}`,
      date: formatShortDate(s.paidAt) !== "—" ? formatShortDate(s.paidAt) : `${monthLabel(s.month, s.year)} ${s.year}`,
      type: "Salary",
      studentOrPayee: s.staffName,
      description: `Salary · ${monthLabel(s.month, s.year)} ${s.year}`,
      method: mapPaymentMethod(s.paymentMethod),
      amount: s.amount,
      status: s.status === "paid" ? "Paid" : s.status === "cancelled" ? "Failed" : "Pending",
    }));
    return [...fees, ...expenses, ...salaries].sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      return (Number.isNaN(db) ? 0 : db) - (Number.isNaN(da) ? 0 : da);
    });
  }, [overview]);

  const pendingDues = useMemo(
    () =>
      (defaultersData?.defaulters || []).map((d) => ({
        studentId: d.student?.studentId || d.studentId,
        studentName: d.student?.studentName || "—",
        className: d.className || "—",
        dueDate: formatShortDate(d.oldestDueDate),
        dueAmount: d.totalDue,
        daysOverdue: d.daysOverdue || 0,
        status: (d.daysOverdue > 0 ? "Overdue" : d.pendingCount > 0 ? "Pending" : "Due Soon") as
          | "Overdue"
          | "Due Soon"
          | "Pending",
      })),
    [defaultersData],
  );

  const peakMonth = useMemo(() => {
    if (!monthlyTrend.length) return { month: "—", income: 0 };
    return monthlyTrend.reduce((a, b) => (b.income > a.income ? b : a));
  }, [monthlyTrend]);

  const topExpense = useMemo(() => {
    if (!expenseBreakdown.length) return { name: "—", amount: 0 };
    return expenseBreakdown.reduce((a, b) => (b.amount > a.amount ? b : a));
  }, [expenseBreakdown]);

  const topDuesClasses = useMemo(
    () => [...classCollections].sort((a, b) => b.outstanding - a.outstanding).slice(0, 3),
    [classCollections],
  );

  const unpaidStudents = studentPaymentStatus
    .filter((s) => s.name !== "Fully Paid")
    .reduce((n, s) => n + s.students, 0);

  const avgMonthlyRevenue = monthlyTrend.length
    ? Math.round(monthlyTrend.reduce((n, m) => n + m.income, 0) / monthlyTrend.length)
    : 0;

  const periodLabel =
    overview?.period != null
      ? `${monthLabel(overview.period.month, overview.period.year)} ${overview.period.year}`
      : "Current period";

  const quickInsights = useMemo(() => {
    const items: { id: string; title: string; detail: string; tone: "success" | "purple" | "warning" | "primary" }[] =
      [];
    items.push({
      id: "rev",
      title:
        revenueGrowthPct >= 0
          ? `Fee collection up ${revenueGrowthPct}%`
          : `Fee collection down ${Math.abs(revenueGrowthPct)}%`,
      detail: "vs. last month",
      tone: revenueGrowthPct >= 0 ? "success" : "warning",
    });
    items.push({
      id: "dues",
      title: `${overview?.kpis.defaulterCount || 0} fee defaulters`,
      detail: formatPkr(overview?.kpis.defaulterOutstanding || outstandingFees, true) + " outstanding",
      tone: "purple",
    });
    if (peakMonth.month !== "—") {
      items.push({
        id: "peak",
        title: `Highest collection in ${peakMonth.month}`,
        detail: formatPkr(peakMonth.income, true),
        tone: "warning",
      });
    }
    items.push({
      id: "net",
      title: `Net ${net >= 0 ? "surplus" : "deficit"} ${formatPkr(Math.abs(net), true)}`,
      detail: "Fees collected − expenses & salaries",
      tone: "primary",
    });
    return items.slice(0, 4);
  }, [revenueGrowthPct, overview, outstandingFees, peakMonth, net]);

  const trendData = useMemo(() => {
    if (periodView === "yearly") {
      const income = monthlyTrend.reduce((n, m) => n + m.income, 0);
      const expenses = monthlyTrend.reduce((n, m) => n + m.expenses, 0);
      return [
        {
          month: periodLabel,
          income,
          expenses,
          feesCollected,
          feesPending: outstandingFees,
          net: income - expenses,
        },
      ];
    }
    if (periodView === "quarterly") {
      const qs = [
        { label: "Q1", months: monthlyTrend.filter((m) => m.monthNum >= 1 && m.monthNum <= 3) },
        { label: "Q2", months: monthlyTrend.filter((m) => m.monthNum >= 4 && m.monthNum <= 6) },
        { label: "Q3", months: monthlyTrend.filter((m) => m.monthNum >= 7 && m.monthNum <= 9) },
        { label: "Q4", months: monthlyTrend.filter((m) => m.monthNum >= 10 && m.monthNum <= 12) },
      ];
      return qs
        .filter((q) => q.months.length)
        .map((q) => ({
          month: q.label,
          income: q.months.reduce((n, m) => n + m.income, 0),
          expenses: q.months.reduce((n, m) => n + m.expenses, 0),
          feesCollected: q.months.reduce((n, m) => n + m.feesCollected, 0),
          feesPending: q.months.reduce((n, m) => n + m.feesPending, 0),
          net: q.months.reduce((n, m) => n + m.net, 0),
        }));
    }
    if (monthFilter !== "all") {
      return monthlyTrend.filter((m) => m.month === monthFilter || m.monthKey === monthFilter);
    }
    return monthlyTrend;
  }, [periodView, monthFilter, monthlyTrend, periodLabel, feesCollected, outstandingFees]);

  const classRows = useMemo(() => {
    if (classFilter === "all") return classCollections;
    return classCollections.filter((c) => c.className === classFilter);
  }, [classFilter, classCollections]);

  const filteredTx = useMemo(() => {
    const q = txSearch.trim().toLowerCase();
    return transactions.filter((t) => {
      if (methodFilter !== "all" && t.method !== methodFilter) return false;
      if (txStatusFilter !== "all" && t.status !== txStatusFilter) return false;
      if (txTypeFilter !== "all" && t.type !== txTypeFilter) return false;
      if (!q) return true;
      return (
        t.id.toLowerCase().includes(q) ||
        t.studentOrPayee.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.type.toLowerCase().includes(q)
      );
    });
  }, [transactions, txSearch, methodFilter, txStatusFilter, txTypeFilter]);

  const filteredDues = useMemo(() => {
    const q = dueSearch.trim().toLowerCase();
    return pendingDues
      .filter((d) => {
        if (classFilter !== "all" && d.className !== classFilter) return false;
        if (!q) return true;
        return (
          d.studentName.toLowerCase().includes(q) ||
          d.studentId.toLowerCase().includes(q) ||
          d.className.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.dueAmount - a.dueAmount);
  }, [pendingDues, dueSearch, classFilter]);

  const txPages = Math.max(1, Math.ceil(filteredTx.length / pageSize));
  const duePages = Math.max(1, Math.ceil(filteredDues.length / pageSize));
  const txSlice = filteredTx.slice((txPage - 1) * pageSize, txPage * pageSize);
  const dueSlice = filteredDues.slice((duePage - 1) * pageSize, duePage * pageSize);
  const pendingTotal = filteredDues.reduce((n, d) => n + d.dueAmount, 0);

  const clearFilters = () => {
    setPeriodView("monthly");
    setMonthFilter("all");
    setClassFilter("all");
    setMethodFilter("all");
    setTxStatusFilter("all");
    setTxTypeFilter("all");
    setTxSearch("");
    setDueSearch("");
    setTxPage(1);
    setDuePage(1);
  };

  const feesHref = moduleHref(r, "fees");

  const collectionDonut = [
    { name: "Collected", value: feesCollected, color: FINANCE_COLORS.success },
    { name: "Pending", value: outstandingFees, color: FINANCE_COLORS.softBlue },
  ];

  if (isLoading) {
    return (
      <div className="min-h-[50vh] grid place-items-center" style={{ backgroundColor: FINANCE_COLORS.pageBg }}>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading finance data…
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-[50vh] grid place-items-center px-4" style={{ backgroundColor: FINANCE_COLORS.pageBg }}>
        <div className={cn(cardClass, "p-6 max-w-md text-center space-y-3")}>
          <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
          <p className="font-semibold text-[#10264D]">Could not load finance dashboard</p>
          <p className="text-sm text-slate-500">{error instanceof Error ? error.message : "Unknown error"}</p>
          <Button type="button" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full" style={{ backgroundColor: FINANCE_COLORS.pageBg }}>
      <div className="px-4 sm:px-6 lg:px-8 py-5 space-y-5">
        <div className={cn(cardClass, "p-3 sm:p-4")}>
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            <div className="relative flex-1 min-w-[160px] sm:max-w-[220px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                value={txSearch}
                onChange={(e) => {
                  setTxSearch(e.target.value);
                  setTxPage(1);
                }}
                placeholder="Search transactions..."
                className="h-8 pl-8 text-xs bg-slate-50 border-slate-200"
              />
            </div>
            <Select value={periodView} onValueChange={(v) => setPeriodView(v as PeriodView)}>
              <SelectTrigger className="h-8 w-[120px] text-xs">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={monthFilter}
              onValueChange={(v) => {
                setMonthFilter(v);
                setPeriodView("monthly");
              }}
            >
              <SelectTrigger className="h-8 w-[110px] text-xs">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All months</SelectItem>
                {monthlyTrend.map((m) => (
                  <SelectItem key={m.monthKey} value={m.month}>
                    {m.month}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={classFilter}
              onValueChange={(v) => {
                setClassFilter(v);
                setDuePage(1);
              }}
            >
              <SelectTrigger className="h-8 w-[120px] text-xs">
                <SelectValue placeholder="Class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classes</SelectItem>
                {classCollections.map((c) => (
                  <SelectItem key={c.className} value={c.className}>
                    {c.className}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={methodFilter}
              onValueChange={(v) => {
                setMethodFilter(v as "all" | PaymentMethod);
                setTxPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue placeholder="Payment method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All methods</SelectItem>
                {(["Cash", "Bank Transfer", "Mobile Wallet", "Cheque", "Other"] as PaymentMethod[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={txStatusFilter}
              onValueChange={(v) => {
                setTxStatusFilter(v as "all" | TxStatus);
                setTxPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-[120px] text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="Paid">Paid</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Badge
              variant="outline"
              className="h-8 border-emerald-200 bg-emerald-50 text-emerald-800 font-normal text-xs"
            >
              Live data{isFetching ? "…" : ""}
            </Badge>
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => refetch()}>
              Refresh
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={clearFilters}>
              <X className="h-3.5 w-3.5 mr-1" />
              Clear
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <KpiCard
            label="Total Revenue"
            value={formatPkr(feesCollected)}
            changePct={revenueGrowthPct}
            icon={Banknote}
            iconBg="rgba(22,163,106,0.12)"
            iconColor={FINANCE_COLORS.success}
            sparkData={sparklines.revenue.length ? sparklines.revenue : [0]}
            sparkColor={FINANCE_COLORS.success}
          />
          <KpiCard
            label="Total Expenses"
            value={formatPkr(totalExpensesPeriod || expensesMonth + salaryPaidMonth)}
            changePct={expensesGrowthPct}
            icon={CreditCard}
            iconBg="rgba(36,120,232,0.12)"
            iconColor={FINANCE_COLORS.primary}
            sparkData={sparklines.expenses.length ? sparklines.expenses : [0]}
            sparkColor={FINANCE_COLORS.primary}
          />
          <KpiCard
            label="Outstanding Dues"
            value={formatPkr(outstandingFees)}
            changePct={outstandingChangePct}
            icon={Wallet}
            iconBg="rgba(139,92,246,0.12)"
            iconColor={FINANCE_COLORS.purple}
            sparkData={sparklines.outstanding.length ? sparklines.outstanding : [0]}
            sparkColor={FINANCE_COLORS.purple}
          />
          <KpiCard
            label="Collected Fees"
            value={formatPkr(overview?.kpis.feesCollectedMonth || last?.feesCollected || 0)}
            changePct={collectedGrowthPct}
            icon={Receipt}
            iconBg="rgba(13,148,136,0.12)"
            iconColor={FINANCE_COLORS.teal}
            sparkData={sparklines.collected.length ? sparklines.collected : [0]}
            sparkColor={FINANCE_COLORS.teal}
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <ChartCard
            title="Income vs. Expenses Trend"
            className="xl:col-span-6 min-h-[320px]"
            action={
              <Select value={periodView} onValueChange={(v) => setPeriodView(v as PeriodView)}>
                <SelectTrigger className="h-7 w-[110px] text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            }
          >
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#64748B", fontSize: 11 }} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    tick={{ fill: "#64748B", fontSize: 11 }}
                    tickFormatter={formatPkrAxis}
                  />
                  <Tooltip content={<MoneyTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="income"
                    name="Income"
                    stroke={FINANCE_COLORS.success}
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: FINANCE_COLORS.success }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="expenses"
                    name="Expenses"
                    stroke={FINANCE_COLORS.primary}
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: FINANCE_COLORS.primary }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Fee Collection Rate" className="xl:col-span-3 min-h-[320px]">
            <div className="h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={collectionDonut}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={75}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {collectionDonut.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                    <Label
                      position="center"
                      content={({ viewBox }) => {
                        if (!viewBox || !("cx" in viewBox)) return null;
                        const { cx, cy } = viewBox;
                        return (
                          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                            <tspan x={cx} y={(cy || 0) - 6} className="fill-[#10264D] text-lg font-bold">
                              {rate}%
                            </tspan>
                            <tspan x={cx} y={(cy || 0) + 14} className="fill-slate-500 text-[10px]">
                              Collected
                            </tspan>
                          </text>
                        );
                      }}
                    />
                  </Pie>
                  <Tooltip formatter={(v: number) => formatPkr(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 text-xs">
              {collectionDonut.map((d) => (
                <div key={d.name} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-slate-600">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                    {d.name}
                  </span>
                  <span className="font-semibold text-[#10264D]">
                    {formatPkr(d.value)} · {pctOf(d.value, assessedFees)}%
                  </span>
                </div>
              ))}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex justify-between text-slate-500 mb-1.5">
                  <span>Total Fees</span>
                  <span className="font-semibold text-[#10264D]">{formatPkr(assessedFees)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, rate)}%`, backgroundColor: FINANCE_COLORS.success }}
                  />
                </div>
              </div>
            </div>
          </ChartCard>

          <ChartCard title="Expense Breakdown" className="xl:col-span-3 min-h-[320px]">
            <div className="h-[180px] w-full">
              {expenseBreakdown.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expenseBreakdown}
                      dataKey="amount"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={75}
                      paddingAngle={1}
                      strokeWidth={0}
                    >
                      {expenseBreakdown.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                      <Label
                        position="center"
                        content={({ viewBox }) => {
                          if (!viewBox || !("cx" in viewBox)) return null;
                          const { cx, cy } = viewBox;
                          return (
                            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                              <tspan x={cx} y={(cy || 0) - 4} className="fill-[#10264D] text-sm font-bold">
                                {formatPkrAxis(expenseTotal)}
                              </tspan>
                              <tspan x={cx} y={(cy || 0) + 12} className="fill-slate-500 text-[10px]">
                                Total
                              </tspan>
                            </text>
                          );
                        }}
                      />
                    </Pie>
                    <Tooltip formatter={(v: number) => formatPkr(v)} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="h-full grid place-items-center text-sm text-slate-500">No expenses yet</p>
              )}
            </div>
            <div className="space-y-1.5 max-h-[110px] overflow-y-auto text-xs pr-1">
              {expenseBreakdown.map((d) => (
                <div key={d.name} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-slate-600 min-w-0 truncate">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: d.color }} />
                    {d.name}
                  </span>
                  <span className="shrink-0 font-medium text-[#10264D]">
                    {pctOf(d.amount, expenseTotal)}%
                  </span>
                </div>
              ))}
            </div>
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ChartCard title="Monthly Fee Collection" className="min-h-[300px]">
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 20, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#64748B", fontSize: 11 }} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    tick={{ fill: "#64748B", fontSize: 11 }}
                    tickFormatter={formatPkrAxis}
                  />
                  <Tooltip content={<MoneyTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="feesCollected" name="Collected" stackId="a" fill={FINANCE_COLORS.success} />
                  <Bar
                    dataKey="feesPending"
                    name="Pending"
                    stackId="a"
                    fill={FINANCE_COLORS.softBlue}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Payments by Method" className="min-h-[300px]">
            <div className="h-[160px] w-full">
              {paymentMethods.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={paymentMethods} dataKey="amount" nameKey="name" outerRadius={70} strokeWidth={0}>
                      {paymentMethods.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatPkr(v)} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="h-full grid place-items-center text-sm text-slate-500">No paid fees yet</p>
              )}
            </div>
            <div className="space-y-1.5 text-xs">
              {paymentMethods.map((d) => (
                <div key={d.name} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-slate-600">
                    <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                    {d.name}
                  </span>
                  <span className="font-medium text-[#10264D]">
                    {pctOf(d.amount, feesCollected)}%
                    {d.count != null && <span className="text-slate-400 font-normal"> · {d.count}</span>}
                  </span>
                </div>
              ))}
            </div>
          </ChartCard>

          <ChartCard title="Fee Collection by Class" className="min-h-[300px]">
            <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
              {classRows.map((c) => (
                <div key={c.className} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-[#10264D]">{c.className}</span>
                    <span className="text-slate-500">
                      <span className="font-semibold text-[#10264D]">{c.pct}%</span>
                      {" · "}
                      {formatPkr(c.collected)}
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(100, c.pct)}%`, backgroundColor: c.color }}
                    />
                  </div>
                </div>
              ))}
              {!classRows.length && (
                <p className="text-sm text-slate-500 text-center py-8">No class fee data yet.</p>
              )}
            </div>
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
          <ChartCard title="Revenue Sources" className="xl:col-span-2 min-h-[280px]">
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueSources} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#64748B", fontSize: 11 }} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    tickFormatter={formatPkrAxis}
                    tick={{ fill: "#64748B", fontSize: 11 }}
                  />
                  <Tooltip content={<MoneyTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="tuition" name="Tuition" stackId="1" stroke="#16A36A" fill="#16A36A" fillOpacity={0.7} />
                  <Area type="monotone" dataKey="admission" name="Admission" stackId="1" stroke="#2478E8" fill="#2478E8" fillOpacity={0.7} />
                  <Area type="monotone" dataKey="other" name="Stationery / Other" stackId="1" stroke="#94A3B8" fill="#94A3B8" fillOpacity={0.7} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Outstanding Dues Aging" className="min-h-[280px]">
            <div className="h-[220px] w-full">
              {agingAnalysis.some((a) => a.amount > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agingAnalysis} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#64748B", fontSize: 10 }} />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={40}
                      tickFormatter={formatPkrAxis}
                      tick={{ fill: "#64748B", fontSize: 11 }}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.[0]) return null;
                        const row = payload[0].payload as (typeof agingAnalysis)[0];
                        return (
                          <div className="rounded-lg border bg-white px-3 py-2 shadow-lg text-xs">
                            <p className="font-semibold text-[#10264D]">{label}</p>
                            <p>{formatPkr(row.amount)}</p>
                            <p className="text-slate-500">{row.students} students</p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="amount" name="Amount" radius={[6, 6, 0, 0]}>
                      {agingAnalysis.map((d) => (
                        <Cell key={d.label} fill={d.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="h-full grid place-items-center text-sm text-slate-500">No overdue aging data</p>
              )}
            </div>
          </ChartCard>

          <ChartCard title="Financial Performance" className="min-h-[280px]">
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#64748B", fontSize: 11 }} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    tickFormatter={formatPkrAxis}
                    tick={{ fill: "#64748B", fontSize: 11 }}
                  />
                  <Tooltip content={<MoneyTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="income" name="Revenue" stroke="#16A36A" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#EF4444" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="net" name="Net" stroke="#2478E8" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <ChartCard title="Student Payment Status" className="xl:col-span-4">
            <div className="space-y-3">
              <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
                {studentPaymentStatus.map((s) => (
                  <div
                    key={s.name}
                    style={{ width: `${s.pct}%`, backgroundColor: s.color }}
                    title={`${s.name}: ${s.pct}%`}
                  />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {studentPaymentStatus.map((s) => (
                  <div key={s.name} className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                      {s.name}
                    </div>
                    <p className="mt-0.5 text-sm font-bold text-[#10264D]">
                      {s.students} <span className="text-xs font-normal text-slate-500">({s.pct}%)</span>
                    </p>
                  </div>
                ))}
                {!studentPaymentStatus.length && (
                  <p className="col-span-2 text-sm text-slate-500 text-center py-4">No fee records yet</p>
                )}
              </div>
            </div>
          </ChartCard>

          <div className="xl:col-span-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {[
              { label: "Avg. collection rate", value: `${rate}%`, hint: "Collected ÷ assessed" },
              { label: "Outstanding balance", value: formatPkr(outstandingFees, true), hint: "All unpaid dues" },
              {
                label: "Transactions (recent)",
                value: String(transactions.length),
                hint: "Fee + expense + salary",
              },
              { label: "Avg. monthly revenue", value: formatPkr(avgMonthlyRevenue, true), hint: "Trend window" },
              { label: "Highest revenue month", value: peakMonth.month, hint: formatPkr(peakMonth.income, true) },
              { label: "Highest expense", value: topExpense.name, hint: formatPkr(topExpense.amount, true) },
              { label: "Students unpaid", value: String(unpaidStudents), hint: "Partial + unpaid" },
              { label: "Net operating balance", value: formatPkr(net, true), hint: "Revenue − expenses" },
              {
                label: "MoM revenue change",
                value: `${revenueGrowthPct >= 0 ? "+" : ""}${revenueGrowthPct}%`,
                hint: "vs. last month",
              },
              {
                label: "MoM expense change",
                value: `${expensesGrowthPct >= 0 ? "+" : ""}${expensesGrowthPct}%`,
                hint: "vs. last month",
              },
              {
                label: "Collection target",
                value: `${Math.min(100, Math.round((rate / 85) * 100))}%`,
                hint: "vs 85% target",
              },
              {
                label: "Top dues class",
                value: topDuesClasses[0]?.className || "—",
                hint: topDuesClasses[0] ? formatPkr(topDuesClasses[0].outstanding, true) : "—",
              },
            ].map((m) => (
              <div key={m.label} className={cn(cardClass, "p-3")}>
                <p className="text-[11px] text-slate-500">{m.label}</p>
                <p className="mt-1 text-sm font-bold text-[#10264D] truncate">{m.value}</p>
                <p className="text-[10px] text-slate-400 mt-0.5 truncate">{m.hint}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className={cn(cardClass, "xl:col-span-5 overflow-hidden")}>
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[#10264D]">Recent Transactions</h3>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() =>
                    downloadCsv(
                      "finance-transactions.csv",
                      filteredTx.map((t) => ({
                        Date: t.date,
                        ID: t.id,
                        Type: t.type,
                        Payee: t.studentOrPayee,
                        Description: t.description,
                        Method: t.method,
                        Amount: t.amount,
                        Status: t.status,
                      })),
                    )
                  }
                >
                  <Download className="h-3.5 w-3.5 mr-1" />
                  CSV
                </Button>
                <Link to={feesHref} className="text-xs font-medium text-[#2478E8] hover:underline px-2">
                  View All
                </Link>
              </div>
            </div>
            <div className="px-3 py-2 flex flex-wrap gap-2 border-b border-slate-50">
              <Select
                value={txTypeFilter}
                onValueChange={(v) => {
                  setTxTypeFilter(v as "all" | TxType);
                  setTxPage(1);
                }}
              >
                <SelectTrigger className="h-7 w-[130px] text-[11px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="Fee Payment">Fee Payment</SelectItem>
                  <SelectItem value="Expense">Expense</SelectItem>
                  <SelectItem value="Salary">Salary</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-100">
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-2 py-2.5 font-medium">Type</th>
                    <th className="px-2 py-2.5 font-medium">Description</th>
                    <th className="px-2 py-2.5 font-medium text-right">Amount</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-2 py-2.5 font-medium"> </th>
                  </tr>
                </thead>
                <tbody>
                  {txSlice.map((t) => (
                    <tr
                      key={t.id}
                      role="button"
                      tabIndex={0}
                      className="border-b border-slate-50 hover:bg-slate-50/80 cursor-pointer focus-visible:bg-slate-100 focus-visible:outline-none"
                      onClick={() => setSelectedTx(t)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedTx(t);
                        }
                      }}
                      aria-label={`View transaction ${t.id}`}
                    >
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{t.date}</td>
                      <td className="px-2 py-2.5 text-[#10264D] font-medium whitespace-nowrap">{t.type}</td>
                      <td className="px-2 py-2.5 text-slate-600 max-w-[140px] truncate">
                        {t.studentOrPayee} — {t.description}
                      </td>
                      <td className="px-2 py-2.5 text-right font-semibold text-[#10264D] whitespace-nowrap">
                        {formatPkr(t.amount)}
                      </td>
                      <td className="px-4 py-2.5">{statusBadge(t.status)}</td>
                      <td className="px-2 py-2.5">
                        <span className="inline-flex text-slate-400" aria-hidden>
                          <Eye className="h-3.5 w-3.5" />
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!txSlice.length && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        No transactions match your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2.5 flex items-center justify-between text-xs text-slate-500">
              <span>
                Page {txPage} of {txPages}
              </span>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7"
                  disabled={txPage <= 1}
                  onClick={() => setTxPage((p) => p - 1)}
                >
                  Prev
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7"
                  disabled={txPage >= txPages}
                  onClick={() => setTxPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>

          <div className={cn(cardClass, "xl:col-span-4 overflow-hidden")}>
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[#10264D]">Pending Dues</h3>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() =>
                    downloadCsv(
                      "pending-dues.csv",
                      filteredDues.map((d) => ({
                        Student: d.studentName,
                        ID: d.studentId,
                        Class: d.className,
                        "Due Date": d.dueDate,
                        Amount: d.dueAmount,
                        "Days Overdue": d.daysOverdue,
                        Status: d.status,
                      })),
                    )
                  }
                >
                  <Download className="h-3.5 w-3.5 mr-1" />
                  CSV
                </Button>
                <Link to={feesHref} className="text-xs font-medium text-[#2478E8] hover:underline px-2">
                  View All
                </Link>
              </div>
            </div>
            <div className="px-3 py-2 border-b border-slate-50">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  value={dueSearch}
                  onChange={(e) => {
                    setDueSearch(e.target.value);
                    setDuePage(1);
                  }}
                  placeholder="Search students..."
                  className="h-8 pl-8 text-xs bg-slate-50"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-100">
                    <th className="px-4 py-2.5 font-medium">Student</th>
                    <th className="px-2 py-2.5 font-medium">Class</th>
                    <th className="px-2 py-2.5 font-medium text-right">Due Amount</th>
                    <th className="px-4 py-2.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {dueSlice.map((d) => (
                    <tr
                      key={d.studentId}
                      role="button"
                      tabIndex={0}
                      className="border-b border-slate-50 hover:bg-slate-50/80 cursor-pointer focus-visible:bg-slate-100 focus-visible:outline-none"
                      onClick={() => navigate(feesHref)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate(feesHref);
                        }
                      }}
                      aria-label={`Record payment for ${d.studentName}`}
                    >
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-[#10264D]">{d.studentName}</div>
                        <div className="text-[10px] text-slate-400">
                          {d.studentId} · {d.daysOverdue > 0 ? `${d.daysOverdue}d overdue` : d.status}
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-slate-600 whitespace-nowrap">{d.className}</td>
                      <td className="px-2 py-2.5 text-right font-semibold text-[#EF4444] whitespace-nowrap">
                        {formatPkr(d.dueAmount)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-[11px] font-medium text-[#2478E8] whitespace-nowrap">
                          Record Payment
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!dueSlice.length && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                        No pending dues for this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[#EF4444]">Total Pending {formatPkr(pendingTotal)}</p>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={duePage <= 1}
                  onClick={() => setDuePage((p) => p - 1)}
                >
                  Prev
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={duePage >= duePages}
                  onClick={() => setDuePage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>

          <div className={cn(cardClass, "xl:col-span-3 p-4")}>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-[#2478E8]" />
              <h3 className="text-sm font-semibold text-[#10264D]">Quick Insights</h3>
            </div>
            <div className="space-y-3">
              {quickInsights.map((insight) => {
                const tone =
                  insight.tone === "success"
                    ? { bg: "rgba(22,163,106,0.12)", color: FINANCE_COLORS.success, Icon: ArrowUpRight }
                    : insight.tone === "purple"
                      ? { bg: "rgba(139,92,246,0.12)", color: FINANCE_COLORS.purple, Icon: AlertTriangle }
                      : insight.tone === "warning"
                        ? { bg: "rgba(245,158,11,0.12)", color: FINANCE_COLORS.warning, Icon: TrendingUp }
                        : { bg: "rgba(36,120,232,0.12)", color: FINANCE_COLORS.primary, Icon: BarSpark };
                const Icon = tone.Icon;
                return (
                  <div key={insight.id} className="flex items-start gap-3 rounded-lg bg-slate-50/80 p-2.5">
                    <span
                      className="h-8 w-8 rounded-lg grid place-items-center shrink-0"
                      style={{ backgroundColor: tone.bg }}
                    >
                      <Icon className="h-4 w-4" style={{ color: tone.color }} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-[#10264D] leading-snug">{insight.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{insight.detail}</p>
                    </div>
                    <Sparkline
                      data={sparklines.revenue.length ? sparklines.revenue.slice(-8) : [0]}
                      color={tone.color}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className={cn(cardClass, "w-full max-w-md p-5 space-y-3")}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-[#10264D]">Transaction details</h3>
                <p className="text-xs text-slate-500">{selectedTx.id}</p>
              </div>
              <button type="button" onClick={() => setSelectedTx(null)} className="text-slate-400 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              {[
                ["Date", selectedTx.date],
                ["Type", selectedTx.type],
                ["Payee", selectedTx.studentOrPayee],
                ["Method", selectedTx.method],
                ["Amount", formatPkr(selectedTx.amount)],
                ["Status", selectedTx.status],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-slate-50 px-3 py-2">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="font-semibold text-[#10264D] mt-0.5">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-slate-600">{selectedTx.description}</p>
            <Button type="button" className="w-full" onClick={() => setSelectedTx(null)}>
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinanceDashboard;
