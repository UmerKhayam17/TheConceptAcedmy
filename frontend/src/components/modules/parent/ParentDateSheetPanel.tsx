import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  FileText,
  FlaskConical,
  Quote,
  User,
  UserRound,
} from "lucide-react";
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
  fetchAssessmentDateSheet,
  fetchSessions,
  fetchSubjects,
  previewAssessmentDateSheetPdf,
  type DateSheetRow,
} from "@/lib/configApi";
import { fetchStudentExamResults } from "@/lib/examApi";
import {
  ASSESSMENT_TYPE_LABELS,
  assessmentCategoryOf,
  assessmentTypeLabel,
  fetchAcademyStudents,
  fetchClassTests,
  resolveUploadUrl,
  type AcademyStudent,
} from "@/lib/studentManagementApi";
import { classLabel as academyClassLabel } from "@/components/modules/student-management/studentDisplayUtils";
import { formatDateSheetDate } from "@/components/modules/exams/dateSheetBatch";
import { ParentStudentBanner } from "@/components/modules/timetable/parent-schedule/ParentStudentBanner";
import {
  assignUniqueSubjectColors,
  colorForSubjectName,
  dotForSubjectName,
  subjectColorKey,
} from "@/components/modules/timetable/constants";
import { subjectIcon } from "@/lib/subjectTheme";
import { cn, formatWallClock } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import timetableBooks from "@/assets/timetable/timetable-books.png";

type ViewMode = "upcoming" | "past" | "full";

type SheetEntry = {
  id: string;
  dateRaw: string;
  dateLabel: string;
  dayName: string;
  subject: string;
  paperName: string;
  time: string;
  duration: string;
  venue: string;
  /** Normalized assessment type key when known (e.g. midterm, weekly). */
  typeKey: string;
  /** Display label for the assessment type. */
  typeLabel: string;
  category: "test" | "exam" | "other";
};

/** Map free-form exam.type / labels back to taxonomy keys. */
const LABEL_TO_TYPE_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(ASSESSMENT_TYPE_LABELS).flatMap(([key, label]) => [
    [key.toLowerCase(), key],
    [label.toLowerCase(), key],
    [label.toLowerCase().replace(/\s+/g, "_"), key],
    [key.replace(/_/g, " ").toLowerCase(), key],
  ]),
);

function resolveAssessmentType(
  raw: string | undefined | null,
  fallbackCategory: "test" | "exam" | "other" = "other",
): { typeKey: string; typeLabel: string; category: "test" | "exam" | "other" } {
  const trimmed = String(raw || "").trim();
  if (!trimmed) {
    return {
      typeKey: fallbackCategory,
      typeLabel: fallbackCategory === "exam" ? "Exam" : fallbackCategory === "test" ? "Test" : "Assessment",
      category: fallbackCategory,
    };
  }
  const normalized = trimmed.toLowerCase().replace(/\s+/g, "_");
  const typeKey =
    LABEL_TO_TYPE_KEY[trimmed.toLowerCase()] ||
    LABEL_TO_TYPE_KEY[normalized] ||
    (ASSESSMENT_TYPE_LABELS[trimmed as keyof typeof ASSESSMENT_TYPE_LABELS] ? trimmed : normalized);
  const fromTaxonomy = assessmentTypeLabel(typeKey);
  const typeLabel =
    fromTaxonomy && fromTaxonomy !== typeKey
      ? fromTaxonomy
      : trimmed.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const cat = assessmentCategoryOf(typeKey);
  return {
    typeKey,
    typeLabel,
    category: cat || fallbackCategory,
  };
}

