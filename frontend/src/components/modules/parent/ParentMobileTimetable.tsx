import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check, Clock3, Coffee, UserRound } from "lucide-react";
import ParentEmptyMessage from "@/components/modules/parent/ParentEmptyMessage";
import ParentMobilePageHeader from "@/components/modules/parent/ParentMobilePageHeader";
import { ParentOptionField } from "@/components/modules/parent/ParentOptionSheet";
import { useAuth } from "@/hooks/useAuth";
import { classLabel } from "@/components/modules/student-management/studentDisplayUtils";
import {
  DAY_LABELS,
  DAY_ORDER,
  normalizeWorkingDays,
  slotMatchesPeriod,
} from "@/components/modules/timetable/constants";
import { fetchAcademyStudents, resolveUploadUrl, type AcademyStudent } from "@/lib/studentManagementApi";
import {
  fetchSectionSchedule,
  scheduleSlotEntries,
  scheduleSlotTitle,
  type PeriodSlot,
  type ScheduleSlot,
} from "@/lib/timetableApi";
import type { Weekday } from "@/lib/configApi";
import { cn } from "@/lib/utils";

const STRIPES = [
  "bg-gradient-to-b from-[#4aa4ff] to-[#0867cc]",
  "bg-gradient-to-b from-[#3B82F6] to-[#0739ac]",
  "bg-gradient-to-b from-[#60A5FA] to-[#1D4ED8]",
  "bg-gradient-to-b from-[#8B5CF6] to-[#6D28D9]",
  "bg-gradient-to-b from-[#FBBF24] to-[#D97706]",
];

function refId(ref: unknown): string {
  if (!ref) return "";
  if (typeof ref === "string") return ref;
  if (typeof ref === "object" && ref !== null && "_id" in ref) {
    return String((ref as { _id: string })._id || "");
  }
  return "";
}

function sectionNameOf(student: AcademyStudent): string {
  const section = student.sectionId;
  if (section && typeof section === "object" && "sectionName" in section) {
    return String((section as { sectionName?: string }).sectionName || "");
  }
  return "";
}

function classSectionLine(student: AcademyStudent) {
  const rawClass = classLabel(student.classId);
  const className = rawClass && rawClass !== "—"
    ? (/^class\b/i.test(rawClass) ? rawClass : `Class ${rawClass}`)
    : "";
  const rawSection = sectionNameOf(student);
  const section = rawSection
    ? (/^section\b/i.test(rawSection) ? rawSection : `Section ${rawSection}`)
    : "";
  return [className, section].filter(Boolean).join(" · ");
}

function todayWeekday(): Weekday {
  const map: Weekday[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return map[new Date().getDay()] || "monday";
}

function minutesOf(raw?: string | null): number | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  const ampm = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    let hour = Number(ampm[1]);
    const minute = Number(ampm[2]);
    const mer = ampm[3].toUpperCase();
    if (mer === "PM" && hour < 12) hour += 12;
    if (mer === "AM" && hour === 12) hour = 0;
    return hour * 60 + minute;
  }
  const hhmm = trimmed.match(/^(\d{1,2}):(\d{2})/);
  if (!hhmm) return null;
  return Number(hhmm[1]) * 60 + Number(hhmm[2]);
}

function clock(mins: number, withMer: boolean) {
  const hour24 = Math.floor(mins / 60) % 24;
  const minute = mins % 60;
  const hour12 = hour24 % 12 || 12;
  const body = `${hour12}:${String(minute).padStart(2, "0")}`;
  return withMer ? `${body} ${hour24 >= 12 ? "PM" : "AM"}` : body;
}

function timeRange(start?: string, end?: string) {
  const a = minutesOf(start);
  const b = minutesOf(end);
  if (a == null || b == null) return [start, end].filter(Boolean).join(" — ");
  const sameMer = a < 12 * 60 === b < 12 * 60;
  return sameMer ? `${clock(a, false)} — ${clock(b, true)}` : `${clock(a, true)} — ${clock(b, true)}`;
}

function durationLabel(start?: string, end?: string) {
  const a = minutesOf(start);
  const b = minutesOf(end);
  if (a == null || b == null || b <= a) return "";
  return `${b - a} min`;
}

function breakTitle(period: PeriodSlot) {
  const label = String(period.label || "").trim();
  if (label && !/^p?\d+$/i.test(label)) return label;
  if (period.type === "assembly") return "Assembly";
  if (period.type === "prayer") return "Prayer";
  return "Break";
}

function periodNumber(period: PeriodSlot, fallback: number) {
  const fromLabel = String(period.label || "").match(/\d+/);
  if (fromLabel) return fromLabel[0];
  return String(period.order || fallback);
}

function teacherNames(slot?: ScheduleSlot) {
  if (!slot) return "";
  const names = scheduleSlotEntries(slot)
    .map((entry) => entry.teacher?.name?.trim() || "")
    .filter(Boolean);
  return [...new Set(names)].join(", ");
}

function subjectName(slot?: ScheduleSlot) {
  if (!slot) return "—";
  const title = scheduleSlotTitle(slot, "").trim();
  if (!title || title === "Deleted subject") return "—";
  return title;
}

