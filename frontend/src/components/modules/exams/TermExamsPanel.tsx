import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Award, FileDown, Save, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ModuleActionCaps } from "@/lib/permissions";
import type { AcademySubject } from "@/lib/studentManagementApi";
import {
  fetchExam,
  fetchExamResults,
  fetchExamStudents,
  publishAllExamResults,
  publishResult,
  resultPdfUrl,
  saveExamMarks,
  type Exam,
} from "@/lib/examApi";
import { getAccessToken } from "@/lib/auth";
import AssignAssessmentsPanel from "@/components/modules/exams/AssignAssessmentsPanel";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import CreatedByLine from "@/components/modules/CreatedByLine";
import { matchesPanelSearch } from "@/lib/panelSearch";

function classNameOf(exam?: Exam | null) {
  const c = exam?.academyClass;
  return typeof c === "object" && c ? c.className : "—";
}

function subjectIdOf(s: string | AcademySubject | undefined) {
  if (!s) return "";
  return typeof s === "object" ? s._id : String(s);
}

type MarkColumn = { id: string; name: string; total: number };

function paperColumnsOf(exam: Exam | undefined, classSubjects: AcademySubject[]): MarkColumn[] {
  const names = new Map(classSubjects.map((s) => [s._id, s.subjectName]));
  const cols: MarkColumn[] = [];
  for (const row of exam?.dateSheet || []) {
    const raw = row.subject;
    const id = subjectIdOf(raw);
    if (!id) continue;
    const total = Number(row.totalMarks);
    cols.push({
      id,
      name: typeof raw === "object" && raw?.subjectName ? raw.subjectName : names.get(id) || "Subject",
      total: Number.isFinite(total) && total > 0 ? total : 100,
    });
  }
  return cols;
}

