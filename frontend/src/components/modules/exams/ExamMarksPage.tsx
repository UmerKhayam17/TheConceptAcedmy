import { useEffect, useMemo, useState, type ComponentType } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
import type { Role } from "@/lib/auth";
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
  uploadExamPaper,
  type Exam,
} from "@/lib/examApi";
import { getAccessToken } from "@/lib/auth";
import AwardListButton from "@/components/modules/exams/AwardListButton";
import TestPaperCapture from "@/components/modules/exams/TestPaperCapture";
import { createdByLabel } from "@/lib/createdBy";
import { matchesPanelSearch } from "@/lib/panelSearch";
import { testExamsHref } from "@/lib/testExamsMenus";
import {
  clampMarksInput,
  focusAdjacentMarksField,
  handleMarksFieldEnterKey,
  marksInputMeansAbsent,
  normalizeMarksForSave,
  recordIsAbsent,
  validateObtainedVsTotal,
} from "@/lib/marksValidation";
import { cn } from "@/lib/utils";
import MarksAbsentToggle, {
  AbsentBadge,
} from "@/components/modules/exams/MarksAbsentToggle";

type MarksCellDraft = {
  obtained: string;
  total: string;
  isAbsent: boolean;
  remarks?: string;
  paperImage?: string;
  uploadingPaper?: boolean;
};

function initialOf(name?: string) {
  const ch = (name || "?").trim().charAt(0).toUpperCase();
  return ch || "?";
}

