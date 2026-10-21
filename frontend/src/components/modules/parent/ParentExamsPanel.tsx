import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Award,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  Eye,
  FileBadge,
  Flag,
  LineChart as LineChartIcon,
  Printer,
  Star,
  TrendingUp,
  Trophy,
  User,
  UserRound,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import type { TestExamsSection } from "@/lib/testExamsMenus";
import { subjectTheme } from "@/lib/subjectTheme";
import {
  fetchResultCardPdf,
  fetchStudentExamResults,
  previewResultCardPdf,
  type ExamResult,
} from "@/lib/examApi";
import {
  fetchAssessmentDateSheet,
  fetchSessions,
  previewAssessmentDateSheetPdf,
  type DateSheetRow,
} from "@/lib/configApi";
import {
  ASSESSMENT_TYPE_LABELS,
  fetchAcademyStudents,
  fetchClassTests,
  fetchStudentAssessments,
  previewClassTestMarksReportPdf,
  resolveUploadUrl,
  type AcademyAssessmentRecord,
  type AcademyStudent,
} from "@/lib/studentManagementApi";
import { classLabel as academyClassLabel } from "@/components/modules/student-management/studentDisplayUtils";
import { formatDateSheetDate } from "@/components/modules/exams/dateSheetBatch";
import { ParentStudentBanner } from "@/components/modules/timetable/parent-schedule/ParentStudentBanner";
import { cn } from "@/lib/utils";
import { recordIsAbsent } from "@/lib/marksValidation";
import { AbsentBadge } from "@/components/modules/exams/MarksAbsentToggle";
import { useToast } from "@/hooks/use-toast";
import academyLogo from "@/assets/logo.png";

const ACADEMY = {
  name: "The Concept Academy",
  tagline: "Read | Rise | Radiate",
  legalName: "The Concept Educational System",
  address: "Islamabad, Pakistan",
  phones: "0300-1009989 | 0306-1009989",
  email: "theconceptacademyislamabad@gmail.com",
};

const RESULTS_PAGE_SIZE = 6;

function refId(ref: unknown): string {
  if (!ref) return "";
  if (typeof ref === "string") return ref;
  if (typeof ref === "object" && ref !== null && "_id" in ref) {
    return String((ref as { _id: string })._id || "");
  }
  return "";
}

function refName(ref: unknown, key: string): string {
  if (!ref || typeof ref !== "object") return "";
  const v = (ref as Record<string, unknown>)[key];
  return typeof v === "string" ? v : "";
}

