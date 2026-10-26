import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
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
import { cn } from "@/lib/utils";

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

  const summary = view === "daily" ? dayData?.summary : monthData?.summary;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      <Card className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
              <Clock className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight">
                Staff Attendance
              </h1>
              <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500 max-w-xl">
                Period time and class come from the published timetable. Mark each period as
                present, absent, late, or leave.
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
                className="gap-2 h-10"
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
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-border font-semibold text-primary flex flex-wrap items-center justify-between gap-2">
            <span>
              Daily classes — {date}
              {dayData?.weekday ? ` · ${weekdayLabel(dayData.weekday)}` : ""}
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              {dayLoading ? "Loading timetable…" : `${markingTeachers.length} teachers`}
            </span>
          </div>
          <div className="p-4">
            {dayError && (
              <p className="text-sm text-destructive">
                {dayErr instanceof Error ? dayErr.message : "Could not load the timetable."}
              </p>
            )}
            <DayClassGrid
              teachers={markingTeachers}
              loading={dayLoading}
              drafts={drafts}
              canMark={canMark}
              onChange={updatePeriod}
            />
          </div>
        </Card>
      )}

      {view === "monthly" && sessionId && (
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-border font-semibold text-primary">
            Monthly classes — {MONTH_NAMES[month - 1]} {year}
          </div>
          <div className="p-4 space-y-4">
            {monthError && (
              <p className="text-sm text-destructive">
                {monthErr instanceof Error ? monthErr.message : "Could not load the monthly report."}
              </p>
            )}
            {summary && (
              <div className="flex flex-wrap gap-2 text-xs">
                <CountPill label="Total classes" value={summary.totalClasses} />
                <CountPill label="Present" value={summary.present} tone="present" />
                <CountPill label="Late" value={summary.late} tone="late" />
                <CountPill label="Absent" value={summary.absent} tone="absent" />
                <CountPill label="Leave" value={summary.leave} tone="leave" />
                <CountPill label="Unmarked" value={summary.unmarked} />
                <CountPill label="Attendance" value={`${summary.attendancePercent}%`} />
              </div>
            )}
            <TeacherSummaryTable
              teachers={monthTeachers}
              loading={monthLoading}
              selectedId={selectedTeacher?.userId}
              onSelect={(id) => {
                setReportStaffId(id);
                setMonthTeacherFilter(id);
              }}
              emptyLabel="No classes on the published timetable this month."
            />
            {selectedTeacher && (
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
  );
}

function CountPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: string;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 font-medium",
        tone ? STATUS_PILL_CLASS[tone] : "bg-muted text-muted-foreground"
      )}
    >
      {label}: {value}
    </span>
  );
}

