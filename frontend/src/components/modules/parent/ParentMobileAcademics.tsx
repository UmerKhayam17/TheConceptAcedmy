import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  FileText,
  FolderOpen,
  MapPin,
  Plane,
  UserRound,
} from "lucide-react";
import ParentMobilePageHeader from "@/components/modules/parent/ParentMobilePageHeader";
import { ParentOptionField } from "@/components/modules/parent/ParentOptionSheet";
import { useAuth } from "@/hooks/useAuth";
import { usePanelSessionOptional } from "@/components/panel-header/PanelSessionContext";
import { fetchAcademicCalendar, type CalendarEvent } from "@/lib/academicCalendarApi";
import { resolveUploadUrl } from "@/lib/api";
import {
  fetchAcademyStudents,
  fetchSubjectsByClass,
  getAcademyStudentRecord,
  type AcademyStudent,
  type AcademySubject,
} from "@/lib/studentManagementApi";
import { classLabel } from "@/components/modules/student-management/studentDisplayUtils";
import { subjectTheme } from "@/lib/subjectTheme";
import { cn } from "@/lib/utils";

type MainTab = "books" | "calendars" | "breakups";
type CalFilter = "activities" | "academic" | "keydates" | "session";

const MAIN_TABS: { id: MainTab; label: string }[] = [
  { id: "books", label: "Book List" },
  { id: "calendars", label: "Calendars" },
  // Hidden until a real Term system exists (session currently has no Term 1/2 model).
  // { id: "breakups", label: "Term Breakups" },
];

const CAL_FILTERS: { id: CalFilter; label: string }[] = [
  { id: "activities", label: "Activities" },
  { id: "academic", label: "Academic Cal." },
  // { id: "keydates", label: "Key Dates" },
  // { id: "session", label: "Session Info" },
];

