import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  UsersRound,
} from "lucide-react";
import { usePanelSession } from "@/components/panel-header/PanelSessionContext";
import { isAllSessions } from "@/lib/configApi";
import { moduleHref } from "@/lib/panelMenus";
import { timetableHref } from "@/lib/timetableMenus";
import { testExamsHref, classTestMarksHref } from "@/lib/testExamsMenus";
import { fetchMyTeacherSchedule, fetchTeacherAssignments } from "@/lib/timetableApi";
import {
  fetchAcademyAttendanceSummary,
  fetchAcademyStudents,
  fetchClassTestEntry,
  fetchClassTests,
} from "@/lib/studentManagementApi";
import { fetchAnnouncements } from "@/lib/announcementApi";
import { fetchNotifications } from "@/lib/notificationsApi";
import type { Role } from "@/lib/auth";
import {
  activitiesFromAnnouncements,
  activitiesFromNotifications,
  addDays,
  attendanceRateFromSummary,
  buildPerformanceSeries,
  deadlinesFromClassTests,
  groupAssignmentsIntoClasses,
  lastNMonthKeys,
  toScheduleRows,
  weekdayFromDate,
  type PerformancePoint,
} from "@/lib/teacherDashboard";
import { WelcomeBanner } from "./teacher-dashboard/WelcomeBanner";
import { TeacherMetricCards, type TeacherMetric } from "./teacher-dashboard/TeacherMetricCards";
import { TodaysScheduleCard } from "./teacher-dashboard/TodaysScheduleCard";
import { StudentPerformanceChart } from "./teacher-dashboard/StudentPerformanceChart";
import { QuickActionsCard } from "./teacher-dashboard/QuickActionsCard";
import { MyClassesSection } from "./teacher-dashboard/MyClassesSection";
import { UpcomingDeadlinesCard } from "./teacher-dashboard/UpcomingDeadlinesCard";
import { RecentActivityCard } from "./teacher-dashboard/RecentActivityCard";

function buildTeacherMetrics(input: {
  classes: number | string;
  students: number | string;
  pending: number | string;
  today: number | string;
  classesHref: string;
  studentsHref: string;
  pendingHref: string;
  scheduleHref: string;
}): TeacherMetric[] {
  return [
    {
      id: "classes",
      label: "My Classes",
      value: input.classes,
      hint: "Active classes",
      linkLabel: "View Classes",
      href: input.classesHref,
      tone: "blue",
      icon: BookOpen,
    },
    {
      id: "students",
      label: "Total Students",
      value: input.students,
      hint: "Across all my classes",
      linkLabel: "View Students",
      href: input.studentsHref,
      tone: "green",
      icon: UsersRound,
    },
    {
      id: "pending",
      label: "Pending Assignments",
      value: input.pending,
      hint: "To be graded",
      linkLabel: "View Assignments",
      href: input.pendingHref,
      tone: "purple",
      icon: ClipboardList,
    },
    {
      id: "today",
      label: "Today's Schedule",
      value: input.today,
      hint: "Classes today",
      linkLabel: "View Schedule",
      href: input.scheduleHref,
      tone: "orange",
      icon: CalendarDays,
    },
  ];
}

