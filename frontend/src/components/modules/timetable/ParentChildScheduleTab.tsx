import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  FileDown,
  FileSpreadsheet,
  Printer,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { classSectionBoardLabel } from "@/lib/configApi";
import { moduleHref } from "@/lib/panelMenus";
import { subjectIcon } from "@/lib/subjectTheme";
import {
  fetchAcademyStudents,
  type AcademyStudent,
} from "@/lib/studentManagementApi";
import { classLabel } from "@/components/modules/student-management/studentDisplayUtils";
import {
  isDeletedSubject,
  scheduleSlotEntries,
  scheduleSlotTitle,
  fetchSectionSchedule,
  type PeriodSlot,
  type ScheduleSlot,
} from "@/lib/timetableApi";
import type { Weekday } from "@/lib/configApi";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  DAY_FULL_LABELS,
  DAY_ORDER,
  normalizeWorkingDays,
  slotMatchesPeriod,
  subjectColor,
  subjectColorDot,
} from "./constants";
import {
  downloadBuilderGridPdf,
  exportBuilderGridExcel,
  printBuilderGrid,
} from "./builderExport";
import {
  addDays,
  formatWeekRange,
  startOfWeekMonday,
  weekDates,
} from "./my-schedule/dateUtils";
import AcademyPeriodSheet, { weekRowsFromSlots } from "./AcademyPeriodSheet";
import { ParentStudentBanner } from "./parent-schedule/ParentStudentBanner";

type SheetViewMode = "week" | "day";

function refId(ref: unknown): string {
  if (!ref) return "";
  if (typeof ref === "string") return ref;
  if (typeof ref === "object" && ref !== null && "_id" in ref) {
    return String((ref as { _id: string })._id || "");
  }
  return "";
}

function sectionNameOf(student: AcademyStudent): string {
  const s = student.sectionId;
  if (s && typeof s === "object" && "sectionName" in s) {
    return String((s as { sectionName?: string }).sectionName || "");
  }
  return "";
}

function todayWeekday(): Weekday {
  const map: Weekday[] = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  return map[new Date().getDay()] || "monday";
}

/**
 * Parent/student portal timetable — same page layout as Timetable Builder,
 * with parent-safe actions (no edit / validate / clear).
 */
