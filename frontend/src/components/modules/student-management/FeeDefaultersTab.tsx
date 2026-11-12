import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  CalendarX,
  FileText,
  Loader2,
  Phone,
  Printer,
  Receipt,
  ReceiptText,
  Search,
  TriangleAlert,
  UserX,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useAuth } from "@/hooks/useAuth";
import type { ModuleActionCaps } from "@/lib/permissions";
import {
  exportFeeDefaultersMonthWise,
  type DefaulterReportFormat,
  fetchAcademyClasses,
  fetchAcademyFees,
  waiveAcademyFee,
  type AcademyFeeRecord,
  fetchFeeDefaulters,
  fetchFeeDefaultersSummary,
  printFeeChallan,
  type FeeDefaulter,
  type FeeReceiptSize,
} from "@/lib/studentManagementApi";
import { academyStudentRoutes } from "@/lib/studentManagementMenus";
import ClassProgramSelect from "@/components/modules/ClassProgramSelect";
import { DateRangePickerField } from "@/components/ui/date-range-picker";
import { DefaulterListDownload } from "./DefaulterListDownload";
import { FeeMetricCard } from "./FeeMetricCards";
import { deliverReportBlob, openReportPreviewTab } from "@/lib/reportDownload";
import {
  ChallanPrintDialog,
  type ChallanPrintRequest,
} from "./ChallanPrintDialog";
import { DEFAULT_PAGE_SIZE } from "./PageSizeSelect";
import ListPagination from "./ListPagination";
import { useSessionScope } from "@/components/modules/timetable/SessionBar";
import { formatDate, formatPkr } from "./studentDisplayUtils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function feePeriod(r: AcademyFeeRecord) {
  if (r.feeType === "admission") return "Admission";
  return `${MONTHS[(r.month || 1) - 1]} ${r.year}`;
}