async function loadPerformanceSeries(classTestIds: string[]): Promise<PerformancePoint[]> {
  const months = lastNMonthKeys(6);
  const attendancePairs = await Promise.all(
    months.map(async (m) => {
      try {
        const summary = await fetchAcademyAttendanceSummary({
          month: m.monthIndex,
          year: m.year,
        });
        return [m.key, attendanceRateFromSummary(summary)] as const;
      } catch {
        return [m.key, 0] as const;
      }
    }),
  );
  const attendanceByKey = Object.fromEntries(attendancePairs);

  const scoreBuckets: Record<string, { sumPct: number; count: number; pass: number }> = {};
  const ids = classTestIds.slice(0, 8);
  const entries = await Promise.all(
    ids.map(async (id) => {
      try {
        return await fetchClassTestEntry(id);
      } catch {
        return null;
      }
    }),
  );

  for (const entry of entries) {
    if (!entry?.test?.examDate) continue;
    const d = new Date(entry.test.examDate);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
    const total = Number(entry.test.totalMarks) || 0;
    if (total <= 0) continue;
    if (!scoreBuckets[key]) scoreBuckets[key] = { sumPct: 0, count: 0, pass: 0 };
    for (const row of entry.students || []) {
      const obtained = row.assessment?.obtainedMarks;
      if (obtained == null || Number.isNaN(Number(obtained))) continue;
      const pct = Math.max(0, Math.min(100, (Number(obtained) / total) * 100));
      scoreBuckets[key].sumPct += pct;
      scoreBuckets[key].count += 1;
      if (pct >= 40) scoreBuckets[key].pass += 1;
    }
  }

  const scoreByKey: Record<string, { averageScore: number; passRate: number }> = {};
  for (const [key, b] of Object.entries(scoreBuckets)) {
    if (!b.count) continue;
    scoreByKey[key] = {
      averageScore: Math.round(b.sumPct / b.count),
      passRate: Math.round((b.pass / b.count) * 100),
    };
  }

  return buildPerformanceSeries(months, attendanceByKey, scoreByKey);
}

