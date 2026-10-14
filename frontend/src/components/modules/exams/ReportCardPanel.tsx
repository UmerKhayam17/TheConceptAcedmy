import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileBadge, Loader2, Printer, Search, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { getAccessToken } from "@/lib/auth";
import type { ModuleActionCaps } from "@/lib/permissions";
import { fetchSessions } from "@/lib/configApi";
import { ClassProgramOptions } from "@/components/modules/ClassProgramSelect";
import {
  TEST_TYPE_KEYS,
  assessmentTypeLabel,
  fetchAcademyClasses,
  fetchAcademyStudents,
  fetchClassTests,
  fetchSectionsByClass,
  fetchStudentAssessments,
  formatClassTestSchedule,
  previewClassTestMarksReportPdf,
  type AcademyAssessmentRecord,
  type AcademyClassTest,
  type AcademyStudent,
} from "@/lib/studentManagementApi";
import {
  fetchExams,
  fetchStudentExamResults,
  previewExamMarksReportPdf,
  resultPdfUrl,
  type Exam,
  type ExamResult,
} from "@/lib/examApi";
import { matchesPanelSearch } from "@/lib/panelSearch";
import { cn } from "@/lib/utils";

type ReportKind = "test" | "exam";

const filterLabelClass =
  "mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground";
const filterSelectClass =
  "h-9 w-full cursor-pointer appearance-none rounded-md border border-border bg-background px-2.5 text-sm text-foreground outline-none transition-colors hover:border-primary/30 focus:border-primary focus:ring-2 focus:ring-primary/10";

function idOf(ref: string | { _id: string } | undefined | null): string {
  if (!ref) return "";
  return typeof ref === "object" ? String(ref._id) : String(ref);
}

function classTestIdOf(a: AcademyAssessmentRecord): string {
  const ct = a.classTestId;
  if (!ct) return "";
  return typeof ct === "object" ? String(ct._id || "") : String(ct);
}

function classNameOfStudent(student: AcademyStudent) {
  const c = student.classId;
  if (typeof c === "object" && c && "className" in c) return c.className || "—";
  return "—";
}

function sectionNameOfStudent(student: AcademyStudent) {
  const s = student.sectionId;
  if (typeof s === "object" && s && "sectionName" in s) return s.sectionName || "";
  return "";
}

function testSubjectName(test: AcademyClassTest) {
  const s = test.subjectId;
  return typeof s === "object" && s ? s.subjectName || s.subjectCode || "—" : "—";
}

function testSectionId(test: AcademyClassTest) {
  return idOf(test.sectionId);
}

function examTitleOf(r: ExamResult) {
  const e = r.exam;
  if (typeof e === "object" && e) return e.title || "Exam";
  return "Exam";
}

function examMetaOf(r: ExamResult) {
  const e = r.exam;
  if (typeof e !== "object" || !e) return "";
  return [e.type, e.sessionLabel].filter(Boolean).join(" · ");
}

function examIdOf(r: ExamResult) {
  const e = r.exam;
  if (typeof e === "object" && e) return e._id;
  if (typeof e === "string") return e;
  return "";
}