/** Pick one of a defaulter's unpaid months and waive it with a reason (same rules as Fees Management). */
function WaiveDefaulterMonthDialog({
  defaulter,
  onClose,
}: {
  defaulter: FeeDefaulter | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const studentId = defaulter?.student._id ?? "";
  const [feeId, setFeeId] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    setFeeId("");
    setReason("");
  }, [studentId]);

  const { data: months = [], isLoading } = useQuery({
    queryKey: ["defaulter-waivable-months", studentId],
    enabled: Boolean(studentId),
    queryFn: async () => {
      const [pending, overdue] = await Promise.all([
        fetchAcademyFees({ studentId, status: "pending", limit: 100 }),
        fetchAcademyFees({ studentId, status: "overdue", limit: 100 }),
      ]);
      return [...overdue.records, ...pending.records]
        .filter((r) => r.feeType !== "admission")
        .sort((a, b) => a.year - b.year || a.month - b.month);
    },
  });

  const waiveMut = useMutation({
    mutationFn: () => waiveAcademyFee(feeId, reason.trim()),
    onSuccess: (updated) => {
      ["academy-fees", "academy-fees-summary", "academy-fee-history", "academy-student-record",
        "fee-defaulters", "fee-defaulters-summary", "defaulter-waivable-months"].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k] })
      );
      toast({
        title: "Month waived",
        description: `${feePeriod(updated)} is no longer counted as a defaulter.`,
      });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Could not waive fee", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog
      open={Boolean(defaulter)}
      onOpenChange={(open) => {
        if (!open && !waiveMut.isPending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Waive a month</DialogTitle>
          <DialogDescription>
            {defaulter ? `${defaulter.student.studentName} — ` : ""}
            the month stays in the fee history and is not counted as a defaulter. Use this for a month the
            student was away. A month they attended and did not pay should stay unpaid.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Month</Label>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading unpaid months…</p>
          ) : months.length === 0 ? (
            <p className="text-sm text-muted-foreground">No unpaid monthly fees that can be waived.</p>
          ) : (
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
              {months.map((m) => (
                <label key={m._id} className="flex cursor-pointer items-center justify-between gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted/50">
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="waive-month"
                      className="h-4 w-4"
                      checked={feeId === m._id}
                      onChange={() => setFeeId(m._id)}
                    />
                    {feePeriod(m)}
                    <span className="text-xs text-muted-foreground">({m.status})</span>
                  </span>
                  <span className="text-muted-foreground">{formatPkr(m.amount)}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="defaulter-waive-reason">Reason</Label>
          <Input
            id="defaulter-waive-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Away in village for the whole month"
            maxLength={500}
          />
          <p className="text-xs text-muted-foreground">Required, at least 3 characters.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={waiveMut.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="hero"
            disabled={waiveMut.isPending || !feeId || reason.trim().length < 3}
            onClick={() => waiveMut.mutate()}
          >
            {waiveMut.isPending ? "Saving…" : "Waive month"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SeverityBadge({ days }: { days: number }) {
  if (days >= 30) {
    return (
      <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-destructive/15 text-destructive">
        Critical ({days}d)
      </span>
    );
  }
  if (days >= 7) {
    return (
      <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-amber-500/15 text-amber-700 dark:text-amber-400">
        Overdue ({days}d)
      </span>
    );
  }
  if (days > 0) {
    return (
      <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-amber-500/10 text-amber-700 dark:text-amber-400">
        {days}d late
      </span>
    );
  }
  return (
    <span className="text-xs font-semibold rounded-full px-2 py-0.5 bg-muted text-muted-foreground">
      Due soon
    </span>
  );
}

export default function FeeDefaultersTab({
  caps,
  sessionId = "",
  onCollectFee,
}: {
  caps: ModuleActionCaps;
  sessionId?: string;
  /** Opens the Collect Student Fee window for this student (falls back to the student page). */
  onCollectFee?: (studentId: string) => void;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const routes = user?.role ? academyStudentRoutes(user.role, "records") : null;
  const { apiSessionId, hasScope } = useSessionScope(sessionId);

  /** Billing-month range (From / To). Empty = all unpaid months. */
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [exportingMonthWise, setExportingMonthWise] = useState<DefaulterReportFormat | null>(null);
  const [challanPrint, setChallanPrint] = useState<ChallanPrintRequest | null>(null);
  const [waiveDefaulter, setWaiveDefaulter] = useState<FeeDefaulter | null>(null);
  const canWaive = caps.canEdit || caps.canCreate;

  const printMut = useMutation({
    mutationFn: ({
      studentId,
      size,
      chargeIds,
    }: {
      studentId: string;
      size: FeeReceiptSize;
      chargeIds?: string[];
    }) => printFeeChallan(studentId, size, undefined, chargeIds),
    onSuccess: () => setChallanPrint(null),
    onError: (e: Error) =>
      toast({ title: "Could not print challan", description: e.message, variant: "destructive" }),
  });

  const filterParams = useMemo(
    () => ({
      periodFrom: rangeFrom || undefined,
      periodTo: rangeTo || undefined,
      classId: classFilter || undefined,
      search: search.trim() || undefined,
      sessionId: apiSessionId,
    }),
    [rangeFrom, rangeTo, classFilter, search, apiSessionId]
  );

  useEffect(() => {
    setPage(1);
  }, [rangeFrom, rangeTo, classFilter, search]);

  useEffect(() => {
    setClassFilter("");
    setPage(1);
  }, [sessionId]);

  const { data: classes = [] } = useQuery({
    queryKey: ["academy-classes", sessionId],
    queryFn: () => fetchAcademyClasses({ status: "active", sessionId: apiSessionId }),
    enabled: hasScope,
  });

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["fee-defaulters-summary", filterParams],
    queryFn: () =>
      fetchFeeDefaultersSummary({
        classId: filterParams.classId,
        periodFrom: filterParams.periodFrom,
        periodTo: filterParams.periodTo,
        sessionId: filterParams.sessionId,
      }),
    enabled: hasScope,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["fee-defaulters", page, pageSize, filterParams],
    queryFn: () =>
      fetchFeeDefaulters({
        page,
        limit: pageSize,
        ...filterParams,
      }),
    enabled: hasScope,
  });

  const defaulters = data?.defaulters ?? [];
  const pagination = data?.pagination;

  const handleMonthWiseExport = async (format: DefaulterReportFormat) => {
    setExportingMonthWise(format);
    const preview = openReportPreviewTab(format);
    try {
      const blob = await exportFeeDefaultersMonthWise(filterParams, format);
      const period = rangeFrom && rangeTo ? `${rangeFrom}_to_${rangeTo}` : "All";
      const mode = deliverReportBlob(
        blob,
        `Fee-Defaulters_${period}.${format}`,
        format,
        preview,
      );
      toast({
        title: mode === "preview" ? "Report preview opened" : "Excel downloaded",
        description:
          mode === "preview" ? "Use Print or Download from the preview window." : undefined,
      });
    } catch (e) {
      preview?.close();
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setExportingMonthWise(null);
    }
  };

  const canExport = caps.canView;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-bold text-primary flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          Fee defaulters
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 min-[1101px]:grid-cols-4">
        <FeeMetricCard
          title="Defaulters"
          value={summaryLoading ? "…" : String(summary?.defaulterCount ?? 0)}
          description="students with unpaid fees"
          icon={UserX}
          variant="purple"
        />
        <FeeMetricCard
          title="Outstanding"
          value={summaryLoading ? "…" : formatPkr(summary?.totalOutstanding)}
          description="total amount due"
          icon={TriangleAlert}
          variant="danger"
        />
        <FeeMetricCard
          title="Unpaid Vouchers"
          value={summaryLoading ? "…" : String(summary?.totalUnpaidVouchers ?? 0)}
          description="pending and overdue"
          icon={ReceiptText}
          variant="primary"
        />
        <FeeMetricCard
          title="Overdue Vouchers"
          value={summaryLoading ? "…" : String(summary?.overdueVouchers ?? 0)}
          description="past their due date"
          icon={CalendarClock}
          variant="danger"
        />
      </div>

      <Card className="p-3">
        <div className="grid grid-cols-1 items-center gap-3 min-[480px]:grid-cols-2 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.6fr)_auto]">
          <div className="flex min-w-0 items-center gap-1 min-[480px]:col-span-2 lg:col-span-1">
            <DateRangePickerField
              from={rangeFrom}
              to={rangeTo}
              onChange={(nextFrom, nextTo) => {
                setRangeFrom(nextFrom);
                setRangeTo(nextTo);
              }}
              className="h-9"
            />
            {rangeFrom || rangeTo ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 text-muted-foreground"
                onClick={() => {
                  setRangeFrom("");
                  setRangeTo("");
                }}
                aria-label="Show all months"
                title="Show all months"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
          <ClassProgramSelect
            className="min-w-0 sm:min-w-0"
            label={false}
            value={classFilter}
            onChange={setClassFilter}
            classes={classes}
            allowAll
            allLabel="All classes (School + College)"
            selectClassName="h-9 rounded-md"
          />
          <div className="relative min-w-0 min-[480px]:col-span-2 lg:col-span-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 w-full pl-8 pr-8 text-sm"
              placeholder="Search student, father, phone, ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search defaulters"
            />
            {search ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0.5 top-0.5 h-8 w-8 text-muted-foreground"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
          {canExport && (
            <DefaulterListDownload
              variant="default"
              className="w-full justify-center min-[480px]:col-span-2 lg:col-span-1 lg:w-auto"
              label="Defaulter list"
              exporting={exportingMonthWise}
              onDownload={(format) => void handleMonthWiseExport(format)}
            />
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left p-2.5 font-medium">Student</th>
                <th className="text-left p-2.5 font-medium hidden sm:table-cell">Father</th>
                <th className="text-left p-2.5 font-medium hidden lg:table-cell">Contact</th>
                <th className="text-left p-2.5 font-medium hidden md:table-cell">Class</th>
                <th className="text-left p-2.5 font-medium hidden md:table-cell">Section</th>
                <th className="text-left p-2.5 font-medium">Total due</th>
                <th className="text-left p-2.5 font-medium">Vouchers</th>
                <th className="text-left p-2.5 font-medium">Oldest due</th>
                <th className="text-left p-2.5 font-medium">Severity</th>
                <th className="text-right p-2.5 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-muted-foreground">
                    Loading defaulters…
                  </td>
                </tr>
              )}
              {!isLoading && defaulters.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-muted-foreground">
                    No fee defaulters for the selected filters. All students are up to date.
                  </td>
                </tr>
              )}
              {defaulters.map((d: FeeDefaulter) => {
                const detailHref = routes ? routes.detail(d.student._id) : null;
                const tel = d.student.phone?.replace(/\s/g, "");
                const rollOrId = d.student.rollNumber || d.student.studentId;
                return (
                  <tr key={d.studentId} className="border-b last:border-0 bg-red-500/10 text-red-700 dark:text-red-300">
                    <td className="p-2.5">
                      {detailHref ? (
                        <Link to={detailHref} className="font-semibold text-red-700 dark:text-red-300 hover:underline">
                          {d.student.studentName}
                        </Link>
                      ) : (
                        <div className="font-semibold text-red-700 dark:text-red-300">{d.student.studentName}</div>
                      )}
                      <p className="text-xs text-muted-foreground">{rollOrId}</p>
                      <p className="text-xs text-muted-foreground sm:hidden">{d.student.fatherName}</p>
                      <p className="text-xs text-muted-foreground md:hidden">
                        {[d.className, d.sectionName].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </td>
                    <td className="p-2.5 hidden sm:table-cell">{d.student.fatherName || "—"}</td>
                    <td className="p-2.5 hidden lg:table-cell">
                      {tel ? (
                        <a
                          href={`tel:${tel}`}
                          className="text-primary inline-flex items-center gap-1 hover:underline"
                        >
                          <Phone className="h-3 w-3" />
                          {d.student.phone}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-2.5 hidden md:table-cell">{d.className || "—"}</td>
                    <td className="p-2.5 hidden md:table-cell">{d.sectionName || "—"}</td>
                    <td className="p-2.5 font-semibold text-destructive">{formatPkr(d.totalDue)}</td>
                    <td className="p-2.5">
                      <span className="font-medium">{d.unpaidCount}</span>
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        ({d.overdueCount} overdue)
                      </span>
                    </td>
                    <td className="p-2.5">{formatDate(d.oldestDueDate)}</td>
                    <td className="p-2.5">
                      <SeverityBadge days={d.daysOverdue} />
                    </td>
                    <td className="p-2.5 text-right">
                      <div className="inline-flex flex-nowrap items-center justify-end gap-1">
                        {(caps.canEdit || caps.canCreate) && onCollectFee ? (
                          <Button
                            size="sm"
                            variant="hero"
                            className="mr-1 shrink-0"
                            onClick={() => onCollectFee(d.student._id)}
                          >
                            Collect fee
                          </Button>
                        ) : (caps.canEdit || caps.canCreate) && detailHref ? (
                          <Button size="sm" variant="hero" className="mr-1 shrink-0" asChild>
                            <Link to={detailHref}>Collect fee</Link>
                          </Button>
                        ) : null}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-primary"
                              disabled={printMut.isPending && printMut.variables?.studentId === d.student._id}
                              aria-label="Print challan"
                              title="Print challan"
                            >
                              {printMut.isPending && printMut.variables?.studentId === d.student._id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Printer className="h-4 w-4" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="gap-2"
                              onClick={() => setChallanPrint({ studentId: d.student._id, size: "a4" })}
                            >
                              <FileText className="h-4 w-4" />
                              A4
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="gap-2"
                              onClick={() => setChallanPrint({ studentId: d.student._id, size: "thermal" })}
                            >
                              <Receipt className="h-4 w-4" />
                              Thermal
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {canWaive && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-violet-600 hover:text-violet-700 hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-500/10"
                            aria-label="Waive month"
                            title="Waive month"
                            onClick={() => setWaiveDefaulter(d)}
                          >
                            <CalendarX className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
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
            pageSize={pageSize}
            onPageSizeChange={(n) => {
              setPageSize(n);
              setPage(1);
            }}
            onPageChange={setPage}
            noun="defaulters"
          />
        )}
      </Card>

      <ChallanPrintDialog
        request={challanPrint}
        onClose={() => setChallanPrint(null)}
        confirming={printMut.isPending}
        onConfirm={(chargeIds) => {
          if (!challanPrint) return;
          printMut.mutate({ ...challanPrint, chargeIds });
        }}
      />

      <WaiveDefaulterMonthDialog defaulter={waiveDefaulter} onClose={() => setWaiveDefaulter(null)} />
    </div>
  );
}
