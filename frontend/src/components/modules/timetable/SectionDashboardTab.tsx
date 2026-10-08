import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  AlertTriangle,
  CheckCircle2,
  CalendarDays,
  Users,
  BookOpen,
  LayoutGrid,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  classDisplayName,
  fetchClasses,
  groupClassesByProgram,
  sortClassesByLevel,
} from "@/lib/configApi";
import {
  fetchSectionDashboard,
  fetchTimetableGrid,
  type SectionDashboardRow,
} from "@/lib/timetableApi";
import { timetableHref } from "@/lib/timetableMenus";
import { cn } from "@/lib/utils";
import type { Weekday } from "@/lib/configApi";
import { DAY_FULL_LABELS, DAY_ORDER, normalizeWorkingDays } from "./constants";
import AcademyPeriodSheet, { weekRowsFromSlots } from "./AcademyPeriodSheet";

type ProgramFilter = "all" | "school" | "college" | "other";
type SheetViewMode = "week" | "day";

export default function SectionDashboardTab({ sessionId }: { sessionId: string }) {
  const { user } = useAuth();
  const role = user?.role || "admin";
  const [program, setProgram] = useState<ProgramFilter>("all");
  const [classId, setClassId] = useState("");
  const [inspectSectionId, setInspectSectionId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<SheetViewMode>("week");
  const [day, setDay] = useState<Weekday>("monday");

  useEffect(() => {
    setProgram("all");
    setClassId("");
    setInspectSectionId(null);
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

  const { data: dash, isLoading } = useQuery({
    queryKey: ["section-dashboard", sessionId, classId || "all", program],
    queryFn: () =>
      fetchSectionDashboard({
        sessionId,
        program,
        ...(classId ? { classId } : {}),
      }),
    enabled: !!sessionId,
  });

  const inspectRow = useMemo(
    () => dash?.sections.find((r) => r.section && r.section._id === inspectSectionId) || null,
    [dash?.sections, inspectSectionId]
  );

  const versionId = inspectRow?.version?._id;

  const { data: grid, isLoading: gridLoading } = useQuery({
    queryKey: ["timetable-grid", versionId],
    queryFn: () => fetchTimetableGrid(versionId!),
    enabled: !!versionId,
  });

  if (!sessionId) return null;

  const rows = dash?.sections || [];
  const workingDays = normalizeWorkingDays(
    grid?.workingDays || dash?.session.workingDays
  );
  const dayOptions = workingDays.length ? workingDays : DAY_ORDER;
  const lecturePeriods = (grid?.periods || []).filter((p) => p.type === "lecture");
  const slots = grid?.slots || [];

  const sheetRows =
    viewMode === "day"
      ? [
          {
            key: inspectSectionId || "section",
            label: inspectRow?.section?.label || "Section",
            day,
            slots: slots.filter((s) => s.day === day),
          },
        ]
      : weekRowsFromSlots(slots, dayOptions);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      <div className="text-xs text-muted-foreground">
        Timetable <span className="mx-1">›</span>{" "}
        <span className="text-foreground font-medium">Section Dashboard</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LayoutDashboard className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight">Section Dashboard</h2>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Manage every section, then open its timetable in the same Class Board–style period
              sheet (School + 1st / 2nd Year).
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to={timetableHref(role as Parameters<typeof timetableHref>[0], "board")}>
            <LayoutGrid className="h-3.5 w-3.5 mr-1.5" />
            Open Class Board
          </Link>
        </Button>
      </div>

      {dash?.programs && dash.programs.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {dash.programs.map((p) => (
            <Card key={p.key} className="rounded-xl border p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{p.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{p.sections}</p>
              <p className="text-xs text-muted-foreground">{p.classes} class(es)</p>
            </Card>
          ))}
        </div>
      )}

      {dash?.summary && (
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">{dash.summary.sections} sections</Badge>
          <Badge variant="outline">{dash.summary.readyForGenerate} ready to generate</Badge>
          <Badge variant="outline">{dash.summary.withDraft} draft</Badge>
          <Badge variant="outline">{dash.summary.withPublished} published</Badge>
          {dash.summary.missingAssignments > 0 && (
            <Badge variant="destructive">
              {dash.summary.missingAssignments} missing teacher assignments
            </Badge>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3 shadow-sm">
        <div className="min-w-[160px]">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Program</Label>
          <select
            className="mt-1 w-full h-10 rounded-lg border bg-background px-3 text-sm"
            value={program}
            onChange={(e) => {
              setProgram(e.target.value as ProgramFilter);
              setClassId("");
              setInspectSectionId(null);
            }}
          >
            <option value="all">All programs</option>
            <option value="school">School</option>
            <option value="college">College / Intermediate</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="min-w-[180px]">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Class</Label>
          <select
            className="mt-1 w-full h-10 rounded-lg border bg-background px-3 text-sm"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setInspectSectionId(null);
            }}
          >
            <option value="">All classes</option>
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
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading section dashboard…</p>}

      {!isLoading && rows.length === 0 && (
        <Card className="rounded-xl border p-8 text-sm text-muted-foreground">
          No classes/sections found for this filter. Create{" "}
          <strong>1st Year</strong>, <strong>2nd Year</strong>, and School classes with sections in
          Student Management, then assign teachers.
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <SectionStatusCard
            key={row.section?._id || `class-${row.class._id}`}
            row={row}
            workingDays={workingDays.length ? workingDays : DAY_ORDER.slice(0, 5)}
            selected={Boolean(inspectSectionId && row.section && inspectSectionId === row.section._id)}
            onView={() => {
              if (!row.section) return;
              setInspectSectionId(
                inspectSectionId === row.section._id ? null : row.section._id
              );
            }}
          />
        ))}
      </div>

      {inspectSectionId && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-semibold tracking-tight">
                {inspectRow?.section?.label || "Section timetable"}
              </h3>
              <p className="text-sm text-muted-foreground">
                Same layout as Class Board — periods across the top, lessons in cells.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {inspectRow?.timetableStatus && (
                <StatusBadge status={inspectRow.timetableStatus} />
              )}
              {grid?.version && (
                <Badge variant="outline">
                  {inspectRow?.version?.status || grid.version.status} · v{grid.version.version}
                </Badge>
              )}
              <div className="flex rounded-full border bg-muted/40 p-1">
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
            </div>
          </div>

          {viewMode === "week" && (
            <div className="flex flex-wrap gap-1.5">
              {dayOptions.map((d) => (
                <span
                  key={d}
                  className="rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground"
                >
                  {DAY_FULL_LABELS[d].slice(0, 3)}
                </span>
              ))}
            </div>
          )}

          {viewMode === "day" && (
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

          <Card className="overflow-hidden rounded-2xl border shadow-sm">
            {!versionId && (
              <p className="p-8 text-sm text-muted-foreground">
                No timetable for this section yet. Run <strong>Auto Generate All</strong> on Class
                Board, then open it again.
              </p>
            )}
            {versionId && gridLoading && (
              <p className="p-8 text-sm text-muted-foreground">Loading timetable…</p>
            )}
            {versionId && grid && (
              <AcademyPeriodSheet
                periods={lecturePeriods}
                rows={sheetRows}
                firstColumnHeader={viewMode === "day" ? "Section" : "Day"}
                emptyMessage="No lessons placed yet. Generate or edit on Class Board."
              />
            )}
          </Card>

          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground px-1">
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-emerald-600" /> Shared / Combined Lesson
            </span>
            <span className="inline-flex items-center gap-1.5 text-violet-600">Parallel (Bio/Comp)</span>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionStatusCard({
  row,
  workingDays,
  selected,
  onView,
}: {
  row: SectionDashboardRow;
  workingDays: Weekday[];
  selected: boolean;
  onView: () => void;
}) {
  return (
    <Card
      className={cn(
        "rounded-xl border p-4 shadow-sm transition-colors",
        selected && "ring-2 ring-primary/40"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {row.programLabel}
          </p>
          <h3 className="font-semibold text-base">
            {row.section?.label || `${row.class.label} (no section)`}
          </h3>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> {row.students} students
            </span>
            <span className="inline-flex items-center gap-1">
              <BookOpen className="h-3.5 w-3.5" /> {row.subjectsAssigned}/{row.subjectsOnClass}{" "}
              subjects
            </span>
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" /> {row.weeklyLessons}/{row.capacityPerWeek}{" "}
              lessons
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={row.timetableStatus} />
          {row.readyForGenerate ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" /> Ready
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-amber-600">
              <AlertTriangle className="h-3.5 w-3.5" /> Needs setup
            </span>
          )}
        </div>
      </div>

      {row.readiness.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {row.readiness.map((r) => (
            <li key={r} className="text-[11px] text-amber-700 dark:text-amber-400">
              · {r}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {workingDays.map((d) => {
          const filled = row.dayFill?.[d] || 0;
          const max = row.lecturePeriodsPerDay || 1;
          return (
            <span
              key={d}
              className="rounded-md border px-2 py-1 text-[10px] tabular-nums"
              title={`${DAY_FULL_LABELS[d]}: ${filled}/${max}`}
            >
              {DAY_FULL_LABELS[d].slice(0, 3)} {filled}/{max}
            </span>
          );
        })}
      </div>

      {row.section && (
        <div className="mt-3">
          <Button size="sm" variant={selected ? "default" : "outline"} onClick={onView}>
            {selected ? "Hide timetable" : "View timetable"}
          </Button>
        </div>
      )}
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "published") {
    return <Badge className="bg-emerald-600 hover:bg-emerald-600">Published</Badge>;
  }
  if (status === "draft") {
    return <Badge variant="secondary">Draft</Badge>;
  }
  return <Badge variant="outline">No timetable</Badge>;
}