function DayClassGrid({
  teachers,
  loading,
  drafts,
  canMark,
  onChange,
}: {
  teachers: StaffPeriodTeacher[];
  loading: boolean;
  drafts: Record<string, PeriodDraft>;
  canMark: boolean;
  onChange: (userId: string, periodKey: string, status: StaffPeriodStatus) => void;
}) {
  const classCount = teachers.reduce((max, teacher) => Math.max(max, teacher.periods.length), 0);
  if (loading) return <p className="text-sm text-muted-foreground">Loading timetable…</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead className="bg-muted/50 border-b">
          <tr>
            <th className="text-left p-2.5 font-medium whitespace-nowrap">Teacher</th>
            {Array.from({ length: classCount }, (_, index) => (
              <th key={index} className="text-left p-2.5 font-medium whitespace-nowrap min-w-[11rem]">
                Class {index + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {teachers.length === 0 && (
            <tr>
              <td colSpan={Math.max(2, classCount + 1)} className="p-8 text-center text-muted-foreground">
                No classes on the published timetable for this day.
              </td>
            </tr>
          )}
          {teachers.map((teacher) => (
            <tr key={teacher.userId} className="border-b last:border-0 align-top">
              <td className="p-2.5">
                <div className="font-medium">{teacher.name}</div>
                {teacher.email ? (
                  <p className="text-xs text-muted-foreground">{teacher.email}</p>
                ) : null}
              </td>
              {Array.from({ length: classCount }, (_, index) => {
                const period = teacher.periods[index];
                if (!period) {
                  return (
                    <td key={index} className="p-2.5 text-muted-foreground">
                      —
                    </td>
                  );
                }
                const status = (drafts[periodDraftKey(teacher.userId, period.periodKey)]?.status ??
                  period.status ??
                  "") as StaffPeriodStatus;
                return (
                  <td key={period.periodKey} className="p-2.5">
                    <p className="font-medium leading-snug">
                      {[period.classLabel, period.sectionLabel].filter(Boolean).join(" · ") || "—"}
                    </p>
                    <p className="text-xs text-muted-foreground leading-snug">
                      {period.subjectLabel || period.label || "Class"}
                    </p>
                    <p className="text-xs text-muted-foreground mb-2">
                      {period.startTime}–{period.endTime}
                    </p>
                    {canMark ? (
                      <select
                        className={cn(
                          "h-9 w-full min-w-[8.5rem] rounded-md border px-2 text-sm font-semibold bg-background",
                          STATUS_SELECT_CLASS[status] || ""
                        )}
                        value={status}
                        onChange={(e) =>
                          onChange(
                            teacher.userId,
                            period.periodKey,
                            e.target.value as StaffPeriodStatus
                          )
                        }
                        aria-label={`${teacher.name} class ${index + 1} status`}
                      >
                        {PERIOD_STATUSES.map((s) => (
                          <option key={s.label} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <StatusPill status={status} />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeacherSummaryTable({
  teachers,
  loading,
  selectedId,
  onSelect,
  emptyLabel,
}: {
  teachers: StaffPeriodTeacher[];
  loading: boolean;
  selectedId?: string;
  onSelect: (id: string) => void;
  emptyLabel: string;
}) {
  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[760px]">
        <thead className="bg-muted/50 border-b">
          <tr>
            <th className="text-left p-2.5 font-medium">Teacher</th>
            <th className="text-left p-2.5 font-medium">Role</th>
            <th className="text-right p-2.5 font-medium">Total classes</th>
            <th className="text-right p-2.5 font-medium">Present</th>
            <th className="text-right p-2.5 font-medium">Late</th>
            <th className="text-right p-2.5 font-medium">Absent</th>
            <th className="text-right p-2.5 font-medium">Leave</th>
            <th className="text-right p-2.5 font-medium">Unmarked</th>
            <th className="text-right p-2.5 font-medium">Attendance</th>
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
          {teachers.map((t) => (
            <tr
              key={t.userId}
              className={cn(
                "border-b last:border-0 cursor-pointer hover:bg-muted/30",
                selectedId === t.userId && "bg-primary/5"
              )}
              onClick={() => onSelect(t.userId)}
            >
              <td className="p-2.5">
                <div className="font-medium">{t.name}</div>
                {t.email ? <p className="text-xs text-muted-foreground">{t.email}</p> : null}
              </td>
              <td className="p-2.5 capitalize text-muted-foreground">{t.role || "—"}</td>
              <td className="p-2.5 text-right font-semibold">{t.totalClasses}</td>
              <td className="p-2.5 text-right">{t.present}</td>
              <td className="p-2.5 text-right">{t.late}</td>
              <td className="p-2.5 text-right">{t.absent}</td>
              <td className="p-2.5 text-right">{t.leave}</td>
              <td className="p-2.5 text-right">{t.unmarked}</td>
              <td className="p-2.5 text-right">{t.attendancePercent}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-primary">
        {teacher.name} — {teacher.totalClasses} class{teacher.totalClasses === 1 ? "" : "es"}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-muted/50 border-b">
            <tr>
              {showDate && <th className="text-left p-2.5 font-medium">Date</th>}
              <th className="text-left p-2.5 font-medium">Period</th>
              <th className="text-left p-2.5 font-medium">Time</th>
              <th className="text-left p-2.5 font-medium">Class</th>
              <th className="text-left p-2.5 font-medium">Section</th>
              <th className="text-left p-2.5 font-medium">Subject</th>
              <th className="text-left p-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {teacher.periods.length === 0 && (
              <tr>
                <td colSpan={showDate ? 7 : 6} className="p-6 text-center text-muted-foreground">
                  No periods on the timetable.
                </td>
              </tr>
            )}
            {teacher.periods.map((period) => {
              const status = (
                canMark
                  ? drafts[periodDraftKey(teacher.userId, period.periodKey)]?.status ?? period.status ?? ""
                  : period.status || ""
              ) as StaffPeriodStatus;
              return (
                <tr key={`${period.day || "day"}-${period.periodKey}-${period.classLabel}`} className="border-b last:border-0">
                  {showDate && (
                    <td className="p-2.5 whitespace-nowrap">
                      {period.day || "—"}
                      {period.weekday ? (
                        <span className="block text-[10px] uppercase text-muted-foreground">
                          {weekdayLabel(period.weekday)}
                        </span>
                      ) : null}
                    </td>
                  )}
                  <td className="p-2.5">{period.label || "—"}</td>
                  <td className="p-2.5 whitespace-nowrap">
                    {period.startTime}–{period.endTime}
                  </td>
                  <td className="p-2.5">{period.classLabel || "—"}</td>
                  <td className="p-2.5">{period.sectionLabel || "—"}</td>
                  <td className="p-2.5">{period.subjectLabel || "—"}</td>
                  <td className="p-2.5">
                    {canMark ? (
                      <select
                        className={cn(
                          "h-9 w-full min-w-[8rem] rounded-md border px-2 text-sm font-semibold bg-background",
                          STATUS_SELECT_CLASS[status] || ""
                        )}
                        value={status}
                        onChange={(e) =>
                          onChange(teacher.userId, period.periodKey, e.target.value as StaffPeriodStatus)
                        }
                        aria-label={`Status for ${period.label}`}
                      >
                        {PERIOD_STATUSES.map((s) => (
                          <option key={s.label} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <StatusPill status={status} />
                    )}
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
