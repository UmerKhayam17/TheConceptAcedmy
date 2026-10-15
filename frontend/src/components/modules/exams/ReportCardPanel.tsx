import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileBadge, Loader2, Printer, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { getAccessToken } from "@/lib/auth";
import type { ModuleActionCaps } from "@/lib/permissions";
import { fetchSessions } from "@/lib/configApi";
import ClassProgramSelect from "@/components/modules/ClassProgramSelect";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
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

const filterSelectClass =
  "h-10 rounded-md border border-input bg-background px-3 text-sm shrink-0";

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

  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [kind, setKind] = useState<ReportKind>("exam");
  const [assessmentType, setAssessmentType] = useState("");
  const [testNumber, setTestNumber] = useState("");
  const [examId, setExamId] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [student, setStudent] = useState<AcademyStudent | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);

  // Always scoped to the active academic session (no session picker on this screen)
  const effectiveSessionId = activeSessionId;

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
            Pick class and exam or test, then search and select a student to print their report
            card.
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

      <Card className="p-3 sm:p-4 shadow-sm border-border/80 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {!isParent && (
            <ClassProgramSelect
              className="w-[16.5rem] shrink-0"
              label={false}
              value={classId}
              onChange={setClassId}
              classes={classes}
              allowAll
              selectClassName="rounded-md border-input h-10"
            />
          )}

          {!isParent && (
            <select
              className={cn(filterSelectClass, "w-[10rem]")}
              value={sectionId}
              disabled={!classId || sections.length === 0}
              onChange={(e) => setSectionId(e.target.value)}
              aria-label="Section filter"
            >
              <option value="">All Sections</option>
              {sections.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.sectionName}
                </option>
              ))}
            </select>
          )}

          {kind === "test" && (
            <select
              className={cn(filterSelectClass, "w-[11rem]")}
              value={assessmentType}
              onChange={(e) => {
                setAssessmentType(e.target.value);
                setTestNumber("");
              }}
              aria-label="Test type filter"
            >
              <option value="">All types</option>
              {TEST_TYPE_KEYS.map((k) => (
                <option key={k} value={k}>
                  {assessmentTypeLabel(k)}
                </option>
              ))}
            </select>
          )}

          {kind === "test" && (
            <select
              className={cn(filterSelectClass, "w-[10rem]")}
              value={testNumber}
              disabled={!classId}
              onChange={(e) => setTestNumber(e.target.value)}
              aria-label="Test number filter"
            >
              <option value="">All tests</option>
              {testNumberOptions.map((n) => (
                <option key={n} value={n}>
                  Test No. {n}
                </option>
              ))}
            </select>
          )}

          {kind === "exam" && (
            <select
              className={cn(filterSelectClass, "min-w-[14rem] max-w-[20rem]")}
              value={examId}
              disabled={!classId}
              onChange={(e) => setExamId(e.target.value)}
              aria-label="Exam filter"
            >
              <option value="">All exams</option>
              {examOptions.map((e: Exam) => (
                <option key={e._id} value={e._id}>
                  {e.title}
                  {e.type ? ` · ${e.type}` : ""}
                </option>
              ))}
            </select>
          )}

          {!student ? (
            <PanelSearchBar
              value={studentSearch}
              onChange={setStudentSearch}
              placeholder="Search by name, roll no or registration no..."
              className="min-w-[12rem] flex-1 max-w-md"
            />
          ) : (
            <div className="flex min-w-[12rem] flex-1 max-w-xl items-center gap-2 rounded-md border border-input bg-muted/20 px-3 h-10">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate leading-tight">{student.studentName}</p>
                <p className="text-[11px] text-muted-foreground truncate leading-tight">
                  {[
                    student.studentId,
                    classNameOfStudent(student),
                    sectionNameOfStudent(student),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 shrink-0 px-2"
                onClick={clearStudent}
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Change
              </Button>
            </div>
          )}
        </div>

        {!student && (classId || studentSearch.trim().length >= 2) && (
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