export default function ParentChildScheduleTab({ sessionId }: { sessionId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const isParent = user?.role === "parent";
  const role = (user?.role || "parent") as "parent" | "student";

  const [childId, setChildId] = useState("");
  const [viewMode, setViewMode] = useState<SheetViewMode>("week");
  const [dayFocus, setDayFocus] = useState<Weekday>(() => todayWeekday());
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date()));
  const [downloading, setDownloading] = useState(false);
  const UPCOMING_LESSONS_LIMIT = 4;

  useEffect(() => {
    setChildId("");
    setViewMode("week");
    setDayFocus(todayWeekday());
    setWeekStart(startOfWeekMonday(new Date()));
  }, [sessionId]);

  const { data: children = [], isLoading: childrenLoading } = useQuery({
    queryKey: ["parent-children-schedule", sessionId, user?.id],
    queryFn: async () => {
      const { students } = await fetchAcademyStudents({ limit: 100 });
      return students;
    },
    enabled: !!sessionId && !!user,
  });

  useEffect(() => {
    if (!children.length) {
      setChildId("");
      return;
    }
    if (!childId || !children.some((c) => c._id === childId)) {
      setChildId(children[0]._id);
    }
  }, [children, childId]);

  const selected = useMemo(
    () => children.find((c) => c._id === childId) || null,
    [children, childId],
  );

  const sectionId = selected ? refId(selected.sectionId) : "";
  const className = selected ? classLabel(selected.classId) : "";
  const sectionName = selected ? sectionNameOf(selected) : "";
  const boardLabel = selected
    ? classSectionBoardLabel(className, sectionName)
    : "Timetable";

  const { data: grid, isLoading: gridLoading } = useQuery({
    queryKey: ["parent-section-schedule", sessionId, sectionId],
    queryFn: () => fetchSectionSchedule(sessionId, sectionId),
    enabled: !!sessionId && !!sectionId,
  });

  const workingDays = normalizeWorkingDays(grid?.workingDays);
  const dayOptions = workingDays.length ? workingDays : DAY_ORDER.slice(0, 6);
  const lecturePeriods: PeriodSlot[] = (grid?.periods || []).filter((p) => p.type === "lecture");
  const slots: ScheduleSlot[] = grid?.slots || [];

  const dateByDay = useMemo(() => {
    const map: Partial<Record<Weekday, Date>> = {};
    for (const col of weekDates(weekStart, dayOptions)) {
      map[col.day] = col.date;
    }
    return map;
  }, [weekStart, dayOptions]);

  useEffect(() => {
    if (!dayOptions.includes(dayFocus)) {
      setDayFocus(dayOptions[0] || "monday");
    }
  }, [dayOptions, dayFocus]);

  const todayDay = todayWeekday();

  const sheetRows = useMemo(() => {
    if (viewMode === "day") {
      const date = dateByDay[dayFocus];
      const sublabel = date
        ? date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : undefined;
      return [
        {
          key: dayFocus,
          label: DAY_FULL_LABELS[dayFocus] || dayFocus,
          sublabel,
          day: dayFocus,
          slots: slots.filter((s) => s.day === dayFocus),
        },
      ];
    }
    return weekRowsFromSlots(slots, dayOptions, dateByDay);
  }, [viewMode, dayFocus, slots, dayOptions, dateByDay]);

  const getSlot = (day: Weekday, periodId: string) =>
    slots.find((s) => s.day === day && slotMatchesPeriod(s, periodId));

  const legendSubjects = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const slot of slots) {
      for (const e of scheduleSlotEntries(slot)) {
        if (isDeletedSubject(e.subject)) continue;
        const id = e.subject?._id || "";
        const name = e.subject?.name?.trim();
        if (!name) continue;
        const key = id || name;
        if (!map.has(key)) map.set(key, { id: key, name });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [slots]);

  /** Today's upcoming lessons only — next periods that have not ended yet (max 4). */
  const upcomingLessons = useMemo(() => {
    type Item = {
      id: string;
      title: string;
      subjectName: string;
      /** Same color key as AcademyLessonCell (subject id). */
      colorId: string;
      teachers: string;
      periodLabel: string;
      periodOrder: number;
      endMinutes: number;
    };

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const parseClockMinutes = (raw?: string) => {
      if (!raw) return null;
      const m = String(raw).trim().match(/^(\d{1,2}):(\d{2})/);
      if (!m) return null;
      return Number(m[1]) * 60 + Number(m[2]);
    };

    const map = new Map<string, Item>();
    for (const slot of slots) {
      if (slot.day !== todayDay) continue;
      const entries = scheduleSlotEntries(slot);
      if (!entries.length) continue;
      const period = lecturePeriods.find((p) => slotMatchesPeriod(slot, p._id));
      const endMinutes = parseClockMinutes(period?.endTime) ?? 24 * 60;
      // Skip lessons that have already finished today
      if (endMinutes <= nowMinutes) continue;

      const key = slot.combinedGroupId ? `shared:${slot.combinedGroupId}` : `slot:${slot._id}`;
      if (map.has(key)) continue;
      const subjectId = entries[0]?.subject?._id || slot.subject?._id || "";
      map.set(key, {
        id: key,
        title: scheduleSlotTitle(slot),
        subjectName: entries[0]?.subject?.name || "",
        colorId: subjectId,
        teachers: entries.map((e) => e.teacher?.name || "—").join(" / ") || "—",
        periodLabel: period?.label || `Period ${period?.order || ""}`,
        periodOrder: period?.order ?? 999,
        endMinutes,
      });
    }
    return [...map.values()]
      .sort((a, b) => a.periodOrder - b.periodOrder)
      .slice(0, UPCOMING_LESSONS_LIMIT);
  }, [slots, todayDay, lecturePeriods]);

  const exportOpts = () => ({
    title: selected ? `${selected.studentName} — Timetable` : "Timetable",
    subtitle: `${boardLabel} · Week of ${formatWeekRange(weekStart, dayOptions.length)}${
      grid?.version?.version != null ? ` · Published v${grid.version.version}` : ""
    }`,
    days: dayOptions,
    periods: lecturePeriods,
    slots,
    getSlot,
  });

  const canExport = Boolean(grid && lecturePeriods.length);

  const handlePrint = () => {
    if (!canExport) return;
    try {
      printBuilderGrid(exportOpts());
    } catch (err) {
      toast({
        title: "Print failed",
        description: err instanceof Error ? err.message : "Could not print",
        variant: "destructive",
      });
    }
  };

  const handleDownloadPdf = async () => {
    if (!canExport) return;
    setDownloading(true);
    try {
      await downloadBuilderGridPdf(exportOpts());
    } catch (err) {
      toast({
        title: "Download failed",
        description: err instanceof Error ? err.message : "Could not create PDF",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleExportExcel = () => {
    if (!canExport) return;
    try {
      exportBuilderGridExcel(exportOpts());
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Could not export",
        variant: "destructive",
      });
    }
  };

  if (!sessionId) return null;

  const formatDayDate = (d: Weekday) => {
    const date = dateByDay[d];
    if (!date) return "";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      <ParentStudentBanner
        title={isParent ? "Time Table" : "My Timetable"}
        subtitle={
          isParent
            ? "Published class schedule for your linked children."
            : "Your published class schedule."
        }
        childPicker={
          isParent && children.length > 1 ? (
            <select
              className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs min-w-[9rem] shadow-sm"
              value={childId}
              onChange={(e) => setChildId(e.target.value)}
              aria-label="Select child"
            >
              {children.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.studentName}
                </option>
              ))}
            </select>
          ) : undefined
        }
      />

      {childrenLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!childrenLoading && children.length === 0 && (
        <Card className="rounded-2xl border p-8 text-sm text-muted-foreground shadow-sm">
          {isParent
            ? "No linked children found for this session. Ask the office to link your account to a student."
            : "No student profile is linked to this account."}
        </Card>
      )}

      {selected && !sectionId && !childrenLoading && (
        <Card className="rounded-2xl border p-8 text-sm text-muted-foreground shadow-sm">
          This student has no section yet, so a timetable cannot be shown.
        </Card>
      )}

      {sectionId && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px] xl:items-start">
          <div className="space-y-4 min-w-0">
            {/* Filter bar — same structure as Timetable Builder */}
            <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3 shadow-sm">
              {isParent && children.length > 1 && (
                <div className="min-w-[160px]">
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Child
                  </Label>
                  <select
                    className="mt-1 w-full h-10 rounded-lg border bg-background px-3 text-sm"
                    value={childId}
                    onChange={(e) => setChildId(e.target.value)}
                  >
                    {children.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.studentName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="min-w-[140px]">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Class
                </Label>
                <select
                  className="mt-1 w-full h-10 rounded-lg border bg-background px-3 text-sm"
                  value={className}
                  disabled
                  aria-label="Class"
                >
                  <option value={className}>{className || "—"}</option>
                </select>
              </div>
              <div className="min-w-[120px]">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Section
                </Label>
                <select
                  className="mt-1 w-full h-10 rounded-lg border bg-background px-3 text-sm"
                  value={sectionName}
                  disabled
                  aria-label="Section"
                >
                  <option value={sectionName}>{sectionName || "—"}</option>
                </select>
              </div>

              {grid && (
                <Badge variant="default">
                  {boardLabel} · Published
                  {grid.version?.version != null ? ` · v${grid.version.version}` : ""}
                </Badge>
              )}

              <div className="ml-auto flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 rounded-full border bg-background px-1 py-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => setWeekStart((w) => addDays(w, -7))}
                    aria-label="Previous week"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="min-w-[9.5rem] text-center text-xs font-medium tabular-nums">
                    {formatWeekRange(weekStart, dayOptions.length || 6)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => setWeekStart((w) => addDays(w, 7))}
                    aria-label="Next week"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex rounded-full border bg-muted/40 p-1">
                  <button
                    type="button"
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                      viewMode === "week"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setViewMode("week")}
                  >
                    Week View
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                      viewMode === "day"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setViewMode("day")}
                  >
                    Day View
                  </button>
                </div>
              </div>
            </div>

            {viewMode === "day" && (
              <div className="flex flex-wrap gap-1.5">
                {dayOptions.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDayFocus(d)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      dayFocus === d
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {DAY_FULL_LABELS[d].slice(0, 3)}
                    {formatDayDate(d) ? ` · ${formatDayDate(d)}` : ""}
                  </button>
                ))}
              </div>
            )}

            {grid && (
              <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
                <p className="text-sm text-sky-950">
                  This timetable is published. It shows the official class schedule for{" "}
                  <span className="font-semibold">{selected?.studentName || "your child"}</span>.
                </p>
              </div>
            )}

            {gridLoading && (
              <p className="text-sm text-muted-foreground">Loading timetable…</p>
            )}

            {grid === null && !gridLoading && (
              <Card className="rounded-2xl border p-8 text-sm text-muted-foreground shadow-sm">
                No published timetable for this section yet.
              </Card>
            )}

            {grid && (
              <>
                <Card className="overflow-hidden rounded-2xl border shadow-sm">
                  <AcademyPeriodSheet
                    periods={lecturePeriods}
                    rows={sheetRows}
                    firstColumnHeader="DAY"
                    emptyMessage="No lessons in the published timetable."
                  />
                </Card>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground px-1">
                  {legendSubjects.length > 0 ? (
                    legendSubjects.map((s) => {
                      const Icon = subjectIcon(s.name);
                      return (
                        <span key={s.id} className="inline-flex items-center gap-1.5">
                          <span
                            className={cn(
                              "inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10",
                              subjectColorDot(s.id),
                            )}
                            aria-hidden
                          />
                          <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                          {s.name}
                        </span>
                      );
                    })
                  ) : (
                    <span>No subjects placed yet.</span>
                  )}
                </div>
              </>
            )}
          </div>

          <aside className="space-y-4 xl:sticky xl:top-4">
            <Card className="rounded-2xl border p-4 shadow-sm space-y-2">
              <h3 className="text-sm font-semibold mb-2">Quick Actions</h3>
              <button
                type="button"
                disabled={!canExport}
                onClick={handlePrint}
                className="flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left hover:bg-muted/40 transition-colors disabled:pointer-events-none disabled:opacity-50"
              >
                <Printer className="h-4 w-4 mt-0.5 text-slate-600 shrink-0" />
                <span>
                  <span className="block text-sm font-medium">Print Class Sheet</span>
                  <span className="text-xs text-muted-foreground">Section printable sheet</span>
                </span>
              </button>
              <button
                type="button"
                disabled={!canExport || downloading}
                onClick={() => void handleDownloadPdf()}
                className="flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left hover:bg-muted/40 transition-colors disabled:pointer-events-none disabled:opacity-50"
              >
                <FileDown className="h-4 w-4 mt-0.5 text-rose-600 shrink-0" />
                <span>
                  <span className="block text-sm font-medium">
                    {downloading ? "Preparing PDF…" : "Download PDF"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Academy sheet as a .pdf file
                  </span>
                </span>
              </button>
              <button
                type="button"
                disabled={!canExport}
                onClick={handleExportExcel}
                className="flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left hover:bg-muted/40 transition-colors disabled:pointer-events-none disabled:opacity-50"
              >
                <FileSpreadsheet className="h-4 w-4 mt-0.5 text-emerald-700 shrink-0" />
                <span>
                  <span className="block text-sm font-medium">Export to Excel</span>
                  <span className="text-xs text-muted-foreground">Same timetable sheet data</span>
                </span>
              </button>
              <Link
                to={moduleHref(role, "attendance")}
                className="flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
              >
                <CalendarPlus className="h-4 w-4 mt-0.5 text-sky-600 shrink-0" />
                <span>
                  <span className="block text-sm font-medium">Apply for Leave</span>
                  <span className="text-xs text-muted-foreground">
                    Request leave for absence
                  </span>
                </span>
              </Link>
            </Card>

            <Card className="rounded-2xl border p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="text-sm font-semibold">Today&apos;s Lessons</h3>
                <span className="text-[11px] text-muted-foreground">
                  {boardLabel} · {DAY_FULL_LABELS[todayDay]}
                </span>
              </div>
              {upcomingLessons.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">
                  No upcoming lessons left for today.
                </p>
              ) : (
                <ul className="space-y-2">
                  {upcomingLessons.map((item) => {
                    const Icon = subjectIcon(item.subjectName);
                    return (
                      <li
                        key={item.id}
                        className={cn(
                          "rounded-xl border px-3 py-2.5 text-xs space-y-1 shadow-sm",
                          subjectColor(item.colorId),
                        )}
                      >
                        <div className="inline-flex min-w-0 items-center gap-1.5 font-semibold">
                          <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                          <span className="truncate">{item.title}</span>
                        </div>
                        <p className="text-muted-foreground truncate">{boardLabel}</p>
                        <p className="text-muted-foreground">
                          {item.periodLabel} · {item.teachers}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}
