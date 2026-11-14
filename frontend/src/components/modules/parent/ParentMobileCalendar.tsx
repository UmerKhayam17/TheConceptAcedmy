import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileText,
  GraduationCap,
  PartyPopper,
  Sun,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePanelSessionOptional } from "@/components/panel-header/PanelSessionContext";
import ParentChildSelectBanner, {
  useParentSelectedChild,
} from "@/components/modules/parent/ParentChildSelectBanner";
import ParentEmptyMessage from "@/components/modules/parent/ParentEmptyMessage";
import ParentMobilePageHeader from "@/components/modules/parent/ParentMobilePageHeader";
import { fetchAcademicCalendar, type CalendarEvent } from "@/lib/academicCalendarApi";
import {
  getAcademyStudentRecord,
  type AcademyStudent,
} from "@/lib/studentManagementApi";
import { cn } from "@/lib/utils";

/** Visual group for each calendar item kind. */
type Group = "holiday" | "exam" | "test" | "event" | "class";

const GROUP_STYLE: Record<Group, { label: string; dot: string; chip: string; badge: string; Icon: LucideIcon }> = {
  holiday: { label: "Holiday", dot: "bg-[#F43F5E]", chip: "bg-[#FFE4E6] text-[#BE123C]", badge: "bg-[#FFE4E6] text-[#BE123C]", Icon: Sun },
  exam: { label: "Exam", dot: "bg-[#7C3AED]", chip: "bg-[#EDE9FE] text-[#6D28D9]", badge: "bg-[#EDE9FE] text-[#6D28D9]", Icon: GraduationCap },
  test: { label: "Test", dot: "bg-[#0EA5E9]", chip: "bg-[#E0F2FE] text-[#0369A1]", badge: "bg-[#E0F2FE] text-[#0369A1]", Icon: FileText },
  event: { label: "Event", dot: "bg-[#F59E0B]", chip: "bg-[#FEF3C7] text-[#B45309]", badge: "bg-[#FEF3C7] text-[#B45309]", Icon: PartyPopper },
  class: { label: "Class work", dot: "bg-[#0867cc]", chip: "bg-[#CCFBF1] text-[#0F766E]", badge: "bg-[#CCFBF1] text-[#0F766E]", Icon: BookOpen },
};

