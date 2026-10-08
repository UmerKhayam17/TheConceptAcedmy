import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  classDisplayName,
  classSectionBoardLabel,
  fetchClasses,
  fetchSections,
  groupClassesByProgram,
  sortClassesByLevel,
} from "@/lib/configApi";
import { fetchSectionSchedule } from "@/lib/timetableApi";
import { cn } from "@/lib/utils";
import type { Weekday } from "@/lib/configApi";
import { DAY_FULL_LABELS, DAY_ORDER, normalizeWorkingDays } from "./constants";
import AcademyPeriodSheet, { weekRowsFromSlots } from "./AcademyPeriodSheet";

type SheetViewMode = "week" | "day";

/** Section timetable — same Class Board period-sheet design. */
export default function ViewScheduleTab({ sessionId }: { sessionId: string }) {
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [viewMode, setViewMode] = useState<SheetViewMode>("week");
  const [day, setDay] = useState<Weekday>("monday");

  useEffect(() => {
    setClassId("");
    setSectionId("");
    setViewMode("week");
    setDay("monday");
  }, [sessionId]);

  const { data: classesRaw = [] } = useQuery({
    queryKey: ["config-classes", sessionId],
    queryFn: () => fetchClasses(sessionId),
    enabled: !!sessionId,
  });
  const classes = useMemo(() => sortClassesByLevel(classesRaw), [classesRaw]);
  const classGroups = useMemo(() => groupClassesByProgram(classes), [classes]);

  const { data: sections = [] } = useQuery({
    queryKey: ["config-sections", classId, sessionId],
    queryFn: () => fetchSections({ classId, sessionId }),
    enabled: !!classId,
  });

  const { data: grid, isLoading } = useQuery({
    queryKey: ["section-schedule", sessionId, sectionId],
    queryFn: () => fetchSectionSchedule(sessionId, sectionId),
    enabled: !!sessionId && !!sectionId,
  });

  if (!sessionId) return null;

  const selectedClass = classes.find((c) => c._id === classId);
  const selectedSection = sections.find((s) => s._id === sectionId);
  const sectionLabel = classSectionBoardLabel(
    selectedClass?.name || selectedClass?.className,
    selectedSection?.name || selectedSection?.sectionName,
  );

  const workingDays = normalizeWorkingDays(grid?.workingDays);
  const dayOptions = workingDays.length ? workingDays : DAY_ORDER;
  const lecturePeriods = (grid?.periods || []).filter((p) => p.type === "lecture");
  const slots = grid?.slots || [];

  const sheetRows =
    viewMode === "day"
      ? [
        {
          key: sectionId || "section",
          label: sectionLabel,
          day,
          slots: slots.filter((s) => s.day === day),
        },
      ]
      : weekRowsFromSlots(slots, dayOptions);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      <div className="text-xs text-muted-foreground">
        Timetable <span className="mx-1">›</span>{" "}
        <span className="text-foreground font-medium">Section timetable</span>
      </div>

      <div>
        <h2 className="font-display text-xl font-semibold tracking-tight">Section timetable</h2>
        <p className="text-sm text-muted-foreground max-w-xl">
          Published schedule in the same Class Board layout — periods across the top.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3 shadow-sm">
        <div className="min-w-[160px]">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Class</Label>
          <select
            className="mt-1 w-full h-10 rounded-lg border bg-background px-3 text-sm"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setSectionId("");
            }}
          >
            <option value="">Select class</option>
            {classGroups.map((g) => (
              <optgroup key={g.key} label={g.label}>
                {g.classes.map((c) => (
                  <option key={c._id} value={c._id}>
                    {classDisplayName(c)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="min-w-[140px]">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Section</Label>
          <select
            className="mt-1 w-full h-10 rounded-lg border bg-background px-3 text-sm"
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            disabled={!classId}
          >
            <option value="">Select section</option>
            {sections.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name || s.sectionName}
              </option>
            ))}
          </select>
        </div>
        {sectionId && (
          <div className="ml-auto flex rounded-full border bg-muted/40 p-1">
            <button
              type="button"
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                viewMode === "week"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
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
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setViewMode("day")}
            >
              Day View
            </button>
          </div>
        )}
      </div>

      {viewMode === "day" && sectionId && (
        <div className="flex flex-wrap gap-1.5">
          {dayOptions.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDay(d)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                day === d
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              {DAY_FULL_LABELS[d].slice(0, 3)}
            </button>
          ))}
        </div>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!sectionId && (
        <Card className="rounded-2xl border p-8 text-sm text-muted-foreground shadow-sm">
          Select a class and section to view the timetable sheet.
        </Card>
      )}

      {sectionId && grid === null && !isLoading && (
        <Card className="rounded-2xl border p-8 text-sm text-muted-foreground shadow-sm">
          No published timetable for this section yet.
        </Card>
      )}

      {sectionId && grid && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="default">Published · v{grid.version.version}</Badge>
            {grid.slots.length === 0 && (
              <span className="text-muted-foreground">Published, but no lessons yet.</span>
            )}
          </div>
          <Card className="overflow-hidden rounded-2xl border shadow-sm">
            <AcademyPeriodSheet
              periods={lecturePeriods}
              rows={sheetRows}
              firstColumnHeader={viewMode === "day" ? "Section" : "Day"}
              emptyMessage="No lessons in the published timetable."
            />
          </Card>
        </>
      )}
    </div>
  );
}
