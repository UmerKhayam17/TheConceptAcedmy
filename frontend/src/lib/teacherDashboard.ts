import type { Weekday } from "@/lib/configApi";
import type { ScheduleSlot, TeacherAssignment } from "@/lib/timetableApi";
import type { AcademyClassTest } from "@/lib/studentManagementApi";
import type { Announcement } from "@/lib/announcementApi";

export type ScheduleStatus = "completed" | "ongoing" | "upcoming";

export interface TeacherClassCard {
  key: string;
  classId: string;
  className: string;
  sectionId: string;
  sectionName: string;
  label: string;
  subjects: string[];
  studentCount: number | null;
}

export interface ScheduleRow {
  id: string;
  timeLabel: string;
  classLabel: string;
  subject: string;
  room: string;
  status: ScheduleStatus;
  startMinutes: number;
  endMinutes: number;
}

export interface PerformancePoint {
  month: string;
  averageScore: number;
  passRate: number;
  attendanceRate: number;
}

export interface DeadlineItem {
  id: string;
  dateLabel: string;
  day: string;
  month: string;
  title: string;
  subtitle: string;
  dueLabel: string;
  urgent: boolean;
  href?: string;
}

export interface ActivityItem {
  id: string;
  title: string;
  detail: string;
  timeAgo: string;
  tone: "blue" | "green" | "purple" | "orange" | "rose";
}

export interface TeacherAnalytics {
  attendanceTodayPct: number;
  assignmentsCompletionPct: number;
  averageClassScore: number;
  engagementPct: number;
}

export const CLASS_CARD_TONES = [
  { bg: "bg-sky-50", icon: "bg-sky-100 text-sky-700", border: "border-sky-100" },
  { bg: "bg-emerald-50", icon: "bg-emerald-100 text-emerald-700", border: "border-emerald-100" },
  { bg: "bg-violet-50", icon: "bg-violet-100 text-violet-700", border: "border-violet-100" },
  { bg: "bg-orange-50", icon: "bg-orange-100 text-orange-700", border: "border-orange-100" },
  { bg: "bg-rose-50", icon: "bg-rose-100 text-rose-700", border: "border-rose-100" },
] as const;

const JS_DAY_TO_WEEKDAY: Weekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export function weekdayFromDate(date: Date): Weekday {
  return JS_DAY_TO_WEEKDAY[date.getDay()];
}

export function greetingForHour(hour = new Date().getHours()) {
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

export function formatDashboardDate(date: Date) {
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseTimeToMinutes(raw?: string | null): number | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  const ampm = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    let h = Number(ampm[1]);
    const m = Number(ampm[2]);
    const mer = ampm[3].toUpperCase();
    if (mer === "PM" && h < 12) h += 12;
    if (mer === "AM" && h === 12) h = 0;
    return h * 60 + m;
  }
  const hhmm = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) return Number(hhmm[1]) * 60 + Number(hhmm[2]);
  return null;
}