const LEGEND: Group[] = ["holiday", "exam", "test", "event"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function groupOf(kind: CalendarEvent["kind"]): Group | null {
  if (kind === "holiday" || kind === "vacation") return "holiday";
  if (kind === "exam") return "exam";
  if (kind === "test") return "test";
  if (kind === "event") return "event";
  if (kind === "homework" || kind === "lesson_plan") return "class";
  return null; // "session" rows are not shown as items
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function ymdOf(year: number, monthIndex: number, day: number) {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

function todayYmd() {
  const d = new Date();
  return ymdOf(d.getFullYear(), d.getMonth(), d.getDate());
}

function shortDate(ymd: string) {
  const d = new Date(`${ymd.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function dateRange(start: string, end: string) {
  if (!end || end === start) return shortDate(start);
  return `${shortDate(start)} – ${shortDate(end)}`;
}

function idOf(ref: unknown): string {
  if (!ref) return "";
  if (typeof ref === "string") return ref;
  if (typeof ref === "object" && "_id" in (ref as object)) return String((ref as { _id: string })._id || "");
  return "";
}

/** Same naming as the Academics screen: "Weekly Test" + "Test 1" → "Weekly Test 1". */
function assessmentTitle(name: string, type: string) {
  if (!type) return name;
  if (name.toLowerCase().includes(type.toLowerCase())) return name;
  if (/^test\s*\d+/i.test(name) && /test$/i.test(type)) {
    return `${type.replace(/\s*test$/i, "")} ${name}`.replace(/\s+/g, " ").trim();
  }
  return `${type}: ${name}`;
}

/** One row in the list. Subject papers of the same test/exam are combined into one item. */
type Item = {
  key: string;
  group: Group;
  title: string;
  subtitle: string;
  startDate: string;
  endDate: string;
  tentative: boolean;
};

function buildItems(events: CalendarEvent[]): Item[] {
  const map = new Map<string, Item & { subjects: string[] }>();
  for (const e of events) {
    const group = groupOf(e.kind);
    if (!group) continue;
    const start = e.startDate;
    const end = e.endDate || e.startDate;
    if (group === "test" || group === "exam") {
      const name = (e.assessmentName || e.title || "Assessment").trim();
      const type = (e.assessmentTypeLabel || "").trim();
      const key = `${group}|${name.toLowerCase()}|${type.toLowerCase()}`;
      const existing = map.get(key);
      if (existing) {
        if (e.subjectName && !existing.subjects.includes(e.subjectName)) existing.subjects.push(e.subjectName);
        if (start < existing.startDate) existing.startDate = start;
        if (end > existing.endDate) existing.endDate = end;
        existing.tentative = existing.tentative || Boolean(e.tentative);
        continue;
      }
      const title = assessmentTitle(name, type);
      map.set(key, {
        key,
        group,
        title,
        subtitle: "",
        startDate: start,
        endDate: end,
        tentative: Boolean(e.tentative),
        subjects: e.subjectName ? [e.subjectName] : [],
      });
      continue;
    }
    const subtitle =
      group === "class"
        ? [e.kind === "homework" ? "Homework" : "Lesson plan", e.subjectName].filter(Boolean).join(" · ")
        : e.notes || e.description || "";
    map.set(`${e.kind}|${e.id}`, {
      key: `${e.kind}|${e.id}`,
      group,
      title: e.title,
      subtitle,
      startDate: start,
      endDate: end,
      tentative: Boolean(e.tentative),
      subjects: [],
    });
  }
  return [...map.values()]
    .map(({ subjects, ...item }) => ({
      ...item,
      subtitle:
        item.group === "test" || item.group === "exam"
          ? subjects.length
            ? `${subjects.length} subject${subjects.length === 1 ? "" : "s"} · ${subjects.join(", ")}`
            : GROUP_STYLE[item.group].label
          : item.subtitle,
    }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title));
}

function overlaps(item: { startDate: string; endDate: string }, from: string, to: string) {
  return item.startDate <= to && (item.endDate || item.startDate) >= from;
}

export default function ParentMobileCalendar({
  onBack,
  student: studentProp,
  loading: loadingProp,
}: {
  onBack: () => void;
  student?: AcademyStudent;
  loading?: boolean;
}) {
  const { user } = useAuth();
  const panelSession = usePanelSessionOptional();
  const { selected, selectedStudentId, childrenLoading } = useParentSelectedChild();
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const { data: record, isLoading: recordLoading } = useQuery({
    queryKey: ["parent-mobile-calendar-record", selectedStudentId],
    queryFn: () => getAcademyStudentRecord(selectedStudentId),
    enabled: Boolean(selectedStudentId),
  });

  const student = record?.student || selected || studentProp;
  const loading = Boolean(loadingProp) || childrenLoading || (Boolean(selectedStudentId) && recordLoading);
  const classId = idOf(student?.classId);
  const sectionId = idOf(student?.sectionId);

  const { data: calendar, isLoading: calLoading, isError } = useQuery({
    queryKey: ["parent-mobile-calendar", panelSession?.apiSessionId || "", classId, sectionId],
    queryFn: () =>
      fetchAcademicCalendar({
        sessionId: panelSession?.apiSessionId,
        classId: classId || undefined,
        sectionId: sectionId || undefined,
      }),
    enabled: Boolean(user && (classId || !selectedStudentId)),
  });

  const events = useMemo(() => calendar?.events || [], [calendar?.events]);
  const workingDays = useMemo(
    () => new Set((calendar?.session?.workingDays || []).map((d) => d.slice(0, 3).toLowerCase())),
    [calendar?.session?.workingDays],
  );

  const monthStart = ymdOf(cursor.year, cursor.month, 1);
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const monthEnd = ymdOf(cursor.year, cursor.month, daysInMonth);
  // Monday-first offset of the 1st of the month.
  const leadingBlanks = (new Date(cursor.year, cursor.month, 1).getDay() + 6) % 7;

  /** ymd → groups that have something on that day (for the dots). */
  const dotsByDay = useMemo(() => {
    const map = new Map<string, Set<Group>>();
    for (const e of events) {
      const group = groupOf(e.kind);
      if (!group || !overlaps(e, monthStart, monthEnd)) continue;
      const from = e.startDate < monthStart ? monthStart : e.startDate;
      const endRaw = e.endDate || e.startDate;
      const to = endRaw > monthEnd ? monthEnd : endRaw;
      const first = Number(from.slice(8, 10));
      const last = Number(to.slice(8, 10));
      for (let day = first; day <= last; day += 1) {
        const key = ymdOf(cursor.year, cursor.month, day);
        if (!map.has(key)) map.set(key, new Set());
        map.get(key)!.add(group);
      }
    }
    return map;
  }, [events, monthStart, monthEnd, cursor]);

  const listItems = useMemo(() => {
    const from = selectedDay || monthStart;
    const to = selectedDay || monthEnd;
    return buildItems(events.filter((e) => overlaps(e, from, to)));
  }, [events, selectedDay, monthStart, monthEnd]);

  const changeMonth = (delta: number) => {
    setSelectedDay(null);
    setCursor(({ year, month }) => {
      const next = month + delta;
      return { year: year + Math.floor(next / 12), month: ((next % 12) + 12) % 12 };
    });
  };

  const today = todayYmd();
  const isWorkingDay = (ymd: string) => {
    if (!workingDays.size) return true;
    const name = new Date(`${ymd}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short" }).toLowerCase();
    return workingDays.has(name.slice(0, 3));
  };

  return (
    <div className="min-h-full bg-white pb-10">
      <ParentMobilePageHeader title="Academic Calendar" onBack={onBack} />

      <ParentChildSelectBanner className="mt-1" />
      {loading && !student ? (
        <p className="mx-4 mt-2 text-center text-[13px] font-medium text-[#64748B]">Loading child…</p>
      ) : null}

      {/* Month card */}
      <section className="mx-4 mt-4 rounded-[22px] bg-white px-3 pb-3 pt-3.5 shadow-[0_8px_24px_rgba(15,23,42,0.07)] ring-1 ring-[#EEF2F6]">
        <div className="flex items-center justify-between px-1">
          <button
            type="button"
            onClick={() => changeMonth(-1)}
            aria-label="Previous month"
            className="grid h-9 w-9 place-items-center rounded-full bg-[#F1F5F9] text-[#334155] active:bg-[#E2E8F0]"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <p className="text-[17px] font-extrabold text-[#102A43]">
            {MONTHS[cursor.month]} {cursor.year}
          </p>
          <button
            type="button"
            onClick={() => changeMonth(1)}
            aria-label="Next month"
            className="grid h-9 w-9 place-items-center rounded-full bg-[#F1F5F9] text-[#334155] active:bg-[#E2E8F0]"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-7 text-center">
          {WEEKDAYS.map((d) => (
            <span key={d} className="pb-1.5 text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">
              {d}
            </span>
          ))}
          {Array.from({ length: leadingBlanks }).map((_, i) => (
            <span key={`blank-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const ymd = ymdOf(cursor.year, cursor.month, day);
            const dots = [...(dotsByDay.get(ymd) || [])];
            const isSelected = selectedDay === ymd;
            const isToday = today === ymd;
            const offDay = !isWorkingDay(ymd);
            const isHoliday = dots.includes("holiday");
            return (
              <button
                key={ymd}
                type="button"
                onClick={() => setSelectedDay(isSelected ? null : ymd)}
                className="flex h-12 flex-col items-center justify-center"
                aria-label={`${day} ${MONTHS[cursor.month]}`}
                aria-pressed={isSelected}
              >
                <span
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-full text-[14px] font-semibold",
                    isSelected
                      ? "bg-[#0867cc] text-white"
                      : isToday
                        ? "text-[#0c4a9e] ring-2 ring-[#0867cc]"
                        : isHoliday
                          ? "text-[#E11D48]"
                          : offDay
                            ? "text-[#CBD5E1]"
                            : "text-[#1E293B]",
                  )}
                >
                  {day}
                </span>
                <span className="mt-0.5 flex h-1.5 items-center gap-0.5">
                  {dots.slice(0, 3).map((g) => (
                    <span key={g} className={cn("h-1.5 w-1.5 rounded-full", GROUP_STYLE[g].dot)} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 border-t border-[#EEF2F6] pt-3">
          {LEGEND.map((g) => (
            <span key={g} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#64748B]">
              <span className={cn("h-2 w-2 rounded-full", GROUP_STYLE[g].dot)} />
              {GROUP_STYLE[g].label}
            </span>
          ))}
        </div>
      </section>

      {/* Items */}
      <div className="mx-4 mt-5 flex items-center justify-between">
        <h2 className="text-[16px] font-extrabold text-[#102A43]">
          {selectedDay ? shortDate(selectedDay) : `This month`}
        </h2>
        {selectedDay ? (
          <button
            type="button"
            onClick={() => setSelectedDay(null)}
            className="text-[13px] font-semibold text-[#0867cc]"
          >
            Show whole month
          </button>
        ) : (
          <span className="text-[13px] font-semibold text-[#94A3B8]">
            {listItems.length} item{listItems.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {calLoading ? (
        <div className="mx-4 mt-3 space-y-2.5">
          {[0, 1].map((i) => (
            <div key={i} className="h-[74px] animate-pulse rounded-[18px] bg-[#F1F5F9]" />
          ))}
        </div>
      ) : isError ? (
        <ParentEmptyMessage>Couldn&apos;t load the calendar. Please try again.</ParentEmptyMessage>
      ) : listItems.length === 0 ? (
        <ParentEmptyMessage className="min-h-[36vh]">
          <CalendarDays className="mx-auto mb-3 h-10 w-10 text-[#94A3B8]" strokeWidth={1.5} />
          {selectedDay ? "Nothing planned on this day." : "Nothing planned this month."}
        </ParentEmptyMessage>
      ) : (
        <ul className="mx-4 mt-3 space-y-2.5">
          {listItems.map((item) => {
            const style = GROUP_STYLE[item.group];
            const start = new Date(`${item.startDate}T12:00:00`);
            return (
              <li
                key={item.key}
                className="flex items-center gap-3 rounded-[18px] bg-white px-3 py-3 shadow-[0_6px_18px_rgba(15,23,42,0.05)] ring-1 ring-[#F1F5F9]"
              >
                <span
                  className={cn(
                    "flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-[14px]",
                    style.badge,
                  )}
                >
                  <span className="text-[19px] font-extrabold leading-none">{start.getDate()}</span>
                  <span className="mt-0.5 text-[11px] font-bold uppercase">
                    {start.toLocaleDateString("en-GB", { month: "short" })}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold", style.chip)}>
                      <style.Icon className="h-3 w-3" strokeWidth={2.25} />
                      {style.label}
                    </span>
                    {item.tentative ? (
                      <span className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[11px] font-semibold text-[#64748B]">
                        Tentative
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 block truncate text-[15px] font-bold text-[#102A43]">{item.title}</span>
                  <span className="mt-0.5 block truncate text-[12.5px] font-medium text-[#64748B]">
                    {[dateRange(item.startDate, item.endDate), item.subtitle].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
