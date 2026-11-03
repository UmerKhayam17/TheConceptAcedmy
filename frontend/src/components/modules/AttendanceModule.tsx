import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isValid, parseISO } from "date-fns";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Loader2,
  Palmtree,
  Users,
  UserX,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SquareCheckbox } from "@/components/ui/square-checkbox";
import { DateRangePickerField } from "@/components/ui/date-range-picker";
import { ModuleActionCaps, PermLevel } from "@/lib/permissions";
import { useToast } from "@/hooks/use-toast";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import FilterToolbar, { FilterToolbarActions } from "@/components/modules/FilterToolbar";
import ClassProgramSelect from "@/components/modules/ClassProgramSelect";
import { matchesPanelSearch } from "@/lib/panelSearch";
import { cn, formatClockTime } from "@/lib/utils";
import { avatarTone } from "@/lib/avatarTone";
import { resolveUploadUrl } from "@/lib/api";
import {
  exportAcademyAttendance,
  fetchAcademyAbsentList,
  fetchAcademyAttendanceDay,
  fetchAcademyClasses,
  fetchSectionsByClass,
  markAcademyAttendance,
  type AcademyAttendanceRecord,
  type AcademyStudent,
  type AttendanceExportFormat,
  type AttendanceExportReportKind,
} from "@/lib/studentManagementApi";
import { useAuth } from "@/hooks/useAuth";
import { useSessionScope } from "@/components/modules/timetable/SessionBar";
import { usePanelSession } from "@/components/panel-header/PanelSessionContext";
import { localTodayYmd } from "@/lib/localDate";
import ParentAttendancePanel from "@/components/modules/parent/ParentAttendancePanel";
import PanelStatCard from "@/components/modules/PanelStatCard";
import { DefaulterListDownload } from "@/components/modules/student-management/DefaulterListDownload";
import { deliverReportBlob, openReportPreviewTab } from "@/lib/reportDownload";
import { compareClassLevels } from "@/lib/configApi";

const today = () => localTodayYmd();

type AttendanceView = "mark" | "absent";

function classLabel(s: AcademyStudent) {
  const c = s.classId;
  if (typeof c === "object" && c && "className" in c) return c.className;
  return "—";
}

function sectionLabel(s: AcademyStudent) {
  const sec = s.sectionId;
  if (typeof sec === "object" && sec && "sectionName" in sec) return sec.sectionName;
  return "—";
}

function studentRef(s: AcademyStudent) {
  return s.rollNumber || s.studentId || s.registrationNumber || "";
}

