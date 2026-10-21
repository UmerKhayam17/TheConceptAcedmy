import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Eye,
  FileBadge,
  Loader2,
  Percent,
  Printer,
  Users,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import type { Role } from "@/lib/auth";
import type { ModuleActionCaps } from "@/lib/permissions";
import { fetchSessions } from "@/lib/configApi";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import PanelStatCard from "@/components/modules/PanelStatCard";
import {
  assessmentTypeLabel,
  fetchClassTestEntry,
  fetchClassTests,
  formatClassTestSchedule,
  previewClassTestMarksReportPdf,
  printClassTestMarksReportPdf,
  type AcademyClassTest,
  type ClassTestEntryRow,
} from "@/lib/studentManagementApi";
import {
  fetchExam,
  fetchExamResults,
  previewExamMarksReportPdf,
  previewResultCardPdf,
  printResultCardPdf,
  type ExamResult,
} from "@/lib/examApi";
import { matchesPanelSearch } from "@/lib/panelSearch";
import { cn } from "@/lib/utils";

function idOf(ref: string | { _id: string } | undefined | null): string {
  if (!ref) return "";
  return typeof ref === "object" ? String(ref._id) : String(ref);
}

function testSubjectName(test: AcademyClassTest) {
  const s = test.subjectId;
  return typeof s === "object" && s ? s.subjectName || s.subjectCode || "—" : "—";
}

