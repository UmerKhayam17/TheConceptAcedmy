import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CalendarClock, ChevronRight, Repeat } from "lucide-react";
import type { Role } from "@/lib/auth";
import type { ModuleActionCaps } from "@/lib/permissions";
import { classTestMarksHref, testExamsHref } from "@/lib/testExamsMenus";
import AwardListButton from "@/components/modules/exams/AwardListButton";
import {
  ASSESSMENT_TYPE_LABELS,
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

const RECURRENCE_LABEL: Record<ClassTestRecurrence, string> = {
  once: "One time",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

export default function ClassTestSeriesPage({
  seriesId,
  role,
  caps: _caps,
}: {
  seriesId: string;
  role: Role;
  caps: ModuleActionCaps;
}) {
  const listHref = testExamsHref(role, "enter-tests");

  const { data: tests = [], isLoading, isError, error } = useQuery({
    queryKey: ["class-tests-series", seriesId],
    queryFn: () => fetchClassTests(undefined, seriesId),
  });

  const sorted = [...tests].sort((a, b) => (a.occurrenceIndex ?? 1) - (b.occurrenceIndex ?? 1));
  const head = sorted[0];
  const last = sorted[sorted.length - 1];

  if (isLoading) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Loading schedule…</p>;
  }

  if (isError || !head) {
    return (
      <div className="py-12 space-y-4 text-center">
        <p className="text-destructive text-sm">{(error as Error)?.message || "Series not found"}</p>
        <Button variant="outline" asChild>
          <Link to={listHref}>Back to tests</Link>
        </Button>
      </div>
    );
  }

  const label = head.seriesLabel || head.title;
  const recurrence = head.recurrence && head.recurrence !== "once" ? head.recurrence : null;

  return (
    <div className="space-y-4">
      <div className="border-b pb-4 space-y-3">
        <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" asChild>
          <Link to={listHref}>
            <ArrowLeft className="h-4 w-4" /> Back to tests
          </Link>
        </Button>

        <div className="flex flex-wrap items-start gap-3">
          <div className="h-11 w-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Repeat className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-semibold text-primary">{label}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {classNameOf(head)} · {subjectNameOf(head)} ·{" "}
              {ASSESSMENT_TYPE_LABELS[head.assessmentType as AssessmentType]}
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {recurrence && (
                <Badge variant="secondary" className="capitalize">
                  {RECURRENCE_LABEL[recurrence]} series
                </Badge>
              )}
              <Badge variant="outline">{sorted.length} scheduled dates</Badge>
              <Badge variant="outline">Out of {head.totalMarks} marks each</Badge>
            </div>
            {sorted.length > 1 && last && (
              <p className="text-xs text-muted-foreground mt-2">
                {formatClassTestSchedule(head)} → {formatClassTestSchedule(last)}
              </p>
            )}
          </div>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b font-semibold text-sm text-primary bg-secondary/30">
          Full test schedule — click a date to enter marks
        </div>
        <ul className="divide-y">
          {sorted.map((test) => (
            <li key={test._id} className="flex items-center gap-2 px-4 py-3 hover:bg-muted/40 transition-colors">
              <Link
                to={classTestMarksHref(role, test._id)}
                className="flex items-center gap-3 flex-1 min-w-0"
              >
                <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-primary shrink-0">
                  {test.occurrenceIndex ?? "—"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-primary">{test.title}</div>
                  <div className="text-sm text-muted-foreground mt-0.5 inline-flex items-center gap-1">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {formatClassTestSchedule(test)}
                  </div>
                </div>
                <Badge variant={test.status === "closed" ? "secondary" : "outline"} className="text-[10px] shrink-0">
                  {test.status === "closed" ? "Closed" : "Open"}
                </Badge>
                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
              </Link>
              <AwardListButton testId={test._id} className="shrink-0" />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
