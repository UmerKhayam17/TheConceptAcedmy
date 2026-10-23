import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import { DefaulterListDownload } from "@/components/modules/student-management/DefaulterListDownload";
import { usePanelSessionOptional } from "@/components/panel-header/PanelSessionContext";
import type { ModuleActionCaps } from "@/lib/permissions";
import {
  exportStaffAttendanceReport,
  fetchMyStaffAttendance,
  fetchStaffAttendanceDay,
  fetchStaffAttendanceMonth,
  fetchStaffTeachers,
  markStaffAttendanceManual,
  type StaffAttendanceExportFormat,
  type StaffAttendanceRecord,
  type StaffAttendanceStatus,
  type StaffTeacherOption,
} from "@/lib/aiAttendanceApi";
import { fetchPeriodTemplates } from "@/lib/timetableApi";
import {
  deliverReportBlob,
  openReportPreviewTab,
} from "@/lib/reportDownload";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { localTodayYmd } from "@/lib/localDate";
import { cn } from "@/lib/utils";

const STATUSES: { value: StaffAttendanceStatus; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "late", label: "Late" },
  { value: "absent", label: "Absent" },
  { value: "half_day", label: "Half day" },
  { value: "leave", label: "Leave" },
];

const STATUS_SELECT_CLASS: Record<StaffAttendanceStatus, string> = {
  present:
    "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  late: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  absent:
    "border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950/40 dark:text-red-300",
  half_day:
    "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  leave:
    "border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
};

const STATUS_PILL_CLASS: Record<string, string> = {
  present: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  late: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  absent: "bg-red-500/15 text-red-700 dark:text-red-400",
  half_day: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
  leave: "bg-violet-500/15 text-violet-800 dark:text-violet-300",
};