function normalizeTestLabel(value: string | undefined | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[#.]/g, " ")
    .replace(/\s+/g, " ");
}

function testBatchKey(test: AcademyClassTest) {
  const title = normalizeTestLabel(test.title);
  const series = normalizeTestLabel(test.seriesLabel);
  const numbered =
    title.match(/\btest\s*(?:no|number)?\s*(\d+)\b/) ||
    series.match(/\btest\s*(?:no|number)?\s*(\d+)\b/);
  if (numbered) return `test-no-${numbered[1]}`;
  if (series && test.occurrenceIndex != null) {
    return `${series}::occ-${test.occurrenceIndex}`;
  }
  return title || series || test._id;
}

function testBatchGroupKey(test: AcademyClassTest) {
  return [
    idOf(test.classId),
    idOf(test.sectionId) || "all",
    idOf(test.disciplineId) || "all",
    testBatchKey(test),
  ].join("|");
}

function reportPct(obtained: number, total: number) {
  if (!total || total <= 0) return 0;
  return Math.round((obtained / total) * 1000) / 10;
}

function reportLetterGrade(pct: number) {
  if (pct >= 95) return "A+";
  if (pct >= 85) return "A";
  if (pct >= 75) return "B";
  if (pct >= 60) return "C";
  if (pct >= 50) return "D";
  return "F";
}

function reportOverallResult(pct: number) {
  return pct < 50 ? "Fail" : "Pass";
}

const tableHeadClass = "p-3 font-medium text-slate-600 text-left";
const tableCellClass = "p-3 border-t border-slate-100";

type TestStudentListRow = ClassTestEntryRow & {
  obtainedTotal: number;
  marksTotal: number;
  subjectMarkCount: number;
};

export default function ReportCardDetailPage({
  kind,
  id,
  role: _role,
  caps: _caps,
}: {
  kind: "test" | "exam";
  id: string;
  role: Role;
  caps: ModuleActionCaps;
}) {
  const { toast } = useToast();
  const [studentSearch, setStudentSearch] = useState("");
  const [printingId, setPrintingId] = useState<string | null>(null);

  const { data: sessions = [] } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: () => fetchSessions(),
  });
  const sessionId = useMemo(
    () => sessions.find((s) => s.isActive)?._id || sessions[0]?._id || "",
    [sessions]
  );

  const primaryTestQ = useQuery({
    queryKey: ["class-test-entry", id, "report-card-detail"],
    queryFn: () => fetchClassTestEntry(id),
    enabled: kind === "test" && Boolean(id),
  });

  const peerTestsQ = useQuery({
    queryKey: ["report-card-peer-tests", id, sessionId],
    queryFn: async () => {
      const primary = primaryTestQ.data?.test;
      if (!primary) return [] as { test: AcademyClassTest; entry: Awaited<ReturnType<typeof fetchClassTestEntry>> }[];
      const classId = idOf(primary.classId);
      const batchKey = testBatchGroupKey(primary);
      let tests = await fetchClassTests(classId || undefined, undefined, sessionId);
      tests = tests.filter((t) => testBatchGroupKey(t) === batchKey);
      const rows = await Promise.all(
        tests.map(async (test) => {
          try {
            const entry = await fetchClassTestEntry(test._id);
            return { test, entry };
          } catch {
            return null;
          }
        })
      );
      return rows.filter((r): r is NonNullable<typeof r> => Boolean(r));
    },
    enabled: kind === "test" && Boolean(primaryTestQ.data?.test) && Boolean(sessionId),
  });

  const examQ = useQuery({
    queryKey: ["exam", id, "report-card-detail"],
    queryFn: () => fetchExam(id),
    enabled: kind === "exam" && Boolean(id),
  });

  const examResultsQ = useQuery({
    queryKey: ["exam-results", id, "report-card-detail"],
    queryFn: async () => {
      const results = await fetchExamResults(id);
      return (results || []).filter((r) => r.isPublished);
    },
    enabled: kind === "exam" && Boolean(id),
  });

  const subjectNames = useMemo(() => {
    if (kind !== "test") return [];
    return (peerTestsQ.data || [])
      .map((r) => testSubjectName(r.test))
      .filter((n) => n && n !== "—")
      .sort((a, b) => a.localeCompare(b));
  }, [kind, peerTestsQ.data]);

  const headingTitle = useMemo(() => {
    if (kind === "test") {
      const test = primaryTestQ.data?.test;
      if (!test) return "Report Card";
      if (test.occurrenceIndex != null) return `Test ${test.occurrenceIndex}`;
      return test.title || "Report Card";
    }
    return examQ.data?.title || "Report Card";
  }, [kind, primaryTestQ.data, examQ.data]);

  const headingMeta = useMemo(() => {
    if (kind === "test") {
      const test = primaryTestQ.data?.test;
      if (!test) return "";
      const typeLabel =
        assessmentTypeLabel(test.assessmentType) || test.assessmentType || "";
      const subjects = subjectNames.join(", ") || testSubjectName(test);
      return [typeLabel, subjects].filter(Boolean).join(" · ");
    }
    if (!examQ.data) return "";
    return [examQ.data.type, examQ.data.sessionLabel].filter(Boolean).join(" · ");
  }, [kind, primaryTestQ.data, subjectNames, examQ.data]);

  const allTestStudents = useMemo((): TestStudentListRow[] => {
    if (kind !== "test") return [];
    type Acc = {
      row: ClassTestEntryRow;
      obtainedTotal: number;
      marksTotal: number;
      subjectMarkCount: number;
    };
    const byStudent = new Map<string, Acc>();
    const addRow = (row: ClassTestEntryRow) => {
      if (!row.assessment) return;
      const sid = String(row.student._id);
      const obtained = Number(row.assessment.obtainedMarks) || 0;
      const total = Number(row.assessment.totalMarks) || 0;
      const prev = byStudent.get(sid);
      if (!prev) {
        byStudent.set(sid, {
          row,
          obtainedTotal: obtained,
          marksTotal: total,
          subjectMarkCount: 1,
        });
        return;
      }
      prev.obtainedTotal += obtained;
      prev.marksTotal += total;
      prev.subjectMarkCount += 1;
    };

    const peers = peerTestsQ.data || [];
    if (peers.length) {
      peers.forEach((p) => (p.entry.students || []).forEach(addRow));
    } else {
      (primaryTestQ.data?.students || []).forEach(addRow);
    }

    return [...byStudent.values()].map((a) => ({
      ...a.row,
      obtainedTotal: a.obtainedTotal,
      marksTotal: a.marksTotal,
      subjectMarkCount: a.subjectMarkCount,
    }));
  }, [kind, peerTestsQ.data, primaryTestQ.data]);

  const testStudents = useMemo(() => {
    if (!studentSearch.trim()) return allTestStudents;
    return allTestStudents.filter((r) =>
      matchesPanelSearch(
        studentSearch,
        r.student.studentName,
        r.student.studentId,
        r.student.fatherName,
        r.student.rollNumber,
        r.student.phone,
        r.student.contactPhoneRes
      )
    );
  }, [allTestStudents, studentSearch]);

  const allExamStudents = useMemo(
    () => (kind === "exam" ? examResultsQ.data || [] : ([] as ExamResult[])),
    [kind, examResultsQ.data]
  );

  const examStudents = useMemo(() => {
    if (!studentSearch.trim()) return allExamStudents;
    return allExamStudents.filter((r) =>
      matchesPanelSearch(
        studentSearch,
        r.academyStudent?.studentName,
        r.academyStudent?.studentId,
        r.academyStudent?.fatherName,
        r.academyStudent?.rollNumber,
        r.academyStudent?.phone,
        r.academyStudent?.contactPhoneRes
      )
    );
  }, [allExamStudents, studentSearch]);

  const stats = useMemo(() => {
    if (kind === "test") {
      const total = allTestStudents.length;
      let passed = 0;
      let pctSum = 0;
      allTestStudents.forEach((row) => {
        const pct = reportPct(row.obtainedTotal, row.marksTotal);
        pctSum += pct;
        if (reportOverallResult(pct) === "Pass") passed += 1;
      });
      return {
        total,
        passed,
        failed: Math.max(0, total - passed),
        avgPct: total ? Math.round((pctSum / total) * 10) / 10 : 0,
      };
    }
    const total = allExamStudents.length;
    let passed = 0;
    let pctSum = 0;
    allExamStudents.forEach((r) => {
      const obtained = Number(r.obtainedMarks) || 0;
      const marks = Number(r.totalMarks) || 0;
      const pct =
        r.percentage != null
          ? Math.round(Number(r.percentage) * 10) / 10
          : reportPct(obtained, marks);
      pctSum += pct;
      if (reportOverallResult(pct) === "Pass") passed += 1;
    });
    return {
      total,
      passed,
      failed: Math.max(0, total - passed),
      avgPct: total ? Math.round((pctSum / total) * 10) / 10 : 0,
    };
  }, [kind, allTestStudents, allExamStudents]);

  const studentsLoading =
    kind === "test"
      ? primaryTestQ.isLoading || peerTestsQ.isLoading
      : examQ.isLoading || examResultsQ.isLoading;

  const openExamCard = async (result: ExamResult, mode: "view" | "print") => {
    setPrintingId(`${mode}:${result._id}`);
    try {
      if (!result.isPublished) throw new Error("Exam result is not published yet");
      if (mode === "print") await printResultCardPdf(result._id);
      else await previewResultCardPdf(result._id);
    } catch (err) {
      toast({
        title: mode === "print" ? "Print failed" : "View failed",
        description: err instanceof Error ? err.message : "Could not open PDF",
        variant: "destructive",
      });
    } finally {
      setPrintingId(null);
    }
  };

  const openTestCard = async (studentId: string, mode: "view" | "print") => {
    setPrintingId(`${mode}:${studentId}`);
    const open =
      mode === "print" ? printClassTestMarksReportPdf : previewClassTestMarksReportPdf;
    try {
      await open(id, { view: "student", studentIds: [studentId] });
    } catch {
      try {
        await open(id, { view: "test", studentIds: [studentId] });
      } catch (err2) {
        toast({
          title: mode === "print" ? "Print failed" : "View failed",
          description: err2 instanceof Error ? err2.message : "Could not open PDF",
          variant: "destructive",
        });
      }
    } finally {
      setPrintingId(null);
    }
  };

  const printAll = async () => {
    setPrintingId("all");
    try {
      if (kind === "test") {
        const ids = testStudents.map((r) => r.student._id);
        try {
          await previewClassTestMarksReportPdf(id, {
            view: "student",
            studentIds: ids.length ? ids : undefined,
          });
        } catch {
          await previewClassTestMarksReportPdf(id, { view: "test" });
        }
      } else {
        await previewExamMarksReportPdf(id, { view: "student" });
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

  const scheduleLine =
    kind === "test" && primaryTestQ.data?.test
      ? formatClassTestSchedule(primaryTestQ.data.test)
      : kind === "exam" && examQ.data?.startDate
        ? new Date(examQ.data.startDate).toLocaleDateString()
        : "";

  const listCount = kind === "test" ? testStudents.length : examStudents.length;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
              <FileBadge className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {kind === "test" ? (
                  <Badge variant="secondary" className="text-[10px]">
                    Class test
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">
                    Term exam
                  </Badge>
                )}
              </div>
              <h2 className="mt-0.5 text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight truncate">
                {headingTitle}
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500 line-clamp-2 max-w-2xl">
                {[headingMeta, scheduleLine].filter(Boolean).join(" · ") ||
                  "View or print individual report cards, or open all at once."}
              </p>
            </div>
          </div>
          <div className="shrink-0 rounded-lg bg-primary/10 px-3 py-2 max-w-[14rem]">
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
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <PanelStatCard
          label="Students"
          value={studentsLoading ? "…" : stats.total}
          hint="With recorded results"
          icon={Users}
          iconWrapClass="bg-[#dbeafe]"
          iconClass="text-[#2563eb]"
        />
        <PanelStatCard
          label="Passed"
          value={studentsLoading ? "…" : stats.passed}
          hint={stats.total ? `${Math.round((stats.passed / stats.total) * 100)}% of class` : "—"}
          icon={CheckCircle2}
          iconWrapClass="bg-[#d1fae5]"
          iconClass="text-[#059669]"
        />
        <PanelStatCard
          label="Failed"
          value={studentsLoading ? "…" : stats.failed}
          hint={stats.total ? `${Math.round((stats.failed / stats.total) * 100)}% of class` : "—"}
          icon={XCircle}
          iconWrapClass="bg-[#fee2e2]"
          iconClass="text-[#dc2626]"
        />
        <PanelStatCard
          label="Class average"
          value={studentsLoading ? "…" : `${stats.avgPct}%`}
          hint="Across all students"
          icon={Percent}
          iconWrapClass="bg-[#ffedd5]"
          iconClass="text-[#ea580c]"
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <PanelSearchBar
            value={studentSearch}
            onChange={setStudentSearch}
            placeholder="Search by name, roll no…"
            className="min-w-[12rem] flex-1 max-w-md"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-10 gap-1.5 ml-auto"
            disabled={printingId === "all" || listCount === 0}
            onClick={() => void printAll()}
          >
            {printingId === "all" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Printer className="h-3.5 w-3.5" />
            )}
            Print all
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-[#1a2b4b]">Student report cards</p>
            <p className="text-xs text-slate-500">
              {studentsLoading
                ? "Loading students…"
                : `${listCount} student${listCount === 1 ? "" : "s"}${studentSearch.trim() ? " matching search" : " ready to view or print"
                }.`}
            </p>
          </div>
          {studentsLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        {kind === "test" && !studentsLoading && testStudents.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground">
            {studentSearch.trim()
              ? "No students with marks match the current search."
              : "No students with recorded marks for this assessment."}
          </p>
        )}

        {kind === "exam" && !studentsLoading && examStudents.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground">
            {studentSearch.trim()
              ? "No published results match the current search."
              : "No published results for this exam yet."}
          </p>
        )}

        {kind === "test" && testStudents.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[920px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className={cn(tableHeadClass, "w-10")}>#</th>
                  <th className={tableHeadClass}>Student name</th>
                  <th className={tableHeadClass}>Father name</th>
                  <th className={tableHeadClass}>Roll no.</th>
                  <th className={tableHeadClass}>Student ID</th>
                  <th className={tableHeadClass}>Total marks</th>
                  <th className={tableHeadClass}>%age</th>
                  <th className={tableHeadClass}>Grade</th>
                  <th className={tableHeadClass}>Result</th>
                  <th className={cn(tableHeadClass, "text-right")}>Action</th>
                </tr>
              </thead>
              <tbody>
                {testStudents.map((row, idx) => {
                  const viewing = printingId === `view:${row.student._id}`;
                  const printing = printingId === `print:${row.student._id}`;
                  const busy = viewing || printing;
                  const obtained = row.obtainedTotal;
                  const total = row.marksTotal;
                  const pct = reportPct(obtained, total);
                  const grade = reportLetterGrade(pct);
                  const result = reportOverallResult(pct);
                  const fail = result === "Fail";
                  return (
                    <tr key={row.student._id} className="hover:bg-slate-50/60">
                      <td className={cn(tableCellClass, "tabular-nums text-muted-foreground")}>
                        {idx + 1}
                      </td>
                      <td
                        className={cn(
                          tableCellClass,
                          "font-medium text-[#1a2b4b] whitespace-nowrap"
                        )}
                      >
                        {row.student.studentName || "—"}
                      </td>
                      <td className={cn(tableCellClass, "text-muted-foreground whitespace-nowrap")}>
                        {row.student.fatherName || "—"}
                      </td>
                      <td
                        className={cn(
                          tableCellClass,
                          "tabular-nums text-muted-foreground whitespace-nowrap"
                        )}
                      >
                        {row.student.rollNumber || "—"}
                      </td>
                      <td
                        className={cn(
                          tableCellClass,
                          "tabular-nums text-muted-foreground whitespace-nowrap"
                        )}
                      >
                        {row.student.studentId || "—"}
                      </td>
                      <td className={cn(tableCellClass, "tabular-nums whitespace-nowrap")}>
                        <span className="font-medium">
                          {obtained}/{total}
                        </span>
                        {row.subjectMarkCount > 1 && (
                          <span className="ml-1.5 text-[11px] text-muted-foreground">
                            ({row.subjectMarkCount} subj.)
                          </span>
                        )}
                      </td>
                      <td className={cn(tableCellClass, "tabular-nums")}>{pct}%</td>
                      <td className={cn(tableCellClass, "font-medium")}>{grade}</td>
                      <td className={tableCellClass}>
                        <Badge
                          variant={fail ? "destructive" : "secondary"}
                          className="text-[10px]"
                        >
                          {result}
                        </Badge>
                      </td>
                      <td className={cn(tableCellClass, "text-right")}>
                        <div className="inline-flex items-center justify-end gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                            disabled={busy}
                            aria-label="View report card"
                            title="View"
                            onClick={() => void openTestCard(row.student._id, "view")}
                          >
                            {viewing ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            disabled={busy}
                            aria-label="Print report card"
                            title="Print"
                            onClick={() => void openTestCard(row.student._id, "print")}
                          >
                            {printing ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Printer className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {kind === "exam" && examStudents.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[920px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className={cn(tableHeadClass, "w-10")}>#</th>
                  <th className={tableHeadClass}>Student name</th>
                  <th className={tableHeadClass}>Father name</th>
                  <th className={tableHeadClass}>Roll no.</th>
                  <th className={tableHeadClass}>Student ID</th>
                  <th className={tableHeadClass}>Total marks</th>
                  <th className={tableHeadClass}>%age</th>
                  <th className={tableHeadClass}>Grade</th>
                  <th className={tableHeadClass}>Result</th>
                  <th className={cn(tableHeadClass, "text-right")}>Action</th>
                </tr>
              </thead>
              <tbody>
                {examStudents.map((r, idx) => {
                  const viewing = printingId === `view:${r._id}`;
                  const printing = printingId === `print:${r._id}`;
                  const busy = viewing || printing;
                  const obtained = Number(r.obtainedMarks) || 0;
                  const total = Number(r.totalMarks) || 0;
                  const pct =
                    r.percentage != null
                      ? Math.round(Number(r.percentage) * 10) / 10
                      : reportPct(obtained, total);
                  const grade = r.grade || reportLetterGrade(pct);
                  const result = reportOverallResult(pct);
                  const fail = result === "Fail";
                  return (
                    <tr key={r._id} className="hover:bg-slate-50/60">
                      <td className={cn(tableCellClass, "tabular-nums text-muted-foreground")}>
                        {idx + 1}
                      </td>
                      <td
                        className={cn(
                          tableCellClass,
                          "font-medium text-[#1a2b4b] whitespace-nowrap"
                        )}
                      >
                        {r.academyStudent?.studentName || "—"}
                      </td>
                      <td className={cn(tableCellClass, "text-muted-foreground whitespace-nowrap")}>
                        {r.academyStudent?.fatherName || "—"}
                      </td>
                      <td
                        className={cn(
                          tableCellClass,
                          "tabular-nums text-muted-foreground whitespace-nowrap"
                        )}
                      >
                        {r.academyStudent?.rollNumber || "—"}
                      </td>
                      <td
                        className={cn(
                          tableCellClass,
                          "tabular-nums text-muted-foreground whitespace-nowrap"
                        )}
                      >
                        {r.academyStudent?.studentId || "—"}
                      </td>
                      <td
                        className={cn(
                          tableCellClass,
                          "tabular-nums font-medium whitespace-nowrap"
                        )}
                      >
                        {obtained}/{total}
                      </td>
                      <td className={cn(tableCellClass, "tabular-nums")}>{pct}%</td>
                      <td className={cn(tableCellClass, "font-medium")}>{grade}</td>
                      <td className={tableCellClass}>
                        <Badge
                          variant={fail ? "destructive" : "secondary"}
                          className="text-[10px]"
                        >
                          {result}
                        </Badge>
                      </td>
                      <td className={cn(tableCellClass, "text-right")}>
                        <div className="inline-flex items-center justify-end gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                            disabled={busy}
                            aria-label="View report card"
                            title="View"
                            onClick={() => void openExamCard(r, "view")}
                          >
                            {viewing ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            disabled={busy}
                            aria-label="Print report card"
                            title="Print"
                            onClick={() => void openExamCard(r, "print")}
                          >
                            {printing ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Printer className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
