import { Navigate, useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Role } from "@/lib/auth";
import { roleMeta, findModule, buildMenu, moduleHref } from "@/lib/panelMenus";
import { systemConfigHref } from "@/lib/systemConfigMenus";
import { studentManagementHref } from "@/lib/studentManagementMenus";
import { defaultTimetableSection, timetableHref } from "@/lib/timetableMenus";
import { testExamsHref } from "@/lib/testExamsMenus";
import { usePermissions } from "@/hooks/usePermissions";
import {
  applyBackendModulePermissions, ModuleKey, resolveModuleCaps,
} from "@/lib/permissions";
import { Card } from "@/components/ui/card";
import SEO from "@/components/SEO";
import ModuleHeader from "@/components/modules/ModuleHeader";
import StudentsRecordsModule from "@/components/modules/StudentsRecordsModule";
import UsersModule from "@/components/modules/UsersModule";
import AttendanceModule from "@/components/modules/AttendanceModule";
import TimetableModule from "@/components/modules/TimetableModule";
import SystemConfigModule from "@/components/modules/SystemConfigModule";
import ExamsModule from "@/components/modules/ExamsModule";
import FeesModule from "@/components/modules/FeesModule";
import SalaryModule from "@/components/modules/SalaryModule";
import ExpensesModule from "@/components/modules/ExpensesModule";
import ChatModule from "@/components/modules/ChatModule";
import AnnouncementsModule from "@/components/modules/AnnouncementsModule";
import ReportsModule from "@/components/modules/ReportsModule";
import SettingsModule from "@/components/modules/SettingsModule";
import DatasheetsModule from "@/components/modules/DatasheetsModule";
import PermissionsModule from "@/components/modules/PermissionsModule";
import StudentManagementModule from "@/components/modules/StudentManagementModule";
import PermissionCatalogModule from "@/components/modules/PermissionCatalogModule";
import AiAttendanceModule from "@/components/modules/AiAttendanceModule";
import StaffAttendanceModule from "@/components/modules/StaffAttendanceModule";
import TeacherFeatureModule from "@/components/modules/TeacherFeatureModule";
import { fetchExams } from "@/lib/examApi";
import { fetchAnnouncements } from "@/lib/announcementApi";
import {
  fetchAcademyAttendanceDay,
  fetchAcademyFeeSummary,
  fetchAcademySalarySummary,
  fetchAcademyExpenseSummary,
  fetchAcademyStudents,
} from "@/lib/studentManagementApi";

const TEACHER_FEATURE_KEYS = new Set<ModuleKey>([
  "my-classes",
  "my-subjects",
  "homework",
  "study-materials",
  "lesson-plans",
  "student-progress",
  "behaviour",
  "parent-meetings",
  "online-classes",
  "library",
  "school-calendar",
  "notifications",
  "leave",
]);

