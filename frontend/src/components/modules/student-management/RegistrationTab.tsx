import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SquareCheckbox } from "@/components/ui/square-checkbox";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  GraduationCap,
  Pencil,
  Plus,
  Shield,
  Trash2,
  TrendingUp,
  UserCheck,
  UserMinus,
  Users,
} from "lucide-react";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import ClassProgramSelect from "@/components/modules/ClassProgramSelect";
import { DefaulterListDownload } from "./DefaulterListDownload";
import {
  deliverReportBlob,
  openReportPreviewTab,
  type ReportFileFormat,
} from "@/lib/reportDownload";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { resolveUploadUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ModuleActionCaps } from "@/lib/permissions";
import {
  academyStudentRoutes,
  type AcademyStudentRoutes,
} from "@/lib/studentManagementMenus";
import {
  deleteAcademyStudent,
  exportStudents,
  fetchAcademyClasses,
  fetchAcademySectionsBySession,
  fetchAcademyStudents,
  type AcademyStudent,
  type AcademyStudentStatus,
  type StudentExportReportType,
} from "@/lib/studentManagementApi";
import { useSessionScope } from "@/components/modules/timetable/SessionBar";
import { classLabel, formatPkr } from "./studentDisplayUtils";
import PageSizeSelect, { DEFAULT_PAGE_SIZE } from "./PageSizeSelect";
import ProvisionalIntakeDialog from "./ProvisionalIntakeDialog";

function studentRef(s: AcademyStudent) {
  if (s.status === "pending_fee") {
    return s.rollNumber ?? s.registrationNumber ?? "Pending";
  }
  return s.rollNumber ?? s.studentId ?? "";
}

function statusLabel(status: AcademyStudentStatus) {
  if (status === "pending_fee") return "Pending fee";
  return status;
}

function sectionNameOf(s: AcademyStudent): string {
  if (!s.sectionId) return "";
  if (typeof s.sectionId === "object") return s.sectionId.sectionName || "";
  return "";
}

function phonesOf(s: AcademyStudent): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const raw of [s.phone, (s as { mobileNo?: string }).mobileNo, s.contactPhoneRes]) {
    const value = String(raw || "").trim();
    if (!value) continue;
    const key = value.replace(/\D/g, "") || value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(value);
  }
  return parts.join(" / ");
}

function sectionBadgeClass(name: string) {
  const letter = name.trim().charAt(0).toUpperCase();
  if (letter === "A") return "bg-sky-100 text-sky-800 border-sky-200";
  if (letter === "B") return "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200";
  if (letter === "C") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (letter === "D") return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function statusBadgeClass(status: AcademyStudentStatus) {
  if (status === "active") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "pending_fee") return "bg-amber-50 text-amber-800 border-amber-200";
  if (status === "suspended") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

function statusDotClass(status: AcademyStudentStatus) {
  if (status === "active") return "bg-emerald-500";
  if (status === "pending_fee") return "bg-amber-500";
  if (status === "suspended") return "bg-rose-500";
  return "bg-slate-400";
}

function initialOf(name: string) {
  const ch = (name || "?").trim().charAt(0).toUpperCase();
  return ch || "?";
}


function StudentAvatar({ student }: { student: AcademyStudent }) {
  const src = student.photoImage ? resolveUploadUrl(student.photoImage) : null;
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="h-8 w-8 rounded-md object-cover shrink-0 border border-border"
      />
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
      {initialOf(student.studentName)}
    </span>
  );
}

