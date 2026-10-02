/**
 * Shared finance dashboard types, colors, and formatting helpers.
 * Live figures come from `/dashboard/overview` via FinanceDashboard.
 */

export const FINANCE_CURRENCY = "PKR";

export const FINANCE_COLORS = {
  navy: "#10264D",
  primary: "#2478E8",
  pageBg: "#F4F8FC",
  card: "#FFFFFF",
  success: "#16A36A",
  warning: "#F59E0B",
  danger: "#EF4444",
  purple: "#8B5CF6",
  teal: "#0D9488",
  softBlue: "#93C5FD",
  slate: "#64748B",
  muted: "#94A3B8",
} as const;

export type TxStatus = "Paid" | "Pending" | "Failed";
export type TxType = "Fee Payment" | "Expense" | "Refund" | "Salary";
export type PaymentMethod = "Cash" | "Bank Transfer" | "Mobile Wallet" | "Cheque" | "Other";

export type FinanceTransaction = {
  id: string;
  date: string;
  type: TxType;
  studentOrPayee: string;
  description: string;
  method: PaymentMethod;
  amount: number;
  status: TxStatus;
};

export type PendingDue = {
  studentId: string;
  studentName: string;
  className: string;
  dueDate: string;
  dueAmount: number;
  daysOverdue: number;
  status: "Overdue" | "Due Soon" | "Pending";
};

export type MonthlyPoint = {
  month: string;
  income: number;
  expenses: number;
  feesCollected: number;
  feesPending: number;
  net: number;
};

export type NamedAmount = { name: string; amount: number; color: string; count?: number };

export type ClassCollection = {
  className: string;
  assessed: number;
  collected: number;
  outstanding: number;
  pct: number;
  color: string;
};

export type RevenueSourceMonth = {
  month: string;
  tuition: number;
  admission: number;
  examination: number;
  transport: number;
  other: number;
};

export type AgingBucket = {
  label: string;
  amount: number;
  students: number;
  color: string;
};

export type PaymentStatusSlice = {
  name: string;
  students: number;
  pct: number;
  color: string;
};

/** Core totals — keep charts/KPIs in sync with these figures. */
export const FINANCE_TOTALS = {
  assessedFees: 2_450_000,
  feesCollected: 1_930_000,
  outstandingFees: 520_000,
  totalExpenses: 860_000,
  /** Revenue treated as assessed / billed fees for the demo period */
  totalRevenue: 2_450_000,
  revenueGrowthPct: 12,
  expensesGrowthPct: 8,
  outstandingChangePct: -5,
  collectedGrowthPct: 15,
} as const;

export const FINANCE_SPARKLINES = {
  revenue: [180, 210, 195, 240, 260, 280, 255, 290, 310, 300, 330, 350],
  expenses: [90, 95, 100, 110, 105, 120, 115, 130, 125, 140, 135, 145],
  outstanding: [70, 68, 65, 62, 60, 58, 55, 54, 52, 50, 48, 45],
  collected: [140, 160, 155, 190, 210, 230, 220, 250, 270, 265, 290, 310],
} as const;

/** Jan–Dec monthly series (Jan–Jun aligned with reference mockup). */
export const MONTHLY_TREND: MonthlyPoint[] = [
  { month: "Jan", income: 280_000, expenses: 120_000, feesCollected: 220_000, feesPending: 60_000, net: 160_000 },
  { month: "Feb", income: 300_000, expenses: 135_000, feesCollected: 240_000, feesPending: 55_000, net: 165_000 },
  { month: "Mar", income: 320_000, expenses: 140_000, feesCollected: 260_000, feesPending: 50_000, net: 180_000 },
  { month: "Apr", income: 340_000, expenses: 155_000, feesCollected: 280_000, feesPending: 48_000, net: 185_000 },
  { month: "May", income: 360_000, expenses: 180_000, feesCollected: 300_000, feesPending: 45_000, net: 180_000 },
  { month: "Jun", income: 380_000, expenses: 210_000, feesCollected: 320_000, feesPending: 42_000, net: 170_000 },
  { month: "Jul", income: 350_000, expenses: 165_000, feesCollected: 290_000, feesPending: 50_000, net: 185_000 },
  { month: "Aug", income: 370_000, expenses: 170_000, feesCollected: 305_000, feesPending: 48_000, net: 200_000 },
  { month: "Sep", income: 390_000, expenses: 175_000, feesCollected: 325_000, feesPending: 46_000, net: 215_000 },
  { month: "Oct", income: 400_000, expenses: 185_000, feesCollected: 335_000, feesPending: 44_000, net: 215_000 },
  { month: "Nov", income: 410_000, expenses: 190_000, feesCollected: 345_000, feesPending: 42_000, net: 220_000 },
  { month: "Dec", income: 420_000, expenses: 195_000, feesCollected: 355_000, feesPending: 40_000, net: 225_000 },
];

