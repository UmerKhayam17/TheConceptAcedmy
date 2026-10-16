import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Award, ClipboardList, Download, FileBadge } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import PanelStatCard from "@/components/modules/PanelStatCard";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchResultCardPdf,
  fetchStudentExamResults,
  type ExamResult,
} from "@/lib/examApi";
import {
  ASSESSMENT_TYPE_LABELS,
  fetchAcademyStudents,
  fetchStudentAssessments,
  type AcademyAssessmentRecord,
  type AcademyStudent,
} from "@/lib/studentManagementApi";
import type { TestExamsSection } from "@/lib/testExamsMenus";
import { useToast } from "@/hooks/use-toast";

function refName(ref: unknown, key: string): string {
  if (!ref || typeof ref !== "object") return "";
  const v = (ref as Record<string, unknown>)[key];
  return typeof v === "string" ? v : "";
}

function examTitle(result: ExamResult): string {
  const exam = result.exam;
  if (exam && typeof exam === "object" && "title" in exam) return String(exam.title || "Exam");
  return "Exam result";
}

function subjectLabel(mark: ExamResult["subjectMarks"][number]): string {
  const s = mark.subject;
  if (s && typeof s === "object" && "subjectName" in s) {
    return String((s as { subjectName?: string }).subjectName || "Subject");
  }
  return "Subject";
}

const SECTION_COPY: Record<
  TestExamsSection,
  { title: string; hint: string; empty: string }
> = {
  "enter-tests": {
    title: "Class tests",
    hint: "Published class-test marks for your child.",
    empty: "No class-test results have been published for this student yet.",
  },
  "term-exams": {
    title: "Term exams",
    hint: "Published mid / final exam results.",
    empty: "No term exam results have been published for this student yet.",
  },
  "date-sheet": {
    title: "Date sheet",
    hint: "Exam schedule details appear with published results below.",
    empty: "No exam date information is available yet for this student.",
  },
  "report-card": {
    title: "Report cards",
    hint: "Download published result cards for your child.",
    empty: "No report cards are available yet.",
  },
};