function sectionBadgeClass(name: string) {
  const letter = name.trim().charAt(0).toUpperCase();
  if (letter === "A") return "bg-sky-100 text-sky-800 border-sky-200";
  if (letter === "B") return "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200";
  if (letter === "C") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (letter === "D") return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
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

export default function ExamMarksPage({
  examId,
  role,
  caps,
}: {
  examId: string;
  role: Role;
  caps: ModuleActionCaps;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const listHref = testExamsHref(role, "term-exams");
  const subjectFromUrl = searchParams.get("subject") || "";
  const [studentSearch, setStudentSearch] = useState("");
  const [marksDraft, setMarksDraft] = useState<
    Record<string, Record<string, MarksCellDraft>>
  >({});

  const canEnter = caps.canEdit || caps.canCreate;
  const canPublish = caps.canCreate;

  const { data: selectedExam } = useQuery({
    queryKey: ["exam", examId],
    queryFn: () => fetchExam(examId),
    enabled: Boolean(examId),
  });

  const { data: examData, isLoading: gridLoading } = useQuery({
    queryKey: ["exam-students", examId],
    queryFn: () => fetchExamStudents(examId),
    enabled: Boolean(examId),
  });

  const { data: results = [], refetch: refetchResults } = useQuery({
    queryKey: ["exam-results", examId],
    queryFn: () => fetchExamResults(examId),
    enabled: Boolean(examId),
  });

  const saveMarksMut = useMutation({
    mutationFn: ({ examId: id, marks }: { examId: string; marks: Parameters<typeof saveExamMarks>[1] }) =>
      saveExamMarks(id, marks),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exam-students", examId] });
      qc.invalidateQueries({ queryKey: ["exam-results", examId] });
      toast({ title: "Marks saved (draft)" });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const publishAllMut = useMutation({
    mutationFn: publishAllExamResults,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["exam-results", examId] });
      qc.invalidateQueries({ queryKey: ["exams"] });
      toast({ title: `Published ${data.modifiedCount} result(s)` });
    },
    onError: (e: Error) => toast({ title: "Publish failed", description: e.message, variant: "destructive" }),
  });

  const subjects = examData?.subjects || [];
  const studentRows = examData?.students || [];
  const markExam = selectedExam?.dateSheet?.length ? selectedExam : examData?.exam;
  const allMarkColumns = useMemo(
    () => paperColumnsOf(markExam, subjects),
    [markExam, subjects],
  );

  const subjectTabs = allMarkColumns;

  const setActiveSubjectId = (subjectId: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (subjectId) next.set("subject", subjectId);
        else next.delete("subject");
        return next;
      },
      { replace: true },
    );
  };

  useEffect(() => {
    if (!subjectTabs.length) return;
    if (subjectFromUrl && subjectTabs.some((c) => c.id === subjectFromUrl)) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("subject", subjectTabs[0].id);
        return next;
      },
      { replace: true },
    );
  }, [subjectTabs, subjectFromUrl, setSearchParams]);

  const activeColumn = useMemo(
    () =>
      subjectTabs.find((c) => c.id === subjectFromUrl) || subjectTabs[0] || null,
    [subjectTabs, subjectFromUrl],
  );

  const studentRowsFiltered = useMemo(() => {
    const activeId = activeColumn?.id;
    let rows = studentRows;
    if (activeId) {
      rows = rows.filter((row) =>
        (row.subjects || []).some((sub) => sub._id === activeId),
      );
    }
    if (!studentSearch.trim()) return rows;
    return rows.filter((row) =>
      matchesPanelSearch(
        studentSearch,
        row.student.studentName,
        row.student.studentId,
        row.student.fatherName,
        row.student.rollNumber,
        row.student.sectionName,
      )
    );
  }, [studentRows, studentSearch, activeColumn?.id]);

  useEffect(() => {
    if (!studentRows.length || !allMarkColumns.length) return;
    setMarksDraft((prev) => {
      const next: Record<string, Record<string, MarksCellDraft>> = { ...prev };
      studentRows.forEach((row) => {
        const sid = row.student._id;
        const rowDraft = { ...(next[sid] || {}) };
        allMarkColumns.forEach((col) => {
          const existing = row.result?.subjectMarks?.find(
            (m) => subjectIdOf(m.subject) === col.id,
          );
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
            remarks: prevCell?.remarks ?? existing?.remarks ?? "",
            paperImage: prevCell?.paperImage ?? existing?.paperImage,
            uploadingPaper: prevCell?.uploadingPaper,
          };
        });
        next[sid] = rowDraft;
      });
      return next;
    });
  }, [studentRows, allMarkColumns]);

  const handleExamPaperUpload = async (
    studentId: string,
    subjectId: string,
    file: File,
  ) => {
    if (!examId) return;
    setMarksDraft((prev) => {
      const row = { ...(prev[studentId] || {}) };
      const cell = row[subjectId] || {
        obtained: "",
        total: String(allMarkColumns.find((c) => c.id === subjectId)?.total ?? ""),
        isAbsent: false,
      };
      row[subjectId] = { ...cell, uploadingPaper: true };
      return { ...prev, [studentId]: row };
    });
    try {
      const { paperImage } = await uploadExamPaper(
        examId,
        studentId,
        subjectId,
        file,
      );
      setMarksDraft((prev) => {
        const row = { ...(prev[studentId] || {}) };
        const cell = row[subjectId] || {
          obtained: "",
          total: "",
          isAbsent: false,
        };
        row[subjectId] = { ...cell, paperImage, uploadingPaper: false };
        return { ...prev, [studentId]: row };
      });
      toast({
        title: "Exam paper uploaded",
        description: "Image saved. Enter marks and click Save marks when ready.",
      });
    } catch (e) {
      setMarksDraft((prev) => {
        const row = { ...(prev[studentId] || {}) };
        const cell = row[subjectId];
        if (cell) row[subjectId] = { ...cell, uploadingPaper: false };
        return { ...prev, [studentId]: row };
      });
      toast({
        title: "Upload failed",
        description: e instanceof Error ? e.message : "Could not upload image",
        variant: "destructive",
      });
    }
  };

  const handleSaveMarks = () => {
    if (!examId || !activeColumn) return;
    const col = activeColumn;
    for (const row of studentRows) {
      const sid = row.student._id;
      if (!(row.subjects || []).some((sub) => sub._id === col.id)) continue;
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
    const marks = studentRows
      .map((row) => {
        const sid = row.student._id;
        const enrolled = (row.subjects || []).some((sub) => sub._id === col.id);
        if (!enrolled) return null;
        const cell = marksDraft[sid]?.[col.id];
        if (!cell) return null;
        const absent = cell.isAbsent || marksInputMeansAbsent(cell.obtained);
        if (!absent && cell.obtained === "") return null;
        const normalized = normalizeMarksForSave(cell.obtained, cell.isAbsent);
        return {
          studentId: sid,
          subjectMarks: [
            {
              subject: col.id,
              obtained: normalized.obtained,
              total: col.total,
              isAbsent: normalized.isAbsent,
              remarks: normalized.isAbsent
                ? cell.remarks?.trim() || "Absent"
                : cell.remarks?.trim() || undefined,
              paperImage: cell.paperImage || "",
            },
          ],
        };
      })
      .filter(Boolean) as {
      studentId: string;
      subjectMarks: {
        subject: string;
        obtained: number;
        total: number;
        isAbsent?: boolean;
        remarks?: string;
        paperImage?: string;
      }[];
    }[];
    saveMarksMut.mutate({ examId, marks });
  };

  const marksEnteredCount = useMemo(() => {
    if (!activeColumn) return 0;
    let n = 0;
    for (const row of studentRows) {
      if (!(row.subjects || []).some((sub) => sub._id === activeColumn.id)) continue;
      const cell = marksDraft[row.student._id]?.[activeColumn.id];
      if (!cell) continue;
      if (cell.isAbsent || cell.obtained !== "") n += 1;
    }
    return n;
  }, [studentRows, activeColumn, marksDraft]);

  const marksCellsTotal = useMemo(() => {
    if (!activeColumn) return 0;
    let n = 0;
    for (const row of studentRows) {
      if ((row.subjects || []).some((sub) => sub._id === activeColumn.id)) n += 1;
    }
    return n;
  }, [studentRows, activeColumn]);

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
    <div className="space-y-5">
          <Card className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
                  <ClipboardList className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-slate-400">
                    <Link to={listHref} className="hover:text-primary">
                      Exams
                    </Link>
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
                      activeColumn ? `Subject: ${activeColumn.name}` : "All subjects",
                      createdBy !== "—" ? `Created by ${createdBy}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </div>
              <div className="shrink-0 rounded-lg bg-primary/10 px-3 py-2 max-w-[15rem]">
                <p className="text-xs sm:text-sm italic leading-snug text-[#1a2b4b]/80">
                  <span className="mr-1 text-primary not-italic font-serif text-base leading-none">
                    &ldquo;
                  </span>
                  Education is the key to a better tomorrow.
                  <span className="ml-0.5 text-primary not-italic font-serif text-base leading-none">
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
              iconBg="hsl(var(--primary) / 0.1)"
              iconColor="hsl(var(--primary))"
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
              value={String(allMarkColumns.length)}
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
                  examId={examId}
                  subjectId={activeColumn?.id}
                  size="default"
                  className="h-10"
                  label={
                    activeColumn
                      ? `Award list · ${activeColumn.name}`
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
                    onClick={() => publishAllMut.mutate(examId)}
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
                {subjectTabs.length > 1 && (
                  <div className="flex flex-wrap gap-1.5 border-b bg-muted/20 px-3 py-2.5">
                    {subjectTabs.map((col) => (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() => setActiveSubjectId(col.id)}
                        className={cn(
                          "rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors",
                          activeColumn?.id === col.id
                            ? "border-[#1a2b4b]/20 bg-white text-[#1a2b4b] shadow-sm"
                            : "border-transparent bg-transparent text-slate-500 hover:bg-white/70 hover:text-[#1a2b4b]",
                        )}
                      >
                        {col.name}
                        <span className="ml-1.5 font-normal text-muted-foreground">
                          /{col.total}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {gridLoading ? (
                  <p className="p-10 text-sm text-center text-muted-foreground">Loading students…</p>
                ) : !studentRows.length ? (
                  <p className="p-10 text-sm text-center text-muted-foreground">
                    No students enrolled in any subject for this class.
                  </p>
                ) : !activeColumn ? (
                  <p className="p-10 text-sm text-center text-muted-foreground">
                    No subjects on the date sheet yet.
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
                          <th className="text-left p-3 font-medium w-10">#</th>
                          <th className="text-left p-3 font-medium min-w-[160px]">Student</th>
                          <th className="text-left p-3 font-medium min-w-[120px]">Father name</th>
                          <th className="text-left p-3 font-medium min-w-[110px]">Roll number</th>
                          <th className="text-left p-3 font-medium">Section</th>
                          <th className="text-center p-3 font-medium min-w-[9.5rem]">Attendance</th>
                          <th className="text-center p-3 font-medium min-w-[8.5rem]">
                            Obtained / Total
                          </th>
                          <th className="text-center p-3 font-medium w-[7rem]">Exam paper</th>
                          <th className="text-left p-3 font-medium min-w-[140px]">Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {studentRowsFiltered.map((row, idx) => {
                          const sid = row.student._id;
                          const col = activeColumn;
                          const cell = marksDraft[sid]?.[col.id] || {
                            obtained: "",
                            total: String(col.total),
                            isAbsent: false,
                            remarks: "",
                          };
                          const name = row.student.studentName;
                          const roll = row.student.rollNumber || "—";
                          const absent =
                            Boolean(cell.isAbsent) ||
                            marksInputMeansAbsent(cell.obtained);
                          return (
                            <tr
                              key={sid}
                              className="border-b last:border-0 hover:bg-muted/20"
                            >
                              <td className="p-3 text-muted-foreground tabular-nums">
                                {idx + 1}
                              </td>
                              <td className="p-3">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                                    {initialOf(name)}
                                  </span>
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold capitalize leading-snug text-[#1a2b4b]">
                                      {name}
                                    </div>
                                    <div className="mt-0.5 text-[11px] text-slate-400">
                                      Roll No: {roll}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="p-3 text-sm text-slate-600 whitespace-nowrap">
                                {row.student.fatherName || "—"}
                              </td>
                              <td className="p-3 whitespace-nowrap text-xs tabular-nums text-slate-500">
                                {roll}
                              </td>
                              <td className="p-3">
                                {row.student.sectionName ? (
                                  <span
                                    className={cn(
                                      "inline-flex min-w-[1.75rem] items-center justify-center rounded-md border px-2 py-0.5 text-xs font-semibold",
                                      sectionBadgeClass(row.student.sectionName),
                                    )}
                                  >
                                    {row.student.sectionName}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="p-3 align-middle">
                                <div className="mx-auto flex justify-center">
                                  {canEnter ? (
                                    <MarksAbsentToggle
                                      absent={absent}
                                      onChange={(nextAbsent) => {
                                        setMarksDraft((prev) => ({
                                          ...prev,
                                          [sid]: {
                                            ...prev[sid],
                                            [col.id]: {
                                              ...cell,
                                              isAbsent: nextAbsent,
                                              obtained: "",
                                              remarks: nextAbsent
                                                ? cell.remarks?.trim() || "Absent"
                                                : cell.remarks === "Absent"
                                                  ? ""
                                                  : cell.remarks,
                                            },
                                          },
                                        }));
                                        if (nextAbsent) {
                                          const toggle = document.activeElement;
                                          if (toggle instanceof HTMLElement) {
                                            focusAdjacentMarksField(toggle, "next");
                                          }
                                        }
                                      }}
                                    />
                                  ) : absent ? (
                                    <AbsentBadge />
                                  ) : (
                                    <span className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 text-xs font-medium text-[#1a2b4b]">
                                      Present
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="p-3 align-middle">
                                <div className="mx-auto flex h-9 w-fit items-center justify-center">
                                  <label
                                    className={cn(
                                      "flex h-9 items-center gap-1.5 rounded-md border px-2.5 transition-colors focus-within:ring-2",
                                      absent
                                        ? "border-red-200 bg-red-50/60 focus-within:border-red-300 focus-within:ring-red-500/15"
                                        : "border-border bg-background focus-within:border-primary/40 focus-within:ring-primary/15",
                                    )}
                                  >
                                    <input
                                      className={cn(
                                        "h-8 w-11 border-0 bg-transparent p-0 text-center text-sm tabular-nums outline-none [appearance:textfield] disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                                        absent
                                          ? "font-semibold text-[#b91c1c] placeholder:font-semibold placeholder:text-[#b91c1c]"
                                          : "placeholder:text-muted-foreground/50",
                                      )}
                                      type="number"
                                      min={0}
                                      max={col.total}
                                      step="any"
                                      inputMode="decimal"
                                      placeholder={absent ? "Ab" : "—"}
                                      data-marks-field
                                      value={cell.obtained}
                                      disabled={!canEnter}
                                      aria-label={`Obtained marks out of ${col.total}`}
                                      onKeyDown={handleMarksFieldEnterKey}
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        const nextAbsent = marksInputMeansAbsent(raw);
                                        const next = nextAbsent
                                          ? ""
                                          : clampMarksInput(raw, col.total);
                                        setMarksDraft((prev) => ({
                                          ...prev,
                                          [sid]: {
                                            ...prev[sid],
                                            [col.id]: {
                                              ...cell,
                                              obtained: next,
                                              total: String(col.total),
                                              isAbsent: nextAbsent,
                                              remarks: nextAbsent
                                                ? cell.remarks?.trim() || "Absent"
                                                : cell.remarks === "Absent"
                                                  ? ""
                                                  : cell.remarks,
                                            },
                                          },
                                        }));
                                      }}
                                    />
                                    <span className="select-none text-xs tabular-nums text-muted-foreground">
                                      / {col.total}
                                    </span>
                                  </label>
                                </div>
                              </td>
                              <td className="p-3 align-middle">
                                <TestPaperCapture
                                  value={cell.paperImage}
                                  disabled={!canEnter}
                                  uploading={cell.uploadingPaper}
                                  onPick={(file) =>
                                    void handleExamPaperUpload(sid, col.id, file)
                                  }
                                  onClear={
                                    canEnter
                                      ? () =>
                                          setMarksDraft((prev) => ({
                                            ...prev,
                                            [sid]: {
                                              ...prev[sid],
                                              [col.id]: {
                                                ...cell,
                                                paperImage: undefined,
                                              },
                                            },
                                          }))
                                      : undefined
                                  }
                                />
                              </td>
                              <td className="p-3 align-middle">
                                <Input
                                  className="h-9"
                                  placeholder="Optional"
                                  value={cell.remarks || ""}
                                  disabled={!canEnter}
                                  onChange={(e) =>
                                    setMarksDraft((prev) => ({
                                      ...prev,
                                      [sid]: {
                                        ...prev[sid],
                                        [col.id]: {
                                          ...cell,
                                          remarks: e.target.value,
                                        },
                                      },
                                    }))
                                  }
                                />
                              </td>
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
                                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
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
                              <td className="p-3 text-right tabular-nums font-medium">
                                {r.obtainedMarks}/{r.totalMarks}
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
  );
}
