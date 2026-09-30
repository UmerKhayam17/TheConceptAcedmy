import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  Clock3,
  Download,
  FileText,
  Loader2,
  Printer,
  Receipt,
  Search,
  Wallet,
  X,
} from "lucide-react";
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DefaulterListDownload } from "./DefaulterListDownload";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { ModuleActionCaps } from "@/lib/permissions";
import {
  fetchAcademyClasses,
  fetchAcademyFeeSummary,
  fetchAcademyFees,
  fetchAcademyStudents,
  fetchStudentFeeHistory,
  exportFeeDefaultersMonthWise,
  type AcademyFeeSummary,
  type DefaulterReportFormat,
  generateMonthlyFees,
  payAcademyFees,
  printFeeChallan,
  printFeeReceipt,
  type AcademyFeeRecord,
  type AcademyStudentRoutes,
  type FeeReceiptSize,
} from "@/lib/studentManagementApi";
import { academyStudentRoutes } from "@/lib/studentManagementMenus";
import { matchesPanelSearch } from "@/lib/panelSearch";
import { useSessionScope } from "@/components/modules/timetable/SessionBar";
import { formatPkr, MONTH_NAMES } from "./studentDisplayUtils";
import { cn } from "@/lib/utils";

const feeFilterLabelClass = "mb-1.5 block text-xs font-semibold text-[#10264D]";
const feeFilterSelectClass =
  "h-10 w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-white py-2 text-sm font-medium text-[#10264D] shadow-none outline-none transition-colors hover:border-slate-300 focus:border-blue-300 focus:ring-2 focus:ring-blue-100";

function FeeFilterField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <label className={feeFilterLabelClass}>{label}</label>
      {children}
    </div>
  );
}

function FeeFilterSelect({
  value,
  onChange,
  children,
  leadingIcon,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  leadingIcon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      {leadingIcon ? (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          {leadingIcon}
        </span>
      ) : null}
      <select
        className={cn(
          feeFilterSelectClass,
          leadingIcon ? "pl-9 pr-9" : "pl-3 pr-9",
        )}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

function studentFromRecord(rec: AcademyFeeRecord) {
  const s = rec.studentId;
  if (typeof s === "object" && s) return s;
  return null;
}

function studentName(rec: AcademyFeeRecord) {
  return studentFromRecord(rec)?.studentName ?? "—";
}

function studentCode(rec: AcademyFeeRecord) {
  return studentFromRecord(rec)?.studentId ?? "";
}

function studentMongoId(rec: AcademyFeeRecord) {
  const s = studentFromRecord(rec);
  return s?._id ?? "";
}

function classNameFromRecord(rec: AcademyFeeRecord) {
  const s = studentFromRecord(rec);
  const c = s?.classId;
  if (typeof c === "object" && c && "className" in c) return c.className;
  return "—";
}

function periodLabel(r: AcademyFeeRecord) {
  if (r.feeType === "admission") return "Admission";
  return `${MONTH_NAMES[(r.month || 1) - 1]} ${r.year}`;
}

function isUnpaid(status: string) {
  return status === "pending" || status === "overdue";
}

function pctChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 100);
}

function formatRs(n?: number) {
  if (n == null || Number.isNaN(n)) return "Rs —";
  return `Rs ${n.toLocaleString()}`;
}