export default function TermExamsPanel({ caps }: { caps: ModuleActionCaps }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [marksDraft, setMarksDraft] = useState<
    Record<string, Record<string, { obtained: string; total: string }>>
  >({});

  const canEnter = caps.canEdit || caps.canCreate;
  const canPublish = caps.canCreate;

  const { data: selectedExam } = useQuery({
    queryKey: ["exam", selectedExamId],
    queryFn: () => fetchExam(selectedExamId!),
    enabled: !!selectedExamId,
  });

  const { data: examData, isLoading: gridLoading } = useQuery({
    queryKey: ["exam-students", selectedExamId],
    queryFn: () => fetchExamStudents(selectedExamId!),
    enabled: !!selectedExamId,
  });

  const { data: results = [], refetch: refetchResults } = useQuery({
    queryKey: ["exam-results", selectedExamId],
    queryFn: () => fetchExamResults(selectedExamId!),
    enabled: !!selectedExamId,
  });

  const saveMarksMut = useMutation({
    mutationFn: ({ examId, marks }: { examId: string; marks: Parameters<typeof saveExamMarks>[1] }) =>
      saveExamMarks(examId, marks),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exam-students", selectedExamId] });
      qc.invalidateQueries({ queryKey: ["exam-results", selectedExamId] });
      toast({ title: "Marks saved (draft)" });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const publishAllMut = useMutation({
    mutationFn: publishAllExamResults,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["exam-results", selectedExamId] });
      qc.invalidateQueries({ queryKey: ["exams"] });
      toast({ title: `Published ${data.modifiedCount} result(s)` });
    },
    onError: (e: Error) => toast({ title: "Publish failed", description: e.message, variant: "destructive" }),
  });

  const subjects = examData?.subjects || [];
  const studentRows = examData?.students || [];
  const markExam = selectedExam?.dateSheet?.length ? selectedExam : examData?.exam;
  const markColumns = useMemo(
    () => paperColumnsOf(markExam, subjects),
    [markExam, subjects],
  );

  const studentRowsFiltered = useMemo(() => {
    if (!studentSearch.trim()) return studentRows;
    return studentRows.filter((row) =>
      matchesPanelSearch(
        studentSearch,
        row.student.studentName,
        row.student.studentId,
        row.student.fatherName
      )
    );
  }, [studentRows, studentSearch]);

  useEffect(() => {
    if (!studentRows.length || !markColumns.length) return;
    setMarksDraft((prev) => {
      const next: Record<string, Record<string, { obtained: string; total: string }>> = { ...prev };
      studentRows.forEach((row) => {
        const sid = row.student._id;
        const rowDraft = { ...(next[sid] || {}) };
        markColumns.forEach((col) => {
          const existing = row.result?.subjectMarks?.find((m) => subjectIdOf(m.subject) === col.id);
          const prevCell = rowDraft[col.id];
          rowDraft[col.id] = {
            obtained: prevCell?.obtained ?? (existing != null ? String(existing.obtained) : ""),
            total: String(col.total),
          };
        });
        next[sid] = rowDraft;
      });
      return next;
    });
  }, [studentRows, markColumns]);

  const handleSaveMarks = () => {
    if (!selectedExamId) return;
    const marks = studentRows
      .map((row) => {
        const sid = row.student._id;
        const enrolled = new Set((row.subjects || []).map((sub) => sub._id));
        const subjectMarks = markColumns
          .filter((col) => enrolled.has(col.id))
          .map((col) => {
            const cell = marksDraft[sid]?.[col.id];
            if (!cell || cell.obtained === "") return null;
            return {
              subject: col.id,
              obtained: Number(cell.obtained),
              total: col.total,
            };
          })
          .filter(Boolean) as { subject: string; obtained: number; total: number }[];
        if (!subjectMarks.length) return null;
        return { studentId: sid, subjectMarks };
      })
      .filter(Boolean) as { studentId: string; subjectMarks: { subject: string; obtained: number; total: number }[] }[];
    saveMarksMut.mutate({ examId: selectedExamId, marks });
  };

  const downloadPdf = async (resultId: string) => {
    const token = getAccessToken();
    const res = await fetch(resultPdfUrl(resultId), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
    });
    if (!res.ok) {
      toast({ title: "PDF failed", variant: "destructive" });
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `result-${resultId}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className={selectedExamId ? "hidden" : undefined}>
        <AssignAssessmentsPanel
          caps={caps}
          category="exam"
          onEnterExam={(examId) => {
            setStudentSearch("");
            setSelectedExamId(examId);
          }}
        />
      </div>

      {selectedExamId && (
        <div className="space-y-3">
          <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setSelectedExamId(null)}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to exams
          </Button>
          <Card className="overflow-hidden">
              <div className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2 bg-secondary/20">
                <div>
                  <h3 className="font-semibold text-primary flex items-center gap-2">
                    <Award className="h-4 w-4 text-accent" />
                    {selectedExam?.title || "Exam"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {classNameOf(selectedExam)}
                    {selectedExam?.type ? ` · ${selectedExam.type}` : ""}
                    {selectedExam?.sessionLabel ? ` · ${selectedExam.sessionLabel}` : ""}
                  </p>
                  <CreatedByLine createdBy={selectedExam?.createdBy} className="mt-1" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {canEnter && (
                    <Button size="sm" variant="outline" onClick={handleSaveMarks} disabled={saveMarksMut.isPending}>
                      <Save className="h-3.5 w-3.5 mr-1" />
                      Save draft
                    </Button>
                  )}
                  {canPublish && (
                    <Button
                      size="sm"
                      variant="hero"
                      onClick={() => publishAllMut.mutate(selectedExamId!)}
                      disabled={publishAllMut.isPending}
                    >
                      <Send className="h-3.5 w-3.5 mr-1" />
                      Publish all
                    </Button>
                  )}
                </div>
              </div>

              <Tabs defaultValue="marks">
                <TabsList className="w-full justify-start rounded-none border-b px-2 h-10 bg-transparent">
                  <TabsTrigger value="marks">Enter marks</TabsTrigger>
                  <TabsTrigger value="results" onClick={() => refetchResults()}>
                    Results & ranks
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="marks" className="m-0">
                  {gridLoading ? (
                    <p className="p-6 text-sm text-muted-foreground">Loading students…</p>
                  ) : (
                    <>
                      <div className="px-3 py-2 border-b">
                        <PanelSearchBar
                          value={studentSearch}
                          onChange={setStudentSearch}
                          placeholder="Search students in grid…"
                          className="max-w-sm"
                        />
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="text-left p-2 sticky left-0 bg-muted/50 min-w-[140px]">Student</th>
                              {markColumns.map((col) => (
                                <th key={col.id} className="text-center p-2 min-w-[100px]">
                                  {col.name}
                                  <div className="text-[10px] font-normal text-muted-foreground">/ {col.total}</div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {studentRowsFiltered.length === 0 && (
                              <tr>
                                <td
                                  colSpan={markColumns.length + 1}
                                  className="p-6 text-center text-muted-foreground"
                                >
                                  No students match your search.
                                </td>
                              </tr>
                            )}
                            {studentRowsFiltered.map((row) => (
                              <tr key={row.student._id} className="border-t">
                                <td className="p-2 sticky left-0 bg-background font-medium">
                                  {row.student.studentName}
                                  <div className="text-[10px] text-muted-foreground">{row.student.studentId}</div>
                                </td>
                                {markColumns.map((col) => {
                                  const enrolled = (row.subjects || []).some((sub) => sub._id === col.id);
                                  const cell = marksDraft[row.student._id]?.[col.id];
                                  return (
                                    <td key={col.id} className="p-1 text-center">
                                      {!enrolled ? (
                                        <span className="text-xs text-muted-foreground">—</span>
                                      ) : canEnter ? (
                                        <div className="flex items-center justify-center gap-1">
                                          <Input
                                            className="h-7 w-14 text-center text-xs px-1"
                                            placeholder="0"
                                            value={cell?.obtained ?? ""}
                                            onChange={(e) =>
                                              setMarksDraft((prev) => ({
                                                ...prev,
                                                [row.student._id]: {
                                                  ...prev[row.student._id],
                                                  [col.id]: {
                                                    obtained: e.target.value,
                                                    total: String(col.total),
                                                  },
                                                },
                                              }))
                                            }
                                          />
                                          <span className="text-xs text-muted-foreground">/ {col.total}</span>
                                        </div>
                                      ) : (
                                        <span className="text-xs">
                                          {cell?.obtained || "—"}/{col.total}
                                        </span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {!studentRows.length && (
                          <p className="p-6 text-sm text-muted-foreground text-center">
                            No students enrolled in any subject for this class.
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="results" className="m-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="p-2 text-left">#</th>
                          <th className="p-2 text-left">Student</th>
                          <th className="p-2 text-right">%</th>
                          <th className="p-2 text-center">Grade</th>
                          <th className="p-2 text-center">GPA</th>
                          <th className="p-2 text-center">Status</th>
                          <th className="p-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((r) => (
                          <tr key={r._id} className="border-t">
                            <td className="p-2">{r.position ?? "—"}</td>
                            <td className="p-2 font-medium">{r.academyStudent?.studentName}</td>
                            <td className="p-2 text-right">{Math.round(r.percentage)}%</td>
                            <td className="p-2 text-center">{r.grade}</td>
                            <td className="p-2 text-center">{r.gpa?.toFixed(1) ?? "—"}</td>
                            <td className="p-2 text-center">
                              <Badge variant={r.isPublished ? "default" : "secondary"}>
                                {r.isPublished ? "Published" : "Draft"}
                              </Badge>
                            </td>
                            <td className="p-2 text-right space-x-1">
                              <Button size="sm" variant="ghost" onClick={() => downloadPdf(r._id)}>
                                <FileDown className="h-3.5 w-3.5" />
                              </Button>
                              {canPublish && !r.isPublished && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={async () => {
                                    await publishResult(r._id);
                                    refetchResults();
                                    toast({ title: "Published" });
                                  }}
                                >
                                  Publish
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!results.length && (
                      <p className="p-6 text-center text-sm text-muted-foreground">No results entered yet.</p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
          </Card>
        </div>
      )}
    </div>
  );
}
