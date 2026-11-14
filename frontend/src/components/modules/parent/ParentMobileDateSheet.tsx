import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Download, UserRound } from "lucide-react";
import ParentEmptyMessage from "@/components/modules/parent/ParentEmptyMessage";
import ParentMobilePageHeader from "@/components/modules/parent/ParentMobilePageHeader";
import { ParentOptionField } from "@/components/modules/parent/ParentOptionSheet";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  fetchAssessmentDateSheet,
  fetchAssessmentDateSheetPdf,
  fetchSessions,
  type DateSheetRow,
} from "@/lib/configApi";
import { fetchStudentExamResults } from "@/lib/examApi";
import {
  assessmentTypeLabel,
  fetchAcademyStudents,
  fetchClassTests,
  resolveUploadUrl,
  type AcademyStudent,
} from "@/lib/studentManagementApi";
import { classLabel } from "@/components/modules/student-management/studentDisplayUtils";
import { cn, formatWallClock } from "@/lib/utils";

type Paper = {
  id: string;
  term: string;
  exam: string;
  subject: string;
  dateRaw: string;
  className: string;
  sectionName: string;
  classId: string;
  sectionId: string;
  assignmentId: string;
  from: string;
  to: string;
};

function refId(ref: unknown): string {
  if (!ref) return "";
  if (typeof ref === "string") return ref;
  if (typeof ref === "object" && ref !== null && "_id" in ref) return String((ref as { _id: string })._id || "");
  return "";
}