function StatCard({
  label,
  value,
  hint,
  hintTone = "muted",
  showTrend = false,
  icon: Icon,
  iconWrapClass,
  iconClass,
}: {
  label: string;
  value: string | number;
  hint?: string;
  hintTone?: "success" | "muted";
  showTrend?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  iconWrapClass: string;
  iconClass: string;
}) {
  return (
    <Card className="rounded-2xl border-0 bg-white p-4 shadow-sm ring-1 ring-black/[0.04]">
      <div className="flex items-center gap-3.5">
        <span
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg",
            iconWrapClass,
          )}
        >
          <Icon className={cn("h-5 w-5", iconClass)} />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-slate-500">{label}</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums tracking-tight text-[#1a2b4b]">
            {value}
          </p>
          {hint ? (
            <p
              className={cn(
                "mt-0.5 flex items-center gap-1 text-xs font-medium",
                hintTone === "success" ? "text-emerald-600" : "text-slate-500",
              )}
            >
              {showTrend ? <TrendingUp className="h-3 w-3 shrink-0" /> : null}
              <span>{hint}</span>
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
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

export default function RegistrationTab({
  caps,
  routes: routesProp,
  sessionId = "",
  heading = "Register Students",
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
  const [sectionFilter, setSectionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | AcademyStudentStatus>("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [exporting, setExporting] = useState<ReportFileFormat | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const intakeParamHandled = useRef(false);

  const routes =
    routesProp ?? (user?.role ? academyStudentRoutes(user.role, "registration") : null);
  const { apiSessionId, writable, hasScope } = useSessionScope(sessionId);
  const isTeacher = user?.role === "teacher";
  const showPhoneCol = !isTeacher;
  const showMonthlyCol = !isTeacher;
  const hasActions = caps.canView || (writable && (caps.canEdit || caps.canDelete));
  const colSpan =
    1 +
    (hasActions ? 7 : 6) +
    (showPhoneCol ? 1 : 0) +
    (showMonthlyCol ? 2 : 0);

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
    setSectionFilter("");
    setPage(1);
  }, [sessionId]);

  useEffect(() => {
    setSectionFilter("");
    setPage(1);
  }, [classFilter]);

  useEffect(() => {
    setSelectedIds([]);
  }, [sessionId, page, pageSize, search, classFilter, sectionFilter, statusFilter]);

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

  const { data: sections = [] } = useQuery({
    queryKey: ["academy-sections", "session", sessionId, apiSessionId, classFilter],
    queryFn: async () => {
      const all = await fetchAcademySectionsBySession(apiSessionId || undefined);
      if (!classFilter) return all;
      return all.filter((s) => {
        const cid = typeof s.classId === "object" ? s.classId?._id : s.classId;
        return String(cid) === classFilter;
      });
    },
    enabled: hasScope,
  });

  const { data: listData, isLoading } = useQuery({
    queryKey: [
      "academy-students",
      sessionId,
      page,
      pageSize,
      search,
      classFilter,
      sectionFilter,
      statusFilter,
    ],
    queryFn: () =>
      fetchAcademyStudents({
        page,
        limit: pageSize,
        search: search || undefined,
        classId: classFilter || undefined,
        sectionId: sectionFilter || undefined,
        status: statusFilter || undefined,
        sessionId: apiSessionId,
      }),
    enabled: hasScope,
  });

  const summaryBase = {
    page: 1,
    limit: 1,
    classId: classFilter || undefined,
    sectionId: sectionFilter || undefined,
    sessionId: apiSessionId,
  } as const;

  const { data: totalSummary } = useQuery({
    queryKey: ["academy-students", "summary", "total", sessionId, classFilter, sectionFilter],
    queryFn: () => fetchAcademyStudents(summaryBase),
    enabled: hasScope && showHeading,
  });
  const { data: activeSummary } = useQuery({
    queryKey: ["academy-students", "summary", "active", sessionId, classFilter, sectionFilter],
    queryFn: () => fetchAcademyStudents({ ...summaryBase, status: "active" }),
    enabled: hasScope && showHeading,
  });
  const { data: inactiveSummary } = useQuery({
    queryKey: ["academy-students", "summary", "inactive", sessionId, classFilter, sectionFilter],
    queryFn: () => fetchAcademyStudents({ ...summaryBase, status: "inactive" }),
    enabled: hasScope && showHeading,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteAcademyStudent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academy-students"] });
      toast({ title: "Student deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  /** Section options include class when no class filter is set (e.g. "A · 9th"). */
  const exportClassId = useMemo(() => {
    if (classFilter) return classFilter;
    if (!sectionFilter) return "";
    const sec = sections.find((s) => s._id === sectionFilter);
    if (!sec) return "";
    const cid = typeof sec.classId === "object" ? sec.classId?._id : sec.classId;
    return cid ? String(cid) : "";
  }, [classFilter, sectionFilter, sections]);

  const canExportStudentList = Boolean(exportClassId && sectionFilter);

  const handleExport = async (
    format: ReportFileFormat,
    reportKind?: string,
  ) => {
    if (!exportClassId || !sectionFilter) {
      toast({
        title: "Select class and section",
        description: "Export requires both class and section filters.",
        variant: "destructive",
      });
      return;
    }
    const reportType: StudentExportReportType =
      reportKind === "contact" ? "contact" : "list";
    setExporting(format);
    const preview = openReportPreviewTab(format);
    try {
      const blob = await exportStudents(
        {
          search: search || undefined,
          classId: exportClassId,
          sectionId: sectionFilter,
          status: statusFilter || undefined,
          sessionId: apiSessionId,
          reportType,
        },
        format,
      );
      const parts = [reportType === "contact" ? "Contact-List" : "Student-List"];
      if (statusFilter) parts.push(statusFilter);
      const mode = deliverReportBlob(blob, `${parts.join("_")}.${format}`, format, preview);
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
  const pageIds = students.map((s) => s._id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
  const somePageSelected = pageIds.some((id) => selectedIds.includes(id));

  const toggleSelectAllPage = () => {
    if (allPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
      return;
    }
    setSelectedIds((prev) => [...new Set([...prev, ...pageIds])]);
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };


  const totalStudents = totalSummary?.pagination?.total ?? pagination?.total ?? 0;
  const activeStudents = activeSummary?.pagination?.total ?? 0;
  const inactiveStudents = inactiveSummary?.pagination?.total ?? 0;
  const activePct = totalStudents > 0 ? Math.round((activeStudents / totalStudents) * 100) : 0;
  const inactivePct = totalStudents > 0 ? Math.round((inactiveStudents / totalStudents) * 100) : 0;
  const sectionCount = sections.length;
  const classCountForSections = classFilter
    ? 1
    : new Set(
      sections.map((s) => (typeof s.classId === "object" ? s.classId?._id : s.classId)).filter(Boolean),
    ).size;

  const showingFrom =
    pagination && pagination.total > 0 ? (page - 1) * pagination.limit + 1 : 0;
  const showingTo = pagination
    ? Math.min(page * pagination.limit, pagination.total)
    : 0;
  const pages = pageWindow(page, pagination?.pages ?? 1);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      {showHeading && (
        <Card className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
                <Users className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
              </span>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight">
                  {heading}
                </h1>
                <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500 max-w-xl">
                  View, manage and filter student records. You can perform various actions like
                  section change, admission intake and registration.
                </p>
              </div>
            </div>
            <div className="shrink-0 rounded-lg bg-primary/10 px-3 py-2 max-w-[15rem]">
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
        </Card>
      )}

      {showHeading && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            label="Total Students"
            value={totalStudents}
            hint={classFilter ? "In selected class" : "In current session"}
            icon={Users}
            iconWrapClass="bg-[#dbeafe]"
            iconClass="text-[#2563eb]"
          />
          <StatCard
            label="Active Students"
            value={activeStudents}
            hint={`${activePct}%`}
            hintTone="success"
            showTrend
            icon={GraduationCap}
            iconWrapClass="bg-[#d1fae5]"
            iconClass="text-[#059669]"
          />
          <StatCard
            label="Inactive Students"
            value={inactiveStudents}
            hint={`${inactivePct}%`}
            icon={UserMinus}
            iconWrapClass="bg-[#ede9fe]"
            iconClass="text-[#7c3aed]"
          />
          <StatCard
            label="Sections"
            value={sectionCount}
            hint={
              classCountForSections
                ? `in ${classCountForSections} class${classCountForSections === 1 ? "" : "es"}`
                : "—"
            }
            icon={Shield}
            iconWrapClass="bg-[#ffe4e6]"
            iconClass="text-[#e11d48]"
          />
        </div>
      )}

      <Card className="p-3 sm:p-4 shadow-sm border-border/80">
        <div className="flex flex-wrap items-center gap-2">
          <ClassProgramSelect
            className="w-[16.5rem] shrink-0"
            label={false}
            value={classFilter}
            onChange={(v) => {
              setClassFilter(v);
              setPage(1);
            }}
            classes={classes}
            allowAll
            selectClassName="rounded-md border-input h-10"
          />
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm w-[10rem] shrink-0"
            value={sectionFilter}
            onChange={(e) => {
              setSectionFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Section filter"
            disabled={!hasScope || sections.length === 0}
          >
            <option value="">All Sections</option>
            {sections.map((sec) => (
              <option key={sec._id} value={sec._id}>
                {sec.sectionName}
                {!classFilter && sec.className ? ` · ${sec.className}` : ""}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm w-[10rem] shrink-0"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as "" | AcademyStudentStatus);
              setPage(1);
            }}
            aria-label="Status filter"
          >
            <option value="">All statuses</option>
            <option value="pending_fee">Pending fee</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </select>
          <PanelSearchBar
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder={
              isTeacher
                ? "Search by name, roll no…"
                : "Search by name, roll no or registration no…"
            }
            className="min-w-[12rem] flex-1 max-w-md"
          />
          <div className="flex flex-wrap items-center gap-2 shrink-0 ml-auto">
            {showIntake && (
              canIntake ? (
                <Button
                  className="gap-2 h-10"
                  variant={showDirectRegister ? "outline" : "default"}
                  onClick={() => setIntakeOpen(true)}
                >
                  <Plus className="h-4 w-4" /> {registerLabel}
                </Button>
              ) : (
                <Button
                  className="gap-2 h-10"
                  variant={showDirectRegister ? "outline" : "default"}
                  disabled
                  title={intakeBlockedReason ?? undefined}
                >
                  <Plus className="h-4 w-4" /> {registerLabel}
                </Button>
              )
            )}
            {showDirectRegister && routes && (
              canDirectRegister ? (
                <Button className="gap-2 h-10" asChild>
                  <Link to={routes.register}>
                    <Plus className="h-4 w-4" /> Register student
                  </Link>
                </Button>
              ) : (
                <Button className="gap-2 h-10" disabled title={directBlockedReason ?? undefined}>
                  <Plus className="h-4 w-4" /> Register student
                </Button>
              )
            )}
            <DefaulterListDownload
              size="default"
              label="Print / Export"
              exporting={exporting}
              disabled={!canExportStudentList}
              reportKinds={[
                { id: "list", label: "Student List" },
                { id: "contact", label: "Contact List" },
              ]}
              onDownload={(format, reportKind) => void handleExport(format, reportKind)}
            />
          </div>
        </div>
      </Card>

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
                    aria-label="Select all students on this page"
                  />
                </th>
                <th className="text-left p-3 font-medium whitespace-nowrap">Roll / ID</th>
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium whitespace-nowrap">Father Name</th>
                {showPhoneCol && <th className="text-left p-3 font-medium">Phone</th>}
                <th className="text-left p-3 font-medium">Class</th>
                <th className="text-left p-3 font-medium">Section</th>
                {showMonthlyCol && (
                  <>
                    <th className="text-left p-3 font-medium whitespace-nowrap">Monthly Fee</th>
                    <th className="text-left p-3 font-medium whitespace-nowrap">Total Payable</th>
                  </>
                )}
                <th className="text-left p-3 font-medium">Status</th>
                {hasActions && <th className="text-right p-3 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={colSpan} className="p-10 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && students.length === 0 && (
                <tr>
                  <td colSpan={colSpan} className="p-10 text-center text-muted-foreground">
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
                const sectionName = sectionNameOf(s);
                const isSelected = selectedIds.includes(s._id);
                return (
                  <tr
                    key={s._id}
                    className={cn(
                      "border-b last:border-0 hover:bg-muted/20",
                      isSelected && "bg-muted/50",
                    )}
                  >
                    <td className="w-10 p-3 text-center">
                      <SquareCheckbox
                        checked={isSelected}
                        onChange={() => toggleSelectOne(s._id)}
                        aria-label={`Select ${s.studentName}`}
                      />
                    </td>
                    <td className="p-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {studentRef(s)}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <StudentAvatar student={s} />
                        <span className="font-medium text-foreground truncate">{s.studentName}</span>
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground whitespace-nowrap">{s.fatherName}</td>
                    {showPhoneCol && (
                      <td className="p-3 text-muted-foreground whitespace-pre-line text-xs leading-snug">
                        {phonesOf(s)}
                      </td>
                    )}
                    <td className="p-3 whitespace-nowrap">{classLabel(s.classId)}</td>
                    <td className="p-3">
                      {sectionName ? (
                        <span
                          className={cn(
                            "inline-flex min-w-[1.75rem] items-center justify-center rounded-md border px-2 py-0.5 text-xs font-semibold",
                            sectionBadgeClass(sectionName),
                          )}
                        >
                          {sectionName}
                        </span>
                      ) : null}
                    </td>
                    {showMonthlyCol && (
                      <>
                        <td className="p-3 whitespace-nowrap">
                          {isPending ? "" : formatPkr(s.monthlyFee)}
                        </td>
                        <td className="p-3 whitespace-nowrap font-medium text-[#1a2b4b]">
                          {isPending
                            ? ""
                            : formatPkr(
                                Math.max(
                                  0,
                                  (Number(s.monthlyFee) || 0) - (Number(s.monthlyFeeDiscount) || 0),
                                ),
                              )}
                        </td>
                      </>
                    )}
                    <td className="p-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize",
                          statusBadgeClass(s.status as AcademyStudentStatus),
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            statusDotClass(s.status as AcademyStudentStatus),
                          )}
                        />
                        {statusLabel(s.status as AcademyStudentStatus)}
                      </span>
                    </td>
                    {hasActions && (
                      <td className="p-3">
                        <div className="flex justify-end gap-0.5">
                          {isPending && writable && caps.canEdit && (
                            <Button variant="default" size="sm" className="h-8 gap-1 mr-1" asChild>
                              <Link to={activateHref}>
                                <UserCheck className="h-3.5 w-3.5" /> Activate
                              </Link>
                            </Button>
                          )}
                          {caps.canView && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-primary"
                              asChild
                              aria-label="View student"
                            >
                              <Link to={viewHref}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                          )}
                          {writable && caps.canEdit && !isPending && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-sky-600 hover:text-sky-700"
                              asChild
                              aria-label="Edit student"
                            >
                              <Link to={editHref}>
                                <Pencil className="h-4 w-4" />
                              </Link>
                            </Button>
                          )}
                          {writable && caps.canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
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
                {" students"}
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
