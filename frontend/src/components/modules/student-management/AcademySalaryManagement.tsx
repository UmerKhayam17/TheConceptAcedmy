import { Fragment, useEffect, useMemo, useState, type ComponentType } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarPlus,
  Check,
  ChevronDown,
  Clock3,
  Coins,
  Minus,
  MoreVertical,
  RefreshCw,
  Search,
  Users,
  Wallet,
} from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import type { ModuleActionCaps } from "@/lib/permissions";
import { resolveUploadUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  fetchAcademySalaries,
  fetchAcademySalarySummary,
  exportAcademySalaryReport,
  generateMonthlySalaries,
  payAcademySalary,
  payAcademySalariesBulk,
  recalculatePercentageSalaries,
  type AcademySalaryRecord,
  type SalaryReportFormat,
} from "@/lib/studentManagementApi";
import { MONTH_NAMES } from "./studentDisplayUtils";
import { DEFAULT_PAGE_SIZE } from "./PageSizeSelect";
import ListPagination from "./ListPagination";
import { DefaulterListDownload } from "./DefaulterListDownload";
import FilterToolbar, { FilterToolbarActions } from "@/components/modules/FilterToolbar";
import { deliverReportBlob, openReportPreviewTab } from "@/lib/reportDownload";
import AcademySalaryDetailPage, {
  StudentPoolTable,
} from "./AcademySalaryDetailPage";

function formatRs(n?: number) {
  if (n == null || Number.isNaN(n)) return "Rs —";
  return `Rs ${n.toLocaleString()}`;
}

function staffFromRecord(rec: AcademySalaryRecord) {
  const s = rec.staffId;
  if (typeof s === "object" && s) return s;
  return null;
}

function staffName(rec: AcademySalaryRecord) {
  return staffFromRecord(rec)?.name ?? "—";
}

function staffRole(rec: AcademySalaryRecord) {
  const r = staffFromRecord(rec)?.role;
  return typeof r === "object" && r?.name ? r.name : "—";
}

function recordPayType(rec: AcademySalaryRecord): "fixed" | "percentage" {
  if (rec.payType === "percentage") return "percentage";
  const s = staffFromRecord(rec);
  if (s?.payType === "percentage") return "percentage";
  return "fixed";
}

function recordPercentage(rec: AcademySalaryRecord): number {
  if (typeof rec.salaryPercentage === "number") return rec.salaryPercentage;
  return Number(staffFromRecord(rec)?.salaryPercentage ?? 0);
}

function periodLabel(r: AcademySalaryRecord) {
  return `${MONTH_NAMES[(r.month || 1) - 1]} ${r.year}`;
}

function initialOf(name?: string) {
  const ch = (name || "?").trim().charAt(0).toUpperCase();
  return ch || "?";
}

function SquareCheckbox({
  checked,
  indeterminate = false,
  onChange,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  "aria-label": string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={ariaLabel}
      onClick={onChange}
      className={cn(
        "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border border-slate-300 bg-white transition-colors",
        "hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        (checked || indeterminate) && "border-primary bg-primary text-primary-foreground",
      )}
    >
      {indeterminate ? (
        <Minus className="h-3 w-3" strokeWidth={3} />
      ) : checked ? (
        <Check className="h-3 w-3" strokeWidth={3} />
      ) : null}
    </button>
  );
}

function StaffAvatar({ name, profileImage }: { name: string; profileImage?: string }) {
  const src = profileImage ? resolveUploadUrl(profileImage) : null;
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="h-9 w-9 rounded-full object-cover shrink-0 border border-border"
      />
    );
  }
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#dbeafe] text-sm font-semibold text-[#2563eb]">
      {initialOf(name)}
    </span>
  );
}

const FULL_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  iconBg,
  iconColor,
  valueClass,
}: {
  title: string;
  value: string;
  description: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  iconBg: string;
  iconColor: string;
  valueClass: string;
}) {
  return (
    <div className="relative flex min-h-[118px] flex-col overflow-hidden rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
      <div className="flex items-start gap-2.5">
        <div
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
          style={{ backgroundColor: iconBg }}
        >
          <Icon className="h-5 w-5" style={{ color: iconColor }} strokeWidth={2} />
        </div>
        <p className="truncate pt-0.5 text-[12px] font-semibold text-slate-500">{title}</p>
      </div>
      <div className="mt-auto min-w-0 pt-3">
        <div className={cn("truncate text-[24px] font-bold leading-none tracking-tight", valueClass)}>
          {value}
        </div>
        <p className="mt-2 text-[11px] font-medium text-slate-400">{description}</p>
      </div>
    </div>
  );
}

