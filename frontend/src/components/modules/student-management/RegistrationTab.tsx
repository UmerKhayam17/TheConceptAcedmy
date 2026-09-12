import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, Download, Eye, FileSpreadsheet, FileText, Pencil, Plus, Trash2, UserCheck } from "lucide-react";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
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
  academyStudentRoutes,
  type AcademyStudentRoutes,
} from "@/lib/studentManagementMenus";
import {
  deleteAcademyStudent,
  exportStudents,
  fetchAcademyClasses,
  fetchAcademyStudents,
  type AcademyStudent,
  type AcademyStudentStatus,
  type StudentExportFormat,
} from "@/lib/studentManagementApi";
import { useSessionScope } from "@/components/modules/timetable/SessionBar";
import { classLabel, formatDate, formatPkr, sessionLabelFromClass } from "./studentDisplayUtils";
import ProvisionalIntakeDialog from "./ProvisionalIntakeDialog";

function studentRef(s: AcademyStudent) {
  if (s.status === "pending_fee") {
    return s.rollNumber ?? s.registrationNumber ?? "Pending";
  }
  return s.rollNumber ?? s.studentId ?? "—";
}

function statusLabel(status: AcademyStudentStatus) {
  if (status === "pending_fee") return "Pending fee";
  return status;
}

