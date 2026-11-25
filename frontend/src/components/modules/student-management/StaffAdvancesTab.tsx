import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Ban, Banknote, Clock3, Eye, HandCoins, Landmark, Pencil, Plus, Search, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ModuleActionCaps } from "@/lib/permissions";
import type { Role } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { advanceDetailHref } from "@/lib/panelMenus";
import { useToast } from "@/hooks/use-toast";
import { deliverReportBlob, openReportPreviewTab, type ReportFileFormat } from "@/lib/reportDownload";
import { DefaulterListDownload } from "./DefaulterListDownload";
import {
  exportStaffAdvanceReport,
  fetchStaffAdvanceSummary,
  fetchStaffAdvances,
  type StaffAdvanceReportKind,
  type StaffAdvance,
  type StaffAdvanceStatus,
  type StaffAdvanceType,
} from "@/lib/studentManagementApi";
import FilterToolbar, { FilterToolbarActions } from "@/components/modules/FilterToolbar";
import { DEFAULT_PAGE_SIZE } from "./PageSizeSelect";
import ListPagination from "./ListPagination";
import { MetricCard, SquareCheckbox, StaffAvatar } from "./AcademySalaryManagement";
import { Card } from "@/components/ui/card";
import {
  AdvancePanel,
  advTable,
  AdvanceFormDialog,
  CancelAdvanceDialog,
  METHOD_LABEL,
  RepayAdvanceDialog,
  StatusBadge,
  TypeBadge,
  fmtDate,
  formatRs,
  monthsToRecover,
  periodShort,
  staffOf,
} from "./staffAdvanceShared";

type ExportParams = { type?: string; status?: string; search?: string; staffId?: string; ids?: string[] };

const selectClass =
  "h-10 rounded-md border border-input bg-background px-3 text-sm min-w-[7.5rem] shrink-0";

/**
 * Staff advances & loans list. Own sidebar page (salary permissions) and, with `staffId`,
 * a read-only section on the staff profile. Click a row to open its detail page.
 */