/** Expense categories sum to totalExpenses (860,000). */
export const EXPENSE_BREAKDOWN: NamedAmount[] = [
  { name: "Staff Salaries", amount: 304_440, color: "#2478E8" },
  { name: "Utilities", amount: 140_180, color: "#16A36A" },
  { name: "Maintenance", amount: 110_080, color: "#8B5CF6" },
  { name: "Stationery", amount: 90_300, color: "#F59E0B" },
  { name: "Transport", amount: 74_820, color: "#0D9488" },
  { name: "Others", amount: 140_180, color: "#94A3B8" },
];

/** Payment methods — amounts proportional to feesCollected. */
export const PAYMENT_METHODS: NamedAmount[] = [
  { name: "Cash", amount: 822_180, color: "#16A36A", count: 186 },
  { name: "Bank Transfer", amount: 553_910, color: "#2478E8", count: 98 },
  { name: "Mobile Wallet", amount: 355_120, color: "#8B5CF6", count: 142 },
  { name: "Cheque", amount: 150_540, color: "#F59E0B", count: 24 },
  { name: "Others", amount: 48_250, color: "#94A3B8", count: 11 },
];

export const CLASS_COLLECTIONS: ClassCollection[] = [
  { className: "Grade 1", assessed: 320_000, collected: 320_000, outstanding: 0, pct: 100, color: "#16A36A" },
  { className: "Grade 2", assessed: 310_000, collected: 285_200, outstanding: 24_800, pct: 92, color: "#2478E8" },
  { className: "Grade 3", assessed: 300_000, collected: 250_000, outstanding: 50_000, pct: 83, color: "#0D9488" },
  { className: "Grade 4", assessed: 290_000, collected: 230_000, outstanding: 60_000, pct: 79, color: "#8B5CF6" },
  { className: "Grade 5", assessed: 280_000, collected: 200_000, outstanding: 80_000, pct: 71, color: "#F59E0B" },
  { className: "Grade 6", assessed: 250_000, collected: 180_000, outstanding: 70_000, pct: 72, color: "#EF4444" },
  { className: "Grade 7", assessed: 230_000, collected: 160_000, outstanding: 70_000, pct: 70, color: "#64748B" },
  { className: "Grade 8", assessed: 200_000, collected: 140_000, outstanding: 60_000, pct: 70, color: "#0EA5E9" },
  { className: "Grade 9", assessed: 160_000, collected: 99_800, outstanding: 60_200, pct: 62, color: "#A855F7" },
  { className: "Grade 10", assessed: 110_000, collected: 65_000, outstanding: 45_000, pct: 59, color: "#F97316" },
];

export const REVENUE_SOURCES: RevenueSourceMonth[] = MONTHLY_TREND.map((m, i) => ({
  month: m.month,
  tuition: Math.round(m.feesCollected * 0.72),
  admission: Math.round(m.feesCollected * (i < 3 ? 0.14 : 0.06)),
  examination: Math.round(m.feesCollected * (i === 5 || i === 11 ? 0.12 : 0.05)),
  transport: Math.round(m.feesCollected * 0.08),
  other: Math.round(m.feesCollected * 0.05),
}));

export const AGING_ANALYSIS: AgingBucket[] = [
  { label: "1–30 days", amount: 180_000, students: 42, color: "#F59E0B" },
  { label: "31–60 days", amount: 145_000, students: 28, color: "#F97316" },
  { label: "61–90 days", amount: 110_000, students: 18, color: "#EF4444" },
  { label: "90+ days", amount: 85_000, students: 12, color: "#B91C1C" },
];

export const STUDENT_PAYMENT_STATUS: PaymentStatusSlice[] = [
  { name: "Fully Paid", students: 412, pct: 68.7, color: "#16A36A" },
  { name: "Partially Paid", students: 98, pct: 16.3, color: "#2478E8" },
  { name: "Unpaid", students: 54, pct: 9.0, color: "#F59E0B" },
  { name: "Overdue", students: 36, pct: 6.0, color: "#EF4444" },
];

export const RECENT_TRANSACTIONS: FinanceTransaction[] = [
  {
    id: "TXN-2401",
    date: "2025-06-25",
    type: "Fee Payment",
    studentOrPayee: "Ali Raza",
    description: "Grade 5 — Tuition (Jun)",
    method: "Cash",
    amount: 25_000,
    status: "Paid",
  },
  {
    id: "TXN-2402",
    date: "2025-06-24",
    type: "Expense",
    studentOrPayee: "LESCO",
    description: "Electricity Bill — Main Campus",
    method: "Bank Transfer",
    amount: 12_500,
    status: "Paid",
  },
  {
    id: "TXN-2403",
    date: "2025-06-24",
    type: "Fee Payment",
    studentOrPayee: "Ayesha Khan",
    description: "Grade 3 — Tuition (Jun)",
    method: "Mobile Wallet",
    amount: 18_000,
    status: "Paid",
  },
  {
    id: "TXN-2404",
    date: "2025-06-23",
    type: "Fee Payment",
    studentOrPayee: "Hassan Ali",
    description: "Grade 7 — Tuition + Transport",
    method: "Bank Transfer",
    amount: 32_000,
    status: "Pending",
  },
  {
    id: "TXN-2405",
    date: "2025-06-22",
    type: "Expense",
    studentOrPayee: "Office Supplies Co.",
    description: "Stationery restock",
    method: "Cash",
    amount: 8_750,
    status: "Paid",
  },
  {
    id: "TXN-2406",
    date: "2025-06-21",
    type: "Fee Payment",
    studentOrPayee: "Fatima Noor",
    description: "Grade 2 — Tuition (Jun)",
    method: "Cheque",
    amount: 22_000,
    status: "Paid",
  },
  {
    id: "TXN-2407",
    date: "2025-06-20",
    type: "Salary",
    studentOrPayee: "Teaching Staff",
    description: "June salary disbursement",
    method: "Bank Transfer",
    amount: 285_000,
    status: "Paid",
  },
  {
    id: "TXN-2408",
    date: "2025-06-19",
    type: "Fee Payment",
    studentOrPayee: "Bilal Ahmed",
    description: "Grade 8 — Outstanding dues",
    method: "Cash",
    amount: 15_500,
    status: "Pending",
  },
];