export default function RegistrationTab({
  caps,
  routes: routesProp,
  sessionId = "",
  heading = "Students",
  registerLabel = "Admission intake",
  emptyHint = "No students yet.",
  showHeading = true,
  enrollmentFlow = "intake",
}: {
  caps: ModuleActionCaps;
  routes?: AcademyStudentRoutes;
  sessionId?: string;
  heading?: string;
  registerLabel?: string;
  emptyHint?: string;
  showHeading?: boolean;
  /** Admin: intake only. Accountant: intake + direct register. Both: show both buttons. */
  enrollmentFlow?: "intake" | "direct" | "both";
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | AcademyStudentStatus>("");
  const [page, setPage] = useState(1);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [exporting, setExporting] = useState<StudentExportFormat | null>(null);
  const intakeParamHandled = useRef(false);

  const routes =
    routesProp ?? (user?.role ? academyStudentRoutes(user.role, "registration") : null);
  const { apiSessionId, writable, isAll, hasScope } = useSessionScope(sessionId);
  const showSessionCol = isAll || !writable;
  const hasActions = caps.canView || (writable && (caps.canEdit || caps.canDelete));
  const colSpan = (hasActions ? 9 : 8) + (showSessionCol ? 1 : 0);

  const showIntake = enrollmentFlow === "intake" || enrollmentFlow === "both";
  const showDirectRegister = enrollmentFlow === "direct" || enrollmentFlow === "both";

  useEffect(() => {
    if (!showIntake) return;
    if (intakeParamHandled.current) return;
    if (searchParams.get("intake") === "1") {
      intakeParamHandled.current = true;
      setIntakeOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, showIntake]);

  useEffect(() => {
    setClassFilter("");
    setPage(1);
  }, [sessionId]);

  const { data: classes = [] } = useQuery({
    queryKey: ["academy-classes", sessionId],
    queryFn: () =>
      fetchAcademyClasses({
        status: "active",
        sessionId: apiSessionId,
      }),
    enabled: hasScope,
  });

  const canIntake = showIntake && writable && classes.length > 0 && (caps.canCreate || caps.canEdit);
  const canDirectRegister = showDirectRegister && writable && classes.length > 0 && caps.canEdit;
  const intakeBlockedReason = !hasScope
    ? "Select an academic session first"
    : !writable
      ? "Switch to the active session to register students"
      : classes.length === 0
        ? "Add at least one active class for this session"
        : showIntake && !caps.canCreate && !caps.canEdit
          ? "You do not have permission for admission intake"
          : null;
  const directBlockedReason = !hasScope
    ? "Select an academic session first"
    : !writable
      ? "Switch to the active session to register students"
      : classes.length === 0
        ? "Add at least one active class for this session"
        : !caps.canEdit
          ? "You do not have permission to register students"
          : null;

  const { data: listData, isLoading } = useQuery({
    queryKey: ["academy-students", sessionId, page, search, classFilter, statusFilter],
    queryFn: () =>
      fetchAcademyStudents({
        page,
        limit: 15,
        search: search || undefined,
        classId: classFilter || undefined,
        status: statusFilter || undefined,
        sessionId: apiSessionId,
      }),
    enabled: hasScope,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteAcademyStudent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academy-students"] });
      toast({ title: "Student deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleExport = async (format: StudentExportFormat) => {
    setExporting(format);
    try {
      const blob = await exportStudents(
        {
          search: search || undefined,
          classId: classFilter || undefined,
          status: statusFilter || undefined,
          sessionId: apiSessionId,
        },
        format,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = format === "pdf" ? "academy-students.pdf" : "academy-students.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: format === "pdf" ? "PDF downloaded" : "Excel downloaded" });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  const handleDelete = (s: AcademyStudent) => {
    const label = studentRef(s);
    if (!confirm(`Delete "${s.studentName}" (${label})? This cannot be undone.`)) return;
    deleteMut.mutate(s._id);
  };

  const students = listData?.students ?? [];
  const pagination = listData?.pagination;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 space-y-3">
      <div
        className={
          showHeading
            ? "flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between border-b pb-3"
            : "flex flex-col lg:flex-row gap-2 lg:items-center lg:justify-end border-b pb-3"
        }
      >
        {showHeading && (
          <h2 className="font-display text-base font-semibold text-primary shrink-0">{heading}</h2>
        )}
        <div className="flex flex-wrap gap-2 items-center sm:ml-auto">
          {showIntake && (
            canIntake ? (
              <Button className="gap-2" variant={showDirectRegister ? "outline" : "default"} onClick={() => setIntakeOpen(true)}>
                <Plus className="h-4 w-4" /> {registerLabel}
              </Button>
            ) : (
              <Button className="gap-2" variant={showDirectRegister ? "outline" : "default"} disabled title={intakeBlockedReason ?? undefined}>
                <Plus className="h-4 w-4" /> {registerLabel}
              </Button>
            )
          )}
          {showDirectRegister && routes && (
            canDirectRegister ? (
              <Button className="gap-2" asChild>
                <Link to={routes.register}>
                  <Plus className="h-4 w-4" /> Register student
                </Link>
              </Button>
            ) : (
              <Button className="gap-2" disabled title={directBlockedReason ?? undefined}>
                <Plus className="h-4 w-4" /> Register student
              </Button>
            )
          )}
          <PanelSearchBar
            value={search}
            onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder="Search name, roll, phone…"
            className="w-48 max-w-none flex-none"
          />
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as "" | AcademyStudentStatus); setPage(1); }}
          >
            <option value="">All statuses</option>
            <option value="pending_fee">Pending fee</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </select>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={classFilter}
            onChange={(e) => { setClassFilter(e.target.value); setPage(1); }}
          >
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c._id} value={c._id}>{c.className}</option>
            ))}
          </select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1" disabled={!!exporting}>
                <Download className="h-4 w-4" />
                {exporting ? "Exporting…" : "Export"}
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="gap-2" onClick={() => void handleExport("xlsx")}>
                <FileSpreadsheet className="h-4 w-4" />
                Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2" onClick={() => void handleExport("pdf")}>
                <FileText className="h-4 w-4" />
                PDF report
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left p-3 font-medium">Roll / ID</th>
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Father</th>
                <th className="text-left p-3 font-medium">Phone</th>
                <th className="text-left p-3 font-medium">Class</th>
                {showSessionCol && <th className="text-left p-3 font-medium">Session</th>}
                <th className="text-left p-3 font-medium">Created</th>
                <th className="text-left p-3 font-medium">Monthly</th>
                <th className="text-left p-3 font-medium">Status</th>
                {hasActions && <th className="text-right p-3 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={colSpan} className="p-8 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {!isLoading && students.length === 0 && (
                <tr>
                  <td colSpan={colSpan} className="p-8 text-center text-muted-foreground">
                    {emptyHint}
                    {caps.canCreate && canIntake && (
                      <>
                        {" "}
                        <button
                          type="button"
                          className="text-primary underline-offset-2 hover:underline"
                          onClick={() => setIntakeOpen(true)}
                        >
                          {registerLabel}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              )}
              {students.map((s) => {
                const viewHref = routes ? routes.detail(s._id) : "#";
                const editHref = routes ? routes.edit(s._id) : "#";
                const activateHref = routes ? routes.activate(s._id) : "#";
                const isPending = s.status === "pending_fee";
                return (
                  <tr key={s._id} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-mono text-xs">{studentRef(s)}</td>
                    <td className="p-3 font-medium">{s.studentName}</td>
                    <td className="p-3">{s.fatherName}</td>
                    <td className="p-3">{s.phone || "—"}</td>
                    <td className="p-3">{classLabel(s.classId)}</td>
                    {showSessionCol && (
                      <td className="p-3 text-muted-foreground text-xs">
                        {sessionLabelFromClass(s.classId) || "—"}
                      </td>
                    )}
                    <td className="p-3 text-muted-foreground">{formatDate(s.createdAt)}</td>
                    <td className="p-3">{isPending ? "—" : formatPkr(s.monthlyFee)}</td>
                    <td className="p-3">
                      <span
                        className={
                          isPending
                            ? "text-xs font-semibold rounded-full px-2 py-0.5 bg-amber-500/15 text-amber-800 dark:text-amber-200"
                            : "capitalize"
                        }
                      >
                        {statusLabel(s.status as AcademyStudentStatus)}
                      </span>
                    </td>
                    {hasActions && (
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          {isPending && writable && caps.canEdit && (
                            <Button variant="default" size="sm" className="h-8 gap-1" asChild>
                              <Link to={activateHref}>
                                <UserCheck className="h-3.5 w-3.5" /> Activate
                              </Link>
                            </Button>
                          )}
                          {caps.canView && (
                            <Button variant="ghost" size="icon" asChild aria-label="View student">
                              <Link to={viewHref}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                          )}
                          {writable && caps.canEdit && !isPending && (
                            <Button variant="ghost" size="icon" asChild aria-label="Edit student">
                              <Link to={editHref}>
                                <Pencil className="h-4 w-4" />
                              </Link>
                            </Button>
                          )}
                          {writable && caps.canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Delete student"
                              disabled={deleteMut.isPending}
                              onClick={() => handleDelete(s)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pagination && pagination.pages > 1 && (
          <div className="flex justify-center gap-2 p-4 border-t">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
            <span className="text-sm self-center">Page {page} / {pagination.pages}</span>
            <Button variant="outline" size="sm" disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        )}
      </Card>

      {showIntake && (
        <ProvisionalIntakeDialog
          open={intakeOpen}
          onOpenChange={setIntakeOpen}
          caps={caps}
          sessionId={writable ? sessionId : ""}
        />
      )}
    </div>
  );
}