export default function StaffAdvancesTab({
  caps,
  staffId,
}: {
  caps: ModuleActionCaps;
  /** Lock the view to one staff member (staff profile). */
  staffId?: string;
}) {
  const navigate = useNavigate();
  const { role = "admin" } = useParams<{ role: Role }>();
  const locked = Boolean(staffId);
  const { toast } = useToast();
  const [exporting, setExporting] = useState<ReportFileFormat | null>(null);
  const handleExport = async (format: ReportFileFormat, kind: StaffAdvanceReportKind, params: ExportParams) => {
    setExporting(format);
    const preview = openReportPreviewTab(format);
    try {
      const blob = await exportStaffAdvanceReport({ kind, ...params }, format);
      const base = kind === "repayments" ? "Advance-Loan-Repayments" : "Staff-Advances-Loans";
      const mode = deliverReportBlob(blob, `${base}_${new Date().toISOString().slice(0, 10)}.${format}`, format, preview);
      toast({
        title: mode === "preview" ? "Report preview opened" : "Excel downloaded",
        description: mode === "preview" ? "Use Print or Download from the preview window." : "Advances & loans report downloaded.",
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

  const [typeFilter, setTypeFilter] = useState<StaffAdvanceType | "">("");
  const [statusFilter, setStatusFilter] = useState<StaffAdvanceStatus | "">(locked ? "" : "active");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StaffAdvance | null>(null);
  const [repayFor, setRepayFor] = useState<StaffAdvance | null>(null);
  const [cancelFor, setCancelFor] = useState<StaffAdvance | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    setPage(1);
    setSelectedIds([]);
  }, [typeFilter, statusFilter, debounced, pageSize]);

  const { data: summary } = useQuery({
    queryKey: ["staff-advance-summary", staffId || "", typeFilter],
    queryFn: () => fetchStaffAdvanceSummary({ staffId, type: typeFilter }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["staff-advances", staffId || "", typeFilter, statusFilter, debounced, page, pageSize],
    queryFn: () =>
      fetchStaffAdvances({
        staffId,
        type: typeFilter,
        status: statusFilter,
        search: debounced || undefined,
        page,
        limit: pageSize,
      }),
  });

  const records = data?.records ?? [];
  const pagination = data?.pagination;
  const showingFrom = pagination && pagination.total > 0 ? (page - 1) * pagination.limit + 1 : 0;
  const showingTo = pagination ? Math.min(page * pagination.limit, pagination.total) : 0;
  const colCount = locked ? 8 : 9;
  const pageIds = records.map((r) => r._id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
  const somePageSelected = pageIds.some((id) => selectedIds.includes(id));
  const toggleSelectAllPage = () =>
    setSelectedIds((prev) =>
      allPageSelected ? prev.filter((id) => !pageIds.includes(id)) : [...new Set([...prev, ...pageIds])],
    );
  const toggleSelectOne = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (a: StaffAdvance) => {
    setEditing(a);
    setFormOpen(true);
  };

  const body = (
    <div className="space-y-4">
      <div className={cn("grid gap-3 sm:gap-4", locked ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2 xl:grid-cols-4")}>
        <MetricCard
          title="Still Owed"
          value={formatRs(summary?.totalOutstanding)}
          description={`${summary?.activeCount ?? 0} active advance / loan`}
          icon={Clock3}
          iconBg="#FFEDD5"
          iconColor="#EA580C"
          valueClass="text-[#EA580C]"
        />
        <MetricCard
          title="Advances Owed"
          value={formatRs(summary?.advanceOutstanding)}
          description="Taken back from next salary"
          icon={HandCoins}
          iconBg="hsl(var(--accent) / 0.18)"
          iconColor="hsl(var(--accent))"
          valueClass="text-primary"
        />
        <MetricCard
          title="Loans Owed"
          value={formatRs(summary?.loanOutstanding)}
          description="Taken back in installments"
          icon={Landmark}
          iconBg="hsl(var(--primary) / 0.1)"
          iconColor="hsl(var(--primary))"
          valueClass="text-primary"
        />
        <MetricCard
          title="Recovered"
          value={formatRs(summary?.totalRecovered)}
          description={`of ${formatRs(summary?.totalGiven)} given`}
          icon={Wallet}
          iconBg="#DCFCE7"
          iconColor="#16A66A"
          valueClass="text-[#16A66A]"
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
        <FilterToolbar>
          <select
            className={selectClass}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as StaffAdvanceType | "")}
            aria-label="Type"
          >
            <option value="">Advances & loans</option>
            <option value="advance">Advances only</option>
            <option value="loan">Loans only</option>
          </select>
          <select
            className={selectClass}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StaffAdvanceStatus | "")}
            aria-label="Status"
          >
            <option value="">All statuses</option>
            <option value="active">Active (still owed)</option>
            <option value="closed">Recovered</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {!locked ? (
            <div className="relative w-full min-w-[12rem] sm:max-w-md sm:flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search staff, phone, designation..."
                className="h-10 pl-9"
              />
            </div>
          ) : null}

          <FilterToolbarActions className="sm:ml-auto">
            <DefaulterListDownload
              variant="outline"
              size="default"
              className="shrink-0 bg-white"
              label="Print / Export"
              exporting={exporting}
              reportKinds={[
                { id: "list", label: "Advances & Loans Report" },
                { id: "repayments", label: "Repayment History" },
              ]}
              onDownload={(format, kind) =>
                void handleExport(format, kind === "repayments" ? "repayments" : "list", {
                  type: typeFilter || undefined,
                  status: statusFilter || undefined,
                  search: debounced || undefined,
                  staffId: staffId || undefined,
                  ids: selectedIds.length > 0 ? selectedIds : undefined,
                })
              }
            />
            {caps.canCreate ? (
              <Button
                className="gap-2 h-10 shrink-0 rounded-md font-semibold shadow-md"
                onClick={openCreate}
              >
                <Plus className="h-4 w-4" />
                Give Advance / Loan
              </Button>
            ) : null}
          </FilterToolbarActions>
        </FilterToolbar>
      </div>

      {locked ? (
        <AdvancePanel
          title="Advances & Loans"
          icon={HandCoins}
          right={pagination ? `${pagination.total} ${pagination.total === 1 ? "record" : "records"}` : undefined}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={advTable.head}>
                <tr>
                  {!locked ? <th className={advTable.th}>Staff</th> : null}
                  <th className={advTable.th}>Type</th>
                  <th className={advTable.th}>Amount</th>
                  <th className={advTable.th}>Monthly deduction</th>
                  <th className={cn(advTable.th, "min-w-[10rem]")}>Recovered</th>
                  <th className={advTable.th}>Remaining</th>
                  <th className={advTable.th}>Given on</th>
                  <th className={advTable.th}>Status</th>
                  <th className={advTable.thRight}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={colCount} className="p-10 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                ) : null}
                {!isLoading && records.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="p-10 text-center text-muted-foreground">
                      No advances or loans {statusFilter === "active" ? "are owed right now" : "found"}.
                    </td>
                  </tr>
                ) : null}
                {records.map((a) => {
                  const staff = staffOf(a);
                  const pct = a.amount > 0 ? Math.min(100, (a.recoveredAmount / a.amount) * 100) : 0;
                  const months = monthsToRecover(a.remainingAmount, a.installmentAmount);
                  const detailHref = advanceDetailHref(role, a._id);
                  const isActive = a.status === "active";
                  return (
                    <tr
                      key={a._id}
                      className={cn(advTable.row, "align-middle cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40")}
                      onClick={() => navigate(detailHref)}
                      title="Open details"
                    >
                      {!locked ? (
                        <td className="px-4 py-3.5">
                          <div className="font-medium text-primary">{staff?.name || "—"}</div>
                          <div className="text-[11px] capitalize text-muted-foreground">
                            {staff?.designation || staff?.role?.name?.replace(/_/g, " ") || ""}
                          </div>
                        </td>
                      ) : null}
                      <td className="px-4 py-3.5">
                        <TypeBadge type={a.type} />
                      </td>
                      <td className="px-4 py-3.5 font-semibold tabular-nums">{formatRs(a.amount)}</td>
                      <td className="px-4 py-3.5 tabular-nums">
                        {a.type === "loan" ? (
                          <>
                            {formatRs(a.installmentAmount)}
                            {isActive && months > 0 ? (
                              <span className="block text-[11px] text-muted-foreground">
                                ~{months} month{months === 1 ? "" : "s"} left
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-muted-foreground">Full, next salary</span>
                        )}
                        <span className="block text-[11px] text-muted-foreground">
                          from {periodShort(a.startMonth, a.startYear)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="tabular-nums text-[#16A66A] font-medium">{formatRs(a.recoveredAmount)}</div>
                        <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
                          <div className="h-1.5 rounded-full bg-accent" style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-semibold tabular-nums text-[#EA580C]">
                        {a.status === "cancelled" ? "—" : formatRs(a.remainingAmount)}
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground">
                        {fmtDate(a.givenDate)}
                        <span className="block text-[11px]">{METHOD_LABEL[a.paymentMethod || ""] || ""}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={a.status} />
                      </td>
                      <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-0.5">
                          {caps.canEdit && isActive ? (
                            <Button
                              variant="default"
                              size="sm"
                              className="h-8 gap-1 mr-1"
                              onClick={() => setRepayFor(a)}
                              title="Receive payment"
                            >
                              <Banknote className="h-3.5 w-3.5" /> Receive
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                            asChild
                            aria-label="View details"
                            title="View details"
                          >
                            <Link to={detailHref}>
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                          {caps.canEdit && isActive ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-sky-600 hover:text-sky-700"
                              onClick={() => openEdit(a)}
                              aria-label="Edit"
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          ) : null}
                          {caps.canDelete && isActive && a.recoveredAmount <= 0 ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setCancelFor(a)}
                              aria-label="Cancel"
                              title="Cancel"
                            >
                              <Ban className="h-4 w-4 text-destructive" />
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pagination && pagination.total > 0 ? (
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
              noun="records"
            />
          ) : null}
        </AdvancePanel>
      ) : (
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
                  <th className="text-left p-3 font-medium">Staff</th>
                  <th className="text-left p-3 font-medium">Type</th>
                  <th className="text-left p-3 font-medium">Amount</th>
                  <th className="text-left p-3 font-medium whitespace-nowrap">Monthly deduction</th>
                  <th className="text-left p-3 font-medium min-w-[9rem]">Recovered</th>
                  <th className="text-left p-3 font-medium">Remaining</th>
                  <th className="text-left p-3 font-medium whitespace-nowrap">Given on</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-right p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={10} className="p-10 text-center text-muted-foreground">
                      Loading advances & loans…
                    </td>
                  </tr>
                ) : null}
                {!isLoading && records.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-10 text-center text-muted-foreground">
                      No advances or loans {statusFilter === "active" ? "are owed right now" : "found"}.
                    </td>
                  </tr>
                ) : null}
                {records.map((a) => {
                  const staff = staffOf(a);
                  const name = staff?.name || "—";
                  const roleText = staff?.designation || staff?.role?.name?.replace(/_/g, " ") || "—";
                  const detailHref = advanceDetailHref(role, a._id);
                  const isActive = a.status === "active";
                  const isSelected = selectedIds.includes(a._id);
                  const months = monthsToRecover(a.remainingAmount, a.installmentAmount);
                  const canCancel = caps.canDelete && isActive && a.recoveredAmount <= 0;
                  const pct = a.amount > 0 ? Math.min(100, (a.recoveredAmount / a.amount) * 100) : 0;
                  return (
                    <tr
                      key={a._id}
                      className={cn(
                        "border-b last:border-0 hover:bg-muted/20 cursor-pointer",
                        isSelected && "bg-muted/40",
                      )}
                      onClick={() => navigate(detailHref)}
                      title="Open details"
                    >
                      <td className="w-10 p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <SquareCheckbox
                          checked={isSelected}
                          onChange={() => toggleSelectOne(a._id)}
                          aria-label={`Select ${name}`}
                        />
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <StaffAvatar name={name} profileImage={staff?.profileImage} />
                          <div className="min-w-0">
                            <div className="font-semibold text-[#1a2b4b] truncate hover:underline">{name}</div>
                            <div className="text-xs capitalize text-muted-foreground">{roleText}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        {a.type === "loan" ? (
                          <span className="inline-flex items-center rounded-full bg-[#ede9fe] px-2.5 py-0.5 text-xs font-semibold text-[#7c3aed]">
                            Loan
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-[#ccfbf1] px-2.5 py-0.5 text-xs font-semibold text-[#0f766e]">
                            Advance
                          </span>
                        )}
                      </td>
                      <td className="p-3 font-semibold text-[#16A66A] whitespace-nowrap">{formatRs(a.amount)}</td>
                      <td className="p-3 text-slate-600 whitespace-nowrap">
                        {a.type === "loan" ? (
                          <>
                            {formatRs(a.installmentAmount)}
                            {isActive && months > 0 ? (
                              <span className="block text-xs text-muted-foreground">
                                ~{months} month{months === 1 ? "" : "s"} left
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-muted-foreground">Full, next salary</span>
                        )}
                        <span className="block text-xs text-muted-foreground">
                          from {periodShort(a.startMonth, a.startYear)}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="font-semibold text-[#16A66A] whitespace-nowrap">{formatRs(a.recoveredAmount)}</div>
                        <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
                          <div className="h-1.5 rounded-full bg-accent" style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                      <td className="p-3 font-semibold text-[#EA580C] whitespace-nowrap">
                        {a.status === "cancelled" ? "—" : formatRs(a.remainingAmount)}
                      </td>
                      <td className="p-3 text-slate-600 whitespace-nowrap">
                        {fmtDate(a.givenDate)}
                        <span className="block text-xs text-muted-foreground">{METHOD_LABEL[a.paymentMethod || ""] || ""}</span>
                      </td>
                      <td className="p-3">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                            a.status === "active" && "bg-orange-50 text-orange-700",
                            a.status === "closed" && "bg-emerald-50 text-emerald-700",
                            a.status === "cancelled" && "bg-muted text-muted-foreground",
                          )}
                        >
                          {a.status === "active" ? "Active" : a.status === "closed" ? "Recovered" : "Cancelled"}
                        </span>
                      </td>
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-0.5">
                          {caps.canEdit && isActive ? (
                            <Button
                              variant="default"
                              size="sm"
                              className="h-8 gap-1 mr-1"
                              onClick={() => setRepayFor(a)}
                              title="Receive payment"
                            >
                              <Banknote className="h-3.5 w-3.5" /> Receive
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                            asChild
                            aria-label="View details"
                            title="View details"
                          >
                            <Link to={detailHref}>
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                          {caps.canEdit && isActive ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-sky-600 hover:text-sky-700"
                              onClick={() => openEdit(a)}
                              aria-label="Edit"
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          ) : null}
                          {canCancel ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setCancelFor(a)}
                              aria-label="Cancel"
                              title="Cancel"
                            >
                              <Ban className="h-4 w-4 text-destructive" />
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pagination && pagination.total > 0 ? (
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
              noun="records"
            />
          ) : null}
        </Card>
      )}

      <AdvanceFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} lockedStaffId={staffId} />
      <RepayAdvanceDialog advance={repayFor} onClose={() => setRepayFor(null)} />
      <CancelAdvanceDialog advance={cancelFor} onClose={() => setCancelFor(null)} />
    </div>
  );

  if (locked) return body;

  return (
    <div className="min-h-full bg-slate-50 px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      {/* Compact theme header — matches Staff Salary */}
      <div className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
              <HandCoins className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight">
                Advances & Loans
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500 max-w-md">
                Give staff advances or loans and recover them automatically from salary.
              </p>
            </div>
          </div>
          <div className="shrink-0 rounded-lg bg-primary/10 px-3 py-2 max-w-[14rem]">
            <p className="text-xs sm:text-sm italic leading-snug text-[#1a2b4b]/80">
              <span className="mr-1 text-primary not-italic font-serif text-base leading-none">&ldquo;</span>
              A great school builds great futures.
              <span className="ml-0.5 text-primary not-italic font-serif text-base leading-none">&rdquo;</span>
            </p>
          </div>
        </div>
      </div>
      {body}
    </div>
  );
}
