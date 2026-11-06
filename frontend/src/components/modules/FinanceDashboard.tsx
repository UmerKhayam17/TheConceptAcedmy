import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
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
  Printer,
  Receipt,
  Search,
  TrendingUp,
  Wallet,
  AlertTriangle,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateRangePickerField } from "@/components/ui/date-range-picker";
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
import ListPagination from "@/components/modules/student-management/ListPagination";
import { useToast } from "@/hooks/use-toast";
import { usePanelSession } from "@/components/panel-header/PanelSessionContext";
import { deliverReportBlob, openReportPreviewTab } from "@/lib/reportDownload";
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
  fetchBalanceSheetPdf,
  fetchFeeDefaulters,
  fetchFinanceDashboard,
  type FinanceDashboardData,
} from "@/lib/studentManagementApi";

type PeriodView = "monthly" | "quarterly" | "yearly";
type DashboardTx = FinanceTransaction & { ymd: string; className?: string };

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
  "Mobile Wallet": "#8B5CF6",
  Online: "#8B5CF6",
  Cheque: "#F59E0B",
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

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthsInRange(from: string, to: string): { year: number; month: number; label: string }[] {
  if (!from || !to || from > to) return [];
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  if (!fy || !fm || !ty || !tm) return [];
  const out: { year: number; month: number; label: string }[] = [];
  let year = fy;
  let month = fm;
  while (year < ty || (year === ty && month <= tm)) {
    out.push({
      year,
      month,
      label: new Date(year, month - 1, 1).toLocaleString("en", { month: "short", year: "2-digit" }),
    });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    if (out.length > 48) break;
  }
  return out;
}

function toYmdFromUnknown(value?: string | Date | null): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return toYmd(d);
}

