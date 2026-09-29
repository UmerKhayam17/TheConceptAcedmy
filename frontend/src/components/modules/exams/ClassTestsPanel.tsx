import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarClock, ChevronRight, ClipboardList, Repeat } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type { ModuleActionCaps } from "@/lib/permissions";
import { classTestMarksHref, classTestSeriesHref } from "@/lib/testExamsMenus";
import { systemConfigHref } from "@/lib/systemConfigMenus";
import PanelToolbar from "@/components/modules/PanelToolbar";
import { matchesPanelSearch } from "@/lib/panelSearch";
import {
  ASSESSMENT_TYPE_LABELS,
  fetchAcademyClasses,
  fetchClassTests,
  formatClassTestSchedule,
  type AcademyClassTest,
  type AssessmentType,
  type ClassTestRecurrence,
} from "@/lib/studentManagementApi";

function classNameOf(test: AcademyClassTest) {
  const c = test.classId;
  return typeof c === "object" && c ? c.className : "—";
}

function subjectNameOf(test: AcademyClassTest) {
  const s = test.subjectId;
  return typeof s === "object" && s ? s.subjectName : "—";
}

export default function ClassTestsPanel({ caps }: { caps: ModuleActionCaps }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canManage = caps.canCreate;
  const role = user?.role;

  const [classFilter, setClassFilter] = useState("");
  const [search, setSearch] = useState("");

  const { data: classes = [] } = useQuery({
    queryKey: ["academy-classes"],
    queryFn: () => fetchAcademyClasses({ status: "active" }),
  });

  const { data: tests = [], isLoading: testsLoading } = useQuery({
    queryKey: ["class-tests", classFilter],
    queryFn: () => fetchClassTests(classFilter || undefined),
  });

  const testsFiltered = useMemo(() => {
    return tests.filter((t) =>
      matchesPanelSearch(search, [
        t.title,
        t.seriesLabel,
        classNameOf(t),
        subjectNameOf(t),
        ASSESSMENT_TYPE_LABELS[t.assessmentType as AssessmentType],
        formatClassTestSchedule(t),
      ]),
    );
  }, [tests, search]);

  const listGroups = useMemo(() => {
    const map = new Map<string, AcademyClassTest[]>();
    for (const t of testsFiltered) {
      const key = t.seriesId && t.recurrence && t.recurrence !== "once" ? String(t.seriesId) : t._id;
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return [...map.entries()].map(([key, items]) => {
      const sorted = [...items].sort((a, b) => (a.occurrenceIndex ?? 1) - (b.occurrenceIndex ?? 1));
      const first = sorted[0];
      const isSeries = Boolean(
        first.seriesId && first.recurrence && first.recurrence !== "once" && sorted.length > 0,
      );
      const last = sorted[sorted.length - 1];
      return {
        key,
        seriesId: first.seriesId,
        label: first.seriesLabel || first.title,
        recurrence: first.recurrence as ClassTestRecurrence | undefined,
        tests: sorted,
        isSeries,
        first,
        last,
        count: sorted.length,
      };
    });
  }, [testsFiltered]);

  const openGroup = (group: (typeof listGroups)[number]) => {
    if (!role) return;
    if (group.isSeries && group.seriesId) {
      navigate(classTestSeriesHref(role, group.seriesId));
    } else if (group.first) {
      navigate(classTestMarksHref(role, group.first._id));
    }
  };

  return (
    <div className="space-y-4">
      <PanelToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Search test name, class, date…">
        <div className="space-y-1">
          <Label className="text-xs sr-only">Class</Label>
          <Select value={classFilter || "_all"} onValueChange={(v) => setClassFilter(v === "_all" ? "" : v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All classes</SelectItem>
              {classes.map((c) => (
                <SelectItem key={c._id} value={c._id}>
                  {c.className}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {canManage && (
          <Button variant="outline" asChild>
            <Link to={systemConfigHref(role ?? "admin", "assessments")}>
              Open catalog
            </Link>
          </Button>
        )}
      </PanelToolbar>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b font-semibold text-sm text-primary bg-secondary/30 flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          Published tests — assign in Assessments → Assign, then enter marks here
        </div>
        {testsLoading && <p className="p-6 text-sm text-muted-foreground">Loading…</p>}
        {!testsLoading && tests.length === 0 && (
          <p className="p-8 text-sm text-center text-muted-foreground">
            No published tests yet. Create the catalog in System Config, then assign to classes under
            Assign.
          </p>
        )}
        {!testsLoading && tests.length > 0 && testsFiltered.length === 0 && (
          <p className="p-8 text-sm text-center text-muted-foreground">No tests match your search.</p>
        )}
        <ul className="divide-y">
          {listGroups.map((group) => (
            <li key={group.key}>
              <button
                type="button"
                onClick={() => openGroup(group)}
                className="w-full text-left px-4 py-4 flex items-center gap-3 hover:bg-muted/40 transition-colors"
              >
                <div
                  className={`h-11 w-11 rounded-lg shrink-0 flex items-center justify-center ${
                    group.isSeries ? "bg-primary/10" : "bg-muted"
                  }`}
                >
                  {group.isSeries ? (
                    <Repeat className="h-5 w-5 text-primary" />
                  ) : (
                    <ClipboardList className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-primary">{group.label}</div>
                  <div className="text-sm text-muted-foreground mt-0.5">
                    {classNameOf(group.first)} · {subjectNameOf(group.first)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-2 items-center">
                    <span>{ASSESSMENT_TYPE_LABELS[group.first.assessmentType as AssessmentType]}</span>
                    {group.isSeries ? (
                      <>
                        <span>·</span>
                        <Badge variant="secondary" className="text-[10px] capitalize">
                          {group.recurrence} · {group.count} dates
                        </Badge>
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="h-3 w-3" />
                          {formatClassTestSchedule(group.first)}
                          {group.count > 1 && group.last ? ` – ${formatClassTestSchedule(group.last)}` : ""}
                        </span>
                      </>
                    ) : (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="h-3 w-3" />
                          {formatClassTestSchedule(group.first)}
                        </span>
                      </>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      Out of {group.first.totalMarks}
                    </Badge>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
