import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Download, FileText, Loader2, Phone, Printer, Receipt } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  exportFeeDefaultersCsv,
  exportFeeDefaultersMonthWise,
  type DefaulterReportFormat,
  fetchAcademyClasses,
  fetchFeeDefaulters,
  fetchFeeDefaultersSummary,
  printFeeChallan,
  type FeeDefaulter,
  type FeeReceiptSize,
} from "@/lib/studentManagementApi";
import { academyStudentRoutes } from "@/lib/studentManagementMenus";
import { DefaulterListDownload } from "./DefaulterListDownload";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import { useSessionScope } from "@/components/modules/timetable/SessionBar";
import { formatDate, formatPkr } from "./studentDisplayUtils";

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
}: {
  caps: ModuleActionCaps;
  sessionId?: string;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const routes = user?.role ? academyStudentRoutes(user.role, "records") : null;
  const { apiSessionId, hasScope } = useSessionScope(sessionId);

  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportingMonthWise, setExportingMonthWise] = useState<DefaulterReportFormat | null>(null);

  const printMut = useMutation({
    mutationFn: ({ studentId, size }: { studentId: string; size: FeeReceiptSize }) =>
      printFeeChallan(studentId, size),
    onError: (e: Error) =>
      toast({ title: "Could not print challan", description: e.message, variant: "destructive" }),
  });

  const filterParams = useMemo(
    () => ({
      month: month ? Number(month) : undefined,
      year: year ? Number(year) : undefined,
      classId: classFilter || undefined,
      search: search.trim() || undefined,
      sessionId: apiSessionId,
    }),
    [month, year, classFilter, search, apiSessionId]
  );

  useEffect(() => {
    setPage(1);
  }, [month, year, classFilter, search]);

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
        month: filterParams.month,
        year: filterParams.year,
        sessionId: filterParams.sessionId,
      }),
    enabled: hasScope,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["fee-defaulters", page, filterParams],
    queryFn: () =>
      fetchFeeDefaulters({
        page,
        limit: 20,
        ...filterParams,
      }),
    enabled: hasScope,
  });

  const defaulters = data?.defaulters ?? [];
  const pagination = data?.pagination;

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await exportFeeDefaultersCsv(filterParams);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "fee-defaulters.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export downloaded" });
    } catch (e) {
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  const handleMonthWiseExport = async (format: DefaulterReportFormat) => {
    setExportingMonthWise(format);
    try {
      const blob = await exportFeeDefaultersMonthWise(filterParams, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = format === "pdf" ? "fee-defaulters.pdf" : "fee-defaulters.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: format === "pdf" ? "PDF downloaded" : "Excel downloaded" });
    } catch (e) {
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
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-primary flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Fee defaulters
          </h2>
        </div>
        {canExport && (
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={exporting || defaulters.length === 0}
              onClick={() => void handleExport()}
            >
              <Download className="h-4 w-4" />
              {exporting ? "Exporting…" : "Export CSV"}
            </Button>
            <DefaulterListDownload
              exporting={exportingMonthWise}
              onDownload={(format) => void handleMonthWiseExport(format)}
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Defaulters</p>
          <p className="text-lg font-semibold text-destructive">
            {summaryLoading ? "…" : summary?.defaulterCount ?? 0}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Outstanding</p>
          <p className="text-lg font-semibold text-destructive">
            {summaryLoading ? "…" : formatPkr(summary?.totalOutstanding)}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Unpaid vouchers</p>
          <p className="text-lg font-semibold text-primary">
            {summaryLoading ? "…" : summary?.totalUnpaidVouchers ?? 0}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Overdue vouchers</p>
          <p className="text-lg font-semibold text-amber-700 dark:text-amber-400">
            {summaryLoading ? "…" : summary?.overdueVouchers ?? 0}
          </p>
        </Card>
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <Label className="text-xs">Month (optional)</Label>
            <Input
              type="number"
              min={1}
              max={12}
              placeholder="All"
              className="w-20 h-9"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Year (optional)</Label>
            <Input
              type="number"
              placeholder="All"
              className="w-24 h-9"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </div>
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
          {(month || year) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setMonth("");
                setYear("");
              }}
            >
              Clear period
            </Button>
          )}
        </div>
      </Card>

      <PanelSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search student, father, phone, ID…"
        className="max-w-md"
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left p-2.5 font-medium">Student</th>
                <th className="text-left p-2.5 font-medium hidden md:table-cell">Class</th>
                <th className="text-left p-2.5 font-medium hidden lg:table-cell">Contact</th>
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
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    Loading defaulters…
                  </td>
                </tr>
              )}
              {!isLoading && defaulters.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    No fee defaulters for the selected filters. All students are up to date.
                  </td>
                </tr>
              )}
              {defaulters.map((d: FeeDefaulter) => {
                const detailHref = routes ? routes.detail(d.student._id) : null;
                const tel = d.student.phone?.replace(/\s/g, "");
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
                      <p className="text-xs text-muted-foreground">{d.student.studentId}</p>
                      <p className="text-xs text-muted-foreground lg:hidden">{d.student.fatherName}</p>
                    </td>
                    <td className="p-2.5 hidden md:table-cell">{d.className || "—"}</td>
                    <td className="p-2.5 hidden lg:table-cell">
                      <div>{d.student.fatherName}</div>
                      {tel && (
                        <a
                          href={`tel:${tel}`}
                          className="text-xs text-primary inline-flex items-center gap-1 mt-0.5 hover:underline"
                        >
                          <Phone className="h-3 w-3" />
                          {d.student.phone}
                        </a>
                      )}
                    </td>
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
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8"
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
                              onClick={() => printMut.mutate({ studentId: d.student._id, size: "thermal" })}
                            >
                              <Receipt className="h-4 w-4" />
                              Thermal
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="gap-2"
                              onClick={() => printMut.mutate({ studentId: d.student._id, size: "a4" })}
                            >
                              <FileText className="h-4 w-4" />
                              A4
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {(caps.canEdit || caps.canCreate) && detailHref && (
                          <Button size="sm" variant="outline" asChild>
                            <Link to={detailHref}>Collect fee</Link>
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
    </div>
  );
}
