import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  BadgeCheck,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock3,
  Palmtree,
  UserX,
  CircleDashed,
  CircleX,
  Clock,
  Eye,
  MoreVertical,
  PlaneTakeoff,
  Save,
  Timer,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { resolveUploadUrl } from "@/lib/api";
import { userDetailHref } from "@/lib/userFormRoutes";
import { fetchClasses, fetchSubjects } from "@/lib/configApi";
import { subjectIcon } from "@/lib/subjectTheme";
import {
  assignUniqueSubjectColors,
  colorForSubjectName,
} from "@/components/modules/timetable/constants";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import PanelStatCard from "@/components/modules/PanelStatCard";
import FilterToolbar, { FilterToolbarActions } from "@/components/modules/FilterToolbar";
import { DefaulterListDownload } from "@/components/modules/student-management/DefaulterListDownload";
import { usePanelSessionOptional } from "@/components/panel-header/PanelSessionContext";
import type { ModuleActionCaps } from "@/lib/permissions";
import {
  exportStaffAttendanceReport,
  fetchStaffPeriodDay,
  fetchStaffPeriodMonth,
  saveStaffPeriodMarks,
  type StaffAttendanceExportFormat,
  type StaffPeriodStatus,
  type StaffPeriodTeacher,
} from "@/lib/aiAttendanceApi";
import { deliverReportBlob, openReportPreviewTab } from "@/lib/reportDownload";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { localTodayYmd } from "@/lib/localDate";
import { cn, formatWallClockRange } from "@/lib/utils";

const PERIOD_STATUSES: { value: StaffPeriodStatus; label: string }[] = [
  { value: "", label: "Unmarked" },
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "late", label: "Late" },
  { value: "leave", label: "Leave" },
];

const STATUS_SELECT_CLASS: Record<string, string> = {
  present:
    "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  late: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  absent:
    "border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950/40 dark:text-red-300",
  leave:
    "border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
};

const STATUS_PILL_CLASS: Record<string, string> = {
  present: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  late: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  absent: "bg-red-500/15 text-red-700 dark:text-red-400",
  leave: "bg-violet-500/15 text-violet-800 dark:text-violet-300",
};

function StatusPill({ status }: { status?: string | null }) {
  if (!status) return <span className="text-muted-foreground">Unmarked</span>;
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold capitalize",
        STATUS_PILL_CLASS[status] || "bg-muted text-muted-foreground"
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}