export default function ParentExamsPanel({ section }: { section: TestExamsSection }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [childId, setChildId] = useState("");
  const copy = SECTION_COPY[section];

  const { data: children = [], isLoading: childrenLoading } = useQuery({
    queryKey: ["parent-children-exams", user?.id],
    queryFn: async () => {
      const { students } = await fetchAcademyStudents({ limit: 100 });
      return students as AcademyStudent[];
    },
    enabled: Boolean(user),
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

  const selected = children.find((c) => c._id === childId) || null;

  const { data: results = [], isLoading: resultsLoading } = useQuery({
    queryKey: ["parent-exam-results", childId],
    queryFn: () => fetchStudentExamResults(childId),
    enabled: Boolean(childId),
  });

  const { data: assessments = [], isLoading: assessmentsLoading } = useQuery({
    queryKey: ["parent-assessments", childId],
    queryFn: () => fetchStudentAssessments(childId),
    enabled: Boolean(childId) && (section === "enter-tests" || section === "report-card"),
  });

  const publishedResults = useMemo(
    () => results.filter((r) => r.isPublished),
    [results],
  );

  const publishedAssessments = useMemo(() => {
    return (assessments as AcademyAssessmentRecord[]).filter(
      (a) => a.obtainedMarks != null && a.totalMarks != null,
    );
  }, [assessments]);

  const classLabel = selected
    ? [refName(selected.classId, "className"), refName(selected.sectionId, "sectionName")]
        .filter(Boolean)
        .join(" · ")
    : "";

  const downloadPdf = async (resultId: string, name: string) => {
    try {
      const blob = await fetchResultCardPdf(resultId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `result-card-${name.replace(/[^\w.-]+/g, "_").slice(0, 40)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({
        title: "Download failed",
        description: e instanceof Error ? e.message : "Could not open result card",
        variant: "destructive",
      });
    }
  };

  const loading = childrenLoading || resultsLoading || assessmentsLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {section === "enter-tests" ? (
            <ClipboardList className="h-5 w-5" />
          ) : section === "report-card" ? (
            <FileBadge className="h-5 w-5" />
          ) : (
            <Award className="h-5 w-5" />
          )}
        </div>
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight text-[#1a2b4b]">
            {copy.title}
          </h2>
          <p className="text-sm text-muted-foreground max-w-xl">{copy.hint}</p>
        </div>
      </div>

      {childrenLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!childrenLoading && children.length === 0 && (
        <Card className="rounded-2xl border border-dashed p-8 text-sm text-muted-foreground">
          Link a student to this parent account to view exam results.
        </Card>
      )}

      {children.length > 0 && (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3 shadow-sm">
            <div className="min-w-[200px]">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Child
              </Label>
              <select
                className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm"
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
            {classLabel ? (
              <p className="pb-2 text-sm text-muted-foreground">
                Class <span className="font-medium text-foreground">{classLabel}</span>
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:max-w-lg">
            <PanelStatCard
              label="Published results"
              value={loading ? "…" : publishedResults.length}
              hint="Term / exam cards"
              icon={Award}
              iconWrapClass="bg-[#ede9fe]"
              iconClass="text-[#7c3aed]"
            />
            {(section === "enter-tests" || section === "report-card") && (
              <PanelStatCard
                label="Class tests"
                value={loading ? "…" : publishedAssessments.length}
                hint="Recorded assessments"
                icon={ClipboardList}
                iconWrapClass="bg-[#dbeafe]"
                iconClass="text-[#2563eb]"
              />
            )}
          </div>

          {(section === "term-exams" ||
            section === "date-sheet" ||
            section === "report-card") && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-primary">Exam results</h3>
              {!loading && publishedResults.length === 0 && (
                <Card className="rounded-xl border p-6 text-sm text-muted-foreground">
                  {copy.empty}
                </Card>
              )}
              {publishedResults.map((r) => (
                <Card
                  key={r._id}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#1a2b4b]">{examTitle(r)}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {r.obtainedMarks}/{r.totalMarks} · {r.percentage?.toFixed?.(1) ?? r.percentage}%
                        {r.grade ? ` · Grade ${r.grade}` : ""}
                      </p>
                      {section === "date-sheet" &&
                        r.exam &&
                        typeof r.exam === "object" &&
                        Array.isArray(r.exam.dateSheet) &&
                        r.exam.dateSheet.length > 0 && (
                          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                            {r.exam.dateSheet.map((row, i) => (
                              <li key={i}>
                                {refName(row.subject, "subjectName") || "Subject"}
                                {row.date
                                  ? ` — ${new Date(row.date).toLocaleDateString()}`
                                  : ""}
                              </li>
                            ))}
                          </ul>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">Published</Badge>
                      {(section === "report-card" || section === "term-exams") && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            downloadPdf(r._id, selected?.studentName || "student")
                          }
                        >
                          <Download className="mr-1.5 h-3.5 w-3.5" />
                          PDF
                        </Button>
                      )}
                    </div>
                  </div>
                  {section !== "date-sheet" && r.subjectMarks?.length > 0 && (
                    <div className="mt-3 overflow-x-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 font-medium">Subject</th>
                            <th className="px-3 py-2 font-medium">Marks</th>
                            <th className="px-3 py-2 font-medium">Grade</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.subjectMarks.map((m, i) => (
                            <tr key={i} className="border-t">
                              <td className="px-3 py-2">{subjectLabel(m)}</td>
                              <td className="px-3 py-2 tabular-nums">
                                {m.obtained}/{m.total}
                              </td>
                              <td className="px-3 py-2">{m.grade || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}

          {(section === "enter-tests" || section === "report-card") && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-primary">Class tests</h3>
              {!loading && publishedAssessments.length === 0 && (
                <Card className="rounded-xl border p-6 text-sm text-muted-foreground">
                  {SECTION_COPY["enter-tests"].empty}
                </Card>
              )}
              {publishedAssessments.map((a) => {
                const typeKey = String(a.assessmentType || "");
                const typeLabel =
                  ASSESSMENT_TYPE_LABELS[typeKey as keyof typeof ASSESSMENT_TYPE_LABELS] ||
                  typeKey ||
                  "Test";
                const pct =
                  a.totalMarks > 0
                    ? ((a.obtainedMarks / a.totalMarks) * 100).toFixed(1)
                    : null;
                return (
                  <Card
                    key={a._id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
                  >
                    <div>
                      <p className="font-medium text-[#1a2b4b]">
                        {a.title || typeLabel}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {typeLabel}
                        {` · ${a.obtainedMarks}/${a.totalMarks}`}
                        {pct ? ` · ${pct}%` : ""}
                      </p>
                    </div>
                    <Badge variant="outline">
                      {a.examDate ? new Date(a.examDate).toLocaleDateString() : "—"}
                    </Badge>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
