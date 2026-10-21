import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BookOpen,
  CheckCircle2,
  ClipboardList,
  FileDown,
  FileText,
  Loader2,
  Save,
  Search,
  Send,
  Users,
} from "lucide-react";
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
import AwardListButton from "@/components/modules/exams/AwardListButton";
import { createdByLabel } from "@/lib/createdBy";
import { matchesPanelSearch } from "@/lib/panelSearch";
import {
  clampMarksInput,
  handleMarksFieldEnterKey,
  marksInputMeansAbsent,
  normalizeMarksForSave,
  recordIsAbsent,
  validateObtainedVsTotal,
} from "@/lib/marksValidation";
import { cn } from "@/lib/utils";
import { AbsentBadge } from "@/components/modules/exams/MarksAbsentToggle";

function initialOf(name?: string) {
  const ch = (name || "?").trim().charAt(0).toUpperCase();
  return ch || "?";
}

function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  iconBg,
  iconColor,
}: {
  title: string;
  value: string;
  description: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <div className="relative flex min-h-[118px] flex-col overflow-hidden rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
      <div className="flex items-start gap-2.5">
        <div
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
          style={{ backgroundColor: iconBg }}
        >
          <Icon className="h-5 w-5" style={{ color: iconColor }} strokeWidth={2} />
        </div>
        <p className="truncate pt-0.5 text-[12px] font-semibold text-slate-500">{title}</p>
      </div>
      <div className="mt-auto min-w-0 pt-3">
        <div className="truncate text-[24px] font-bold leading-none tracking-tight text-[#10244A]">
          {value}
        </div>
        <p className="mt-2 text-[11px] font-medium text-slate-400">{description}</p>
      </div>
    </div>
  );
}

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
    Record<string, Record<string, { obtained: string; total: string; isAbsent: boolean }>>
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
      const next: Record<
        string,
        Record<string, { obtained: string; total: string; isAbsent: boolean }>
      > = { ...prev };
      studentRows.forEach((row) => {
        const sid = row.student._id;
        const rowDraft = { ...(next[sid] || {}) };
        markColumns.forEach((col) => {
          const existing = row.result?.subjectMarks?.find((m) => subjectIdOf(m.subject) === col.id);
          const prevCell = rowDraft[col.id];
          const absent = prevCell?.isAbsent ?? recordIsAbsent(existing);
          rowDraft[col.id] = {
            obtained:
              prevCell?.obtained != null && !marksInputMeansAbsent(prevCell.obtained)
                ? prevCell.obtained
                : existing != null && !absent
                  ? String(existing.obtained)
                  : "",
            total: String(col.total),
            isAbsent: absent,
          };
        });
        next[sid] = rowDraft;
      });
      return next;
    });
  }, [studentRows, markColumns]);

  const handleSaveMarks = () => {
    if (!selectedExamId) return;
    for (const row of studentRows) {
      const sid = row.student._id;
      const enrolled = new Set((row.subjects || []).map((sub) => sub._id));
      for (const col of markColumns) {
        if (!enrolled.has(col.id)) continue;
        const cell = marksDraft[sid]?.[col.id];
        if (!cell) continue;
        const absent = cell.isAbsent || marksInputMeansAbsent(cell.obtained);
        if (!absent && cell.obtained === "") continue;
        const err = validateObtainedVsTotal(Number(cell.obtained), col.total, {
          isAbsent: absent,
        });
        if (err) {
          toast({
            title: "Invalid marks",
            description: `${row.student.studentName} · ${col.name}: ${err}`,
            variant: "destructive",
          });
          return;
        }
      }
    }
    const marks = studentRows
      .map((row) => {
        const sid = row.student._id;
        const enrolled = new Set((row.subjects || []).map((sub) => sub._id));
        const subjectMarks = markColumns
          .filter((col) => enrolled.has(col.id))
          .map((col) => {
            const cell = marksDraft[sid]?.[col.id];
            if (!cell) return null;
            const absent = cell.isAbsent || marksInputMeansAbsent(cell.obtained);
            if (!absent && cell.obtained === "") return null;
            const normalized = normalizeMarksForSave(cell.obtained, cell.isAbsent);
            return {
              subject: col.id,
              obtained: normalized.obtained,
              total: col.total,
              isAbsent: normalized.isAbsent,
              remarks: normalized.isAbsent ? "Absent" : undefined,
            };
          })
          .filter(Boolean) as {
          subject: string;
          obtained: number;
          total: number;
          isAbsent?: boolean;
          remarks?: string;
        }[];
        if (!subjectMarks.length) return null;
        return { studentId: sid, subjectMarks };
      })
      .filter(Boolean) as {
      studentId: string;
      subjectMarks: {
        subject: string;
        obtained: number;
        total: number;
        isAbsent?: boolean;
        remarks?: string;
      }[];
    }[];
    saveMarksMut.mutate({ examId: selectedExamId, marks });
  };

  const marksEnteredCount = useMemo(() => {
    let n = 0;
    for (const row of studentRows) {
      const sid = row.student._id;
      const enrolled = new Set((row.subjects || []).map((sub) => sub._id));
      for (const col of markColumns) {
        if (!enrolled.has(col.id)) continue;
        const cell = marksDraft[sid]?.[col.id];
        if (!cell) continue;
        if (cell.isAbsent || cell.obtained !== "") n += 1;
      }
    }
    return n;
  }, [studentRows, markColumns, marksDraft]);

  const marksCellsTotal = useMemo(() => {
    let n = 0;
    for (const row of studentRows) {
      const enrolled = new Set((row.subjects || []).map((sub) => sub._id));
      for (const col of markColumns) {
        if (enrolled.has(col.id)) n += 1;
      }
    }
    return n;
  }, [studentRows, markColumns]);

  const marksPct =
    marksCellsTotal > 0 ? Math.round((marksEnteredCount / marksCellsTotal) * 100) : 0;
  const publishedCount = results.filter((r) => r.isPublished).length;
  const createdBy = createdByLabel(selectedExam?.createdBy);

  const downloadPdf = async (resultId: string) => {
    const token = getAccessToken();
    const preview = window.open("about:blank", "_blank");
    try {
      const res = await fetch(resultPdfUrl(resultId), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!res.ok) {
        preview?.close();
        toast({ title: "PDF failed", variant: "destructive" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (preview && !preview.closed) {
        preview.location.replace(url);
        preview.focus();
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = `result-card-${resultId}.pdf`;
        a.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
    } catch {
      preview?.close();
      toast({ title: "PDF failed", variant: "destructive" });
    }
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
        <div className="space-y-5">
          <Card className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#3b82f6]">
                  <ClipboardList className="h-5 w-5 text-white" strokeWidth={2.25} />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-slate-400">
                    <button
                      type="button"
                      className="hover:text-[#2563eb]"
                      onClick={() => setSelectedExamId(null)}
                    >
                      Exams
                    </button>
                    <span className="mx-1 text-slate-300">›</span>
                    Marks entry
                  </p>
                  <h1 className="text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight">
                    {selectedExam?.title || "Exam"}
                  </h1>
                  <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500 max-w-3xl truncate">
                    {[
                      classNameOf(selectedExam),
                      selectedExam?.type,
                      selectedExam?.sessionLabel,
                      createdBy !== "—" ? `Created by ${createdBy}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </div>
              <div className="shrink-0 rounded-lg bg-[#e8f2ff] px-3 py-2 max-w-[15rem]">
                <p className="text-xs sm:text-sm italic leading-snug text-[#1a2b4b]/80">
                  <span className="mr-1 text-[#3b82f6] not-italic font-serif text-base leading-none">
                    &ldquo;
                  </span>
                  A great school builds great futures.
                  <span className="ml-0.5 text-[#3b82f6] not-italic font-serif text-base leading-none">
                    &rdquo;
                  </span>
                </p>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
            <MetricCard
              title="Total Students"
              value={String(studentRows.length)}
              description="Enrolled for this exam"
              icon={Users}
              iconBg="#DBEAFE"
              iconColor="#2563EB"
            />
            <MetricCard
              title="Marks Entered"
              value={`${marksEnteredCount} / ${marksCellsTotal}`}
              description={`${marksPct}% of subject cells`}
              icon={CheckCircle2}
              iconBg="#D1FAE5"
              iconColor="#059669"
            />
            <MetricCard
              title="Subjects"
              value={String(markColumns.length)}
              description="On the date sheet"
              icon={BookOpen}
              iconBg="#EDE9FE"
              iconColor="#7C3AED"
            />
            <MetricCard
              title="Published"
              value={`${publishedCount} / ${results.length || studentRows.length}`}
              description="Result cards released"
              icon={FileText}
              iconBg="#FCE7F3"
              iconColor="#DB2777"
            />
          </div>

          <Card className="p-3 sm:p-4 shadow-sm border-border/80">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[14rem] flex-1 max-w-xl">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Search name, ID, father…"
                  className="h-10 pl-9"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0 ml-auto">
                <AwardListButton
                  examId={selectedExamId}
                  size="default"
                  className="h-10"
                  label={
                    markColumns.length > 1
                      ? `Award list (${markColumns.length})`
                      : "Award list"
                  }
                />
                {canEnter && (
                  <Button
                    className="h-10 gap-2"
                    onClick={handleSaveMarks}
                    disabled={saveMarksMut.isPending}
                  >
                    <Save className="h-4 w-4" />
                    {saveMarksMut.isPending ? "Saving…" : "Save draft"}
                  </Button>
                )}
                {canPublish && (
                  <Button
                    type="button"
                    size="default"
                    variant="outline"
                    className="h-10 inline-flex items-center gap-1.5"
                    onClick={() => publishAllMut.mutate(selectedExamId!)}
                    disabled={publishAllMut.isPending}
                  >
                    {publishAllMut.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5 shrink-0" />
                    )}
                    {publishAllMut.isPending ? "Publishing…" : "Publish all"}
                  </Button>
                )}
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden shadow-sm border-border/80">
            <Tabs defaultValue="marks">
              <TabsList className="w-full justify-start rounded-none border-b bg-muted/30 px-3 h-11">
                <TabsTrigger
                  value="marks"
                  className="data-[state=active]:bg-white data-[state=active]:shadow-sm"
                >
                  Enter marks
                </TabsTrigger>
                <TabsTrigger
                  value="results"
                  className="data-[state=active]:bg-white data-[state=active]:shadow-sm"
                  onClick={() => refetchResults()}
                >
                  Results & ranks
                </TabsTrigger>
              </TabsList>

              <TabsContent value="marks" className="m-0">
                {gridLoading ? (
                  <p className="p-10 text-sm text-center text-muted-foreground">Loading students…</p>
                ) : !studentRows.length ? (
                  <p className="p-10 text-sm text-center text-muted-foreground">
                    No students enrolled in any subject for this class.
                  </p>
                ) : studentRowsFiltered.length === 0 ? (
                  <p className="p-10 text-sm text-center text-muted-foreground">
                    No students match your search.
                  </p>
                ) : (
                  <div className="overflow-x-auto overflow-y-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 border-b">
                        <tr>
                          <th className="text-left p-3 font-medium w-10 sticky left-0 z-10 bg-muted/40">
                            #
                          </th>
                          <th className="text-left p-3 font-medium min-w-[180px] sticky left-10 z-10 bg-muted/40">
                            Student
                          </th>
                          {markColumns.map((col) => (
                            <th key={col.id} className="text-center p-3 font-medium min-w-[8.5rem]">
                              <div className="font-semibold text-[#1a2b4b]">{col.name}</div>
                              <div className="text-[11px] font-normal text-muted-foreground">
                                / {col.total}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {studentRowsFiltered.map((row, idx) => {
                          const name = row.student.studentName;
                          return (
                            <tr
                              key={row.student._id}
                              className="border-b last:border-0 hover:bg-muted/20"
                            >
                              <td className="p-3 text-muted-foreground tabular-nums sticky left-0 z-[1] bg-background">
                                {idx + 1}
                              </td>
                              <td className="p-3 sticky left-10 z-[1] bg-background">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#dbeafe] text-sm font-semibold text-[#2563eb]">
                                    {initialOf(name)}
                                  </span>
                                  <div className="min-w-0">
                                    <div className="font-semibold text-[#1a2b4b] truncate">
                                      {name}
                                    </div>
                                    <div className="text-xs text-muted-foreground truncate">
                                      {row.student.studentId || "—"}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              {markColumns.map((col) => {
                                const enrolled = (row.subjects || []).some(
                                  (sub) => sub._id === col.id,
                                );
                                const cell = marksDraft[row.student._id]?.[col.id];
                                const absent =
                                  Boolean(cell?.isAbsent) ||
                                  marksInputMeansAbsent(cell?.obtained ?? "");
                                return (
                                  <td key={col.id} className="p-2 align-middle text-center">
                                    {!enrolled ? (
                                      <span className="text-xs text-muted-foreground">—</span>
                                    ) : canEnter ? (
                                      <label
                                        className={cn(
                                          "mx-auto inline-flex h-8 w-fit items-center gap-1 rounded-md border px-1.5 shadow-sm transition-colors focus-within:ring-2",
                                          absent
                                            ? "border-red-200 bg-red-50/60 focus-within:border-red-300 focus-within:ring-red-500/15"
                                            : "border-slate-200 bg-white focus-within:border-[#1a2b4b]/35 focus-within:ring-[#1a2b4b]/10",
                                        )}
                                      >
                                        <input
                                          className={cn(
                                            "h-7 w-9 border-0 bg-transparent p-0 text-center text-xs font-medium tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                                            absent
                                              ? "text-[#b91c1c] placeholder:font-semibold placeholder:text-[#b91c1c]"
                                              : "text-[#1a2b4b] placeholder:text-slate-300",
                                          )}
                                          type="number"
                                          min={0}
                                          max={col.total}
                                          step="any"
                                          inputMode="decimal"
                                          placeholder={absent ? "Ab" : "—"}
                                          data-marks-field
                                          value={cell?.obtained ?? ""}
                                          aria-label={`${name} · ${col.name} out of ${col.total}`}
                                          onKeyDown={handleMarksFieldEnterKey}
                                          onChange={(e) => {
                                            const raw = e.target.value;
                                            const nextAbsent = marksInputMeansAbsent(raw);
                                            const next = nextAbsent
                                              ? ""
                                              : clampMarksInput(raw, col.total);
                                            setMarksDraft((prev) => ({
                                              ...prev,
                                              [row.student._id]: {
                                                ...prev[row.student._id],
                                                [col.id]: {
                                                  obtained: next,
                                                  total: String(col.total),
                                                  isAbsent: nextAbsent,
                                                },
                                              },
                                            }));
                                          }}
                                        />
                                        <span className="select-none text-[10px] tabular-nums text-slate-400">
                                          /{col.total}
                                        </span>
                                      </label>
                                    ) : absent ? (
                                      <span className="inline-flex items-center justify-center gap-1.5">
                                        <AbsentBadge />
                                        <span className="text-xs tabular-nums text-muted-foreground">
                                          Ab/{col.total}
                                        </span>
                                      </span>
                                    ) : (
                                      <span className="text-sm tabular-nums text-[#1a2b4b]">
                                        {cell?.obtained || "—"}
                                        <span className="text-slate-400">/{col.total}</span>
                                      </span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="results" className="m-0">
                {!results.length ? (
                  <p className="p-10 text-center text-sm text-muted-foreground">
                    No results entered yet. Save marks on the Enter marks tab first.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 border-b">
                        <tr>
                          <th className="p-3 text-left font-medium w-10">#</th>
                          <th className="p-3 text-left font-medium min-w-[180px]">Student</th>
                          <th className="p-3 text-right font-medium">Marks</th>
                          <th className="p-3 text-right font-medium">%</th>
                          <th className="p-3 text-center font-medium">Grade</th>
                          <th className="p-3 text-center font-medium">GPA</th>
                          <th className="p-3 text-center font-medium">Status</th>
                          <th className="p-3 text-right font-medium w-24">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((r) => {
                          const name = r.academyStudent?.studentName || "—";
                          const marks = r.subjectMarks || [];
                          const fullyAbsent =
                            marks.length > 0 && marks.every((m) => recordIsAbsent(m));
                          const hasAbsent = marks.some((m) => recordIsAbsent(m));
                          return (
                            <tr
                              key={r._id}
                              className="border-b last:border-0 hover:bg-muted/20"
                            >
                              <td className="p-3 text-muted-foreground tabular-nums">
                                {r.position ?? "—"}
                              </td>
                              <td className="p-3">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#dbeafe] text-sm font-semibold text-[#2563eb]">
                                    {initialOf(name)}
                                  </span>
                                  <div className="min-w-0">
                                    <div className="font-semibold text-[#1a2b4b] truncate">
                                      {name}
                                    </div>
                                    <div className="text-xs text-muted-foreground truncate">
                                      {r.academyStudent?.studentId || "—"}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="p-3 text-right">
                                <div className="inline-flex items-center justify-end gap-2">
                                  {(fullyAbsent || hasAbsent) && <AbsentBadge />}
                                  <span className="tabular-nums font-medium">
                                    {fullyAbsent
                                      ? `Ab/${r.totalMarks}`
                                      : `${r.obtainedMarks}/${r.totalMarks}`}
                                  </span>
                                </div>
                              </td>
                              <td className="p-3 text-right tabular-nums font-medium">
                                {fullyAbsent ? "—" : `${Math.round(r.percentage)}%`}
                              </td>
                              <td className="p-3 text-center font-medium">
                                {fullyAbsent ? "—" : r.grade}
                              </td>
                              <td className="p-3 text-center tabular-nums">
                                {fullyAbsent ? "—" : (r.gpa?.toFixed(1) ?? "—")}
                              </td>
                              <td className="p-3 text-center">
                                <Badge
                                  variant={r.isPublished ? "default" : "secondary"}
                                  className={cn(
                                    r.isPublished && "bg-emerald-600 hover:bg-emerald-600",
                                  )}
                                >
                                  {r.isPublished ? "Published" : "Draft"}
                                </Badge>
                              </td>
                              <td className="p-3 text-right">
                                <div className="inline-flex items-center justify-end gap-1">
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    className="h-8 w-8 shrink-0 text-[#1a2b4b] border-slate-200"
                                    title="Download result card"
                                    aria-label="Download result card"
                                    onClick={() => downloadPdf(r._id)}
                                  >
                                    <FileDown className="h-4 w-4" />
                                  </Button>
                                  {canPublish && !r.isPublished && (
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="ghost"
                                      className="h-8 w-8 text-emerald-600 hover:text-emerald-700"
                                      title="Publish"
                                      aria-label="Publish"
                                      onClick={async () => {
                                        await publishResult(r._id);
                                        refetchResults();
                                        toast({ title: "Published" });
                                      }}
                                    >
                                      <Send className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </Card>
        </div>
      )}
    </div>
  );
}