function formatMinutes(mins: number) {
  const h24 = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const mer = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 || 12;
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${mer}`;
}

export function periodTimeLabel(slot: ScheduleSlot) {
  if (slot.startTime && slot.endTime) {
    const start = parseTimeToMinutes(slot.startTime);
    const end = parseTimeToMinutes(slot.endTime);
    if (start != null && end != null) return `${formatMinutes(start)} - ${formatMinutes(end)}`;
    return `${slot.startTime} - ${slot.endTime}`;
  }
  if (slot.startTime) return slot.startTime;
  if (slot.periodLabel) return slot.periodLabel;
  return "—";
}

export function resolveScheduleStatus(
  slot: ScheduleSlot,
  now = new Date(),
  viewingToday = true,
): ScheduleStatus {
  if (!viewingToday) {
    const day = now.getTime();
    void day;
    return "upcoming";
  }
  const start = parseTimeToMinutes(slot.startTime);
  const end = parseTimeToMinutes(slot.endTime);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  if (start == null || end == null) return "upcoming";
  if (nowMins > end) return "completed";
  if (nowMins >= start && nowMins <= end) return "ongoing";
  return "upcoming";
}

export function scheduleStatusForDate(
  slot: ScheduleSlot,
  viewingDate: Date,
  now = new Date(),
): ScheduleStatus {
  const viewingYmd = viewingDate.toDateString();
  const todayYmd = now.toDateString();
  if (viewingYmd < todayYmd) return "completed";
  if (viewingYmd > todayYmd) return "upcoming";
  return resolveScheduleStatus(slot, now, true);
}

export function toScheduleRows(slots: ScheduleSlot[], viewingDate: Date, now = new Date()): ScheduleRow[] {
  return [...slots]
    .sort((a, b) => {
      const ao = a.periodOrder ?? 999;
      const bo = b.periodOrder ?? 999;
      if (ao !== bo) return ao - bo;
      return String(a.startTime || a.periodId).localeCompare(String(b.startTime || b.periodId));
    })
    .map((slot) => {
      const className =
        typeof slot.class === "object" && slot.class?.name ? slot.class.name : "";
      const sectionName =
        typeof slot.section === "object" && slot.section?.name ? slot.section.name : "";
      const classLabel = [className, sectionName].filter(Boolean).join(" ") || "—";
      const startMinutes = parseTimeToMinutes(slot.startTime) ?? 0;
      const endMinutes = parseTimeToMinutes(slot.endTime) ?? startMinutes + 40;
      return {
        id: slot._id,
        timeLabel: periodTimeLabel(slot),
        classLabel,
        subject: slot.subject?.name || "—",
        room: slot.room?.name || "—",
        status: scheduleStatusForDate(slot, viewingDate, now),
        startMinutes,
        endMinutes,
      };
    });
}

function refId(ref: { _id: string } | string | undefined | null) {
  if (!ref) return "";
  return typeof ref === "object" ? ref._id : String(ref);
}

function refName(ref: { _id: string; name?: string } | string | undefined | null) {
  if (!ref) return "—";
  if (typeof ref === "object") return ref.name || "—";
  return String(ref);
}

export function groupAssignmentsIntoClasses(
  assignments: TeacherAssignment[],
  studentCounts?: Record<string, number>,
): TeacherClassCard[] {
  const map = new Map<string, TeacherClassCard>();
  for (const a of assignments) {
    const classId = refId(a.class);
    const sectionId = refId(a.section);
    const key = `${classId}:${sectionId}`;
    let row = map.get(key);
    if (!row) {
      const className = refName(a.class);
      const sectionName = refName(a.section);
      row = {
        key,
        classId,
        className,
        sectionId,
        sectionName,
        label: `${className} ${sectionName}`.trim(),
        subjects: [],
        studentCount: studentCounts?.[key] ?? null,
      };
      map.set(key, row);
    }
    const subjectName = refName(a.subject);
    if (subjectName && subjectName !== "—" && !row.subjects.includes(subjectName)) {
      row.subjects.push(subjectName);
    }
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function daysUntil(dateIso: string, from = new Date()) {
  const target = new Date(dateIso);
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

export function deadlinesFromClassTests(
  tests: AcademyClassTest[],
  roleHref: (testId: string) => string,
  now = new Date(),
): DeadlineItem[] {
  return tests
    .filter((t) => daysUntil(t.examDate, now) >= 0)
    .sort((a, b) => new Date(a.examDate).getTime() - new Date(b.examDate).getTime())
    .slice(0, 6)
    .map((t) => {
      const d = new Date(t.examDate);
      const due = daysUntil(t.examDate, now);
      const dueLabel =
        due === 0 ? "Due today" : due === 1 ? "Due in 1 day" : `Due in ${due} days`;
      const classLabel =
        typeof t.classId === "object" && t.classId?.className ? t.classId.className : "";
      const subjectLabel =
        typeof t.subjectId === "object" && t.subjectId?.subjectName
          ? t.subjectId.subjectName
          : "";
      return {
        id: t._id,
        dateLabel: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
        day: d.toLocaleDateString("en-GB", { day: "2-digit" }),
        month: d.toLocaleDateString("en-GB", { month: "short" }),
        title: `Assessment — ${t.title}`,
        subtitle: [subjectLabel, classLabel].filter(Boolean).join(" · ") || "Class assessment",
        dueLabel,
        urgent: due <= 2,
        href: roleHref(t._id),
      };
    });
}

export function activitiesFromAnnouncements(items: Announcement[]): ActivityItem[] {
  const tones: ActivityItem["tone"][] = ["blue", "green", "purple", "orange", "rose"];
  return items.slice(0, 6).map((a, i) => ({
    id: a._id,
    title: a.title || "Announcement",
    detail: a.targetAudience ? `Audience: ${a.targetAudience}` : "School notice",
    timeAgo: relativeTime(a.publishedAt || a.createdAt),
    tone: tones[i % tones.length],
  }));
}

export function relativeTime(iso?: string) {
  if (!iso) return "Recently";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Recently";
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return mins <= 1 ? "1 minute ago" : `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

/** Fallback chart series used when live performance APIs are unavailable. */
export const FALLBACK_PERFORMANCE: PerformancePoint[] = [
  { month: "Jan", averageScore: 31, passRate: 47, attendanceRate: 25 },
  { month: "Feb", averageScore: 44, passRate: 56, attendanceRate: 35 },
  { month: "Mar", averageScore: 44, passRate: 54, attendanceRate: 35 },
  { month: "Apr", averageScore: 52, passRate: 62, attendanceRate: 42 },
  { month: "May", averageScore: 61, passRate: 72, attendanceRate: 50 },
  { month: "Jun", averageScore: 70, passRate: 81, attendanceRate: 57 },
];

export const FALLBACK_DEADLINES: DeadlineItem[] = [
  {
    id: "fb-1",
    dateLabel: "26 Jun",
    day: "26",
    month: "Jun",
    title: "Assignment — Mathematics",
    subtitle: "9th A",
    dueLabel: "Due in 1 day",
    urgent: true,
  },
  {
    id: "fb-2",
    dateLabel: "28 Jun",
    day: "28",
    month: "Jun",
    title: "Test — Chemistry",
    subtitle: "9th B",
    dueLabel: "Due in 3 days",
    urgent: false,
  },
  {
    id: "fb-3",
    dateLabel: "30 Jun",
    day: "30",
    month: "Jun",
    title: "Lesson Plan — Physics",
    subtitle: "10th A",
    dueLabel: "Due in 5 days",
    urgent: false,
  },
  {
    id: "fb-4",
    dateLabel: "02 Jul",
    day: "02",
    month: "Jul",
    title: "Assignment — English",
    subtitle: "10th B",
    dueLabel: "Due in 7 days",
    urgent: false,
  },
];

export const FALLBACK_ACTIVITIES: ActivityItem[] = [
  {
    id: "a1",
    title: "Assignment submitted",
    detail: "by Ayesha Khan (9th A)",
    timeAgo: "2 hours ago",
    tone: "blue",
  },
  {
    id: "a2",
    title: "Attendance marked",
    detail: "for 9th B",
    timeAgo: "3 hours ago",
    tone: "green",
  },
  {
    id: "a3",
    title: "New message",
    detail: "from Fatima Noor (Parent)",
    timeAgo: "4 hours ago",
    tone: "orange",
  },
  {
    id: "a4",
    title: "Grade updated",
    detail: "for Ali Raza (10th A)",
    timeAgo: "5 hours ago",
    tone: "purple",
  },
  {
    id: "a5",
    title: "Lesson plan created",
    detail: "for Physics",
    timeAgo: "6 hours ago",
    tone: "rose",
  },
];
