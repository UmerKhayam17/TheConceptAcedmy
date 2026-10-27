import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  Download,
  User,
  UserRound,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchAcademyStudents,
  fetchStudentMonthAttendance,
  getAcademyStudentRecord,
  resolveUploadUrl,
  type AcademyAttendanceRecord,
  type AcademyStudent,
} from "@/lib/studentManagementApi";
import { ParentStudentBanner } from "@/components/modules/timetable/parent-schedule/ParentStudentBanner";
import { cn, formatClockTime } from "@/lib/utils";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type TabKey = "records" | "summary" | "leave";

function ymdLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

function dayKey(date: string | Date) {
  return typeof date === "string" ? date.slice(0, 10) : ymdLocal(new Date(date));
}

function formatDayLong(ymd: string) {
  const d = new Date(`${ymd}T12:00:00`);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function formatWeekday(ymd: string) {
  return new Date(`${ymd}T12:00:00`).toLocaleDateString(undefined, { weekday: "long" });
}

function formatTime(iso?: string) {
  return formatClockTime(iso);
}

function statusBadgeClass(status: string) {
  if (status === "present") return "bg-emerald-50 text-emerald-700";
  if (status === "late") return "bg-amber-50 text-amber-700";
  if (status === "absent") return "bg-rose-50 text-rose-700";
  if (status === "leave") return "bg-sky-50 text-sky-700";
  return "bg-slate-100 text-slate-600";
}

function calDayClass(status?: string, selected?: boolean) {
  if (selected) return "bg-[#2563EB] text-white font-semibold";
  if (status === "present") return "bg-emerald-500 text-white font-semibold";
  if (status === "late") return "bg-amber-500 text-white font-semibold";
  if (status === "absent") return "bg-rose-500 text-white font-semibold";
  if (status === "leave") return "bg-sky-500 text-white font-semibold";
  return "text-slate-600 hover:bg-slate-50";
}

function remarkFor(r: AcademyAttendanceRecord) {
  if (r.notes?.trim()) return r.notes;
  if (r.status === "present") return "Class attended";
  if (r.status === "late") return "Arrived late";
  if (r.status === "absent") return "Absent";
  if (r.status === "leave") return "On leave";
  return "—";
}

function weekBuckets(records: AcademyAttendanceRecord[], month: number, year: number) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  const weeks: { label: string; present: number; late: number; absent: number }[] = [];
  let cursor = new Date(start);
  let weekNum = 1;
  while (cursor <= end) {
    const weekEnd = new Date(cursor);
    weekEnd.setDate(cursor.getDate() + 6);
    if (weekEnd > end) weekEnd.setTime(end.getTime());
    const startKey = ymdLocal(cursor);
    const endKey = ymdLocal(weekEnd);
    let present = 0;
    let late = 0;
    let absent = 0;
    records.forEach((r) => {
      const key = dayKey(r.date);
      if (key < startKey || key > endKey) return;
      if (r.status === "present") present += 1;
      else if (r.status === "late") late += 1;
      else if (r.status === "absent") absent += 1;
    });
    weeks.push({
      label: `${MONTH_SHORT[cursor.getMonth()]} ${String(cursor.getDate()).padStart(2, "0")}`,
      present,
      late,
      absent,
    });
    cursor.setDate(cursor.getDate() + 7);
    weekNum += 1;
    if (weekNum > 6) break;
  }
  return weeks;
}

function ratePct(presentLike: number, total: number) {
  if (total <= 0) return null;
  return Math.round((presentLike / total) * 1000) / 10;
}