export default function TeacherDashboard({
  name,
  role = "teacher",
  avatarUrl,
}: {
  name: string;
  role?: Role;
  avatarUrl?: string | null;
}) {
  const { sessionId, apiSessionId } = usePanelSession();
  const hasConcreteSession = Boolean(apiSessionId) && !isAllSessions(sessionId);
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return d;
  });

  const viewWeekday = weekdayFromDate(viewDate);

  const { data: scheduleData, isLoading: scheduleLoading } = useQuery({
    queryKey: ["teacher-dashboard-schedule", apiSessionId],
    queryFn: () => fetchMyTeacherSchedule(apiSessionId!),
    enabled: hasConcreteSession,
    retry: false,
    staleTime: 60_000,
  });

  const { data: assignments = [], isLoading: classesLoading } = useQuery({
    queryKey: ["teacher-dashboard-assignments", apiSessionId],
    queryFn: () => fetchTeacherAssignments({ sessionId: apiSessionId! }),
    enabled: hasConcreteSession,
    retry: false,
    staleTime: 60_000,
  });

  const { data: studentsPage } = useQuery({
    queryKey: ["teacher-dashboard-students", apiSessionId],
    queryFn: () =>
      fetchAcademyStudents({
        page: 1,
        limit: 500,
        status: "active",
        sessionId: apiSessionId,
      }),
    enabled: hasConcreteSession,
    retry: false,
    staleTime: 60_000,
  });

  const { data: classTests = [] } = useQuery({
    queryKey: ["teacher-dashboard-class-tests", apiSessionId],
    queryFn: () => fetchClassTests(undefined, undefined, apiSessionId),
    enabled: hasConcreteSession,
    retry: false,
    staleTime: 60_000,
  });

  const closedTestIds = useMemo(
    () =>
      [...classTests]
        .filter((t) => t.status === "closed")
        .sort((a, b) => new Date(b.examDate).getTime() - new Date(a.examDate).getTime())
        .map((t) => t._id),
    [classTests],
  );

  const { data: performanceData = [] } = useQuery({
    queryKey: ["teacher-dashboard-performance", apiSessionId, closedTestIds.slice(0, 8).join(",")],
    queryFn: () => loadPerformanceSeries(closedTestIds),
    enabled: hasConcreteSession,
    retry: false,
    staleTime: 120_000,
  });

  const { data: announcements = [] } = useQuery({
    queryKey: ["teacher-dashboard-announcements"],
    queryFn: () => fetchAnnouncements(),
    retry: false,
    staleTime: 60_000,
  });

  const { data: notifications } = useQuery({
    queryKey: ["teacher-dashboard-notifications"],
    queryFn: () => fetchNotifications({ limit: 12 }),
    retry: false,
    staleTime: 30_000,
  });

  const studentCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of studentsPage?.students || []) {
      const classId =
        typeof s.classId === "object" && s.classId?._id
          ? s.classId._id
          : String(s.classId || "");
      const sectionId =
        typeof s.sectionId === "object" && s.sectionId?._id
          ? s.sectionId._id
          : String(s.sectionId || "");
      if (!classId || !sectionId) continue;
      const key = `${classId}:${sectionId}`;
      map[key] = (map[key] || 0) + 1;
    }
    return map;
  }, [studentsPage?.students]);

  const classes = useMemo(
    () => groupAssignmentsIntoClasses(assignments, studentCounts),
    [assignments, studentCounts],
  );

  const daySlots = useMemo(
    () => (scheduleData?.slots || []).filter((s) => s.day === viewWeekday),
    [scheduleData?.slots, viewWeekday],
  );

  const scheduleRows = useMemo(
    () => toScheduleRows(daySlots, viewDate),
    [daySlots, viewDate],
  );

  const todaySlotsCount = useMemo(() => {
    const todayKey = weekdayFromDate(new Date());
    return (scheduleData?.slots || []).filter((s) => s.day === todayKey).length;
  }, [scheduleData?.slots]);

  const pendingTests = useMemo(
    () => classTests.filter((t) => t.status === "open").length,
    [classTests],
  );

  const totalStudents =
    studentsPage?.pagination?.total ?? studentsPage?.students?.length ?? 0;

  const deadlines = useMemo(
    () => deadlinesFromClassTests(classTests, (id) => classTestMarksHref(role, id)),
    [classTests, role],
  );

  const activities = useMemo(() => {
    const fromNotes = activitiesFromNotifications(notifications?.items || []);
    if (fromNotes.length) return fromNotes;
    return activitiesFromAnnouncements(announcements);
  }, [notifications?.items, announcements]);

  const hrefs = {
    classes: moduleHref(role, "my-classes"),
    students: moduleHref(role, "students"),
    attendance: moduleHref(role, "attendance"),
    exams: testExamsHref(role),
    schedule: timetableHref(role, "mine"),
    chat: moduleHref(role, "chat"),
    announcements: moduleHref(role, "announcements"),
  };

  const metrics = buildTeacherMetrics({
    classes: classes.length,
    students: totalStudents,
    pending: pendingTests,
    today: todaySlotsCount,
    classesHref: hrefs.classes,
    studentsHref: hrefs.students,
    pendingHref: hrefs.exams,
    scheduleHref: hrefs.schedule,
  });

  return (
    <section className="min-h-full w-full">
      <div className="w-full px-4 sm:px-5 lg:px-6 xl:px-8 py-4 sm:py-5 space-y-4">
        {!hasConcreteSession ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Select a specific academic session in the header to load your live classes, schedule, and
            students.
          </div>
        ) : null}

        <WelcomeBanner name={name} avatarUrl={avatarUrl} />

        <TeacherMetricCards metrics={metrics} />

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.95fr)_minmax(0,0.95fr)] gap-4 items-stretch">
          <div className="min-w-0">
            <TodaysScheduleCard
              date={viewDate}
              rows={scheduleRows}
              scheduleHref={hrefs.schedule}
              loading={scheduleLoading && hasConcreteSession}
              onPrev={() => setViewDate((d) => addDays(d, -1))}
              onNext={() => setViewDate((d) => addDays(d, 1))}
            />
          </div>
          <div className="min-w-0">
            <StudentPerformanceChart data={performanceData} />
          </div>
          <div className="min-w-0">
            <QuickActionsCard
              attendanceHref={hrefs.attendance}
              assignmentHref={hrefs.exams}
              gradesHref={hrefs.exams}
              messagesHref={hrefs.chat}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)_minmax(0,1fr)] gap-4 items-stretch">
          <div className="min-w-0">
            <MyClassesSection
              classes={classes}
              classesHref={hrefs.classes}
              studentsHref={hrefs.students}
              loading={classesLoading && hasConcreteSession}
            />
          </div>
          <div className="min-w-0">
            <UpcomingDeadlinesCard items={deadlines} viewAllHref={hrefs.exams} />
          </div>
          <div className="min-w-0">
            <RecentActivityCard items={activities} viewAllHref={hrefs.announcements} />
          </div>
        </div>
      </div>
    </section>
  );
}
