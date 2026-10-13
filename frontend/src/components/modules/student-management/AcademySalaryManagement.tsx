import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Coins,
  Download,
  FileSpreadsheet,
  FileText,
  Minus,
  MoreVertical,
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
  generateMonthlySalaries,
  payAcademySalary,
  type AcademySalaryRecord,
} from "@/lib/studentManagementApi";
import { MONTH_NAMES } from "./studentDisplayUtils";
import PageSizeSelect, { DEFAULT_PAGE_SIZE } from "./PageSizeSelect";

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

function pageWindow(current: number, totalPages: number, max = 5): number[] {
  if (totalPages <= max) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const half = Math.floor(max / 2);
  let start = Math.max(1, current - half);
  let end = start + max - 1;
  if (end > totalPages) {
    end = totalPages;
    start = Math.max(1, end - max + 1);
  }
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
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

function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function recordsToCsv(records: AcademySalaryRecord[]) {
  const header = [
    "Voucher",
    "Staff",
    "Role",
    "Period",
    "Pay type",
    "Rate / Base",
    "Amount",
    "Status",
  ];
  const rows = records.map((r) => {
    const payType = recordPayType(r);
    const pct = recordPercentage(r);
    const staff = staffFromRecord(r);
    const rateOrBase =
      payType === "percentage" ? `${pct}%` : String(staff?.salary ?? 0);
    return [
      r.voucherNumber || "",
      staffName(r),
      staffRole(r),
      periodLabel(r),
      payType,
      rateOrBase,
      String(r.amount ?? 0),
      r.status,
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(",");
  });
  return [header.join(","), ...rows].join("\n");
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
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [exporting, setExporting] = useState(false);

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

  const showingFrom =
    pagination && pagination.total > 0 ? (page - 1) * pagination.limit + 1 : 0;
  const showingTo = pagination ? Math.min(page * pagination.limit, pagination.total) : 0;
  const pages = pageWindow(page, pagination?.pages ?? 1);

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
    setPayRecord(r);
    setPaymentMethod("bank_transfer");
    setPaymentNotes("");
    setPayAmount(r.amount > 0 ? String(r.amount) : "");
  };

  const handleExport = async (format: "csv" | "txt") => {
    setExporting(true);
    try {
      const result = await fetchAcademySalaries({
        page: 1,
        limit: 500,
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        ...filterParams,
      });
      const list =
        selectedIds.length > 0
          ? result.records.filter((r) => selectedIds.includes(r._id))
          : result.records;
      if (list.length === 0) {
        toast({ title: "Nothing to export", description: "No salary records match the filters." });
        return;
      }
      const csv = recordsToCsv(list);
      const stamp = `${year}-${String(month).padStart(2, "0")}`;
      if (format === "csv") {
        downloadTextFile(`staff-salaries-${stamp}.csv`, csv, "text/csv;charset=utf-8");
      } else {
        downloadTextFile(`staff-salaries-${stamp}.txt`, csv, "text/plain;charset=utf-8");
      }
      toast({ title: "Export ready", description: `${list.length} record(s) downloaded.` });
    } catch (e) {
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : "Could not export",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      <Card className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#3b82f6]">
              <Coins className="h-5 w-5 text-white" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-slate-400">
                Finance <span className="mx-1 text-slate-300">›</span> Staff Salary
              </p>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight">
                Staff Salary
              </h1>
            </div>
          </div>
          <div className="shrink-0 rounded-lg bg-[#e8f2ff] px-3 py-2 max-w-[15rem]">
            <p className="text-xs sm:text-sm italic leading-snug text-[#1a2b4b]/80">
              <span className="mr-1 text-[#3b82f6] not-italic font-serif text-base leading-none">
                &ldquo;
              </span>
              A great school builds great futures.
              <span className="ml-0.5 text-[#3b82f6] not-italic font-serif text-base leading-none">
                &rdquo;
              </span>
            </p>
          </div>
        </div>
      </Card>

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

      <Card className="p-3 sm:p-4 shadow-sm border-border/80">
        <div className="flex flex-wrap items-center gap-2">
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

          {canGenerate && (
            <Button
              className="gap-2 h-10 shrink-0"
              disabled={genMut.isPending}
              onClick={() => genMut.mutate()}
            >
              <CalendarPlus className="h-4 w-4" />
              {genMut.isPending ? "Generating…" : "Generate monthly salaries"}
            </Button>
          )}

          <div className="relative min-w-[12rem] flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search staff, role, voucher..."
              className="h-10 pl-9"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-1.5 h-10 shrink-0 ml-auto" disabled={exporting}>
                <Download className="h-4 w-4" />
                {exporting ? "Exporting…" : "Export"}
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="gap-2" onClick={() => void handleExport("csv")}>
                <FileSpreadsheet className="h-4 w-4" />
                Excel / CSV (.csv)
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2" onClick={() => void handleExport("txt")}>
                <FileText className="h-4 w-4" />
                Text report (.txt)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Card>

      <Card className="overflow-hidden shadow-sm border-border/80">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b bg-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#dbeafe] text-[#2563eb]">
            <Users className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[#1a2b4b]">Staff Salary Records</h2>
            <p className="text-xs text-muted-foreground">
              {pagination && pagination.total > 0
                ? `Showing ${showingFrom} to ${showingTo} of ${pagination.total} staff`
                : "No records for this period"}
            </p>
          </div>
        </div>

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
                    No salary vouchers for this period. Generate monthly salaries after setting staff
                    pay type (fixed or percentage) in Staff management.
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
                return (
                  <tr
                    key={r._id}
                    className={cn(
                      "border-b last:border-0 hover:bg-muted/20",
                      isSelected && "bg-muted/40",
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
                      <div className="flex items-center gap-2.5 min-w-0">
                        <StaffAvatar name={name} profileImage={staff?.profileImage} />
                        <div className="min-w-0">
                          <div className="font-semibold text-[#1a2b4b] truncate">{name}</div>
                          <div className="text-xs text-muted-foreground">
                            {payType === "percentage"
                              ? `Rate: ${pct}%`
                              : `Base: ${formatRs(staff?.salary)}`}
                          </div>
                        </div>
                      </div>
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
                        <span className="font-semibold text-[#16A66A]">{formatRs(r.amount)}</span>
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
                          {r.status === "paid" && r.paidAt ? (
                            <DropdownMenuItem disabled>
                              Paid {new Date(r.paidAt).toLocaleDateString()}
                            </DropdownMenuItem>
                          ) : null}
                          {!payable && r.status !== "paid" ? (
                            <DropdownMenuItem disabled>No actions</DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {pagination && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-t bg-muted/10">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted-foreground">
                Showing{" "}
                <span className="font-medium text-foreground">{showingFrom}</span>
                {" to "}
                <span className="font-medium text-foreground">{showingTo}</span>
                {" of "}
                <span className="font-medium text-foreground">{pagination.total}</span>
                {" staff"}
              </p>
              <PageSizeSelect
                value={pageSize}
                onChange={(n) => {
                  setPageSize(n);
                  setPage(1);
                }}
              />
            </div>

            {pagination.pages > 1 && (
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {pages.map((n) => (
                  <Button
                    key={n}
                    variant={n === page ? "default" : "outline"}
                    size="icon"
                    className="h-8 w-8 text-sm"
                    onClick={() => setPage(n)}
                    aria-label={`Page ${n}`}
                    aria-current={n === page ? "page" : undefined}
                  >
                    {n}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page >= pagination.pages}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      <Dialog open={Boolean(payRecord)} onOpenChange={(o) => !o && setPayRecord(null)}>
        <DialogContent className="sm:max-w-md">
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
                      Enter the PKR amount for this month based on the agreed percentage of fees.
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
    </div>
  );
}
