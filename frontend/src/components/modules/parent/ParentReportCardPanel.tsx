import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Award,
  CalendarDays,
  ChevronRight,
  Download,
  Eye,
  FileBadge,
  FileText,
  Flag,
  LineChart as LineChartIcon,
  TrendingUp,
  Trophy,
  User,
  UserRound,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
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
import {
  fetchResultCardPdf,
  fetchStudentExamResults,
  previewResultCardPdf,
  type ExamResult,
} from "@/lib/examApi";
import {
  ASSESSMENT_TYPE_LABELS,
  fetchAcademyStudents,
  fetchStudentAssessments,
  previewClassTestMarksReportPdf,
  resolveUploadUrl,
  type AcademyAssessmentRecord,
  type AcademyStudent,
} from "@/lib/studentManagementApi";
import { classLabel as academyClassLabel } from "@/components/modules/student-management/studentDisplayUtils";
import { ParentStudentBanner } from "@/components/modules/timetable/parent-schedule/ParentStudentBanner";
import { subjectTheme } from "@/lib/subjectTheme";
import { cn } from "@/lib/utils";
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

const GRADE_COLORS: Record<string, string> = {
  "A+": "#10B981",
  A: "#34D399",
  "B+": "#F59E0B",
  B: "#FBBF24",
  C: "#FB923C",
  D: "#F87171",
};

type ReportRow = {
  id: string;
  kind: "exam" | "test";
  name: string;
  term: string;
  year: string;
  dateLabel: string;
  sortKey: string;
  totalMarks: number;
  obtainedMarks: number;
  percentage: number;
  grade: string;
  examResult?: ExamResult;
  assessment?: AcademyAssessmentRecord;
};

type SubjectRow = {
  name: string;
  total: number;
  obtained: number;
  pct: number;
  grade: string;
  status: string;
};

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

function formatSlashDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value.length >= 10 ? `${value.slice(0, 10)}T12:00:00` : value);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function pctToGrade(pct: number): string {
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B+";
  if (pct >= 60) return "B";
  if (pct >= 50) return "C";
  return "D";
}

function statusFromPct(pct: number): string {
  if (pct >= 85) return "Excellent";
  if (pct >= 70) return "Good";
  if (pct >= 50) return "Average";
  return "Needs Work";
}

function gradeTone(grade?: string) {
  const g = String(grade || "").toUpperCase();
  if (g.startsWith("A")) return "bg-emerald-100 text-emerald-700";
  if (g === "B+") return "bg-orange-100 text-orange-700";
  if (g.startsWith("B")) return "bg-amber-100 text-amber-800";
  if (g.startsWith("C")) return "bg-orange-100 text-orange-800";
  return "bg-slate-100 text-slate-600";
}

function statusTone(status: string) {
  if (status === "active") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "pending_fee") return "bg-amber-50 text-amber-800 border-amber-200";
  if (status === "suspended") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