const selectClass =
  "h-10 rounded-md border border-input bg-background px-3 text-sm min-w-[7.5rem] shrink-0";

export default function AcademySalaryManagement({ caps }: { caps: ModuleActionCaps }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [statusFilter, setStatusFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState<"" | "teacher" | "accountant">("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [payRecord, setPayRecord] = useState<AcademySalaryRecord | null>(null);
  const [bulkPayOpen, setBulkPayOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [exporting, setExporting] = useState<SalaryReportFormat | null>(null);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [expandedPoolKeys, setExpandedPoolKeys] = useState<string[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const togglePoolExpanded = (key: string) => {
    setExpandedPoolKeys((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key],
    );
  };

  const filterParams = useMemo(
    () => ({
      month: Number(month),
      year: Number(year),
      roleName: roleFilter || undefined,
    }),
    [month, year, roleFilter],
  );

  useEffect(() => {
    setPage(1);
  }, [month, year, statusFilter, roleFilter, search]);

  useEffect(() => {
    setSelectedIds([]);
  }, [page, pageSize, month, year, statusFilter, roleFilter, search]);

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["academy-salaries-summary", filterParams],
    queryFn: () => fetchAcademySalarySummary(filterParams),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["academy-salaries", page, pageSize, search, statusFilter, filterParams],
    queryFn: () =>
      fetchAcademySalaries({
        page,
        limit: pageSize,
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        ...filterParams,
      }),
  });

  const genMut = useMutation({
    mutationFn: () =>
      generateMonthlySalaries({
        month: Number(month),
        year: Number(year),
        roleName: roleFilter || undefined,
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["academy-salaries"] });
      qc.invalidateQueries({ queryKey: ["academy-salaries-summary"] });
      toast({
        title: "Salaries generated",
        description: `${r.created} created, ${r.skipped} skipped (no pay setup or duplicate)`,
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const recalcMut = useMutation({
    mutationFn: () =>
      recalculatePercentageSalaries({
        month: Number(month),
        year: Number(year),
        roleName: roleFilter || undefined,
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["academy-salaries"] });
      qc.invalidateQueries({ queryKey: ["academy-salaries-summary"] });
      toast({
        title: "Percentage salaries recalculated",
        description: `${r.updated} updated from tuition pools${r.skipped ? `, ${r.skipped} skipped` : ""
          }.`,
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const payMut = useMutation({
    mutationFn: () => {
      const needsAmount =
        recordPayType(payRecord!) === "percentage" || !(Number(payRecord!.amount) > 0);
      const amountNum = Number(payAmount);
      if (needsAmount && (!(amountNum > 0) || Number.isNaN(amountNum))) {
        throw new Error("Enter the salary amount (PKR) before marking paid.");
      }
      return payAcademySalary(payRecord!._id, {
        paymentMethod,
        notes: paymentNotes.trim() || undefined,
        amount: needsAmount || payAmount.trim() ? amountNum : undefined,
      });
    },
    onSuccess: (rec) => {
      qc.invalidateQueries({ queryKey: ["academy-salaries"] });
      qc.invalidateQueries({ queryKey: ["academy-salaries-summary"] });
      setPayRecord(null);
      setPaymentNotes("");
      setPayAmount("");
      toast({
        title: "Salary paid",
        description: rec.voucherNumber ? `Voucher ${rec.voucherNumber}` : undefined,
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const records = data?.records ?? [];
  const pagination = data?.pagination;
  const canPay = caps.canEdit || caps.canCreate;
  const canGenerate = caps.canCreate || caps.canEdit;

  const selectedPendingPayable = useMemo(
    () =>
      records.filter(
        (r) => selectedIds.includes(r._id) && r.status === "pending" && Number(r.amount) > 0,
      ),
    [records, selectedIds],
  );
  const selectedPendingNoAmount = useMemo(
    () =>
      records.filter(
        (r) => selectedIds.includes(r._id) && r.status === "pending" && !(Number(r.amount) > 0),
      ),
    [records, selectedIds],
  );
  const bulkPayTotal = useMemo(
    () => selectedPendingPayable.reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
    [selectedPendingPayable],
  );

  const bulkPayMut = useMutation({
    mutationFn: () =>
      payAcademySalariesBulk({
        ids: selectedPendingPayable.map((r) => r._id),
        paymentMethod,
        notes: paymentNotes.trim() || undefined,
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["academy-salaries"] });
      qc.invalidateQueries({ queryKey: ["academy-salaries-summary"] });
      setBulkPayOpen(false);
      setSelectedIds([]);
      setPaymentNotes("");
      toast({
        title: "Bulk payment complete",
        description: `${r.paid} paid (${formatRs(r.totalAmount)})${r.skipped ? `, ${r.skipped} skipped` : ""
          }.`,
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const showingFrom =
    pagination && pagination.total > 0 ? (page - 1) * pagination.limit + 1 : 0;
  const showingTo = pagination ? Math.min(page * pagination.limit, pagination.total) : 0;
  const pageIds = records.map((r) => r._id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
  const somePageSelected = pageIds.some((id) => selectedIds.includes(id));

  const toggleSelectAllPage = () => {
    if (allPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const openPay = (r: AcademySalaryRecord) => {
    setBulkPayOpen(false);
    setPayRecord(r);
    setPaymentMethod("bank_transfer");
    setPaymentNotes("");
    setPayAmount(r.amount > 0 ? String(r.amount) : "");
  };

  const openBulkPay = () => {
    if (selectedPendingPayable.length === 0) {
      toast({
        title: "Nothing to pay",
        description:
          selectedPendingNoAmount.length > 0
            ? "Selected vouchers need an amount set first (pay those individually)."
            : "Select pending vouchers with an amount greater than zero.",
        variant: "destructive",
      });
      return;
    }
    setPayRecord(null);
    setPaymentMethod("bank_transfer");
    setPaymentNotes("");
    setBulkPayOpen(true);
  };

  const handleExport = async (format: SalaryReportFormat) => {
    setExporting(format);
    const preview = openReportPreviewTab(format);
    try {
      const blob = await exportAcademySalaryReport(
        {
          month: Number(month),
          year: Number(year),
          status: statusFilter || undefined,
          roleName: roleFilter || undefined,
          search: search.trim() || undefined,
          ids: selectedIds.length > 0 ? selectedIds : undefined,
        },
        format,
      );
      const monthLabel = MONTH_NAMES[Number(month) - 1] || month;
      const mode = deliverReportBlob(
        blob,
        `Staff-Salary_${monthLabel}-${year}.${format}`,
        format,
        preview,
      );
      toast({
        title: mode === "preview" ? "Report preview opened" : "Excel downloaded",
        description:
          mode === "preview"
            ? "Use Print or Download from the preview window."
            : "Excel salary report downloaded.",
      });
    } catch (e) {
      preview?.close();
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : "Could not export",
        variant: "destructive",
      });
    } finally {
      setExporting(null);
    }
  };

  if (detailId) {
    return (
      <AcademySalaryDetailPage salaryId={detailId} onBack={() => setDetailId(null)} />
    );
  }

  return (
    <div className="min-h-full bg-slate-50 px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      {/* Compact theme header — matches Subjects */}
      <div className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
              <Coins className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight">
                Staff Salary
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500 max-w-md">
                Generate, recalculate, and pay staff salaries from tuition pools and fixed rates.
              </p>
            </div>
          </div>
          <div className="shrink-0 rounded-lg bg-primary/10 px-3 py-2 max-w-[14rem]">
            <p className="text-xs sm:text-sm italic leading-snug text-[#1a2b4b]/80">
              <span className="mr-1 text-primary not-italic font-serif text-base leading-none">
                &ldquo;
              </span>
              A great school builds great futures.
              <span className="ml-0.5 text-primary not-italic font-serif text-base leading-none">
                &rdquo;
              </span>
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          title="Total Paid"
          value={summaryLoading ? "…" : formatRs(summary?.totalPaid)}
          description="This month salary disbursed"
          icon={Coins}
          iconBg="#DCFCE7"
          iconColor="#16A66A"
          valueClass="text-[#16A66A]"
        />
        <MetricCard
          title="Pending Amount"
          value={summaryLoading ? "…" : formatRs(summary?.totalPending)}
          description="Remaining to be paid"
          icon={Clock3}
          iconBg="#FFEDD5"
          iconColor="#EA580C"
          valueClass="text-[#EA580C]"
        />
        <MetricCard
          title="Total Vouchers"
          value={summaryLoading ? "…" : String(summary?.recordsCount ?? 0)}
          description="Salary vouchers generated"
          icon={Users}
          iconBg="#DBEAFE"
          iconColor="#2563EB"
          valueClass="text-[#10244A]"
        />
        <MetricCard
          title="Active Staff"
          value={summaryLoading ? "…" : String(summary?.activeStaff ?? 0)}
          description="With fixed salary or %"
          icon={Wallet}
          iconBg="#EDE9FE"
          iconColor="#8B5CF6"
          valueClass="text-[#10244A]"
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
        <FilterToolbar>
          <select
            className={selectClass}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            aria-label="Month"
          >
            {FULL_MONTH_NAMES.map((name, i) => (
              <option key={name} value={String(i + 1)}>
                {name}
              </option>
            ))}
          </select>
          <select
            className={cn(selectClass, "min-w-[5.5rem]")}
            value={year}
            onChange={(e) => setYear(e.target.value)}
            aria-label="Year"
          >
            {Array.from({ length: 6 }, (_, i) => now.getFullYear() - 2 + i).map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
          <select
            className={selectClass}
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as "" | "teacher" | "accountant")}
            aria-label="Role"
          >
            <option value="">All staff</option>
            <option value="teacher">Teachers</option>
            <option value="accountant">Accountants</option>
          </select>
          <select
            className={selectClass}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Status"
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
          </select>

          <div className="relative w-full min-w-0 sm:max-w-md sm:flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search staff, role, voucher..."
              className="h-10 pl-9"
            />
          </div>

          <FilterToolbarActions>
            {canGenerate ? (
              <Button
                className="gap-2 h-10 shrink-0 rounded-md bg-slate-900 text-white hover:bg-slate-800"
                disabled={genMut.isPending}
                onClick={() => genMut.mutate()}
              >
                <CalendarPlus className="h-4 w-4" />
                {genMut.isPending ? "Generating…" : "Generate monthly salaries"}
              </Button>
            ) : null}
            {canPay && selectedIds.length > 0 ? (
              <Button
                variant="hero"
                className="gap-2 h-10 shrink-0 rounded-md font-semibold shadow-gold"
                disabled={bulkPayMut.isPending}
                onClick={openBulkPay}
              >
                <Check className="h-4 w-4" />
                {bulkPayMut.isPending
                  ? "Paying…"
                  : `Pay selected${selectedPendingPayable.length > 0
                    ? ` (${selectedPendingPayable.length})`
                    : ""
                  }`}
              </Button>
            ) : null}
            {canGenerate ? (
              <Button
                variant="outline"
                className="gap-2 h-10 shrink-0 rounded-md border-slate-800 bg-white text-slate-800 hover:bg-slate-50 hover:text-slate-900"
                disabled={recalcMut.isPending}
                onClick={() => recalcMut.mutate()}
                title="Recompute pending percentage vouchers from tuition × subject share × teacher cut"
              >
                <RefreshCw className={cn("h-4 w-4", recalcMut.isPending && "animate-spin")} />
                {recalcMut.isPending ? "Recalculating…" : "Recalc % from fees"}
              </Button>
            ) : null}
            <DefaulterListDownload
              variant="default"
              size="default"
              className="shrink-0"
              label="Print / Export"
              exporting={exporting}
              onDownload={(format) => void handleExport(format)}
            />
          </FilterToolbarActions>
        </FilterToolbar>
      </div>

      <Card className="overflow-hidden shadow-sm border-border/80">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className="w-10 p-3 text-center">
                  <SquareCheckbox
                    checked={allPageSelected}
                    indeterminate={!allPageSelected && somePageSelected}
                    onChange={toggleSelectAllPage}
                    aria-label="Select all on this page"
                  />
                </th>
                <th className="text-left p-3 font-medium whitespace-nowrap">Voucher</th>
                <th className="text-left p-3 font-medium">Staff</th>
                <th className="text-left p-3 font-medium hidden sm:table-cell">Role</th>
                <th className="text-left p-3 font-medium">Period</th>
                <th className="text-left p-3 font-medium">Pay type</th>
                <th className="text-left p-3 font-medium">Amount</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-right p-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={9} className="p-10 text-center text-muted-foreground">
                    Loading salary records…
                  </td>
                </tr>
              )}
              {!isLoading && records.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-10 text-center text-muted-foreground">
                    No salary vouchers for this period. Set staff pay type in Staff management, apply
                    subject share on Subjects, then generate. Percentage teachers are calculated from
                    tuition × subject share × teacher %.
                  </td>
                </tr>
              )}
              {records.map((r) => {
                const payable = r.status === "pending";
                const payType = recordPayType(r);
                const pct = recordPercentage(r);
                const staff = staffFromRecord(r);
                const isSelected = selectedIds.includes(r._id);
                const name = staffName(r);
                const breakdown = r.calculationBreakdown || [];
                const canExpand =
                  payType === "percentage" &&
                  breakdown.length > 0 &&
                  (r.calculationSource === "tuition_pool" || r.calculationSource === "manual");
                const isExpanded = expandedIds.includes(r._id);
                return (
                  <Fragment key={r._id}>
                    <tr
                      className={cn(
                        "border-b last:border-0 hover:bg-muted/20",
                        isSelected && "bg-muted/40",
                        isExpanded && "border-b-0",
                      )}
                    >
                      <td className="w-10 p-3 text-center">
                        <SquareCheckbox
                          checked={isSelected}
                          onChange={() => toggleSelectOne(r._id)}
                          aria-label={`Select ${name}`}
                        />
                      </td>
                      <td className="p-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                        {r.voucherNumber || "—"}
                      </td>
                      <td className="p-3">
                        <button
                          type="button"
                          className="flex w-full items-center gap-2.5 min-w-0 text-left"
                          onClick={() => setDetailId(r._id)}
                          title="Open salary detail"
                        >
                          <StaffAvatar name={name} profileImage={staff?.profileImage} />
                          <div className="min-w-0">
                            <div className="font-semibold text-[#1a2b4b] truncate hover:underline">
                              {name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {payType === "percentage"
                                ? r.calculationSource === "tuition_pool"
                                  ? `Tuition pool · teacher percentage ${pct}%`
                                  : pct > 0
                                    ? `Teacher percentage: ${pct}%`
                                    : "Percentage · set teacher percentage on staff"
                                : `Base: ${formatRs(staff?.salary)}`}
                            </div>
                          </div>
                        </button>
                      </td>
                      <td className="p-3 hidden sm:table-cell">
                        <span className="inline-flex items-center rounded-full bg-[#dbeafe] px-2.5 py-0.5 text-xs font-semibold capitalize text-[#1d4ed8]">
                          {staffRole(r)}
                        </span>
                      </td>
                      <td className="p-3 text-slate-600 whitespace-nowrap">{periodLabel(r)}</td>
                      <td className="p-3">
                        {payType === "percentage" ? (
                          <span className="inline-flex items-center rounded-full bg-[#ede9fe] px-2.5 py-0.5 text-xs font-semibold text-[#7c3aed]">
                            Percentage
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-[#ccfbf1] px-2.5 py-0.5 text-xs font-semibold text-[#0f766e]">
                            Fixed
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        {payType === "percentage" && !(r.amount > 0) ? (
                          <span className="text-amber-700 text-xs font-medium">Set on pay</span>
                        ) : (
                          <div>
                            <span className="font-semibold text-[#16A66A]">{formatRs(r.amount)}</span>
                            {canExpand ? (
                              <button
                                type="button"
                                onClick={() => toggleExpanded(r._id)}
                                className="mt-0.5 flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground hover:text-[#1a2b4b]"
                              >
                                {breakdown.length} subject pool
                                {breakdown.length === 1 ? "" : "s"}
                                <ChevronDown
                                  className={cn(
                                    "h-3 w-3 transition-transform",
                                    isExpanded && "rotate-180",
                                  )}
                                />
                              </button>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize",
                            r.status === "paid" && "bg-emerald-50 text-emerald-700",
                            r.status === "pending" && "bg-orange-50 text-orange-700",
                            r.status === "cancelled" && "bg-muted text-muted-foreground",
                          )}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground"
                              aria-label="Row actions"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {payable && canPay ? (
                              <DropdownMenuItem onClick={() => openPay(r)}>
                                Mark paid
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem onClick={() => setDetailId(r._id)}>
                              View full details
                            </DropdownMenuItem>
                            {canExpand ? (
                              <DropdownMenuItem onClick={() => toggleExpanded(r._id)}>
                                {isExpanded ? "Hide breakdown" : "View breakdown"}
                              </DropdownMenuItem>
                            ) : null}
                            {r.status === "paid" && r.paidAt ? (
                              <DropdownMenuItem disabled>
                                Paid {new Date(r.paidAt).toLocaleDateString()}
                              </DropdownMenuItem>
                            ) : null}
                            {!payable && r.status !== "paid" && !canExpand ? (
                              <DropdownMenuItem disabled>No actions</DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                    {isExpanded && canExpand ? (
                      <tr className="border-b bg-slate-50/80">
                        <td colSpan={9} className="p-0">
                          <div className="px-4 py-3 space-y-3">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  Tuition pool breakdown · teacher percentage {pct}%
                                </p>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                  Expand a class/subject for one line per student. Admission fee is
                                  not included.
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 border-slate-300 bg-white text-slate-800 hover:bg-slate-50 hover:text-slate-900"
                                onClick={() => setDetailId(r._id)}
                              >
                                Open full detail page
                              </Button>
                            </div>
                            <div className="space-y-2">
                              {breakdown.map((line, idx) => {
                                const poolKey = `${r._id}-${idx}`;
                                const poolOpen = expandedPoolKeys.includes(poolKey);
                                const hasStudents = (line.students?.length || 0) > 0;
                                return (
                                  <div
                                    key={poolKey}
                                    className="overflow-hidden rounded-lg border border-slate-200 bg-white"
                                  >
                                    <button
                                      type="button"
                                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-50"
                                      onClick={() => togglePoolExpanded(poolKey)}
                                    >
                                      <ChevronDown
                                        className={cn(
                                          "h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform",
                                          poolOpen && "rotate-180",
                                        )}
                                      />
                                      <div className="min-w-0 flex-1">
                                        <p className="text-xs font-semibold text-[#1a2b4b]">
                                          {line.subjectName || "—"}
                                          {line.className || line.sectionName
                                            ? `, ${[line.className, line.sectionName]
                                                .filter(Boolean)
                                                .join(" ")}`
                                            : ""}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground">
                                          {line.studentCount ?? 0} students · Tuition{" "}
                                          {formatRs(line.monthlyTuitionTotal)} · Share{" "}
                                          {line.tuitionSharePercent != null
                                            ? `${line.tuitionSharePercent}%`
                                            : "—"}{" "}
                                          · Pool {formatRs(line.pool)}
                                        </p>
                                      </div>
                                      <span className="text-xs font-semibold tabular-nums text-[#16A66A]">
                                        {formatRs(line.salary)}
                                      </span>
                                    </button>
                                    {poolOpen ? (
                                      <div className="border-t border-slate-100 bg-slate-50/60 p-2.5">
                                        {hasStudents ? (
                                          <StudentPoolTable
                                            line={line}
                                            subjectLabel={line.subjectName || "Subject"}
                                          />
                                        ) : (
                                          <div className="rounded-md border border-dashed border-slate-200 bg-white px-3 py-4 text-center text-xs text-muted-foreground">
                                            Student lines are not on this voucher yet.{" "}
                                            <button
                                              type="button"
                                              className="font-semibold text-primary underline-offset-2 hover:underline"
                                              onClick={() => setDetailId(r._id)}
                                            >
                                              Open full detail
                                            </button>{" "}
                                            for a live one-line-per-student view, or run Recalc %
                                            from fees to save them.
                                          </div>
                                        )}
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {pagination && (
          <ListPagination
            page={page}
            totalPages={pagination.pages}
            total={pagination.total}
            from={showingFrom}
            to={showingTo}
            pageSize={pageSize}
            onPageSizeChange={(n) => {
              setPageSize(n);
              setPage(1);
            }}
            onPageChange={setPage}
            noun="staff"
          />
        )}
      </Card>

      <Dialog open={Boolean(payRecord)} onOpenChange={(o) => !o && setPayRecord(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Record salary payment</DialogTitle>
          </DialogHeader>
          {payRecord && (
            <div className="space-y-3 text-sm">
              <p>
                <span className="text-muted-foreground">Staff:</span>{" "}
                <span className="font-medium">{staffName(payRecord)}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Pay type:</span>{" "}
                <span className="font-medium capitalize">
                  {recordPayType(payRecord) === "percentage"
                    ? `Percentage (${recordPercentage(payRecord)}%)`
                    : "Fixed"}
                </span>
              </p>
              <p>
                <span className="text-muted-foreground">Period:</span> {periodLabel(payRecord)}
              </p>
              {recordPayType(payRecord) === "percentage" &&
                (payRecord.calculationBreakdown?.length ?? 0) > 0 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Subject pools
                  </p>
                  <ul className="space-y-1.5 max-h-40 overflow-y-auto">
                    {payRecord.calculationBreakdown!.map((line, idx) => (
                      <li
                        key={`pay-bd-${idx}`}
                        className="flex items-start justify-between gap-3 text-xs"
                      >
                        <span className="min-w-0 text-slate-700">
                          <span className="font-medium text-[#1a2b4b]">
                            {line.subjectName || "Subject"}
                          </span>
                          {(line.className || line.sectionName) && (
                            <span className="text-muted-foreground">
                              {" "}
                              · {[line.className, line.sectionName].filter(Boolean).join(" / ")}
                            </span>
                          )}
                          <span className="block text-muted-foreground">
                            {line.studentCount ?? 0} students
                            {Number(line.tuitionSharePercent) > 0
                              ? ` · subject share ${Number(line.tuitionSharePercent)}%`
                              : ""}
                            {" · "}pool {formatRs(line.pool)}
                          </span>
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums text-[#16A66A]">
                          {formatRs(line.salary)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {(recordPayType(payRecord) === "percentage" || !(payRecord.amount > 0)) && (
                <div className="space-y-1.5">
                  <Label>
                    Amount (PKR) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    step="1"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    placeholder="Enter calculated amount"
                  />
                  {recordPayType(payRecord) === "percentage" ? (
                    <p className="text-[11px] text-muted-foreground">
                      Pre-filled from tuition × subject share × teacher %. Adjust only if needed.
                    </p>
                  ) : null}
                </div>
              )}
              {recordPayType(payRecord) === "fixed" && payRecord.amount > 0 && (
                <p>
                  <span className="text-muted-foreground">Amount:</span>{" "}
                  <span className="font-semibold">{formatRs(payRecord.amount)}</span>
                </p>
              )}
              <div className="space-y-1.5">
                <Label>Payment method</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="cash">Cash</option>
                  <option value="online">Online</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Notes (optional)</Label>
                <Input
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="Transaction reference"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayRecord(null)}>
              Cancel
            </Button>
            <Button variant="hero" disabled={payMut.isPending} onClick={() => payMut.mutate()}>
              Confirm payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkPayOpen} onOpenChange={(o) => !o && setBulkPayOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pay selected salaries</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              Mark{" "}
              <span className="font-semibold text-[#1a2b4b]">
                {selectedPendingPayable.length} voucher
                {selectedPendingPayable.length === 1 ? "" : "s"}
              </span>{" "}
              as paid for a total of{" "}
              <span className="font-semibold text-[#16A66A]">{formatRs(bulkPayTotal)}</span>.
            </p>
            {selectedPendingNoAmount.length > 0 ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                {selectedPendingNoAmount.length} selected voucher
                {selectedPendingNoAmount.length === 1 ? "" : "s"} have no amount and will be skipped.
                Pay those individually after setting the amount.
              </p>
            ) : null}
            <ul className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 divide-y divide-slate-100">
              {selectedPendingPayable.map((r) => (
                <li
                  key={r._id}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                >
                  <span className="min-w-0 truncate font-medium text-[#1a2b4b]">
                    {staffName(r)}
                    <span className="block font-normal text-muted-foreground">
                      {r.voucherNumber || periodLabel(r)}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-[#16A66A]">
                    {formatRs(r.amount)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="space-y-1.5">
              <Label>Payment method</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="bank_transfer">Bank transfer</option>
                <option value="cash">Cash</option>
                <option value="online">Online</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Input
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Shared reference for this batch"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkPayOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="hero"
              disabled={bulkPayMut.isPending || selectedPendingPayable.length === 0}
              onClick={() => bulkPayMut.mutate()}
            >
              {bulkPayMut.isPending
                ? "Paying…"
                : `Confirm ${selectedPendingPayable.length} payment${selectedPendingPayable.length === 1 ? "" : "s"
                }`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