function refName(ref: unknown, key: string) {
  if (!ref || typeof ref !== "object") return "";
  const value = (ref as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function classSectionLine(student: AcademyStudent) {
  const rawClass = classLabel(student.classId);
  const className =
    rawClass && rawClass !== "—"
      ? /^class\b/i.test(rawClass)
        ? rawClass
        : `Class ${rawClass}`
      : "";
  const rawSection = refName(student.sectionId, "sectionName") || refName(student.sectionId, "name");
  const section = rawSection
    ? /^section\b/i.test(rawSection)
      ? rawSection
      : `Section ${rawSection}`
    : "";
  return [className, section].filter(Boolean).join(" · ");
}

function idOf(ref: unknown): string {
  if (!ref) return "";
  if (typeof ref === "string") return ref;
  if (typeof ref === "object" && "_id" in (ref as object)) return String((ref as { _id: string })._id || "");
  return "";
}

function subjectNameOf(ref: unknown): string {
  if (!ref) return "";
  if (typeof ref === "object") {
    const s = ref as { subjectName?: string; name?: string };
    return s.subjectName || s.name || "";
  }
  return "";
}

function formatEventDate(ymd: string) {
  if (!ymd || ymd.length < 10) return ymd || "";
  const d = new Date(`${ymd.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function eventIcon(kind: CalendarEvent["kind"]): LucideIcon {
  if (kind === "holiday" || kind === "vacation") return MapPin;
  if (kind === "test" || kind === "exam") return FileText;
  if (kind === "event") return Plane;
  return CalendarDays;
}

function matchesCalFilter(event: CalendarEvent, filter: CalFilter) {
  if (filter === "activities") {
    return ["event", "lesson_plan", "homework"].includes(event.kind);
  }
  if (filter === "academic") {
    return event.kind === "test" || event.kind === "exam";
  }
  if (filter === "keydates") {
    return event.kind === "holiday" || event.kind === "vacation";
  }
  return event.kind === "session";
}

function termBucket(event: CalendarEvent, sessionMid?: string): "Term 1" | "Term 2" {
  const blob = `${event.title} ${event.assessmentName || ""} ${event.notes || ""}`.toLowerCase();
  if (/term\s*2|second term|final/.test(blob)) return "Term 2";
  if (/term\s*1|first term|mid\s*term|midterm/.test(blob)) return "Term 1";
  if (sessionMid && event.startDate >= sessionMid) return "Term 2";
  return "Term 1";
}

type AssessmentGroup = {
  id: string;
  title: string;
  typeLabel: string;
  kind: "test" | "exam";
  startDate: string;
  endDate: string;
  papers: CalendarEvent[];
};

/** "Weekly Test" + "Test 1" → "Weekly Test 1" */
function assessmentGroupTitle(name: string, typeLabel: string) {
  const n = (name || "").trim();
  const t = (typeLabel || "").trim();
  if (!n && !t) return "Assessment";
  if (!t) return n;
  if (!n) return t;
  if (n.toLowerCase().includes(t.toLowerCase())) return n;
  if (/^test\s*\d+/i.test(n) && /test$/i.test(t)) {
    return `${t.replace(/\s*test$/i, "")} ${n}`.replace(/\s+/g, " ").trim();
  }
  return `${t}: ${n}`;
}

function groupAcademicEvents(events: CalendarEvent[]): AssessmentGroup[] {
  const map = new Map<string, AssessmentGroup>();
  for (const event of events) {
    if (event.kind !== "test" && event.kind !== "exam") continue;
    const name = (event.assessmentName || event.title || "Assessment").trim();
    const typeLabel = (event.assessmentTypeLabel || "").trim();
    const key = `${event.kind}|${name.toLowerCase()}|${typeLabel.toLowerCase()}`;
    const existing = map.get(key);
    if (existing) {
      existing.papers.push(event);
      if (event.startDate < existing.startDate) existing.startDate = event.startDate;
      if (event.endDate > existing.endDate) existing.endDate = event.endDate;
      continue;
    }
    map.set(key, {
      id: key,
      title: assessmentGroupTitle(name, typeLabel),
      typeLabel: typeLabel || (event.kind === "exam" ? "Exam" : "Test"),
      kind: event.kind,
      startDate: event.startDate,
      endDate: event.endDate || event.startDate,
      papers: [event],
    });
  }
  return [...map.values()]
    .map((group) => ({
      ...group,
      papers: [...group.papers].sort((a, b) =>
        String(a.subjectName || "").localeCompare(String(b.subjectName || ""), undefined, {
          numeric: true,
        }),
      ),
    }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function EmptyState({ icon: Icon, message }: { icon: LucideIcon; message: string }) {
  return (
    <div className="flex min-h-[52vh] flex-1 flex-col items-center justify-center px-6 text-center">
      <Icon className="h-14 w-14 text-[#94A3B8]" strokeWidth={1.5} />
      <p className="mt-4 max-w-[300px] text-[16px] font-semibold leading-snug text-[#334155]">{message}</p>
    </div>
  );
}

function StudentSwitcher({
  student,
  studentId,
  childList,
  childrenLoading,
  onSelect,
}: {
  student?: AcademyStudent | null;
  studentId: string;
  childList: AcademyStudent[];
  childrenLoading: boolean;
  onSelect: (id: string) => void;
}) {
  const display = childList.find((child) => child._id === studentId) || student || null;
  const photo = display?.photoImage ? resolveUploadUrl(display.photoImage) : "";
  const classLine = display ? classSectionLine(display) : "";

  return (
    <div className="mx-4 flex items-center gap-3 rounded-[16px] bg-[#FEF6DC] px-3 py-3">
      <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-white text-[#D97706]">
        {photo ? (
          <img src={photo} alt="" className="h-full w-full object-cover" />
        ) : (
          <UserRound className="h-6 w-6" strokeWidth={1.75} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        {childList.length > 1 ? (
          <ParentOptionField
            sheetTitle="Child"
            value={studentId}
            onChange={onSelect}
            options={childList.map((child) => ({ value: child._id, label: child.studentName }))}
            valueClassName="text-[18px] font-extrabold text-[#78350F]"
          />
        ) : (
          <p className="truncate text-[18px] font-extrabold text-[#78350F]">
            {childrenLoading ? "Loading…" : display?.studentName || "No child linked"}
          </p>
        )}
        <p className="mt-0.5 truncate text-[16px] font-bold text-[#92400E]">
          {classLine || "—"}
        </p>
      </div>
    </div>
  );
}

export default function ParentMobileAcademics({ studentId }: { studentId: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const panelSession = usePanelSessionOptional();
  const [tab, setTab] = useState<MainTab>("books");
  const [calFilter, setCalFilter] = useState<CalFilter>("academic");
  const [subjectId, setSubjectId] = useState("");
  const [term, setTerm] = useState("Term 1");
  const [breakupLoaded, setBreakupLoaded] = useState(false);
  const [breakupRows, setBreakupRows] = useState<{ title: string; detail: string }[]>([]);
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);

  const { data: children = [], isLoading: childrenLoading } = useQuery({
    queryKey: ["parent-children-academics", user?.id],
    queryFn: async () => {
      const { students } = await fetchAcademyStudents({ limit: 100 });
      return students as AcademyStudent[];
    },
    enabled: Boolean(user),
  });

  const { data: record, isLoading } = useQuery({
    queryKey: ["parent-academics-record", studentId],
    queryFn: () => getAcademyStudentRecord(studentId),
    enabled: Boolean(studentId && user),
  });

  const selectChild = (id: string) => {
    if (!id || id === studentId) return;
    try {
      localStorage.setItem("parent_selected_student_id", id);
    } catch {
      /* ignore */
    }
    setOpenGroupId(null);
    setSubjectId("");
    setBreakupLoaded(false);
    setBreakupRows([]);
    navigate(`/panel/parent/students/${id}`, { replace: true });
  };

  const student = record?.student;
  const classId = idOf(student?.classId);
  const sectionId = idOf(student?.sectionId);

  const { data: classSubjects = [] } = useQuery({
    queryKey: ["parent-academics-class-subjects", classId],
    queryFn: () => fetchSubjectsByClass(classId, { status: "active" }),
    enabled: Boolean(classId && user),
  });

  /** Only subjects this student is enrolled in (selectedSubjects, or full class if full package). */
  const subjects = useMemo((): AcademySubject[] => {
    const selected = student?.selectedSubjects || [];
    const selectedIds = new Set(
      selected
        .map((item) => (typeof item === "string" ? item : item?._id ? String(item._id) : ""))
        .filter(Boolean),
    );

    const fromEnrollment = (record?.enrollment?.subjects || []).filter(
      (s): s is AcademySubject => Boolean(s && typeof s === "object" && s._id),
    );
    if (fromEnrollment.length) {
      return [...fromEnrollment].sort((a, b) =>
        String(a.subjectName || "").localeCompare(String(b.subjectName || ""), undefined, {
          numeric: true,
        }),
      );
    }

    if (selectedIds.size > 0) {
      const fromClass = classSubjects.filter((s) => selectedIds.has(String(s._id)));
      if (fromClass.length) return fromClass;
      const populated = selected.filter(
        (s): s is AcademySubject => typeof s === "object" && Boolean(s?._id),
      );
      if (populated.length) {
        return [...populated].sort((a, b) =>
          String(a.subjectName || "").localeCompare(String(b.subjectName || ""), undefined, {
            numeric: true,
          }),
        );
      }
    }

    if (student?.isFullPackage) return classSubjects;
    return [];
  }, [record?.enrollment?.subjects, student, classSubjects]);

  const subjectOptions = subjects.map((s) => ({
    value: s._id,
    label: s.subjectName || "Subject",
  }));

  useEffect(() => {
    if (!subjectOptions.length) {
      setSubjectId("");
      return;
    }
    if (!subjectId || !subjectOptions.some((o) => o.value === subjectId)) {
      setSubjectId(subjectOptions[0].value);
    }
  }, [subjectOptions, subjectId]);

  const { data: calendar, isLoading: calLoading } = useQuery({
    queryKey: ["parent-academics-calendar", panelSession?.apiSessionId || "", classId, sectionId],
    queryFn: () =>
      fetchAcademicCalendar({
        sessionId: panelSession?.apiSessionId,
        classId: classId || undefined,
        sectionId: sectionId || undefined,
      }),
    enabled: Boolean(user && (tab === "calendars" || tab === "breakups")),
  });

  const sessionMid = useMemo(() => {
    const start = calendar?.session?.startDate;
    const end = calendar?.session?.endDate;
    if (!start || !end) return undefined;
    const a = new Date(`${start}T12:00:00`).getTime();
    const b = new Date(`${end}T12:00:00`).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
    const mid = new Date((a + b) / 2);
    return mid.toISOString().slice(0, 10);
  }, [calendar?.session]);

  const termOptions = useMemo(() => {
    const names = new Set<string>(["Term 1", "Term 2"]);
    for (const event of calendar?.events || []) {
      names.add(termBucket(event, sessionMid));
    }
    for (const assessment of record?.assessments?.records || []) {
      const label = `${assessment.title} ${assessment.assessmentType}`.toLowerCase();
      if (/term\s*2|final/.test(label)) names.add("Term 2");
      else names.add("Term 1");
    }
    return [...names];
  }, [calendar?.events, record?.assessments?.records, sessionMid]);

  const filteredEvents = useMemo(() => {
    const list = (calendar?.events || []).filter((e) => matchesCalFilter(e, calFilter));
    return [...list].sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [calendar?.events, calFilter]);

  const eventsByTerm = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of filteredEvents) {
      const key = termBucket(event, sessionMid);
      const list = map.get(key) || [];
      list.push(event);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [filteredEvents, sessionMid]);

  const academicGroupsByTerm = useMemo(() => {
    return eventsByTerm.map(([termLabel, events]) => [termLabel, groupAcademicEvents(events)] as const);
  }, [eventsByTerm]);

  const openGroup = useMemo(() => {
    if (!openGroupId) return null;
    for (const [, groups] of academicGroupsByTerm) {
      const match = groups.find((g) => g.id === openGroupId);
      if (match) return match;
    }
    return null;
  }, [academicGroupsByTerm, openGroupId]);

  useEffect(() => {
    setOpenGroupId(null);
  }, [calFilter, tab]);

  const loadBreakup = () => {
    if (!subjectId) return;
    const subject = subjects.find((s) => s._id === subjectId);
    const rows: { title: string; detail: string }[] = [];

    for (const assessment of record?.assessments?.records || []) {
      const sid = idOf(assessment.subjectId);
      const sname = subjectNameOf(assessment.subjectId);
      const matchesSubject =
        sid === subjectId ||
        (!sid && sname && subject && sname.toLowerCase() === subject.subjectName.toLowerCase());
      if (!matchesSubject) continue;
      const bucket = /term\s*2|final/i.test(`${assessment.title} ${assessment.assessmentType}`)
        ? "Term 2"
        : "Term 1";
      if (bucket !== term) continue;
      rows.push({
        title: assessment.title || assessment.assessmentType || "Assessment",
        detail: [
          formatEventDate(assessment.examDate),
          assessment.totalMarks != null ? `${assessment.obtainedMarks}/${assessment.totalMarks}` : "",
        ]
          .filter(Boolean)
          .join(" · "),
      });
    }

    for (const event of calendar?.events || []) {
      if (event.kind !== "test" && event.kind !== "exam") continue;
      if (termBucket(event, sessionMid) !== term) continue;
      const related =
        !event.subjectName ||
        !subject ||
        event.subjectName.toLowerCase() === subject.subjectName.toLowerCase();
      if (!related) continue;
      if (rows.some((r) => r.title === event.title && r.detail.includes(formatEventDate(event.startDate)))) {
        continue;
      }
      rows.push({
        title: event.title,
        detail: [formatEventDate(event.startDate), event.syllabus || event.assessmentTypeLabel || ""]
          .filter(Boolean)
          .join(" · "),
      });
    }

    setBreakupRows(rows);
    setBreakupLoaded(true);
  };

  useEffect(() => {
    setBreakupLoaded(false);
    setBreakupRows([]);
  }, [subjectId, term, studentId]);

  let body: ReactNode = null;

  if (tab === "books") {
    body = isLoading ? (
      <div className="mx-4 mt-4 h-28 animate-pulse rounded-2xl bg-white/70" />
    ) : subjects.length === 0 ? (
      <EmptyState icon={BookOpen} message="No enrolled subjects for this student." />
    ) : (
      <ul className="mx-4 mt-4 space-y-2.5">
        {subjects.map((subject) => {
          const theme = subjectTheme(subject._id, subject.subjectName);
          const Icon = theme.Icon;
          return (
            <li
              key={subject._id}
              className="flex items-center gap-3 rounded-[18px] bg-white px-3.5 py-3.5 shadow-[0_6px_18px_rgba(15,23,42,0.04)]"
            >
              <span
                className={cn(
                  "grid h-11 w-11 shrink-0 place-items-center rounded-[14px]",
                  theme.iconBox,
                  theme.icon,
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold text-[#102A43]">
                  {subject.subjectName}
                </span>
                <span className={cn("mt-0.5 block truncate text-[13px] font-medium", theme.text)}>
                  {[
                    subject.subjectCode,
                    subject.enrollmentType === "choice" ? "Elective" : "Core",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    );
  }

  if (tab === "calendars") {
    body = (
      <>
        {!openGroup ? (
          <div className="mx-4 mt-4 grid grid-cols-2 gap-2.5">
            {CAL_FILTERS.map((item) => {
              const active = calFilter === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCalFilter(item.id)}
                  className={cn(
                    "flex h-12 items-center justify-center gap-2 rounded-[14px] text-[14px] font-semibold transition-colors",
                    active
                      ? "bg-white text-[#22C5D6] shadow-[0_4px_14px_rgba(15,23,42,0.06)] ring-1 ring-[#D7EEF3]"
                      : "bg-[#E8EDF3] text-[#8B97A8]",
                  )}
                >
                  {item.id === "academic" || item.id === "keydates" ? (
                    <CalendarDays className={cn("h-4 w-4", active ? "text-[#22C5D6]" : "text-[#8B97A8]")} />
                  ) : null}
                  {item.label}
                </button>
              );
            })}
          </div>
        ) : null}

        {calFilter === "session" ? (
          <div className="mx-4 mt-4 rounded-[20px] bg-white p-4 shadow-[0_6px_18px_rgba(15,23,42,0.04)]">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#94A3B8]">Session</p>
            <p className="mt-2 text-[16px] font-bold text-[#102A43]">
              {calendar?.session?.name || panelSession?.selected?.name || "—"}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="text-[12px] text-[#94A3B8]">Starts</p>
                <p className="mt-1 text-[14px] font-semibold text-[#102A43]">
                  {formatEventDate(calendar?.session?.startDate || "") || "—"}
                </p>
              </div>
              <div>
                <p className="text-[12px] text-[#94A3B8]">Ends</p>
                <p className="mt-1 text-[14px] font-semibold text-[#102A43]">
                  {formatEventDate(calendar?.session?.endDate || "") || "—"}
                </p>
              </div>
            </div>
          </div>
        ) : openGroup ? (
          <div className="mx-4 mt-4 space-y-3">
            <button
              type="button"
              onClick={() => setOpenGroupId(null)}
              className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#22C5D6]"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
              Back to list
            </button>
            <div className="rounded-[20px] bg-white px-4 py-4 shadow-[0_6px_18px_rgba(15,23,42,0.04)]">
              <p className="text-[17px] font-bold text-[#102A43]">{openGroup.title}</p>
              <p className="mt-1 text-[13px] font-medium text-[#22C5D6]">
                {openGroup.typeLabel}
                {" · "}
                {openGroup.papers.length} subject{openGroup.papers.length === 1 ? "" : "s"}
              </p>
            </div>
            <ul className="space-y-2.5">
              {openGroup.papers.map((paper) => {
                const theme = subjectTheme(paper.subjectId || "", paper.subjectName);
                const Icon = theme.Icon;
                return (
                <li
                  key={paper.id}
                  className="rounded-[18px] bg-white px-4 py-3.5 shadow-[0_6px_18px_rgba(15,23,42,0.04)]"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "grid h-11 w-11 shrink-0 place-items-center rounded-[14px]",
                        theme.iconBox,
                        theme.icon,
                      )}
                    >
                      <Icon className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-bold text-[#102A43]">
                        {paper.subjectName || "Subject"}
                      </p>
                      <p className="mt-0.5 text-[13px] font-medium text-[#22C5D6]">
                        {[
                          formatEventDate(paper.startDate),
                          paper.totalMarks != null ? `${paper.totalMarks} marks` : "",
                        ]
                          .filter(Boolean)
                          .join(" · ") || paper.assessmentTypeLabel}
                      </p>
                      {paper.syllabus ? (
                        <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-[#475569]">
                          <span className="font-semibold text-[#64748B]">Syllabus: </span>
                          {paper.syllabus}
                        </p>
                      ) : (
                        <p className="mt-2 text-[13px] text-[#94A3B8]">No syllabus added yet.</p>
                      )}
                    </div>
                  </div>
                </li>
                );
              })}
            </ul>
          </div>
        ) : calLoading ? (
          <div className="mx-4 mt-4 h-28 animate-pulse rounded-2xl bg-white/70" />
        ) : calFilter === "academic" ? (
          academicGroupsByTerm.every(([, groups]) => groups.length === 0) ? (
            <EmptyState icon={CalendarDays} message="No calendar items for this filter." />
          ) : (
            <div className="mx-4 mt-4 space-y-5">
              {academicGroupsByTerm.map(([termLabel, groups]) =>
                groups.length === 0 ? null : (
                  <section key={termLabel}>
                    <h3 className="mb-2.5 text-[16px] font-bold text-[#102A43]">{termLabel}</h3>
                    <ul className="space-y-2.5">
                      {groups.map((group) => (
                        <li key={group.id}>
                          <button
                            type="button"
                            onClick={() => setOpenGroupId(group.id)}
                            className="flex w-full items-center gap-3 rounded-[18px] bg-white px-3.5 py-3.5 text-left shadow-[0_6px_18px_rgba(15,23,42,0.04)]"
                          >
                            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[#E7F8FB] text-[#22C5D6]">
                              <FileText className="h-5 w-5" strokeWidth={1.75} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[15px] font-bold text-[#102A43]">
                                {group.title}
                              </span>
                              <span className="mt-0.5 block truncate text-[13px] font-medium text-[#22C5D6]">
                                {group.typeLabel}
                                {" · "}
                                {group.papers.length} subject{group.papers.length === 1 ? "" : "s"}
                              </span>
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-[#CBD5E1]" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ),
              )}
            </div>
          )
        ) : eventsByTerm.every(([, events]) => events.length === 0) ? (
          <EmptyState icon={CalendarDays} message="No calendar items for this filter." />
        ) : (
          <div className="mx-4 mt-4 space-y-5">
            {eventsByTerm.map(([termLabel, events]) => (
              <section key={termLabel}>
                <h3 className="mb-2.5 text-[16px] font-bold text-[#102A43]">{termLabel}</h3>
                <ul className="space-y-2.5">
                  {events.map((event) => {
                    const Icon = eventIcon(event.kind);
                    return (
                      <li
                        key={event.id}
                        className="flex items-center gap-3 rounded-[18px] bg-white px-3.5 py-3.5 shadow-[0_6px_18px_rgba(15,23,42,0.04)]"
                      >
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[#E7F8FB] text-[#22C5D6]">
                          <Icon className="h-5 w-5" strokeWidth={1.75} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-bold text-[#102A43]">
                            {event.title}
                          </span>
                          <span className="mt-0.5 block truncate text-[13px] font-medium text-[#22C5D6]">
                            {event.assessmentTypeLabel ||
                              event.subjectName ||
                              formatEventDate(event.startDate) ||
                              event.kind}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </>
    );
  }

  if (tab === "breakups") {
    body = (
      <>
        <section className="mx-4 mt-4 rounded-[22px] bg-white p-4 shadow-[0_6px_18px_rgba(15,23,42,0.04)]">
          <ParentOptionField
            label="SUBJECT"
            sheetTitle="Subject"
            value={subjectId}
            options={subjectOptions}
            onChange={setSubjectId}
            placeholder={isLoading ? "Loading…" : "Select subject"}
            valueClassName="text-[15px] text-[#102A43]"
          />
          <div className="mt-5">
            <p className="text-[11px] font-semibold tracking-wide text-[#A8B3C0]">SELECT TERM</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {termOptions.map((item) => {
                const active = term === item;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setTerm(item)}
                    className={cn(
                      "h-10 rounded-full px-4 text-[14px] font-semibold",
                      active ? "bg-[#22C5D6] text-white" : "bg-[#EEF2F6] text-[#64748B]",
                    )}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            onClick={loadBreakup}
            disabled={!subjectId}
            className="mt-5 flex h-12 w-full items-center justify-center rounded-[14px] bg-[#7DD3DF] text-[15px] font-bold text-white disabled:opacity-50"
          >
            Load Term Breakup
          </button>
        </section>

        {!breakupLoaded ? (
          <EmptyState icon={FolderOpen} message="Select Subject & Term, then tap Load Term Breakup" />
        ) : breakupRows.length === 0 ? (
          <EmptyState icon={FolderOpen} message="No breakup items found for this subject and term." />
        ) : (
          <ul className="mx-4 mt-4 space-y-2.5">
            {breakupRows.map((row, index) => (
              <li
                key={`${row.title}-${index}`}
                className="rounded-[18px] bg-white px-4 py-3.5 shadow-[0_6px_18px_rgba(15,23,42,0.04)]"
              >
                <p className="text-[15px] font-bold text-[#102A43]">{row.title}</p>
                {row.detail ? (
                  <p className="mt-0.5 text-[13px] font-medium text-[#22C5D6]">{row.detail}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  return (
    <div className="min-h-full bg-white pb-10">
      <ParentMobilePageHeader
        title={openGroup ? openGroup.title : "Academics"}
        onBack={() => {
          if (openGroupId) {
            setOpenGroupId(null);
            return;
          }
          navigate("/panel/parent");
        }}
      />

      <div className="mt-2">
        {student || childrenLoading || children.length > 0 ? (
          <StudentSwitcher
            student={student}
            studentId={studentId}
            childList={children}
            childrenLoading={childrenLoading || isLoading}
            onSelect={selectChild}
          />
        ) : (
          <div className="mx-4 rounded-[16px] bg-white px-4 py-4 text-sm text-[#94A3B8]">
            Student not found.
          </div>
        )}
      </div>

      <div className="mt-3.5 grid grid-cols-2 border-b border-[#EEF2F6] bg-white">
        {MAIN_TABS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                "relative py-3.5 text-center text-[15px]",
                active ? "font-semibold text-[#22C5D6]" : "font-medium text-[#A8B3C0]",
              )}
            >
              {item.label}
              {active ? (
                <span className="absolute inset-x-8 bottom-0 h-[3px] rounded-full bg-[#22C5D6]" />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="pt-4">{body}</div>
    </div>
  );
}