export const PENDING_DUES: PendingDue[] = [
  {
    studentId: "STU-1024",
    studentName: "Omar Farooq",
    className: "Grade 5",
    dueDate: "2025-05-15",
    dueAmount: 45_000,
    daysOverdue: 41,
    status: "Overdue",
  },
  {
    studentId: "STU-1088",
    studentName: "Sana Malik",
    className: "Grade 3",
    dueDate: "2025-06-01",
    dueAmount: 28_000,
    daysOverdue: 24,
    status: "Overdue",
  },
  {
    studentId: "STU-1112",
    studentName: "Zainab Ali",
    className: "Grade 8",
    dueDate: "2025-04-20",
    dueAmount: 62_000,
    daysOverdue: 66,
    status: "Overdue",
  },
  {
    studentId: "STU-1150",
    studentName: "Usman Tariq",
    className: "Grade 6",
    dueDate: "2025-06-10",
    dueAmount: 35_000,
    daysOverdue: 15,
    status: "Overdue",
  },
  {
    studentId: "STU-1199",
    studentName: "Hira Shah",
    className: "Grade 4",
    dueDate: "2025-06-28",
    dueAmount: 18_500,
    daysOverdue: 0,
    status: "Due Soon",
  },
  {
    studentId: "STU-1210",
    studentName: "Ahmed Raza",
    className: "Grade 10",
    dueDate: "2025-03-30",
    dueAmount: 48_000,
    daysOverdue: 87,
    status: "Overdue",
  },
];

export const QUICK_INSIGHTS = [
  {
    id: "rev-up",
    title: "Revenue is up by 12%",
    detail: "vs. last month",
    tone: "success" as const,
  },
  {
    id: "dues-down",
    title: "Outstanding dues reduced by 5%",
    detail: "Collection improving",
    tone: "purple" as const,
  },
  {
    id: "peak-jun",
    title: "Highest collection in June",
    detail: "PKR 520,000",
    tone: "primary" as const,
  },
  {
    id: "maint-up",
    title: "Maintenance costs increased",
    detail: "+8% this month",
    tone: "warning" as const,
  },
];

export function formatPkr(amount: number, compact = false): string {
  if (compact) {
    if (Math.abs(amount) >= 1_000_000) return `PKR ${(amount / 1_000_000).toFixed(2)}M`;
    if (Math.abs(amount) >= 1_000) return `PKR ${Math.round(amount / 1_000)}K`;
  }
  return `PKR ${Math.round(amount).toLocaleString("en-PK")}`;
}

export function formatPkrAxis(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

export function pctOf(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

export function collectionRate(): number {
  return pctOf(FINANCE_TOTALS.feesCollected, FINANCE_TOTALS.assessedFees);
}

export function netBalance(): number {
  return FINANCE_TOTALS.totalRevenue - FINANCE_TOTALS.totalExpenses;
}

export function highestRevenueMonth(): MonthlyPoint {
  return MONTHLY_TREND.reduce((a, b) => (b.income > a.income ? b : a));
}

export function highestExpenseCategory(): NamedAmount {
  return EXPENSE_BREAKDOWN.reduce((a, b) => (b.amount > a.amount ? b : a));
}

export function classesWithHighestDues(limit = 3): ClassCollection[] {
  return [...CLASS_COLLECTIONS].sort((a, b) => b.outstanding - a.outstanding).slice(0, limit);
}

export function unpaidStudentCount(): number {
  return STUDENT_PAYMENT_STATUS.filter((s) => s.name !== "Fully Paid").reduce((n, s) => n + s.students, 0);
}

export function averageMonthlyRevenue(): number {
  const sum = MONTHLY_TREND.reduce((n, m) => n + m.income, 0);
  return Math.round(sum / MONTHLY_TREND.length);
}

export function transactionsThisMonth(): number {
  return RECENT_TRANSACTIONS.length + 214;
}

export function downloadCsv(filename: string, rows: Record<string, string | number>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h] ?? "")).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