function sessionYmd(value?: string | Date | null): string {
  if (!value) return "";
  if (typeof value === "string") {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
    if (match) return match[1];
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function longDate(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
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
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div
            className="h-10 w-10 rounded-xl grid place-items-center shrink-0"
            style={{ backgroundColor: iconBg }}
          >
            <Icon className="h-5 w-5" style={{ color: iconColor }} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className="text-lg font-bold tracking-tight text-[#10264D] break-words sm:text-xl">{value}</p>
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

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function buildFinanceFigures(
  finance: FinanceDashboardData | undefined,
  from: string,
  to: string,
  classFilter: string,
  methodFilter: string,
) {
  const months = monthsInRange(from, to);
  const today = toYmd(new Date());
  const buckets = new Map(
    months.map((month) => {
      const key = monthKey(month.year, month.month);
      return [
        key,
        {
          month: month.label,
          monthKey: key,
          monthNum: month.month,
          year: month.year,
          income: 0,
          expenses: 0,
          feesCollected: 0,
          feesPending: 0,
          net: 0,
          started: `${key}-01` <= today,
        },
      ];
    }),
  );

  const classMap = new Map<
    string,
    { className: string; assessed: number; collected: number; outstanding: number; pct: number; color: string }
  >();

  for (const row of finance?.fees || []) {
    const bucket = buckets.get(monthKey(row.year, row.month));
    const classOk = classFilter === "all" || row.className === classFilter;
    const methodOk = methodFilter === "all" || row.method === methodFilter;
    if (bucket && classOk && methodOk) {
      bucket.income += row.collected;
      bucket.feesCollected += row.collected;
    }
    if (bucket && classOk) bucket.feesPending += row.pending;

    const klass = classMap.get(row.className) || {
      className: row.className,
      assessed: 0,
      collected: 0,
      outstanding: 0,
      pct: 0,
      color: "",
    };
    if (methodOk) klass.collected += row.collected;
    klass.outstanding += row.pending;
    classMap.set(row.className, klass);
  }

  for (const row of finance?.expenses || []) {
    if (methodFilter !== "all" && row.method !== methodFilter) continue;
    const bucket = buckets.get(monthKey(row.year, row.month));
    if (bucket) bucket.expenses += row.amount;
  }
  for (const row of finance?.salaries || []) {
    if (methodFilter !== "all" && row.method !== methodFilter) continue;
    const bucket = buckets.get(monthKey(row.year, row.month));
    if (bucket) bucket.expenses += row.amount;
  }

  const trendRows = [...buckets.values()];
  const started = trendRows.filter((row) => row.started);
  const compare = started.length ? started : trendRows;
  const last = compare[compare.length - 1];
  const prev = compare[compare.length - 2];
  const monthlyTrend = trendRows.map((row) => ({
    month: row.month,
    monthKey: row.monthKey,
    monthNum: row.monthNum,
    year: row.year,
    income: row.income,
    expenses: row.expenses,
    feesCollected: row.feesCollected,
    feesPending: row.feesPending,
    net: row.income - row.expenses,
  }));

  const classCollections = [...classMap.values()]
    .map((row) => {
      const assessed = row.collected + row.outstanding;
      return {
        ...row,
        assessed,
        pct: assessed > 0 ? Math.round((row.collected / assessed) * 100) : 0,
      };
    })
    .sort((a, b) => b.assessed - a.assessed)
    .map((row, i) => ({ ...row, color: CHART_COLORS[i % CHART_COLORS.length] }));
  if (classFilter !== "all" && !classCollections.some((row) => row.className === classFilter)) {
    classCollections.push({
      className: classFilter,
      assessed: 0,
      collected: 0,
      outstanding: 0,
      pct: 0,
      color: CHART_COLORS[classCollections.length % CHART_COLORS.length],
    });
  }

  const feesCollected = monthlyTrend.reduce((n, month) => n + month.income, 0);
  const outstandingFees = monthlyTrend.reduce((n, month) => n + month.feesPending, 0);
  const totalExpensesPeriod = monthlyTrend.reduce((n, month) => n + month.expenses, 0);

  const expenseCats = new Map<string, { name: string; amount: number; count: number }>();
  let salaryTotal = 0;
  let salaryCount = 0;
  for (const row of finance?.expenses || []) {
    if (methodFilter !== "all" && row.method !== methodFilter) continue;
    const cat = expenseCats.get(row.name) || { name: row.name, amount: 0, count: 0 };
    cat.amount += row.amount;
    cat.count += row.count;
    expenseCats.set(row.name, cat);
  }
  for (const row of finance?.salaries || []) {
    if (methodFilter !== "all" && row.method !== methodFilter) continue;
    salaryTotal += row.amount;
    salaryCount += row.count;
  }
  const expenseBreakdown = [...expenseCats.values()]
    .sort((a, b) => b.amount - a.amount)
    .map((row, i) => ({
      ...row,
      color: CHART_COLORS[(i + (salaryTotal > 0 ? 1 : 0)) % CHART_COLORS.length],
    }));
  if (salaryTotal > 0) {
    expenseBreakdown.unshift({
      name: "Staff Salaries",
      amount: salaryTotal,
      count: salaryCount,
      color: FINANCE_COLORS.primary,
    });
  }

  const methodMap = new Map<string, { name: string; amount: number; count: number; color: string }>();
  for (const row of finance?.fees || []) {
    if (!row.collected) continue;
    if (classFilter !== "all" && row.className !== classFilter) continue;
    if (methodFilter !== "all" && row.method !== methodFilter) continue;
    const name = row.method || "Other";
    const current = methodMap.get(name) || {
      name,
      amount: 0,
      count: 0,
      color: METHOD_COLORS[name] || METHOD_COLORS.Other,
    };
    current.amount += row.collected;
    current.count += row.count;
    methodMap.set(name, current);
  }

  const revenueSources = months.map((month) => {
    let tuition = 0;
    let admission = 0;
    let other = 0;
    for (const row of finance?.fees || []) {
      if (row.year !== month.year || row.month !== month.month || !row.collected) continue;
      if (classFilter !== "all" && row.className !== classFilter) continue;
      if (methodFilter !== "all" && row.method !== methodFilter) continue;
      if (row.feeType === "admission") admission += row.collected;
      else if (row.feeType === "stationery") other += row.collected;
      else tuition += row.collected;
    }
    return { month: month.label, tuition, admission, examination: 0, transport: 0, other };
  });

  return {
    monthlyTrend,
    classCollections,
    feesCollected,
    outstandingFees,
    assessedFees: feesCollected + outstandingFees,
    totalExpensesPeriod,
    net: feesCollected - totalExpensesPeriod,
    revenueGrowthPct: prev ? momPct(last?.income || 0, prev.income) : 0,
    expensesGrowthPct: prev ? momPct(last?.expenses || 0, prev.expenses) : 0,
    outstandingChangePct: prev ? momPct(last?.feesPending || 0, prev.feesPending) : 0,
    expenseBreakdown,
    paymentMethods: [...methodMap.values()].sort((a, b) => b.amount - a.amount),
    revenueSources,
  };
}

const FinanceDashboard = () => {
  const { role } = useParams<{ role: Role }>();
  const r = (role || "admin") as Role;
  const navigate = useNavigate();
  const { toast } = useToast();
  const { selected, sessions, isAll, isLoading: sessionsLoading } = usePanelSession();
  const financeSession =
    !isAll && selected
      ? selected
      : sessions.find((s) => s.isActive) || sessions.find((s) => s.status === "active") || null;
  const sessionFrom = sessionYmd(financeSession?.startDate);
  const sessionTo = sessionYmd(financeSession?.endDate);

  const [periodView, setPeriodView] = useState<PeriodView>("monthly");
  const [classFilter, setClassFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState<"all" | PaymentMethod>("all");
  const [txStatusFilter, setTxStatusFilter] = useState<"all" | TxStatus>("all");
  const [txTypeFilter, setTxTypeFilter] = useState<"all" | TxType>("all");
  const [dueSearch, setDueSearch] = useState("");
  const [txPage, setTxPage] = useState(1);
  const [duePage, setDuePage] = useState(1);
  const [selectedTx, setSelectedTx] = useState<FinanceTransaction | null>(null);
  const [printingSheet, setPrintingSheet] = useState(false);
  const [sheetFrom, setSheetFrom] = useState("");
  const [sheetTo, setSheetTo] = useState("");
  const pageSize = 5;

  const rangeReady = Boolean(sheetFrom && sheetTo && sheetFrom <= sheetTo);

  const {
    data: finance,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["finance-dashboard-overview", sheetFrom, sheetTo],
    queryFn: () => fetchFinanceDashboard(sheetFrom, sheetTo),
    enabled: rangeReady,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const { data: defaultersData } = useQuery({
    queryKey: ["finance-dashboard-defaulters", sheetFrom, sheetTo],
    queryFn: () =>
      fetchFeeDefaulters({ page: 1, limit: 100, periodFrom: sheetFrom, periodTo: sheetTo }),
    enabled: rangeReady,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (sessionFrom && sessionTo) {
      setSheetFrom(sessionFrom);
      setSheetTo(sessionTo);
      setTxPage(1);
      return;
    }
    if (sessionsLoading) return;
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    setSheetFrom(toYmd(from));
    setSheetTo(toYmd(now));
    setTxPage(1);
  }, [financeSession?._id, sessionFrom, sessionTo, sessionsLoading]);

  const figures = useMemo(
    () => buildFinanceFigures(finance, sheetFrom, sheetTo, classFilter, methodFilter),
    [finance, sheetFrom, sheetTo, classFilter, methodFilter],
  );
  const {
    monthlyTrend,
    classCollections,
    feesCollected,
    outstandingFees,
    assessedFees,
    totalExpensesPeriod,
    net,
    revenueGrowthPct,
    expensesGrowthPct,
    outstandingChangePct,
    expenseBreakdown,
    paymentMethods,
    revenueSources,
  } = figures;
  const collectedGrowthPct = revenueGrowthPct;
  const rate = pctOf(feesCollected, assessedFees);
  const todayKey = toYmd(new Date()).slice(0, 7);
  const latestMonth =
    [...monthlyTrend].reverse().find((month) => month.monthKey <= todayKey) ||
    monthlyTrend[monthlyTrend.length - 1];
  const latestCollected = latestMonth?.feesCollected || 0;

  const sheetRangeError = Boolean(sheetFrom && sheetTo && sheetFrom > sheetTo);

  const printBalanceSheet = async () => {
    if (!sheetFrom || !sheetTo || sheetRangeError) return;
    const preview = openReportPreviewTab("pdf");
    setPrintingSheet(true);
    try {
      const blob = await fetchBalanceSheetPdf(sheetFrom, sheetTo, financeSession?._id);
      const mode = deliverReportBlob(
        blob,
        `Balance-Sheet_${sheetFrom}_to_${sheetTo}.pdf`,
        "pdf",
        preview,
      );
      toast({
        title: mode === "preview" ? "Balance sheet preview opened" : "Balance sheet downloaded",
        description:
          mode === "preview"
            ? `${longDate(sheetFrom)} to ${longDate(sheetTo)}. Use Print or Download from the preview window.`
            : `${longDate(sheetFrom)} to ${longDate(sheetTo)}.`,
      });
    } catch (e) {
      preview?.close();
      toast({
        title: "Could not open balance sheet",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setPrintingSheet(false);
    }
  };

  const sparklines = useMemo(
    () => ({
      revenue: monthlyTrend.map((m) => m.income),
      expenses: monthlyTrend.map((m) => m.expenses),
      outstanding: monthlyTrend.map((m) => m.feesPending),
      collected: monthlyTrend.map((m) => m.feesCollected),
    }),
    [monthlyTrend],
  );

  const expenseTotal = expenseBreakdown.reduce((n, c) => n + c.amount, 0);
  const paymentMethodTotal = paymentMethods.reduce((n, m) => n + m.amount, 0);

  const agingAnalysis = useMemo(() => {
    const labels = ["1–30 days", "31–60 days", "61–90 days", "90+ days"];
    const rows = (finance?.aging || []).filter(
      (row) => classFilter === "all" || row.className === classFilter,
    );
    return labels.map((label, i) => ({
      label,
      amount: rows.filter((row) => row.label === label).reduce((n, row) => n + row.amount, 0),
      students: rows.filter((row) => row.label === label).reduce((n, row) => n + row.students, 0),
      color: AGING_COLORS[i % AGING_COLORS.length],
    }));
  }, [finance, classFilter]);

  const paymentStatusRows = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of finance?.paymentStatus || []) {
      if (classFilter !== "all" && row.className !== classFilter) continue;
      totals.set(row.name, (totals.get(row.name) || 0) + row.students);
    }
    const base =
      (totals.get("Fully Paid") || 0) +
      (totals.get("Partially Paid") || 0) +
      (totals.get("Unpaid") || 0) || 1;
    return ["Fully Paid", "Partially Paid", "Unpaid", "Overdue"].map((name) => ({
      name,
      students: totals.get(name) || 0,
      pct: Math.round(((totals.get(name) || 0) / base) * 1000) / 10,
      color: STATUS_COLORS[name] || FINANCE_COLORS.slate,
    }));
  }, [finance, classFilter]);

  const studentPaymentStatus = useMemo(() => {
    if (txStatusFilter === "Paid") return paymentStatusRows.filter((s) => s.name === "Fully Paid");
    if (txStatusFilter === "Pending") return paymentStatusRows.filter((s) => s.name !== "Fully Paid");
    if (txStatusFilter === "Failed") return [];
    return paymentStatusRows;
  }, [paymentStatusRows, txStatusFilter]);

  const transactions = useMemo(() => {
    const fees: DashboardTx[] = (finance?.recentPayments || []).map((p) => ({
      id: `FEE-${p.id.slice(-6).toUpperCase()}`,
      date: formatShortDate(p.paidAt),
      type: "Fee Payment",
      studentOrPayee: p.studentName,
      description: `${p.feeType} · ${monthLabel(p.month, p.year)}${p.voucherNumber ? ` · ${p.voucherNumber}` : ""}`,
      method: mapPaymentMethod(p.paymentMethod),
      amount: p.amount,
      status: "Paid" as const,
      ymd: toYmdFromUnknown(p.paidAt),
      className: p.className,
    }));
    const expenses: DashboardTx[] = (finance?.recentExpenses || []).map((e) => ({
      id: `EXP-${e.id.slice(-6).toUpperCase()}`,
      date: formatShortDate(e.expenseDate),
      type: "Expense",
      studentOrPayee: e.vendor || e.title,
      description: e.categoryName || EXPENSE_CATEGORY_LABELS[e.category] || e.category,
      method: mapPaymentMethod(e.paymentMethod),
      amount: e.amount,
      status: (e.status === "paid" ? "Paid" : "Pending") as "Paid" | "Pending",
      ymd: toYmdFromUnknown(e.expenseDate),
    }));
    const salaries: DashboardTx[] = (finance?.recentSalaries || []).map((s) => ({
      id: `SAL-${s.id.slice(-6).toUpperCase()}`,
      date: formatShortDate(s.paidAt) !== "—" ? formatShortDate(s.paidAt) : `${monthLabel(s.month, s.year)} ${s.year}`,
      type: "Salary",
      studentOrPayee: s.staffName,
      description: `Salary · ${monthLabel(s.month, s.year)} ${s.year}`,
      method: mapPaymentMethod(s.paymentMethod),
      amount: s.amount,
      status: (s.status === "paid" ? "Paid" : s.status === "cancelled" ? "Failed" : "Pending") as TxStatus,
      ymd: toYmdFromUnknown(s.paidAt) || `${s.year}-${String(s.month).padStart(2, "0")}-01`,
    }));
    return [...fees, ...expenses, ...salaries].sort((a, b) => b.ymd.localeCompare(a.ymd));
  }, [finance]);

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

  const unpaidStudents = paymentStatusRows
    .filter((s) => s.name === "Partially Paid" || s.name === "Unpaid")
    .reduce((n, s) => n + s.students, 0);

  const avgMonthlyRevenue = monthlyTrend.length
    ? Math.round(monthlyTrend.reduce((n, m) => n + m.income, 0) / monthlyTrend.length)
    : 0;

  const quickInsights = useMemo(() => {
    const items: { id: string; title: string; detail: string; tone: "success" | "purple" | "warning" | "primary" }[] =
      [];
    items.push({
      id: "rev",
      title:
        revenueGrowthPct >= 0
          ? `Fee collection up ${revenueGrowthPct}%`
          : `Fee collection down ${Math.abs(revenueGrowthPct)}%`,
      detail: "vs. previous month in range",
      tone: revenueGrowthPct >= 0 ? "success" : "warning",
    });
    items.push({
      id: "dues",
      title: `${unpaidStudents} students with unpaid fees`,
      detail: formatPkr(outstandingFees, true) + " outstanding",
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
  }, [revenueGrowthPct, unpaidStudents, outstandingFees, peakMonth, net]);

  const trendData = useMemo(() => {
    if (periodView === "yearly") {
      const byYear = new Map<number, (typeof monthlyTrend)[number]>();
      for (const month of monthlyTrend) {
        const row = byYear.get(month.year) || {
          month: String(month.year),
          monthKey: String(month.year),
          monthNum: 0,
          year: month.year,
          income: 0,
          expenses: 0,
          feesCollected: 0,
          feesPending: 0,
          net: 0,
        };
        row.income += month.income;
        row.expenses += month.expenses;
        row.feesCollected += month.feesCollected;
        row.feesPending += month.feesPending;
        row.net += month.net;
        byYear.set(month.year, row);
      }
      return [...byYear.values()];
    }
    if (periodView === "quarterly") {
      const byQuarter = new Map<string, (typeof monthlyTrend)[number]>();
      for (const month of monthlyTrend) {
        const quarter = Math.ceil(month.monthNum / 3);
        const key = `${month.year}-Q${quarter}`;
        const row = byQuarter.get(key) || {
          month: `Q${quarter} '${String(month.year).slice(2)}`,
          monthKey: key,
          monthNum: quarter,
          year: month.year,
          income: 0,
          expenses: 0,
          feesCollected: 0,
          feesPending: 0,
          net: 0,
        };
        row.income += month.income;
        row.expenses += month.expenses;
        row.feesCollected += month.feesCollected;
        row.feesPending += month.feesPending;
        row.net += month.net;
        byQuarter.set(key, row);
      }
      return [...byQuarter.values()];
    }
    return monthlyTrend;
  }, [periodView, monthlyTrend]);

  const classRows = useMemo(() => {
    if (classFilter === "all") return classCollections;
    return classCollections.filter((c) => c.className === classFilter);
  }, [classFilter, classCollections]);

  const filteredTx = useMemo(() => {
    return transactions.filter((t) => {
      if (sheetFrom && sheetTo && sheetFrom <= sheetTo && t.ymd && (t.ymd < sheetFrom || t.ymd > sheetTo)) {
        return false;
      }
      if (classFilter !== "all" && t.type === "Fee Payment" && t.className !== classFilter) return false;
      if (methodFilter !== "all" && t.method !== methodFilter) return false;
      if (txStatusFilter !== "all" && t.status !== txStatusFilter) return false;
      if (txTypeFilter !== "all" && t.type !== txTypeFilter) return false;
      return true;
    });
  }, [transactions, methodFilter, txStatusFilter, txTypeFilter, sheetFrom, sheetTo, classFilter]);

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
    setClassFilter("all");
    setMethodFilter("all");
    setTxStatusFilter("all");
    setTxTypeFilter("all");
    setDueSearch("");
    setTxPage(1);
    setDuePage(1);
    if (sessionFrom && sessionTo) {
      setSheetFrom(sessionFrom);
      setSheetTo(sessionTo);
    }
  };

  const feesHref = moduleHref(r, "fees");

  const collectionDonut = [
    { name: "Collected", value: feesCollected, color: FINANCE_COLORS.success },
    { name: "Pending", value: outstandingFees, color: FINANCE_COLORS.softBlue },
  ];

  if (sheetRangeError) {
    return (
      <div className="min-h-[50vh] grid place-items-center px-4" style={{ backgroundColor: FINANCE_COLORS.pageBg }}>
        <div className={cn(cardClass, "p-6 max-w-md text-center space-y-3")}>
          <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
          <p className="font-semibold text-[#10264D]">Start date must be on or before the end date</p>
          <Button type="button" variant="outline" onClick={clearFilters}>
            Clear
          </Button>
        </div>
      </div>
    );
  }

  if (!finance || isLoading) {
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
          <div className="flex w-full flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <Filter className="hidden h-4 w-4 shrink-0 text-slate-400 sm:block" />
              <DateRangePickerField
                className="h-8 text-xs"
                from={sheetFrom}
                to={sheetTo}
                onChange={(nextFrom, nextTo) => {
                  setSheetFrom(nextFrom);
                  setSheetTo(nextTo);
                  setTxPage(1);
                }}
              />
              <Select
                value={classFilter}
                onValueChange={(v) => {
                  setClassFilter(v);
                  setDuePage(1);
                }}
              >
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue placeholder="Class" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
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
                  <SelectItem value="all">All Methods</SelectItem>
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
                <SelectTrigger className="h-8 w-[130px] text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="Paid">Paid</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                className="h-8 text-xs"
                disabled={printingSheet || !sheetFrom || !sheetTo || sheetRangeError}
                onClick={() => void printBalanceSheet()}
              >
                {printingSheet ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Printer className="mr-1 h-3.5 w-3.5" />
                )}
                Print Balance Sheet
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => refetch()}>
                Refresh
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={clearFilters}>
                <X className="mr-1 h-3.5 w-3.5" />
                Clear
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 2xl:grid-cols-4">
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
            value={formatPkr(totalExpensesPeriod)}
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
            value={formatPkr(latestCollected)}
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
                    {pctOf(d.amount, paymentMethodTotal)}%
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
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="Fee Payment">Fee Payment</SelectItem>
                  <SelectItem value="Expense">Expense</SelectItem>
                  <SelectItem value="Salary">Salary</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <table className="w-full table-fixed text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100">
                  <th className="w-[22%] px-3 py-2.5 font-medium">Date</th>
                  <th className="w-[28%] px-2 py-2.5 font-medium">Type</th>
                  <th className="w-[24%] px-2 py-2.5 font-medium text-right">Amount</th>
                  <th className="w-[18%] px-2 py-2.5 font-medium">Status</th>
                  <th className="w-[8%] px-2 py-2.5 font-medium"> </th>
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
                    <td className="px-3 py-2.5 text-slate-600">{t.date}</td>
                    <td className="px-2 py-2.5 font-medium text-[#10264D]">{t.type}</td>
                    <td className="px-2 py-2.5 text-right font-semibold text-[#10264D]">
                      {formatPkr(t.amount)}
                    </td>
                    <td className="px-2 py-2.5">{statusBadge(t.status)}</td>
                    <td className="px-2 py-2.5">
                      <span className="inline-flex text-slate-400" aria-hidden>
                        <Eye className="h-3.5 w-3.5" />
                      </span>
                    </td>
                  </tr>
                ))}
                {!txSlice.length && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No transactions match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <ListPagination
              compact
              page={txPage}
              totalPages={txPages}
              total={filteredTx.length}
              pageSize={pageSize}
              onPageChange={setTxPage}
              noun="transactions"
            />
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
            <div className="border-t border-slate-100 px-4 py-2.5">
              <p className="text-xs font-semibold text-[#EF4444]">Total Pending {formatPkr(pendingTotal)}</p>
            </div>
            <ListPagination
              compact
              page={duePage}
              totalPages={duePages}
              total={filteredDues.length}
              pageSize={pageSize}
              onPageChange={setDuePage}
              noun="dues"
              className="border-t-0"
            />
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