/** 9th → 10th → 1st Year → 2nd Year, then section, then roll. */
function compareAttendanceStudents(a: AcademyStudent, b: AcademyStudent) {
  const byClass = compareClassLevels(classLabel(a), classLabel(b));
  if (byClass !== 0) return byClass;
  const bySection = sectionLabel(a).localeCompare(sectionLabel(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (bySection !== 0) return bySection;
  const ra = studentRef(a);
  const rb = studentRef(b);
  if (ra && rb && ra !== rb) {
    return ra.localeCompare(rb, undefined, { numeric: true, sensitivity: "base" });
  }
  if (ra && !rb) return -1;
  if (!ra && rb) return 1;
  return (a.studentName || "").localeCompare(b.studentName || "", undefined, { sensitivity: "base" });
}

const MARK_BUTTONS = [
  {
    status: "present" as const,
    label: "P",
    on: "!border-primary !bg-primary !text-primary-foreground hover:!bg-primary",
    off: "!border-primary !bg-transparent !text-primary hover:!bg-primary hover:!text-primary-foreground",
  },
  {
    status: "late" as const,
    label: "Late",
    on: "border-amber-500 bg-amber-500 text-white shadow-sm hover:bg-amber-600",
    off: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
  },
  {
    status: "absent" as const,
    label: "A",
    on: "border-rose-600 bg-rose-600 text-white shadow-sm hover:bg-rose-700",
    off: "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100",
  },
  {
    status: "leave" as const,
    label: "L",
    on: "border-sky-600 bg-sky-600 text-white shadow-sm hover:bg-sky-700",
    off: "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100",
  },
];

function statusBadgeClass(status: string) {
  if (status === "present") return "border-primary/20 bg-primary/10 text-primary";
  if (status === "late") return "border-amber-200 bg-amber-100 text-amber-800";
  if (status === "absent") return "border-rose-200 bg-rose-100 text-rose-800";
  if (status === "leave") return "border-sky-200 bg-sky-100 text-sky-800";
  return "border-border bg-muted text-muted-foreground";
}

function statusDotClass(status: string) {
  if (status === "present") return "bg-primary";
  if (status === "late") return "bg-amber-500";
  if (status === "absent") return "bg-rose-600";
  if (status === "leave") return "bg-sky-600";
  return "bg-muted-foreground";
}

function statusLabel(status: string) {
  if (!status) return "—";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function initialOf(name?: string) {
  const ch = String(name || "").trim().charAt(0);
  return ch ? ch.toUpperCase() : "?";
}

function StudentNameCell({ student }: { student: AcademyStudent }) {
  const imgSrc = student.photoImage ? resolveUploadUrl(student.photoImage) : null;
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {imgSrc ? (
        <img
          src={imgSrc}
          alt=""
          className="h-8 w-8 shrink-0 rounded-md border border-border object-cover"
        />
      ) : (
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-semibold",
            avatarTone(student.studentName || ""),
          )}
        >
          {initialOf(student.studentName)}
        </span>
      )}
      <span className="truncate font-medium text-foreground">{student.studentName}</span>
    </div>
  );
}

function fmtTime(iso?: string) {
  return formatClockTime(iso);
}

function formatDisplayDate(ymd?: string) {
  if (!ymd) return "—";
  const d = parseISO(ymd.slice(0, 10));
  if (!isValid(d)) return ymd;
  return format(d, "dd MMM yyyy");
}

function formatRangeLabel(from: string, to: string) {
  if (from === to) return formatDisplayDate(from);
  return `${formatDisplayDate(from)} – ${formatDisplayDate(to)}`;
}

