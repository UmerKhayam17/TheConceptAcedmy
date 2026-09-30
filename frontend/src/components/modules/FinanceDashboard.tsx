import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
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
  AGING_ANALYSIS,
  CLASS_COLLECTIONS,
  EXPENSE_BREAKDOWN,
  FINANCE_COLORS,
  FINANCE_SPARKLINES,
  FINANCE_TOTALS,
  MONTHLY_TREND,
  PAYMENT_METHODS,
  PENDING_DUES,
  QUICK_INSIGHTS,
  RECENT_TRANSACTIONS,
  REVENUE_SOURCES,
  STUDENT_PAYMENT_STATUS,
  type FinanceTransaction,
  type PaymentMethod,
  type TxStatus,
  type TxType,
  averageMonthlyRevenue,
  classesWithHighestDues,
  collectionRate,
  downloadCsv,
  formatPkr,
  formatPkrAxis,
  highestExpenseCategory,
  highestRevenueMonth,
  netBalance,
  pctOf,
  transactionsThisMonth,
  unpaidStudentCount,
} from "@/lib/financeDashboardData";

type PeriodView = "monthly" | "quarterly" | "yearly";

const cardClass =
  "rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(16,38,77,0.06)]";

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

const FinanceDashboard = () => {
  const { role } = useParams<{ role: Role }>();
  const r = (role || "admin") as Role;

  const [periodView, setPeriodView] = useState<PeriodView>("monthly");
  const [academicYear, setAcademicYear] = useState("2024-25");
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

  const trendData = useMemo(() => {
    if (periodView === "yearly") {
      const income = MONTHLY_TREND.reduce((n, m) => n + m.income, 0);
      const expenses = MONTHLY_TREND.reduce((n, m) => n + m.expenses, 0);
      return [{ month: academicYear, income, expenses, feesCollected: FINANCE_TOTALS.feesCollected, feesPending: FINANCE_TOTALS.outstandingFees, net: income - expenses }];
    }
    if (periodView === "quarterly") {
      const qs = [
        { label: "Q1", months: MONTHLY_TREND.slice(0, 3) },
        { label: "Q2", months: MONTHLY_TREND.slice(3, 6) },
        { label: "Q3", months: MONTHLY_TREND.slice(6, 9) },
        { label: "Q4", months: MONTHLY_TREND.slice(9, 12) },
      ];
      return qs.map((q) => ({
        month: q.label,
        income: q.months.reduce((n, m) => n + m.income, 0),
        expenses: q.months.reduce((n, m) => n + m.expenses, 0),
        feesCollected: q.months.reduce((n, m) => n + m.feesCollected, 0),
        feesPending: q.months.reduce((n, m) => n + m.feesPending, 0),
        net: q.months.reduce((n, m) => n + m.net, 0),
      }));
    }
    if (monthFilter !== "all") {
      return MONTHLY_TREND.filter((m) => m.month === monthFilter);
    }
    return MONTHLY_TREND;
  }, [periodView, academicYear, monthFilter]);

  const classRows = useMemo(() => {
    if (classFilter === "all") return CLASS_COLLECTIONS;
    return CLASS_COLLECTIONS.filter((c) => c.className === classFilter);
  }, [classFilter]);

  const filteredTx = useMemo(() => {
    const q = txSearch.trim().toLowerCase();
    return RECENT_TRANSACTIONS.filter((t) => {
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
  }, [txSearch, methodFilter, txStatusFilter, txTypeFilter]);

  const filteredDues = useMemo(() => {
    const q = dueSearch.trim().toLowerCase();
    return PENDING_DUES.filter((d) => {
      if (classFilter !== "all" && d.className !== classFilter) return false;
      if (!q) return true;
      return (
        d.studentName.toLowerCase().includes(q) ||
        d.studentId.toLowerCase().includes(q) ||
        d.className.toLowerCase().includes(q)
      );
    }).sort((a, b) => b.dueAmount - a.dueAmount);
  }, [dueSearch, classFilter]);

  const txPages = Math.max(1, Math.ceil(filteredTx.length / pageSize));
  const duePages = Math.max(1, Math.ceil(filteredDues.length / pageSize));
  const txSlice = filteredTx.slice((txPage - 1) * pageSize, txPage * pageSize);
  const dueSlice = filteredDues.slice((duePage - 1) * pageSize, duePage * pageSize);
  const pendingTotal = filteredDues.reduce((n, d) => n + d.dueAmount, 0);

  const rate = collectionRate();
  const net = netBalance();
  const peakMonth = highestRevenueMonth();
  const topExpense = highestExpenseCategory();
  const topDuesClasses = classesWithHighestDues(3);

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
    { name: "Collected", value: FINANCE_TOTALS.feesCollected, color: FINANCE_COLORS.success },
    { name: "Pending", value: FINANCE_TOTALS.outstandingFees, color: FINANCE_COLORS.softBlue },
  ];

  return (
    <div className="min-h-full" style={{ backgroundColor: FINANCE_COLORS.pageBg }}>
      <div className="px-4 sm:px-6 lg:px-8 py-5 space-y-5">
        {/* Filters */}
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
            <Select value={academicYear} onValueChange={setAcademicYear}>
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue placeholder="Academic year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2024-25">2024–25</SelectItem>
                <SelectItem value="2023-24">2023–24</SelectItem>
              </SelectContent>
            </Select>
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
                {MONTHLY_TREND.map((m) => (
                  <SelectItem key={m.month} value={m.month}>
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
                {CLASS_COLLECTIONS.map((c) => (
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
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.name} value={m.name}>
                    {m.name}
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
              className="h-8 border-amber-200 bg-amber-50 text-amber-800 font-normal text-xs"
            >
              Demo data
            </Badge>
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={clearFilters}>
              <X className="h-3.5 w-3.5 mr-1" />
              Clear
            </Button>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <KpiCard
            label="Total Revenue"
            value={formatPkr(FINANCE_TOTALS.totalRevenue)}
            changePct={FINANCE_TOTALS.revenueGrowthPct}
            icon={Banknote}
            iconBg="rgba(22,163,106,0.12)"
            iconColor={FINANCE_COLORS.success}
            sparkData={FINANCE_SPARKLINES.revenue}
            sparkColor={FINANCE_COLORS.success}
          />
          <KpiCard
            label="Total Expenses"
            value={formatPkr(FINANCE_TOTALS.totalExpenses)}
            changePct={FINANCE_TOTALS.expensesGrowthPct}
            icon={CreditCard}
            iconBg="rgba(36,120,232,0.12)"
            iconColor={FINANCE_COLORS.primary}
            sparkData={FINANCE_SPARKLINES.expenses}
            sparkColor={FINANCE_COLORS.primary}
          />
          <KpiCard
            label="Outstanding Dues"
            value={formatPkr(FINANCE_TOTALS.outstandingFees)}
            changePct={FINANCE_TOTALS.outstandingChangePct}
            icon={Wallet}
            iconBg="rgba(139,92,246,0.12)"
            iconColor={FINANCE_COLORS.purple}
            sparkData={FINANCE_SPARKLINES.outstanding}
            sparkColor={FINANCE_COLORS.purple}
          />
          <KpiCard
            label="Collected Fees"
            value={formatPkr(FINANCE_TOTALS.feesCollected)}
            changePct={FINANCE_TOTALS.collectedGrowthPct}
            icon={Receipt}
            iconBg="rgba(13,148,136,0.12)"
            iconColor={FINANCE_COLORS.teal}
            sparkData={FINANCE_SPARKLINES.collected}
            sparkColor={FINANCE_COLORS.teal}
          />
        </div>

        {/* Main analytics row — matches reference */}
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
                    {formatPkr(d.value)} · {pctOf(d.value, FINANCE_TOTALS.assessedFees)}%
                  </span>
                </div>
              ))}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex justify-between text-slate-500 mb-1.5">
                  <span>Total Fees</span>
                  <span className="font-semibold text-[#10264D]">{formatPkr(FINANCE_TOTALS.assessedFees)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${rate}%`, backgroundColor: FINANCE_COLORS.success }}
                  />
                </div>
              </div>
            </div>
          </ChartCard>

          <ChartCard title="Expense Breakdown" className="xl:col-span-3 min-h-[320px]">
            <div className="h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={EXPENSE_BREAKDOWN}
                    dataKey="amount"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={75}
                    paddingAngle={1}
                    strokeWidth={0}
                  >
                    {EXPENSE_BREAKDOWN.map((d) => (
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
                              {formatPkrAxis(FINANCE_TOTALS.totalExpenses)}
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
            </div>
            <div className="space-y-1.5 max-h-[110px] overflow-y-auto text-xs pr-1">
              {EXPENSE_BREAKDOWN.map((d) => (
                <div key={d.name} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-slate-600 min-w-0 truncate">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: d.color }} />
                    {d.name}
                  </span>
                  <span className="shrink-0 font-medium text-[#10264D]">
                    {pctOf(d.amount, FINANCE_TOTALS.totalExpenses)}%
                  </span>
                </div>
              ))}
            </div>
          </ChartCard>
        </div>

        {/* Second chart row — matches reference */}
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
                  <Bar dataKey="feesCollected" name="Collected" stackId="a" fill={FINANCE_COLORS.success} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="feesPending" name="Pending" stackId="a" fill={FINANCE_COLORS.softBlue} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Payments by Method" className="min-h-[300px]">
            <div className="h-[160px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={PAYMENT_METHODS}
                    dataKey="amount"
                    nameKey="name"
                    outerRadius={70}
                    strokeWidth={0}
                  >
                    {PAYMENT_METHODS.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatPkr(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1.5 text-xs">
              {PAYMENT_METHODS.map((d) => (
                <div key={d.name} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-slate-600">
                    <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                    {d.name}
                  </span>
                  <span className="font-medium text-[#10264D]">
                    {pctOf(d.amount, FINANCE_TOTALS.feesCollected)}%
                    {d.count != null && (
                      <span className="text-slate-400 font-normal"> · {d.count}</span>
                    )}
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
                      style={{ width: `${c.pct}%`, backgroundColor: c.color }}
                    />
                  </div>
                </div>
              ))}
              {!classRows.length && (
                <p className="text-sm text-slate-500 text-center py-8">No classes match the filter.</p>
              )}
            </div>
          </ChartCard>
        </div>

        {/* Extended analytics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
          <ChartCard title="Revenue Sources" className="xl:col-span-2 min-h-[280px]">
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={REVENUE_SOURCES} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#64748B", fontSize: 11 }} />
                  <YAxis tickLine={false} axisLine={false} width={40} tickFormatter={formatPkrAxis} tick={{ fill: "#64748B", fontSize: 11 }} />
                  <Tooltip content={<MoneyTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="tuition" name="Tuition" stackId="1" stroke="#16A36A" fill="#16A36A" fillOpacity={0.7} />
                  <Area type="monotone" dataKey="admission" name="Admission" stackId="1" stroke="#2478E8" fill="#2478E8" fillOpacity={0.7} />
                  <Area type="monotone" dataKey="examination" name="Exam" stackId="1" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.7} />
                  <Area type="monotone" dataKey="transport" name="Transport" stackId="1" stroke="#0D9488" fill="#0D9488" fillOpacity={0.7} />
                  <Area type="monotone" dataKey="other" name="Other" stackId="1" stroke="#94A3B8" fill="#94A3B8" fillOpacity={0.7} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Outstanding Dues Aging" className="min-h-[280px]">
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={AGING_ANALYSIS} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#64748B", fontSize: 10 }} />
                  <YAxis tickLine={false} axisLine={false} width={40} tickFormatter={formatPkrAxis} tick={{ fill: "#64748B", fontSize: 11 }} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.[0]) return null;
                      const row = payload[0].payload as (typeof AGING_ANALYSIS)[0];
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
                    {AGING_ANALYSIS.map((d) => (
                      <Cell key={d.label} fill={d.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Financial Performance" className="min-h-[280px]">
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={MONTHLY_TREND} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#64748B", fontSize: 11 }} />
                  <YAxis tickLine={false} axisLine={false} width={40} tickFormatter={formatPkrAxis} tick={{ fill: "#64748B", fontSize: 11 }} />
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

        {/* Student payment status + analytics metrics */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <ChartCard title="Student Payment Status" className="xl:col-span-4">
            <div className="space-y-3">
              <div className="flex h-3 rounded-full overflow-hidden">
                {STUDENT_PAYMENT_STATUS.map((s) => (
                  <div key={s.name} style={{ width: `${s.pct}%`, backgroundColor: s.color }} title={`${s.name}: ${s.pct}%`} />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {STUDENT_PAYMENT_STATUS.map((s) => (
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
              </div>
            </div>
          </ChartCard>

          <div className="xl:col-span-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {[
              { label: "Avg. collection rate", value: `${rate}%`, hint: "Collected ÷ assessed" },
              { label: "Outstanding balance", value: formatPkr(FINANCE_TOTALS.outstandingFees, true), hint: "All unpaid dues" },
              { label: "Transactions (month)", value: String(transactionsThisMonth()), hint: "Fee + expense entries" },
              { label: "Avg. monthly revenue", value: formatPkr(averageMonthlyRevenue(), true), hint: "12-month average" },
              { label: "Highest revenue month", value: peakMonth.month, hint: formatPkr(peakMonth.income, true) },
              { label: "Highest expense", value: topExpense.name, hint: formatPkr(topExpense.amount, true) },
              { label: "Students unpaid", value: String(unpaidStudentCount()), hint: "Partial + unpaid + overdue" },
              { label: "Net operating balance", value: formatPkr(net, true), hint: "Revenue − expenses" },
              {
                label: "MoM revenue change",
                value: `+${FINANCE_TOTALS.revenueGrowthPct}%`,
                hint: "vs. last month",
              },
              {
                label: "MoM expense change",
                value: `+${FINANCE_TOTALS.expensesGrowthPct}%`,
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

        {/* Tables + insights — matches reference bottom row */}
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
                  <SelectItem value="Refund">Refund</SelectItem>
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
                    <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50/80">
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
                        <button
                          type="button"
                          className="text-slate-400 hover:text-[#2478E8]"
                          onClick={() => setSelectedTx(t)}
                          aria-label={`View ${t.id}`}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
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
                    <tr key={d.studentId} className="border-b border-slate-50 hover:bg-slate-50/80">
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
                        <Link
                          to={feesHref}
                          className="text-[11px] font-medium text-[#2478E8] hover:underline whitespace-nowrap"
                        >
                          Record Payment
                        </Link>
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
              <p className="text-xs font-semibold text-[#EF4444]">
                Total Pending {formatPkr(pendingTotal)}
              </p>
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
              {QUICK_INSIGHTS.map((insight) => {
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
                      data={FINANCE_SPARKLINES.revenue.slice(0, 8)}
                      color={tone.color}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Transaction detail drawer-lite */}
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

function BarSpark({ className, style }: { className?: string; style?: CSSProperties }) {
  return <FileBarChart2 className={className} style={style} />;
}

export default FinanceDashboard;