function downloadMonthCsv(studentName: string, month: number, year: number, records: AcademyAttendanceRecord[]) {
  const header = ["Date", "Day", "Status", "Time In", "Time Out", "Remarks"];
  const rows = records.map((r) => {
    const ymd = dayKey(r.date);
    return [
      ymd,
      formatWeekday(ymd),
      r.status,
      formatTime(r.checkIn),
      formatTime(r.checkOut),
      remarkFor(r).replace(/,/g, ";"),
    ].join(",");
  });
  const blob = new Blob([[header.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${studentName.replace(/\s+/g, "-").toLowerCase()}-attendance-${year}-${String(month).padStart(2, "0")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Parent attendance — professional dashboard matching design mock. */
export default function ParentAttendancePanel() {
  const { user } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [tab, setTab] = useState<TabKey>("records");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string>(() => {
    try {
      return localStorage.getItem("parent_selected_student_id") || "";
    } catch {
      return "";
    }
  });

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;

  const { data: children = [], isLoading: childrenLoading } = useQuery({
    queryKey: ["parent-children-attendance", user?.id],
    queryFn: async () => {
      const { students } = await fetchAcademyStudents({ limit: 100 });
      return students as AcademyStudent[];
    },
    enabled: Boolean(user),
  });

  useEffect(() => {
    if (!children.length) {
      setSelectedStudentId("");
      return;
    }
    if (!selectedStudentId || !children.some((c) => c._id === selectedStudentId)) {
      setSelectedStudentId(children[0]._id);
    }
  }, [children, selectedStudentId]);

  useEffect(() => {
    try {
      if (selectedStudentId) localStorage.setItem("parent_selected_student_id", selectedStudentId);
    } catch {
      /* ignore */
    }
  }, [selectedStudentId]);

  const selected = children.find((c) => c._id === selectedStudentId) || null;
  const photo = selected?.photoImage ? resolveUploadUrl(selected.photoImage) : null;
  const className = selected ? refName(selected.classId, "className") || "—" : "—";
  const sectionName = selected ? refName(selected.sectionId, "sectionName") || "—" : "—";
  const age = ageFromDob(selected?.dateOfBirth);

  const { data, isLoading } = useQuery({
    queryKey: ["parent-attendance-month", selectedStudentId, month, year],
    queryFn: () =>
      fetchStudentMonthAttendance({
        studentId: selectedStudentId,
        month,
        year,
      }),
    enabled: Boolean(selectedStudentId),
  });

  const { data: prevData } = useQuery({
    queryKey: ["parent-attendance-month-prev", selectedStudentId, prevMonth, prevYear],
    queryFn: () =>
      fetchStudentMonthAttendance({
        studentId: selectedStudentId,
        month: prevMonth,
        year: prevYear,
      }),
    enabled: Boolean(selectedStudentId),
  });

  const { data: record } = useQuery({
    queryKey: ["parent-attendance-student-record", selectedStudentId],
    queryFn: () => getAcademyStudentRecord(selectedStudentId),
    enabled: Boolean(selectedStudentId),
    staleTime: 60_000,
  });

  const byDay = useMemo(() => {
    const map = new Map<string, AcademyAttendanceRecord>();
    (data?.records || []).forEach((r) => map.set(dayKey(r.date), r));
    return map;
  }, [data?.records]);

  const daysInMonth = data?.daysInMonth || new Date(year, month, 0).getDate();
  const firstDow = new Date(year, month - 1, 1).getDay();
  const summary = data?.summary;
  const present = summary?.present ?? 0;
  const absent = summary?.absent ?? 0;
  const late = summary?.late ?? 0;
  const leave = summary?.leave ?? 0;
  const marked = present + absent + late + leave;
  const presentLike = present + late;
  const monthRate = ratePct(presentLike, marked);
  const overallRate = record?.attendance.summary.attendanceRate ?? monthRate;
  const overallPresent = (record?.attendance.summary.present ?? 0) + (record?.attendance.summary.late ?? 0);
  const overallTotal = record?.attendance.summary.total ?? marked;

  const prev = prevData?.summary;
  const prevMarked = (prev?.present ?? 0) + (prev?.absent ?? 0) + (prev?.late ?? 0) + (prev?.leave ?? 0);
  const prevPresentRate = ratePct((prev?.present ?? 0) + (prev?.late ?? 0), prevMarked);
  const prevAbsentRate = ratePct(prev?.absent ?? 0, prevMarked);
  const prevLateRate = ratePct(prev?.late ?? 0, prevMarked);
  const curPresentRate = ratePct(present, marked);
  const curAbsentRate = ratePct(absent, marked);
  const curLateRate = ratePct(late, marked);

  const trend = (cur: number | null, old: number | null) => {
    if (cur == null || old == null) return null;
    return Math.round((cur - old) * 10) / 10;
  };
  const presentTrend = trend(curPresentRate, prevPresentRate);
  const absentTrend = trend(curAbsentRate, prevAbsentRate);
  const lateTrend = trend(curLateRate, prevLateRate);

  const weeks = useMemo(() => weekBuckets(data?.records || [], month, year), [data?.records, month, year]);

  const breakdownPie = useMemo(() => {
    const slices = [
      { name: "Present", value: present, fill: "#10B981", pct: ratePct(present, marked) },
      { name: "Absent", value: absent, fill: "#F43F5E", pct: ratePct(absent, marked) },
      { name: "Late", value: late, fill: "#F59E0B", pct: ratePct(late, marked) },
    ].filter((s) => s.value > 0);
    if (leave > 0) {
      slices.push({ name: "Leave", value: leave, fill: "#38BDF8", pct: ratePct(leave, marked) });
    }
    return slices;
  }, [present, absent, late, leave, marked]);

  const barConfig: ChartConfig = {
    present: { label: "Present", color: "#10B981" },
    late: { label: "Late", color: "#F59E0B" },
    absent: { label: "Absent", color: "#F43F5E" },
  };

  const donutConfig: ChartConfig = {
    Present: { label: "Present", color: "#10B981" },
    Absent: { label: "Absent", color: "#F43F5E" },
    Late: { label: "Late", color: "#F59E0B" },
    Leave: { label: "Leave", color: "#38BDF8" },
  };

  const overallDonut = useMemo(() => {
    const rate = overallRate ?? 0;
    return [
      { name: "Present", value: rate, fill: "#10B981" },
      { name: "Rest", value: Math.max(0, 100 - rate), fill: "#E2E8F0" },
    ];
  }, [overallRate]);

  const recordsSorted = useMemo(() => {
    const list = [...(data?.records || [])];
    list.sort((a, b) => dayKey(b.date).localeCompare(dayKey(a.date)));
    return list;
  }, [data?.records]);

  // const leaveRecords = recordsSorted.filter((r) => r.status === "leave");
  const yearOptions = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  const TrendLine = ({
    value,
    upIsGood,
  }: {
    value: number | null;
    upIsGood?: boolean;
  }) => {
    if (value == null || value === 0) {
      return <span className="text-xs text-slate-400">— 0% vs. last month</span>;
    }
    const good = upIsGood ? value > 0 : value < 0;
    return (
      <span className={cn("text-xs font-semibold", good ? "text-emerald-600" : "text-rose-600")}>
        {value > 0 ? "↑" : "↓"} {Math.abs(value)}% vs. last month
      </span>
    );
  };

  if (!childrenLoading && children.length === 0) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-10">
        <Card className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No linked children found. Ask the office to link a student to this account.
        </Card>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-5 bg-background min-h-[calc(100vh-4rem)]">
      <ParentStudentBanner
        title="Attendance"
        subtitle="View and track your child's daily attendance records."
        icon={ClipboardList}
        childPicker={
          children.length > 1 ? (
            <select
              className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs min-w-[9rem] shadow-sm"
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              aria-label="Select child"
            >
              {children.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.studentName}
                </option>
              ))}
            </select>
          ) : undefined
        }
      />

      {/* First row: profile + attendance metrics */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_repeat(4,minmax(0,1fr))]">
        <Card className="rounded-2xl border border-slate-100/80 bg-white p-4 sm:p-5 shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
          {childrenLoading || !selected ? (
            <p className="text-sm text-muted-foreground py-10 text-center">Loading…</p>
          ) : (
            <div className="flex h-full min-w-0 items-center gap-4">
              <div className="h-[88px] w-[88px] shrink-0 overflow-hidden rounded-full bg-slate-100 ring-4 ring-[#E8F1FB]">
                {photo ? (
                  <img src={photo} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center bg-[#EEF4FF] text-[#64748B]">
                    <UserRound className="h-10 w-10" strokeWidth={1.5} />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1 space-y-2.5">
                <div className="space-y-1">
                  <h2 className="truncate text-xl font-bold tracking-tight text-[#1E3A8A] leading-tight">
                    {selected.studentName}
                  </h2>
                  <p className="truncate text-sm text-slate-500">
                    Class: {className || "—"}
                    <span className="mx-1.5 text-slate-300">|</span>
                    Roll No: {selected.rollNumber || selected.studentId || "—"}
                    <span className="mx-1.5 text-slate-300">|</span>
                    Section: {sectionName || "—"}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4">
                  <div className="flex min-w-0 items-start gap-2">
                    <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
                    <div className="min-w-0">
                      <p className="text-xs text-slate-400">Date of Birth</p>
                      <p className="truncate text-sm font-semibold text-[#1E3A8A]">
                        {formatDobLong(selected.dateOfBirth)}
                        {age != null && age >= 0
                          ? ` (Age: ${age} ${age === 1 ? "year" : "years"})`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex min-w-0 items-start gap-2">
                    <User className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
                    <div className="min-w-0">
                      <p className="text-xs text-slate-400">Gender</p>
                      <p className="truncate text-sm font-semibold capitalize text-[#1E3A8A]">
                        {selected.gender || "—"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>

        <Card className="rounded-2xl border border-slate-100/80 bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.06)] flex flex-col items-center justify-center text-center">
          <div className="relative h-[92px] w-[92px]">
            <ChartContainer config={donutConfig} className="h-full w-full aspect-auto">
              <PieChart>
                <Pie
                  data={overallDonut}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={30}
                  outerRadius={42}
                  startAngle={90}
                  endAngle={-270}
                  strokeWidth={0}
                >
                  {overallDonut.map((e) => (
                    <Cell key={e.name} fill={e.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="absolute inset-0 grid place-items-center pointer-events-none">
              <p className="text-lg font-bold text-[#0F172A] leading-none">
                {overallRate != null ? `${Math.round(overallRate)}%` : "—"}
              </p>
            </div>
          </div>
          <p className="mt-1.5 text-sm font-semibold text-[#0F172A]">Overall Attendance</p>
          <p className="text-xs text-slate-500">
            Present Days: {overallPresent} / {overallTotal || "—"}
          </p>
        </Card>

        <Card className="rounded-2xl border border-slate-100/80 bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.06)] flex flex-col justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-sm">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-3xl font-bold tabular-nums leading-none text-[#0F172A]">
                {isLoading ? "…" : present}
              </p>
              <p className="mt-1 text-sm font-medium text-slate-500">Present</p>
            </div>
          </div>
          <TrendLine value={presentTrend} upIsGood />
        </Card>

        <Card className="rounded-2xl border border-slate-100/80 bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.06)] flex flex-col justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white shadow-sm">
              <XCircle className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-3xl font-bold tabular-nums leading-none text-[#0F172A]">
                {isLoading ? "…" : absent}
              </p>
              <p className="mt-1 text-sm font-medium text-slate-500">Absent</p>
            </div>
          </div>
          <TrendLine value={absentTrend} upIsGood={false} />
        </Card>

        <Card className="rounded-2xl border border-slate-100/80 bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.06)] flex flex-col justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-400 text-white shadow-sm">
              <Clock3 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-3xl font-bold tabular-nums leading-none text-[#0F172A]">
                {isLoading ? "…" : late}
              </p>
              <p className="mt-1 text-sm font-medium text-slate-500">Late</p>
            </div>
          </div>
          <TrendLine value={lateTrend} upIsGood={false} />
        </Card>
      </div>

      {/* Charts + calendar */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="rounded-2xl border-0 bg-white p-4 sm:p-5 shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[15px] font-bold text-primary">Attendance Overview</h3>
            <span className="text-xs text-muted-foreground">{MONTH_SHORT[month - 1]} {year}</span>
          </div>
          <ChartContainer config={barConfig} className="h-[220px] w-full aspect-auto">
            <BarChart data={weeks} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="#EEF2F7" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#94A3B8", fontSize: 10 }} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "#94A3B8", fontSize: 10 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="present" stackId="a" fill="#10B981" />
              <Bar dataKey="late" stackId="a" fill="#F59E0B" />
              <Bar dataKey="absent" stackId="a" fill="#F43F5E" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </Card>

        <Card className="rounded-2xl border-0 bg-white p-4 sm:p-5 shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
          <h3 className="text-[15px] font-bold text-primary mb-3">Attendance Breakdown</h3>
          {marked === 0 ? (
            <p className="text-sm text-muted-foreground py-16 text-center">No marked days this month.</p>
          ) : (
            <div className="flex items-center gap-4">
              <div className="relative h-[150px] w-[150px] shrink-0">
                <ChartContainer config={donutConfig} className="h-full w-full aspect-auto">
                  <PieChart>
                    <Pie
                      data={breakdownPie}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={48}
                      outerRadius={68}
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {breakdownPie.map((e) => (
                        <Cell key={e.name} fill={e.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="absolute inset-0 grid place-items-center pointer-events-none">
                  <div className="text-center">
                    <p className="text-lg font-bold text-primary leading-none">
                      {monthRate != null ? `${Math.round(monthRate)}%` : "—"}
                    </p>
                    <p className="text-[10px] text-emerald-600 font-medium mt-0.5">Present</p>
                  </div>
                </div>
              </div>
              <div className="flex-1 space-y-2.5 text-sm min-w-0">
                {breakdownPie.map((s) => (
                  <div key={s.name} className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 text-slate-600">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.fill }} />
                      {s.name}
                    </span>
                    <span className="font-semibold text-primary tabular-nums">
                      {s.value} ({s.pct ?? 0}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card className="rounded-2xl border-0 bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-primary">
              {MONTHS[month - 1]} {year}
            </h3>
          </div>
          <div className="w-full">
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground mb-1">
              {WEEKDAYS.map((d) => (
                <div key={d} className="py-0.5">
                  {d.slice(0, 2)}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 place-items-center">
              {Array.from({ length: firstDow }).map((_, i) => (
                <div key={`b-${i}`} className="h-8 w-8 shrink-0" />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const rec = byDay.get(key);
                const isSelected = selectedDay === key;
                return (
                  <button
                    key={key}
                    type="button"
                    title={rec ? `${key}: ${rec.status}` : key}
                    onClick={() => setSelectedDay(isSelected ? null : key)}
                    className={cn(
                      "h-8 w-8 shrink-0 rounded-full text-sm font-semibold tabular-nums transition-colors leading-none grid place-items-center",
                      calDayClass(rec?.status, isSelected),
                    )}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Present
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-500" /> Absent
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500" /> Late
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#2563EB]" /> Selected
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Bottom tabs + table */}
      <Card className="rounded-2xl border-0 bg-white shadow-[0_2px_12px_rgba(15,23,42,0.06)] overflow-hidden">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 sm:px-5 pt-4 pb-3 border-b border-slate-100">
          <div className="flex flex-wrap gap-1.5 p-1 rounded-full bg-slate-100/80 w-fit">
            {(
              [
                { key: "records" as const, label: "Attendance Records" },
                { key: "summary" as const, label: "Monthly Summary" },
                // { key: "leave" as const, label: "Leave Applications" },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-xs sm:text-sm font-semibold transition-colors",
                  tab === t.key
                    ? "bg-[#2563EB] text-white shadow-sm"
                    : "text-slate-600 hover:text-primary",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
              value={`${year}-${month}`}
              onChange={(e) => {
                const [y, m] = e.target.value.split("-").map(Number);
                setYear(y);
                setMonth(m);
                setSelectedDay(null);
              }}
              aria-label="Month"
            >
              {yearOptions.flatMap((y) =>
                MONTHS.map((name, i) => (
                  <option key={`${y}-${i + 1}`} value={`${y}-${i + 1}`}>
                    {name} {y}
                  </option>
                )),
              )}
            </select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              disabled={!selected || recordsSorted.length === 0}
              onClick={() =>
                selected &&
                downloadMonthCsv(selected.studentName, month, year, recordsSorted)
              }
            >
              <Download className="h-4 w-4" />
              Download Report
            </Button>
          </div>
        </div>

        <div className="px-4 sm:px-5 py-4">
          {tab === "summary" && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Present", value: present, tone: "text-emerald-600" },
                { label: "Absent", value: absent, tone: "text-rose-600" },
                { label: "Late", value: late, tone: "text-amber-600" },
                { label: "Leave", value: leave, tone: "text-sky-600" },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className={cn("mt-1 text-2xl font-bold tabular-nums", s.tone)}>{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {MONTHS[month - 1]} {year}
                  </p>
                </div>
              ))}
              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4 sm:col-span-2 lg:col-span-4">
                <p className="text-xs text-muted-foreground">Attendance rate (present + late)</p>
                <p className="mt-1 text-2xl font-bold text-primary tabular-nums">
                  {monthRate != null ? `${monthRate}%` : "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {presentLike} of {marked} marked days
                </p>
              </div>
            </div>
          )}

          {/* Leave Applications tab — hidden for now
          {tab === "leave" && (
            leaveRecords.length === 0 ? (
              <p className="text-sm text-muted-foreground py-10 text-center">
                No leave days recorded for {MONTHS[month - 1]} {year}.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-slate-500">
                      <th className="pb-2.5 font-medium">Date</th>
                      <th className="pb-2.5 font-medium">Day</th>
                      <th className="pb-2.5 font-medium">Status</th>
                      <th className="pb-2.5 font-medium">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaveRecords.map((r) => {
                      const ymd = dayKey(r.date);
                      return (
                        <tr key={r._id || ymd} className="border-b border-slate-100 last:border-0">
                          <td className="py-3 font-medium text-primary">{formatDayLong(ymd)}</td>
                          <td className="py-3 text-slate-600">{formatWeekday(ymd)}</td>
                          <td className="py-3">
                            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize", statusBadgeClass(r.status))}>
                              {r.status}
                            </span>
                          </td>
                          <td className="py-3 text-slate-600">{remarkFor(r)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
          */}

          {tab === "records" && (
            isLoading ? (
              <p className="text-sm text-muted-foreground py-10 text-center">Loading records…</p>
            ) : recordsSorted.length === 0 ? (
              <p className="text-sm text-muted-foreground py-10 text-center">
                No attendance marked for {MONTHS[month - 1]} {year}.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-slate-500">
                      <th className="pb-2.5 font-medium">Date</th>
                      <th className="pb-2.5 font-medium">Day</th>
                      <th className="pb-2.5 font-medium">Status</th>
                      <th className="pb-2.5 font-medium">Time In</th>
                      <th className="pb-2.5 font-medium">Time Out</th>
                      <th className="pb-2.5 font-medium">Remarks</th>
                      <th className="pb-2.5 font-medium w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {recordsSorted
                      .filter((r) => !selectedDay || dayKey(r.date) === selectedDay)
                      .map((r) => {
                        const ymd = dayKey(r.date);
                        return (
                          <tr
                            key={r._id || ymd}
                            className={cn(
                              "border-b border-slate-100 last:border-0 hover:bg-slate-50/80",
                              selectedDay === ymd && "bg-sky-50/50",
                            )}
                          >
                            <td className="py-3 font-medium text-primary">{formatDayLong(ymd)}</td>
                            <td className="py-3 text-slate-600">{formatWeekday(ymd)}</td>
                            <td className="py-3">
                              <span
                                className={cn(
                                  "rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize",
                                  statusBadgeClass(r.status),
                                )}
                              >
                                {r.status}
                              </span>
                            </td>
                            <td className="py-3 tabular-nums text-slate-600">{formatTime(r.checkIn)}</td>
                            <td className="py-3 tabular-nums text-slate-600">{formatTime(r.checkOut)}</td>
                            <td className="py-3 text-slate-600 max-w-[14rem] truncate">{remarkFor(r)}</td>
                            <td className="py-3 text-slate-300">
                              <ChevronRight className="h-4 w-4" />
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      </Card>
    </div>
  );
}