export default function ParentMobileTimetable({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [childId, setChildId] = useState(() => {
    try {
      return localStorage.getItem("parent_selected_student_id") || "";
    } catch {
      return "";
    }
  });
  const [day, setDay] = useState<Weekday>(todayWeekday);

  const { data: children = [], isLoading: childrenLoading } = useQuery({
    queryKey: ["parent-children-schedule", sessionId, user?.id],
    queryFn: async () => {
      const { students } = await fetchAcademyStudents({ limit: 100 });
      return students;
    },
    enabled: Boolean(sessionId && user),
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
  const sectionId = selected ? refId(selected.sectionId) : "";
  const photo = selected?.photoImage ? resolveUploadUrl(selected.photoImage) : "";

  const { data: grid, isLoading: gridLoading } = useQuery({
    queryKey: ["parent-section-schedule", sessionId, sectionId],
    queryFn: () => fetchSectionSchedule(sessionId, sectionId),
    enabled: Boolean(sessionId && sectionId),
  });

  const days = useMemo(() => {
    const working = normalizeWorkingDays(grid?.workingDays);
    return (working.length ? working : DAY_ORDER.slice(0, 6)).filter((item) => DAY_ORDER.includes(item));
  }, [grid?.workingDays]);

  useEffect(() => {
    if (!days.includes(day)) setDay(days[0] || "monday");
  }, [days, day]);

  const periods = useMemo(
    () => [...(grid?.periods || [])].sort((a, b) => a.order - b.order),
    [grid?.periods],
  );
  const slots = grid?.slots || [];
  const rows = useMemo(() => {
    if (periods.length) return periods;
    return slots
      .filter((slot) => slot.day === day)
      .map((slot, index) => ({
        _id: slot.periodId || slot._id,
        order: slot.periodOrder || index + 1,
        label: slot.periodLabel || String(slot.periodOrder || index + 1),
        startTime: slot.startTime || "",
        endTime: slot.endTime || "",
        type: "lecture" as const,
      }));
  }, [periods, slots, day]);

  const lectureCount = rows.filter((period) => period.type === "lecture").length;
  const loading = childrenLoading || gridLoading;
  let lectureIndex = 0;

  return (
    <div className="min-h-full bg-white pb-8">
      <ParentMobilePageHeader title="Timetable" onBack={() => navigate("/panel/parent")} />

      <div className="mx-4 flex items-center gap-3 rounded-[16px] bg-[#FEF6DC] px-3 py-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-white text-[#D97706]">
          {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          {children.length > 1 ? (
            <ParentOptionField
              sheetTitle="Child"
              value={childId}
              onChange={setChildId}
              valueClassName="text-[18px] font-extrabold text-[#78350F]"
              options={children.map((child) => ({ value: child._id, label: child.studentName }))}
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

      <div className="mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {days.map((item) => {
          const active = item === day;
          return (
            <button
              key={item}
              type="button"
              onClick={() => setDay(item)}
              className={cn(
                "h-9 shrink-0 rounded-full px-4 text-[13px] font-semibold",
                active ? "bg-[#0867cc] text-white shadow-sm" : "border border-[#E7EEF3] bg-white text-[#94A3B8]",
              )}
            >
              {DAY_LABELS[item]}
            </button>
          );
        })}
      </div>

      <div className={cn("mt-3 flex flex-col px-4", rows.length > 0 && "space-y-3")}>
        {loading ? <div className="h-24 animate-pulse rounded-[18px] bg-white/80" /> : null}
        {!loading && !selected ? (
          <ParentEmptyMessage>Link a student to this parent account to see the timetable.</ParentEmptyMessage>
        ) : null}
        {!loading && selected && !sectionId ? (
          <ParentEmptyMessage>This child is not in a class section yet.</ParentEmptyMessage>
        ) : null}
        {!loading && selected && sectionId && !grid ? (
          <ParentEmptyMessage>No timetable is published for this class yet.</ParentEmptyMessage>
        ) : null}
        {!loading && grid && rows.length === 0 ? (
          <ParentEmptyMessage>No periods on {DAY_LABELS[day]}.</ParentEmptyMessage>
        ) : null}

        {grid
          ? rows.map((period) => {
            if (period.type !== "lecture") {
              const name = breakTitle(period);
              const mins = durationLabel(period.startTime, period.endTime);
              return (
                <div key={period._id} className="flex justify-center py-0.5">
                  <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#FFF4D6] px-3 py-1.5 text-[12px] font-semibold text-[#D97706]">
                    <Coffee className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      {name} {timeRange(period.startTime, period.endTime)}
                      {mins ? ` · ${mins}` : ""}
                    </span>
                  </span>
                </div>
              );
            }
            const slot = slots.find((item) => item.day === day && slotMatchesPeriod(item, period._id));
            const stripe = STRIPES[lectureIndex % STRIPES.length];
            lectureIndex += 1;
            const teacher = teacherNames(slot);
            const mins = durationLabel(period.startTime, period.endTime);
            return (
              <article key={period._id} className="flex overflow-hidden rounded-[18px] bg-white shadow-[0_6px_18px_rgba(15,23,42,0.05)]">
                <div className={cn("flex w-[58px] shrink-0 flex-col items-center justify-center text-white", stripe)}>
                  <span className="text-[10px] font-bold tracking-[0.08em]">PER</span>
                  <span className="text-[22px] font-extrabold leading-none">{periodNumber(period, lectureIndex)}</span>
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-bold text-[#1F2937]">{subjectName(slot)}</p>
                    {teacher ? <p className="mt-0.5 truncate text-[13px] text-[#64748B]">Teacher: {teacher}</p> : null}
                    <p className="mt-1 flex items-center gap-1 text-[13px] font-semibold text-[#0867cc]">
                      <Clock3 className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{timeRange(period.startTime, period.endTime)}</span>
                    </p>
                  </div>
                  {mins ? (
                    <span className="shrink-0 rounded-lg bg-[#F3F5F7] px-2.5 py-1.5 text-[12px] font-medium text-[#94A3B8]">
                      {mins}
                    </span>
                  ) : null}
                </div>
              </article>
            );
          })
          : null}

        {grid && lectureCount > 0 ? (
          <div className="flex justify-center pt-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[13px] font-semibold text-[#16A34A] shadow-sm">
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
              {lectureCount} periods · {DAY_LABELS[day]}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