const MONTH_NAMES = [
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

const STAFF_ROLES = [
  { value: "", label: "All roles" },
  { value: "teacher", label: "Teacher" },
  { value: "accountant", label: "Accountant" },
  { value: "admin", label: "Admin" },
] as const;

type PeriodDraft = { status: StaffPeriodStatus; dirty: boolean };

function periodDraftKey(userId: string, periodKey: string) {
  return `${userId}|${periodKey}`;
}

function weekdayLabel(value?: string) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function StaffAttendanceModule({ caps }: { caps: ModuleActionCaps; perm?: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const navigate = useNavigate();
  const panelSession = usePanelSessionOptional();
  const sessionId = panelSession?.apiSessionId || panelSession?.sessionId || "";
  const isAdmin = user?.role === "admin";
  const canMark = caps.canCreate || caps.canEdit;
  const now = new Date();

  const [view, setView] = useState<"daily" | "monthly">("daily");
  const [date, setDate] = useState(() => localTodayYmd());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [monthTeacherFilter, setMonthTeacherFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [teacherSearch, setTeacherSearch] = useState("");
  const [reportStaffId, setReportStaffId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, PeriodDraft>>({});
  const [savingAll, setSavingAll] = useState(false);
  const [exporting, setExporting] = useState<StaffAttendanceExportFormat | null>(null);

  const { data: dayData, isLoading: dayLoading, isError: dayError, error: dayErr } = useQuery({
    queryKey: ["staff-period-day", date, sessionId],
    queryFn: () => fetchStaffPeriodDay(date, sessionId),
    enabled: caps.canView && Boolean(date) && Boolean(sessionId) && view === "daily",
  });

  const {
    data: monthData,
    isLoading: monthLoading,
    isError: monthError,
    error: monthErr,
  } = useQuery({
    queryKey: ["staff-period-month", month, year, sessionId],
    queryFn: () => fetchStaffPeriodMonth(month, year, sessionId),
    enabled: caps.canView && Boolean(sessionId) && view === "monthly",
  });

  const filterTeachers = (list: StaffPeriodTeacher[]) => {
    const role = roleFilter.trim().toLowerCase();
    const q = teacherSearch.trim().toLowerCase();
    return list.filter((t) => {
      if (role && String(t.role || "").toLowerCase() !== role) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        String(t.email || "").toLowerCase().includes(q)
      );
    });
  };

  const dailyTeachers = useMemo(
    () => filterTeachers(dayData?.teachers || []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayData, roleFilter, teacherSearch]
  );

  const monthTeachers = useMemo(
    () => filterTeachers(monthData?.teachers || []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthData, roleFilter, teacherSearch]
  );

  const selectedTeacher = useMemo(() => {
    const id = isAdmin ? reportStaffId : user?.id || reportStaffId;
    const source = view === "daily" ? dayData?.teachers || [] : monthData?.teachers || [];
    return source.find((t) => t.userId === id) || null;
  }, [isAdmin, reportStaffId, user?.id, view, dayData, monthData]);

  useEffect(() => {
    const teachers = dayData?.teachers || [];
    if (!teachers.length) return;
    setDrafts((prev) => {
      const next = { ...prev };
      teachers.forEach((teacher) => {
        teacher.periods.forEach((period) => {
          const key = periodDraftKey(teacher.userId, period.periodKey);
          if (next[key]?.dirty) return;
          next[key] = {
            status: (period.status || "") as StaffPeriodStatus,
            dirty: false,
          };
        });
      });
      return next;
    });
  }, [dayData]);

  const dirtyCount = useMemo(
    () => Object.values(drafts).filter((d) => d.dirty).length,
    [drafts]
  );

  const selectedStaffName = selectedTeacher?.name || (isAdmin ? "All-Staff" : user?.name || "Staff");

  const reportFileBase = useMemo(() => {
    const safe = (value: string) =>
      String(value || "staff")
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-|-$/g, "") || "staff";
    if (view === "daily") return `${safe(selectedStaffName)}_${date}`;
    return `${safe(selectedStaffName)}_${safe(MONTH_NAMES[month - 1])}-${year}`;
  }, [view, selectedStaffName, date, month, year]);

  const handleExport = async (format: StaffAttendanceExportFormat) => {
    if (!sessionId) {
      toast({ title: "Select a session first", variant: "destructive" });
      return;
    }
    setExporting(format);
    const fileName = `${reportFileBase}.${format}`;
    const preview = openReportPreviewTab(format);
    const staffId = isAdmin ? reportStaffId || monthTeacherFilter : user?.id;
    try {
      const blob = await exportStaffAttendanceReport(
        view === "daily"
          ? {
              scope: "daily",
              format,
              date,
              sessionId,
              userId: staffId || undefined,
              role: !staffId ? roleFilter || undefined : undefined,
            }
          : {
              scope: "monthly",
              format,
              month,
              year,
              sessionId,
              userId: staffId || undefined,
              role: !staffId ? roleFilter || undefined : undefined,
            }
      );
      const mode = deliverReportBlob(blob, fileName, format, preview);
      toast({
        title: mode === "preview" ? "Report preview opened" : "Excel downloaded",
        description: mode === "preview" ? "Use Print or Download from the preview window." : fileName,
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

  const updatePeriod = (userId: string, periodKey: string, status: StaffPeriodStatus) => {
    const key = periodDraftKey(userId, periodKey);
    setDrafts((prev) => ({ ...prev, [key]: { status, dirty: true } }));
  };

  const markingTeachers = useMemo(() => {
    if (isAdmin && reportStaffId) {
      return dailyTeachers.filter((t) => t.userId === reportStaffId);
    }
    return dailyTeachers;
  }, [dailyTeachers, isAdmin, reportStaffId]);

  const saveAll = async () => {
    if (!sessionId) {
      toast({ title: "Select a session first", variant: "destructive" });
      return;
    }
    const marks = markingTeachers.flatMap((teacher) =>
      teacher.periods
        .map((period) => {
          const draft = drafts[periodDraftKey(teacher.userId, period.periodKey)];
          if (!draft?.dirty) return null;
          return {
            userId: teacher.userId,
            periodKey: period.periodKey,
            status: draft.status,
          };
        })
        .filter((row): row is { userId: string; periodKey: string; status: StaffPeriodStatus } =>
          Boolean(row)
        )
    );
    if (!marks.length) {
      toast({ title: "Nothing to save", description: "Choose present, absent, late, or leave." });
      return;
    }
    setSavingAll(true);
    try {
      await saveStaffPeriodMarks({ date, sessionId, marks });
      setDrafts((prev) => {
        const next = { ...prev };
        marks.forEach((mark) => {
          const key = periodDraftKey(mark.userId, mark.periodKey);
          next[key] = { status: mark.status, dirty: false };
        });
        return next;
      });
      qc.invalidateQueries({ queryKey: ["staff-period-day"] });
      qc.invalidateQueries({ queryKey: ["staff-period-month"] });
      toast({
        title: "Period attendance saved",
        description: `${marks.length} period${marks.length === 1 ? "" : "s"} updated.`,
      });
    } catch (e) {
      toast({
        title: "Could not save",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSavingAll(false);
    }
  };

  const classTeachers = useMemo(
    () => markingTeachers.filter((t) => t.attendanceType !== "daily"),
    [markingTeachers]
  );
  const dailyStaff = useMemo(
    () => markingTeachers.filter((t) => t.attendanceType === "daily"),
    [markingTeachers]
  );
  const monthClassTeachers = useMemo(
    () => monthTeachers.filter((t) => t.attendanceType !== "daily"),
    [monthTeachers]
  );
  const monthDailyStaff = useMemo(
    () => monthTeachers.filter((t) => t.attendanceType === "daily"),
    [monthTeachers]
  );
  const selectMonthStaff = (id: string) => {
    setReportStaffId(id);
    setMonthTeacherFilter(id);
  };
  const viewStaffDetails =
    isAdmin && user?.role
      ? (id: string) => navigate(userDetailHref(user.role, id, "staff"))
      : undefined;

  // Same classes + subject catalog (and query keys) as Class Board, so subject colours match it.
  const { data: boardClasses = [] } = useQuery({
    queryKey: ["config-classes", sessionId],
    queryFn: () => fetchClasses(sessionId),
    enabled: caps.canView && Boolean(sessionId),
  });
  const { data: boardSubjects = [] } = useQuery({
    queryKey: ["config-subjects", "all"],
    queryFn: () => fetchSubjects(),
    enabled: caps.canView && Boolean(sessionId),
    staleTime: 60_000,
  });
  const subjectColorByKey = useMemo(() => {
    const classIds = new Set(boardClasses.map((c) => c._id));
    const names: string[] = [];
    for (const subject of boardSubjects) {
      const cid = typeof subject.class === "object" ? subject.class?._id : subject.class;
      if (classIds.size && cid && !classIds.has(String(cid))) continue;
      if (subject.name?.trim()) names.push(subject.name);
    }
    return assignUniqueSubjectColors(names);
  }, [boardClasses, boardSubjects]);

  const stats = useMemo(() => {
    const counts = { totalClasses: 0, present: 0, late: 0, absent: 0, leave: 0, unmarked: 0 };
    if (view === "daily") {
      markingTeachers.forEach((teacher) =>
        teacher.periods.forEach((period) => {
          const status =
            drafts[periodDraftKey(teacher.userId, period.periodKey)]?.status ?? period.status ?? "";
          counts.totalClasses += 1;
          if (status === "present" || status === "late" || status === "absent" || status === "leave") {
            counts[status] += 1;
          } else {
            counts.unmarked += 1;
          }
        })
      );
    } else {
      monthTeachers.forEach((t) => {
        counts.totalClasses += t.totalClasses;
        counts.present += t.present;
        counts.late += t.late;
        counts.absent += t.absent;
        counts.leave += t.leave;
        counts.unmarked += t.unmarked;
      });
    }
    const marked = counts.present + counts.late;
    const attendancePercent = counts.totalClasses
      ? Math.round((marked / counts.totalClasses) * 100)
      : 0;
    return { ...counts, attendancePercent };
  }, [view, markingTeachers, monthTeachers, drafts]);

  const statsHint = view === "daily" ? date : `${MONTH_NAMES[month - 1]} ${year}`;

  const statTiles = [
    { label: "Classes", value: stats.totalClasses, valueClass: "text-sky-700" },
    { label: "Present", value: stats.present, valueClass: "text-emerald-700" },
    { label: "Late", value: stats.late, valueClass: "text-amber-700" },
    { label: "Absent", value: stats.absent, valueClass: "text-rose-700" },
    { label: "Leave", value: stats.leave, valueClass: "text-blue-700" },
    { label: "Unmarked", value: stats.unmarked, valueClass: "text-violet-700" },
  ];

  return (
    <div className="flex h-full max-h-full min-h-0 min-w-0 flex-col overflow-hidden">
    <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overscroll-y-contain px-3 py-4 sm:space-y-5 sm:px-5 sm:py-6 lg:px-8">
      <Card className="rounded-xl border-0 bg-white px-3 py-3 shadow-sm ring-1 ring-black/[0.04] sm:px-5 sm:py-3.5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3 sm:items-center">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
              <Clock className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <h1 className="text-lg font-bold leading-tight tracking-tight text-[#1a2b4b] sm:text-xl">
                Staff Attendance
              </h1>
              <p className="mt-0.5 max-w-xl text-xs leading-snug text-slate-500 sm:text-sm">
                Period time and class come from the published timetable. Mark each period as
                present, absent, late, or leave.
              </p>
            </div>
          </div>
          <p className="rounded-lg bg-primary/10 px-3 py-2 text-xs italic leading-snug text-[#1a2b4b]/80 sm:text-sm lg:max-w-[16rem] lg:shrink-0">
            <span className="mr-1 font-serif text-base not-italic leading-none text-primary">
              &ldquo;
            </span>
            Consistency builds excellence.
            <span className="ml-0.5 font-serif text-base not-italic leading-none text-primary">
              &rdquo;
            </span>
          </p>
        </div>
      </Card>

      {sessionId && (
        <>
        <div className="grid grid-cols-3 gap-2 sm:hidden">
          {statTiles.map((tile) => (
            <div
              key={tile.label}
              className="rounded-xl bg-white px-2 py-2.5 text-center shadow-sm ring-1 ring-black/[0.04]"
            >
              <p className="text-[11px] font-medium text-slate-500">{tile.label}</p>
              <p className={cn("mt-0.5 text-lg font-bold tabular-nums leading-none", tile.valueClass)}>
                {tile.value}
              </p>
            </div>
          ))}
        </div>
        <div className="hidden gap-3 sm:grid sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
          <PanelStatCard
            label="Total classes"
            value={stats.totalClasses}
            hint={`${stats.attendancePercent}% attendance`}
            icon={BookOpen}
            iconWrapClass="bg-[#e0f2fe]"
            iconClass="text-[#0284c7]"
          />
          <PanelStatCard
            label="Present"
            value={stats.present}
            hint={statsHint}
            icon={CheckCircle2}
            iconWrapClass="bg-[#d1fae5]"
            iconClass="text-[#059669]"
          />
          <PanelStatCard
            label="Late"
            value={stats.late}
            hint={statsHint}
            icon={Clock3}
            iconWrapClass="bg-[#fef3c7]"
            iconClass="text-[#d97706]"
          />
          <PanelStatCard
            label="Absent"
            value={stats.absent}
            hint={statsHint}
            icon={UserX}
            iconWrapClass="bg-[#ffe4e6]"
            iconClass="text-[#e11d48]"
          />
          <PanelStatCard
            label="Leave"
            value={stats.leave}
            hint={statsHint}
            icon={Palmtree}
            iconWrapClass="bg-[#dbeafe]"
            iconClass="text-[#2563eb]"
          />
          <PanelStatCard
            label="Unmarked"
            value={stats.unmarked}
            hint="Need marking"
            icon={ClipboardList}
            iconWrapClass="bg-[#ede9fe]"
            iconClass="text-[#7c3aed]"
          />
        </div>
        </>
      )}

      <Card className="p-3 sm:p-4 shadow-sm border-border/80">
        <FilterToolbar>
          {(isAdmin || canMark) && (
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm w-[10rem] shrink-0"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              aria-label="Role filter"
            >
              {STAFF_ROLES.map((r) => (
                <option key={r.value || "all"} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          )}

          {view === "daily" ? (
            <input
              type="date"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm shrink-0"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Date"
            />
          ) : (
            <>
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm w-[10rem] shrink-0"
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                aria-label="Month"
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={name} value={idx + 1}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm w-[7rem] shrink-0"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                aria-label="Year"
              >
                {Array.from({ length: 6 }, (_, i) => now.getFullYear() - 2 + i).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </>
          )}

          {isAdmin && (
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm min-w-[12rem] shrink-0"
              value={view === "monthly" ? monthTeacherFilter : reportStaffId}
              onChange={(e) => {
                setReportStaffId(e.target.value);
                setMonthTeacherFilter(e.target.value);
              }}
              aria-label="Teacher"
            >
              <option value="">All teachers</option>
              {(view === "daily" ? dayData?.teachers || [] : monthData?.teachers || []).map((t) => (
                <option key={t.userId} value={t.userId}>
                  {t.name}
                </option>
              ))}
            </select>
          )}

          {isAdmin && (
            <PanelSearchBar
              value={teacherSearch}
              onChange={setTeacherSearch}
              placeholder="Search by name or email…"
              className="min-w-[12rem] flex-1 max-w-md"
            />
          )}

          <FilterToolbarActions>
            <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
              <button
                type="button"
                onClick={() => setView("daily")}
                className={cn(
                  "h-10 rounded-full px-4 text-sm font-medium transition-colors",
                  view === "daily"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "border border-primary/40 bg-background text-primary hover:bg-primary/5"
                )}
              >
                Daily report
              </button>
              <button
                type="button"
                onClick={() => setView("monthly")}
                className={cn(
                  "h-10 rounded-full px-4 text-sm font-medium transition-colors",
                  view === "monthly"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "border border-primary/40 bg-background text-primary hover:bg-primary/5"
                )}
              >
                Monthly report
              </button>
            </div>
            <DefaulterListDownload
              size="default"
              label="Print / Export"
              exporting={exporting}
              onDownload={(format) => void handleExport(format)}
            />
            {view === "daily" && canMark && (
              <Button
                className="hidden h-10 gap-2 lg:inline-flex"
                disabled={savingAll || dirtyCount === 0}
                onClick={() => void saveAll()}
              >
                <Save className="h-4 w-4" />
                {savingAll ? "Saving…" : dirtyCount > 0 ? `Save (${dirtyCount})` : "Save"}
              </Button>
            )}
          </FilterToolbarActions>
        </FilterToolbar>
      </Card>

      {!sessionId && (
        <Card className="p-6 text-sm text-muted-foreground">
          Select an academic session. Periods are taken from that session’s published timetable.
        </Card>
      )}

      {view === "daily" && sessionId && (
        <Card className="overflow-hidden rounded-xl border-slate-200/80 shadow-sm">
          <div className="flex flex-col gap-1 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:px-4 sm:py-3.5">
            <span className="flex min-w-0 items-start gap-2.5 text-[15px] font-semibold leading-snug text-[#1a2b4b] sm:items-center sm:text-base">
              <CalendarDays className="h-5 w-5 text-primary" />
              Teacher attendance — {date}
              {dayData?.weekday ? ` · ${weekdayLabel(dayData.weekday)}` : ""}
            </span>
            <span className="flex shrink-0 items-center gap-1.5 pl-7 text-xs font-medium text-slate-500 sm:pl-0">
              <Users className="h-4 w-4" />
              {dayLoading ? "Loading timetable…" : `${classTeachers.length} teachers`}
            </span>
          </div>
          <div className="min-w-0 px-3 pb-3 sm:px-4 sm:pb-4">
            {dayError && (
              <p className="px-2 pb-2 text-sm text-destructive">
                {dayErr instanceof Error ? dayErr.message : "Could not load the timetable."}
              </p>
            )}
            <DayClassGrid
              subjectColorByKey={subjectColorByKey}
              teachers={classTeachers}
              loading={dayLoading}
              drafts={drafts}
              canMark={canMark}
              onChange={updatePeriod}
              onViewDetails={viewStaffDetails}
            />
          </div>
        </Card>
      )}

      {view === "daily" && sessionId && !dayLoading && dailyStaff.length > 0 && (
        <Card className="overflow-hidden rounded-xl border-slate-200/80 shadow-sm">
          <div className="flex flex-col gap-1 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:px-4 sm:py-3.5">
            <span className="flex min-w-0 items-start gap-2.5 text-[15px] font-semibold leading-snug text-[#1a2b4b] sm:items-center sm:text-base">
              <UserCheck className="h-5 w-5 text-primary" />
              Staff attendance — {date}
              {dayData?.weekday ? ` · ${weekdayLabel(dayData.weekday)}` : ""}
            </span>
            <span className="flex shrink-0 items-center gap-1.5 pl-7 text-xs font-medium text-slate-500 sm:pl-0">
              <Users className="h-4 w-4" />
              {`${dailyStaff.length} staff`}
            </span>
          </div>
          <div className="min-w-0 px-3 pb-3 sm:px-4 sm:pb-4">
            <StaffDayTable
              staff={dailyStaff}
              drafts={drafts}
              canMark={canMark}
              onChange={updatePeriod}
              onViewDetails={viewStaffDetails}
            />
          </div>
        </Card>
      )}

      {view === "monthly" && sessionId && (
        <Card className="overflow-hidden rounded-xl border-slate-200/80 shadow-sm">
          <div className="flex flex-col gap-1 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:px-4 sm:py-3.5">
            <span className="flex min-w-0 items-start gap-2.5 text-[15px] font-semibold leading-snug text-[#1a2b4b] sm:items-center sm:text-base">
              <CalendarDays className="h-5 w-5 text-primary" />
              Teacher attendance — {MONTH_NAMES[month - 1]} {year}
            </span>
            <span className="flex shrink-0 items-center gap-1.5 pl-7 text-xs font-medium text-slate-500 sm:pl-0">
              <Users className="h-4 w-4" />
              {monthLoading ? "Loading…" : `${monthClassTeachers.length} teachers`}
            </span>
          </div>
          <div className="min-w-0 space-y-3 px-3 pb-3 sm:space-y-4 sm:px-4 sm:pb-4">
            {monthError && (
              <p className="text-sm text-destructive">
                {monthErr instanceof Error ? monthErr.message : "Could not load the monthly report."}
              </p>
            )}
            <TeacherSummaryTable
              variant="class"
              teachers={monthClassTeachers}
              loading={monthLoading}
              selectedId={selectedTeacher?.userId}
              onSelect={selectMonthStaff}
              emptyLabel="No classes on the published timetable this month."
            />
            {selectedTeacher && selectedTeacher.attendanceType !== "daily" && (
              <PeriodMarkTable
                teacher={selectedTeacher}
                drafts={drafts}
                canMark={false}
                showDate
                onChange={updatePeriod}
              />
            )}
          </div>
        </Card>
      )}

      {view === "monthly" && sessionId && !monthLoading && monthDailyStaff.length > 0 && (
        <Card className="overflow-hidden rounded-xl border-slate-200/80 shadow-sm">
          <div className="flex flex-col gap-1 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:px-4 sm:py-3.5">
            <span className="flex min-w-0 items-start gap-2.5 text-[15px] font-semibold leading-snug text-[#1a2b4b] sm:items-center sm:text-base">
              <UserCheck className="h-5 w-5 text-primary" />
              Staff attendance — {MONTH_NAMES[month - 1]} {year}
            </span>
            <span className="flex shrink-0 items-center gap-1.5 pl-7 text-xs font-medium text-slate-500 sm:pl-0">
              <Users className="h-4 w-4" />
              {`${monthDailyStaff.length} staff`}
            </span>
          </div>
          <div className="min-w-0 space-y-3 px-3 pb-3 sm:space-y-4 sm:px-4 sm:pb-4">
            <TeacherSummaryTable
              variant="daily"
              teachers={monthDailyStaff}
              loading={false}
              selectedId={selectedTeacher?.userId}
              onSelect={selectMonthStaff}
              emptyLabel="No staff to show this month."
            />
            {selectedTeacher && selectedTeacher.attendanceType === "daily" && (
              <PeriodMarkTable
                teacher={selectedTeacher}
                drafts={drafts}
                canMark={false}
                showDate
                onChange={updatePeriod}
              />
            )}
          </div>
        </Card>
      )}
    </div>
    {view === "daily" && canMark && dirtyCount > 0 && (
      <div className="shrink-0 border-t border-slate-200 bg-white/95 px-3 py-2.5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 lg:hidden">
        <Button className="h-11 w-full gap-2" disabled={savingAll} onClick={() => void saveAll()}>
          <Save className="h-4 w-4" />
          {savingAll ? "Saving…" : `Save ${dirtyCount} change${dirtyCount === 1 ? "" : "s"}`}
        </Button>
      </div>
    )}
    </div>
  );
}

const DAY_STATUS_STYLE: Record<string, { className: string; icon: LucideIcon }> = {
  present: {
    className:
      "border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
    icon: BadgeCheck,
  },
  late: {
    className:
      "border-blue-100 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300",
    icon: Timer,
  },
  absent: {
    className:
      "border-red-100 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
    icon: CircleX,
  },
  leave: {
    className:
      "border-violet-100 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300",
    icon: PlaneTakeoff,
  },
  "": {
    className:
      "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300",
    icon: CircleDashed,
  },
};

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

function DayStatusControl({
  status,
  canMark,
  label,
  onChange,
  options = PERIOD_STATUSES,
  size = "sm",
}: {
  status: StaffPeriodStatus;
  canMark: boolean;
  label: string;
  onChange: (status: StaffPeriodStatus) => void;
  options?: typeof PERIOD_STATUSES;
  size?: "sm" | "md";
}) {
  const style = DAY_STATUS_STYLE[status] || DAY_STATUS_STYLE[""];
  const Icon = style.icon;
  const text = PERIOD_STATUSES.find((s) => s.value === status)?.label || "Unmarked";
  return (
    <div
      className={cn(
        "relative flex w-full items-center rounded-md border font-medium",
        size === "md" ? "h-10 text-sm" : "h-8 text-xs",
        style.className
      )}
    >
      <Icon className="pointer-events-none absolute left-2.5 h-3.5 w-3.5" />
      {canMark ? (
        <>
          <select
            className="h-full w-full cursor-pointer appearance-none rounded-md bg-transparent pl-8 pr-8 outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            value={status}
            onChange={(e) => onChange(e.target.value as StaffPeriodStatus)}
            aria-label={label}
          >
            {options.map((s) => (
              <option key={s.label} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5" />
        </>
      ) : (
        <span className="pl-8 pr-3">{text}</span>
      )}
    </div>
  );
}

/** Subject chip with the same colour and icon as the Class Board card. */
function SubjectChip({
  subjectLabel,
  fallback,
  colorByKey,
}: {
  subjectLabel?: string;
  fallback: string;
  colorByKey: Map<string, number>;
}) {
  // Parallel periods list several subjects ("Maths, Physics"); colour by the first, like Class Board.
  const primary = String(subjectLabel || "").split(",")[0].trim();
  if (!primary) return <p className="text-xs text-slate-500 leading-snug">{fallback}</p>;
  const Icon = subjectIcon(primary);
  return (
    <span
      className={cn(
        "mt-1 inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold",
        colorForSubjectName(primary, colorByKey)
      )}
      title={subjectLabel}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{subjectLabel}</span>
    </span>
  );
}

function AttendanceActionsMenu({
  label,
  canMark,
  onViewDetails,
  items,
}: {
  label: string;
  canMark: boolean;
  onViewDetails?: () => void;
  items: { key: string; label: string; icon: LucideIcon; onClick: () => void }[];
}) {
  if (!canMark && !onViewDetails) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0 border-slate-200 text-[#1a2b4b] lg:h-9 lg:w-9"
          aria-label={label}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {canMark &&
          items.map((item) => {
            const Icon = item.icon;
            return (
              <DropdownMenuItem key={item.key} onClick={item.onClick}>
                <Icon className="mr-2 h-4 w-4" /> {item.label}
              </DropdownMenuItem>
            );
          })}
        {canMark && onViewDetails && items.length > 0 ? <DropdownMenuSeparator /> : null}
        {onViewDetails ? (
          <DropdownMenuItem onClick={onViewDetails}>
            <Eye className="mr-2 h-4 w-4" /> View profile
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ClassRatio({
  present,
  total,
  hasLate,
}: {
  present: number;
  total: number;
  hasLate: boolean;
}) {
  const percent = total ? Math.round((present / total) * 100) : 0;
  return (
    <div className="min-w-[7.25rem]">
      <p className="text-[13px] font-semibold text-[#1a2b4b] dark:text-slate-100">
        {present} / {total} classes
      </p>
      <p className="mb-1.5 text-xs font-semibold text-[#1a2b4b] dark:text-slate-200">{percent}%</p>
      <div className="h-2 w-full max-w-[10rem] overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={cn("h-full rounded-full transition-all", hasLate ? "bg-blue-500" : "bg-emerald-500")}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function DayClassGrid({
  subjectColorByKey,
  teachers,
  loading,
  drafts,
  canMark,
  onChange,
  onViewDetails,
}: {
  subjectColorByKey: Map<string, number>;
  teachers: StaffPeriodTeacher[];
  loading: boolean;
  drafts: Record<string, PeriodDraft>;
  canMark: boolean;
  onChange: (userId: string, periodKey: string, status: StaffPeriodStatus) => void;
  onViewDetails?: (userId: string) => void;
}) {
  const classCount = teachers.reduce((max, teacher) => Math.max(max, teacher.periods.length), 0);
  if (loading) return <p className="p-2 text-sm text-muted-foreground">Loading timetable…</p>;

  const statusFor = (teacher: StaffPeriodTeacher, period: StaffPeriodTeacher["periods"][number]) =>
    (drafts[periodDraftKey(teacher.userId, period.periodKey)]?.status ??
      period.status ??
      "") as StaffPeriodStatus;

  const teacherWidth = "15rem";
  const classWidth = "13.5rem";
  const ratioWidth = "10.5rem";
  const actionWidth = "5.5rem";
  const headClass =
    "whitespace-nowrap border-b border-r border-slate-200/80 bg-[#eef4fc] px-3 py-3 text-left text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";
  const cellClass =
    "border-b border-r border-slate-100 bg-white px-3 py-3 align-top group-hover:bg-slate-50/80 dark:border-slate-800 dark:bg-slate-950 dark:group-hover:bg-slate-900/60";

  const rows = teachers.map((teacher) => {
    const statuses = teacher.periods.map((period) => statusFor(teacher, period));
    const total = teacher.periods.length;
    const present = statuses.filter((s) => s === "present").length;
    const hasLate = statuses.includes("late");
    const markAll = (status: StaffPeriodStatus) =>
      teacher.periods.forEach((period) => onChange(teacher.userId, period.periodKey, status));
    const items = [
      { key: "present", label: "Mark all present", icon: UserCheck, onClick: () => markAll("present") },
      { key: "absent", label: "Mark all absent", icon: CircleX, onClick: () => markAll("absent") },
      { key: "leave", label: "Mark all leave", icon: PlaneTakeoff, onClick: () => markAll("leave") },
      ...(statuses.some(Boolean)
        ? [{ key: "clear", label: "Clear marks", icon: CircleDashed, onClick: () => markAll("") }]
        : []),
    ];
    return { teacher, statuses, total, present, hasLate, items };
  });

  if (teachers.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-muted-foreground">
        No classes on the published timetable for this day.
      </p>
    );
  }

  return (
    <div className="w-full max-w-full min-w-0 overflow-x-auto overscroll-x-contain rounded-lg border border-slate-200/80 dark:border-slate-700">
        <table
          className="border-separate border-spacing-0 text-sm"
          style={{
            width: "max-content",
            minWidth: "100%",
            borderCollapse: "separate",
          }}
        >
          <colgroup>
            <col style={{ width: teacherWidth }} />
            {Array.from({ length: classCount }, (_, index) => (
              <col key={index} style={{ width: classWidth }} />
            ))}
            <col style={{ width: ratioWidth }} />
            <col style={{ width: actionWidth }} />
          </colgroup>
          <thead>
            <tr>
              <th className={headClass} style={{ width: teacherWidth, minWidth: teacherWidth }}>
                Teacher
              </th>
              {Array.from({ length: classCount }, (_, index) => (
                <th key={index} className={headClass} style={{ width: classWidth, minWidth: classWidth }}>
                  Class {index + 1}
                </th>
              ))}
              <th className={headClass} style={{ width: ratioWidth, minWidth: ratioWidth }}>
                Class Ratio
              </th>
              <th className={headClass} style={{ width: actionWidth, minWidth: actionWidth }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ teacher, statuses, total, present, hasLate, items }) => (
              <tr key={teacher.userId} className="group">
                <td className={cn(cellClass, "align-middle")} style={{ width: teacherWidth, minWidth: teacherWidth }}>
                  <StaffIdentity person={teacher} />
                </td>
                {Array.from({ length: classCount }, (_, index) => {
                  const period = teacher.periods[index];
                  if (!period) {
                    return (
                      <td key={index} className={cellClass} style={{ width: classWidth, minWidth: classWidth }}>
                        <p className="text-[13px] font-semibold leading-snug text-slate-700">—</p>
                        <p className="mb-2.5 whitespace-nowrap text-xs leading-snug text-slate-500">No class</p>
                        <div className="flex h-8 w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-100/80 px-2.5 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/60">
                          <Clock className="h-3.5 w-3.5" />
                          No class
                        </div>
                      </td>
                    );
                  }
                  return (
                    <td key={period.periodKey} className={cellClass} style={{ width: classWidth, minWidth: classWidth }}>
                      <p className="text-[13px] font-semibold leading-snug text-[#1a2b4b] dark:text-slate-100">
                        {[period.classLabel, period.sectionLabel].filter(Boolean).join(" · ") || "—"}
                      </p>
                      <SubjectChip
                        subjectLabel={period.subjectLabel}
                        fallback={period.label || "Class"}
                        colorByKey={subjectColorByKey}
                      />
                      <p className="mb-2.5 mt-1 whitespace-nowrap text-xs leading-snug text-slate-500">
                        {period.startTime ? formatWallClockRange(period.startTime, period.endTime, "–") : "—"}
                      </p>
                      <DayStatusControl
                        status={statuses[index]}
                        canMark={canMark}
                        label={`${teacher.name} class ${index + 1} status`}
                        onChange={(status) => onChange(teacher.userId, period.periodKey, status)}
                      />
                    </td>
                  );
                })}
                <td className={cn(cellClass, "align-middle")} style={{ width: ratioWidth, minWidth: ratioWidth }}>
                  <ClassRatio present={present} total={total} hasLate={hasLate} />
                </td>
                <td className={cn(cellClass, "align-middle")} style={{ width: actionWidth, minWidth: actionWidth }}>
                  <AttendanceActionsMenu
                    label={`More actions for ${teacher.name}`}
                    canMark={canMark}
                    onViewDetails={onViewDetails ? () => onViewDetails(teacher.userId) : undefined}
                    items={items}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
    </div>
  );
}

function StaffIdentity({ person }: { person: StaffPeriodTeacher }) {
  const imgSrc = person.profileImage ? resolveUploadUrl(person.profileImage) : undefined;
  return (
    <div className="flex items-center gap-3">
      <Avatar className="h-10 w-10 shrink-0">
        {imgSrc ? <AvatarImage src={imgSrc} alt={person.name} className="object-cover" /> : null}
        <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
          {initials(person.name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-[#1a2b4b] dark:text-slate-100">
          {person.name}
        </p>
        {person.email ? <p className="truncate text-xs text-slate-500">{person.email}</p> : null}
      </div>
    </div>
  );
}

const ROLE_BADGE_CLASS: Record<string, string> = {
  admin:
    "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300",
  accountant:
    "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-300",
};

const DAY_STATUS_SUMMARY: Record<string, { text: string; dot: string }> = {
  present: { text: "Present for the day", dot: "bg-emerald-500" },
  late: { text: "Arrived late", dot: "bg-blue-500" },
  absent: { text: "Absent today", dot: "bg-red-500" },
  leave: { text: "On leave", dot: "bg-violet-500" },
  "": { text: "Not marked yet", dot: "bg-slate-300 dark:bg-slate-600" },
};

const STAFF_MARK_ACTIONS: { status: StaffPeriodStatus; label: string; icon: LucideIcon }[] = [
  { status: "present", label: "Mark present", icon: UserCheck },
  { status: "late", label: "Mark late", icon: Timer },
  { status: "absent", label: "Mark absent", icon: CircleX },
  { status: "leave", label: "Mark leave", icon: PlaneTakeoff },
];

/** Non-teaching staff (admin, accountant, …): one full-day mark each. */
function StaffDayTable({
  staff,
  drafts,
  canMark,
  onChange,
  onViewDetails,
}: {
  staff: StaffPeriodTeacher[];
  drafts: Record<string, PeriodDraft>;
  canMark: boolean;
  onChange: (userId: string, periodKey: string, status: StaffPeriodStatus) => void;
  onViewDetails?: (userId: string) => void;
}) {
  const cellClass =
    "px-3 py-3 align-middle border-r border-slate-100 last:border-r-0 dark:border-slate-800";
  const headClass =
    "whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-slate-700 border-r border-slate-200/70 last:border-r-0 dark:text-slate-200 dark:border-slate-700";

  return (
    <div className="w-full max-w-full min-w-0 overflow-x-auto overscroll-x-contain rounded-lg border border-slate-200/80 dark:border-slate-700">
      <table className="w-full min-w-[52.75rem] border-collapse text-sm">
        <thead className="bg-[#eef4fc] border-b border-slate-200/80 dark:bg-slate-800/60 dark:border-slate-700">
          <tr>
            <th className={cn(headClass, "min-w-[14rem]")}>Staff</th>
            <th className={cn(headClass, "min-w-[8rem]")}>Role</th>
            <th className={cn(headClass, "min-w-[13rem]")}>Attendance</th>
            <th className={cn(headClass, "min-w-[13rem]")}>Status</th>
            <th className={cn(headClass, "min-w-[4.75rem]")}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((person) => {
            const period = person.periods[0];
            const draft = period ? drafts[periodDraftKey(person.userId, period.periodKey)] : undefined;
            const status = (draft?.status ?? period?.status ?? "") as StaffPeriodStatus;
            const summary = DAY_STATUS_SUMMARY[status] || DAY_STATUS_SUMMARY[""];
            const role = String(person.role || "staff").toLowerCase();
            const mark = (next: StaffPeriodStatus) => {
              if (period) onChange(person.userId, period.periodKey, next);
            };
            return (
              <tr
                key={person.userId}
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-800/30"
              >
                <td className={cellClass}>
                  <StaffIdentity person={person} />
                </td>
                <td className={cellClass}>
                  <span
                    className={cn(
                      "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize",
                      ROLE_BADGE_CLASS[role] ||
                        "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300"
                    )}
                  >
                    {role}
                  </span>
                </td>
                <td className={cellClass}>
                  <div className="max-w-[14rem]">
                    <DayStatusControl
                      status={status}
                      canMark={canMark && Boolean(period)}
                      label={`${person.name} attendance`}
                      onChange={mark}
                    />
                  </div>
                </td>
                <td className={cellClass}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-2 whitespace-nowrap text-xs font-medium text-slate-700 dark:text-slate-200">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", summary.dot)} />
                      {summary.text}
                    </span>
                    {draft?.dirty ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                        Unsaved
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 whitespace-nowrap pl-4 text-[11px] text-slate-500">Full-day attendance</p>
                </td>
                <td className={cellClass}>
                  {(onViewDetails || canMark) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 border-slate-200 text-[#1a2b4b]"
                          aria-label={`More actions for ${person.name}`}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canMark &&
                          period &&
                          STAFF_MARK_ACTIONS.map(({ status: next, label, icon: Icon }) => (
                            <DropdownMenuItem key={next} onClick={() => mark(next)}>
                              <Icon className="mr-2 h-4 w-4" /> {label}
                            </DropdownMenuItem>
                          ))}
                        {canMark && period && status && (
                          <DropdownMenuItem onClick={() => mark("")}>
                            <CircleDashed className="mr-2 h-4 w-4" /> Clear mark
                          </DropdownMenuItem>
                        )}
                        {canMark && onViewDetails && <DropdownMenuSeparator />}
                        {onViewDetails && (
                          <DropdownMenuItem onClick={() => onViewDetails(person.userId)}>
                            <Eye className="mr-2 h-4 w-4" /> View profile
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Distinct school days in the month this person is scheduled (classes) or expected (staff). */
function workingDayCount(person: StaffPeriodTeacher) {
  return new Set(person.periods.map((p) => p.day).filter(Boolean)).size;
}

function TeacherSummaryTable({
  variant,
  teachers,
  loading,
  selectedId,
  onSelect,
  emptyLabel,
}: {
  variant: "class" | "daily";
  teachers: StaffPeriodTeacher[];
  loading: boolean;
  selectedId?: string;
  onSelect: (id: string) => void;
  emptyLabel: string;
}) {
  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const isDailyTable = variant === "daily";
  const cellClass =
    "px-3 py-3 align-middle border-r border-slate-100 last:border-r-0 dark:border-slate-800";
  const numClass = cn(cellClass, "text-right tabular-nums");
  const headClass =
    "whitespace-nowrap px-3 py-3 text-xs font-semibold text-slate-700 border-r border-slate-200/70 last:border-r-0 dark:text-slate-200 dark:border-slate-700";
  const numHead = cn(headClass, "min-w-[5.5rem] text-right");

  return (
    <div className="w-full max-w-full min-w-0 overflow-x-auto overscroll-x-contain rounded-lg border border-slate-200/80 dark:border-slate-700">
      <table className="w-full min-w-[64rem] border-collapse text-sm">
        <thead className="bg-[#eef4fc] border-b border-slate-200/80 dark:bg-slate-800/60 dark:border-slate-700">
          <tr>
            <th className={cn(headClass, "min-w-[14rem] text-left")}>{isDailyTable ? "Staff" : "Teacher"}</th>
            {isDailyTable ? (
              <th className={cn(headClass, "min-w-[8rem] text-left")}>Role</th>
            ) : (
              <th className={numHead}>Classes</th>
            )}
            <th className={numHead}>Days</th>
            <th className={numHead}>Present</th>
            <th className={numHead}>Late</th>
            <th className={numHead}>Absent</th>
            <th className={numHead}>Leave</th>
            <th className={numHead}>Unmarked</th>
            <th className={cn(headClass, "min-w-[9rem] text-left")}>Attendance</th>
          </tr>
        </thead>
        <tbody>
          {teachers.length === 0 && (
            <tr>
              <td colSpan={9} className="p-8 text-center text-muted-foreground">
                {emptyLabel}
              </td>
            </tr>
          )}
          {teachers.map((t) => {
            const role = String(t.role || "staff").toLowerCase();
            const percent = Math.round(t.attendancePercent || 0);
            return (
              <tr
                key={t.userId}
                className={cn(
                  "border-b border-slate-100 last:border-0 cursor-pointer hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-800/30",
                  selectedId === t.userId && "bg-primary/5 hover:bg-primary/5"
                )}
                onClick={() => onSelect(t.userId)}
              >
                <td className={cellClass}>
                  <StaffIdentity person={t} />
                </td>
                {isDailyTable ? (
                  <td className={cellClass}>
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize",
                        ROLE_BADGE_CLASS[role] ||
                          "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300"
                      )}
                    >
                      {role}
                    </span>
                  </td>
                ) : (
                  <td className={cn(numClass, "font-semibold text-[#1a2b4b] dark:text-slate-100")}>
                    {t.totalClasses}
                  </td>
                )}
                <td className={cn(numClass, "font-semibold text-[#1a2b4b] dark:text-slate-100")}>
                  {workingDayCount(t)}
                </td>
                <td className={cn(numClass, "text-emerald-700 dark:text-emerald-400")}>{t.present}</td>
                <td className={cn(numClass, "text-blue-700 dark:text-blue-400")}>{t.late}</td>
                <td className={cn(numClass, "text-red-700 dark:text-red-400")}>{t.absent}</td>
                <td className={cn(numClass, "text-violet-700 dark:text-violet-400")}>{t.leave}</td>
                <td className={cn(numClass, "text-slate-500")}>{t.unmarked}</td>
                <td className={cellClass}>
                  <p className="text-xs font-semibold text-[#1a2b4b] mb-1.5 dark:text-slate-200">
                    {t.attendancePercent}%
                  </p>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        percent >= 75 ? "bg-emerald-500" : percent >= 50 ? "bg-blue-500" : "bg-red-500"
                      )}
                      style={{ width: `${Math.min(percent, 100)}%` }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const CLASS_DETAIL_GRID =
  "grid min-w-[40rem] grid-cols-[minmax(5.5rem,0.9fr)_minmax(9.5rem,1.1fr)_minmax(4.5rem,0.6fr)_minmax(4.5rem,0.55fr)_minmax(6.5rem,1fr)_7.5rem] items-center gap-x-3";

function groupPeriodsByDate(periods: StaffPeriodTeacher["periods"]) {
  const groups: {
    day: string;
    weekday?: string;
    periods: StaffPeriodTeacher["periods"];
  }[] = [];
  const byDay = new Map<string, (typeof groups)[number]>();
  periods.forEach((period) => {
    const day = period.day || "—";
    let group = byDay.get(day);
    if (!group) {
      group = { day, weekday: period.weekday, periods: [] };
      byDay.set(day, group);
      groups.push(group);
    }
    group.periods.push(period);
  });
  return groups;
}

function PeriodMarkTable({
  teacher,
  drafts,
  canMark,
  showDate,
  onChange,
}: {
  teacher: StaffPeriodTeacher;
  drafts: Record<string, PeriodDraft>;
  canMark: boolean;
  showDate: boolean;
  onChange: (userId: string, periodKey: string, status: StaffPeriodStatus) => void;
}) {
  const periodStatus = (periodKey: string, fallback: string) =>
    (canMark
      ? drafts[periodDraftKey(teacher.userId, periodKey)]?.status ?? fallback ?? ""
      : fallback || "") as StaffPeriodStatus;

  const renderStatus = (periodKey: string, label: string, status: StaffPeriodStatus) =>
    canMark ? (
      <select
        className={cn(
          "h-9 w-full min-w-[6.5rem] rounded-md border px-2 text-sm font-semibold bg-background",
          STATUS_SELECT_CLASS[status] || ""
        )}
        value={status}
        onChange={(e) => onChange(teacher.userId, periodKey, e.target.value as StaffPeriodStatus)}
        aria-label={`Status for ${label}`}
      >
        {PERIOD_STATUSES.map((s) => (
          <option key={s.label} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    ) : (
      <StatusPill status={status} />
    );

  const dateGroups = showDate ? groupPeriodsByDate(teacher.periods) : [];

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-primary">
        {teacher.name} — {teacher.totalClasses} class{teacher.totalClasses === 1 ? "" : "es"}
      </h2>
      <div className="w-full max-w-full min-w-0 overflow-x-auto overscroll-x-contain">
        <table className="w-full min-w-[50rem] border-collapse text-sm">
          <thead className="bg-muted/50 border-b">
            {showDate ? (
              <tr>
                <th className="text-left p-2.5 font-medium align-bottom w-[9.5rem]">Date</th>
                <th className="p-0 text-left font-medium">
                  <div className="px-2.5 pt-2.5">Classes</div>
                  <div
                    className={cn(
                      CLASS_DETAIL_GRID,
                      "px-2.5 pb-2 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                    )}
                  >
                    <span>Period</span>
                    <span>Time</span>
                    <span>Class</span>
                    <span>Section</span>
                    <span>Subject</span>
                    <span>Status</span>
                  </div>
                </th>
              </tr>
            ) : (
              <tr>
                <th className="min-w-[6rem] whitespace-nowrap p-2.5 text-left font-medium">Period</th>
                <th className="min-w-[9.5rem] whitespace-nowrap p-2.5 text-left font-medium">Time</th>
                <th className="min-w-[5rem] whitespace-nowrap p-2.5 text-left font-medium">Class</th>
                <th className="min-w-[5rem] whitespace-nowrap p-2.5 text-left font-medium">Section</th>
                <th className="min-w-[7rem] whitespace-nowrap p-2.5 text-left font-medium">Subject</th>
                <th className="min-w-[7.5rem] whitespace-nowrap p-2.5 text-left font-medium">Status</th>
              </tr>
            )}
          </thead>
          <tbody>
            {teacher.periods.length === 0 && (
              <tr>
                <td colSpan={showDate ? 2 : 6} className="p-6 text-center text-muted-foreground">
                  No periods on the timetable.
                </td>
              </tr>
            )}
            {showDate
              ? dateGroups.map((group) => (
                  <tr key={group.day} className="border-b last:border-0 align-top">
                    <td className="p-2.5 whitespace-nowrap border-r border-border align-middle">
                      <div className="font-medium">{group.day}</div>
                      {group.weekday ? (
                        <span className="block text-[10px] uppercase text-muted-foreground">
                          {weekdayLabel(group.weekday)}
                        </span>
                      ) : null}
                    </td>
                    <td className="p-0">
                      {group.periods.map((period, index) => {
                        const status = periodStatus(period.periodKey, period.status || "");
                        return (
                          <div
                            key={`${period.periodKey}-${period.classLabel}-${period.sectionLabel}-${index}`}
                            className={cn(
                              CLASS_DETAIL_GRID,
                              "px-2.5 py-2",
                              index < group.periods.length - 1 && "border-b border-border/70"
                            )}
                          >
                            <span>{period.label || "—"}</span>
                            <span className="whitespace-nowrap">
                              {period.startTime ? formatWallClockRange(period.startTime, period.endTime, "–") : "—"}
                            </span>
                            <span>{period.classLabel || "—"}</span>
                            <span>{period.sectionLabel || "—"}</span>
                            <span>{period.subjectLabel || "—"}</span>
                            <span>{renderStatus(period.periodKey, period.label || "class", status)}</span>
                          </div>
                        );
                      })}
                    </td>
                  </tr>
                ))
              : teacher.periods.map((period) => {
                  const status = periodStatus(period.periodKey, period.status || "");
                  return (
                    <tr
                      key={`${period.day || "day"}-${period.periodKey}-${period.classLabel}`}
                      className="border-b last:border-0"
                    >
                      <td className="whitespace-nowrap p-2.5">{period.label || "—"}</td>
                      <td className="whitespace-nowrap p-2.5">
                        {period.startTime ? formatWallClockRange(period.startTime, period.endTime, "–") : "—"}
                      </td>
                      <td className="whitespace-nowrap p-2.5">{period.classLabel || "—"}</td>
                      <td className="whitespace-nowrap p-2.5">{period.sectionLabel || "—"}</td>
                      <td className="whitespace-nowrap p-2.5">{period.subjectLabel || "—"}</td>
                      <td className="p-2.5">
                        {renderStatus(period.periodKey, period.label || "class", status)}
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
