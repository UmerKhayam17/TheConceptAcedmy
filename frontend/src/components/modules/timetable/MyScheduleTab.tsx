import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Weekday } from "@/lib/configApi";
import { fetchMyTeacherSchedule, type ScheduleSlot } from "@/lib/timetableApi";
import { moduleHref } from "@/lib/panelMenus";
import { useAuth } from "@/hooks/useAuth";
import { DEFAULT_WORKING_DAYS } from "./constants";
import {
  addDays,
  buildGridRows,
  classKey,
  classLabel,
  formatWeekRange,
  monthOptions,
  periodKey,
  sortSlots,
  startOfWeekMonday,
  weekDates,
  weekStartForMonth,
} from "./my-schedule/dateUtils";
import { TimetablePageHeader } from "./my-schedule/TimetablePageHeader";
import { TimetableFilters, type ViewMode } from "./my-schedule/TimetableFilters";
import { TimetableGrid } from "./my-schedule/TimetableGrid";
import { ClassDetailsDialog } from "./my-schedule/ClassDetailsDialog";

export default function MyScheduleTab({ sessionId }: { sessionId: string }) {
  const { user } = useAuth();
  const role = user?.role || "teacher";

  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date()));
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [classFilter, setClassFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [dayFocus, setDayFocus] = useState<Weekday>(() => {
    const d = new Date().getDay();
    const map: Weekday[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const today = map[d];
    return DEFAULT_WORKING_DAYS.includes(today) ? today : "monday";
  });
  const [selected, setSelected] = useState<{ slot: ScheduleSlot; date: Date } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["my-teacher-schedule", sessionId],
    queryFn: () => fetchMyTeacherSchedule(sessionId),
    enabled: !!sessionId,
    staleTime: 60_000,
  });

  const slots = useMemo(() => data?.slots || [], [data?.slots]);

  const classOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of slots) {
      const key = classKey(s);
      if (!key || key === ":") continue;
      map.set(key, classLabel(s));
    }
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [slots]);

  const subjectOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of slots) {
      if (!s.subject?._id) continue;
      map.set(s.subject._id, s.subject.name);
    }
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [slots]);

  const filteredSlots = useMemo(() => {
    return slots.filter((s) => {
      if (classFilter !== "all" && classKey(s) !== classFilter) return false;
      if (subjectFilter !== "all" && s.subject?._id !== subjectFilter) return false;
      return true;
    });
  }, [slots, classFilter, subjectFilter]);

  const days = DEFAULT_WORKING_DAYS;
  const columns = useMemo(() => weekDates(weekStart, days), [weekStart, days]);
  const visibleColumns = useMemo(() => {
    if (viewMode === "day") {
      const hit = columns.find((c) => c.day === dayFocus) || columns[0];
      return hit ? [hit] : [];
    }
    return columns;
  }, [viewMode, columns, dayFocus]);

  const gridRows = useMemo(() => buildGridRows(filteredSlots), [filteredSlots]);
  const periodRows = useMemo(() => gridRows.filter((r) => r.kind === "period"), [gridRows]);

  const months = useMemo(() => monthOptions(new Date(), 10), []);
  const monthValue = `${weekStart.getFullYear()}-${weekStart.getMonth() + 1}`;
  const safeMonthValue = months.some((m) => m.value === monthValue)
    ? monthValue
    : months[0]?.value || monthValue;

  const getSlot = (day: Weekday, pKey: string) =>
    filteredSlots
      .filter((s) => s.day === day && periodKey(s) === pKey)
      .sort(sortSlots)[0];

  const emptyMessage = !isLoading
    ? !slots.length
      ? "No classes scheduled for you in this session."
      : !filteredSlots.length
        ? "No lessons match the selected class or subject filters."
        : !periodRows.length
          ? "No periods to display."
          : undefined
    : undefined;

  if (!sessionId) return null;

  const weekLabel = formatWeekRange(weekStart, days.length);

  return (
    <div className="space-y-5 px-4 py-4 sm:px-5 lg:px-[18px] lg:py-4 text-slate-800">
      <TimetablePageHeader />

      <TimetableFilters
        monthValue={safeMonthValue}
        months={months}
        onMonthChange={(v) => {
          const opt = months.find((m) => m.value === v);
          if (opt) setWeekStart(weekStartForMonth(opt.date, weekStart));
        }}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        dayFocus={dayFocus}
        onDayFocusChange={setDayFocus}
        days={days}
        classFilter={classFilter}
        onClassFilterChange={setClassFilter}
        classOptions={classOptions}
        subjectFilter={subjectFilter}
        onSubjectFilterChange={setSubjectFilter}
        subjectOptions={subjectOptions}
        weekLabel={weekLabel}
        onPrevWeek={() => setWeekStart((d) => addDays(d, -7))}
        onNextWeek={() => setWeekStart((d) => addDays(d, 7))}
      />

      <TimetableGrid
        rows={gridRows}
        columns={visibleColumns}
        getSlot={getSlot}
        loading={isLoading}
        emptyMessage={emptyMessage}
        weekLabel={weekLabel}
        scheduledCount={filteredSlots.length}
        onSelectSlot={(slot, date) => setSelected({ slot, date })}
      />

      <ClassDetailsDialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        slot={selected?.slot || null}
        columnDate={selected?.date || null}
        classHref={moduleHref(role, "my-classes")}
        attendanceHref={moduleHref(role, "attendance")}
      />
    </div>
  );
}
