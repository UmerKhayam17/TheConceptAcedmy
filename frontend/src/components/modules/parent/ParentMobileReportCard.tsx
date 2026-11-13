import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, UserRound } from "lucide-react";
import { ParentOptionField } from "@/components/modules/parent/ParentOptionSheet";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { fetchResultCardPdf, fetchStudentExamResults, type ExamResult } from "@/lib/examApi";
import {
  ASSESSMENT_TYPE_LABELS,
  fetchAcademyStudents,
  fetchStudentAssessments,
  previewClassTestMarksReportPdf,
  resolveUploadUrl,
  type AcademyAssessmentRecord,
  type AcademyStudent,
} from "@/lib/studentManagementApi";
import { classLabel } from "@/components/modules/student-management/studentDisplayUtils";
import { cn } from "@/lib/utils";

type ReportRow = {
  id: string;
  kind: "exam" | "test";
  name: string;
  term: string;
  sortKey: string;
  totalMarks: number;
  obtainedMarks: number;
  percentage: number;
  grade: string;
  examResult?: ExamResult;
  assessment?: AcademyAssessmentRecord;
};

type SubjectLine = {
  name: string;
  total: number;
  obtained: number;
  grade: string;
};

function refName(ref: unknown, key: string) {
  if (!ref || typeof ref !== "object") return "";
  const value = (ref as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function classSectionLine(student: AcademyStudent) {
  const rawClass = classLabel(student.classId);
  const className = rawClass && rawClass !== "—"
    ? (/^class\b/i.test(rawClass) ? rawClass : `Class ${rawClass}`)
    : "";
  const rawSection = refName(student.sectionId, "sectionName");
  const section = rawSection
    ? (/^section\b/i.test(rawSection) ? rawSection : `Section ${rawSection}`)
    : "";
  return [className, section].filter(Boolean).join(" · ");
}

function pctToGrade(pct: number): string {
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B+";
  if (pct >= 60) return "B";
  if (pct >= 50) return "C";
  return "D";
}

function subjectMarkLabel(mark: ExamResult["subjectMarks"][number]): string {
  const subject = mark.subject;
  if (subject && typeof subject === "object" && "subjectName" in subject) {
    return String((subject as { subjectName?: string }).subjectName || "Subject");
  }
  return "Subject";
}

function examTitle(result: ExamResult): string {
  const exam = result.exam;
  if (exam && typeof exam === "object" && "title" in exam) return String(exam.title || "Exam");
  return "Exam result";
}

function examTerm(result: ExamResult): string {
  const exam = result.exam;
  if (exam && typeof exam === "object") {
    return String(exam.sessionLabel || exam.type || "Term").replace(/_/g, " ");
  }
  return "Term";
}

function subjectLinesFor(row: ReportRow): SubjectLine[] {
  if (row.kind === "exam" && row.examResult?.subjectMarks?.length) {
    return row.examResult.subjectMarks.map((mark) => {
      const pct = mark.total > 0 ? (mark.obtained / mark.total) * 100 : 0;
      return {
        name: subjectMarkLabel(mark),
        total: mark.total,
        obtained: mark.obtained,
        grade: mark.grade || pctToGrade(pct),
      };
    });
  }
  const subject =
    row.assessment &&
    typeof row.assessment.subjectId === "object" &&
    row.assessment.subjectId &&
    "subjectName" in row.assessment.subjectId
      ? String((row.assessment.subjectId as { subjectName?: string }).subjectName || row.name)
      : row.name;
  return [{
    name: subject,
    total: row.totalMarks,
    obtained: row.obtainedMarks,
    grade: row.grade,
  }];
}

export default function ParentMobileReportCard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [childId, setChildId] = useState(() => {
    try {
      return localStorage.getItem("parent_selected_student_id") || "";
    } catch {
      return "";
    }
  });
  const [term, setTerm] = useState("");
  const [examId, setExamId] = useState("");
  const [viewing, setViewing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const { data: children = [], isLoading: childrenLoading } = useQuery({
    queryKey: ["parent-children-report-cards", user?.id],
    queryFn: async () => {
      const { students } = await fetchAcademyStudents({ limit: 100 });
      return students as AcademyStudent[];
    },
    enabled: Boolean(user),
  });

  useEffect(() => {
    if (!children.length) return;
    if (!childId || !children.some((child) => child._id === childId)) {
      setChildId(children[0]._id);
    }
  }, [children, childId]);

  useEffect(() => {
    try {
      if (childId) localStorage.setItem("parent_selected_student_id", childId);
    } catch {
      /* ignore */
    }
  }, [childId]);

  const selected = children.find((child) => child._id === childId) || null;
  const photo = selected?.photoImage ? resolveUploadUrl(selected.photoImage) : "";

  const { data: results = [], isLoading: resultsLoading } = useQuery({
    queryKey: ["parent-exam-results", childId],
    queryFn: () => fetchStudentExamResults(childId),
    enabled: Boolean(childId),
  });

  const { data: assessments = [], isLoading: assessmentsLoading } = useQuery({
    queryKey: ["parent-assessments", childId],
    queryFn: () => fetchStudentAssessments(childId),
    enabled: Boolean(childId),
  });

  const reportRows = useMemo((): ReportRow[] => {
    const examRows: ReportRow[] = results
      .filter((result) => result.isPublished)
      .map((result) => {
        const end = result.exam && typeof result.exam === "object" ? String(result.exam.endDate || "") : "";
        return {
          id: `exam-${result._id}`,
          kind: "exam" as const,
          name: examTitle(result),
          term: examTerm(result),
          sortKey: end,
          totalMarks: result.totalMarks,
          obtainedMarks: result.obtainedMarks,
          percentage: Number(result.percentage) || 0,
          grade: result.grade || pctToGrade(Number(result.percentage) || 0),
          examResult: result,
        };
      });

    const testRows: ReportRow[] = (assessments as AcademyAssessmentRecord[])
      .filter((item) => item.obtainedMarks != null && item.totalMarks > 0)
      .map((item) => {
        const pct = item.totalMarks > 0 ? (item.obtainedMarks / item.totalMarks) * 100 : 0;
        const typeLabel =
          ASSESSMENT_TYPE_LABELS[item.assessmentType as keyof typeof ASSESSMENT_TYPE_LABELS] ||
          item.assessmentType?.replace(/_/g, " ") ||
          "Class test";
        return {
          id: `test-${item._id}`,
          kind: "test" as const,
          name: item.title || typeLabel,
          term: typeLabel,
          sortKey: item.examDate || "",
          totalMarks: item.totalMarks,
          obtainedMarks: item.obtainedMarks,
          percentage: pct,
          grade: pctToGrade(pct),
          assessment: item,
        };
      });

    return [...examRows, ...testRows].sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  }, [results, assessments]);

  const terms = useMemo(() => {
    const latest = new Map<string, string>();
    for (const row of reportRows) {
      const key = row.term || "Other";
      if ((latest.get(key) || "") < row.sortKey) latest.set(key, row.sortKey);
    }
    return [...latest.entries()].sort((a, b) => b[1].localeCompare(a[1])).map(([name]) => name);
  }, [reportRows]);

  useEffect(() => {
    if (!terms.length) {
      setTerm("");
      return;
    }
    if (!term || !terms.includes(term)) setTerm(terms[0]);
  }, [terms, term]);

  const exams = useMemo(
    () => reportRows.filter((row) => (row.term || "Other") === term),
    [reportRows, term],
  );

  useEffect(() => {
    if (examId && !exams.some((row) => row.id === examId)) setExamId("");
  }, [exams, examId]);

  const selectedRow = exams.find((row) => row.id === examId) || null;
  const loading = childrenLoading || resultsLoading || assessmentsLoading;
  const lines = selectedRow ? subjectLinesFor(selectedRow) : [];

  const downloadRow = async (row: ReportRow) => {
    if (!selected) return;
    setDownloading(true);
    try {
      if (row.kind === "exam" && row.examResult) {
        const blob = await fetchResultCardPdf(row.examResult._id);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `result-card-${selected.studentName.replace(/[^\w.-]+/g, "_").slice(0, 40)}.pdf`;
        link.click();
        URL.revokeObjectURL(url);
        return;
      }
      const classTest = row.assessment?.classTestId;
      const testId = typeof classTest === "object" && classTest ? classTest._id : typeof classTest === "string" ? classTest : "";
      if (!testId) throw new Error("This result does not have a downloadable card yet.");
      await previewClassTestMarksReportPdf(testId, { view: "student", studentIds: [selected._id] });
    } catch (error) {
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Could not open the result card",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  };

  const onDownload = () => {
    const row = selectedRow || reportRows.find((item) => item.kind === "exam") || reportRows[0];
    if (!row) {
      toast({ title: "No result card", description: "Published results will appear here." });
      return;
    }
    void downloadRow(row);
  };

  return (
    <div className="min-h-full bg-[#E7F3FA] pb-8">
      <header className="relative flex items-center px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => (viewing ? setViewing(false) : navigate("/panel/parent"))}
          aria-label="Back"
          className="grid h-9 w-9 place-items-center text-[#1F2937]"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2.25} />
        </button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[20px] font-extrabold tracking-tight text-[#1A1A2E]">
          Result Card
        </h1>
        <button
          type="button"
          onClick={onDownload}
          disabled={downloading || !reportRows.length}
          aria-label="Download result card"
          className="ml-auto grid h-10 w-10 place-items-center rounded-full bg-[#22C5D6] text-white shadow-sm disabled:opacity-40"
        >
          <Download className="h-[18px] w-[18px]" strokeWidth={2.25} />
        </button>
      </header>

      <div className="mx-4 flex items-center gap-3 rounded-[16px] bg-[#E5F8F4] px-3 py-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-white text-[#B0B8C4]">
          {photo ? (
            <img src={photo} alt="" className="h-full w-full object-cover" />
          ) : (
            <UserRound className="h-5 w-5" strokeWidth={1.75} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          {children.length > 1 && !viewing ? (
            <ParentOptionField
              sheetTitle="Child"
              value={childId}
              valueClassName="text-[16px] text-[#1A1A1A]"
              options={children.map((child) => ({ value: child._id, label: child.studentName }))}
              onChange={(id) => {
                setChildId(id);
                setExamId("");
                setViewing(false);
              }}
            />
          ) : (
            <p className="truncate text-[16px] font-bold text-[#1A1A1A]">
              {childrenLoading ? "Loading…" : selected?.studentName || "No child linked"}
            </p>
          )}
          <p className="truncate text-[13px] font-medium text-[#22C5D6]">
            {selected ? classSectionLine(selected) || "—" : "—"}
          </p>
        </div>
      </div>

      {viewing && selectedRow ? (
        <section className="mx-4 mt-4 overflow-hidden rounded-[22px] bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#94A3B8]">{selectedRow.term}</p>
          <h2 className="mt-1 text-[17px] font-bold text-[#1A1A2E]">{selectedRow.name}</h2>
          <ul className="mt-3">
            {lines.map((line, index) => (
              <li
                key={`${line.name}-${index}`}
                className={cn("flex items-center gap-3 py-3", index > 0 && "border-t border-[#F1F5F9]")}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-[#1F2937]">{line.name}</span>
                  <span className="mt-0.5 block text-[12px] text-[#94A3B8]">
                    {line.obtained} / {line.total}
                  </span>
                </span>
                <span className="text-[14px] font-bold text-[#0F766E]">{line.grade}</span>
              </li>
            ))}
          </ul>
          <div className="mt-1 grid grid-cols-3 rounded-2xl bg-[#E7F6FB] px-2 py-3 text-center">
            <div>
              <p className="text-[11px] text-[#64748B]">Obtained</p>
              <p className="mt-0.5 text-[15px] font-bold text-[#1A1A2E]">
                {selectedRow.obtainedMarks}/{selectedRow.totalMarks}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[#64748B]">Percentage</p>
              <p className="mt-0.5 text-[15px] font-bold text-[#1A1A2E]">{Math.round(selectedRow.percentage)}%</p>
            </div>
            <div>
              <p className="text-[11px] text-[#64748B]">Grade</p>
              <p className="mt-0.5 text-[15px] font-bold text-[#1A1A2E]">{selectedRow.grade}</p>
            </div>
          </div>
        </section>
      ) : (
        <section className="mx-4 mt-4 rounded-[22px] bg-white px-4 pb-4 pt-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
          <div className="grid grid-cols-2 gap-4">
            <ParentOptionField
              label="TERM"
              sheetTitle="Term"
              value={term}
              placeholder={loading ? "Loading…" : "No term yet"}
              options={terms.map((item) => ({ value: item, label: item }))}
              onChange={(next) => {
                setTerm(next);
                setExamId("");
              }}
            />
            <ParentOptionField
              label="EXAM NAME"
              sheetTitle="Exam name"
              value={examId}
              placeholder={loading ? "Loading…" : "No exam yet"}
              options={exams.map((row) => ({ value: row.id, label: row.name }))}
              onChange={setExamId}
            />
          </div>

          <button
            type="button"
            disabled={!selectedRow}
            onClick={() => setViewing(true)}
            className="mt-5 h-[52px] w-full rounded-full bg-[#67DCEA] text-[16px] font-semibold text-white disabled:opacity-50"
          >
            View Results
          </button>
          {!loading && selected && reportRows.length === 0 ? (
            <p className="mt-3 text-center text-[12px] text-[#94A3B8]">
              Published exam and test results for this child will show here.
            </p>
          ) : null}
        </section>
      )}
    </div>
  );
}
