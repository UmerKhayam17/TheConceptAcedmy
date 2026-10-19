import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  Bell,
  CalendarDays,
  ClipboardList,
  Clock3,
  Download,
  FileText,
  Shield,
  TrendingUp,
  User,
  UserRound,
  Wallet,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useAuth } from "@/hooks/useAuth";
import { moduleHref } from "@/lib/panelMenus";
import { timetableHref } from "@/lib/timetableMenus";
import { testExamsHref } from "@/lib/testExamsMenus";
import { fetchAnnouncements } from "@/lib/announcementApi";
import { fetchNotifications } from "@/lib/notificationsApi";
import {
  fetchAcademyStudents,
  getAcademyStudentRecord,
  resolveUploadUrl,
  type AcademyAssessmentRecord,
  type AcademyAttendanceRecord,
  type AcademyFeeRecord,
  type AcademyStudent,
  type AcademySubject,
} from "@/lib/studentManagementApi";
import { classLabel, formatDate } from "@/components/modules/student-management/studentDisplayUtils";
import { cn } from "@/lib/utils";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SUBJECT_COLORS = ["#3B82F6", "#10B981", "#8B5CF6", "#F59E0B", "#EF4444"];

function refName(ref: unknown, key: string): string {
  if (!ref || typeof ref !== "object") return "";
  const v = (ref as Record<string, unknown>)[key];
  return typeof v === "string" ? v : "";
}

function subjectLabel(sub?: AcademySubject | string | null) {
  if (!sub) return "General";
  if (typeof sub === "string") return sub;
  return sub.subjectName || "General";
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

function ymdLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function examGradeLabel(pct: number | null) {
  if (pct == null) return "—";
  if (pct >= 85) return "Excellent";
  if (pct >= 70) return "Good";
  if (pct >= 50) return "Average";
  return "Needs work";
}

function buildSubjectPerformance(records: AcademyAssessmentRecord[]) {
  const byMonthSubject = new Map<string, { sum: number; count: number; subject: string; monthKey: string }>();
  records.forEach((r) => {
    if (!r.examDate || r.totalMarks <= 0) return;
    const d = new Date(r.examDate.length >= 10 ? `${r.examDate.slice(0, 10)}T12:00:00` : r.examDate);
    if (Number.isNaN(d.getTime())) return;
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const subject = subjectLabel(r.subjectId as AcademySubject);
    const key = `${monthKey}::${subject}`;
    const pct = (r.obtainedMarks / r.totalMarks) * 100;
    const cur = byMonthSubject.get(key) || { sum: 0, count: 0, subject, monthKey };
    cur.sum += pct;
    cur.count += 1;
    byMonthSubject.set(key, cur);
  });

  const subjectCounts = new Map<string, number>();
  byMonthSubject.forEach((v) => subjectCounts.set(v.subject, (subjectCounts.get(v.subject) || 0) + v.count));
  const topSubjects = [...subjectCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([s]) => s);

  const monthKeys = [...new Set([...byMonthSubject.values()].map((v) => v.monthKey))].sort().slice(-7);
  const rows = monthKeys.map((mk) => {
    const [, m] = mk.split("-").map(Number);
    const row: Record<string, string | number> = { month: MONTH_SHORT[(m || 1) - 1], monthKey: mk };
    topSubjects.forEach((sub) => {
      const hit = byMonthSubject.get(`${mk}::${sub}`);
      row[sub] = hit ? Math.round((hit.sum / hit.count) * 10) / 10 : 0;
    });
    return row;
  });

  const subjectStats = topSubjects.map((sub, i) => {
    const vals = monthKeys
      .map((mk) => {
        const hit = byMonthSubject.get(`${mk}::${sub}`);
        return hit ? hit.sum / hit.count : null;
      })
      .filter((v): v is number => v != null);
    const latest = vals.length ? Math.round(vals[vals.length - 1] * 10) / 10 : 0;
    const prev = vals.length > 1 ? vals[vals.length - 2] : null;
    const trend = prev != null ? Math.round((latest - prev) * 10) / 10 : null;
    return { subject: sub, score: latest, trend, color: SUBJECT_COLORS[i % SUBJECT_COLORS.length] };
  });

  return { rows, subjects: topSubjects, subjectStats };
}

function buildAttendanceWeeks(records: AcademyAttendanceRecord[]) {
  const weeks: { label: string; present: number; absent: number }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i -= 1) {
    const end = new Date(now);
    end.setDate(now.getDate() - i * 7);
    const start = new Date(end);
    start.setDate(end.getDate() - 6);
    const startKey = ymdLocal(start);
    const endKey = ymdLocal(end);
    let present = 0;
    let absent = 0;
    records.forEach((r) => {
      const day = typeof r.date === "string" ? r.date.slice(0, 10) : ymdLocal(new Date(r.date));
      if (day < startKey || day > endKey) return;
      if (r.status === "present" || r.status === "late") present += 1;
      else if (r.status === "absent") absent += 1;
    });
    weeks.push({ label: `W${6 - i}`, present, absent });
  }
  return weeks;
}

