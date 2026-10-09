import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ModuleActionCaps } from "@/lib/permissions";
import {
  fetchMyStaffAttendance,
  fetchStaffAttendanceDay,
  fetchStaffAttendanceMonth,
  fetchStaffTeachers,
  markStaffAttendanceManual,
  type StaffAttendanceRecord,
  type StaffAttendanceStatus,
  type StaffTeacherOption,
} from "@/lib/aiAttendanceApi";
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

function emptyDraft(): RowDraft {
  return { status: "present", timeIn: "", timeOut: "", notes: "", dirty: false };
}

function draftFromRecord(r?: StaffAttendanceRecord): RowDraft {
  if (!r) return emptyDraft();
  return {
    status: (r.status as StaffAttendanceStatus) || "present",
    timeIn: toTimeInput(r.checkIn),
    timeOut: toTimeInput(r.checkOut),
    notes: r.notes || "",
    dirty: false,
  };
}

export default function StaffAttendanceModule({ caps }: { caps: ModuleActionCaps; perm?: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const canMark = caps.canCreate || caps.canEdit;
  const now = new Date();

  const [view, setView] = useState<"daily" | "monthly">("daily");
  const [date, setDate] = useState(() => localTodayYmd());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [monthTeacherFilter, setMonthTeacherFilter] = useState("");
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

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

  const dailyRows: StaffTeacherOption[] = useMemo(() => {
    if (isAdmin || canMark) {
      return teachers.filter((t) => t.isActive !== false);
    }
    if (user?.id) {
      return [{ _id: user.id, name: user.name || "You", email: user.email, isActive: true }];
    }
    return [];
  }, [isAdmin, canMark, teachers, user]);

  const monthRecords = useMemo(() => {
    if (isAdmin) return monthData?.records || [];
    return monthRows;
  }, [isAdmin, monthData, monthRows]);

  const monthSummary = monthData?.summary;

  useEffect(() => {
    setDrafts((prev) => {
      const next: Record<string, RowDraft> = {};
      dailyRows.forEach((t) => {
        const existing = prev[t._id];
        if (existing?.dirty) {
          next[t._id] = existing;
          return;
        }
        next[t._id] = draftFromRecord(recordsByUser.get(t._id));
      });
      return next;
    });
  }, [dailyRows, recordsByUser, date]);

  const updateDraft = (id: string, patch: Partial<RowDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || emptyDraft()), ...patch, dirty: true },
    }));
  };

  const markMut = useMutation({
    mutationFn: markStaffAttendanceManual,
    onSuccess: (_data, vars) => {
      setDrafts((prev) => ({
        ...prev,
        [vars.userId]: { ...(prev[vars.userId] || emptyDraft()), dirty: false },
      }));
      qc.invalidateQueries({ queryKey: ["staff-attendance-day"] });
      qc.invalidateQueries({ queryKey: ["staff-attendance-month"] });
      qc.invalidateQueries({ queryKey: ["staff-attendance-mine"] });
      toast({ title: "Attendance saved" });
    },
    onError: (e: Error) =>
      toast({ title: "Could not save", description: e.message, variant: "destructive" }),
    onSettled: () => setSavingId(null),
  });

  const saveRow = (teacher: StaffTeacherOption) => {
    const draft = drafts[teacher._id] || emptyDraft();
    const needsTimes =
      draft.status === "present" || draft.status === "late" || draft.status === "half_day";
    const timeIn = normalizeTimeHm(draft.timeIn);
    const timeOut = normalizeTimeHm(draft.timeOut);

    if (needsTimes && timeIn && !/^\d{2}:\d{2}$/.test(timeIn)) {
      toast({
        title: "Invalid time in",
        description: "Use HH:MM (e.g. 08:30)",
        variant: "destructive",
      });
      return;
    }
    if (needsTimes && timeOut && !/^\d{2}:\d{2}$/.test(timeOut)) {
      toast({
        title: "Invalid time out",
        description: "Use HH:MM (e.g. 14:00)",
        variant: "destructive",
      });
      return;
    }
    if (needsTimes && !timeIn) {
      toast({ title: "Time in is required", variant: "destructive" });
      return;
    }

    setSavingId(teacher._id);
    markMut.mutate({
      date,
      userId: teacher._id,
      status: draft.status,
      checkIn: needsTimes ? combineLocalDateTime(date, timeIn) : undefined,
      checkOut: needsTimes && timeOut ? combineLocalDateTime(date, timeOut) : undefined,
      notes: draft.notes.trim() || undefined,
    });
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-primary flex items-center gap-2">
            <Clock className="h-6 w-6" />
            Teacher Attendance
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Staff / teachers only — not student attendance.{" "}
            {isAdmin
              ? "All teachers load for the selected date. Type time in / out (HH:MM) and save each row."
              : "View and update your own check-in / check-out for the selected date."}
          </p>
        </div>
        <div className="flex w-full sm:w-fit gap-1 p-1 rounded-lg bg-muted/50">
          <button
            type="button"
            onClick={() => setView("daily")}
            className={cn(
              "flex-1 sm:flex-none px-3 py-2 sm:py-1.5 text-sm font-medium rounded-md transition-colors",
              view === "daily"
                ? "bg-background text-primary shadow-sm"
                : "text-muted-foreground hover:text-primary"
            )}
          >
            Daily report
          </button>
          <button
            type="button"
            onClick={() => setView("monthly")}
            className={cn(
              "flex-1 sm:flex-none px-3 py-2 sm:py-1.5 text-sm font-medium rounded-md transition-colors",
              view === "monthly"
                ? "bg-background text-primary shadow-sm"
                : "text-muted-foreground hover:text-primary"
            )}
          >
            Monthly report
          </button>
        </div>
      </div>

      {view === "daily" && (
        <Card className="p-4 space-y-3 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between">
            <div>
              <h2 className="font-semibold">Daily attendance</h2>
              <p className="text-xs text-muted-foreground">
                {teachersLoading
                  ? "Loading teachers…"
                  : `${dailyRows.length} teacher${dailyRows.length === 1 ? "" : "s"}`}
              </p>
            </div>
            <div className="max-w-xs w-full">
              <Label htmlFor="daily-date">Date</Label>
              <Input
                id="daily-date"
                type="date"
                className="mt-1"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          {teachersError && (
            <p className="text-sm text-destructive">
              Could not load teachers:{" "}
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
                      <th className="text-left p-2.5 font-medium">Teacher</th>
                      <th className="text-left p-2.5 font-medium">Status</th>
                      <th className="text-left p-2.5 font-medium whitespace-nowrap">Time in</th>
                      <th className="text-left p-2.5 font-medium whitespace-nowrap">Time out</th>
                      <th className="text-left p-2.5 font-medium">Notes</th>
                      {canMark && <th className="text-right p-2.5 font-medium">Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {dailyRows.length === 0 && (
                      <tr>
                        <td
                          colSpan={canMark ? 6 : 5}
                          className="p-8 text-center text-muted-foreground"
                        >
                          No teachers found. Create staff users with the Teacher role in Staff
                          Management.
                        </td>
                      </tr>
                    )}
                    {dailyRows.map((t) => {
                      const draft = drafts[t._id] || emptyDraft();
                      const existing = recordsByUser.get(t._id);
                      const needsTimes =
                        draft.status === "present" ||
                        draft.status === "late" ||
                        draft.status === "half_day";
                      return (
                        <tr key={t._id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="p-2.5">
                            <div className="font-medium">{t.name}</div>
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
                                placeholder="08:00"
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
                                placeholder="14:00"
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
                          {canMark && (
                            <td className="p-2.5 text-right">
                              <Button
                                size="sm"
                                className="gap-1.5"
                                disabled={savingId === t._id && markMut.isPending}
                                onClick={() => saveRow(t)}
                              >
                                <Save className="h-3.5 w-3.5" />
                                {savingId === t._id && markMut.isPending ? "Saving…" : "Save"}
                              </Button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      )}

      {view === "monthly" && (
        <Card className="p-4 space-y-3 max-w-5xl">
          <div className="flex flex-col gap-3">
            <div>
              <h2 className="font-semibold">Monthly report</h2>
              <p className="text-xs text-muted-foreground">Attendance for the selected month.</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-2xl">
              <div className="space-y-1.5">
                <Label>Month</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                >
                  {MONTH_NAMES.map((name, idx) => (
                    <option key={name} value={idx + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Year</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                >
                  {Array.from({ length: 6 }, (_, i) => now.getFullYear() - 2 + i).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              {isAdmin && (
                <div className="space-y-1.5 col-span-2 sm:col-span-1">
                  <Label>Teacher</Label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={monthTeacherFilter}
                    onChange={(e) => setMonthTeacherFilter(e.target.value)}
                  >
                    <option value="">All teachers</option>
                    {teachers.map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.name}
                        {t.isActive === false ? " (inactive)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

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
                      {isAdmin && <th className="text-left p-2.5 font-medium">Teacher</th>}
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
        </Card>
      )}
    </div>
  );
}