function AreaSpark({ data, color }: { data: number[]; color: string }) {
  const chartData = (data.length ? data : [0, 0, 0, 0]).map((v, i) => ({ i, v }));
  return (
    <div className="h-11 w-[88px] shrink-0 self-end">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`fee-spark-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={2}
            fill={`url(#fee-spark-${color.replace("#", "")})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function BarSpark({ data, color }: { data: number[]; color: string }) {
  const chartData = (data.length ? data : [0, 0, 0, 0, 0]).map((v, i) => ({ i, v: Math.max(v, 0.15) }));
  return (
    <div className="h-11 w-[72px] shrink-0 self-end">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <Bar dataKey="v" fill={color} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function FeeKpiCard({
  label,
  value,
  changeLabel,
  changePositive,
  positiveIsGood = true,
  icon: Icon,
  iconBg,
  iconColor,
  valueClassName,
  footer,
  decoration,
}: {
  label: string;
  value: string;
  changeLabel?: string;
  changePositive?: boolean;
  /** When true, an increase is green; when false (e.g. outstanding), increase is red. */
  positiveIsGood?: boolean;
  icon: typeof Wallet;
  iconBg: string;
  iconColor: string;
  valueClassName?: string;
  footer?: ReactNode;
  decoration?: ReactNode;
}) {
  const isGood =
    changePositive == null ? true : positiveIsGood ? changePositive : !changePositive;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_3px_rgba(16,38,77,0.06)] transition-shadow hover:shadow-md sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
            style={{ backgroundColor: iconBg }}
          >
            <Icon className="h-5 w-5" style={{ color: iconColor }} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-slate-500">{label}</p>
            <p
              className={cn(
                "truncate text-lg font-bold tracking-tight text-[#10264D] sm:text-xl",
                valueClassName,
              )}
            >
              {value}
            </p>
          </div>
        </div>
        {decoration}
      </div>
      {footer ?? (
        changeLabel != null && (
          <div
            className={cn(
              "mt-3 inline-flex items-center gap-1 text-xs font-semibold",
              isGood ? "text-[#16A36A]" : "text-[#EF4444]",
            )}
          >
            {changePositive ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" />
            )}
            {changeLabel}
            <span className="font-normal text-slate-500">vs. last month</span>
          </div>
        )
      )}
    </div>
  );
}

function FeeSummaryCards({
  summary,
  loading,
  compact,
}: {
  summary?: AcademyFeeSummary;
  loading: boolean;
  compact?: boolean;
}) {
  const paid = summary?.totalPaid ?? 0;
  const pendingAmt = summary?.totalPending ?? 0;
  const records = summary?.recordsCount ?? 0;
  const pendingCount = summary?.byStatus?.pending ?? 0;
  const overdueCount = summary?.byStatus?.overdue ?? 0;
  const prev = summary?.previous;
  const paidDelta = prev ? pctChange(paid, prev.totalPaid) : 0;
  const pendingDelta = prev ? pctChange(pendingAmt, prev.totalPending) : 0;
  const recordsDelta = prev ? records - prev.recordsCount : 0;
  const age = summary?.oldestPending?.ageMonths;
  const ageLabel =
    age == null
      ? "—"
      : age === 0
        ? "This month"
        : age === 1
          ? "1 month"
          : `${age} months`;

  const dash = loading ? "…" : null;

  return (
    <div
      className={cn(
        "grid gap-3",
        compact ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4",
      )}
    >
      <FeeKpiCard
        label="Total Collected"
        value={dash ?? formatRs(paid)}
        changeLabel={prev ? `${paidDelta >= 0 ? "+" : ""}${paidDelta}%` : undefined}
        changePositive={paidDelta >= 0}
        icon={Wallet}
        iconBg="rgba(22,163,106,0.12)"
        iconColor="#16A36A"
        decoration={<AreaSpark data={summary?.trends?.paid || []} color="#16A36A" />}
      />
      <FeeKpiCard
        label="Outstanding"
        value={dash ?? formatRs(pendingAmt)}
        changeLabel={prev ? `${pendingDelta >= 0 ? "+" : ""}${pendingDelta}%` : undefined}
        changePositive={pendingDelta >= 0}
        positiveIsGood={false}
        icon={AlertTriangle}
        iconBg="rgba(239,68,68,0.12)"
        iconColor="#EF4444"
        decoration={<AreaSpark data={summary?.trends?.pending || []} color="#EF4444" />}
      />
      <FeeKpiCard
        label="Total Records"
        value={dash ?? String(records)}
        changeLabel={prev ? `${recordsDelta >= 0 ? "+" : ""}${recordsDelta}` : undefined}
        changePositive={recordsDelta >= 0}
        icon={FileText}
        iconBg="rgba(36,120,232,0.12)"
        iconColor="#2478E8"
        decoration={<BarSpark data={summary?.trends?.records || []} color="#2478E8" />}
      />
      {!compact && (
        <FeeKpiCard
          label="Pending / Overdue"
          value={dash ?? `${pendingCount} / ${overdueCount}`}
          valueClassName="text-[#EF4444]"
          icon={CalendarDays}
          iconBg="rgba(139,92,246,0.12)"
          iconColor="#8B5CF6"
          decoration={
            <CalendarDays className="pointer-events-none absolute -bottom-1 -right-1 h-16 w-16 text-[#8B5CF6]/15" />
          }
          footer={
            <div className="mt-3 flex items-start gap-1.5 text-xs text-[#2478E8]">
              <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                <p className="font-semibold leading-none">{ageLabel}</p>
                <p className="mt-1 text-[11px] font-normal text-slate-500">oldest pending</p>
              </div>
            </div>
          }
        />
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    overdue: "bg-destructive/15 text-destructive",
    waived: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`text-xs font-semibold rounded-full px-2 py-0.5 capitalize ${colors[status] || "bg-muted text-muted-foreground"
        }`}
    >
      {status}
    </span>
  );
}

export default function AcademyFeesManagement({
  caps,
  studentId,
  routes: routesProp,
  showGenerate = true,
  showFilters = true,
  sessionId = "",
}: {
  caps: ModuleActionCaps;
  /** When set, only this student's fee history is shown */
  studentId?: string;
  routes?: AcademyStudentRoutes;
  showGenerate?: boolean;
  showFilters?: boolean;
  /** Academic session scope from SessionBar (ignored for parents / student detail). */
  sessionId?: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isParent = user?.role === "parent";
  const routes =
    routesProp ?? (user?.role ? academyStudentRoutes(user.role, "records") : null);
  const { apiSessionId, writable, hasScope } = useSessionScope(sessionId || "");
  const scopeEnabled = isParent || Boolean(studentId) || hasScope;

  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [statusFilter, setStatusFilter] = useState(() => (user?.role === "parent" ? "paid" : ""));
  const [classFilter, setClassFilter] = useState("");
  const [selectedParentStudentId, setSelectedParentStudentId] = useState<string>(() => {
    try {
      return localStorage.getItem("parent_selected_student_id") || "";
    } catch {
      return "";
    }
  });
  const [feeTypeFilter, setFeeTypeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [payRecord, setPayRecord] = useState<AcademyFeeRecord | null>(null);
  const [selectedFeeIds, setSelectedFeeIds] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [exportingMonthWise, setExportingMonthWise] = useState<DefaulterReportFormat | null>(null);

  const childScoped = Boolean(studentId) || isParent;
  const effectiveStudentId = studentId || (isParent ? selectedParentStudentId || undefined : undefined);
  /** Parents see this child's fee history (paid emphasized); staff keep status filters. */
  const effectiveStatusFilter = isParent ? "" : statusFilter;

  const filterParams = useMemo(
    () => ({
      month: effectiveStudentId ? undefined : Number(month),
      year: effectiveStudentId ? undefined : Number(year),
      classId: effectiveStudentId || isParent ? undefined : classFilter || undefined,
      studentId: effectiveStudentId,
      sessionId: effectiveStudentId || isParent ? undefined : apiSessionId,
    }),
    [month, year, classFilter, effectiveStudentId, isParent, apiSessionId]
  );

  useEffect(() => {
    setPage(1);
    setClassFilter("");
  }, [month, year, statusFilter, feeTypeFilter, effectiveStudentId, sessionId]);

  useEffect(() => {
    if (!isParent) return;
    try {
      localStorage.setItem("parent_selected_student_id", selectedParentStudentId || "");
    } catch {
      // ignore storage failures
    }
  }, [isParent, selectedParentStudentId]);

  const { data: parentStudents = [] } = useQuery({
    queryKey: ["parent-students-fees"],
    queryFn: async () => {
      const r = await fetchAcademyStudents({ page: 1, limit: 200, status: "active" });
      return r.students;
    },
    enabled: isParent && !studentId,
    retry: false,
  });

  useEffect(() => {
    if (!isParent || studentId) return;
    if (!parentStudents.length) {
      if (selectedParentStudentId) setSelectedParentStudentId("");
      return;
    }
    if (!selectedParentStudentId || !parentStudents.some((s) => s._id === selectedParentStudentId)) {
      setSelectedParentStudentId(parentStudents[0]._id);
    }
  }, [isParent, studentId, parentStudents, selectedParentStudentId]);

  const { data: classes = [] } = useQuery({
    queryKey: ["academy-classes", sessionId],
    queryFn: () => fetchAcademyClasses({ status: "active", sessionId: apiSessionId }),
    enabled: showFilters && !studentId && !isParent && hasScope,
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["academy-fees", page, effectiveStatusFilter, feeTypeFilter, filterParams],
    queryFn: () =>
      fetchAcademyFees({
        page,
        limit: 20,
        status: effectiveStatusFilter || undefined,
        feeType: feeTypeFilter || undefined,
        ...filterParams,
      }),
    enabled: scopeEnabled && (!isParent || Boolean(effectiveStudentId)),
    retry: false,
  });

  const { data: summary, isLoading: summaryLoading, isError: summaryError, error: summaryErr } = useQuery({
    queryKey: ["academy-fees-summary", filterParams, effectiveStatusFilter],
    queryFn: () => fetchAcademyFeeSummary(filterParams),
    enabled: scopeEnabled && (!isParent || Boolean(effectiveStudentId)),
    retry: false,
  });

  const genMut = useMutation({
    mutationFn: () => {
      if (!writable) throw new Error("Switch to the active session to generate fees.");
      return generateMonthlyFees({
        month: Number(month),
        year: Number(year),
        classId: classFilter || undefined,
      });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["academy-fees"] });
      qc.invalidateQueries({ queryKey: ["academy-fees-summary"] });
      qc.invalidateQueries({ queryKey: ["academy-student-record"] });
      toast({
        title: "Monthly fees generated",
        description: [
          `${r.created} created`,
          `${r.skipped} skipped (already billed / admission month)`,
          r.repaired ? `${r.repaired} enrollment-month duplicates waived` : null,
        ]
          .filter(Boolean)
          .join(", "),
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const payStudentId = payRecord ? studentMongoId(payRecord) : "";
  const { data: payHistory, isLoading: payHistoryLoading } = useQuery({
    queryKey: ["academy-fee-history", payStudentId],
    queryFn: () => fetchStudentFeeHistory(payStudentId),
    enabled: Boolean(payStudentId),
  });

  const unpaidForPay = useMemo(() => {
    return (payHistory?.records || [])
      .filter((r) => r.status === "pending" || r.status === "overdue")
      .sort((a, b) => a.year - b.year || a.month - b.month);
  }, [payHistory]);

  useEffect(() => {
    if (!payRecord || !payHistory) return;
    const ids = unpaidForPay.map((r) => r._id);
    setSelectedFeeIds(ids.length ? ids : [payRecord._id]);
  }, [payRecord, payHistory, unpaidForPay]);

  const selectedUnpaid = unpaidForPay.filter((r) => selectedFeeIds.includes(r._id));
  const selectedTotal = selectedUnpaid.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const payMut = useMutation({
    mutationFn: () =>
      payAcademyFees({
        feeRecordIds: selectedFeeIds,
        paymentMethod,
        notes: paymentNotes.trim() || undefined,
      }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["academy-fees"] });
      qc.invalidateQueries({ queryKey: ["academy-fees-summary"] });
      qc.invalidateQueries({ queryKey: ["academy-fee-history"] });
      qc.invalidateQueries({ queryKey: ["academy-student-record"] });
      qc.invalidateQueries({ queryKey: ["fee-defaulters"] });
      setPayRecord(null);
      setSelectedFeeIds([]);
      setPaymentNotes("");
      toast({
        title: "Payment recorded",
        description: `${result.paid} month${result.paid === 1 ? "" : "s"} · ${formatPkr(result.total)}`,
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const printMut = useMutation({
    mutationFn: ({
      id,
      studentId: sid,
      size,
      months,
    }: {
      id?: string;
      studentId?: string;
      size: FeeReceiptSize;
      months?: number;
    }) => (sid ? printFeeChallan(sid, size, months) : printFeeReceipt(id!, size)),
    onError: (e: Error) =>
      toast({ title: "Could not print", description: e.message, variant: "destructive" }),
  });

  const records = data?.records ?? [];
  const pagination = data?.pagination;

  const recordsFiltered = useMemo(() => {
    if (!search.trim()) return records;
    return records.filter((r) =>
      matchesPanelSearch(
        search,
        studentName(r),
        studentCode(r),
        classNameFromRecord(r),
        r.receiptNumber,
        r.feeType,
        r.status,
        r.amount,
        periodLabel(r)
      )
    );
  }, [records, search]);

  const canPay = !isParent && (caps.canEdit || caps.canCreate);
  const canGenerate = showGenerate && !studentId && !isParent && writable && (caps.canCreate || caps.canEdit);
  const feeTableColSpan = childScoped ? (isParent ? 6 : 7) : 9;

  const downloadMonthWise = async (format: DefaulterReportFormat) => {
    setExportingMonthWise(format);
    try {
      const blob = await exportFeeDefaultersMonthWise(
        {
          year: Number(year) || undefined,
          classId: !isParent && classFilter ? classFilter : undefined,
          sessionId: !isParent ? apiSessionId : undefined,
        },
        format
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = format === "pdf" ? "fee-defaulters.pdf" : "fee-defaulters.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: format === "pdf" ? "PDF downloaded" : "Excel downloaded" });
    } catch (e) {
      toast({
        title: "Download failed",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setExportingMonthWise(null);
    }
  };

  return (
    <div className="space-y-3">
      {(isError || summaryError) && (
        <Card className="p-3 border-destructive/40 bg-destructive/5 text-sm text-destructive">
          {(error as Error)?.message || (summaryErr as Error)?.message || "Could not load fee records."}
        </Card>
      )}
      {isParent ? (
        <FeeSummaryCards summary={summary} loading={summaryLoading} compact />
      ) : (
        <FeeSummaryCards summary={summary} loading={summaryLoading} />
      )}

      {showFilters && !studentId && (
        <div className="rounded-2xl border border-slate-200/80 bg-[#F7FAFC] p-3 sm:p-4">
          <div className="flex flex-wrap items-end gap-3">
            {isParent && (
              <FeeFilterField label="Child" className="w-full min-w-[180px] sm:w-[220px]">
                <FeeFilterSelect
                  value={selectedParentStudentId}
                  onChange={setSelectedParentStudentId}
                >
                  <option value="">Select child…</option>
                  {parentStudents.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.studentName} ({s.studentId})
                    </option>
                  ))}
                </FeeFilterSelect>
              </FeeFilterField>
            )}
            {!isParent && (
              <>
                <FeeFilterField label="Month" className="min-w-[150px] flex-1 basis-[150px] sm:max-w-[180px]">
                  <FeeFilterSelect
                    value={month}
                    onChange={setMonth}
                    leadingIcon={<CalendarDays className="h-4 w-4" />}
                  >
                    {MONTH_NAMES.map((name, idx) => (
                      <option key={name} value={String(idx + 1)}>
                        {name} {year}
                      </option>
                    ))}
                  </FeeFilterSelect>
                </FeeFilterField>
                <FeeFilterField label="Year" className="w-[100px] shrink-0">
                  <FeeFilterSelect value={year} onChange={setYear}>
                    {Array.from({ length: 6 }, (_, i) => {
                      const y = String(Number(now.getFullYear()) - 2 + i);
                      return (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      );
                    })}
                  </FeeFilterSelect>
                </FeeFilterField>
                <FeeFilterField label="Class" className="min-w-[130px] flex-1 basis-[130px] sm:max-w-[160px]">
                  <FeeFilterSelect value={classFilter} onChange={setClassFilter}>
                    <option value="">All classes</option>
                    {classes.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.className}
                      </option>
                    ))}
                  </FeeFilterSelect>
                </FeeFilterField>
                <FeeFilterField label="Status" className="min-w-[110px] flex-1 basis-[110px] sm:max-w-[130px]">
                  <FeeFilterSelect value={statusFilter} onChange={setStatusFilter}>
                    <option value="">All</option>
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                    <option value="overdue">Overdue</option>
                    <option value="waived">Waived</option>
                  </FeeFilterSelect>
                </FeeFilterField>
                <FeeFilterField label="Type" className="min-w-[120px] flex-1 basis-[120px] sm:max-w-[140px]">
                  <FeeFilterSelect value={feeTypeFilter} onChange={setFeeTypeFilter}>
                    <option value="">All types</option>
                    <option value="monthly">Monthly</option>
                    <option value="admission">Admission</option>
                  </FeeFilterSelect>
                </FeeFilterField>
              </>
            )}

            <div className="relative min-w-[200px] flex-[1.4] basis-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="h-10 rounded-xl border-slate-200 bg-white pl-9 pr-9 text-sm text-[#10264D] shadow-none placeholder:text-slate-400 focus-visible:ring-blue-100"
                placeholder={
                  isParent ? "Search receipt or period…" : "Search student, class, receipt..."
                }
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search fees"
              />
              {search ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0.5 top-0.5 h-9 w-9 text-slate-400"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>

            {!isParent && (canGenerate || caps.canView) && (
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
                {canGenerate && (
                  <Button
                    className="h-10 gap-2 rounded-xl bg-[#2F80ED] px-4 text-sm font-semibold text-white hover:bg-[#2563EB]"
                    disabled={genMut.isPending}
                    onClick={() => genMut.mutate()}
                  >
                    <Download className="h-4 w-4" />
                    {genMut.isPending ? "Generating…" : "Generate Report"}
                  </Button>
                )}
                {!studentId && caps.canView && (
                  <DefaulterListDownload
                    className="h-10 max-w-[11.5rem] justify-center rounded-xl border-[#BFDBFE] bg-[#EFF6FF] px-3 text-[12px] font-semibold text-[#1D4ED8] hover:bg-[#DBEAFE] hover:text-[#1E40AF]"
                    label="Download Defaulter List"
                    exporting={exportingMonthWise}
                    onDownload={(format) => void downloadMonthWise(format)}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {(!showFilters || studentId) && (
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="h-10 rounded-xl border-slate-200 bg-white pl-9 pr-9 text-sm shadow-none"
            placeholder={
              isParent || studentId ? "Search receipt or period…" : "Search student, class, receipt..."
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0.5 top-0.5 h-9 w-9 text-slate-400"
              onClick={() => setSearch("")}
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      )}
      {isParent ? (
        <p className="text-xs text-muted-foreground">
          Showing fee records for your child only. School-wide collections are not available here.
        </p>
      ) : null}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left p-2.5 font-medium">Receipt</th>
                {!childScoped && <th className="text-left p-2.5 font-medium">Student</th>}
                {!childScoped && (
                  <th className="text-left p-2.5 font-medium hidden md:table-cell">Class</th>
                )}
                <th className="text-left p-2.5 font-medium">Period</th>
                <th className="text-left p-2.5 font-medium">Type</th>
                <th className="text-left p-2.5 font-medium">Amount</th>
                <th className="text-left p-2.5 font-medium">Status</th>
                {!isParent && <th className="text-left p-2.5 font-medium">Pending months</th>}
                <th className="text-right p-2.5 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={feeTableColSpan} className="p-6 text-center text-muted-foreground">
                    Loading fee records…
                  </td>
                </tr>
              )}
              {!isLoading && isParent && !effectiveStudentId && (
                <tr>
                  <td colSpan={feeTableColSpan} className="p-6 text-center text-muted-foreground">
                    Select a child to view paid fees.
                  </td>
                </tr>
              )}
              {!isLoading && (!isParent || effectiveStudentId) && records.length === 0 && (
                <tr>
                  <td colSpan={feeTableColSpan} className="p-6 text-center text-muted-foreground">
                    {isParent
                      ? "No fee records for this child yet."
                      : studentId
                        ? "No fee records for this student yet."
                        : "No fee records for this period. Generate monthly fees or register students."}
                  </td>
                </tr>
              )}
              {!isLoading && records.length > 0 && recordsFiltered.length === 0 && (
                <tr>
                  <td colSpan={feeTableColSpan} className="p-6 text-center text-muted-foreground">
                    No records match your filters.
                  </td>
                </tr>
              )}
              {recordsFiltered.map((r) => {
                const sid = studentMongoId(r);
                const detailHref = routes && sid && !isParent ? routes.detail(sid) : null;
                const payable = isUnpaid(r.status);
                const printing =
                  printMut.isPending &&
                  (printMut.variables?.id === r._id || printMut.variables?.studentId === sid);
                return (
                  <tr
                    key={r._id}
                    className={
                      payable && !isParent
                        ? "border-b last:border-0 bg-red-500/10 text-red-700 dark:text-red-300"
                        : "border-b last:border-0 hover:bg-muted/30"
                    }
                  >
                    <td className="p-2.5 font-mono text-xs">{r.receiptNumber || "—"}</td>
                    {!childScoped && (
                      <td className="p-2.5">
                        {detailHref ? (
                          <Link
                            to={detailHref}
                            className={`font-medium hover:underline ${payable ? "text-red-700 dark:text-red-300" : "text-primary"}`}
                          >
                            {studentName(r)}
                          </Link>
                        ) : (
                          <div className={`font-medium ${payable ? "text-red-700 dark:text-red-300" : ""}`}>
                            {studentName(r)}
                          </div>
                        )}
                        <p className={`text-xs ${payable ? "text-red-700/80 dark:text-red-300/80" : "text-muted-foreground"}`}>
                          {studentCode(r)}
                        </p>
                      </td>
                    )}
                    {!childScoped && (
                      <td className="p-2.5 hidden md:table-cell">{classNameFromRecord(r)}</td>
                    )}
                    <td className="p-2.5">{periodLabel(r)}</td>
                    <td className="p-2.5 capitalize">{r.feeType}</td>
                    <td className="p-2.5">{formatPkr(r.amount)}</td>
                    <td className="p-2.5">
                      <StatusPill status={r.status} />
                    </td>
                    {!isParent && (
                      <td className="p-2.5">
                        {(r.unpaidMonthCount || 0) > 0 ? (
                          <div>
                            <p className="font-semibold">
                              {r.unpaidMonthCount} month{r.unpaidMonthCount === 1 ? "" : "s"}
                            </p>
                            {(r.unpaidMonthCount || 0) > 1 && r.unpaidFrom && r.unpaidTo && (
                              <p className="text-xs opacity-80">{r.unpaidFrom} – {r.unpaidTo}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    )}
                    <td className="p-2.5 text-right">
                      <div className="inline-flex flex-col items-stretch sm:flex-row sm:items-center sm:justify-end gap-1.5 min-w-[7.5rem] sm:min-w-0">
                        {payable && canPay && (
                          <Button
                            size="sm"
                            variant="hero"
                            className="w-full sm:w-auto"
                            disabled={payMut.isPending}
                            onClick={() => {
                              setPayRecord(r);
                              setPaymentMethod("cash");
                              setPaymentNotes("");
                            }}
                          >
                            Record payment
                          </Button>
                        )}
                        {(payable || r.status === "paid") && (
                          <div className="inline-flex items-center justify-end gap-1.5">
                            {r.status === "paid" && r.paidAt && (
                              <span className="text-xs text-muted-foreground hidden sm:inline">
                                {new Date(r.paidAt).toLocaleDateString()}
                              </span>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-8 shrink-0"
                                  disabled={printing}
                                  aria-label={payable ? "Print challan" : "Print receipt"}
                                  title={payable ? "Print challan" : "Print receipt"}
                                >
                                  {printing ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Printer className="h-4 w-4" />
                                  )}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  className="gap-2"
                                  onClick={() =>
                                    printMut.mutate(
                                      payable && sid
                                        ? { studentId: sid, size: "thermal" }
                                        : { id: r._id, size: "thermal" }
                                    )
                                  }
                                >
                                  <Receipt className="h-4 w-4" />
                                  Thermal
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="gap-2"
                                  onClick={() =>
                                    printMut.mutate(
                                      payable && sid ? { studentId: sid, size: "a4" } : { id: r._id, size: "a4" }
                                    )
                                  }
                                >
                                  <FileText className="h-4 w-4" />
                                  A4
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pagination && pagination.pages > 1 && (
          <div className="flex justify-center gap-2 p-3 border-t">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Prev
            </Button>
            <span className="text-sm self-center">
              Page {page} / {pagination.pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pagination.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </Card>

      <Dialog
        open={Boolean(payRecord)}
        onOpenChange={(o) => {
          if (!o) {
            setPayRecord(null);
            setSelectedFeeIds([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
          </DialogHeader>
          {payRecord && (
            <div className="space-y-3 text-sm">
              <p>
                <span className="text-muted-foreground">Student:</span>{" "}
                <span className="font-medium">{studentName(payRecord)}</span>
              </p>
              <div className="rounded-md border">
                <div className="px-3 py-2 border-b text-xs font-medium text-muted-foreground">
                  Unpaid months
                </div>
                {payHistoryLoading && (
                  <p className="px-3 py-4 text-muted-foreground">Loading remaining fees…</p>
                )}
                {!payHistoryLoading && unpaidForPay.length === 0 && (
                  <p className="px-3 py-4 text-muted-foreground">No unpaid months left.</p>
                )}
                {!payHistoryLoading && unpaidForPay.length > 0 && (
                  <ul className="max-h-52 overflow-y-auto divide-y">
                    {unpaidForPay.map((fee) => {
                      const checked = selectedFeeIds.includes(fee._id);
                      return (
                        <li key={fee._id}>
                          <label className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40">
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={checked}
                              onChange={() =>
                                setSelectedFeeIds((current) =>
                                  checked ? current.filter((id) => id !== fee._id) : [...current, fee._id]
                                )
                              }
                            />
                            <span className="flex-1">
                              <span className="font-medium">{periodLabel(fee)}</span>
                              <span className="ml-2 text-xs capitalize text-muted-foreground">{fee.status}</span>
                            </span>
                            <span className="font-semibold">{formatPkr(fee.amount)}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="flex items-center justify-between px-3 py-2 border-t bg-muted/30">
                  <span className="text-muted-foreground">
                    {selectedUnpaid.length} month{selectedUnpaid.length === 1 ? "" : "s"} selected
                  </span>
                  <span className="font-semibold">{formatPkr(selectedTotal)}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Payment method</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="online">Online</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Notes (optional)</Label>
                <Input
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="Reference or remarks"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayRecord(null)}>
              Cancel
            </Button>
            <Button
              variant="hero"
              disabled={payMut.isPending || selectedFeeIds.length === 0}
              onClick={() => payMut.mutate()}
            >
              Confirm payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