export default function ReportCardPanel({ caps: _caps }: { caps: ModuleActionCaps }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const isParent = user?.role === "parent";

  const { data: sessions = [] } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: () => fetchSessions(),
  });
  const activeSessionId = useMemo(
    () => sessions.find((s) => s.isActive)?._id || sessions[0]?._id || "",
    [sessions]
  );

  const [sessionId, setSessionId] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [kind, setKind] = useState<ReportKind>("exam");
  const [assessmentType, setAssessmentType] = useState("");
  const [testNumber, setTestNumber] = useState("");
  const [examId, setExamId] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [student, setStudent] = useState<AcademyStudent | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);

  const effectiveSessionId = sessionId || activeSessionId;

  useEffect(() => {
    setClassId("");
    setSectionId("");
    setStudent(null);
    setExamId("");
    setTestNumber("");
    setAssessmentType("");
  }, [effectiveSessionId]);

  useEffect(() => {
    setSectionId("");
    setStudent(null);
    setExamId("");
    setTestNumber("");
  }, [classId]);

  useEffect(() => {
    setStudent(null);
  }, [sectionId]);

  useEffect(() => {
    setExamId("");
    setTestNumber("");
    setAssessmentType("");
  }, [kind]);

  const { data: classes = [] } = useQuery({
    queryKey: ["academy-classes", effectiveSessionId, "report-card"],
    queryFn: () => fetchAcademyClasses({ sessionId: effectiveSessionId, status: "active" }),
    enabled: Boolean(effectiveSessionId) && !isParent,
  });

  const { data: sections = [] } = useQuery({
    queryKey: ["academy-sections", classId, "report-card"],
    queryFn: () => fetchSectionsByClass(classId, { status: "active" }),
    enabled: Boolean(classId) && !isParent,
  });

  const studentsQ = useQuery({
    queryKey: [
      "academy-students",
      "report-card",
      effectiveSessionId,
      classId,
      sectionId,
      studentSearch,
    ],
    queryFn: () =>
      fetchAcademyStudents({
        search: studentSearch.trim() || undefined,
        limit: 50,
        classId: classId || undefined,
        sectionId: sectionId || undefined,
        sessionId: effectiveSessionId || undefined,
        status: isParent ? undefined : "active",
      }),
    enabled: !student && (studentSearch.trim().length >= 2 || Boolean(classId)),
  });

  const classTestsQ = useQuery({
    queryKey: ["class-tests", classId, effectiveSessionId, "report-card"],
    queryFn: () => fetchClassTests(classId || undefined, undefined, effectiveSessionId),
    enabled: kind === "test" && Boolean(classId),
  });

  const examsQ = useQuery({
    queryKey: ["exams", classId, "report-card"],
    queryFn: () => fetchExams(classId || undefined),
    enabled: kind === "exam" && Boolean(classId),
  });

  const assessmentsQ = useQuery({
    queryKey: ["student-assessments", student?._id, "report-card"],
    queryFn: () => fetchStudentAssessments(student!._id),
    enabled: Boolean(student?._id) && kind === "test",
  });

  const examResultsQ = useQuery({
    queryKey: ["student-exam-results", student?._id, "report-card"],
    queryFn: () => fetchStudentExamResults(student!._id),
    enabled: Boolean(student?._id) && kind === "exam",
  });

  const filteredClassTests = useMemo(() => {
    let rows = classTestsQ.data || [];
    if (sectionId) {
      rows = rows.filter((t) => !testSectionId(t) || testSectionId(t) === sectionId);
    }
    if (assessmentType) rows = rows.filter((t) => t.assessmentType === assessmentType);
    if (testNumber) {
      rows = rows.filter((t) => String(t.occurrenceIndex ?? "") === testNumber);
    }
    return rows;
  }, [classTestsQ.data, sectionId, assessmentType, testNumber]);

  const testNumberOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of classTestsQ.data || []) {
      if (sectionId && testSectionId(t) && testSectionId(t) !== sectionId) continue;
      if (assessmentType && t.assessmentType !== assessmentType) continue;
      if (t.occurrenceIndex != null) set.add(String(t.occurrenceIndex));
    }
    return [...set].sort((a, b) => Number(a) - Number(b));
  }, [classTestsQ.data, sectionId, assessmentType]);

  const examOptions = useMemo(() => examsQ.data || [], [examsQ.data]);

  const studentList = useMemo(() => {
    const rows = studentsQ.data?.students || [];
    if (!studentSearch.trim()) return rows;
    return rows.filter((s) =>
      matchesPanelSearch(studentSearch, s.studentName, s.studentId, s.fatherName)
    );
  }, [studentsQ.data, studentSearch]);

  const examsForStudent = useMemo(() => {
    if (!student || kind !== "exam") return [];
    let rows = examResultsQ.data || [];
    if (examId) rows = rows.filter((r) => examIdOf(r) === examId);
    if (classId && examOptions.length) {
      const allowed = new Set(examOptions.map((e) => e._id));
      rows = rows.filter((r) => allowed.has(examIdOf(r)));
    }
    return [...rows].sort((a, b) => {
      const ae = typeof a.exam === "object" && a.exam ? a.exam.startDate : "";
      const be = typeof b.exam === "object" && b.exam ? b.exam.startDate : "";
      return new Date(be || 0).getTime() - new Date(ae || 0).getTime();
    });
  }, [student, kind, examResultsQ.data, examId, classId, examOptions]);

  const displayTests = useMemo(() => {
    if (!student || kind !== "test") return [];
    const marked = new Set((assessmentsQ.data || []).map(classTestIdOf).filter(Boolean));
    if (!marked.size) return [];

    if (classId && filteredClassTests.length) {
      return filteredClassTests
        .filter((t) => marked.has(t._id))
        .map((t) => {
          const a = (assessmentsQ.data || []).find((x) => classTestIdOf(x) === t._id);
          return {
            testId: t._id,
            title: t.title,
            assessmentType: t.assessmentType,
            examDate: t.examDate,
            subjectName: testSubjectName(t),
            obtained: a ? Number(a.obtainedMarks) || 0 : 0,
            total: a
              ? Number(a.totalMarks) || Number(t.totalMarks) || 0
              : Number(t.totalMarks) || 0,
            occurrenceIndex: t.occurrenceIndex,
            schedule: formatClassTestSchedule(t),
          };
        });
    }

    // No class filter / no class tests loaded — build from student assessments.
    return (assessmentsQ.data || [])
      .filter((a) => classTestIdOf(a))
      .filter((a) => !assessmentType || a.assessmentType === assessmentType)
      .reduce<
        {
          testId: string;
          title: string;
          assessmentType: string;
          examDate: string;
          subjectName: string;
          obtained: number;
          total: number;
          occurrenceIndex?: number;
          schedule: string;
        }[]
      >((acc, a) => {
        const testId = classTestIdOf(a);
        if (!testId || acc.some((x) => x.testId === testId)) return acc;
        const subject =
          a.subjectId && typeof a.subjectId === "object"
            ? a.subjectId.subjectName || a.subjectId.subjectCode || ""
            : "";
        acc.push({
          testId,
          title: a.title,
          assessmentType: a.assessmentType,
          examDate: a.examDate,
          subjectName: subject || "—",
          obtained: Number(a.obtainedMarks) || 0,
          total: Number(a.totalMarks) || 0,
          schedule: a.examDate ? new Date(a.examDate).toLocaleDateString() : "",
        });
        return acc;
      }, [])
      .sort((a, b) => new Date(b.examDate).getTime() - new Date(a.examDate).getTime());
  }, [student, kind, classId, filteredClassTests, assessmentsQ.data, assessmentType]);

  const clearStudent = () => {
    setStudent(null);
    setStudentSearch("");
  };

  const printExamCard = async (result: ExamResult) => {
    const eid = examIdOf(result);
    setPrintingId(result._id);
    try {
      if (result.isPublished) {
        const token = getAccessToken();
        const preview = window.open("about:blank", "_blank");
        const res = await fetch(resultPdfUrl(result._id), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: "include",
        });
        if (!res.ok) {
          preview?.close();
          throw new Error("Could not open result card");
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (preview && !preview.closed) {
          preview.location.replace(url);
          preview.focus();
        } else {
          const a = document.createElement("a");
          a.href = url;
          a.download = `result-card-${result._id}.pdf`;
          a.click();
        }
        window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
      } else if (eid && student) {
        await previewExamMarksReportPdf(eid, {
          view: "student",
          studentId: student._id,
        });
      } else {
        throw new Error("Exam result is not published yet");
      }
    } catch (err) {
      toast({
        title: "Report failed",
        description: err instanceof Error ? err.message : "Could not open PDF",
        variant: "destructive",
      });
    } finally {
      setPrintingId(null);
    }
  };

  const printTestCard = async (testId: string) => {
    if (!student) return;
    setPrintingId(testId);
    try {
      await previewClassTestMarksReportPdf(testId, {
        view: "test",
        studentIds: [student._id],
      });
    } catch (err) {
      toast({
        title: "Report failed",
        description: err instanceof Error ? err.message : "Could not open PDF",
        variant: "destructive",
      });
    } finally {
      setPrintingId(null);
    }
  };

  const loadingList =
    (kind === "test" && (assessmentsQ.isLoading || (classId && classTestsQ.isLoading))) ||
    (kind === "exam" && examResultsQ.isLoading);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <FileBadge className="h-5 w-5 text-primary" />
            Report Card
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5 max-w-xl">
            Filter by session, class, section, and test/exam, then select a student to print their
            report card.
          </p>
        </div>
        <div className="inline-flex rounded-md border p-0.5 bg-muted/40">
          <button
            type="button"
            className={cn(
              "px-3 py-1.5 text-sm rounded-sm transition-colors",
              kind === "exam" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"
            )}
            onClick={() => setKind("exam")}
          >
            Term exam
          </button>
          <button
            type="button"
            className={cn(
              "px-3 py-1.5 text-sm rounded-sm transition-colors",
              kind === "test" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"
            )}
            onClick={() => setKind("test")}
          >
            Class test
          </button>
        </div>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {!isParent && (
            <div className="min-w-0">
              <label className={filterLabelClass}>Session</label>
              <select
                className={filterSelectClass}
                value={effectiveSessionId}
                onChange={(e) => setSessionId(e.target.value)}
              >
                {sessions.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                    {s.isActive ? " (active)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!isParent && (
            <div className="min-w-0">
              <label className={filterLabelClass}>Class</label>
              <select
                className={filterSelectClass}
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
              >
                <ClassProgramOptions classes={classes} emptyLabel="Select class" />
              </select>
            </div>
          )}

          {!isParent && (
            <div className="min-w-0">
              <label className={filterLabelClass}>Section</label>
              <select
                className={filterSelectClass}
                value={sectionId}
                disabled={!classId}
                onChange={(e) => setSectionId(e.target.value)}
              >
                <option value="">All sections</option>
                {sections.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.sectionName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {kind === "test" && (
            <div className="min-w-0">
              <label className={filterLabelClass}>Test type</label>
              <select
                className={filterSelectClass}
                value={assessmentType}
                onChange={(e) => {
                  setAssessmentType(e.target.value);
                  setTestNumber("");
                }}
              >
                <option value="">All types</option>
                {TEST_TYPE_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {assessmentTypeLabel(k)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {kind === "test" && (
            <div className="min-w-0">
              <label className={filterLabelClass}>Test number</label>
              <select
                className={filterSelectClass}
                value={testNumber}
                disabled={!classId}
                onChange={(e) => setTestNumber(e.target.value)}
              >
                <option value="">All tests</option>
                {testNumberOptions.map((n) => (
                  <option key={n} value={n}>
                    Test No. {n}
                  </option>
                ))}
              </select>
            </div>
          )}

          {kind === "exam" && (
            <div className="min-w-0 sm:col-span-2 lg:col-span-1 xl:col-span-2">
              <label className={filterLabelClass}>Exam</label>
              <select
                className={filterSelectClass}
                value={examId}
                disabled={!classId}
                onChange={(e) => setExamId(e.target.value)}
              >
                <option value="">All exams</option>
                {examOptions.map((e: Exam) => (
                  <option key={e._id} value={e._id}>
                    {e.title}
                    {e.type ? ` · ${e.type}` : ""}
                    {e.sessionLabel ? ` · ${e.sessionLabel}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {!isParent && !classId && (
          <p className="mt-3 text-xs text-muted-foreground">
            Select a class to load students, sections, and {kind === "test" ? "tests" : "exams"}.
          </p>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <Label className={filterLabelClass}>Student</Label>
        {student ? (
          <div className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2.5 bg-muted/20">
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{student.studentName}</p>
              <p className="text-xs text-muted-foreground truncate">
                {[
                  student.studentId,
                  student.fatherName,
                  classNameOfStudent(student),
                  sectionNameOfStudent(student),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={clearStudent}>
              <X className="h-3.5 w-3.5 mr-1" />
              Change
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="relative max-w-xl">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder={
                  classId
                    ? "Search student in this class…"
                    : "Search by name or student ID (or select a class first)…"
                }
                className="pl-9 h-9"
                autoComplete="off"
              />
            </div>
            {(classId || studentSearch.trim().length >= 2) && (
              <ul className="max-h-64 overflow-y-auto rounded-md border divide-y">
                {studentsQ.isLoading && (
                  <li className="px-3 py-3 text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading students…
                  </li>
                )}
                {!studentsQ.isLoading &&
                  studentList.map((s) => (
                    <li key={s._id}>
                      <button
                        type="button"
                        className="w-full px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                        onClick={() => {
                          setStudent(s);
                          setStudentSearch("");
                          if (!classId) {
                            const cid = idOf(s.classId);
                            if (cid) setClassId(cid);
                          }
                          if (!sectionId) {
                            const sid = idOf(s.sectionId);
                            if (sid) setSectionId(sid);
                          }
                        }}
                      >
                        <span className="font-medium">{s.studentName}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {[
                            s.studentId,
                            s.fatherName,
                            classNameOfStudent(s),
                            sectionNameOfStudent(s),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </button>
                    </li>
                  ))}
                {!studentsQ.isLoading && studentList.length === 0 && (
                  <li className="px-3 py-3 text-sm text-muted-foreground">
                    No students match these filters.
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
      </Card>

      {student && (
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">
                {kind === "exam" ? "Exam report cards" : "Class test report cards"}
              </p>
              <p className="text-xs text-muted-foreground">
                {student.studentName}
                {kind === "test" && testNumber ? ` · Test No. ${testNumber}` : ""}
                {kind === "test" && assessmentType
                  ? ` · ${assessmentTypeLabel(assessmentType)}`
                  : ""}
                {kind === "exam" && examId
                  ? ` · ${examOptions.find((e) => e._id === examId)?.title || "Selected exam"}`
                  : ""}
              </p>
            </div>
            {loadingList && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          {kind === "exam" && !loadingList && examsForStudent.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground">
              No exam results for this student with the current filters.
            </p>
          )}

          {kind === "test" && !loadingList && displayTests.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground">
              No class-test marks for this student with the current filters.
            </p>
          )}

          {kind === "exam" && examsForStudent.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    <th className="text-left p-2.5 font-medium">Exam</th>
                    <th className="text-left p-2.5 font-medium">Score</th>
                    <th className="text-left p-2.5 font-medium">Status</th>
                    <th className="text-right p-2.5 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {examsForStudent.map((r) => {
                    const busy = printingId === r._id;
                    return (
                      <tr key={r._id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="p-2.5">
                          <p className="font-medium">{examTitleOf(r)}</p>
                          <p className="text-xs text-muted-foreground">{examMetaOf(r)}</p>
                        </td>
                        <td className="p-2.5 tabular-nums">
                          {Math.round(Number(r.percentage) || 0)}%
                          {r.grade ? ` · ${r.grade}` : ""}
                          {r.position != null ? ` · #${r.position}` : ""}
                        </td>
                        <td className="p-2.5">
                          <Badge
                            variant={r.isPublished ? "secondary" : "outline"}
                            className="text-[10px]"
                          >
                            {r.isPublished ? "Published" : "Draft"}
                          </Badge>
                        </td>
                        <td className="p-2.5 text-right">
                          <Button
                            size="sm"
                            variant="hero"
                            className="h-8 gap-1.5"
                            disabled={busy}
                            onClick={() => printExamCard(r)}
                          >
                            {busy ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Printer className="h-3.5 w-3.5" />
                            )}
                            Print
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {kind === "test" && displayTests.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    <th className="text-left p-2.5 font-medium">Test</th>
                    <th className="text-left p-2.5 font-medium">Type</th>
                    <th className="text-left p-2.5 font-medium">Subject</th>
                    <th className="text-left p-2.5 font-medium">No.</th>
                    <th className="text-left p-2.5 font-medium">Marks</th>
                    <th className="text-right p-2.5 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {displayTests.map((t) => {
                    const busy = printingId === t.testId;
                    return (
                      <tr key={t.testId} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="p-2.5">
                          <p className="font-medium">{t.title}</p>
                          <p className="text-xs text-muted-foreground">{t.schedule}</p>
                        </td>
                        <td className="p-2.5 text-muted-foreground">
                          {assessmentTypeLabel(t.assessmentType) || t.assessmentType}
                        </td>
                        <td className="p-2.5">{t.subjectName}</td>
                        <td className="p-2.5 tabular-nums">
                          {t.occurrenceIndex != null ? t.occurrenceIndex : "—"}
                        </td>
                        <td className="p-2.5 tabular-nums">
                          {t.obtained}/{t.total}
                        </td>
                        <td className="p-2.5 text-right">
                          <Button
                            size="sm"
                            variant="hero"
                            className="h-8 gap-1.5"
                            disabled={busy}
                            onClick={() => printTestCard(t.testId)}
                          >
                            {busy ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Printer className="h-3.5 w-3.5" />
                            )}
                            Print
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