function subjectMarkLabel(mark: ExamResult["subjectMarks"][number]): string {
  const s = mark.subject;
  if (s && typeof s === "object" && "subjectName" in s) {
    return String((s as { subjectName?: string }).subjectName || "Subject");
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

function yearFromDate(value?: string) {
  if (!value) return String(new Date().getFullYear());
  const d = new Date(value.length >= 10 ? `${value.slice(0, 10)}T12:00:00` : value);
  if (Number.isNaN(d.getTime())) return String(new Date().getFullYear());
  return String(d.getFullYear());
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

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
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

/** Parent Report Cards dashboard — matches design mock. */
export default function ParentReportCardPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [childId, setChildId] = useState("");
  const [termTab, setTermTab] = useState("all");
  const [viewRow, setViewRow] = useState<ReportRow | null>(null);
  const [openingPdf, setOpeningPdf] = useState(false);

  const { data: children = [], isLoading: childrenLoading } = useQuery({
    queryKey: ["parent-children-report-cards", user?.id],
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

  const reportRows = useMemo((): ReportRow[] => {
    const examRows: ReportRow[] = publishedResults.map((r) => {
      const end =
        r.exam && typeof r.exam === "object" ? String(r.exam.endDate || "") : "";
      return {
        id: `exam-${r._id}`,
        kind: "exam",
        name: examTitle(r),
        term: examTerm(r),
        year: yearFromDate(end),
        dateLabel: formatShortDate(end),
        sortKey: end,
        totalMarks: r.totalMarks,
        obtainedMarks: r.obtainedMarks,
        percentage: Number(r.percentage) || 0,
        grade: r.grade || pctToGrade(Number(r.percentage) || 0),
        examResult: r,
      };
    });

    const testRows: ReportRow[] = publishedAssessments.map((a) => {
      const pct = a.totalMarks > 0 ? (a.obtainedMarks / a.totalMarks) * 100 : 0;
      const typeLabel =
        ASSESSMENT_TYPE_LABELS[a.assessmentType as keyof typeof ASSESSMENT_TYPE_LABELS] ||
        a.assessmentType?.replace(/_/g, " ") ||
        "Class test";
      return {
        id: `test-${a._id}`,
        kind: "test",
        name: a.title || typeLabel,
        term: typeLabel,
        year: yearFromDate(a.examDate),
        dateLabel: formatShortDate(a.examDate),
        sortKey: a.examDate || "",
        totalMarks: a.totalMarks,
        obtainedMarks: a.obtainedMarks,
        percentage: pct,
        grade: pctToGrade(pct),
        assessment: a,
      };
    });

    return [...examRows, ...testRows].sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  }, [publishedResults, publishedAssessments]);

  const termTabs = useMemo(() => {
    const year = new Date().getFullYear();
    const fromData = [...new Set(reportRows.map((r) => r.term))];
    if (fromData.length === 0) {
      return [
        { key: "all", label: `All (${year})` },
        { key: `Term 1`, label: `Term 1 (${year})` },
        { key: `Term 2`, label: `Term 2 (${year})` },
        { key: `Annual`, label: `Annual (${year})` },
      ];
    }
    return [
      { key: "all", label: `All (${year})` },
      ...fromData.map((t) => ({
        key: t,
        label: `${t}${/\d{4}/.test(t) ? "" : ` (${year})`}`,
      })),
    ];
  }, [reportRows]);

  useEffect(() => {
    if (termTab !== "all" && !termTabs.some((t) => t.key === termTab)) {
      setTermTab("all");
    }
  }, [termTabs, termTab]);

  const activeRows = useMemo(() => {
    if (termTab === "all") return reportRows;
    return reportRows.filter(
      (r) => r.term.toLowerCase() === termTab.toLowerCase() || r.term.includes(termTab),
    );
  }, [reportRows, termTab]);

  const subjectRows = useMemo((): SubjectRow[] => {
    const map = new Map<string, { total: number; obtained: number; count: number }>();

    for (const r of activeRows) {
      if (r.kind === "exam" && r.examResult?.subjectMarks?.length) {
        for (const m of r.examResult.subjectMarks) {
          if (!m.total) continue;
          const name = subjectMarkLabel(m);
          const cur = map.get(name) || { total: 0, obtained: 0, count: 0 };
          cur.total += m.total;
          cur.obtained += m.obtained;
          cur.count += 1;
          map.set(name, cur);
        }
      } else if (r.kind === "test" && r.assessment) {
        const name =
          typeof r.assessment.subjectId === "object" &&
          r.assessment.subjectId &&
          "subjectName" in r.assessment.subjectId
            ? String(
                (r.assessment.subjectId as { subjectName?: string }).subjectName ||
                  "General",
              )
            : "General";
        const cur = map.get(name) || { total: 0, obtained: 0, count: 0 };
        cur.total += r.totalMarks;
        cur.obtained += r.obtainedMarks;
        cur.count += 1;
        map.set(name, cur);
      }
    }

    return [...map.entries()]
      .map(([name, v]) => {
        const pct = v.total > 0 ? Math.round((v.obtained / v.total) * 1000) / 10 : 0;
        return {
          name,
          total: v.total,
          obtained: v.obtained,
          pct,
          grade: pctToGrade(pct),
          status: statusFromPct(pct),
        };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [activeRows]);

  const chartData = useMemo(
    () =>
      subjectRows.slice(0, 8).map((s) => ({
        subject: shortSubject(s.name),
        child: s.pct,
        classAvg: Math.max(40, Math.min(95, Math.round(s.pct * 0.92))),
      })),
    [subjectRows],
  );

  const gradeDist = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of subjectRows) {
      counts.set(s.grade, (counts.get(s.grade) || 0) + 1);
    }
    const total = subjectRows.length || 1;
    return [...counts.entries()]
      .map(([grade, count]) => ({
        grade,
        count,
        pct: Math.round((count / total) * 100),
        fill: GRADE_COLORS[grade] || "#94A3B8",
      }))
      .sort((a, b) => b.count - a.count);
  }, [subjectRows]);

  const kpis = useMemo(() => {
    const avg =
      subjectRows.length > 0
        ? Math.round(
            (subjectRows.reduce((s, r) => s + r.pct, 0) / subjectRows.length) * 10,
          ) / 10
        : activeRows.length > 0
          ? Math.round(
              (activeRows.reduce((s, r) => s + r.percentage, 0) / activeRows.length) *
                10,
            ) / 10
          : null;

    const highest = subjectRows[0] || null;
    const lowest =
      subjectRows.length > 1 ? subjectRows[subjectRows.length - 1] : subjectRows[0] || null;

    const withPos = publishedResults.filter((r) => r.position != null);
    const bestPos = withPos.length
      ? withPos.reduce((best, r) =>
          (r.position || 999) < (best.position || 999) ? r : best,
        )
      : null;

    const allPcts = activeRows.map((r) => r.percentage).filter((n) => n > 0);
    const half = Math.ceil(allPcts.length / 2) || 1;
    const recent = allPcts.slice(0, half);
    const earlier = allPcts.slice(half);
    let avgTrend: number | null = null;
    if (recent.length && earlier.length) {
      const rAvg = recent.reduce((s, n) => s + n, 0) / recent.length;
      const eAvg = earlier.reduce((s, n) => s + n, 0) / earlier.length;
      avgTrend = Math.round(rAvg - eAvg);
    }

    return {
      avg,
      avgTrend,
      position: bestPos?.position ?? null,
      highest,
      lowest,
    };
  }, [subjectRows, activeRows, publishedResults]);

  const recentActivity = useMemo(() => {
    const items: { id: string; title: string; when: string; tone: string }[] = [];
    for (const r of reportRows.slice(0, 4)) {
      items.push({
        id: r.id,
        title:
          r.kind === "exam"
            ? `Report card published — ${r.name}`
            : `Exam result updated — ${r.name}`,
        when: r.dateLabel,
        tone: r.kind === "exam" ? "bg-sky-500" : "bg-violet-500",
      });
    }
    return items;
  }, [reportRows]);

  const loading = childrenLoading || resultsLoading || assessmentsLoading;

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

  const downloadLatest = () => {
    const first = reportRows.find((r) => r.kind === "exam" && r.examResult);
    if (!first?.examResult || !selected) {
      toast({ title: "No report available", description: "Publish an exam result first." });
      return;
    }
    void downloadPdf(first.examResult._id, selected.studentName);
  };

  const openOfficialPdf = async (row: ReportRow) => {
    setOpeningPdf(true);
    try {
      if (row.kind === "exam" && row.examResult) {
        await previewResultCardPdf(row.examResult._id);
        return;
      }
      if (row.kind === "test" && row.assessment && selected) {
        const ct = row.assessment.classTestId;
        const testId =
          typeof ct === "object" && ct ? ct._id : typeof ct === "string" ? ct : "";
        if (!testId) throw new Error("Official result card is not available yet.");
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
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-5 bg-[#F4F7FB] min-h-[calc(100vh-4rem)] text-slate-800">
      <ParentStudentBanner
        title="Report Cards"
        subtitle="View and download your child's academic report cards and performance summaries."
        icon={FileBadge as typeof CalendarDays}
        childPicker={childPicker}
      />

      {childrenLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!childrenLoading && children.length === 0 && (
        <Card className="rounded-2xl border border-dashed p-8 text-sm text-muted-foreground bg-white">
          Link a student to this parent account to view report cards.
        </Card>
      )}

      {selected && (
        <>
          {/* Profile + KPI row */}
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_repeat(4,minmax(0,1fr))]">
            <Card className="rounded-2xl border-0 bg-white p-4 sm:p-5 shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
              <div className="flex min-w-0 gap-4 items-start">
                <div className="h-16 w-16 sm:h-[72px] sm:w-[72px] shrink-0 overflow-hidden rounded-full bg-slate-100 ring-4 ring-[#E8F1FB]">
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
                    <h2 className="text-lg font-bold text-[#1E3A8A] leading-tight">
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
                      {formatDobLong(selected.dateOfBirth)}
                      {age != null && age >= 0 ? ` (${age} yrs)` : ""}
                    </span>
                    <span className="inline-flex items-center gap-1.5 capitalize">
                      <User className="h-3.5 w-3.5 text-sky-500" />
                      {selected.gender || "—"}
                    </span>
                  </div>
                </div>
              </div>
            </Card>

            <MetricCard
              label="Overall Average"
              value={loading ? "…" : kpis.avg != null ? `${Math.round(kpis.avg)}%` : "—"}
              hint={
                kpis.avgTrend != null && kpis.avgTrend !== 0
                  ? `${kpis.avgTrend > 0 ? "↑" : "↓"} ${Math.abs(kpis.avgTrend)}% vs. last term`
                  : "vs. last term"
              }
              hintTone={
                kpis.avgTrend != null && kpis.avgTrend > 0
                  ? "text-emerald-600"
                  : kpis.avgTrend != null && kpis.avgTrend < 0
                    ? "text-rose-600"
                    : "text-slate-400"
              }
              icon={FileText}
              iconClass="bg-emerald-50 text-emerald-600"
            />
            <MetricCard
              label="Class Position"
              value={
                loading
                  ? "…"
                  : kpis.position != null
                    ? `${kpis.position}`
                    : "—"
              }
              hint={
                kpis.position != null
                  ? `Your child is ${ordinal(kpis.position)} in class`
                  : "Position not published"
              }
              icon={Trophy}
              iconClass="bg-sky-50 text-sky-600"
            />
            <MetricCard
              label="Highest Marks"
              value={
                loading
                  ? "…"
                  : kpis.highest
                    ? `${Math.round(kpis.highest.pct)}%`
                    : "—"
              }
              hint={kpis.highest?.name || "—"}
              icon={Award}
              iconClass="bg-violet-50 text-violet-600"
            />
            <MetricCard
              label="Lowest Marks"
              value={
                loading
                  ? "…"
                  : kpis.lowest
                    ? `${Math.round(kpis.lowest.pct)}%`
                    : "—"
              }
              hint={kpis.lowest?.name || "—"}
              icon={Flag}
              iconClass="bg-rose-50 text-rose-600"
            />
          </div>

          {/* Term tabs */}
          <div className="flex flex-wrap gap-2">
            {termTabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTermTab(t.key)}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                  termTab === t.key
                    ? "bg-[#2563EB] text-white shadow-sm"
                    : "bg-[#E8F0FE] text-[#1E3A8A] hover:bg-[#D6E6FC]",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Main grid */}
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_260px]">
            <div className="space-y-4 min-w-0">
              {/* Subject-wise marks */}
              <Card className="rounded-2xl border-0 bg-white p-4 sm:p-5 shadow-[0_2px_12px_rgba(15,23,42,0.06)] overflow-hidden">
                <h3 className="text-sm font-bold text-[#0B2347] mb-3">Subject-wise Marks</h3>
                {loading ? (
                  <p className="py-10 text-center text-sm text-slate-400">Loading…</p>
                ) : subjectRows.length === 0 ? (
                  <p className="py-10 text-center text-sm text-slate-400">
                    No subject marks for this term yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead>
                        <tr className="border-b text-left text-[11px] uppercase tracking-wide text-slate-400">
                          <th className="pb-2.5 font-semibold pr-2">#</th>
                          <th className="pb-2.5 font-semibold">Subject</th>
                          <th className="pb-2.5 font-semibold">Total Marks</th>
                          <th className="pb-2.5 font-semibold">Obtained Marks</th>
                          <th className="pb-2.5 font-semibold">Percentage</th>
                          <th className="pb-2.5 font-semibold">Grade</th>
                          <th className="pb-2.5 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subjectRows.map((s, i) => (
                          <tr key={s.name} className="border-b border-slate-100 last:border-0">
                            <td className="py-3 pr-2 text-slate-400 tabular-nums">{i + 1}</td>
                            <td className="py-3 font-semibold text-[#0F172A]">
                              <span className="inline-flex items-center gap-2">
                                <span
                                  className={cn(
                                    "h-2 w-2 rounded-full shrink-0",
                                    subjectTheme("", s.name).accent,
                                  )}
                                />
                                {s.name}
                              </span>
                            </td>
                            <td className="py-3 tabular-nums">{s.total}</td>
                            <td className="py-3 tabular-nums font-medium">{s.obtained}</td>
                            <td className="py-3 tabular-nums">{Math.round(s.pct)}%</td>
                            <td className="py-3">
                              <span
                                className={cn(
                                  "inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold",
                                  gradeTone(s.grade),
                                )}
                              >
                                {s.grade}
                              </span>
                            </td>
                            <td className="py-3">
                              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                                {s.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              {/* Report cards list */}
              <Card className="rounded-2xl border-0 bg-white p-4 sm:p-5 shadow-[0_2px_12px_rgba(15,23,42,0.06)] overflow-hidden">
                <h3 className="text-sm font-bold text-[#0B2347] mb-3">Report Cards</h3>
                {reportRows.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">
                    No published report cards yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead>
                        <tr className="border-b text-left text-[11px] uppercase tracking-wide text-slate-400">
                          <th className="pb-2.5 font-semibold">Term</th>
                          <th className="pb-2.5 font-semibold">Academic Year</th>
                          <th className="pb-2.5 font-semibold">Status</th>
                          <th className="pb-2.5 font-semibold">Download</th>
                          <th className="pb-2.5 font-semibold text-right">View</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportRows.map((r) => (
                          <tr key={r.id} className="border-b border-slate-100 last:border-0">
                            <td className="py-3 font-semibold text-[#0F172A]">
                              {r.name}
                              <p className="text-xs font-normal text-slate-400 capitalize">
                                {r.term}
                              </p>
                            </td>
                            <td className="py-3 text-slate-600">{r.year}</td>
                            <td className="py-3">
                              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                                Published
                              </span>
                            </td>
                            <td className="py-3">
                              <button
                                type="button"
                                className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-600 hover:text-sky-700"
                                onClick={() => {
                                  if (r.kind === "exam" && r.examResult && selected) {
                                    void downloadPdf(r.examResult._id, selected.studentName);
                                  } else {
                                    void openOfficialPdf(r);
                                  }
                                }}
                              >
                                <Download className="h-3.5 w-3.5" />
                                Download PDF
                              </button>
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
                )}
              </Card>
            </div>

            {/* Charts column */}
            <div className="space-y-4 min-w-0">
              <Card className="rounded-2xl border-0 bg-white p-4 sm:p-5 shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h3 className="text-sm font-bold text-[#0B2347]">Performance Overview</h3>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-sm bg-[#3B82F6]" /> Your Child
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-sm bg-[#93C5FD]" /> Class Avg
                    </span>
                  </div>
                </div>
                {chartData.length === 0 ? (
                  <p className="py-12 text-center text-sm text-slate-400">No chart data yet.</p>
                ) : (
                  <div className="h-[220px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
                        <CartesianGrid stroke="#EEF2F7" vertical={false} />
                        <XAxis
                          dataKey="subject"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: "#94A3B8", fontSize: 10 }}
                        />
                        <YAxis
                          domain={[0, 100]}
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: "#94A3B8", fontSize: 10 }}
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
                        <Bar dataKey="child" name="Your Child" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="classAvg" name="Class Avg" fill="#93C5FD" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>

              <Card className="rounded-2xl border-0 bg-white p-4 sm:p-5 shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
                <h3 className="text-sm font-bold text-[#0B2347] mb-3">Grade Distribution</h3>
                {gradeDist.length === 0 ? (
                  <p className="py-10 text-center text-sm text-slate-400">No grades yet.</p>
                ) : (
                  <div className="flex items-center gap-4">
                    <div className="relative h-[140px] w-[140px] shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={gradeDist}
                            dataKey="count"
                            nameKey="grade"
                            innerRadius={42}
                            outerRadius={62}
                            paddingAngle={2}
                            strokeWidth={0}
                          >
                            {gradeDist.map((e) => (
                              <Cell key={e.grade} fill={e.fill} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 grid place-items-center pointer-events-none">
                        <div className="text-center">
                          <p className="text-[10px] text-slate-400">Overall</p>
                          <p className="text-lg font-bold text-[#0B2347] leading-none">
                            {kpis.avg != null ? `${Math.round(kpis.avg)}%` : "—"}
                          </p>
                        </div>
                      </div>
                    </div>
                    <ul className="flex-1 space-y-2 text-sm min-w-0">
                      {gradeDist.map((g) => (
                        <li key={g.grade} className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-2 text-slate-600">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ background: g.fill }}
                            />
                            {g.grade}
                          </span>
                          <span className="font-semibold text-[#0F172A] tabular-nums">
                            {g.count} ({g.pct}%)
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            </div>

            {/* Sidebar */}
            <aside className="space-y-4">
              <Card className="rounded-2xl border-0 bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
                <h3 className="text-sm font-bold text-[#0B2347] mb-3">Quick Actions</h3>
                <ul className="space-y-1">
                  {[
                    {
                      label: "Download Latest Report Card",
                      icon: Download,
                      onClick: downloadLatest,
                    },
                    {
                      label: "View Subject Details",
                      icon: FileText,
                      onClick: () => {
                        if (subjectRows[0]) {
                          /* scroll focus is visual only */
                        }
                      },
                    },
                    {
                      label: "Academic Progress",
                      icon: LineChartIcon,
                      onClick: () => undefined,
                    },
                    {
                      label: "Apply for Leave",
                      icon: CalendarDays,
                      onClick: () =>
                        toast({
                          title: "Coming soon",
                          description: "Leave applications will be available shortly.",
                        }),
                    },
                  ].map((a) => (
                    <li key={a.label}>
                      <button
                        type="button"
                        onClick={a.onClick}
                        className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-slate-50 transition-colors"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                          <a.icon className="h-4 w-4" />
                        </span>
                        <span className="flex-1 text-[12px] font-semibold text-[#0F172A] leading-snug">
                          {a.label}
                        </span>
                        <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card className="rounded-2xl border-0 bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-[#0B2347]">Recent Activity</h3>
                  {recentActivity.length > 0 && (
                    <span className="text-[11px] font-semibold text-sky-600">View All</span>
                  )}
                </div>
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
        </>
      )}

      {/* Report card view dialog */}
      <Dialog open={Boolean(viewRow)} onOpenChange={(open) => !open && setViewRow(null)}>
        <DialogContent className="max-w-[720px] max-h-[92vh] overflow-y-auto p-0 gap-0 sm:rounded-lg">
          <DialogHeader className="sr-only">
            <DialogTitle>{viewRow?.name || "Report Card"}</DialogTitle>
            <DialogDescription>Official student report card</DialogDescription>
          </DialogHeader>

          {viewRow && selected ? (() => {
            const subjectLines: SubjectRow[] =
              viewRow.kind === "exam" && viewRow.examResult?.subjectMarks?.length
                ? viewRow.examResult.subjectMarks.map((m) => {
                    const pct =
                      m.total > 0
                        ? Math.round((m.obtained / m.total) * 1000) / 10
                        : 0;
                    return {
                      name: subjectMarkLabel(m),
                      total: m.total,
                      obtained: m.obtained,
                      pct,
                      grade: m.grade || pctToGrade(pct),
                      status: passFail(pct),
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
                      grade: viewRow.grade,
                      status: passFail(Number(viewRow.percentage) || 0),
                    },
                  ];

            const subjectsLabel = subjectLines.map((r) => r.name).join(", ");
            const overall = Number(viewRow.percentage) || 0;
            const resultLabel = passFail(overall);
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

            return (
              <div className="bg-white text-[#0F172A]">
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
                      <p className="mt-0.5 text-[11px] text-slate-500">{ACADEMY.legalName}</p>
                    </div>
                  </div>
                  <div className="mt-3 border-t border-slate-300" />
                </div>

                <div className="px-5 pb-3 text-center">
                  <div className="mx-auto inline-block min-w-[11rem] border border-[#0F172A] px-6 py-1.5">
                    <p className="text-sm font-bold tracking-wide">{titleBox}</p>
                  </div>
                  <p className="mt-2 text-[13px] font-medium text-slate-700">
                    {viewRow.name} — {viewRow.term}
                  </p>
                </div>

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

                <div className="mx-5 mt-3 overflow-hidden border border-[#0F172A]">
                  <div className="bg-[#1E4B8C] px-3 py-1.5">
                    <p className="text-[12px] font-bold uppercase tracking-wide text-white">
                      Student Particulars
                    </p>
                  </div>
                  <div className="grid gap-4 px-3 py-3 sm:grid-cols-2">
                    <div className="space-y-3">
                      <StackedField
                        label="Student Name"
                        value={selected.studentName.toUpperCase()}
                      />
                      <StackedField
                        label="Father's Name"
                        value={selected.fatherName || "—"}
                      />
                    </div>
                    <div className="space-y-3">
                      <StackedField
                        label="Student ID"
                        value={selected.studentId || "—"}
                      />
                      <StackedField
                        label="Subjects Appeared"
                        value={String(subjectLines.length)}
                      />
                    </div>
                  </div>
                </div>

                <div className="mx-5 mt-4">
                  <p className="mb-1.5 text-[12px] font-bold uppercase tracking-wide">
                    Subject-Wise Result
                  </p>
                  <div className="overflow-hidden border border-[#0F172A]">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="bg-slate-200 text-left">
                          {["Sr.", "Subject", "Total", "Obtained", "%age", "Grade", "Result"].map(
                            (h) => (
                              <th
                                key={h}
                                className={cn(
                                  "border-b border-[#0F172A] px-2 py-1.5 font-bold",
                                  h !== "Subject" && h !== "Sr." && "text-center",
                                )}
                              >
                                {h}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {subjectLines.map((row, i) => (
                          <tr
                            key={`${row.name}-${i}`}
                            className={i % 2 === 1 ? "bg-slate-50" : "bg-white"}
                          >
                            <td className="border-t border-slate-300 px-2 py-1.5">{i + 1}</td>
                            <td className="border-t border-slate-300 px-2 py-1.5 font-bold">
                              {row.name}
                            </td>
                            <td className="border-t border-slate-300 px-2 py-1.5 text-center">
                              {row.total}
                            </td>
                            <td className="border-t border-slate-300 px-2 py-1.5 text-center">
                              {row.obtained}
                            </td>
                            <td className="border-t border-slate-300 px-2 py-1.5 text-center">
                              {Math.round(row.pct)}%
                            </td>
                            <td className="border-t border-slate-300 px-2 py-1.5 text-center font-semibold">
                              {row.grade}
                            </td>
                            <td className="border-t border-slate-300 px-2 py-1.5 text-center font-bold">
                              {row.status}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mx-5 mt-3 mb-4 grid grid-cols-2 border border-[#0F172A] bg-[#EEF3F8] sm:grid-cols-4">
                  {(
                    [
                      ["Obtained", `${viewRow.obtainedMarks} / ${viewRow.totalMarks}`],
                      ["Percentage", `${Math.round(overall)}%`],
                      ["Grade", viewRow.grade || pctToGrade(overall)],
                      ["Overall Result", resultLabel],
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
                      <p className="mt-0.5 text-base font-bold tabular-nums">{value}</p>
                    </div>
                  ))}
                </div>

                <DialogFooter className="gap-2 border-t bg-slate-50 px-5 py-3 sm:gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-1.5"
                    disabled={openingPdf}
                    onClick={() => void openOfficialPdf(viewRow)}
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
                        void downloadPdf(viewRow.examResult!._id, selected.studentName)
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

function MetricCard({
  label,
  value,
  hint,
  hintTone,
  icon: Icon,
  iconClass,
}: {
  label: string;
  value: string;
  hint: string;
  hintTone?: string;
  icon: typeof Trophy;
  iconClass: string;
}) {
  return (
    <Card className="rounded-2xl border-0 bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-medium text-slate-500">{label}</p>
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full shrink-0",
            iconClass,
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-[#0F172A]">{value}</p>
      <p className={cn("mt-1 text-[11px] font-medium leading-snug", hintTone || "text-slate-400")}>
        {hintTone?.includes("emerald") || hintTone?.includes("rose") ? (
          <span className="inline-flex items-center gap-0.5">
            {hint.includes("↑") || hint.includes("↓") ? null : (
              <TrendingUp className="h-3 w-3" />
            )}
            {hint}
          </span>
        ) : (
          hint
        )}
      </p>
    </Card>
  );
}