function typeBadgeClass(category: SheetEntry["category"]) {
  if (category === "exam") {
    return "rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-violet-50 text-violet-700 border border-violet-100";
  }
  if (category === "test") {
    return "rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-100";
  }
  return "rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200";
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

function toYmd(raw?: string): string | null {
  if (!raw?.trim()) return null;
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayYmd() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function parseDate(raw: string): Date | null {
  if (!raw) return null;
  const d = new Date(raw.length >= 10 ? `${raw.slice(0, 10)}T12:00:00` : raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDayName(raw: string) {
  const d = parseDate(raw);
  return d ? d.toLocaleDateString(undefined, { weekday: "short" }) : "—";
}

function formatExamTime(time?: string) {
  if (!time?.trim()) return "—";
  const raw = time.trim();
  if (raw.includes("-")) {
    const label = raw
      .split("-")
      .map((part) => formatWallClock(part) || part.trim())
      .filter(Boolean)
      .join(" – ");
    return label || "—";
  }
  return formatWallClock(raw) || raw;
}

function estimateDuration(time?: string) {
  if (!time?.trim() || !time.includes("-")) return "—";
  const parts = time.split("-").map((p) => p.trim());
  if (parts.length < 2) return "—";
  const toMins = (t: string) => {
    const ampm = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (ampm) {
      let h = Number(ampm[1]);
      const m = Number(ampm[2]);
      const ap = ampm[3].toUpperCase();
      if (ap === "PM" && h < 12) h += 12;
      if (ap === "AM" && h === 12) h = 0;
      return h * 60 + m;
    }
    const hhmm = t.match(/^(\d{1,2}):(\d{2})$/);
    if (hhmm) return Number(hhmm[1]) * 60 + Number(hhmm[2]);
    return null;
  };
  const a = toMins(parts[0]);
  const b = toMins(parts[1]);
  if (a == null || b == null || b <= a) return "—";
  const mins = b - a;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h} hr ${m} min`;
  if (h) return `${h} hr`;
  return `${m} min`;
}

function statusTone(status: string) {
  if (status === "active") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "pending_fee") return "bg-amber-50 text-amber-800 border-amber-200";
  if (status === "suspended") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

/** Parent Date Sheet dashboard — matches design mock. */
export default function ParentDateSheetPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [childId, setChildId] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("upcoming");
  const [typeFilter, setTypeFilter] = useState("all");
  const [calMonth, setCalMonth] = useState(() => new Date());
  const [viewEntry, setViewEntry] = useState<SheetEntry | null>(null);
  const [printing, setPrinting] = useState(false);

  const { data: children = [], isLoading: childrenLoading } = useQuery({
    queryKey: ["parent-children-date-sheet", user?.id],
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
    queryKey: ["academic-sessions", "parent-date-sheet"],
    queryFn: () => fetchSessions(),
  });

  const sessionId = useMemo(() => {
    if (classSessionId) return classSessionId;
    const active = sessions.find((s) => s.isActive || s.status === "active");
    return active?._id || sessions[0]?._id || "";
  }, [classSessionId, sessions]);

  const { data: dateSheetPayload, isLoading: sheetLoading } = useQuery({
    queryKey: ["parent-date-sheet", sessionId, classId, sectionId],
    queryFn: () =>
      fetchAssessmentDateSheet(sessionId, {
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

  /** Full subject catalog — same source as admin Class Board for identical colors. */
  const { data: allSubjectsRaw = [] } = useQuery({
    queryKey: ["config-subjects", "all"],
    queryFn: () => fetchSubjects(),
    staleTime: 60_000,
  });

  const entries = useMemo((): SheetEntry[] => {
    const list: SheetEntry[] = [];
    const seen = new Set<string>();

    const push = (e: SheetEntry) => {
      if (seen.has(e.id)) return;
      seen.add(e.id);
      list.push(e);
    };

    for (const row of (dateSheetPayload?.rows || []) as DateSheetRow[]) {
      const id = `ds-${row.classTestId || row.examId || row.assignmentId || row.testName}-${row.examDate}-${row.subjectId}`;
      const resolved = resolveAssessmentType(
        row.assessmentType || row.assessmentTypeLabel || row.category,
        row.category === "exam" ? "exam" : "test",
      );
      push({
        id,
        dateRaw: row.examDate,
        dateLabel: formatDateSheetDate(row.examDate),
        dayName: formatDayName(row.examDate),
        subject: row.subjectName || "General",
        paperName: row.testName || row.assessmentTypeLabel || resolved.typeLabel || "Assessment",
        time: "—",
        duration: "—",
        venue: "TBA",
        typeKey: resolved.typeKey,
        typeLabel: row.assessmentTypeLabel || resolved.typeLabel,
        category: resolved.category,
      });
    }

    for (const r of examResults.filter((x) => x.isPublished)) {
      const exam = r.exam;
      if (!exam || typeof exam !== "object" || !Array.isArray(exam.dateSheet)) continue;
      exam.dateSheet.forEach((row, i) => {
        const subj =
          typeof row.subject === "object" && row.subject && "subjectName" in row.subject
            ? String((row.subject as { subjectName?: string }).subjectName || "Subject")
            : "Subject";
        const dateRaw = String(row.date || "");
        const resolved = resolveAssessmentType(
          typeof exam.type === "string" ? exam.type : "exam",
          "exam",
        );
        push({
          id: `exam-ds-${r._id}-${i}`,
          dateRaw,
          dateLabel: formatDateSheetDate(dateRaw),
          dayName: formatDayName(dateRaw),
          subject: subj,
          paperName: String(exam.title || "Exam"),
          time: "—",
          duration: "—",
          venue: "TBA",
          typeKey: resolved.typeKey,
          typeLabel: resolved.typeLabel,
          category: "exam",
        });
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
      const time = formatExamTime(t.testTime);
      const resolved = resolveAssessmentType(t.assessmentType, "test");
      push({
        id: `ct-${t._id}`,
        dateRaw: t.examDate,
        dateLabel: formatDateSheetDate(t.examDate),
        dayName: formatDayName(t.examDate),
        subject: subj || "General",
        paperName: t.title || resolved.typeLabel || "Assessment",
        time,
        duration: estimateDuration(t.testTime),
        venue: "TBA",
        typeKey: resolved.typeKey,
        typeLabel: resolved.typeLabel,
        category: resolved.category === "other" ? "test" : resolved.category,
      });
    }

    return list.sort((a, b) => a.dateRaw.localeCompare(b.dateRaw));
  }, [dateSheetPayload, examResults, classTests, sectionId]);

  /** Dynamic type chips/options from assessments that actually exist for this child. */
  const typeOptions = useMemo(() => {
    const map = new Map<string, { key: string; label: string; category: SheetEntry["category"] }>();
    for (const e of entries) {
      if (!e.typeKey) continue;
      if (!map.has(e.typeKey)) {
        map.set(e.typeKey, {
          key: e.typeKey,
          label: e.typeLabel || assessmentTypeLabel(e.typeKey) || e.typeKey,
          category: e.category,
        });
      }
    }
    const sorted = [...map.values()].sort((a, b) => {
      if (a.category !== b.category) {
        if (a.category === "test") return -1;
        if (b.category === "test") return 1;
      }
      return a.label.localeCompare(b.label);
    });
    return sorted;
  }, [entries]);

  useEffect(() => {
    if (typeFilter === "all") return;
    if (!typeOptions.some((t) => t.key === typeFilter)) {
      setTypeFilter("all");
    }
  }, [typeFilter, typeOptions]);

  const filteredByType = useMemo(() => {
    if (typeFilter === "all") return entries;
    return entries.filter((e) => e.typeKey === typeFilter);
  }, [entries, typeFilter]);

  const today = todayYmd();

  const filtered = useMemo(() => {
    if (viewMode === "full") return filteredByType;
    if (viewMode === "upcoming") {
      return filteredByType.filter((e) => {
        const ymd = toYmd(e.dateRaw);
        return ymd != null && ymd >= today;
      });
    }
    return filteredByType.filter((e) => {
      const ymd = toYmd(e.dateRaw);
      return ymd != null && ymd < today;
    });
  }, [filteredByType, viewMode, today]);

  const stats = useMemo(() => {
    const source = typeFilter === "all" ? entries : filteredByType;
    const upcoming = source.filter((e) => {
      const ymd = toYmd(e.dateRaw);
      return ymd != null && ymd >= today;
    });
    const thisMonth = upcoming.filter((e) => {
      const d = parseDate(e.dateRaw);
      if (!d) return false;
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    return {
      total: source.length,
      tests: source.filter((e) => e.category === "test").length,
      exams: source.filter((e) => e.category === "exam").length,
      upcomingMonth: thisMonth.length,
      upcomingTotal: upcoming.length,
    };
  }, [entries, filteredByType, typeFilter, today]);

  const calCursor = calMonth;
  const calYear = calCursor.getFullYear();
  const calMo = calCursor.getMonth();
  const daysInCal = new Date(calYear, calMo + 1, 0).getDate();
  const firstDow = new Date(calYear, calMo, 1).getDay();
  const calLabel = calCursor.toLocaleString(undefined, { month: "long", year: "numeric" });

  const examsByDay = useMemo(() => {
    const map = new Map<number, SheetEntry[]>();
    for (const e of entries) {
      const d = parseDate(e.dateRaw);
      if (!d || d.getMonth() !== calMo || d.getFullYear() !== calYear) continue;
      const day = d.getDate();
      const list = map.get(day) || [];
      list.push(e);
      map.set(day, list);
    }
    return map;
  }, [entries, calMo, calYear]);

  /** Same unique-per-subject palette as admin Class Board / Timetable Builder. */
  const subjectColorByKey = useMemo(() => {
    const names: string[] = [];
    for (const s of allSubjectsRaw) {
      if (s.name?.trim()) names.push(s.name);
    }
    if (!names.length) {
      for (const e of entries) {
        if (e.subject?.trim()) names.push(e.subject);
      }
    }
    return assignUniqueSubjectColors(names);
  }, [allSubjectsRaw, entries]);

  const legendSubjects = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of entries) {
      const name = (e.subject || "").trim();
      if (!name) continue;
      const key = subjectColorKey(name);
      if (!map.has(key)) map.set(key, name);
    }
    return [...map.entries()]
      .map(([key, name]) => ({
        key,
        name,
        dot: dotForSubjectName(name, subjectColorByKey),
        Icon: subjectIcon(name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [entries, subjectColorByKey]);

  const reminders = useMemo(() => {
    const upcoming = entries
      .filter((e) => {
        const ymd = toYmd(e.dateRaw);
        return ymd != null && ymd >= today;
      })
      .slice(0, 2);
    const items = upcoming.map((e) => ({
      id: e.id,
      text: `${e.subject} ${e.paperName} on ${e.dateLabel}`,
      dot: dotForSubjectName(e.subject, subjectColorByKey),
    }));
    items.push(
      {
        id: "id-card",
        text: "Bring your school ID card",
        dot: "bg-amber-500",
      },
      {
        id: "no-phone",
        text: "No mobile phones allowed in exam hall",
        dot: "bg-red-500",
      },
    );
    return items;
  }, [entries, today, subjectColorByKey]);

  const downloadDateSheet = async () => {
    if (!sessionId || !classId) {
      toast({
        title: "Date sheet unavailable",
        description: "Select a child with a class first.",
        variant: "destructive",
      });
      return;
    }
    setPrinting(true);
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
      setPrinting(false);
    }
  };

  const loading = childrenLoading || sheetLoading;

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

  const tableTitle =
    viewMode === "upcoming"
      ? "Upcoming Exams"
      : viewMode === "past"
        ? "Past Exams"
        : "Full Academic Year";

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-5 bg-background min-h-[calc(100vh-4rem)] text-slate-800">
      <ParentStudentBanner
        title="Date Sheet"
        subtitle="View your child's upcoming and past exam schedule."
        icon={CalendarDays}
        childPicker={childPicker}
      />

      {childrenLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!childrenLoading && children.length === 0 && (
        <Card className="rounded-2xl border border-dashed p-8 text-sm text-muted-foreground bg-white">
          Link a student to this parent account to view the date sheet.
        </Card>
      )}

      {selected && (
        <>
          {/* Profile + motivation (single banner like mock) */}
          <Card className="rounded-2xl border border-slate-100/80 bg-white p-4 sm:p-5 shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 gap-4 items-center">
                <div className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-full bg-slate-100 ring-4 ring-primary/10">
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
                    <h2 className="text-lg font-bold text-primary leading-tight">
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
                      Date of Birth: {formatDobLong(selected.dateOfBirth)}
                      {age != null && age >= 0 ? ` (Age: ${age} years)` : ""}
                    </span>
                    <span className="inline-flex items-center gap-1.5 capitalize">
                      <User className="h-3.5 w-3.5 text-sky-500" />
                      Gender: {selected.gender || "—"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 lg:max-w-sm lg:shrink-0">
                <Quote className="h-5 w-5 text-primary/50 shrink-0" />
                <p className="flex-1 text-sm italic text-primary leading-snug font-medium">
                  Good luck for your exams. You can do it!
                </p>
                <img
                  src={timetableBooks}
                  alt=""
                  className="h-16 w-auto object-contain pointer-events-none select-none shrink-0"
                  draggable={false}
                />
              </div>
            </div>
          </Card>

          {/* Filters row */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="grid w-full min-w-0 grid-cols-1 gap-2 min-[420px]:grid-cols-3 sm:flex sm:w-auto sm:flex-wrap">
              {(
                [
                  { key: "upcoming" as const, label: "Upcoming Exams" },
                  { key: "past" as const, label: "Past Exams" },
                  { key: "full" as const, label: "Full Academic Year" },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setViewMode(t.key)}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-semibold transition-colors border",
                    viewMode === t.key
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-white text-primary border-primary/25 hover:bg-primary/5",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
              <select
                className="h-10 w-full rounded-xl border border-primary/25 bg-white px-3 text-sm text-primary font-medium sm:w-auto sm:min-w-[11rem]"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                aria-label="Filter by assessment type"
              >
                <option value="all">All types</option>
                {typeOptions.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                    {t.category === "exam" ? " (Exam)" : t.category === "test" ? " (Test)" : ""}
                  </option>
                ))}
              </select>
              <div className="flex h-10 w-full items-center rounded-xl border border-primary/25 bg-white px-3 text-sm font-medium text-primary sm:w-auto sm:min-w-[10.5rem]">
                Class {className}
                {sectionName ? ` - Section ${sectionName}` : ""}
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full gap-1.5 rounded-xl border-primary text-primary hover:bg-primary/5 hover:text-primary sm:w-auto"
                disabled={printing || !sessionId}
                onClick={() => void downloadDateSheet()}
              >
                <Download className="h-4 w-4" />
                {printing ? "Opening…" : "Download Date Sheet"}
              </Button>
            </div>
          </div>

          {/* Main + sidebar */}
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-4 min-w-0">
              <Card className="rounded-2xl border border-slate-100/80 bg-white p-0 shadow-[0_2px_12px_rgba(15,23,42,0.06)] overflow-hidden">
                <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3">
                  <h3 className="inline-flex items-center gap-2 text-sm font-bold text-primary">
                    <CalendarDays className="h-4 w-4 text-primary" />
                    {tableTitle}
                  </h3>
                </div>
                {loading ? (
                  <p className="py-12 text-center text-sm text-slate-400">Loading date sheet…</p>
                ) : filtered.length === 0 ? (
                  <p className="py-12 text-center text-sm text-slate-400">
                    No exams in this view yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto px-2 sm:px-3 pb-3">
                    <table className="w-full min-w-[960px] text-sm">
                      <thead>
                        <tr className="bg-primary/5 text-left text-[11px] uppercase tracking-wide text-primary/70">
                          <th className="py-2.5 pl-3 font-semibold pr-2 rounded-l-lg">#</th>
                          <th className="py-2.5 font-semibold">Date</th>
                          <th className="py-2.5 font-semibold">Day</th>
                          <th className="py-2.5 font-semibold">Subject</th>
                          <th className="py-2.5 font-semibold">Type</th>
                          <th className="py-2.5 font-semibold">Paper / Exam Name</th>
                          <th className="py-2.5 font-semibold">Time</th>
                          <th className="py-2.5 font-semibold">Duration</th>
                          <th className="py-2.5 font-semibold">Venue</th>
                          <th className="py-2.5 pr-3 font-semibold text-right rounded-r-lg">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((e, i) => (
                          <tr
                            key={e.id}
                            className="border-b border-slate-100 last:border-0"
                          >
                            <td className="py-3 pl-3 pr-2 text-slate-400 tabular-nums">
                              {i + 1}
                            </td>
                            <td className="py-3 whitespace-nowrap font-medium text-[#0F172A]">
                              {e.dateLabel}
                            </td>
                            <td className="py-3 text-slate-600">{e.dayName}</td>
                            <td className="py-3">
                              <span
                                className={cn(
                                  "rounded-full px-2.5 py-0.5 text-[11px] font-semibold border",
                                  colorForSubjectName(e.subject, subjectColorByKey),
                                )}
                              >
                                {e.subject}
                              </span>
                            </td>
                            <td className="py-3">
                              <span className={typeBadgeClass(e.category)}>{e.typeLabel}</span>
                            </td>
                            <td className="py-3 font-semibold text-[#0F172A]">{e.paperName}</td>
                            <td className="py-3 whitespace-nowrap text-slate-600">{e.time}</td>
                            <td className="py-3 whitespace-nowrap text-slate-600">{e.duration}</td>
                            <td className="py-3 whitespace-nowrap text-slate-600">{e.venue}</td>
                            <td className="py-3 pr-3 text-right">
                              <Button
                                type="button"
                                size="sm"
                                className="h-8 gap-1 rounded-lg bg-primary hover:bg-primary/90"
                                onClick={() => setViewEntry(e)}
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

              {/* Type-wise summary from created assessments */}
              <Card className="rounded-2xl border border-slate-100/80 bg-white p-4 sm:p-5 shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
                <div className="mb-4 space-y-3">
                  <h3 className="text-sm font-bold text-primary">
                    Schedule by Assessment Type
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setTypeFilter("all")}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors border",
                        typeFilter === "all"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-white text-primary border-primary/25 hover:bg-primary/5",
                      )}
                    >
                      All
                    </button>
                    {typeOptions.map((t) => {
                      const active = typeFilter === t.key;
                      return (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() =>
                            setTypeFilter((prev) => (prev === t.key ? "all" : t.key))
                          }
                          className={cn(
                            "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors border",
                            active
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-white text-primary border-primary/25 hover:bg-primary/5",
                          )}
                        >
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {typeOptions.length === 0 ? (
                  <p className="text-sm text-slate-400 py-2">
                    No tests or exams scheduled for this child yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <StatTile
                      icon={CalendarDays}
                      iconClass="bg-sky-50 text-sky-600"
                      value={String(stats.total)}
                      label="Total Papers"
                      hint={typeFilter === "all" ? "All types" : "Selected type"}
                    />
                    <StatTile
                      icon={BookOpen}
                      iconClass="bg-sky-50 text-sky-700"
                      value={String(stats.tests)}
                      label="Tests"
                      hint="Weekly / monthly / unit"
                    />
                    <StatTile
                      icon={FlaskConical}
                      iconClass="bg-violet-50 text-violet-600"
                      value={String(stats.exams)}
                      label="Exams"
                      hint="Mid term / final / papers"
                    />
                    <StatTile
                      icon={Clock3}
                      iconClass="bg-amber-50 text-amber-600"
                      value={String(stats.upcomingMonth)}
                      label="Upcoming"
                      hint={`${stats.upcomingTotal} total upcoming`}
                    />
                  </div>
                )}
              </Card>
            </div>

            <aside className="space-y-4">
              {/* Mini calendar — ring markers like mock */}
              <Card className="rounded-2xl border border-slate-100/80 bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-bold text-primary">Exam Calendar</h3>
                  <div className="flex gap-0.5">
                    <button
                      type="button"
                      className="h-7 w-7 rounded-md grid place-items-center hover:bg-slate-100 text-slate-500"
                      onClick={() =>
                        setCalMonth(new Date(calYear, calMo - 1, 1))
                      }
                      aria-label="Previous month"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="h-7 w-7 rounded-md grid place-items-center hover:bg-slate-100 text-slate-500"
                      onClick={() =>
                        setCalMonth(new Date(calYear, calMo + 1, 1))
                      }
                      aria-label="Next month"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <p className="text-xs font-semibold text-primary mb-3">{calLabel}</p>
                <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-slate-400 mb-1">
                  {WEEKDAYS.map((d) => (
                    <div key={d}>{d.slice(0, 2)}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1 place-items-center">
                  {Array.from({ length: firstDow }).map((_, i) => (
                    <div key={`b-${i}`} className="h-8 w-8" />
                  ))}
                  {Array.from({ length: daysInCal }).map((_, i) => {
                    const day = i + 1;
                    const dayExams = examsByDay.get(day) || [];
                    const has = dayExams.length > 0;
                    return (
                      <div
                        key={day}
                        className={cn(
                          "relative h-8 w-8 rounded-full text-xs font-semibold grid place-items-center",
                          has
                            ? cn(
                                "text-white shadow-sm",
                                dotForSubjectName(dayExams[0].subject, subjectColorByKey),
                              )
                            : "text-slate-500",
                        )}
                        title={
                          has
                            ? dayExams.map((x) => x.subject).join(", ")
                            : undefined
                        }
                      >
                        {day}
                      </div>
                    );
                  })}
                </div>
                {legendSubjects.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                    {legendSubjects.map((s) => (
                      <span
                        key={s.key}
                        className="inline-flex items-center gap-1.5"
                        title={s.name}
                      >
                        <span
                          className={cn(
                            "inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10",
                            s.dot,
                          )}
                          aria-hidden
                        />
                        <s.Icon className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                        {s.name}
                      </span>
                    ))}
                  </div>
                )}
              </Card>

              <Card className="rounded-2xl border border-slate-100/80 bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
                <h3 className="text-sm font-bold text-primary mb-3">Quick Actions</h3>
                <ul className="space-y-0.5">
                  {[
                    {
                      label: "View Full Date Sheet",
                      hint: "See complete exam schedule",
                      icon: FileText,
                      onClick: () => setViewMode("full"),
                    },
                    {
                      label: "Download Date Sheet",
                      hint: "Get PDF version",
                      icon: Download,
                      onClick: () => void downloadDateSheet(),
                    },
                    {
                      label: "View Subject Details",
                      hint: "Check syllabus & exam pattern",
                      icon: BookOpen,
                      onClick: () =>
                        toast({
                          title: "Subject details",
                          description: "Open a row with View for paper details.",
                        }),
                    },
                    {
                      label: "Apply for Leave",
                      hint: "Request leave for exams",
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
                        className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-primary/5 transition-colors"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <a.icon className="h-4 w-4" />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[12px] font-semibold text-[#0F172A] leading-snug">
                            {a.label}
                          </span>
                          <span className="block text-[10px] text-slate-400 mt-0.5">
                            {a.hint}
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card className="rounded-2xl border border-slate-100/80 bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="inline-flex items-center gap-1.5 text-sm font-bold text-primary">
                    <Bell className="h-3.5 w-3.5 text-primary" />
                    Important Reminders
                  </h3>
                  <button
                    type="button"
                    className="text-[11px] font-semibold text-primary hover:underline"
                    onClick={() => setViewMode("upcoming")}
                  >
                    View All
                  </button>
                </div>
                <ul className="space-y-2.5">
                  {reminders.length === 0 ? (
                    <li className="text-[12px] text-slate-400">No upcoming reminders.</li>
                  ) : (
                    reminders.map((r) => (
                      <li key={r.id} className="flex gap-2.5 text-[12px] text-slate-600">
                        <span
                          className={cn(
                            "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                            r.dot,
                          )}
                        />
                        <span className="leading-snug">{r.text}</span>
                      </li>
                    ))
                  )}
                </ul>
              </Card>
            </aside>
          </div>
        </>
      )}

      <Dialog open={Boolean(viewEntry)} onOpenChange={(open) => !open && setViewEntry(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{viewEntry?.paperName || "Exam details"}</DialogTitle>
            <DialogDescription>
              {viewEntry?.subject}
              {viewEntry?.dateLabel ? ` · ${viewEntry.dateLabel}` : ""}
            </DialogDescription>
          </DialogHeader>
          {viewEntry && (
            <div className="space-y-3 text-sm">
              <DetailRow label="Day" value={viewEntry.dayName} />
              <DetailRow label="Time" value={viewEntry.time} />
              <DetailRow label="Duration" value={viewEntry.duration} />
              <DetailRow label="Venue" value={viewEntry.venue} />
              <DetailRow label="Type" value={viewEntry.typeLabel || "—"} />
              <DetailRow
                label="Category"
                value={
                  viewEntry.category === "exam"
                    ? "Exam"
                    : viewEntry.category === "test"
                      ? "Test"
                      : "Assessment"
                }
              />
            </div>
          )}
          <DialogFooter>
            <Button type="button" onClick={() => setViewEntry(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
      <span className="text-slate-400 text-xs font-semibold uppercase tracking-wide">
        {label}
      </span>
      <span className="font-semibold text-[#0F172A] capitalize">{value}</span>
    </div>
  );
}

function StatTile({
  icon: Icon,
  iconClass,
  value,
  label,
  hint,
}: {
  icon: typeof CalendarDays;
  iconClass: string;
  value: string;
  label: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-primary/15 bg-primary/[0.03] p-3.5">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl shrink-0",
            iconClass,
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-slate-500">{label}</p>
          <p className="text-xl font-bold tabular-nums text-[#0F172A] leading-tight">
            {value}
          </p>
          <p className="text-[10px] text-slate-400">{hint}</p>
        </div>
      </div>
    </div>
  );
}