function StaffAttendanceModule({ caps }: { caps: ModuleActionCaps }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { sessionId } = usePanelSession();
  const { apiSessionId, writable, hasScope } = useSessionScope(sessionId);

  const [view, setView] = useState<AttendanceView>("mark");
  const [dateFrom, setDateFrom] = useState(today());
  const [dateTo, setDateTo] = useState(today());
  const [classFilter, setClassFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [studentFilter, setStudentFilter] = useState("");
  const [exporting, setExporting] = useState<AttendanceExportFormat | null>(null);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const canMark = writable && (caps.canCreate || caps.canEdit);

  /** Marking list always uses the To date. */
  const date = dateTo;
  const isRange = dateFrom !== dateTo;
  const rangeLabel = formatRangeLabel(dateFrom, dateTo);

  useEffect(() => {
    setClassFilter("");
    setSectionFilter("");
    setStudentFilter("");
  }, [sessionId]);

  useEffect(() => {
    setSectionFilter("");
    setStudentFilter("");
  }, [classFilter]);

  useEffect(() => {
    setStudentFilter("");
  }, [sectionFilter]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [date, classFilter, sectionFilter, studentFilter, search, sessionId]);

  const { data: classes = [] } = useQuery({
    queryKey: ["academy-classes-attendance", sessionId],
    queryFn: () => fetchAcademyClasses({ status: "active", sessionId: apiSessionId }),
    enabled: hasScope,
  });

  const { data: sections = [] } = useQuery({
    queryKey: ["academy-sections-attendance", classFilter],
    queryFn: () => fetchSectionsByClass(classFilter, { status: "active" }),
    enabled: Boolean(classFilter),
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["academy-attendance-day", date, sessionId, classFilter, sectionFilter],
    queryFn: () =>
      fetchAcademyAttendanceDay({
        date,
        classId: classFilter || undefined,
        sectionId: sectionFilter || undefined,
        sessionId: classFilter ? undefined : apiSessionId,
      }),
    enabled: hasScope && view === "mark",
  });

  const {
    data: absentData,
    isLoading: absentLoading,
    isError: absentIsError,
    error: absentError,
  } = useQuery({
    queryKey: [
      "academy-attendance-absent",
      dateFrom,
      dateTo,
      sessionId,
      classFilter,
      sectionFilter,
      studentFilter,
    ],
    queryFn: () =>
      fetchAcademyAbsentList({
        dateFrom,
        dateTo,
        classId: classFilter || undefined,
        sectionId: sectionFilter || undefined,
        sessionId: classFilter ? undefined : apiSessionId,
        studentId: studentFilter || undefined,
      }),
    enabled: hasScope && view === "absent" && dateFrom <= dateTo,
  });

  const markMut = useMutation({
    mutationFn: (entries: { studentId: string; status: "present" | "absent" | "late" | "leave" }[]) =>
      markAcademyAttendance({ date, entries }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academy-attendance-day", date] });
      qc.invalidateQueries({ queryKey: ["academy-attendance-absent"] });
      qc.invalidateQueries({ queryKey: ["academy-attendance-summary"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const recordMap = useMemo(() => {
    const m = new Map<string, AcademyAttendanceRecord>();
    (data?.records ?? []).forEach((r) => {
      const sid = typeof r.studentId === "object" ? (r.studentId as { _id?: string })._id : r.studentId;
      if (sid) m.set(String(sid), r);
    });
    return m;
  }, [data?.records]);

  const students = data?.students ?? [];

  const studentsFiltered = useMemo(() => {
    let base = students;
    if (studentFilter) {
      base = students.filter((s) => s._id === studentFilter);
    }
    if (search.trim()) {
      base = base.filter((s) =>
        matchesPanelSearch(
          search,
          s.studentName,
          s.studentId,
          studentRef(s),
          classLabel(s),
          sectionLabel(s),
          user?.role === "teacher" ? undefined : s.phone,
        ),
      );
    }
    return [...base].sort(compareAttendanceStudents);
  }, [students, search, studentFilter, user?.role]);

  const visibleSummary = useMemo(() => {
    const counts = { present: 0, absent: 0, leave: 0, late: 0 };
    studentsFiltered.forEach((s) => {
      const rec = recordMap.get(s._id);
      // No saved mark → absent by default
      if (!rec) counts.absent += 1;
      else if (rec.status in counts) (counts as Record<string, number>)[rec.status] += 1;
    });
    return counts;
  }, [studentsFiltered, recordMap]);

  /** Flat rows for the absent list — same date filter as the toolbar. */
  const absentRows = useMemo(() => {
    const rows: { date: string; student: AcademyStudent }[] = [];
    (absentData?.days ?? []).forEach((day) => {
      day.students.forEach((s) => {
        if (studentFilter && s._id !== studentFilter) return;
        if (
          search.trim() &&
          !matchesPanelSearch(
            search,
            s.studentName,
            s.studentId,
            studentRef(s),
            classLabel(s),
            sectionLabel(s),
            user?.role === "teacher" ? undefined : s.phone,
          )
        ) {
          return;
        }
        rows.push({ date: day.date, student: s });
      });
    });
    return rows;
  }, [absentData?.days, search, studentFilter, user?.role]);

  const handleExport = async (
    format: AttendanceExportFormat,
    reportKind: AttendanceExportReportKind = "attendance",
  ) => {
    if (dateFrom > dateTo) {
      toast({
        title: "Invalid date range",
        description: "From date must be on or before To date.",
        variant: "destructive",
      });
      return;
    }
    setExporting(format);
    const preview = openReportPreviewTab(format);
    try {
      const blob = await exportAcademyAttendance(
        {
          dateFrom,
          dateTo,
          classId: classFilter || undefined,
          sectionId: sectionFilter || undefined,
          sessionId: classFilter ? undefined : apiSessionId,
          studentId: studentFilter || undefined,
          reportKind,
        },
        format,
      );
      const rangeStub = dateFrom === dateTo ? dateFrom : `${dateFrom}_to_${dateTo}`;
      const fileStub =
        reportKind === "absent"
          ? `Absent-List_${rangeStub}`
          : `Student-Attendance_${rangeStub}`;
      const mode = deliverReportBlob(blob, `${fileStub}.${format}`, format, preview);
      toast({
        title: mode === "preview" ? "Report preview opened" : "Excel downloaded",
        description:
          mode === "preview" ? "Use Print or Download from the preview window." : undefined,
      });
    } catch {
      preview?.close();
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  const mark = (studentId: string, status: "present" | "absent" | "late" | "leave") => {
    if (!writable) {
      toast({
        title: "Read-only session",
        description: "Switch to the active session to mark attendance.",
        variant: "destructive",
      });
      return;
    }
    markMut.mutate([{ studentId, status }], { onSuccess: () => toast({ title: `Marked ${status}` }) });
  };

  const visibleIds = studentsFiltered.map((s) => s._id);
  const selectedCount = visibleIds.filter((id) => selectedIds.has(id)).length;
  const allSelected = visibleIds.length > 0 && selectedCount === visibleIds.length;
  const someSelected = selectedCount > 0 && !allSelected;

  const toggleSelectAll = (next: boolean) => {
    setSelectedIds((prev) => {
      const copy = new Set(prev);
      visibleIds.forEach((id) => {
        if (next) copy.add(id);
        else copy.delete(id);
      });
      return copy;
    });
  };

  const toggleSelectOne = (id: string, next: boolean) => {
    setSelectedIds((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });
  };

  const markSelected = (status: "present" | "absent" | "late" | "leave") => {
    if (!writable) {
      toast({
        title: "Read-only session",
        description: "Switch to the active session to mark attendance.",
        variant: "destructive",
      });
      return;
    }
    const ids = visibleIds.filter((id) => selectedIds.has(id));
    if (!ids.length) return;
    markMut.mutate(
      ids.map((studentId) => ({ studentId, status })),
      {
        onSuccess: () => {
          toast({ title: `Marked ${ids.length} ${ids.length === 1 ? "student" : "students"} ${status}` });
          setSelectedIds(new Set());
        },
      },
    );
  };

  const colSpan = canMark ? 9 : 7;

  return (
    <div>
      <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        <Card className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
                <ClipboardList className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
              </span>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight">
                  Student Attendance
                </h1>
                <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500 max-w-xl">
                  Mark attendance day by day, or open the absent list for the selected date range.
                </p>
              </div>
            </div>
            <div className="shrink-0 rounded-lg bg-primary/10 px-3 py-2 max-w-[14rem]">
              <p className="text-xs sm:text-sm italic leading-snug text-[#1a2b4b]/80">
                <span className="mr-1 text-primary not-italic font-serif text-base leading-none">
                  &ldquo;
                </span>
                Consistency builds excellence.
                <span className="ml-0.5 text-primary not-italic font-serif text-base leading-none">
                  &rdquo;
                </span>
              </p>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <PanelStatCard
            label="Present"
            value={visibleSummary.present}
            hint={date}
            icon={CheckCircle2}
            iconWrapClass="bg-[#d1fae5]"
            iconClass="text-[#059669]"
          />
          <PanelStatCard
            label="Late"
            value={visibleSummary.late}
            hint="Today"
            icon={Clock3}
            iconWrapClass="bg-[#fef3c7]"
            iconClass="text-[#d97706]"
          />
          <PanelStatCard
            label="Absent"
            value={visibleSummary.absent}
            hint="Default until marked"
            icon={UserX}
            iconWrapClass="bg-[#ffe4e6]"
            iconClass="text-[#e11d48]"
          />
          <PanelStatCard
            label="Leave"
            value={visibleSummary.leave}
            hint="Today"
            icon={Palmtree}
            iconWrapClass="bg-[#dbeafe]"
            iconClass="text-[#2563eb]"
          />
        </div>

        <Card className="p-3 sm:p-4 shadow-sm border-border/80">
          <FilterToolbar>
            <DateRangePickerField
              from={dateFrom}
              to={dateTo}
              onChange={(nextFrom, nextTo) => {
                setDateFrom(nextFrom);
                setDateTo(nextTo);
              }}
            />
            <ClassProgramSelect
              className="w-[16.5rem] shrink-0"
              label={false}
              value={classFilter}
              onChange={setClassFilter}
              classes={classes}
              allowAll
              disabled={!hasScope}
              selectClassName="rounded-md border-input h-10"
            />
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm w-[10rem] shrink-0"
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              disabled={!classFilter || sections.length === 0}
              aria-label="Section filter"
            >
              <option value="">{classFilter ? "All Sections" : "Select class first"}</option>
              {sections.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.sectionName}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm min-w-[12rem] shrink-0"
              value={studentFilter}
              onChange={(e) => setStudentFilter(e.target.value)}
              disabled={!classFilter}
              aria-label="Student filter"
            >
              <option value="">{classFilter ? "All students" : "Select class first"}</option>
              {students.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.studentName}
                  {studentRef(s) ? ` (${studentRef(s)})` : ""}
                </option>
              ))}
            </select>
            <PanelSearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search student, class, or section…"
              className="min-w-[12rem] flex-1 max-w-md"
            />
            <FilterToolbarActions>
              <DefaulterListDownload
                size="default"
                label={isRange ? "Export range" : "Print / Export"}
                exporting={exporting}
                disabled={!hasScope || dateFrom > dateTo}
                reportKinds={[
                  {
                    id: "attendance",
                    label: isRange ? "Attendance summary" : "Daily attendance",
                  },
                  { id: "absent", label: "Absent list" },
                ]}
                onDownload={(format, reportKind) =>
                  void handleExport(
                    format,
                    reportKind === "absent" ? "absent" : "attendance",
                  )
                }
              />
            </FilterToolbarActions>
          </FilterToolbar>
        </Card>

        {canMark && selectedCount > 0 && (
          <Card className="border-border/80 p-3 shadow-sm sm:px-4 sm:py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-[#1a2b4b]">{selectedCount}</span>
                {" selected"}
                {markMut.isPending ? (
                  <span className="ml-2 inline-flex items-center gap-1.5 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Working…
                  </span>
                ) : null}
              </p>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="h-9 gap-1.5 bg-primary text-primary-foreground hover:bg-primary"
                  disabled={markMut.isPending}
                  onClick={() => markSelected("present")}
                >
                  Present
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 border-amber-300 text-amber-800 hover:bg-amber-50"
                  disabled={markMut.isPending}
                  onClick={() => markSelected("late")}
                >
                  Late
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 border-rose-300 text-rose-800 hover:bg-rose-50"
                  disabled={markMut.isPending}
                  onClick={() => markSelected("absent")}
                >
                  Absent
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 border-sky-300 text-sky-800 hover:bg-sky-50"
                  disabled={markMut.isPending}
                  onClick={() => markSelected("leave")}
                >
                  Leave
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-1.5 text-muted-foreground"
                  disabled={markMut.isPending}
                  onClick={() => setSelectedIds(new Set())}
                >
                  <X className="h-4 w-4" />
                  Clear
                </Button>
              </div>
            </div>
          </Card>
        )}

        <Card className="overflow-hidden border-border/80 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  {canMark && (
                    <th className="w-10 p-3 text-center">
                      <SquareCheckbox
                        checked={allSelected}
                        indeterminate={someSelected}
                        onChange={() => toggleSelectAll(!allSelected)}
                        aria-label="Select all students"
                      />
                    </th>
                  )}
                  <th className="p-3 text-left font-medium whitespace-nowrap">Roll number</th>
                  <th className="p-3 text-left font-medium whitespace-nowrap">Student</th>
                  <th className="p-3 text-left font-medium whitespace-nowrap">Class</th>
                  <th className="p-3 text-left font-medium whitespace-nowrap">Section</th>
                  <th className="p-3 text-left font-medium whitespace-nowrap">Status</th>
                  <th className="p-3 text-left font-medium whitespace-nowrap">First check-in</th>
                  <th className="p-3 text-left font-medium whitespace-nowrap">Last check-out</th>
                  {canMark && <th className="p-3 text-right font-medium whitespace-nowrap">Mark</th>}
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={colSpan} className="p-10 text-center text-muted-foreground">
                      Loading students…
                    </td>
                  </tr>
                )}
                {isError && (
                  <tr>
                    <td colSpan={colSpan} className="p-10 text-center text-destructive">
                      {(error as Error).message}
                    </td>
                  </tr>
                )}
                {!isLoading && !isError && studentsFiltered.length === 0 && (
                  <tr>
                    <td colSpan={colSpan} className="p-10 text-center text-muted-foreground">
                      {students.length === 0
                        ? "No active academy students for this session. Register students in Student Records."
                        : "No students match your search."}
                    </td>
                  </tr>
                )}
                {studentsFiltered.map((s) => {
                  const record = recordMap.get(s._id);
                  const cur = record?.status ?? "absent";
                  return (
                    <tr
                      key={s._id}
                      className={cn(
                        "border-b last:border-0 transition-colors hover:bg-muted/20",
                        selectedIds.has(s._id) && "bg-muted/50",
                      )}
                    >
                      {canMark && (
                        <td className="w-10 p-3 text-center">
                          <SquareCheckbox
                            checked={selectedIds.has(s._id)}
                            onChange={() => toggleSelectOne(s._id, !selectedIds.has(s._id))}
                            aria-label={`Select ${s.studentName}`}
                          />
                        </td>
                      )}
                      <td className="p-3 whitespace-nowrap text-muted-foreground">
                        {s.rollNumber || "—"}
                      </td>
                      <td className="p-3">
                        <StudentNameCell student={s} />
                      </td>
                      <td className="p-3 whitespace-nowrap">{classLabel(s)}</td>
                      <td className="p-3 whitespace-nowrap">{sectionLabel(s)}</td>
                      <td className="p-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                            statusBadgeClass(cur),
                          )}
                        >
                          <span className={cn("h-1.5 w-1.5 rounded-full", statusDotClass(cur))} aria-hidden />
                          {statusLabel(cur)}
                        </span>
                        {record?.source === "ai" && (
                          <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary/80">
                            AI
                          </span>
                        )}
                      </td>
                      <td className="p-3 whitespace-nowrap text-muted-foreground">{fmtTime(record?.checkIn)}</td>
                      <td className="p-3 whitespace-nowrap text-muted-foreground">{fmtTime(record?.checkOut)}</td>
                      {canMark && (
                        <td className="p-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1">
                            {MARK_BUTTONS.map((btn) => (
                              <Button
                                key={btn.status}
                                size="sm"
                                variant="outline"
                                disabled={markMut.isPending}
                                className={cn(
                                  "h-9 rounded-md border px-3 text-xs font-semibold",
                                  cur === btn.status ? btn.on : btn.off,
                                )}
                                onClick={() => mark(s._id, btn.status)}
                              >
                                {btn.label}
                              </Button>
                            ))}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

const AttendanceModule = ({ perm: _perm, caps }: { perm: PermLevel; caps: ModuleActionCaps }) => {
  const { user } = useAuth();
  if (user?.role === "parent") {
    return <ParentAttendancePanel />;
  }
  return <StaffAttendanceModule caps={caps} />;
};

export default AttendanceModule;