function monthRateFromRecords(records: AcademyAttendanceRecord[], year: number, month: number) {
  let present = 0;
  let marked = 0;
  records.forEach((r) => {
    const day = typeof r.date === "string" ? r.date.slice(0, 10) : ymdLocal(new Date(r.date));
    const [y, m] = day.split("-").map(Number);
    if (y !== year || m !== month) return;
    if (r.status === "present" || r.status === "late" || r.status === "absent" || r.status === "leave") {
      marked += 1;
      if (r.status === "present" || r.status === "late") present += 1;
    }
  });
  return marked > 0 ? Math.round((present / marked) * 1000) / 10 : null;
}

function feeTypeLabel(fee: AcademyFeeRecord) {
  if (fee.feeType === "admission") return "Admission Fee";
  if (fee.feeType === "stationery") return "Stationery";
  const comps = fee.components?.map((c) => c.name).filter(Boolean) || [];
  if (comps.length) return comps.slice(0, 2).join(" + ");
  return `Monthly Fee (${MONTH_SHORT[(fee.month || 1) - 1]} ${fee.year})`;
}

function downloadStudentProfile(student: AcademyStudent) {
  const lines = [
    `Student Profile`,
    `Name: ${student.studentName}`,
    `Father: ${student.fatherName || "—"}`,
    `Class: ${classLabel(student.classId)}`,
    `Section: ${refName(student.sectionId, "sectionName") || "—"}`,
    `Roll / ID: ${student.rollNumber || student.studentId || "—"}`,
    `DOB: ${formatDate(student.dateOfBirth)}`,
    `Gender: ${student.gender || "—"}`,
    `Phone: ${student.phone || "—"}`,
    `Status: ${student.status}`,
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${student.studentName.replace(/\s+/g, "-").toLowerCase()}-profile.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function relativeTime(iso?: string) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-[#0F172A] truncate">{value}</p>
    </div>
  );
}

export default function ParentDashboard({
  name,
  studentId: studentIdProp,
}: {
  name: string;
  /** When opened from My Children /student/:id — lock selection to this child. */
  studentId?: string;
}) {
  const { user } = useAuth();
  const role = "parent" as const;
  const [selectedId, setSelectedId] = useState(() => {
    if (studentIdProp) return studentIdProp;
    try {
      return localStorage.getItem("parent_selected_student_id") || "";
    } catch {
      return "";
    }
  });

  const { data: children = [], isLoading: childrenLoading } = useQuery({
    queryKey: ["parent-dashboard-children", user?.id],
    queryFn: async () => {
      const { students } = await fetchAcademyStudents({ limit: 100 });
      return students as AcademyStudent[];
    },
    enabled: Boolean(user),
  });

  useEffect(() => {
    if (studentIdProp) {
      setSelectedId(studentIdProp);
      return;
    }
    if (!children.length) {
      setSelectedId("");
      return;
    }
    if (!selectedId || !children.some((c) => c._id === selectedId)) {
      setSelectedId(children[0]._id);
    }
  }, [children, selectedId, studentIdProp]);

  useEffect(() => {
    try {
      if (selectedId) localStorage.setItem("parent_selected_student_id", selectedId);
    } catch {
      /* ignore */
    }
  }, [selectedId]);

  const { data: record, isLoading: recordLoading } = useQuery({
    queryKey: ["parent-dashboard-record", selectedId],
    queryFn: () => getAcademyStudentRecord(selectedId),
    enabled: Boolean(selectedId),
  });

  const { data: announcements = [] } = useQuery({
    queryKey: ["parent-dashboard-announcements"],
    queryFn: () => fetchAnnouncements({ audience: "parents" }),
    staleTime: 60_000,
    retry: false,
  });

  const { data: notifData } = useQuery({
    queryKey: ["parent-dashboard-notifications"],
    queryFn: () => fetchNotifications({ limit: 8 }),
    staleTime: 30_000,
    retry: false,
  });

  const student = record?.student;
  const photo = student?.photoImage ? resolveUploadUrl(student.photoImage) : null;
  const className = student ? classLabel(student.classId) : "—";
  const sectionName = student ? refName(student.sectionId, "sectionName") : "";
  const age = ageFromDob(student?.dateOfBirth);
  const attendanceRate = record?.attendance.summary.attendanceRate;
  const attSummary = record?.attendance.summary;
  const presentCount = (attSummary?.present ?? 0) + (attSummary?.late ?? 0);
  const absentCount = attSummary?.absent ?? 0;
  const totalMarked = attSummary?.total ?? presentCount + absentCount;
  const testAvg = record?.assessments.summary.averagePercentage ?? null;
  const feeDue = record?.fees.summary.totalPending ?? 0;
  const feePaid = record?.fees.summary.totalPaid ?? 0;

  const attendanceTrend = useMemo(() => {
    const recs = record?.attendance.records || [];
    const now = new Date();
    const cur = monthRateFromRecords(recs, now.getFullYear(), now.getMonth() + 1);
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prev = monthRateFromRecords(recs, prevDate.getFullYear(), prevDate.getMonth() + 1);
    if (cur == null || prev == null) return null;
    return Math.round((cur - prev) * 10) / 10;
  }, [record?.attendance.records]);

  const testTrend = useMemo(() => {
    const list = [...(record?.assessments.records || [])].filter((r) => r.totalMarks > 0);
    list.sort((a, b) => String(a.examDate).localeCompare(String(b.examDate)));
    if (list.length < 2) return null;
    const recent = list.slice(-3);
    const earlier = list.slice(-6, -3);
    if (!earlier.length) return null;
    const avg = (arr: typeof list) =>
      arr.reduce((s, r) => s + (r.obtainedMarks / r.totalMarks) * 100, 0) / arr.length;
    return Math.round((avg(recent) - avg(earlier)) * 10) / 10;
  }, [record?.assessments.records]);

  const latestAssessment = useMemo(() => {
    const list = [...(record?.assessments.records || [])];
    list.sort((a, b) => String(b.examDate).localeCompare(String(a.examDate)));
    return list[0] || null;
  }, [record?.assessments.records]);

  const latestPct =
    latestAssessment && latestAssessment.totalMarks > 0
      ? Math.round((latestAssessment.obtainedMarks / latestAssessment.totalMarks) * 1000) / 10
      : null;

  const nextDueFee = useMemo(() => {
    const pending = (record?.fees.records || []).filter(
      (f) => f.status === "pending" || f.status === "overdue",
    );
    pending.sort((a, b) => String(a.dueDate || "").localeCompare(String(b.dueDate || "")));
    return pending[0] || null;
  }, [record?.fees.records]);

  const performance = useMemo(
    () => buildSubjectPerformance(record?.assessments.records || []),
    [record?.assessments.records],
  );

  const attendanceWeeks = useMemo(
    () => buildAttendanceWeeks(record?.attendance.records || []),
    [record?.attendance.records],
  );

  const attendanceDonut = useMemo(() => {
    const rate = attendanceRate ?? 0;
    return [
      { name: "Present", value: rate, fill: "#10B981" },
      { name: "Rest", value: Math.max(0, 100 - rate), fill: "#E2E8F0" },
    ];
  }, [attendanceRate]);

  const performanceConfig = useMemo(() => {
    const cfg: ChartConfig = {};
    performance.subjects.forEach((s, i) => {
      cfg[s] = { label: s, color: SUBJECT_COLORS[i % SUBJECT_COLORS.length] };
    });
    return cfg;
  }, [performance.subjects]);

  const attendanceConfig: ChartConfig = {
    present: { label: "Present", color: "#10B981" },
    absent: { label: "Absent", color: "#E2E8F0" },
  };

  const donutConfig: ChartConfig = {
    Present: { label: "Present", color: "#10B981" },
    Rest: { label: "Other", color: "#E2E8F0" },
  };

  const activities = useMemo(() => {
    const tones = ["purple", "green", "orange", "blue"] as const;
    const fromNotifs = (notifData?.items || []).map((n, i) => ({
      id: n._id,
      title: n.title,
      subtitle: n.body || n.moduleKey || "Notification",
      time: n.createdAt,
      tone: tones[i % tones.length],
    }));
    const fromAnn = announcements.slice(0, 4).map((a, i) => ({
      id: a._id,
      title: a.title,
      subtitle: a.type || "Announcement",
      time: a.publishedAt || a.createdAt,
      tone: tones[(i + 1) % tones.length],
    }));
    return [...fromNotifs, ...fromAnn]
      .sort((a, b) => String(b.time).localeCompare(String(a.time)))
      .slice(0, 5);
  }, [notifData?.items, announcements]);

  const upcoming = useMemo(() => {
    const exams = (record?.assessments.records || [])
      .filter((r) => {
        const d = new Date(r.examDate.length >= 10 ? `${r.examDate.slice(0, 10)}T12:00:00` : r.examDate);
        return !Number.isNaN(d.getTime()) && d.getTime() >= Date.now() - 86400000;
      })
      .slice(0, 3)
      .map((r) => ({
        id: r._id,
        title: r.title,
        meta: subjectLabel(r.subjectId as AcademySubject),
        date: r.examDate,
        tag: "Exam" as const,
        tagClass: "bg-violet-100 text-violet-700",
      }));

    const notices = announcements.slice(0, 4).map((a) => {
      const isHw = a.type?.toLowerCase().includes("home");
      return {
        id: `ann-${a._id}`,
        title: a.title,
        meta: a.type || "Notice",
        date: a.publishedAt || a.createdAt,
        tag: (isHw ? "Homework" : "Event") as "Event" | "Homework",
        tagClass: isHw ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700",
      };
    });

    const feeItems = nextDueFee
      ? [
        {
          id: `fee-${nextDueFee._id}`,
          title: "Fee payment due",
          meta: `Rs. ${nextDueFee.amount.toLocaleString()}`,
          date: nextDueFee.dueDate || "",
          tag: "Payment" as const,
          tagClass: "bg-rose-100 text-rose-700",
        },
      ]
      : [];

    return [...exams, ...feeItems, ...notices]
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .slice(0, 5);
  }, [record?.assessments.records, announcements, nextDueFee]);

  const feeRows = (record?.fees.records || []).slice(0, 5);
  const loading = childrenLoading || (Boolean(selectedId) && recordLoading);

  const activityIcon = (tone: string) => {
    if (tone === "green") return ClipboardList;
    if (tone === "orange") return Wallet;
    if (tone === "blue") return Bell;
    return FileText;
  };

  const activityToneClass = (tone: string) => {
    if (tone === "green") return "bg-emerald-50 text-emerald-600";
    if (tone === "orange") return "bg-orange-50 text-orange-600";
    if (tone === "blue") return "bg-sky-50 text-sky-600";
    return "bg-violet-50 text-violet-600";
  };

  if (!childrenLoading && children.length === 0) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-10 bg-background min-h-[calc(100vh-4rem)]">
        <Card className="rounded-2xl border-0 p-10 text-center bg-white shadow-sm">
          <p className="text-base font-semibold text-[#0F172A]">No children linked yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ask the school office to link your account to a student registration, {name}.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 space-y-4 bg-background min-h-[calc(100vh-4rem)]">
      {children.length > 1 && (
        <div className="flex justify-end">
          <select
            className="h-9 rounded-lg border border-border bg-card px-3 text-sm min-w-[12rem]"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            aria-label="Select child"
          >
            {children.map((c) => (
              <option key={c._id} value={c._id}>
                {c.studentName}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Header: Student profile (+ quote) | Quick Actions */}
      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <Card className="relative overflow-hidden rounded-2xl border border-slate-100/80 bg-white p-5 sm:p-6 shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#1E3A8A] via-[#3B82F6] to-[#60A5FA]"
            aria-hidden
          />
          {loading || !student ? (
            <p className="text-sm text-muted-foreground py-10 text-center">Loading student…</p>
          ) : (
            <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch lg:justify-between">
              <div className="flex min-w-0 flex-1 gap-4 sm:gap-5">
                <div className="relative shrink-0">
                  <div className="h-[88px] w-[88px] overflow-hidden rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200/80 shadow-sm">
                    {photo ? (
                      <img
                        src={photo}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center bg-[#EEF4FF] text-[#64748B]">
                        <UserRound className="h-10 w-10" strokeWidth={1.5} />
                      </div>
                    )}
                  </div>
                  <span
                    className={cn(
                      "absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 rounded-full border-2 border-white shadow-sm",
                      student.status === "active" ? "bg-emerald-500" : "bg-slate-400",
                    )}
                    title={student.status}
                    aria-hidden
                  />
                </div>

                <div className="min-w-0 flex-1 space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="text-[1.35rem] font-bold tracking-tight text-[#0F172A] leading-none">
                        {student.studentName}
                      </h2>
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                          statusTone(student.status),
                        )}
                      >
                        {student.status === "active"
                          ? "Active"
                          : student.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center rounded-md bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200/70">
                        Class{" "}
                        <span className="ml-1 font-semibold text-[#0F172A]">{className}</span>
                      </span>
                      <span className="inline-flex items-center rounded-md bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200/70">
                        Roll{" "}
                        <span className="ml-1 font-semibold text-[#0F172A]">
                          {student.rollNumber || student.studentId || "—"}
                        </span>
                      </span>
                      <span className="inline-flex items-center rounded-md bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200/70">
                        Section{" "}
                        <span className="ml-1 font-semibold text-[#0F172A]">
                          {sectionName || "—"}
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
                    <div className="flex items-center gap-2.5 rounded-xl bg-[#F8FAFC] px-3 py-2.5 ring-1 ring-slate-100">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-sky-600 shadow-sm ring-1 ring-slate-100">
                        <CalendarDays className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          Date of Birth
                        </p>
                        <p className="truncate text-sm font-semibold text-[#0F172A]">
                          {formatDobLong(student.dateOfBirth)}
                          {age != null && age >= 0 ? (
                            <span className="ml-1 font-medium text-slate-400">
                              · {age} {age === 1 ? "yr" : "yrs"}
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 rounded-xl bg-[#F8FAFC] px-3 py-2.5 ring-1 ring-slate-100">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-violet-600 shadow-sm ring-1 ring-slate-100">
                        <User className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          Gender
                        </p>
                        <p className="truncate text-sm font-semibold capitalize text-[#0F172A]">
                          {student.gender || "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="hidden lg:flex w-[200px] shrink-0 flex-col justify-center rounded-xl bg-gradient-to-br from-[#EEF4FF] to-[#F8FAFF] px-4 py-4 ring-1 ring-[#DBEAFE]/80">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-600/80">
                  Note
                </p>
                <p className="mt-1.5 text-sm italic leading-relaxed text-[#1E3A8A]/90">
                  &ldquo;Small steps every day lead to big achievements.&rdquo;
                </p>
              </div>
            </div>
          )}
        </Card>

        <Card className="rounded-2xl border-0 bg-white p-4 sm:p-5 shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
          <p className="text-sm font-semibold text-[#0F172A] mb-3">Quick Actions</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4 gap-2.5">
            {[
              { label: "View Attendance", to: moduleHref(role, "attendance"), icon: CalendarDays },
              { label: "View Timetable", to: timetableHref(role, "view"), icon: Clock3 },
              { label: "Date Sheet", to: testExamsHref(role, "date-sheet"), icon: CalendarDays },
              { label: "Report Card", to: testExamsHref(role, "report-card"), icon: BarChart3 },
            ].map((a) => (
              <Link
                key={a.label}
                to={a.to}
                className="flex flex-col items-center justify-center gap-2 rounded-xl border border-slate-100 bg-white px-2 py-3.5 text-center shadow-sm hover:border-sky-200 hover:shadow-md transition-all"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                  <a.icon className="h-4 w-4" />
                </span>
                <span className="text-[11px] font-medium text-[#0F172A] leading-tight">{a.label}</span>
              </Link>
            ))}
            <button
              type="button"
              disabled={!student}
              onClick={() => student && downloadStudentProfile(student)}
              className="flex flex-col items-center justify-center gap-2 rounded-xl border border-slate-100 bg-white px-2 py-3.5 text-center shadow-sm hover:border-sky-200 hover:shadow-md transition-all disabled:opacity-50"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                <Download className="h-4 w-4" />
              </span>
              <span className="text-[11px] font-medium text-[#0F172A] leading-tight">
                Download Profile
              </span>
            </button>
          </div>
        </Card>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <Card className="rounded-2xl border-0 bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[13px] font-medium text-slate-500">Attendance</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-[#0F172A]">
                {attendanceRate != null ? `${attendanceRate}%` : "—"}
              </p>
              <p className="mt-1.5 flex items-center gap-1 text-xs">
                <span className="text-slate-400">This Month</span>
                {attendanceTrend != null && attendanceTrend !== 0 && (
                  <span className="inline-flex items-center gap-0.5 font-semibold text-emerald-600">
                    <TrendingUp className="h-3 w-3" />
                    {attendanceTrend > 0 ? "+" : ""}
                    {attendanceTrend}%
                  </span>
                )}
              </p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <CalendarDays className="h-5 w-5" />
            </span>
          </div>
        </Card>

        <Card className="rounded-2xl border-0 bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[13px] font-medium text-slate-500">Class Test Performance</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-[#0F172A]">
                {testAvg != null ? `${testAvg}%` : "—"}
              </p>
              <p className="mt-1.5 flex items-center gap-1 text-xs">
                <span className="text-slate-400">Avg. Score</span>
                {testTrend != null && testTrend !== 0 && (
                  <span className="inline-flex items-center gap-0.5 font-semibold text-emerald-600">
                    <TrendingUp className="h-3 w-3" />
                    {testTrend > 0 ? "+" : ""}
                    {testTrend}%
                  </span>
                )}
              </p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <Shield className="h-5 w-5" />
            </span>
          </div>
        </Card>

        <Card className="rounded-2xl border-0 bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[13px] font-medium text-slate-500">Total Fee Due</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-[#0F172A]">
                Rs. {feeDue.toLocaleString()}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-full text-[10px]",
                    feeDue > 0
                      ? "bg-rose-50 text-rose-700 border-rose-200"
                      : "bg-emerald-50 text-emerald-700 border-emerald-200",
                  )}
                >
                  {feeDue > 0 ? "Pending" : "Clear"}
                </Badge>
                <span className="text-xs text-slate-400">
                  Next Due: {nextDueFee?.dueDate ? formatDate(nextDueFee.dueDate) : "—"}
                </span>
              </div>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <Wallet className="h-5 w-5" />
            </span>
          </div>
        </Card>

        <Card className="rounded-2xl border-0 bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[13px] font-medium text-slate-500">Recent Exam Result</p>
              <p className="mt-1 text-2xl font-bold text-[#0F172A]">
                {examGradeLabel(latestPct ?? testAvg)}
              </p>
              <p className="mt-1.5 text-xs text-slate-400">
                Latest: {latestAssessment ? formatDate(latestAssessment.examDate) : "—"}
              </p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
              <FileText className="h-5 w-5" />
            </span>
          </div>
        </Card>
      </div>

      {/* Mid: Attendance | Performance | Activity */}
      <div className="grid gap-4 xl:grid-cols-3">
        {/* Attendance Overview */}
        <Card className="rounded-2xl border-0 bg-white p-4 sm:p-5 shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[15px] font-bold text-[#0F172A]">Attendance Overview</h3>
            <span className="text-xs text-slate-400">Last 6 Weeks</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 items-center">
            <ChartContainer config={attendanceConfig} className="h-[160px] w-full flex-1 aspect-auto">
              <BarChart data={attendanceWeeks} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#EEF2F7" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#94A3B8", fontSize: 10 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: "#94A3B8", fontSize: 10 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="present" stackId="a" fill="#10B981" />
                <Bar dataKey="absent" stackId="a" fill="#E2E8F0" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ChartContainer>
            <div className="shrink-0 flex flex-col items-center gap-2 w-[7.5rem]">
              <div className="relative h-[110px] w-[110px]">
                <ChartContainer config={donutConfig} className="h-full w-full aspect-auto">
                  <PieChart>
                    <Pie
                      data={attendanceDonut}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={36}
                      outerRadius={50}
                      startAngle={90}
                      endAngle={-270}
                      strokeWidth={0}
                    >
                      {attendanceDonut.map((e) => (
                        <Cell key={e.name} fill={e.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="absolute inset-0 grid place-items-center pointer-events-none">
                  <div className="text-center">
                    <p className="text-lg font-bold text-[#0F172A] leading-none">
                      {attendanceRate != null ? `${Math.round(attendanceRate)}%` : "—"}
                    </p>
                    <p className="text-[10px] text-emerald-600 font-medium mt-0.5">Present</p>
                  </div>
                </div>
              </div>
              <div className="w-full space-y-1 text-[11px]">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Present</span>
                  <span className="font-semibold text-[#0F172A]">{presentCount}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Absent</span>
                  <span className="font-semibold text-[#0F172A]">{absentCount}</span>
                </div>
                <div className="flex justify-between gap-2 border-t pt-1">
                  <span className="text-slate-500">Total</span>
                  <span className="font-semibold text-[#0F172A]">{totalMarked}</span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Performance Overview */}
        <Card className="rounded-2xl border-0 bg-white p-4 sm:p-5 shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[15px] font-bold text-[#0F172A]">Performance Overview</h3>
          </div>
          {performance.rows.length === 0 ? (
            <p className="text-sm text-slate-400 py-12 text-center">No test results yet.</p>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3">
              <ChartContainer config={performanceConfig} className="h-[170px] w-full flex-1 aspect-auto">
                <LineChart data={performance.rows} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#EEF2F7" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#94A3B8", fontSize: 10 }} />
                  <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fill: "#94A3B8", fontSize: 10 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  {performance.subjects.map((s, i) => (
                    <Line
                      key={s}
                      type="monotone"
                      dataKey={s}
                      stroke={SUBJECT_COLORS[i % SUBJECT_COLORS.length]}
                      strokeWidth={2.25}
                      dot={{ r: 2.5, strokeWidth: 0 }}
                    />
                  ))}
                </LineChart>
              </ChartContainer>
              <div className="shrink-0 w-full sm:w-[8.5rem] space-y-2.5">
                {performance.subjectStats.map((s) => (
                  <div key={s.subject} className="rounded-xl bg-slate-50 px-2.5 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                      <span className="text-[11px] font-medium text-slate-600 truncate">{s.subject}</span>
                    </div>
                    <div className="mt-1 flex items-baseline justify-between gap-1">
                      <span className="text-sm font-bold text-[#0F172A] tabular-nums">{s.score}%</span>
                      {s.trend != null && s.trend !== 0 && (
                        <span className="text-[10px] font-semibold text-emerald-600">
                          {s.trend > 0 ? "+" : ""}
                          {s.trend}%
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Recent Activity */}
        <Card className="rounded-2xl border-0 bg-white p-4 sm:p-5 shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
          <h3 className="text-[15px] font-bold text-[#0F172A] mb-4">Recent Activity</h3>
          {activities.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">No recent activity.</p>
          ) : (
            <ul className="space-y-3.5">
              {activities.map((a) => {
                const Icon = activityIcon(a.tone);
                return (
                  <li key={a.id} className="flex gap-3">
                    <span
                      className={cn(
                        "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                        activityToneClass(a.tone),
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#0F172A] leading-snug">{a.title}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate">{a.subtitle}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{relativeTime(a.time)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* Bottom: Student Info | Fees | Upcoming */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="rounded-2xl border-0 bg-white p-4 sm:p-5 shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
          <h3 className="text-[15px] font-bold text-[#0F172A] mb-4">Student Information</h3>
          {student ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-3.5">
              <InfoField label="Full Name" value={student.studentName} />
              <InfoField label="Guardian Contact" value={student.phone || "—"} />
              <InfoField label="Father's Name" value={student.fatherName || "—"} />
              <InfoField
                label="Address"
                value={student.postalAddress || student.address || "—"}
              />
              <InfoField label="Mother's Name" value={student.guardianName || "—"} />
              <InfoField
                label="CNIC / Roll No."
                value={student.fatherGuardianCnic || student.rollNumber || student.studentId || "—"}
              />
              <InfoField
                label="Gender"
                value={
                  student.gender
                    ? student.gender.charAt(0).toUpperCase() + student.gender.slice(1)
                    : "—"
                }
              />
              <InfoField
                label="Admission Date"
                value={formatDate(student.activatedAt || student.createdAt)}
              />
              <InfoField label="Date of Birth" value={formatDobLong(student.dateOfBirth)} />
              <InfoField label="Class" value={`${className}${sectionName ? ` · ${sectionName}` : ""}`} />
            </div>
          ) : (
            <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>
          )}
        </Card>

        <Card className="overflow-hidden rounded-2xl border-0 bg-white shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-4 sm:pt-5 pb-3">
            <h3 className="text-[15px] font-bold text-[#0F172A]">Fee Structure & Payments</h3>
          </div>
          {feeRows.length === 0 ? (
            <p className="text-sm text-slate-400 px-4 sm:px-5 py-8 text-center">
              No fee vouchers yet.
            </p>
          ) : (
            <div className="px-4 sm:px-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-slate-500">
                    <th className="pb-2 font-medium">Description</th>
                    <th className="pb-2 font-medium">Amount</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {feeRows.map((f) => (
                    <tr key={f._id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2.5 font-medium text-[#1e3a5f]">{feeTypeLabel(f)}</td>
                      <td className="py-2.5 tabular-nums font-medium text-[#1e3a5f]">
                        {(f.amount ?? 0).toLocaleString()}
                      </td>
                      <td className="py-2.5">
                        <span
                          className={cn(
                            "inline-flex capitalize rounded-full text-[11px] font-semibold px-2.5 py-0.5",
                            f.status === "paid" && "bg-emerald-50 text-emerald-700",
                            f.status === "pending" && "bg-amber-50 text-amber-700",
                            f.status === "overdue" && "bg-rose-50 text-rose-700",
                            f.status === "waived" && "bg-slate-100 text-slate-600",
                          )}
                        >
                          {f.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-end gap-6 bg-[#EAF3FF] px-4 sm:px-5 py-3.5">
            <div>
              <p className="text-xs text-slate-500">Total Paid</p>
              <p className="text-lg font-bold tabular-nums text-emerald-600">
                Rs. {feePaid.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Total Due</p>
              <p className="text-lg font-bold tabular-nums text-rose-600">
                Rs. {feeDue.toLocaleString()}
              </p>
            </div>
          </div>
        </Card>

        <Card className="rounded-2xl border-0 bg-white p-4 sm:p-5 shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[15px] font-bold text-[#0F172A]">Upcoming Events & Exams</h3>
            <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-[#2563EB] px-2">
              <Link to={moduleHref(role, "exam-date-sheet")}>View all</Link>
            </Button>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">Nothing upcoming.</p>
          ) : (
            <ul className="space-y-3">
              {upcoming.map((u) => {
                const d = u.date
                  ? new Date(u.date.length >= 10 ? `${u.date.slice(0, 10)}T12:00:00` : u.date)
                  : null;
                const valid = d && !Number.isNaN(d.getTime());
                return (
                  <li key={u.id} className="flex gap-3 items-start">
                    <div className="shrink-0 rounded-xl bg-slate-50 border border-slate-100 px-2.5 py-2 text-center min-w-[3.25rem]">
                      <p className="text-[10px] uppercase tracking-wide text-slate-400 leading-none">
                        {valid ? MONTH_SHORT[d!.getMonth()] : "—"}
                      </p>
                      <p className="text-base font-bold text-[#0F172A] leading-tight mt-0.5">
                        {valid ? d!.getDate() : "—"}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className="text-sm font-medium text-[#0F172A] leading-snug">{u.title}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{u.meta}</p>
                      <span
                        className={cn(
                          "inline-block mt-1.5 text-[10px] font-semibold rounded-md px-1.5 py-0.5",
                          u.tagClass,
                        )}
                      >
                        {u.tag}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
