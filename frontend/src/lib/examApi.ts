import { getApiRoot, parseJson } from "@/lib/api";
import { authedFetch } from "@/lib/auth";
import type { CreatedByUser } from "@/lib/createdBy";
import type { AcademyClass, AcademySubject } from "@/lib/studentManagementApi";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authedFetch(path, init);
  const body = await parseJson<{ success?: boolean; data?: T; message?: string }>(res);
  if (!res.ok) throw new Error(body.message || `Request failed (${res.status})`);
  return body.data as T;
}

export type ExamStatus = "scheduled" | "ongoing" | "completed" | "cancelled";

export interface Exam {
  _id: string;
  title: string;
  type: string;
  academyClass: string | AcademyClass;
  sessionLabel?: string;
  startDate: string;
  endDate: string;
  status: ExamStatus;
  /** Set when this exam was published from the assessment catalog. */
  assignmentId?: string;
  dateSheet?: {
    subject?: string | AcademySubject;
    date?: string;
    totalMarks?: number;
    syllabus?: string;
  }[];
  createdAt?: string;
  createdBy?: CreatedByUser | string;
}

export interface SubjectMark {
  subject: string | AcademySubject;
  obtained: number;
  total: number;
  grade?: string;
  isAbsent?: boolean;
  remarks?: string;
  /** Scanned answer sheet URL (same idea as class-test testPaperImage). */
  paperImage?: string;
}

export interface ExamResult {
  _id: string;
  academyStudent: {
    _id: string;
    studentId?: string;
    studentName: string;
    fatherName?: string;
    rollNumber?: string;
    phone?: string;
    contactPhoneRes?: string;
  };
  exam?: Exam | string;
  subjectMarks: SubjectMark[];
  totalMarks: number;
  obtainedMarks: number;
  percentage: number;
  grade: string;
  gpa?: number;
  position?: number;
  isPublished: boolean;
  remarks?: string;
}

export interface ExamStudentRow {
  student: {
    _id: string;
    studentId: string;
    studentName: string;
    fatherName?: string;
    rollNumber?: string;
    sectionName?: string;
    isFullPackage?: boolean;
  };
  subjects: AcademySubject[];
  result: ExamResult | null;
}

export interface ExamStudentsPayload {
  exam: Exam;
  subjects: AcademySubject[];
  students: ExamStudentRow[];
}

export function fetchExams(classId?: string) {
  const q = classId ? `?classId=${classId}` : "";
  return api<Exam[]>(`/exams${q}`);
}

export function fetchExam(id: string) {
  return api<Exam>(`/exams/${id}`);
}

export function createExam(body: {
  title: string;
  type: string;
  academyClass: string;
  sessionLabel?: string;
  startDate: string;
  endDate: string;
}) {
  return api<Exam>("/exams", { method: "POST", body: JSON.stringify(body) });
}

export function fetchExamStudents(examId: string) {
  return api<ExamStudentsPayload>(`/exams/${examId}/students`);
}

export function fetchExamResults(examId: string) {
  return api<ExamResult[]>(`/exams/${examId}/results`);
}

export function saveExamMarks(
  examId: string,
  marks: {
    studentId: string;
    subjectMarks: {
      subject: string;
      obtained: number;
      total: number;
      isAbsent?: boolean;
      remarks?: string;
      paperImage?: string;
    }[];
  }[]
) {
  return api<ExamResult[]>(`/exams/${examId}/results`, {
    method: "POST",
    body: JSON.stringify({ marks }),
  });
}

