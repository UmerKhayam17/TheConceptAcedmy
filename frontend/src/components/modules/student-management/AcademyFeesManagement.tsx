import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, FileText, Loader2, Printer, Receipt } from "lucide-react";
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
import { useAuth } from "@/hooks/useAuth";
import type { ModuleActionCaps } from "@/lib/permissions";
import {
  fetchAcademyClasses,
  fetchAcademyFeeSummary,
  fetchAcademyFees,
  fetchAcademyStudents,
  generateMonthlyFees,
  payAcademyFee,
  printFeeReceipt,
  type AcademyFeeRecord,
  type AcademyStudentRoutes,
  type FeeReceiptSize,
} from "@/lib/studentManagementApi";
import { academyStudentRoutes } from "@/lib/studentManagementMenus";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import { matchesPanelSearch } from "@/lib/panelSearch";
import { useSessionScope } from "@/components/modules/timetable/SessionBar";
import { formatPkr, MONTH_NAMES } from "./studentDisplayUtils";

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

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    overdue: "bg-destructive/15 text-destructive",
    waived: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`text-xs font-semibold rounded-full px-2 py-0.5 capitalize ${
        colors[status] || "bg-muted text-muted-foreground"
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
  const [statusFilter, setStatusFilter] = useState("");
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
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentNotes, setPaymentNotes] = useState("");

  const effectiveStudentId = studentId || (isParent ? selectedParentStudentId || undefined : undefined);

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

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["academy-fees-summary", filterParams],
    queryFn: () => fetchAcademyFeeSummary(filterParams),
    enabled: scopeEnabled,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["academy-fees", page, statusFilter, feeTypeFilter, filterParams],
    queryFn: () =>
      fetchAcademyFees({
        page,
        limit: 20,
        status: statusFilter || undefined,
        feeType: feeTypeFilter || undefined,
        ...filterParams,
      }),
    enabled: scopeEnabled,
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
        description: `${r.created} created, ${r.skipped} already existed`,
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const payMut = useMutation({
    mutationFn: () =>
      payAcademyFee(payRecord!._id, {
        paymentMethod,
        notes: paymentNotes.trim() || undefined,
      }),
    onSuccess: (rec) => {
      qc.invalidateQueries({ queryKey: ["academy-fees"] });
      qc.invalidateQueries({ queryKey: ["academy-fees-summary"] });
      qc.invalidateQueries({ queryKey: ["academy-student-record"] });
      setPayRecord(null);
      setPaymentNotes("");
      toast({
        title: "Payment recorded",
        description: rec.receiptNumber
          ? `Receipt ${rec.receiptNumber}. Use Print receipt to print it.`
          : "Use Print receipt on the row to print it.",
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const printMut = useMutation({
    mutationFn: ({ id, size }: { id: string; size: FeeReceiptSize }) => printFeeReceipt(id, size),
    onError: (e: Error) =>
      toast({ title: "Could not print receipt", description: e.message, variant: "destructive" }),
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

  const canPay = caps.canEdit || caps.canCreate;
  const canGenerate = showGenerate && !studentId && writable && (caps.canCreate || caps.canEdit);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Collected</p>
          <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
            {summaryLoading ? "…" : formatPkr(summary?.totalPaid)}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Outstanding</p>
          <p className="text-lg font-semibold text-destructive">
            {summaryLoading ? "…" : formatPkr(summary?.totalPending)}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Records</p>
          <p className="text-lg font-semibold text-primary">
            {summaryLoading ? "…" : summary?.recordsCount ?? 0}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Pending / overdue</p>
          <p className="text-lg font-semibold text-amber-700 dark:text-amber-400">
            {summaryLoading
              ? "…"
              : `${summary?.byStatus.pending ?? 0} / ${summary?.byStatus.overdue ?? 0}`}
          </p>
        </Card>
      </div>

      {showFilters && !studentId && (
        <Card className="p-3">
          <div className="flex flex-wrap gap-3 items-end">
            {isParent && (
              <div>
                <Label className="text-xs">Child</Label>
                <select
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm min-w-[14rem]"
                  value={selectedParentStudentId}
                  onChange={(e) => setSelectedParentStudentId(e.target.value)}
                >
                  <option value="">Select child…</option>
                  {parentStudents.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.studentName} ({s.studentId})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <Label className="text-xs">Month</Label>
              <Input
                type="number"
                min={1}
                max={12}
                className="w-20 h-9"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Year</Label>
              <Input
                type="number"
                className="w-24 h-9"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
            </div>
            {!isParent && (
              <div>
                <Label className="text-xs">Class</Label>
                <select
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm min-w-[8rem]"
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                >
                  <option value="">All classes</option>
                  {classes.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.className}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <Label className="text-xs">Status</Label>
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
                <option value="waived">Waived</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={feeTypeFilter}
                onChange={(e) => setFeeTypeFilter(e.target.value)}
              >
                <option value="">All types</option>
                <option value="monthly">Monthly</option>
                <option value="admission">Admission</option>
              </select>
            </div>
            {canGenerate && !isParent && (
              <Button
                size="sm"
                variant="secondary"
                disabled={genMut.isPending}
                onClick={() => genMut.mutate()}
              >
                {genMut.isPending ? "Generating…" : "Generate monthly fees"}
              </Button>
            )}
          </div>
        </Card>
      )}

      <PanelSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search student, class, receipt…"
        className="max-w-md"
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left p-2.5 font-medium">Receipt</th>
                <th className="text-left p-2.5 font-medium">Student</th>
                {!studentId && <th className="text-left p-2.5 font-medium hidden md:table-cell">Class</th>}
                <th className="text-left p-2.5 font-medium">Period</th>
                <th className="text-left p-2.5 font-medium">Type</th>
                <th className="text-left p-2.5 font-medium">Amount</th>
                <th className="text-left p-2.5 font-medium">Status</th>
                <th className="text-right p-2.5 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={studentId ? 7 : 8} className="p-6 text-center text-muted-foreground">
                    Loading fee records…
                  </td>
                </tr>
              )}
              {!isLoading && records.length === 0 && (
                <tr>
                  <td colSpan={studentId ? 7 : 8} className="p-6 text-center text-muted-foreground">
                    {studentId
                      ? "No fee records for this student yet."
                      : "No fee records for this period. Generate monthly fees or register students."}
                  </td>
                </tr>
              )}
              {!isLoading && records.length > 0 && recordsFiltered.length === 0 && (
                <tr>
                  <td colSpan={studentId ? 7 : 8} className="p-6 text-center text-muted-foreground">
                    No records match your filters.
                  </td>
                </tr>
              )}
              {recordsFiltered.map((r) => {
                const sid = studentMongoId(r);
                const detailHref = routes && sid ? routes.detail(sid) : null;
                const payable = r.status === "pending" || r.status === "overdue";
                return (
                  <tr key={r._id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-2.5 font-mono text-xs">{r.receiptNumber || "—"}</td>
                    <td className="p-2.5">
                      {detailHref ? (
                        <Link to={detailHref} className="font-medium text-primary hover:underline">
                          {studentName(r)}
                        </Link>
                      ) : (
                        <div className="font-medium">{studentName(r)}</div>
                      )}
                      <p className="text-xs text-muted-foreground">{studentCode(r)}</p>
                    </td>
                    {!studentId && (
                      <td className="p-2.5 hidden md:table-cell">{classNameFromRecord(r)}</td>
                    )}
                    <td className="p-2.5">{periodLabel(r)}</td>
                    <td className="p-2.5 capitalize">{r.feeType}</td>
                    <td className="p-2.5">{formatPkr(r.amount)}</td>
                    <td className="p-2.5">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="p-2.5 text-right">
                      {payable && canPay && (
                        <Button
                          size="sm"
                          variant="hero"
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
                      {r.status === "paid" && (
                        <div className="flex flex-col items-end gap-1">
                          {r.paidAt && (
                            <span className="text-xs text-muted-foreground">
                              {new Date(r.paidAt).toLocaleDateString()}
                            </span>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={printMut.isPending && printMut.variables?.id === r._id}
                              >
                                {printMut.isPending && printMut.variables?.id === r._id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Printer className="h-3.5 w-3.5" />
                                )}
                                Print receipt
                                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="gap-2"
                                onClick={() => printMut.mutate({ id: r._id, size: "thermal" })}
                              >
                                <Receipt className="h-4 w-4" />
                                Thermal print (80mm)
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="gap-2"
                                onClick={() => printMut.mutate({ id: r._id, size: "a4" })}
                              >
                                <FileText className="h-4 w-4" />
                                A4 print
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
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

      <Dialog open={Boolean(payRecord)} onOpenChange={(o) => !o && setPayRecord(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
          </DialogHeader>
          {payRecord && (
            <div className="space-y-3 text-sm">
              <p>
                <span className="text-muted-foreground">Student:</span>{" "}
                <span className="font-medium">{studentName(payRecord)}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Amount:</span>{" "}
                <span className="font-semibold">{formatPkr(payRecord.amount)}</span>
              </p>
              <p>
                <span className="text-muted-foreground">For:</span> {periodLabel(payRecord)}
              </p>
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
            <Button variant="hero" disabled={payMut.isPending} onClick={() => payMut.mutate()}>
              Confirm payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