function refName(ref: unknown, key: string) {
  if (!ref || typeof ref !== "object") return "";
  const value = (ref as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function classSectionLine(className: string, sectionName: string) {
  const klass = className && className !== "—"
    ? (/^class\b/i.test(className) ? className : `Class ${className}`)
    : "";
  const section = sectionName
    ? (/^section\b/i.test(sectionName) ? sectionName : `Section ${sectionName}`)
    : "";
  return [klass, section].filter(Boolean).join(" · ");
}

function sheetDate(value?: string) {
  if (!value) return "";
  const raw = value.length >= 10 ? value.slice(0, 10) : value;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function splitClock(value?: string) {
  const text = String(value || "").trim();
  if (!text) return { from: "", to: "" };
  const parts = text.split(/\s*(?:–|—|-|to)\s*/i).filter(Boolean);
  if (parts.length >= 2) return { from: formatWallClock(parts[0]) || parts[0], to: formatWallClock(parts[1]) || parts[1] };
  return { from: formatWallClock(text) || text, to: "" };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export default function ParentMobileDateSheet() {
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
  const [draftTerm, setDraftTerm] = useState("");
  const [draftExam, setDraftExam] = useState("");
  const [appliedTerm, setAppliedTerm] = useState("");
  const [appliedExam, setAppliedExam] = useState("");
  const [downloading, setDownloading] = useState<"pdf" | "word" | null>(null);

  const { data: children = [], isLoading: childrenLoading } = useQuery({
    queryKey: ["parent-children-date-sheet", user?.id],
    queryFn: async () => {
      const { students } = await fetchAcademyStudents({ limit: 100 });
      return students as AcademyStudent[];
    },
    enabled: Boolean(user),
  });

  useEffect(() => {
    if (!children.length) return;
    if (!childId || !children.some((child) => child._id === childId)) setChildId(children[0]._id);
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
  const studentClass = selected ? classLabel(selected.classId) : "";
  const studentSection = selected ? refName(selected.sectionId, "sectionName") : "";
  const classId = selected ? refId(selected.classId) : "";
  const sectionId = selected ? refId(selected.sectionId) : "";
  const classSessionId = selected?.classId && typeof selected.classId === "object"
    ? refId((selected.classId as { sessionId?: unknown }).sessionId)
    : "";

  const { data: sessions = [] } = useQuery({
    queryKey: ["academic-sessions", "parent-date-sheet"],
    queryFn: () => fetchSessions(),
  });

  const sessionId = useMemo(() => {
    if (classSessionId) return classSessionId;
    const active = sessions.find((session) => session.isActive || session.status === "active");
    return active?._id || sessions[0]?._id || "";
  }, [classSessionId, sessions]);

  const { data: dateSheetPayload, isLoading: sheetLoading } = useQuery({
    queryKey: ["parent-date-sheet", sessionId, classId, sectionId],
    queryFn: () => fetchAssessmentDateSheet(sessionId, {
      classId: classId || undefined,
      sectionId: sectionId || undefined,
    }),
    enabled: Boolean(sessionId && classId),
    retry: false,
  });

  const { data: classTests = [] } = useQuery({
    queryKey: ["parent-class-tests-date-sheet", classId],
    queryFn: () => fetchClassTests(classId),
    enabled: Boolean(classId),
    retry: false,
  });

  const { data: examResults = [] } = useQuery({
    queryKey: ["parent-exam-results-date-sheet", childId],
    queryFn: () => fetchStudentExamResults(childId),
    enabled: Boolean(childId),
  });

  const papers = useMemo(() => {
    const list: Paper[] = [];
    const seen = new Set<string>();
    const push = (paper: Paper) => {
      if (seen.has(paper.id)) return;
      seen.add(paper.id);
      list.push(paper);
    };

    const coveredAssignments = new Set<string>();
    for (const row of (dateSheetPayload?.rows || []) as DateSheetRow[]) {
      const term = row.assessmentTypeLabel || assessmentTypeLabel(row.assessmentType) || (row.category === "exam" ? "Exam" : "Test");
      const exam = row.testName || term;
      if (row.assignmentId) coveredAssignments.add(row.assignmentId);
      push({
        id: `ds-${row.assignmentId || row.classTestId || row.examId}-${row.subjectId}-${row.examDate}`,
        term,
        exam,
        subject: row.subjectName || "Subject",
        dateRaw: row.examDate || "",
        className: row.className || studentClass,
        sectionName: row.sectionName || studentSection,
        classId: row.classId || classId,
        sectionId: row.sectionId || sectionId,
        assignmentId: row.assignmentId || "",
        from: "",
        to: "",
      });
    }

    for (const result of examResults.filter((item) => item.isPublished)) {
      const exam = result.exam;
      if (!exam || typeof exam !== "object" || !Array.isArray(exam.dateSheet)) continue;
      if (exam.assignmentId && coveredAssignments.has(exam.assignmentId)) continue;
      const term = assessmentTypeLabel(exam.type) || exam.type || "Exam";
      exam.dateSheet.forEach((row, index) => {
        const subject = typeof row.subject === "object" && row.subject
          ? row.subject.subjectName || "Subject"
          : "Subject";
        push({
          id: `exam-${result._id}-${index}`,
          term,
          exam: exam.title || term,
          subject,
          dateRaw: String(row.date || ""),
          className: studentClass,
          sectionName: studentSection,
          classId,
          sectionId,
          assignmentId: exam.assignmentId || "",
          from: "",
          to: "",
        });
      });
    }

    for (const test of classTests) {
      if (test.assignmentId && coveredAssignments.has(test.assignmentId)) continue;
      if (sectionId && test.sectionId && refId(test.sectionId) && refId(test.sectionId) !== sectionId) continue;
      const subject = typeof test.subjectId === "object" ? test.subjectId.subjectName || "Subject" : "Subject";
      const clocks = splitClock(test.testTime);
      const term = assessmentTypeLabel(test.assessmentType) || "Test";
      push({
        id: `ct-${test._id}`,
        term,
        exam: test.title || term,
        subject,
        dateRaw: test.examDate || "",
        className: studentClass,
        sectionName: studentSection,
        classId,
        sectionId,
        assignmentId: test.assignmentId || "",
        from: clocks.from,
        to: clocks.to,
      });
    }

    return list.sort((a, b) => a.dateRaw.localeCompare(b.dateRaw) || a.subject.localeCompare(b.subject));
  }, [dateSheetPayload, examResults, classTests, sectionId, classId, studentClass, studentSection]);

  const terms = useMemo(
    () => [...new Set(papers.map((paper) => paper.term))].sort((a, b) => a.localeCompare(b)),
    [papers],
  );

  const examsFor = (term: string) => [...new Set(papers.filter((paper) => paper.term === term).map((paper) => paper.exam))];

  useEffect(() => {
    if (!terms.length) return;
    const term = terms.includes(appliedTerm) ? appliedTerm : terms[0];
    const exams = examsFor(term);
    const exam = exams.includes(appliedExam) ? appliedExam : exams[0] || "";
    if (term !== appliedTerm || exam !== appliedExam) {
      setAppliedTerm(term);
      setAppliedExam(exam);
      setDraftTerm(term);
      setDraftExam(exam);
    }
  }, [terms, papers, appliedTerm, appliedExam]);

  const draftExams = examsFor(draftTerm || terms[0] || "");
  const selectedPapers = papers.filter((paper) => paper.term === appliedTerm && paper.exam === appliedExam);
  const dates = selectedPapers.map((paper) => sheetDate(paper.dateRaw)).filter(Boolean);
  const fromDate = dates[0] || "";
  const toDate = dates[dates.length - 1] || fromDate;
  const subjects = [...new Set(selectedPapers.map((paper) => paper.subject))];
  const sheetClass = classSectionLine(selectedPapers[0]?.className || studentClass, selectedPapers[0]?.sectionName || studentSection);
  const loading = childrenLoading || sheetLoading;

  const applyFilters = () => {
    setAppliedTerm(draftTerm);
    setAppliedExam(draftExam);
  };

  const downloadPdf = async () => {
    if (!sessionId || !selectedPapers.length) return;
    setDownloading("pdf");
    try {
      const assignmentId = [...new Set(selectedPapers.map((paper) => paper.assignmentId).filter(Boolean))].join(",");
      const blob = await fetchAssessmentDateSheetPdf(sessionId, {
        classId: selectedPapers[0]?.classId || undefined,
        sectionId: selectedPapers[0]?.sectionId || undefined,
        assignmentId: assignmentId || undefined,
        testName: appliedExam || undefined,
      });
      downloadBlob(blob, `date-sheet-${appliedExam || "exam"}.pdf`);
    } catch (error) {
      toast({
        title: "Could not download PDF",
        description: error instanceof Error ? error.message : "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setDownloading(null);
    }
  };

  const downloadWord = () => {
    if (!selectedPapers.length) return;
    setDownloading("word");
    const rows = selectedPapers.map((paper) => {
      const date = sheetDate(paper.dateRaw);
      return `<tr><td>${paper.subject}</td><td>${date}</td><td>${paper.from}</td><td>${paper.to}</td></tr>`;
    }).join("");
    const html = `<html><head><meta charset="utf-8"></head><body>
      <h2>${appliedTerm} · ${appliedExam}</h2>
      <p>Class: ${sheetClass}</p>
      <p>From: ${fromDate} &nbsp; To: ${toDate}</p>
      <p>Total subjects: ${subjects.length}</p>
      <table border="1" cellpadding="6" cellspacing="0">
        <tr><th>Subject</th><th>Date</th><th>From</th><th>To</th></tr>
        ${rows}
      </table>
    </body></html>`;
    downloadBlob(new Blob([html], { type: "application/msword" }), `date-sheet-${appliedExam || "exam"}.doc`);
    setDownloading(null);
  };

  return (
    <div className="min-h-full bg-white pb-8">
      <ParentMobilePageHeader title="Date Sheet" onBack={() => navigate("/panel/parent")} />

      <div className="mx-4 flex items-center gap-3 rounded-[18px] bg-[#FEF6DC] px-3.5 py-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-white text-[#D97706]">
          {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-5 w-5" strokeWidth={1.75} />}
        </span>
        <div className="min-w-0 flex-1">
          {children.length > 1 ? (
            <ParentOptionField
              sheetTitle="Child"
              value={childId}
              onChange={setChildId}
              options={children.map((child) => ({ value: child._id, label: child.studentName }))}
              valueClassName="text-[18px] font-extrabold text-[#78350F]"
            />
          ) : (
            <p className="truncate text-[18px] font-extrabold text-[#78350F]">
              {childrenLoading ? "Loading…" : selected?.studentName || "No child linked"}
            </p>
          )}
          <p className="mt-0.5 truncate text-[16px] font-bold text-[#92400E]">
            {classSectionLine(studentClass, studentSection) || "—"}
          </p>
        </div>
      </div>

      <section className="mx-4 mt-3 rounded-[22px] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
        <div className="grid grid-cols-2 gap-4">
          <ParentOptionField
            label="TERM"
            sheetTitle="Term"
            accent
            value={draftTerm}
            placeholder="No term"
            options={terms.map((term) => ({ value: term, label: term }))}
            onChange={(term) => {
              const exams = examsFor(term);
              setDraftTerm(term);
              if (!exams.includes(draftExam)) setDraftExam(exams[0] || "");
            }}
          />
          <ParentOptionField
            label="EXAM"
            sheetTitle="Exam"
            accent
            value={draftExam}
            placeholder="No exam"
            options={draftExams.map((exam) => ({ value: exam, label: exam }))}
            onChange={setDraftExam}
          />
        </div>
        <button
          type="button"
          onClick={applyFilters}
          className="mt-4 h-12 w-full rounded-full bg-[#0867cc] text-[15px] font-semibold text-white"
        >
          View Date Sheet
        </button>
      </section>

      {loading ? <div className="mx-4 mt-3 h-36 animate-pulse rounded-[22px] bg-white/70" /> : null}

      {!loading && selectedPapers.length === 0 ? (
        <ParentEmptyMessage>No date sheet is published for this exam yet.</ParentEmptyMessage>
      ) : null}

      {!loading && selectedPapers.length > 0 ? (
        <>
          <section className="mx-4 mt-3 rounded-[22px] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              <Field label="EXAM" value={`${appliedTerm} · ${appliedExam}`} />
              <Field label="CLASS" value={sheetClass || "—"} />
              <Field label="FROM DATE" value={fromDate || "—"} />
              <Field label="TO DATE" value={toDate || "—"} />
              <Field label="TOTAL SUBJECTS" value={`${subjects.length} Subject${subjects.length === 1 ? "" : "s"}`} />
              <Field label="DURATION" value={fromDate && toDate ? `${fromDate} – ${toDate}` : "—"} />
            </div>
          </section>

          <section className="mx-4 mt-3 overflow-hidden rounded-[22px] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <div className="grid grid-cols-[1.35fr_0.85fr_0.7fr_0.7fr] bg-[#F4F6F8] px-3 py-2.5 text-[11px] font-semibold tracking-wide text-[#94A3B8]">
              <span>SUBJECT</span>
              <span>DATE</span>
              <span>FROM</span>
              <span>TO</span>
            </div>
            {selectedPapers.map((paper) => {
              const date = sheetDate(paper.dateRaw);
              const [dayMonth, year] = date ? [date.replace(/ \d{4}$/, ""), date.slice(-4)] : ["—", ""];
              return (
                <div
                  key={paper.id}
                  className="grid grid-cols-[1.35fr_0.85fr_0.7fr_0.7fr] items-center border-t border-[#F1F5F9] px-3 py-3 text-[13px]"
                >
                  <span className="flex min-w-0 items-center gap-1.5 font-bold text-[#111827]">
                    <BookOpen className="h-3.5 w-3.5 shrink-0 text-[#5B6CFF]" strokeWidth={1.75} />
                    <span className="truncate">{paper.subject}</span>
                  </span>
                  <span className="leading-4 text-[#334155]">
                    <span className="block">{dayMonth}</span>
                    {year ? <span className="block">{year}</span> : null}
                  </span>
                  <span className="text-[#334155]">{paper.from}</span>
                  <span className="text-[#334155]">{paper.to}</span>
                </div>
              );
            })}
          </section>

          <div className="mx-4 mt-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => void downloadPdf()}
              disabled={downloading !== null}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#F04444] text-sm font-semibold text-white disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              {downloading === "pdf" ? "Downloading…" : "Download PDF"}
            </button>
            <button
              type="button"
              onClick={downloadWord}
              disabled={downloading !== null}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#1E4ED8] text-sm font-semibold text-white disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              {downloading === "word" ? "Downloading…" : "Download Word"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold tracking-wide text-[#A8B3C0]">{label}</p>
      <p className={cn("mt-1 text-[14px] font-bold leading-5 text-[#111827]")}>{value}</p>
    </div>
  );
}
