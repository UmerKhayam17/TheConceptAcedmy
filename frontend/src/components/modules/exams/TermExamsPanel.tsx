import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Award, FileDown, Save, Send } from "lucide-react";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { ModuleActionCaps } from "@/lib/permissions";
import { fetchAcademyClasses, type AcademySubject } from "@/lib/studentManagementApi";
import {
  fetchExamResults,
  fetchExamStudents,
  fetchExams,
  publishAllExamResults,
  publishResult,
  resultPdfUrl,
  saveExamMarks,
  type Exam,
  type ExamStudentRow,
} from "@/lib/examApi";
import { getAccessToken } from "@/lib/auth";
import { systemConfigHref } from "@/lib/systemConfigMenus";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import CreatedByLine from "@/components/modules/CreatedByLine";
import PanelToolbar from "@/components/modules/PanelToolbar";
import { matchesPanelSearch } from "@/lib/panelSearch";

function classNameOf(exam: Exam) {
  const c = exam.academyClass;
  return typeof c === "object" && c ? c.className : "—";
}

function subjectIdOf(s: string | AcademySubject) {
  return typeof s === "object" ? s._id : s;
}

function subjectLabel(s: string | AcademySubject) {
  return typeof s === "object" ? s.subjectName : "—";
}

export default function TermExamsPanel({ caps }: { caps: ModuleActionCaps }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const role = user?.role ?? "admin";
  const [classFilter, setClassFilter] = useState("");
  const [examSearch, setExamSearch] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [marksDraft, setMarksDraft] = useState<
    Record<string, Record<string, { obtained: string; total: string }>>
  >({});

  const canEnter = caps.canEdit || caps.canCreate;
  const canPublish = caps.canCreate;

  const { data: classes = [] } = useQuery({
    queryKey: ["academy-classes"],
    queryFn: () => fetchAcademyClasses({ status: "active" }),
  });

  const { data: exams = [], isLoading: examsLoading } = useQuery({
    queryKey: ["exams", classFilter],
    queryFn: () => fetchExams(classFilter || undefined),
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

  const examsFiltered = useMemo(() => {
    if (!examSearch.trim()) return exams;
    return exams.filter((e) =>
      matchesPanelSearch(examSearch, e.title, e.type, classNameOf(e), e.sessionLabel, e.status)
    );
  }, [exams, examSearch]);

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

  const initMarksFromRows = (rows: ExamStudentRow[]) => {
    const draft: Record<string, Record<string, { obtained: string; total: string }>> = {};
    rows.forEach((row) => {
      const sid = row.student._id;
      draft[sid] = {};
      row.subjects.forEach((sub) => {
        const subId = sub._id;
        const existing = row.result?.subjectMarks?.find(
          (m) => subjectIdOf(m.subject) === subId
        );
        draft[sid][subId] = {
          obtained: existing != null ? String(existing.obtained) : "",
          total: existing != null ? String(existing.total) : "100",
        };
      });
    });
    setMarksDraft(draft);
  };

  useEffect(() => {
    if (studentRows.length) initMarksFromRows(studentRows);
  }, [studentRows]);

  const handleSaveMarks = () => {
    if (!selectedExamId) return;
    const marks = studentRows
      .map((row) => {
        const sid = row.student._id;
        const subjectMarks = row.subjects
          .map((sub) => {
            const cell = marksDraft[sid]?.[sub._id];
            if (!cell || cell.obtained === "") return null;
            return {
              subject: sub._id,
              obtained: Number(cell.obtained),
              total: Number(cell.total) || 100,
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

  const selectedExam = exams.find((e) => e._id === selectedExamId);

  return (
    <div className="space-y-4">
      <PanelToolbar search={examSearch} onSearchChange={setExamSearch} searchPlaceholder="Search term exams…">
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
        {caps.canCreate && (
          <Button variant="outline" asChild>
            <Link to={systemConfigHref(role, "assessments")}>Open catalog</Link>
          </Button>
        )}
      </PanelToolbar>

      <div className="grid lg:grid-cols-[280px_1fr] gap-4">
        <Card className="p-0 overflow-hidden max-h-[70vh] overflow-y-auto">
          <div className="px-3 py-2 border-b font-semibold text-sm text-primary bg-secondary/30">
            Term exams
          </div>
          {examsLoading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
          {!examsLoading && exams.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              No exams yet. Publish from System Config → Assessment Plan.
            </p>
          )}
          {examsFiltered.map((exam) => (
            <button
              key={exam._id}
              type="button"
              onClick={() => setSelectedExamId(exam._id)}
              className={`w-full text-left px-3 py-3 border-b transition-colors ${selectedExamId === exam._id ? "bg-accent/10" : "hover:bg-muted/50"
                }`}
            >
              <div className="font-medium text-sm">{exam.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {classNameOf(exam)} · {exam.type}
              </div>
              <Badge variant="outline" className="mt-1 text-[10px]">
                {exam.status}
              </Badge>
            </button>
          ))}
        </Card>

        <div className="min-w-0">
          {!selectedExamId && (
            <Card className="p-8 text-center text-muted-foreground text-sm" />
          )}
          {selectedExam && (
            <Card className="overflow-hidden">
              <div className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2 bg-secondary/20">
                <div>
                  <h3 className="font-semibold text-primary flex items-center gap-2">
                    <Award className="h-4 w-4 text-accent" />
                    {selectedExam.title}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {classNameOf(selectedExam)} · {selectedExam.type}
                    {selectedExam.sessionLabel ? ` · ${selectedExam.sessionLabel}` : ""}
                  </p>
                  <CreatedByLine createdBy={selectedExam.createdBy} className="mt-1" />
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
                              {subjects.map((sub) => (
                                <th key={sub._id} className="text-center p-2 min-w-[100px]">
                                  {sub.subjectName}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {studentRowsFiltered.length === 0 && (
                              <tr>
                                <td
                                  colSpan={subjects.length + 1}
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
                                {row.subjects.map((sub) => {
                                  const cell = marksDraft[row.student._id]?.[sub._id];
                                  return (
                                    <td key={sub._id} className="p-1 text-center">
                                      {canEnter ? (
                                        <div className="flex gap-0.5 justify-center">
                                          <Input
                                            className="h-7 w-12 text-center text-xs px-1"
                                            placeholder="0"
                                            value={cell?.obtained ?? ""}
                                            onChange={(e) =>
                                              setMarksDraft((prev) => ({
                                                ...prev,
                                                [row.student._id]: {
                                                  ...prev[row.student._id],
                                                  [sub._id]: {
                                                    obtained: e.target.value,
                                                    total: prev[row.student._id]?.[sub._id]?.total ?? "100",
                                                  },
                                                },
                                              }))
                                            }
                                          />
                                          <span className="text-muted-foreground text-xs self-center">/</span>
                                          <Input
                                            className="h-7 w-12 text-center text-xs px-1"
                                            value={cell?.total ?? "100"}
                                            onChange={(e) =>
                                              setMarksDraft((prev) => ({
                                                ...prev,
                                                [row.student._id]: {
                                                  ...prev[row.student._id],
                                                  [sub._id]: {
                                                    obtained: prev[row.student._id]?.[sub._id]?.obtained ?? "",
                                                    total: e.target.value,
                                                  },
                                                },
                                              }))
                                            }
                                          />
                                        </div>
                                      ) : (
                                        <span className="text-xs">
                                          {cell?.obtained || "—"}/{cell?.total || "—"}
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
          )}
        </div>
      </div>
    </div>
  );
}