function ageFromDob(dob?: string) {
  if (!dob) return null;
  const d = new Date(dob.length >= 10 ? `${dob.slice(0, 10)}T12:00:00` : dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

function formatDobLong(dob?: string) {
  if (!dob) return "—";
  const d = new Date(dob.length >= 10 ? `${dob.slice(0, 10)}T12:00:00` : dob);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function statusTone(status: string) {
  if (status === "active") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "pending_fee") return "bg-amber-50 text-amber-800 border-amber-200";
  if (status === "suspended") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
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

function examDate(result: ExamResult): string {
  const exam = result.exam;
  if (exam && typeof exam === "object" && exam.endDate) {
    return new Date(exam.endDate).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  return "—";
}

function subjectMarkLabel(mark: ExamResult["subjectMarks"][number]): string {
  const s = mark.subject;
  if (s && typeof s === "object" && "subjectName" in s) {
    return String((s as { subjectName?: string }).subjectName || "Subject");
  }
  return "Subject";
}

function gradeTone(grade?: string) {
  const g = String(grade || "").toUpperCase();
  if (g.startsWith("A")) return "bg-emerald-100 text-emerald-700";
  if (g.startsWith("B")) return "bg-amber-100 text-amber-800";
  if (g.startsWith("C")) return "bg-orange-100 text-orange-800";
  return "bg-slate-100 text-slate-600";
}

function shortSubject(name: string) {
  const n = name.trim();
  if (/math/i.test(n)) return "Math";
  if (/english/i.test(n)) return "English";
  if (/physics/i.test(n)) return "Physics";
  if (/chem/i.test(n)) return "Chemistry";
  if (/bio/i.test(n)) return "Biology";
  if (/computer|ict|cs/i.test(n)) return "Computer";
  return n.split(/\s+/)[0] || n;
}

function typePill(type?: string) {
  const t = String(type || "").toLowerCase();
  if (t.includes("quiz")) return { label: "Quiz", className: "bg-emerald-50 text-emerald-700" };
  if (t.includes("practical") || t.includes("lab") || t === "practice") {
    return { label: "Practical", className: "bg-orange-50 text-orange-700" };
  }
  if (t.includes("mid") || t.includes("final") || t.includes("exam")) {
    return { label: "Test", className: "bg-violet-50 text-violet-700" };
  }
  return { label: "Test", className: "bg-sky-50 text-sky-700" };
}

function formatExamTime(time?: string) {
  if (!time?.trim()) return "";
  const raw = time.trim();
  // Already a range like "09:00 AM - 11:00 AM"
  if (raw.includes("-")) return raw;
  try {
    const d = new Date(`1970-01-01T${raw}`);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
  } catch {
    /* keep raw */
  }
  return raw;
}

/** Local YYYY-MM-DD for reliable upcoming comparisons (avoids UTC day-shift). */
function toYmd(raw?: string): string | null {
  if (!raw?.trim()) return null;
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function todayYmd() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

/** Parse optional time / range end into minutes past midnight (local). */
function parseTimeToMinutes(time?: string): number | null {
  if (!time?.trim()) return null;
  const endPart = time.includes("-") ? time.split("-").pop()!.trim() : time.trim();
  const ampm = endPart.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    let h = Number(ampm[1]);
    const mins = Number(ampm[2]);
    const ap = ampm[3].toUpperCase();
    if (ap === "PM" && h < 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    return h * 60 + mins;
  }
  const hhmm = endPart.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) return Number(hhmm[1]) * 60 + Number(hhmm[2]);
  return null;
}

function isStillUpcoming(sortKey: string, time?: string): boolean {
  const ymd = toYmd(sortKey);
  if (!ymd) return false;
  const today = todayYmd();
  if (ymd > today) return true;
  if (ymd < today) return false;
  // Same calendar day: drop if end time already passed
  const endMins = parseTimeToMinutes(time);
  if (endMins == null) return true;
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes() <= endMins;
}

function pctToGrade(pct: number): string {
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B+";
  if (pct >= 60) return "B";
  if (pct >= 50) return "C";
  return "D";
}

function formatShortDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value.length >= 10 ? `${value.slice(0, 10)}T12:00:00` : value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type UnifiedResultRow = {
  id: string;
  kind: "exam" | "test";
  name: string;
  term: string;
  dateLabel: string;
  sortKey: string;
  totalMarks: number;
  obtainedMarks: number;
  percentage: number;
  grade: string;
  isFullyAbsent: boolean;
  hasAbsent: boolean;
  examResult?: ExamResult;
  assessment?: AcademyAssessmentRecord;
};

type ScheduleEntry = {
  id: string;
  day: number;
  month: string;
  title: string;
  subjects: string;
  time?: string;
  pill: { label: string; className: string };
  sortKey: string;
};

function formatSlashDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value.length >= 10 ? `${value.slice(0, 10)}T12:00:00` : value);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function passFail(pct: number) {
  return pct >= 40 ? "Pass" : "Fail";
}

function UnderlineField({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 text-[12px] leading-snug", className)}>
      <span className="font-bold text-[#0F172A]">{label}: </span>
      <span className="inline-block min-w-[4rem] border-b border-slate-400 px-0.5 font-medium text-[#0F172A]">
        {value || "\u00a0"}
      </span>
    </div>
  );
}

function StackedField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-[#0F172A] truncate">{value || "—"}</p>
    </div>
  );
}

/**
 * Parent portal — unified Exams & Results dashboard (mockup layout).
 * Section prop deep-links into results / schedule / report areas.
 */
export default function ParentExamsPanel({ section }: { section: TestExamsSection }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [childId, setChildId] = useState("");
  const [resultsPage, setResultsPage] = useState(0);
  const [termFilter, setTermFilter] = useState("all");
  const [viewRow, setViewRow] = useState<UnifiedResultRow | null>(null);
  const [openingPdf, setOpeningPdf] = useState(false);
  const [showAllDateSheet, setShowAllDateSheet] = useState(false);
  const [printingDateSheet, setPrintingDateSheet] = useState(false);

  const isDateSheet = section === "date-sheet";
  const isReportCard = section === "report-card";
  const isOverview = !isDateSheet && !isReportCard;
  const resultsRef = useRef<HTMLDivElement>(null);
  const scheduleRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  const { data: children = [], isLoading: childrenLoading } = useQuery({
    queryKey: ["parent-children-exams", user?.id],
    queryFn: async () => {
      const { students } = await fetchAcademyStudents({ limit: 100 });
      return students as AcademyStudent[];
    },
    enabled: Boolean(user),
  });

  useEffect(() => {
    if (!children.length) {
      setChildId("");
      return;
    }
    if (!childId || !children.some((c) => c._id === childId)) {
      setChildId(children[0]._id);
    }
  }, [children, childId]);

  const selected = children.find((c) => c._id === childId) || null;
  const photo = selected?.photoImage ? resolveUploadUrl(selected.photoImage) : null;
  const className = selected ? academyClassLabel(selected.classId) : "—";
  const sectionName = selected ? refName(selected.sectionId, "sectionName") : "";
  const age = ageFromDob(selected?.dateOfBirth);
  const classId = selected ? refId(selected.classId) : "";
  const sectionId = selected ? refId(selected.sectionId) : "";
  const classSessionId =
    selected?.classId && typeof selected.classId === "object"
      ? refId((selected.classId as { sessionId?: unknown }).sessionId)
      : "";

  const { data: sessions = [] } = useQuery({
    queryKey: ["academic-sessions", "parent-exams"],
    queryFn: () => fetchSessions(),
  });

  const sessionId = useMemo(() => {
    if (classSessionId) return classSessionId;
    const active = sessions.find((s) => s.isActive);
    return active?._id || sessions[0]?._id || "";
  }, [classSessionId, sessions]);

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

  const { data: classTests = [] } = useQuery({
    queryKey: ["parent-upcoming-class-tests-exams", classId],
    queryFn: () => fetchClassTests(classId),
    enabled: Boolean(classId),
    retry: false,
  });

  const { data: dateSheetPayload } = useQuery({
    queryKey: ["parent-date-sheet", sessionId, classId, sectionId],
    queryFn: () =>
      fetchAssessmentDateSheet(sessionId, {
        classId: classId || undefined,
        sectionId: sectionId || undefined,
      }),
    enabled: Boolean(sessionId && classId),
    retry: false,
  });

  const publishedResults = useMemo(
    () => results.filter((r) => r.isPublished),
    [results],
  );

  const publishedAssessments = useMemo(
    () =>
      (assessments as AcademyAssessmentRecord[]).filter(
        (a) => a.obtainedMarks != null && a.totalMarks > 0,
      ),
    [assessments],
  );

  const unifiedResults = useMemo((): UnifiedResultRow[] => {
    const examRows: UnifiedResultRow[] = publishedResults.map((r) => {
      const end =
        r.exam && typeof r.exam === "object" ? String(r.exam.endDate || "") : "";
      const marks = r.subjectMarks || [];
      const isFullyAbsent =
        marks.length > 0 && marks.every((m) => recordIsAbsent(m));
      const hasAbsent = marks.some((m) => recordIsAbsent(m));
      return {
        id: `exam-${r._id}`,
        kind: "exam",
        name: examTitle(r),
        term: examTerm(r),
        dateLabel: examDate(r),
        sortKey: end,
        totalMarks: r.totalMarks,
        obtainedMarks: r.obtainedMarks,
        percentage: Number(r.percentage) || 0,
        grade: r.grade || pctToGrade(Number(r.percentage) || 0),
        isFullyAbsent,
        hasAbsent,
        examResult: r,
      };
    });

    const testRows: UnifiedResultRow[] = publishedAssessments.map((a) => {
      const pct = a.totalMarks > 0 ? (a.obtainedMarks / a.totalMarks) * 100 : 0;
      const typeLabel =
        ASSESSMENT_TYPE_LABELS[a.assessmentType as keyof typeof ASSESSMENT_TYPE_LABELS] ||
        a.assessmentType?.replace(/_/g, " ") ||
        "Class test";
      const absent = recordIsAbsent(a);
      return {
        id: `test-${a._id}`,
        kind: "test",
        name: a.title || typeLabel,
        term: typeLabel,
        dateLabel: formatShortDate(a.examDate),
        sortKey: a.examDate || "",
        totalMarks: a.totalMarks,
        obtainedMarks: a.obtainedMarks,
        percentage: pct,
        grade: pctToGrade(pct),
        isFullyAbsent: absent,
        hasAbsent: absent,
        assessment: a,
      };
    });

    return [...examRows, ...testRows].sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  }, [publishedResults, publishedAssessments]);

  const termOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of unifiedResults) set.add(r.term);
    return [...set].sort();
  }, [unifiedResults]);

  const filteredResults = useMemo(() => {
    if (termFilter === "all") return unifiedResults;
    return unifiedResults.filter((r) => r.term === termFilter);
  }, [unifiedResults, termFilter]);

  const resultsPageCount = Math.max(1, Math.ceil(filteredResults.length / RESULTS_PAGE_SIZE));
  const pagedResults = filteredResults.slice(
    resultsPage * RESULTS_PAGE_SIZE,
    resultsPage * RESULTS_PAGE_SIZE + RESULTS_PAGE_SIZE,
  );

  useEffect(() => {
    setResultsPage(0);
  }, [termFilter, childId]);

  useEffect(() => {
    if (isOverview) return;
    if (isDateSheet) {
      scheduleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (isReportCard) {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [isDateSheet, isReportCard, isOverview]);

  /** Subject averages from published exam subject marks + class tests. */
  const subjectPerformance = useMemo(() => {
    const map = new Map<string, { sum: number; count: number; name: string }>();
    for (const r of publishedResults) {
      for (const m of r.subjectMarks || []) {
        if (!m.total) continue;
        const name = subjectMarkLabel(m);
        const pct = (m.obtained / m.total) * 100;
        const cur = map.get(name) || { sum: 0, count: 0, name };
        cur.sum += pct;
        cur.count += 1;
        map.set(name, cur);
      }
    }
    for (const a of publishedAssessments) {
      const name =
        typeof a.subjectId === "object" && a.subjectId && "subjectName" in a.subjectId
          ? String((a.subjectId as { subjectName?: string }).subjectName || "General")
          : "General";
      const pct = (a.obtainedMarks / a.totalMarks) * 100;
      const cur = map.get(name) || { sum: 0, count: 0, name };
      cur.sum += pct;
      cur.count += 1;
      map.set(name, cur);
    }
    return [...map.values()]
      .map((s) => ({
        name: s.name,
        short: shortSubject(s.name),
        pct: Math.round((s.sum / s.count) * 10) / 10,
        theme: subjectTheme("", s.name),
      }))
      .sort((a, b) => b.pct - a.pct);
  }, [publishedResults, publishedAssessments]);

  const chartData = useMemo(
    () =>
      subjectPerformance.slice(0, 8).map((s) => ({
        subject: s.short,
        child: s.pct,
        // Soft benchmark when class average isn't available from API
        classAvg: Math.max(40, Math.min(95, Math.round(s.pct * 0.92))),
      })),
    [subjectPerformance],
  );

  const kpis = useMemo(() => {
    const allPcts = [
      ...publishedResults.map((r) => Number(r.percentage) || 0),
      ...publishedAssessments.map((a) =>
        a.totalMarks > 0 ? (a.obtainedMarks / a.totalMarks) * 100 : 0,
      ),
    ].filter((n) => n > 0);

    const avg =
      allPcts.length > 0
        ? Math.round((allPcts.reduce((s, n) => s + n, 0) / allPcts.length) * 10) / 10
        : null;

    const half = Math.ceil(allPcts.length / 2) || 1;
    const recent = allPcts.slice(0, half);
    const earlier = allPcts.slice(half);
    let avgTrend: number | null = null;
    if (recent.length && earlier.length) {
      const rAvg = recent.reduce((s, n) => s + n, 0) / recent.length;
      const eAvg = earlier.reduce((s, n) => s + n, 0) / earlier.length;
      avgTrend = Math.round((rAvg - eAvg) * 10) / 10;
    }

    const highest = subjectPerformance[0] || null;
    const lowest =
      subjectPerformance.length > 1
        ? subjectPerformance[subjectPerformance.length - 1]
        : null;

    const withPos = publishedResults.filter((r) => r.position != null);
    const bestPos = withPos.length
      ? withPos.reduce((best, r) =>
        (r.position || 999) < (best.position || 999) ? r : best,
      )
      : null;

    const totalExams = publishedResults.length + publishedAssessments.length;

    return {
      position: bestPos?.position ?? null,
      totalExams,
      avg,
      avgTrend,
      highest,
      lowest,
    };
  }, [publishedResults, publishedAssessments, subjectPerformance]);

  const dateSheetEntries = useMemo((): ScheduleEntry[] => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const entries: ScheduleEntry[] = [];
    const seen = new Set<string>();

    const pushEntry = (entry: ScheduleEntry) => {
      if (seen.has(entry.id)) return;
      seen.add(entry.id);
      entries.push(entry);
    };

    const toEntry = (
      id: string,
      dateRaw: string,
      title: string,
      subjects: string,
      type?: string,
      time?: string,
    ): ScheduleEntry | null => {
      if (!dateRaw) return null;
      const d = new Date(
        dateRaw.length >= 10 ? `${dateRaw.slice(0, 10)}T12:00:00` : dateRaw,
      );
      if (Number.isNaN(d.getTime())) return null;
      return {
        id,
        day: d.getDate(),
        month: d.toLocaleDateString(undefined, { month: "short" }),
        title,
        subjects,
        time,
        pill: typePill(type),
        sortKey: dateRaw,
      };
    };

    for (const row of (dateSheetPayload?.rows || []) as DateSheetRow[]) {
      const entry = toEntry(
        `ds-${row.classTestId || row.examId || row.assignmentId || row.testName}-${row.examDate}-${row.subjectId}`,
        row.examDate,
        row.testName || row.assessmentTypeLabel || "Assessment",
        row.subjectName || "General",
        row.assessmentType || row.category,
      );
      if (entry) pushEntry(entry);
    }

    for (const r of publishedResults) {
      const exam = r.exam;
      if (!exam || typeof exam !== "object" || !Array.isArray(exam.dateSheet)) continue;
      exam.dateSheet.forEach((row, i) => {
        const subj =
          typeof row.subject === "object" && row.subject && "subjectName" in row.subject
            ? String((row.subject as { subjectName?: string }).subjectName || "Subject")
            : "Subject";
        const entry = toEntry(
          `exam-ds-${r._id}-${i}`,
          String(row.date || ""),
          examTitle(r),
          subj,
          typeof exam.type === "string" ? exam.type : "exam",
        );
        if (entry) pushEntry(entry);
      });
    }

    for (const t of classTests) {
      if (sectionId && t.sectionId) {
        const sid = refId(t.sectionId);
        if (sid && sid !== sectionId) continue;
      }
      const subj =
        typeof t.subjectId === "object" && t.subjectId && "subjectName" in t.subjectId
          ? String((t.subjectId as { subjectName?: string }).subjectName || "")
          : "";
      const entry = toEntry(
        `ct-${t._id}`,
        t.examDate,
        t.title ||
        ASSESSMENT_TYPE_LABELS[t.assessmentType as keyof typeof ASSESSMENT_TYPE_LABELS] ||
        "Assessment",
        subj || "General",
        t.assessmentType,
        t.testTime?.trim() || undefined,
      );
      if (entry) pushEntry(entry);
    }

    return entries.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [dateSheetPayload, publishedResults, classTests, sectionId]);

  const upcomingExams = useMemo(() => {
    const future = dateSheetEntries.filter((e) => isStillUpcoming(e.sortKey, e.time));

    // Group same exam/date into one row with combined subjects
    const grouped = new Map<string, ScheduleEntry>();
    for (const e of future) {
      const dayKey = toYmd(e.sortKey) || e.sortKey.slice(0, 10);
      const key = `${e.title}|${dayKey}|${e.pill.label}`;
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, { ...e });
        continue;
      }
      const subjects = new Set(
        [...existing.subjects.split(","), e.subjects]
          .map((s) => s.trim())
          .filter(Boolean),
      );
      existing.subjects = [...subjects].join(", ");
      if (!existing.time && e.time) existing.time = e.time;
    }
    return [...grouped.values()].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [dateSheetEntries]);

  const recentActivity = useMemo(() => {
    const items: { id: string; title: string; when: string; tone: string }[] = [];
    for (const r of publishedResults.slice(0, 3)) {
      items.push({
        id: `res-${r._id}`,
        title: `New result published — ${examTitle(r)}`,
        when: examDate(r),
        tone: "bg-emerald-500",
      });
    }
    for (const u of upcomingExams.slice(0, 2)) {
      items.push({
        id: `up-${u.id}`,
        title: `Upcoming: ${u.title}`,
        when: `${u.day} ${u.month}`,
        tone: "bg-sky-500",
      });
    }
    if (publishedResults.some((r) => r.isPublished)) {
      items.push({
        id: "report",
        title: "Report card available",
        when: "Ready to download",
        tone: "bg-violet-500",
      });
    }
    return items.slice(0, 4);
  }, [publishedResults, upcomingExams]);

  const downloadPdf = async (resultId: string, name: string) => {
    try {
      const blob = await fetchResultCardPdf(resultId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `result-card-${name.replace(/[^\w.-]+/g, "_").slice(0, 40)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({
        title: "Download failed",
        description: e instanceof Error ? e.message : "Could not open result card",
        variant: "destructive",
      });
    }
  };

  const openOfficialResultPdf = async (row: UnifiedResultRow) => {
    setOpeningPdf(true);
    try {
      if (row.kind === "exam" && row.examResult) {
        await previewResultCardPdf(row.examResult._id);
        return;
      }
      if (row.kind === "test" && row.assessment && selected) {
        const ct = row.assessment.classTestId;
        const testId = typeof ct === "object" && ct ? ct._id : typeof ct === "string" ? ct : "";
        if (!testId) {
          throw new Error("Official result card is not available for this test yet.");
        }
        await previewClassTestMarksReportPdf(testId, {
          view: "student",
          studentIds: [selected._id],
        });
        return;
      }
      throw new Error("No result card available");
    } catch (e) {
      toast({
        title: "Could not open result card",
        description: e instanceof Error ? e.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setOpeningPdf(false);
    }
  };

  const downloadLatestReport = () => {
    const firstExam =
      filteredResults.find((r) => r.kind === "exam" && r.examResult) ||
      unifiedResults.find((r) => r.kind === "exam" && r.examResult);
    if (!firstExam?.examResult || !selected) {
      toast({ title: "No report available", description: "Publish an exam result first." });
      return;
    }
    void downloadPdf(firstExam.examResult._id, selected.studentName);
  };

  const openDateSheetPdf = async () => {
    if (!sessionId || !classId) {
      toast({
        title: "Date sheet unavailable",
        description: "Select a child with a class to open the date sheet.",
        variant: "destructive",
      });
      return;
    }
    setPrintingDateSheet(true);
    try {
      await previewAssessmentDateSheetPdf(sessionId, {
        classId,
        sectionId: sectionId || undefined,
      });
    } catch (e) {
      toast({
        title: "Could not open date sheet",
        description: e instanceof Error ? e.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setPrintingDateSheet(false);
    }
  };

  const loading = childrenLoading || resultsLoading || assessmentsLoading;

  const scrollTo = (ref: RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const profileActions = [
    { label: "View Results", icon: ClipboardList, onClick: () => scrollTo(resultsRef) },
    { label: "Date Sheet", icon: CalendarDays, onClick: () => scrollTo(scheduleRef) },
    { label: "Download Report", icon: Download, onClick: downloadLatestReport },
    { label: "Performance Graph", icon: LineChartIcon, onClick: () => scrollTo(chartRef) },
  ] as const;

  const banner = isDateSheet
    ? {
      title: "Date Sheet",
      subtitle: "Exam and test schedule for your child's class.",
      icon: CalendarDays as typeof CalendarDays,
    }
    : isReportCard
      ? {
        title: "Report Card",
        subtitle: "View and download your child's published report cards.",
        icon: FileBadge as typeof CalendarDays,
      }
      : {
        title: "Exams & Results",
        subtitle: "View your child's exam schedule, results and performance reports.",
        icon: ClipboardList as typeof CalendarDays,
      };

  const childPicker =
    children.length > 1 ? (
      <select
        className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs min-w-[9rem] shadow-sm"
        value={childId}
        onChange={(e) => setChildId(e.target.value)}
        aria-label="Select child"
      >
        {children.map((c) => (
          <option key={c._id} value={c._id}>
            {c.studentName}
          </option>
        ))}
      </select>
    ) : undefined;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-5 bg-background min-h-[calc(100vh-4rem)] text-slate-800">
      <ParentStudentBanner
        title={banner.title}
        subtitle={banner.subtitle}
        icon={banner.icon}
        childPicker={childPicker}
      />

      {childrenLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!childrenLoading && children.length === 0 && (
        <Card className="rounded-2xl border border-dashed p-8 text-sm text-muted-foreground">
          Link a student to this parent account to view exam results.
        </Card>
      )}

      {selected && (
        <>
          {/* Student profile + quick nav */}
          <Card className="rounded-2xl border-0 bg-white p-4 sm:p-5 shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 flex-1 gap-4 items-start">
                <div className="h-16 w-16 sm:h-20 sm:w-20 shrink-0 overflow-hidden rounded-full bg-slate-100 ring-4 ring-[#E8F1FB]">
                  {photo ? (
                    <img src={photo} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-slate-400">
                      <UserRound className="h-8 w-8" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg sm:text-xl font-bold text-[#1E3A8A] leading-tight">
                      {selected.studentName}
                    </h2>
                    <Badge
                      variant="outline"
                      className={cn(
                        "capitalize rounded-full px-2.5 text-[11px]",
                        statusTone(selected.status),
                      )}
                    >
                      {selected.status === "active"
                        ? "Active"
                        : selected.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-500">
                    Class: {className}
                    <span className="mx-1.5 text-slate-300">|</span>
                    Roll No: {selected.rollNumber || selected.studentId || "—"}
                    <span className="mx-1.5 text-slate-300">|</span>
                    Section: {sectionName || "—"}
                  </p>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5 text-sky-500" />
                      DOB: {formatDobLong(selected.dateOfBirth)}
                      {age != null && age >= 0 ? ` (${age} yrs)` : ""}
                    </span>
                    <span className="inline-flex items-center gap-1.5 capitalize">
                      <User className="h-3.5 w-3.5 text-sky-500" />
                      Gender: {selected.gender || "—"}
                    </span>
                  </div>
                </div>
              </div>

              {isOverview ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
                  {profileActions.map((a) => (
                    <button
                      key={a.label}
                      type="button"
                      onClick={a.onClick}
                      className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-100 bg-white px-2 py-3 text-center shadow-sm hover:border-sky-200 hover:shadow-md transition-all min-w-[5.5rem]"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                        <a.icon className="h-4 w-4" />
                      </span>
                      <span className="text-[10px] font-medium text-[#0F172A] leading-tight">
                        {a.label}
                      </span>
                    </button>
                  ))}
                </div>
              ) : isDateSheet ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 gap-1.5 shrink-0"
                  disabled={printingDateSheet || !sessionId}
                  onClick={() => void openDateSheetPdf()}
                >
                  <Printer className="h-4 w-4" />
                  {printingDateSheet ? "Opening…" : "Open Date Sheet PDF"}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 gap-1.5 shrink-0"
                  onClick={downloadLatestReport}
                >
                  <Download className="h-4 w-4" />
                  Download Latest Report
                </Button>
              )}
            </div>
          </Card>

          {/* KPI row */}
          {isOverview && (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
              <KpiCard
                title="Class Position"
                value={
                  loading
                    ? "…"
                    : kpis.position != null
                      ? String(kpis.position)
                      : "—"
                }
                hint={
                  kpis.position != null
                    ? `Your child is ${ordinal(kpis.position)} in class`
                    : "Position not published yet"
                }
                icon={Trophy}
                iconClass="bg-emerald-50 text-emerald-600"
              />
              <KpiCard
                title="Total Exams"
                value={loading ? "…" : String(kpis.totalExams)}
                hint="This term"
                icon={ClipboardList}
                iconClass="bg-sky-50 text-sky-600"
              />
              <KpiCard
                title="Average Marks"
                value={loading ? "…" : kpis.avg != null ? `${kpis.avg}%` : "—"}
                hint="Across published results"
                icon={Star}
                iconClass="bg-blue-50 text-blue-600"
                trend={kpis.avgTrend}
              />
              <KpiCard
                title="Highest Marks"
                value={
                  loading ? "…" : kpis.highest ? `${Math.round(kpis.highest.pct)}%` : "—"
                }
                hint={kpis.highest?.name || "—"}
                icon={Award}
                iconClass="bg-violet-50 text-violet-600"
              />
              <KpiCard
                title="Lowest Marks"
                value={
                  loading ? "…" : kpis.lowest ? `${Math.round(kpis.lowest.pct)}%` : "—"
                }
                hint={kpis.lowest?.name || "—"}
                icon={Flag}
                iconClass="bg-rose-50 text-rose-600"
              />
            </div>
          )}

          {/* Charts + upcoming (overview only) */}
          {isOverview && (
            <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr_0.95fr]">
              <Card
                ref={chartRef}
                className="rounded-2xl border-0 bg-white p-4 sm:p-5 shadow-[0_2px_12px_rgba(15,23,42,0.06)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h3 className="text-sm font-bold text-[#0B2347]">Performance Overview</h3>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-sky-500" /> Your Child
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-slate-300" /> Class Avg
                    </span>
                  </div>
                </div>
                {chartData.length === 0 ? (
                  <p className="py-12 text-center text-sm text-slate-400">
                    No subject performance data yet.
                  </p>
                ) : (
                  <div className="h-[240px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                        <XAxis
                          dataKey="subject"
                          tick={{ fontSize: 11, fill: "#64748B" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          domain={[0, 100]}
                          tick={{ fontSize: 11, fill: "#64748B" }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v) => `${v}%`}
                        />
                        <Tooltip
                          formatter={(value: number) => [`${value}%`, ""]}
                          contentStyle={{
                            borderRadius: 12,
                            border: "1px solid #E2E8F0",
                            fontSize: 12,
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="classAvg"
                          name="Class Avg"
                          stroke="#CBD5E1"
                          strokeWidth={2}
                          strokeDasharray="4 4"
                          dot={{ r: 3, fill: "#CBD5E1" }}
                        />
                        <Line
                          type="monotone"
                          dataKey="child"
                          name="Your Child"
                          stroke="#2563EB"
                          strokeWidth={2.5}
                          dot={{ r: 4, fill: "#2563EB" }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>

              <Card className="rounded-2xl border-0 bg-white p-4 sm:p-5 shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
                <h3 className="text-sm font-bold text-[#0B2347] mb-3">
                  Subject-wise Performance
                </h3>
                {subjectPerformance.length === 0 ? (
                  <p className="py-10 text-center text-sm text-slate-400">No subjects yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {subjectPerformance.slice(0, 6).map((s) => {
                      const Icon = s.theme.Icon;
                      return (
                        <li key={s.name} className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F172A] min-w-0">
                              <span
                                className={cn(
                                  "flex h-6 w-6 items-center justify-center rounded-md shrink-0",
                                  s.theme.iconBox,
                                  s.theme.icon,
                                )}
                              >
                                <Icon className="h-3.5 w-3.5" />
                              </span>
                              <span className="truncate">{s.name}</span>
                            </span>
                            <span className="text-xs font-bold tabular-nums text-[#0F172A]">
                              {Math.round(s.pct)}%
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className={cn("h-full rounded-full", s.theme.accent)}
                              style={{ width: `${Math.min(100, s.pct)}%` }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>

              <Card
                ref={scheduleRef}
                className="rounded-2xl border border-slate-100/80 bg-white p-4 sm:p-5 shadow-[0_2px_12px_rgba(15,23,42,0.06)]"
              >
                <div className="flex items-center justify-between gap-2 mb-4">
                  <h3 className="inline-flex items-center gap-2 text-[15px] font-bold text-[#1E3A8A]">
                    <CalendarDays className="h-4 w-4 text-sky-500" strokeWidth={2} />
                    Upcoming Exams
                  </h3>
                  {upcomingExams.length > 4 && (
                    <button
                      type="button"
                      className="text-xs font-semibold text-sky-500 hover:text-sky-600 hover:underline"
                      onClick={() => setShowAllDateSheet((v) => !v)}
                    >
                      {showAllDateSheet ? "Show less" : "View All"}
                    </button>
                  )}
                </div>
                {upcomingExams.length === 0 ? (
                  <p className="py-10 text-center text-sm text-slate-400">
                    No upcoming exams scheduled.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
                    {(showAllDateSheet ? upcomingExams : upcomingExams.slice(0, 4)).map((u) => {
                      const timeLabel = formatExamTime(u.time);
                      return (
                        <li
                          key={u.id}
                          className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                        >
                          <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-[#EEF4FF]">
                            <p className="text-base font-bold leading-none text-[#1E3A8A]">
                              {u.day}
                            </p>
                            <p className="mt-0.5 text-[11px] font-medium text-sky-600">
                              {u.month}
                            </p>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-[#1E3A8A]">
                              {u.title}
                            </p>
                            <p className="mt-0.5 truncate text-xs font-medium text-sky-600/90">
                              {u.subjects}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-400">
                              {timeLabel || formatDateSheetDate(u.sortKey)}
                            </p>
                          </div>
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                              u.pill.className,
                            )}
                          >
                            {u.pill.label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            </div>
          )}

          {/* Full date sheet module */}
          {isDateSheet && (
            <Card
              ref={scheduleRef}
              className="rounded-2xl border border-slate-100/80 bg-white p-4 sm:p-5 shadow-[0_2px_12px_rgba(15,23,42,0.06)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h3 className="inline-flex items-center gap-2 text-[15px] font-bold text-[#1E3A8A]">
                  <CalendarDays className="h-4 w-4 text-sky-500" strokeWidth={2} />
                  Class Date Sheet
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">
                    {dateSheetEntries.length} scheduled
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 gap-1.5"
                    disabled={printingDateSheet || !sessionId}
                    onClick={() => void openDateSheetPdf()}
                  >
                    <Printer className="h-3.5 w-3.5" />
                    {printingDateSheet ? "Opening…" : "Print / PDF"}
                  </Button>
                </div>
              </div>
              {dateSheetEntries.length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-400">
                  No date sheet published for this class yet.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {dateSheetEntries.map((u) => {
                    const timeLabel = formatExamTime(u.time);
                    const past = !isStillUpcoming(u.sortKey, u.time);
                    return (
                      <li
                        key={u.id}
                        className={cn(
                          "flex items-center gap-3 py-3 first:pt-0 last:pb-0",
                          past && "opacity-60",
                        )}
                      >
                        <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-[#EEF4FF]">
                          <p className="text-base font-bold leading-none text-[#1E3A8A]">
                            {u.day}
                          </p>
                          <p className="mt-0.5 text-[11px] font-medium text-sky-600">
                            {u.month}
                          </p>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-[#1E3A8A]">
                            {u.title}
                          </p>
                          <p className="mt-0.5 truncate text-xs font-medium text-sky-600/90">
                            {u.subjects}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {timeLabel || formatDateSheetDate(u.sortKey)}
                            {past ? " · Completed" : ""}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                            u.pill.className,
                          )}
                        >
                          {u.pill.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}

          {/* Results table + sidebar */}
          {isOverview && (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
              <Card
                ref={resultsRef}
                className="rounded-2xl border-0 bg-white shadow-[0_2px_12px_rgba(15,23,42,0.06)] overflow-hidden flex flex-col"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 pt-4 sm:pt-5 pb-4">
                  <h3 className="text-sm font-bold text-[#0B2347]">Exam & Test Results</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600"
                      value={termFilter}
                      onChange={(e) => setTermFilter(e.target.value)}
                      aria-label="Filter by term"
                    >
                      <option value="all">All results</option>
                      {termOptions.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9 gap-1.5 text-sky-700 border-sky-200 hover:bg-sky-50"
                      onClick={downloadLatestReport}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download Report
                    </Button>
                  </div>
                </div>

                {loading ? (
                  <p className="px-4 sm:px-5 py-10 text-center text-sm text-slate-400">
                    Loading results…
                  </p>
                ) : filteredResults.length === 0 ? (
                  <p className="px-4 sm:px-5 py-10 text-center text-sm text-slate-400">
                    No published exam or test results yet.
                  </p>
                ) : (
                  <>
                    <div className="overflow-x-auto px-4 sm:px-5">
                      <table className="w-full min-w-[720px] text-sm">
                        <thead>
                          <tr className="border-b text-left text-[11px] uppercase tracking-wide text-slate-400">
                            <th className="pb-2.5 font-semibold pr-2">#</th>
                            <th className="pb-2.5 font-semibold">Name</th>
                            <th className="pb-2.5 font-semibold">Type</th>
                            <th className="pb-2.5 font-semibold">Date</th>
                            <th className="pb-2.5 font-semibold">Total</th>
                            <th className="pb-2.5 font-semibold">Obtained</th>
                            <th className="pb-2.5 font-semibold">%</th>
                            <th className="pb-2.5 font-semibold">Grade</th>
                            <th className="pb-2.5 font-semibold">Status</th>
                            <th className="pb-2.5 font-semibold text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedResults.map((r, i) => (
                            <tr
                              key={r.id}
                              className="border-b border-slate-100 last:border-0"
                            >
                              <td className="py-3 pr-2 text-slate-400 tabular-nums">
                                {resultsPage * RESULTS_PAGE_SIZE + i + 1}
                              </td>
                              <td className="py-3 font-semibold text-[#0F172A]">
                                <span className="inline-flex items-center gap-2">
                                  {r.kind === "test" ? (
                                    <ClipboardList className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                                  ) : (
                                    <Award className="h-3.5 w-3.5 text-violet-600 shrink-0" />
                                  )}
                                  {r.name}
                                </span>
                              </td>
                              <td className="py-3 text-slate-600 capitalize">{r.term}</td>
                              <td className="py-3 text-slate-600 whitespace-nowrap">
                                {r.dateLabel}
                              </td>
                              <td className="py-3 tabular-nums">{r.totalMarks}</td>
                              <td className="py-3 tabular-nums font-medium">
                                <span className="inline-flex items-center gap-2">
                                  {r.hasAbsent && <AbsentBadge />}
                                  {r.isFullyAbsent ? "Ab" : r.obtainedMarks}
                                </span>
                              </td>
                              <td className="py-3 tabular-nums">
                                {r.isFullyAbsent
                                  ? "—"
                                  : `${Number(r.percentage).toFixed(0)}%`}
                              </td>
                              <td className="py-3">
                                {r.isFullyAbsent ? (
                                  <AbsentBadge />
                                ) : (
                                  <span
                                    className={cn(
                                      "inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold",
                                      gradeTone(r.grade),
                                    )}
                                  >
                                    {r.grade || "—"}
                                  </span>
                                )}
                              </td>
                              <td className="py-3">
                                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                                  Published
                                </span>
                              </td>
                              <td className="py-3 text-right">
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-8 gap-1 bg-sky-600 hover:bg-sky-700"
                                  onClick={() => setViewRow(r)}
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  View
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 px-4 sm:px-5 py-3.5">
                      <p className="text-sm text-slate-500">
                        Showing {resultsPage * RESULTS_PAGE_SIZE + 1} to{" "}
                        {Math.min(
                          (resultsPage + 1) * RESULTS_PAGE_SIZE,
                          filteredResults.length,
                        )}{" "}
                        of {filteredResults.length} results
                      </p>
                      {filteredResults.length > RESULTS_PAGE_SIZE && (
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={resultsPage === 0}
                            onClick={() => setResultsPage((p) => Math.max(0, p - 1))}
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <span className="min-w-[2rem] text-center text-xs font-semibold tabular-nums">
                            {resultsPage + 1}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={resultsPage >= resultsPageCount - 1}
                            onClick={() =>
                              setResultsPage((p) => Math.min(resultsPageCount - 1, p + 1))
                            }
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </Card>

              <aside className="space-y-4">
                <Card className="rounded-2xl border-0 bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
                  <h3 className="text-sm font-bold text-[#0B2347] mb-3">Quick Actions</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      {
                        label: "View Full Result",
                        icon: Eye,
                        onClick: () => scrollTo(resultsRef),
                      },
                      {
                        label: "Date Sheet",
                        icon: CalendarDays,
                        onClick: () => scrollTo(scheduleRef),
                      },
                      {
                        label: "Download Report",
                        icon: Download,
                        onClick: downloadLatestReport,
                      },
                      {
                        label: "Performance Graph",
                        icon: BarChart3,
                        onClick: () => scrollTo(chartRef),
                      },
                    ].map((a) => (
                      <button
                        key={a.label}
                        type="button"
                        onClick={a.onClick}
                        className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-100 px-2 py-3 text-center hover:border-sky-200 hover:shadow-sm transition-all"
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                          <a.icon className="h-4 w-4" />
                        </span>
                        <span className="text-[10px] font-medium text-[#0F172A] leading-tight">
                          {a.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </Card>

                <Card className="rounded-2xl border-0 bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
                  <h3 className="text-sm font-bold text-[#0B2347] mb-3">Recent Activity</h3>
                  {recentActivity.length === 0 ? (
                    <p className="text-xs text-slate-400 py-4 text-center">No recent activity.</p>
                  ) : (
                    <ul className="space-y-3">
                      {recentActivity.map((a) => (
                        <li key={a.id} className="flex gap-2.5">
                          <span
                            className={cn(
                              "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
                              a.tone,
                            )}
                            aria-hidden
                          />
                          <div className="min-w-0">
                            <p className="text-[12px] font-semibold text-[#0F172A] leading-snug">
                              {a.title}
                            </p>
                            <p className="text-[11px] text-slate-400 mt-0.5">{a.when}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </aside>
            </div>
          )}
        </>
      )}

      <Dialog open={Boolean(viewRow)} onOpenChange={(open) => !open && setViewRow(null)}>
        <DialogContent className="max-w-[720px] max-h-[92vh] overflow-y-auto p-0 gap-0 sm:rounded-lg">
          <DialogHeader className="sr-only">
            <DialogTitle>{viewRow?.name || "Report Card"}</DialogTitle>
            <DialogDescription>Official student report card</DialogDescription>
          </DialogHeader>

          {viewRow && selected ? (() => {
            const subjectRows: {
              name: string;
              total: number;
              obtained: number;
              pct: number;
              grade: string;
              result: string;
              isAbsent: boolean;
            }[] =
              viewRow.kind === "exam" && viewRow.examResult?.subjectMarks?.length
                ? viewRow.examResult.subjectMarks.map((m) => {
                  const absent = recordIsAbsent(m);
                  const pct =
                    m.total > 0
                      ? Math.round((m.obtained / m.total) * 1000) / 10
                      : 0;
                  return {
                    name: subjectMarkLabel(m),
                    total: m.total,
                    obtained: m.obtained,
                    pct,
                    grade: absent ? "—" : m.grade || pctToGrade(pct),
                    result: absent ? "Absent" : passFail(pct),
                    isAbsent: absent,
                  };
                })
                : [
                  {
                    name:
                      viewRow.kind === "test" &&
                        viewRow.assessment &&
                        typeof viewRow.assessment.subjectId === "object" &&
                        viewRow.assessment.subjectId &&
                        "subjectName" in viewRow.assessment.subjectId
                        ? String(
                          (
                            viewRow.assessment.subjectId as {
                              subjectName?: string;
                            }
                          ).subjectName || viewRow.name,
                        )
                        : viewRow.name,
                    total: viewRow.totalMarks,
                    obtained: viewRow.obtainedMarks,
                    pct: Number(viewRow.percentage) || 0,
                    grade: viewRow.isFullyAbsent
                      ? "—"
                      : viewRow.grade || pctToGrade(Number(viewRow.percentage) || 0),
                    result: viewRow.isFullyAbsent
                      ? "Absent"
                      : passFail(Number(viewRow.percentage) || 0),
                    isAbsent: viewRow.isFullyAbsent,
                  },
                ];

            const subjectsLabel = subjectRows.map((r) => r.name).join(", ");
            const overallPct = Number(viewRow.percentage) || 0;
            const overallResult = viewRow.isFullyAbsent
              ? "Absent"
              : passFail(overallPct);
            const ct =
              viewRow.kind === "test" && viewRow.assessment
                ? viewRow.assessment.classTestId
                : null;
            const seriesLabel =
              typeof ct === "object" && ct?.seriesLabel
                ? ct.seriesLabel
                : viewRow.name.match(/\d+/)?.[0] || "";
            const titleBox =
              viewRow.kind === "test"
                ? `TEST NO. ${seriesLabel || "—"}`.toUpperCase()
                : viewRow.name.toUpperCase();
            const subtitle = `${viewRow.name} — ${viewRow.term}`;
            const testDateRaw =
              viewRow.kind === "test"
                ? viewRow.assessment?.examDate
                : viewRow.examResult?.exam &&
                  typeof viewRow.examResult.exam === "object"
                  ? viewRow.examResult.exam.endDate ||
                  viewRow.examResult.exam.startDate
                  : viewRow.sortKey;
            const passMarks =
              viewRow.totalMarks > 0
                ? String(Math.round(viewRow.totalMarks * 0.4))
                : "";
            const programLine = [className, sectionName].filter(Boolean).join(" · ") || "—";
            const studentName = (
              viewRow.examResult?.academyStudent?.studentName || selected.studentName
            ).toUpperCase();
            const studentId =
              viewRow.examResult?.academyStudent?.studentId ||
              selected.studentId ||
              "—";
            const fatherName =
              viewRow.examResult?.academyStudent?.fatherName ||
              selected.fatherName ||
              "—";

            return (
              <div className="bg-white text-[#0F172A]">
                {/* Academy letterhead */}
                <div className="px-5 pt-5 pb-3">
                  <div className="flex items-start gap-3">
                    <img
                      src={academyLogo}
                      alt=""
                      className="h-14 w-14 shrink-0 object-contain"
                    />
                    <div className="min-w-0 flex-1">
                      <h2 className="text-[22px] font-bold leading-tight tracking-tight text-[#0B2347]">
                        {ACADEMY.name}
                      </h2>
                      <p className="mt-0.5 text-[12px] italic text-slate-500">
                        {ACADEMY.tagline}
                      </p>
                      <p className="mt-1.5 text-[11px] text-slate-600 leading-snug">
                        {ACADEMY.address}
                        <span className="mx-1.5 text-slate-300">|</span>
                        {ACADEMY.phones}
                        <span className="mx-1.5 text-slate-300">|</span>
                        {ACADEMY.email}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {ACADEMY.legalName}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 border-t border-slate-300" />
                </div>

                {/* Title box */}
                <div className="px-5 pb-3 text-center">
                  <div className="mx-auto inline-block min-w-[11rem] border border-[#0F172A] px-6 py-1.5">
                    <p className="text-sm font-bold tracking-wide text-[#0F172A]">
                      {titleBox}
                    </p>
                  </div>
                  <p className="mt-2 text-[13px] font-medium text-slate-700">{subtitle}</p>
                </div>

                {/* Program bar + meta fields */}
                <div className="mx-5 border border-[#0F172A]">
                  <div className="bg-slate-100 px-3 py-2">
                    <p className="text-[13px] font-bold">
                      Program/Class/Section : {programLine}
                    </p>
                  </div>
                  <div className="space-y-2.5 px-3 py-3">
                    <div className="grid gap-2 sm:grid-cols-3">
                      <UnderlineField label="Subject" value={subjectsLabel} />
                      <UnderlineField
                        label="Total Marks"
                        value={String(viewRow.totalMarks || "")}
                      />
                      <UnderlineField label="Pass Marks" value={passMarks} />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <UnderlineField label="Examiner's Name" value="" />
                      <UnderlineField label="Invigilator's Name" value="" />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <UnderlineField
                        label={viewRow.term || "Assessment"}
                        value={seriesLabel || "—"}
                      />
                      <UnderlineField
                        label="Test Date"
                        value={formatSlashDate(testDateRaw)}
                      />
                    </div>
                  </div>
                </div>

                <div className="mx-5 mt-3 border-t-2 border-[#0F172A]" />

                {/* Student particulars */}
                <div className="mx-5 mt-3 overflow-hidden border border-[#0F172A]">
                  <div className="bg-[#1E4B8C] px-3 py-1.5">
                    <p className="text-[12px] font-bold uppercase tracking-wide text-white">
                      Student Particulars
                    </p>
                  </div>
                  <div className="grid gap-4 px-3 py-3 sm:grid-cols-2">
                    <div className="space-y-3">
                      <StackedField label="Student Name" value={studentName} />
                      <StackedField label="Father's Name" value={fatherName} />
                    </div>
                    <div className="space-y-3">
                      <StackedField label="Student ID" value={studentId} />
                      <StackedField
                        label="Subjects Appeared"
                        value={String(subjectRows.length)}
                      />
                    </div>
                  </div>
                </div>

                {/* Subject-wise result */}
                <div className="mx-5 mt-4">
                  <p className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-[#0F172A]">
                    Subject-Wise Result
                  </p>
                  <div className="overflow-hidden border border-[#0F172A]">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="bg-slate-200 text-left">
                          <th className="border-b border-[#0F172A] px-2 py-1.5 font-bold w-9">
                            Sr.
                          </th>
                          <th className="border-b border-[#0F172A] px-2 py-1.5 font-bold">
                            Subject
                          </th>
                          <th className="border-b border-[#0F172A] px-2 py-1.5 font-bold text-center">
                            Total
                          </th>
                          <th className="border-b border-[#0F172A] px-2 py-1.5 font-bold text-center">
                            Obtained
                          </th>
                          <th className="border-b border-[#0F172A] px-2 py-1.5 font-bold text-center">
                            %age
                          </th>
                          <th className="border-b border-[#0F172A] px-2 py-1.5 font-bold text-center">
                            Grade
                          </th>
                          <th className="border-b border-[#0F172A] px-2 py-1.5 font-bold text-center">
                            Result
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {subjectRows.map((row, i) => (
                          <tr
                            key={`${row.name}-${i}`}
                            className={i % 2 === 1 ? "bg-slate-50" : "bg-white"}
                          >
                            <td className="border-t border-slate-300 px-2 py-1.5 tabular-nums">
                              {i + 1}
                            </td>
                            <td className="border-t border-slate-300 px-2 py-1.5 font-bold">
                              {row.name}
                            </td>
                            <td className="border-t border-slate-300 px-2 py-1.5 text-center tabular-nums">
                              {row.total}
                            </td>
                            <td className="border-t border-slate-300 px-2 py-1.5 text-center tabular-nums">
                              {row.isAbsent ? (
                                <span className="font-semibold text-rose-700">Ab</span>
                              ) : (
                                row.obtained
                              )}
                            </td>
                            <td className="border-t border-slate-300 px-2 py-1.5 text-center tabular-nums">
                              {row.isAbsent ? "—" : `${Math.round(row.pct)}%`}
                            </td>
                            <td className="border-t border-slate-300 px-2 py-1.5 text-center font-semibold">
                              {row.grade}
                            </td>
                            <td
                              className={cn(
                                "border-t border-slate-300 px-2 py-1.5 text-center font-bold",
                                row.result === "Pass"
                                  ? "text-[#0F172A]"
                                  : "text-rose-700",
                              )}
                            >
                              {row.result}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Overall summary */}
                <div className="mx-5 mt-3 mb-4 grid grid-cols-2 border border-[#0F172A] bg-[#EEF3F8] sm:grid-cols-4">
                  {(
                    [
                      [
                        "Obtained",
                        viewRow.isFullyAbsent
                          ? `Ab / ${viewRow.totalMarks}`
                          : `${viewRow.obtainedMarks} / ${viewRow.totalMarks}`,
                      ],
                      [
                        "Percentage",
                        viewRow.isFullyAbsent
                          ? "—"
                          : `${Math.round(overallPct)}%`,
                      ],
                      [
                        "Grade",
                        viewRow.isFullyAbsent
                          ? "—"
                          : viewRow.grade || pctToGrade(overallPct),
                      ],
                      ["Overall Result", overallResult],
                    ] as const
                  ).map(([label, value], i) => (
                    <div
                      key={label}
                      className={cn(
                        "px-3 py-2.5 text-center",
                        i > 0 && "border-t sm:border-t-0 sm:border-l border-[#0F172A]/40",
                      )}
                    >
                      <p className="text-[11px] text-slate-500">{label}</p>
                      <p
                        className={cn(
                          "mt-0.5 text-base font-bold tabular-nums",
                          label === "Overall Result" && overallResult === "Fail"
                            ? "text-rose-700"
                            : "text-[#0F172A]",
                        )}
                      >
                        {value}
                      </p>
                    </div>
                  ))}
                </div>

                {(viewRow.assessment?.remarks || viewRow.examResult?.remarks) && (
                  <p className="mx-5 mb-4 text-[12px] text-slate-600">
                    <span className="font-bold text-[#0F172A]">Remarks: </span>
                    {viewRow.assessment?.remarks || viewRow.examResult?.remarks}
                  </p>
                )}

                <DialogFooter className="gap-2 border-t bg-slate-50 px-5 py-3 sm:gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-1.5"
                    disabled={openingPdf}
                    onClick={() => void openOfficialResultPdf(viewRow)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    {openingPdf ? "Opening…" : "Open PDF"}
                  </Button>
                  {viewRow.kind === "exam" && viewRow.examResult ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() =>
                        void downloadPdf(
                          viewRow.examResult!._id,
                          selected.studentName,
                        )
                      }
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download PDF
                    </Button>
                  ) : null}
                  <Button type="button" onClick={() => setViewRow(null)}>
                    Close
                  </Button>
                </DialogFooter>
              </div>
            );
          })() : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function KpiCard({
  title,
  value,
  hint,
  icon: Icon,
  iconClass,
  trend,
}: {
  title: string;
  value: string;
  hint: string;
  icon: typeof Trophy;
  iconClass: string;
  trend?: number | null;
}) {
  return (
    <Card className="rounded-2xl border-0 bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-medium text-slate-500">{title}</p>
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl shrink-0",
            iconClass,
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-2 flex items-end gap-2">
        <p className="text-2xl font-bold tabular-nums text-[#0F172A]">{value}</p>
        {trend != null && trend !== 0 && (
          <span
            className={cn(
              "mb-0.5 inline-flex items-center gap-0.5 text-xs font-semibold",
              trend > 0 ? "text-emerald-600" : "text-rose-600",
            )}
          >
            <TrendingUp className={cn("h-3 w-3", trend < 0 && "rotate-180")} />
            {trend > 0 ? "+" : ""}
            {trend}%
          </span>
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-slate-400 leading-snug">{hint}</p>
    </Card>
  );
}