function StatusPill({ status }: { status?: string | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const key = status as StaffAttendanceStatus;
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold capitalize",
        STATUS_PILL_CLASS[key] || "bg-muted text-muted-foreground"
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

type RowDraft = {
  status: StaffAttendanceStatus;
  timeIn: string;
  timeOut: string;
  notes: string;
  dirty: boolean;
};

function fmtTime(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function fmtDate(iso?: string) {
  if (!iso) return "—";
  return String(iso).slice(0, 10);
}

function toTimeInput(iso?: string) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

/** Normalize typed times like 8:30, 08.30, 830 → HH:mm */
function normalizeTimeHm(raw: string) {
  const t = raw.trim().replace(".", ":");
  if (!t) return "";
  const m = t.match(/^(\d{1,2}):(\d{2})$/) || t.match(/^(\d{1,2})(\d{2})$/);
  if (!m) return t;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(min) || h > 23 || min > 59) return t;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function combineLocalDateTime(dateYmd: string, timeHm: string) {
  const normalized = normalizeTimeHm(timeHm);
  if (!dateYmd || !normalized || !/^\d{2}:\d{2}$/.test(normalized)) return undefined;
  const d = new Date(`${dateYmd}T${normalized}:00`);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function recordUserId(r: StaffAttendanceRecord) {
  return typeof r.userId === "object" && r.userId ? r.userId._id : String(r.userId || "");
}

function recordUserName(r: StaffAttendanceRecord) {
  return typeof r.userId === "object" && r.userId ? r.userId.name || "—" : "—";
}

const STAFF_ROLES = [
  { value: "", label: "All roles" },
  { value: "teacher", label: "Teacher" },
  { value: "accountant", label: "Accountant" },
  { value: "admin", label: "Admin" },
] as const;

function staffRoleName(
  role?: { _id: string; name?: string } | string | null
): string {
  if (!role) return "";
  if (typeof role === "object") return String(role.name || "").toLowerCase();
  return String(role).toLowerCase();
}

type AcademyHours = { timeIn: string; timeOut: string };

const FALLBACK_ACADEMY_HOURS: AcademyHours = { timeIn: "08:00", timeOut: "14:00" };

function emptyDraft(hours: AcademyHours = FALLBACK_ACADEMY_HOURS): RowDraft {
  return {
    status: "present",
    timeIn: hours.timeIn,
    timeOut: hours.timeOut,
    notes: "",
    dirty: false,
  };
}

function draftFromRecord(
  r: StaffAttendanceRecord | undefined,
  hours: AcademyHours = FALLBACK_ACADEMY_HOURS
): RowDraft {
  if (!r) return emptyDraft(hours);
  const status = (r.status as StaffAttendanceStatus) || "present";
  const needsTimes = status === "present" || status === "late" || status === "half_day";
  return {
    status,
    timeIn: toTimeInput(r.checkIn) || (needsTimes ? hours.timeIn : ""),
    timeOut: toTimeInput(r.checkOut) || (needsTimes ? hours.timeOut : ""),
    notes: r.notes || "",
    dirty: false,
  };
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
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [savingAll, setSavingAll] = useState(false);
  const [exporting, setExporting] = useState<StaffAttendanceExportFormat | null>(null);

  const { data: periodTemplates = [] } = useQuery({
    queryKey: ["period-templates", sessionId],
    queryFn: () => fetchPeriodTemplates(sessionId),
    enabled: Boolean(sessionId) && caps.canView,
  });

  const academyHours = useMemo<AcademyHours>(() => {
    const active = periodTemplates.find((t) => t.isDefault) || periodTemplates[0];
    const timeIn = normalizeTimeHm(active?.academyStartTime || "");
    const timeOut = normalizeTimeHm(active?.academyEndTime || "");
    return {
      timeIn: /^\d{2}:\d{2}$/.test(timeIn) ? timeIn : FALLBACK_ACADEMY_HOURS.timeIn,
      timeOut: /^\d{2}:\d{2}$/.test(timeOut) ? timeOut : FALLBACK_ACADEMY_HOURS.timeOut,
    };
  }, [periodTemplates]);

  const {
    data: teachers = [],
    isLoading: teachersLoading,
    isError: teachersError,
    error: teachersErr,
  } = useQuery({
    queryKey: ["staff-attendance-teachers"],
    queryFn: fetchStaffTeachers,
    enabled: caps.canView && (isAdmin || canMark),
  });

  const { data: dayData, isLoading: dayLoading } = useQuery({
    queryKey: ["staff-attendance-day", date, isAdmin],
    queryFn: () => fetchStaffAttendanceDay(date, isAdmin ? undefined : user?.id),
    enabled: caps.canView && Boolean(date) && view === "daily",
  });

  const { data: monthData, isLoading: monthLoading } = useQuery({
    queryKey: ["staff-attendance-month", month, year, isAdmin, monthTeacherFilter],
    queryFn: () =>
      fetchStaffAttendanceMonth(
        month,
        year,
        isAdmin ? monthTeacherFilter || undefined : user?.id
      ),
    enabled: caps.canView && view === "monthly" && (isAdmin || Boolean(user?.id)),
  });

  const { data: monthRows = [], isLoading: mineLoading } = useQuery({
    queryKey: ["staff-attendance-mine", month, year],
    queryFn: () => fetchMyStaffAttendance(month, year),
    enabled: caps.canView && !isAdmin && view === "monthly",
  });

  const dayRecords = useMemo(() => dayData?.records || [], [dayData]);
  const recordsByUser = useMemo(() => {
    const map = new Map<string, StaffAttendanceRecord>();
    dayRecords.forEach((r) => map.set(recordUserId(r), r));
    return map;
  }, [dayRecords]);

  const sortStaffByName = (list: StaffTeacherOption[]) =>
    [...list].sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" })
    );

  const allDailyStaff: StaffTeacherOption[] = useMemo(() => {
    if (isAdmin || canMark) {
      return sortStaffByName(teachers.filter((t) => t.isActive !== false));
    }
    if (user?.id) {
      return [{ _id: user.id, name: user.name || "You", email: user.email, isActive: true }];
    }
    return [];
  }, [isAdmin, canMark, teachers, user]);

  const staffByRole = useMemo(() => {
    const base = !roleFilter
      ? teachers
      : teachers.filter((t) => staffRoleName(t.role) === roleFilter);
    return sortStaffByName(base);
  }, [teachers, roleFilter]);

  const dailyRows: StaffTeacherOption[] = useMemo(() => {
    if (!roleFilter) return allDailyStaff;
    return allDailyStaff.filter((t) => staffRoleName(t.role) === roleFilter);
  }, [allDailyStaff, roleFilter]);

  const dailyRowsFiltered = useMemo(() => {
    const q = teacherSearch.trim().toLowerCase();
    if (!q) return dailyRows;
    return dailyRows.filter(
      (t) => t.name?.toLowerCase().includes(q) || t.email?.toLowerCase().includes(q)
    );
  }, [dailyRows, teacherSearch]);

  const monthStaffOptions = useMemo(() => staffByRole, [staffByRole]);

  const monthRecords = useMemo(() => {
    let rows = isAdmin ? monthData?.records || [] : monthRows;
    if (isAdmin && roleFilter) {
      const allowed = new Set(staffByRole.map((t) => t._id));
      rows = rows.filter((r) => {
        const id = recordUserId(r);
        if (allowed.has(id)) return true;
        const populated = typeof r.userId === "object" && r.userId ? r.userId : null;
        return staffRoleName(populated?.role) === roleFilter;
      });
    }
    return [...rows].sort((a, b) => {
      const da = new Date(a.date).getTime() || 0;
      const db = new Date(b.date).getTime() || 0;
      if (da !== db) return da - db;
      return recordUserName(a).localeCompare(recordUserName(b), undefined, { sensitivity: "base" });
    });
  }, [isAdmin, monthData, monthRows, roleFilter, staffByRole]);

  const monthSummary = monthData?.summary;

  useEffect(() => {
    setDrafts((prev) => {
      const next: Record<string, RowDraft> = {};
      allDailyStaff.forEach((t) => {
        const existing = prev[t._id];
        if (existing?.dirty) {
          next[t._id] = existing;
          return;
        }
        next[t._id] = draftFromRecord(recordsByUser.get(t._id), academyHours);
      });
      return next;
    });
  }, [allDailyStaff, recordsByUser, date, academyHours]);

  const updateDraft = (id: string, patch: Partial<RowDraft>) => {
    setDrafts((prev) => {
      const current = prev[id] || emptyDraft(academyHours);
      const next = { ...current, ...patch, dirty: true };
      if (patch.status) {
        const needsTimes =
          patch.status === "present" || patch.status === "late" || patch.status === "half_day";
        if (needsTimes) {
          if (!next.timeIn) next.timeIn = academyHours.timeIn;
          if (!next.timeOut) next.timeOut = academyHours.timeOut;
        } else {
          next.timeIn = "";
          next.timeOut = "";
        }
      }
      return { ...prev, [id]: next };
    });
  };

  const dirtyCount = useMemo(
    () => allDailyStaff.filter((t) => drafts[t._id]?.dirty).length,
    [allDailyStaff, drafts]
  );

  const selectedStaffId = isAdmin
    ? view === "monthly"
      ? monthTeacherFilter || reportStaffId
      : reportStaffId
    : user?.id || "";

  const selectedStaffName = useMemo(() => {
    if (!selectedStaffId) return "All-Staff";
    const fromList = teachers.find((t) => t._id === selectedStaffId)?.name;
    if (fromList) return fromList;
    if (!isAdmin && user?.id === selectedStaffId) return user.name || "Staff";
    return "Staff";
  }, [selectedStaffId, teachers, isAdmin, user]);

  const reportFileBase = useMemo(() => {
    const safe = (value: string) =>
      String(value || "staff")
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-|-$/g, "") || "staff";
    if (view === "daily") {
      return `${safe(selectedStaffName)}_${date}`;
    }
    return `${safe(selectedStaffName)}_${safe(MONTH_NAMES[month - 1])}-${year}`;
  }, [view, selectedStaffName, date, month, year]);

  const handleExport = async (format: StaffAttendanceExportFormat) => {
    setExporting(format);
    const fileName = `${reportFileBase}.${format}`;
    const preview = openReportPreviewTab(format);
    try {
      const blob = await exportStaffAttendanceReport(
        view === "daily"
          ? {
              scope: "daily",
              format,
              date,
              userId: selectedStaffId || undefined,
              role: roleFilter || undefined,
            }
          : {
              scope: "monthly",
              format,
              month,
              year,
              userId: selectedStaffId || undefined,
              role: !selectedStaffId ? roleFilter || undefined : undefined,
            }
      );
      const mode = deliverReportBlob(blob, fileName, format, preview);
      toast({
        title: mode === "preview" ? "Report preview opened" : "Excel downloaded",
        description:
          mode === "preview"
            ? "Use Print or Download from the preview window."
            : fileName,
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

  const saveAll = async () => {
    const toSave = allDailyStaff.filter((t) => drafts[t._id]?.dirty);
    if (!toSave.length) {
      toast({ title: "Nothing to save", description: "Change status or times first." });
      return;
    }

    const payloads: Parameters<typeof markStaffAttendanceManual>[0][] = [];
    for (const teacher of toSave) {
      const draft = drafts[teacher._id] || emptyDraft(academyHours);
      const needsTimes =
        draft.status === "present" || draft.status === "late" || draft.status === "half_day";
      const timeIn = normalizeTimeHm(draft.timeIn || (needsTimes ? academyHours.timeIn : ""));
      const timeOut = normalizeTimeHm(draft.timeOut || (needsTimes ? academyHours.timeOut : ""));

      if (needsTimes && timeIn && !/^\d{2}:\d{2}$/.test(timeIn)) {
        toast({
          title: `Invalid time in — ${teacher.name}`,
          description: "Use HH:MM (e.g. 08:30)",
          variant: "destructive",
        });
        return;
      }
      if (needsTimes && timeOut && !/^\d{2}:\d{2}$/.test(timeOut)) {
        toast({
          title: `Invalid time out — ${teacher.name}`,
          description: "Use HH:MM (e.g. 14:00)",
          variant: "destructive",
        });
        return;
      }
      if (needsTimes && !timeIn) {
        toast({
          title: `Time in required — ${teacher.name}`,
          variant: "destructive",
        });
        return;
      }

      payloads.push({
        date,
        userId: teacher._id,
        status: draft.status,
        checkIn: needsTimes ? combineLocalDateTime(date, timeIn) : undefined,
        checkOut: needsTimes && timeOut ? combineLocalDateTime(date, timeOut) : undefined,
        notes: draft.notes.trim() || undefined,
      });
    }

    setSavingAll(true);
    try {
      await Promise.all(payloads.map((p) => markStaffAttendanceManual(p)));
      setDrafts((prev) => {
        const next = { ...prev };
        toSave.forEach((t) => {
          next[t._id] = { ...(next[t._id] || emptyDraft(academyHours)), dirty: false };
        });
        return next;
      });
      qc.invalidateQueries({ queryKey: ["staff-attendance-day"] });
      qc.invalidateQueries({ queryKey: ["staff-attendance-month"] });
      qc.invalidateQueries({ queryKey: ["staff-attendance-mine"] });
      toast({
        title: "Attendance saved",
        description: `${payloads.length} staff member${payloads.length === 1 ? "" : "s"} updated.`,
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
              <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500 max-w-md">
                {isAdmin
                  ? "Record daily attendance for teaching staff. Set status and times, then save all changes at once."
                  : "View and update your own check-in / check-out for the selected date."}
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
        <div className="flex flex-wrap items-center gap-2">
          {(isAdmin || canMark) && (
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm w-[10rem] shrink-0"
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setMonthTeacherFilter("");
              }}
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
            <>
              <input
                type="date"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm shrink-0"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Date"
              />
              {(isAdmin || canMark) && (
                <>
                  <select
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm min-w-[12rem] shrink-0"
                    value={reportStaffId}
                    onChange={(e) => setReportStaffId(e.target.value)}
                    aria-label="Staff for report"
                  >
                    <option value="">All staff (report)</option>
                    {monthStaffOptions.map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.name}
                        {t.isActive === false ? " (inactive)" : ""}
                      </option>
                    ))}
                  </select>
                  <PanelSearchBar
                    value={teacherSearch}
                    onChange={setTeacherSearch}
                    placeholder="Search by name or email…"
                    className="min-w-[12rem] flex-1 max-w-md"
                  />
                </>
              )}
            </>
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
              {isAdmin && (
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm min-w-[12rem] shrink-0"
                  value={monthTeacherFilter}
                  onChange={(e) => {
                    setMonthTeacherFilter(e.target.value);
                    setReportStaffId(e.target.value);
                  }}
                  aria-label="Staff filter"
                >
                  <option value="">All staff</option>
                  {monthStaffOptions.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.name}
                      {t.isActive === false ? " (inactive)" : ""}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}

          <div className="flex flex-wrap items-center gap-2 shrink-0 ml-auto">
            <div className="flex items-center gap-2">
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
                disabled={savingAll || allDailyStaff.length === 0 || dirtyCount === 0}
                onClick={() => void saveAll()}
              >
                <Save className="h-4 w-4" />
                {savingAll ? "Saving…" : dirtyCount > 0 ? `Save all (${dirtyCount})` : "Save all"}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {view === "daily" && (
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-border font-semibold text-primary flex flex-wrap items-center justify-between gap-2">
            <span>Daily attendance — {date}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {teachersLoading
                ? "Loading staff…"
                : `${dailyRowsFiltered.length} of ${dailyRows.length} staff`}
              {canMark && dirtyCount > 0 ? ` · ${dirtyCount} unsaved` : ""}
            </span>
          </div>
          <div className="p-4 space-y-3">
          {teachersError && (
            <p className="text-sm text-destructive">
              Could not load staff:{" "}
              {teachersErr instanceof Error ? teachersErr.message : "Unknown error"}
            </p>
          )}

          {(dayLoading || teachersLoading) && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}

          {!dayLoading && !teachersLoading && (
            <>
              <div className="flex flex-wrap gap-2 text-xs">
                {Object.entries(dayData?.summary || {}).map(([k, v]) => (
                  <span
                    key={k}
                    className={cn(
                      "rounded-full px-2.5 py-1 font-medium capitalize",
                      STATUS_PILL_CLASS[k] || "bg-muted text-muted-foreground"
                    )}
                  >
                    {k.replace("_", " ")}: {v}
                  </span>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left p-2.5 font-medium">Staff</th>
                      <th className="text-left p-2.5 font-medium">Role</th>
                      <th className="text-left p-2.5 font-medium">Status</th>
                      <th className="text-left p-2.5 font-medium whitespace-nowrap">Time in</th>
                      <th className="text-left p-2.5 font-medium whitespace-nowrap">Time out</th>
                      <th className="text-left p-2.5 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyRows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-muted-foreground">
                          No staff found
                          {roleFilter ? ` for role “${roleFilter}”` : ""}. Add admin, teacher, or
                          accountant users in Staff Management.
                        </td>
                      </tr>
                    )}
                    {dailyRows.length > 0 && dailyRowsFiltered.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-muted-foreground">
                          No staff match your search.
                        </td>
                      </tr>
                    )}
                    {dailyRowsFiltered.map((t) => {
                      const draft = drafts[t._id] || emptyDraft(academyHours);
                      const existing = recordsByUser.get(t._id);
                      const needsTimes =
                        draft.status === "present" ||
                        draft.status === "late" ||
                        draft.status === "half_day";
                      return (
                        <tr key={t._id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="p-2.5">
                            <div className="font-medium flex items-center gap-2">
                              {t.name}
                              {draft.dirty ? (
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" title="Unsaved" />
                              ) : null}
                            </div>
                            {t.email ? (
                              <p className="text-xs text-muted-foreground">{t.email}</p>
                            ) : null}
                            {existing?.source ? (
                              <p className="text-[10px] uppercase text-muted-foreground mt-0.5">
                                {existing.source}
                              </p>
                            ) : (
                              <p className="text-[10px] text-muted-foreground mt-0.5">Not marked</p>
                            )}
                          </td>
                          <td className="p-2.5 capitalize text-muted-foreground">
                            {staffRoleName(t.role) || "—"}
                          </td>
                          <td className="p-2.5">
                            {canMark ? (
                              <select
                                className={cn(
                                  "h-9 w-full min-w-[7.5rem] rounded-md border px-2 text-sm font-semibold",
                                  STATUS_SELECT_CLASS[draft.status]
                                )}
                                value={draft.status}
                                onChange={(e) =>
                                  updateDraft(t._id, {
                                    status: e.target.value as StaffAttendanceStatus,
                                  })
                                }
                              >
                                {STATUSES.map((s) => (
                                  <option key={s.value} value={s.value}>
                                    {s.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <StatusPill status={existing?.status} />
                            )}
                          </td>
                          <td className="p-2.5">
                            {canMark && needsTimes ? (
                              <Input
                                className="h-9 w-[6.5rem] font-mono"
                                inputMode="numeric"
                                placeholder={academyHours.timeIn}
                                value={draft.timeIn}
                                onChange={(e) => updateDraft(t._id, { timeIn: e.target.value })}
                                onBlur={(e) =>
                                  updateDraft(t._id, {
                                    timeIn: normalizeTimeHm(e.target.value),
                                  })
                                }
                              />
                            ) : (
                              <span>{fmtTime(existing?.checkIn)}</span>
                            )}
                          </td>
                          <td className="p-2.5">
                            {canMark && needsTimes ? (
                              <Input
                                className="h-9 w-[6.5rem] font-mono"
                                inputMode="numeric"
                                placeholder={academyHours.timeOut}
                                value={draft.timeOut}
                                onChange={(e) => updateDraft(t._id, { timeOut: e.target.value })}
                                onBlur={(e) =>
                                  updateDraft(t._id, {
                                    timeOut: normalizeTimeHm(e.target.value),
                                  })
                                }
                              />
                            ) : (
                              <span>{fmtTime(existing?.checkOut)}</span>
                            )}
                          </td>
                          <td className="p-2.5">
                            {canMark ? (
                              <Input
                                className="h-9 min-w-[8rem]"
                                placeholder="Optional"
                                value={draft.notes}
                                onChange={(e) => updateDraft(t._id, { notes: e.target.value })}
                              />
                            ) : (
                              <span className="text-muted-foreground">{existing?.notes || "—"}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
          </div>
        </Card>
      )}

      {view === "monthly" && (
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-border font-semibold text-primary">
            Monthly report — {MONTH_NAMES[month - 1]} {year}
          </div>
          <div className="p-4 space-y-3">
          {monthLoading || mineLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              {monthSummary && (
                <div className="flex flex-wrap gap-2 text-xs">
                  {Object.entries(monthSummary).map(([k, v]) => (
                    <span
                      key={k}
                      className={cn(
                        "rounded-full px-2.5 py-1 font-medium capitalize",
                        STATUS_PILL_CLASS[k] || "bg-muted text-muted-foreground"
                      )}
                    >
                      {k.replace("_", " ")}: {v}
                    </span>
                  ))}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left p-2.5 font-medium">Date</th>
                      {isAdmin && <th className="text-left p-2.5 font-medium">Staff</th>}
                      <th className="text-left p-2.5 font-medium">Status</th>
                      <th className="text-left p-2.5 font-medium">Time in</th>
                      <th className="text-left p-2.5 font-medium">Time out</th>
                      <th className="text-left p-2.5 font-medium">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthRecords.length === 0 && (
                      <tr>
                        <td
                          colSpan={isAdmin ? 6 : 5}
                          className="p-8 text-center text-muted-foreground"
                        >
                          No records this month.
                        </td>
                      </tr>
                    )}
                    {monthRecords.map((r) => (
                      <tr key={r._id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="p-2.5 whitespace-nowrap">{fmtDate(r.date)}</td>
                        {isAdmin && (
                          <td className="p-2.5 font-medium">{recordUserName(r)}</td>
                        )}
                        <td className="p-2.5">
                          <StatusPill status={r.status} />
                        </td>
                        <td className="p-2.5">{fmtTime(r.checkIn)}</td>
                        <td className="p-2.5">{fmtTime(r.checkOut)}</td>
                        <td className="p-2.5 uppercase text-xs">{r.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          </div>
        </Card>
      )}
    </div>
  );
}