const Dashboard = ({
  role,
  name,
  modulePermissions,
}: {
  role: Role;
  name: string;
  modulePermissions?: Record<string, string[]>;
}) => {
  const cfg = roleMeta[role];
  const HeaderIcon = cfg.Icon;
  const { perms } = usePermissions();
  const rolePerms = applyBackendModulePermissions(perms[role], modulePermissions, role);
  const items = buildMenu(rolePerms, modulePermissions, role).filter((m) => m.key !== "dashboard");

  const today = new Date().toISOString().slice(0, 10);
  const { data: termExams = [] } = useQuery({
    queryKey: ["dashboard-term-exams"],
    queryFn: () => fetchExams(),
    retry: false,
  });

  const useAcademyData = role === "admin" || role === "accountant";

  const { data: feeSummary } = useQuery({
    queryKey: ["academy-fees-summary-dashboard"],
    queryFn: () => fetchAcademyFeeSummary(),
    enabled: useAcademyData,
    retry: false,
  });

  const { data: academyStudentTotal } = useQuery({
    queryKey: ["academy-students-total"],
    queryFn: async () => {
      const r = await fetchAcademyStudents({ page: 1, limit: 1 });
      return r.pagination?.total ?? r.students.length;
    },
    enabled: useAcademyData,
    retry: false,
  });

  const now = new Date();
  const dashPeriod = { month: now.getMonth() + 1, year: now.getFullYear() };

  const { data: salarySummary } = useQuery({
    queryKey: ["academy-salaries-summary-dashboard", dashPeriod],
    queryFn: () => fetchAcademySalarySummary(dashPeriod),
    enabled: useAcademyData,
    retry: false,
  });

  const { data: expenseSummary } = useQuery({
    queryKey: ["academy-expenses-summary-dashboard", dashPeriod],
    queryFn: () => fetchAcademyExpenseSummary(dashPeriod),
    enabled: useAcademyData,
    retry: false,
  });

  const { data: todayAttendance } = useQuery({
    queryKey: ["academy-attendance-today-dashboard", today],
    queryFn: () => fetchAcademyAttendanceDay({ date: today }),
    enabled: role === "admin" || role === "accountant" || role === "teacher",
    retry: false,
  });

  const { data: announcements = [] } = useQuery({
    queryKey: ["announcements-dashboard-count"],
    queryFn: () => fetchAnnouncements(),
    retry: false,
  });

  const present = todayAttendance?.summary?.present ?? 0;
  const collected = feeSummary?.totalPaid ?? 0;
  const due = feeSummary?.totalPending ?? 0;
  const termExamCount = termExams.length;
  const pendingSalary = salarySummary?.byStatus?.pending ?? 0;
  const monthExpenses = expenseSummary?.totalAmount ?? 0;
  const studentTotal = academyStudentTotal ?? 0;
  const announcementCount = announcements.length;

  const statsByRole: Record<Role, { label: string; value: string; hint: string }[]> = {
    admin: [
      { label: "Academy students", value: String(studentTotal), hint: "Registered tuition students" },
      { label: "Fees collected", value: `₨ ${collected.toLocaleString()}`, hint: "Paid vouchers (all periods)" },
      { label: "Outstanding", value: `₨ ${due.toLocaleString()}`, hint: "Pending & overdue" },
      { label: "This month expenses", value: `₨ ${monthExpenses.toLocaleString()}`, hint: "Operating costs" },
    ],
    accountant: [
      { label: "Collected", value: `₨ ${collected.toLocaleString()}`, hint: "Academy fees received" },
      { label: "Outstanding", value: `₨ ${due.toLocaleString()}`, hint: "Pending & overdue" },
      { label: "Pending salary", value: String(pendingSalary), hint: "This month vouchers" },
      { label: "Month expenses", value: `₨ ${monthExpenses.toLocaleString()}`, hint: "Academy operating costs" },
    ],
    teacher: [
      { label: "Present today", value: String(present), hint: today },
      { label: "Unmarked today", value: String(todayAttendance?.summary?.unmarked ?? "—"), hint: "Academy attendance" },
      { label: "Term exams", value: String(termExamCount), hint: "Mid / final terms" },
      { label: "Announcements", value: String(announcementCount), hint: "Published notices" },
    ],
    parent: [
      { label: "Announcements", value: String(announcementCount), hint: "Published notices" },
      { label: "Term exams", value: String(termExamCount), hint: "Published results in Exams" },
      { label: "Fees outstanding", value: due ? `₨ ${due.toLocaleString()}` : "None", hint: "Academy fees" },
      { label: "Fees collected", value: `₨ ${collected.toLocaleString()}`, hint: "All periods" },
    ],
    student: [
      { label: "Term exams", value: String(termExamCount), hint: "See student profile" },
      { label: "Announcements", value: String(announcementCount), hint: "School notices" },
      { label: "Fees outstanding", value: due ? `₨ ${due.toLocaleString()}` : "None", hint: "Academy fees" },
      { label: "Fees collected", value: `₨ ${collected.toLocaleString()}`, hint: "All periods" },
    ],
  };

  return (
    <section>
      <div className="bg-[image:var(--gradient-hero)] text-primary-foreground">
        <div className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10 flex items-center gap-4">
          <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl bg-accent/20 border border-accent/40 grid place-items-center shrink-0">
            <HeaderIcon className="h-6 w-6 sm:h-7 sm:w-7 text-accent" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] sm:text-xs tracking-[0.3em] uppercase text-accent">{cfg.accentLabel}</div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight">{cfg.title}</h1>
            <p className="text-primary-foreground/80 text-xs sm:text-sm mt-1 truncate">
              Welcome back, <span className="font-semibold">{name}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-8 sm:space-y-10">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          {statsByRole[role].map((s) => (
            <Card key={s.label} className="p-4 sm:p-5 hover:shadow-elegant transition-smooth">
              <div className="text-xs sm:text-sm text-muted-foreground">{s.label}</div>
              <div className="font-display text-2xl sm:text-3xl font-bold text-primary mt-2 break-words">{s.value}</div>
            </Card>
          ))}
        </div>

        <div>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-primary mb-4">Modules</h2>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
            {items.map((m) => (
              <Link key={m.key} to={moduleHref(role, m.key)}>
                <Card className="p-4 sm:p-5 group cursor-pointer hover:border-accent hover:shadow-elegant transition-smooth h-full">
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-lg bg-accent/10 grid place-items-center group-hover:bg-accent transition-smooth shrink-0">
                      <m.Icon className="h-5 w-5 text-accent group-hover:text-accent-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-primary">{m.label}</div>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

const Panel = () => {
  const { role, slug, section, action, subAction } = useParams<{
    role: Role; slug?: string; section?: string; action?: string; subAction?: string;
  }>();
  const { user: session, loading } = useAuth();
  const { perms } = usePermissions();

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;
  if (!role || !roleMeta[role as Role]) return <Navigate to={`/panel/${session.role}`} replace />;
  if (session.role !== role) return <Navigate to={`/panel/${session.role}`} replace />;

  const r = role as Role;

  // Dashboard
  if (!slug) {
    return (
      <>
        <SEO title={`${roleMeta[r].title} | The Concept`} description={`${roleMeta[r].title} dashboard.`} />
        <Dashboard role={r} name={session.name} modulePermissions={session.modulePermissions} />
      </>
    );
  }

  const mod = findModule(slug);
  if (!mod) return <Navigate to={`/panel/${r}`} replace />;

  const rolePerms = applyBackendModulePermissions(perms[r], session.modulePermissions, r);
  const perm = rolePerms[mod.key as ModuleKey];
  const caps = resolveModuleCaps(mod.key as ModuleKey, perm, session.modulePermissions, r);

  if (mod.key === "system-config" && !section) {
    return <Navigate to={systemConfigHref(r)} replace />;
  }

  if (mod.key === "timetable" && !section) {
    return (
      <Navigate
        to={timetableHref(r, defaultTimetableSection({ caps, role: r }))}
        replace
      />
    );
  }

  if (mod.key === "exams" && !section) {
    return <Navigate to={testExamsHref(r)} replace />;
  }
  if (!caps.canView) {
    return (
      <div className="px-6 py-12 text-center">
        <h2 className="font-display text-2xl font-bold text-primary">Access denied</h2>
        <p className="text-muted-foreground mt-2">Your role does not have access to {mod.label}.</p>
      </div>
    );
  }

  const renderModule = () => {
    switch (mod.key) {
      case "users":         return <UsersModule perm={perm} caps={caps} scope="all" />;
      case "staff-management": return <UsersModule perm={perm} caps={caps} scope="staff" />;
      case "student-management": return (
        <StudentManagementModule perm={perm} caps={caps} section={section} action={action} subAction={subAction} />
      );
      case "students":      return (
        <StudentsRecordsModule perm={perm} caps={caps} section={section} action={action} />
      );
      case "attendance":    return <AttendanceModule perm={perm} caps={caps} />;
      case "staff-attendance": return <StaffAttendanceModule caps={caps} />;
      case "ai-attendance": return <AiAttendanceModule caps={caps} />;
      case "system-config": return <SystemConfigModule caps={caps} section={section} action={action} />;
      case "timetable":     return <TimetableModule caps={caps} section={section} role={r} />;
      case "exams":         return <ExamsModule perm={perm} caps={caps} section={section} action={action} subAction={subAction} />;
      case "fees":          return <FeesModule perm={perm} caps={caps} />;
      case "salary":        return <SalaryModule perm={perm} caps={caps} />;
      case "expenses":      return <ExpensesModule perm={perm} caps={caps} />;
      case "chat":          return <ChatModule user={session} perm={perm} caps={caps} />;
      case "announcements": return <AnnouncementsModule perm={perm} caps={caps} />;
      case "reports":       return <ReportsModule />;
      case "datasheets":    return <DatasheetsModule perm={perm} caps={caps} />;
      case "permissions":   return <PermissionsModule perm={perm} caps={caps} />;
      case "permission-catalog": return <PermissionCatalogModule role={r} />;
      case "settings":      return <SettingsModule />;
      default:
        if (TEACHER_FEATURE_KEYS.has(mod.key as ModuleKey)) {
          return <TeacherFeatureModule moduleKey={mod.key as ModuleKey} caps={caps} />;
        }
        return <div className="p-6 text-muted-foreground">Module coming soon.</div>;
    }
  };

  return (
    <>
      <SEO title={`${mod.label} | ${roleMeta[r].title}`} description={mod.desc} />
      <ModuleHeader module={mod} role={r} />
      {renderModule()}
    </>
  );
};

export default Panel;
