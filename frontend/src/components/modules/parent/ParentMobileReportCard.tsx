import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, UserRound } from "lucide-react";
import ParentEmptyMessage from "@/components/modules/parent/ParentEmptyMessage";
import ParentMobilePageHeader from "@/components/modules/parent/ParentMobilePageHeader";
import { ParentOptionField } from "@/components/modules/parent/ParentOptionSheet";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { fetchResultCardPdf, fetchStudentExamResults, type ExamResult } from "@/lib/examApi";
import {
  ASSESSMENT_TYPE_LABELS,
  fetchAcademyStudents,
  fetchClassTestMarksReportPdf,
  fetchStudentAssessments,
  resolveUploadUrl,
  type AcademyAssessmentRecord,
  type AcademyStudent,
} from "@/lib/studentManagementApi";
import { downloadBlobFile } from "@/lib/downloadFile";
import { classLabel } from "@/components/modules/student-management/studentDisplayUtils";
import { cn } from "@/lib/utils";

type ReportKind = "test" | "exam";

/** Same two groups as the admin Report Cards page: Class Tests and Exams. */
const KIND_OPTIONS: { value: ReportKind; label: string }[] = [
  { value: "test", label: "Test" },
  { value: "exam", label: "Exam" },
];

type ReportRow = {
  id: string;
  kind: ReportKind;
  /** e.g. "Test 1" or the exam title — what the admin list shows in its first column. */
  name: string;
  /** e.g. "Weekly Test" or "Mid Term" — the admin "Type" column. */
  typeLabel: string;
  sortKey: string;
  totalMarks: number;
  obtainedMarks: number;
  percentage: number;
  grade: string;
  examResult?: ExamResult;
  /** All subject papers of one test (admin groups them into one row). */
  assessments?: AcademyAssessmentRecord[];
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

function examTypeLabel(result: ExamResult): string {
  const exam = result.exam;
  if (exam && typeof exam === "object" && exam.type) return String(exam.type).replace(/_/g, " ");
  return "Exam";
}

function assessmentTypeName(type?: string): string {
  return (
    ASSESSMENT_TYPE_LABELS[type as keyof typeof ASSESSMENT_TYPE_LABELS] ||
    type?.replace(/_/g, " ") ||
    "Class test"
  );
}

type ClassTestRef = Exclude<AcademyAssessmentRecord["classTestId"], string | undefined>;

function classTestOf(item: AcademyAssessmentRecord): ClassTestRef | null {
  return item.classTestId && typeof item.classTestId === "object" ? item.classTestId : null;
}

function normalizeTestLabel(value?: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[#.]/g, " ")
    .replace(/\s+/g, " ");
}

/** Same grouping as the admin Report Cards page: "Test No. 1" Chemistry + Biology = one test. */
function testBatchKey(item: AcademyAssessmentRecord): string {
  const test = classTestOf(item);
  const title = normalizeTestLabel(test?.title || item.title);
  const series = normalizeTestLabel(test?.seriesLabel);
  const numbered =
    title.match(/\btest\s*(?:no|number)?\s*(\d+)\b/) ||
    series.match(/\btest\s*(?:no|number)?\s*(\d+)\b/);
  if (numbered) return `test-no-${numbered[1]}`;
  if (series && test?.occurrenceIndex != null) return `${series}::occ-${test.occurrenceIndex}`;
  return title || series || test?._id || item._id;
}

function testBatchName(item: AcademyAssessmentRecord): string {
  const test = classTestOf(item);
  if (test?.occurrenceIndex != null) return `Test ${test.occurrenceIndex}`;
  return test?.title || item.title || assessmentTypeName(item.assessmentType);
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
  return (row.assessments || []).map((item) => {
    const pct = item.totalMarks > 0 ? (item.obtainedMarks / item.totalMarks) * 100 : 0;
    const subject =
      typeof item.subjectId === "object" && item.subjectId && "subjectName" in item.subjectId
        ? String((item.subjectId as { subjectName?: string }).subjectName || item.title)
        : item.title || row.name;
    return {
      name: subject,
      total: item.totalMarks,
      obtained: item.obtainedMarks,
      grade: pctToGrade(pct),
    };
  });
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
  const [kind, setKind] = useState<ReportKind | "">("");
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
          typeLabel: examTypeLabel(result),
          sortKey: end,
          totalMarks: result.totalMarks,
          obtainedMarks: result.obtainedMarks,
          percentage: Number(result.percentage) || 0,
          grade: result.grade || pctToGrade(Number(result.percentage) || 0),
          examResult: result,
        };
      });

    // One row per test, with every subject paper of that test inside it (like admin).
    const batches = new Map<string, AcademyAssessmentRecord[]>();
    for (const item of assessments as AcademyAssessmentRecord[]) {
      if (item.obtainedMarks == null || !(item.totalMarks > 0)) continue;
      const key = testBatchKey(item);
      batches.set(key, [...(batches.get(key) || []), item]);
    }
    const testRows: ReportRow[] = [...batches.entries()].map(([key, group]) => {
      const byDate = [...group].sort((a, b) => (a.examDate || "").localeCompare(b.examDate || ""));
      const primary = byDate[0];
      const totalMarks = group.reduce((sum, item) => sum + item.totalMarks, 0);
      const obtainedMarks = group.reduce((sum, item) => sum + (Number(item.obtainedMarks) || 0), 0);
      const pct = totalMarks > 0 ? (obtainedMarks / totalMarks) * 100 : 0;
      return {
        id: `test-${key}`,
        kind: "test" as const,
        name: testBatchName(primary),
        typeLabel: assessmentTypeName(primary.assessmentType),
        sortKey: byDate[byDate.length - 1].examDate || "",
        totalMarks,
        obtainedMarks,
        percentage: pct,
        grade: pctToGrade(pct),
        assessments: byDate,
      };
    });

    return [...examRows, ...testRows].sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  }, [results, assessments]);

  /** Only offer Test / Exam when this child has published results of that kind. */
  const kindOptions = useMemo(
    () => KIND_OPTIONS.filter((option) => reportRows.some((row) => row.kind === option.value)),
    [reportRows],
  );

  useEffect(() => {
    if (!kindOptions.length) {
      setKind("");
      return;
    }
    if (!kind || !kindOptions.some((option) => option.value === kind)) setKind(kindOptions[0].value);
  }, [kindOptions, kind]);

  const exams = useMemo(() => reportRows.filter((row) => row.kind === kind), [reportRows, kind]);

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
      const safeName = selected.studentName.replace(/[^\w.-]+/g, "_").slice(0, 40) || "student";
      if (row.kind === "exam" && row.examResult) {
        const blob = await fetchResultCardPdf(row.examResult._id);
        await downloadBlobFile(blob, `result-card-${safeName}.pdf`);
        toast({ title: "Downloaded", description: "Result PDF saved." });
        return;
      }
      const classTest = row.assessments?.[0]?.classTestId;
      const testId = typeof classTest === "object" && classTest ? classTest._id : typeof classTest === "string" ? classTest : "";
      if (!testId) throw new Error("This result does not have a downloadable card yet.");
      const blob = await fetchClassTestMarksReportPdf(testId, {
        view: "student",
        studentIds: [selected._id],
      });
      await downloadBlobFile(blob, `result-card-${safeName}.pdf`);
      toast({ title: "Downloaded", description: "Result PDF saved." });
    } catch (error) {
      // User cancelled the native share sheet — not a failure.
      const message = error instanceof Error ? error.message : String(error || "");
      if (/cancel|dismiss|abort/i.test(message)) return;
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Could not download the result card",
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
    <div className="min-h-full bg-white pb-8">
      <ParentMobilePageHeader
        title="Result Card"
        onBack={() => (viewing ? setViewing(false) : navigate("/panel/parent"))}
        trailing={
          <button
            type="button"
            onClick={onDownload}
            disabled={downloading || !reportRows.length}
            aria-label="Download result card"
            className="grid h-10 w-10 place-items-center rounded-full bg-[#22C5D6] text-white shadow-sm disabled:opacity-40"
          >
            <Download className="h-[18px] w-[18px]" strokeWidth={2.25} />
          </button>
        }
      />

      <div className="mx-4 flex items-center gap-3 rounded-[16px] bg-[#FEF6DC] px-3 py-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-white text-[#D97706]">
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
              valueClassName="text-[18px] font-extrabold text-[#78350F]"
              options={children.map((child) => ({ value: child._id, label: child.studentName }))}
              onChange={(id) => {
                setChildId(id);
                setExamId("");
                setViewing(false);
              }}
            />
          ) : (
            <p className="truncate text-[18px] font-extrabold text-[#78350F]">
              {childrenLoading ? "Loading…" : selected?.studentName || "No child linked"}
            </p>
          )}
          <p className="mt-0.5 truncate text-[16px] font-bold text-[#92400E]">
            {selected ? classSectionLine(selected) || "—" : "—"}
          </p>
        </div>
      </div>

      {viewing && selectedRow ? (
        <section className="mx-4 mt-4 overflow-hidden rounded-[22px] bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#94A3B8]">{selectedRow.typeLabel}</p>
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
          <div className="mt-1 grid grid-cols-3 rounded-2xl bg-[#F4F6F8] px-2 py-3 text-center">
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
              label="ASSESSMENT TYPE"
              sheetTitle="Assessment type"
              value={kind}
              placeholder={loading ? "Loading…" : "No results yet"}
              options={kindOptions}
              onChange={(next) => {
                setKind(next as ReportKind);
                setExamId("");
              }}
            />
            <ParentOptionField
              label={kind === "test" ? "TEST NAME" : "EXAM NAME"}
              sheetTitle={kind === "test" ? "Test name" : "Exam name"}
              value={examId}
              placeholder={loading ? "Loading…" : kind === "test" ? "Select test" : "Select exam"}
              options={exams.map((row) => ({ value: row.id, label: `${row.name} · ${row.typeLabel}` }))}
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
            <ParentEmptyMessage className="min-h-[36vh]">
              No published results for this child yet.
            </ParentEmptyMessage>
          ) : null}
        </section>
      )}
    </div>
  );
}