export async function uploadExamPaper(
  examId: string,
  studentId: string,
  subjectId: string,
  file: File
): Promise<{ paperImage: string }> {
  const fd = new FormData();
  fd.append("testPaper", file);
  const res = await authedFetch(
    `/exams/${examId}/students/${studentId}/subjects/${subjectId}/paper`,
    { method: "POST", body: fd }
  );
  const body = await parseJson<{
    success?: boolean;
    data?: { paperImage: string };
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(body.message || "Upload failed");
  if (!body.data?.paperImage) throw new Error("Invalid upload response");
  return body.data;
}

export function publishResult(resultId: string) {
  return api<ExamResult>(`/results/${resultId}/publish`, { method: "PATCH" });
}

export function publishAllExamResults(examId: string) {
  return api<{ modifiedCount: number }>(`/exams/${examId}/publish-all`, { method: "POST" });
}

export function fetchStudentExamResults(studentId: string) {
  return api<ExamResult[]>(`/results/student/${studentId}`);
}

export function resultPdfUrl(resultId: string) {
  return `${getApiRoot()}/results/${resultId}/pdf`;
}

export async function fetchResultCardPdf(resultId: string) {
  const res = await authedFetch(`/results/${resultId}/pdf`);
  if (!res.ok) {
    const body = await parseJson<{ message?: string }>(res);
    throw new Error(body.message || "Failed to load result card");
  }
  return res.blob();
}

/** Opens result card PDF in a new tab. */
export async function previewResultCardPdf(resultId: string) {
  const preview = window.open("about:blank", "_blank");
  try {
    const blob = await fetchResultCardPdf(resultId);
    const url = URL.createObjectURL(blob);
    if (preview && !preview.closed) {
      preview.location.replace(url);
      preview.focus();
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.download = `result-card-${resultId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  } catch (err) {
    preview?.close();
    throw err;
  }
}

/** Opens result card PDF and triggers the browser print dialog. */
export async function printResultCardPdf(resultId: string) {
  const preview = window.open("about:blank", "_blank");
  try {
    const blob = await fetchResultCardPdf(resultId);
    const url = URL.createObjectURL(blob);
    if (preview && !preview.closed) {
      preview.location.replace(url);
      window.setTimeout(() => {
        try {
          preview.focus();
          preview.print();
        } catch {
          /* browser PDF viewer */
        }
      }, 800);
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.download = `result-card-${resultId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  } catch (err) {
    preview?.close();
    throw err;
  }
}

export async function fetchExamAwardListPdf(examId: string, subjectId?: string) {
  const q = subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : "";
  const res = await authedFetch(`/exams/${examId}/award-list.pdf${q}`);
  if (!res.ok) {
    const body = await parseJson<{ message?: string }>(res);
    throw new Error(body.message || "Failed to load award list");
  }
  return res.blob();
}

/** Opens exam award list PDF in a new tab (one subject, or all date-sheet subjects). */
export async function previewExamAwardListPdf(examId: string, subjectId?: string) {
  const preview = window.open("about:blank", "_blank");
  try {
    const blob = await fetchExamAwardListPdf(examId, subjectId);
    const url = URL.createObjectURL(blob);
    if (preview && !preview.closed) {
      preview.location.replace(url);
      preview.focus();
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.download = subjectId
        ? `award-list-exam-${examId}-${subjectId}.pdf`
        : `award-list-exam-${examId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  } catch (err) {
    preview?.close();
    throw err;
  }
}

export type ExamMarksReportView = "exam" | "subject" | "student";

export async function fetchExamMarksReportPdf(
  examId: string,
  opts?: {
    view?: ExamMarksReportView;
    subjectId?: string;
    studentId?: string;
  }
) {
  const params = new URLSearchParams();
  params.set("view", opts?.view || "exam");
  if (opts?.subjectId) params.set("subjectId", opts.subjectId);
  if (opts?.studentId) params.set("studentId", opts.studentId);
  const res = await authedFetch(`/exams/${examId}/marks-report.pdf?${params.toString()}`);
  if (!res.ok) {
    const body = await parseJson<{ message?: string }>(res);
    throw new Error(body.message || "Failed to load marks report");
  }
  return res.blob();
}

/** Opens filled exam marks report PDF (exam / subject / student wise). */
export async function previewExamMarksReportPdf(
  examId: string,
  opts?: {
    view?: ExamMarksReportView;
    subjectId?: string;
    studentId?: string;
  }
) {
  const preview = window.open("about:blank", "_blank");
  try {
    const blob = await fetchExamMarksReportPdf(examId, opts);
    const url = URL.createObjectURL(blob);
    const view = opts?.view || "exam";
    if (preview && !preview.closed) {
      preview.location.replace(url);
      preview.focus();
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.download = `marks-report-${view}-${examId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  } catch (err) {
    preview?.close();
    throw err;
  }
}
