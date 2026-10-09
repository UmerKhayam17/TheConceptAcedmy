import type { ComponentType } from "react";
import {
  LayoutDashboard,
  GraduationCap,
  History,
  School,
  Layers,
  BookOpen,
  DoorOpen,
  UserCircle,
  Link2,
  Clock,
  SlidersHorizontal,
  LayoutGrid,
  Table2,
  UserPlus,
  ClipboardList,
  CalendarDays,
  Calendar,
  Award,
  Wallet,
  DollarSign,
  Receipt,
  MessageSquare,
  Bell,
  ScanFace,
  BarChart3,
  FileText,
  Users,
  UserCog,
  KeyRound,
  Route,
} from "lucide-react";
import type { Role } from "./auth";
import type { ModuleKey } from "./permissions";
import { systemConfigHref } from "./systemConfigMenus";
import { studentManagementHref } from "./studentManagementMenus";
import { timetableHref } from "./timetableMenus";
import { testExamsHref } from "./testExamsMenus";
import { moduleHref } from "./panelMenus";

export type SidebarNavItem = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Module permission required to show this link */
  moduleKey: ModuleKey;
  href: (role: Role) => string;
  /** Require create/edit (not view-only) */
  requireManage?: boolean;
  /** Extra active-path matching beyond exact/prefix href */
  isActive?: (pathname: string, role: Role) => boolean;
  /** Nested links, rendered under this item */
  children?: SidebarNavItem[];
};

export type SidebarNavGroup = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** When true, group renders as a collapsible section */
  collapsible: boolean;
  items: SidebarNavItem[];
};

const p = (role: Role) => `/panel/${role}`;

/** Full panel sidebar — ordered for setup → teaching → ops. */
export const SIDEBAR_NAV: SidebarNavGroup[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    collapsible: false,
    items: [
      {
        id: "dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        moduleKey: "dashboard",
        href: (role) => moduleHref(role, "dashboard"),
        isActive: (pathname, role) => pathname === p(role),
      },
    ],
  },
  {
    id: "academic-setup",
    label: "Academic Setup",
    icon: GraduationCap,
    collapsible: true,
    items: [
      {
        id: "sessions",
        label: "Sessions",
        icon: GraduationCap,
        moduleKey: "system-config",
        href: (role) => systemConfigHref(role, "academic"),
      },
      {
        id: "session-history",
        label: "Session History",
        icon: History,
        moduleKey: "system-config",
        href: (role) => systemConfigHref(role, "history"),
      },
      {
        id: "classes",
        label: "Classes",
        icon: School,
        moduleKey: "student-management",
        href: (role) => studentManagementHref(role, "classes"),
        isActive: (pathname, role) =>
          pathname.startsWith(`${p(role)}/student-management/classes`),
      },
      {
        id: "sections",
        label: "Sections",
        icon: Layers,
        moduleKey: "student-management",
        href: (role) => studentManagementHref(role, "sections"),
      },
      {
        id: "subjects",
        label: "Subjects",
        icon: BookOpen,
        moduleKey: "student-management",
        href: (role) => studentManagementHref(role, "subjects"),
      },
      {
        id: "disciplines",
        label: "Disciplines",
        icon: Route,
        moduleKey: "student-management",
        href: (role) => studentManagementHref(role, "disciplines"),
        isActive: (pathname, role) =>
          pathname.startsWith(`${p(role)}/student-management/disciplines`),
      },
      {
        id: "assessments-config",
        label: "Assessment Catalog",
        icon: ClipboardList,
        moduleKey: "system-config",
        href: (role) => systemConfigHref(role, "test-catalog"),
        isActive: (pathname, role) =>
          pathname.startsWith(`${p(role)}/system-config/test-catalog`) ||
          pathname.startsWith(`${p(role)}/system-config/exam-catalog`) ||
          pathname.startsWith(`${p(role)}/system-config/assessments`),
        children: [
          {
            id: "test-catalog",
            label: "Tests",
            icon: ClipboardList,
            moduleKey: "system-config",
            href: (role) => systemConfigHref(role, "test-catalog"),
          },
          {
            id: "exam-catalog",
            label: "Exams",
            icon: Award,
            moduleKey: "system-config",
            href: (role) => systemConfigHref(role, "exam-catalog"),
          },
        ],
      },
      {
        id: "rooms",
        label: "Rooms",
        icon: DoorOpen,
        moduleKey: "system-config",
        href: (role) => systemConfigHref(role, "rooms"),
      },
      {
        id: "periods",
        label: "Academy Time Configuration",
        icon: Clock,
        moduleKey: "system-config",
        href: (role) => systemConfigHref(role, "periods"),
      },
      {
        id: "timetable-sections",
        label: "Timetable Sections",
        icon: Layers,
        moduleKey: "system-config",
        href: (role) => systemConfigHref(role, "sections"),
      },
      {
        id: "timetable-rules",
        label: "Timetable Rules",
        icon: SlidersHorizontal,
        moduleKey: "system-config",
        href: (role) => systemConfigHref(role, "timetable-rules"),
      },
      {
        id: "timetable-builder",
        label: "Timetable Builder",
        icon: LayoutGrid,
        moduleKey: "timetable",
        requireManage: true,
        href: (role) => timetableHref(role, "builder"),
      },
      {
        id: "timetable-board",
        label: "Class Board",
        icon: Table2,
        moduleKey: "timetable",
        href: (role) => timetableHref(role, "board"),
        isActive: (pathname, role) => pathname.startsWith(`${p(role)}/timetable/board`),
      },
    ],
  },
  {
    id: "student-management",
    label: "Student Management",
    icon: UserPlus,
    collapsible: true,
    items: [
      {
        id: "register-student",
        label: "Register Student",
        icon: UserPlus,
        moduleKey: "student-management",
        href: (role) => studentManagementHref(role, "registration"),
        isActive: (pathname, role) =>
          pathname.startsWith(`${p(role)}/student-management/registration`),
      },
      {
        id: "students",
        label: "Students",
        icon: GraduationCap,
        moduleKey: "students",
        href: (role) => moduleHref(role, "students"),
      },
      {
        id: "student-attendance",
        label: "Student Attendance",
        icon: ClipboardList,
        moduleKey: "attendance",
        href: (role) => moduleHref(role, "attendance"),
        isActive: (pathname, role) => {
          const base = moduleHref(role, "attendance");
          return pathname === base || pathname.startsWith(`${base}/`);
        },
      },
      {
        id: "ai-attendance",
        label: "AI Attendance",
        icon: ScanFace,
        moduleKey: "ai-attendance",
        href: (role) => moduleHref(role, "ai-attendance"),
      },
      {
        id: "student-timetable",
        label: "Student Timetable",
        icon: CalendarDays,
        moduleKey: "timetable",
        href: (role) => timetableHref(role, "view"),
      },
    ],
  },
  {
    id: "teacher-management",
    label: "Teacher Management",
    icon: UserCog,
    collapsible: true,
    items: [
      {
        id: "teachers",
        label: "Teachers",
        icon: UserCircle,
        moduleKey: "system-config",
        href: (role) => systemConfigHref(role, "teachers"),
        isActive: (pathname, role) =>
          pathname.startsWith(`${p(role)}/system-config/teachers`),
      },
      {
        id: "subject-teachers",
        label: "Subject Teachers",
        icon: Link2,
        moduleKey: "system-config",
        href: (role) => systemConfigHref(role, "subject-teachers"),
        isActive: (pathname, role) =>
          pathname.startsWith(`${p(role)}/system-config/subject-teachers`),
      },
      {
        id: "staff-attendance",
        label: "Teacher Attendance",
        icon: Clock,
        moduleKey: "staff-attendance",
        href: (role) => moduleHref(role, "staff-attendance"),
        isActive: (pathname, role) => {
          const base = moduleHref(role, "staff-attendance");
          return (
            pathname === base ||
            pathname.startsWith(`${base}/`) ||
            pathname.includes("/staff-attendance") ||
            pathname.includes("/teacher-attendance")
          );
        },
      },
    ],
  },
  // Teaching group is for the teacher portal only (see TEACHER_SIDEBAR_NAV).
  {
    id: "examinations",
    label: "Examination",
    icon: Award,
    collapsible: true,
    items: [
      {
        id: "class-tests",
        label: "Test Scheduling",
        icon: ClipboardList,
        moduleKey: "exams",
        href: (role) => testExamsHref(role, "enter-tests"),
        isActive: (pathname, role) =>
          pathname.startsWith(`${p(role)}/exams/enter-tests`),
      },
      {
        id: "term-results",
        label: "Exams",
        icon: Award,
        moduleKey: "exams",
        href: (role) => testExamsHref(role, "term-exams"),
      },
      {
        id: "date-sheet",
        label: "Date sheet",
        icon: CalendarDays,
        moduleKey: "exams",
        href: (role) => testExamsHref(role, "date-sheet"),
      },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    icon: Wallet,
    collapsible: true,
    items: [
      {
        id: "finance-dashboard",
        label: "Finance Dashboard",
        icon: LayoutDashboard,
        moduleKey: "finance-dashboard",
        href: (role) => moduleHref(role, "finance-dashboard"),
      },
      {
        id: "fee-structure",
        label: "Fee Structure",
        icon: Wallet,
        moduleKey: "student-management",
        href: (role) => studentManagementHref(role, "fees-structure"),
      },
      {
        id: "fee-management",
        label: "Fee Management",
        icon: DollarSign,
        moduleKey: "fees",
        href: (role) => moduleHref(role, "fees"),
      },
      {
        id: "staff-salary",
        label: "Staff Salary",
        icon: DollarSign,
        moduleKey: "salary",
        href: (role) => moduleHref(role, "salary"),
      },
      {
        id: "academy-expenses",
        label: "Academy Expenses",
        icon: Receipt,
        moduleKey: "expenses",
        href: (role) => moduleHref(role, "expenses"),
      },
    ],
  },
  {
    id: "communication",
    label: "Communication",
    icon: MessageSquare,
    collapsible: true,
    items: [
      {
        id: "chat",
        label: "Chat",
        icon: MessageSquare,
        moduleKey: "chat",
        href: (role) => moduleHref(role, "chat"),
      },
      {
        id: "announcements",
        label: "Announcements",
        icon: Bell,
        moduleKey: "announcements",
        href: (role) => moduleHref(role, "announcements"),
      },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    icon: BarChart3,
    collapsible: true,
    items: [
      {
        id: "reports",
        label: "Reports",
        icon: BarChart3,
        moduleKey: "reports",
        href: (role) => moduleHref(role, "reports"),
      },
      {
        id: "datasheets",
        label: "Datasheets",
        icon: FileText,
        moduleKey: "datasheets",
        href: (role) => moduleHref(role, "datasheets"),
      },
    ],
  },
  {
    id: "administration",
    label: "Administration",
    icon: Users,
    collapsible: true,
    items: [
      {
        id: "users",
        label: "Users",
        icon: Users,
        moduleKey: "users",
        href: (role) => moduleHref(role, "users"),
      },
      {
        id: "staff",
        label: "Staff",
        icon: UserCog,
        moduleKey: "staff-management",
        href: (role) => moduleHref(role, "staff-management"),
      },
      {
        id: "permissions",
        label: "Permissions",
        icon: KeyRound,
        moduleKey: "permissions",
        href: (role) => moduleHref(role, "permissions"),
      },
    ],
  },
];

/** Teacher portal sidebar — only modules from the Teacher RBAC defaults (+ admin overrides). */
export const TEACHER_SIDEBAR_NAV: SidebarNavGroup[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    collapsible: false,
    items: [
      {
        id: "dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        moduleKey: "dashboard",
        href: (role) => moduleHref(role, "dashboard"),
        isActive: (pathname, role) => pathname === `/panel/${role}`,
      },
    ],
  },
  {
    id: "teaching",
    label: "Teaching",
    icon: BookOpen,
    collapsible: true,
    items: [
      {
        id: "my-students",
        label: "My Students",
        icon: GraduationCap,
        moduleKey: "students",
        href: (role) => moduleHref(role, "students"),
      },
      {
        id: "my-classes",
        label: "My Classes",
        icon: School,
        moduleKey: "my-classes",
        href: (role) => moduleHref(role, "my-classes"),
      },
      {
        id: "my-subjects",
        label: "My Subjects",
        icon: BookOpen,
        moduleKey: "my-subjects",
        href: (role) => moduleHref(role, "my-subjects"),
      },
      {
        id: "timetable-mine",
        label: "Timetable",
        icon: Calendar,
        moduleKey: "timetable",
        href: (role) => timetableHref(role, "mine"),
      },
      {
        id: "class-view",
        label: "Section Dashboard",
        icon: CalendarDays,
        moduleKey: "timetable",
        href: (role) => timetableHref(role, "view"),
      },
      // Coming-soon placeholders — hidden from teacher sidebar for now
      // {
      //   id: "homework",
      //   label: "Homework / Assignments",
      //   icon: BookOpen,
      //   moduleKey: "homework",
      //   href: (role) => moduleHref(role, "homework"),
      // },
      // {
      //   id: "study-materials",
      //   label: "Study Materials",
      //   icon: BookOpen,
      //   moduleKey: "study-materials",
      //   href: (role) => moduleHref(role, "study-materials"),
      // },
      // {
      //   id: "lesson-plans",
      //   label: "Lesson Plans",
      //   icon: BookOpen,
      //   moduleKey: "lesson-plans",
      //   href: (role) => moduleHref(role, "lesson-plans"),
      // },
      {
        id: "exams",
        label: "Examination",
        icon: Award,
        moduleKey: "exams",
        href: (role) => testExamsHref(role),
      },
      // {
      //   id: "student-progress",
      //   label: "Student Progress",
      //   icon: BarChart3,
      //   moduleKey: "student-progress",
      //   href: (role) => moduleHref(role, "student-progress"),
      // },
      {
        id: "attendance",
        label: "Student Attendance",
        icon: ClipboardList,
        moduleKey: "attendance",
        href: (role) => moduleHref(role, "attendance"),
      },
    ],
  },
  {
    id: "communication",
    label: "Communication",
    icon: MessageSquare,
    collapsible: true,
    items: [
      {
        id: "chat",
        label: "Messages",
        icon: MessageSquare,
        moduleKey: "chat",
        href: (role) => moduleHref(role, "chat"),
      },
      {
        id: "announcements",
        label: "Class Announcements",
        icon: Bell,
        moduleKey: "announcements",
        href: (role) => moduleHref(role, "announcements"),
      },
      // Coming-soon placeholders — hidden from teacher sidebar for now
      // {
      //   id: "behaviour",
      //   label: "Behaviour / Discipline",
      //   icon: ClipboardList,
      //   moduleKey: "behaviour",
      //   href: (role) => moduleHref(role, "behaviour"),
      // },
      // {
      //   id: "parent-meetings",
      //   label: "Parent Meetings",
      //   icon: Users,
      //   moduleKey: "parent-meetings",
      //   href: (role) => moduleHref(role, "parent-meetings"),
      // },
    ],
  },
  // Coming-soon placeholders — Resources group hidden until modules are built
  // {
  //   id: "resources",
  //   label: "Resources",
  //   icon: Calendar,
  //   collapsible: true,
  //   items: [
  //     {
  //       id: "online-classes",
  //       label: "Online Classes",
  //       icon: LayoutGrid,
  //       moduleKey: "online-classes",
  //       href: (role) => moduleHref(role, "online-classes"),
  //     },
  //     {
  //       id: "library",
  //       label: "Library",
  //       icon: BookOpen,
  //       moduleKey: "library",
  //       href: (role) => moduleHref(role, "library"),
  //     },
  //     {
  //       id: "school-calendar",
  //       label: "School Calendar",
  //       icon: CalendarDays,
  //       moduleKey: "school-calendar",
  //       href: (role) => moduleHref(role, "school-calendar"),
  //     },
  //     {
  //       id: "notifications",
  //       label: "Notifications",
  //       icon: Bell,
  //       moduleKey: "notifications",
  //       href: (role) => moduleHref(role, "notifications"),
  //     },
  //   ],
  // },
  {
    id: "account-tools",
    label: "My Account",
    icon: UserCircle,
    collapsible: true,
    items: [
      {
        id: "profile",
        label: "My Profile",
        icon: UserCircle,
        moduleKey: "settings",
        href: (role) => moduleHref(role, "settings"),
      },
      {
        id: "leave",
        label: "Leave Management",
        icon: Calendar,
        moduleKey: "leave",
        href: (role) => moduleHref(role, "leave"),
      },
      {
        id: "staff-attendance",
        label: "My Attendance",
        icon: Clock,
        moduleKey: "staff-attendance",
        href: (role) => moduleHref(role, "staff-attendance"),
        isActive: (pathname, role) => {
          const base = moduleHref(role, "staff-attendance");
          return (
            pathname === base ||
            pathname.startsWith(`${base}/`) ||
            pathname.includes("/staff-attendance")
          );
        },
      },
    ],
  },
];

/** Parent portal sidebar — children, schedule, attendance, and messaging only. */
export const PARENT_SIDEBAR_NAV: SidebarNavGroup[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    collapsible: false,
    items: [
      {
        id: "dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        moduleKey: "dashboard",
        href: (role) => moduleHref(role, "dashboard"),
        isActive: (pathname, role) => pathname === p(role),
      },
    ],
  },
  {
    id: "my-children",
    label: "My Children",
    icon: GraduationCap,
    collapsible: true,
    items: [
      {
        id: "students",
        label: "My Children",
        icon: GraduationCap,
        moduleKey: "students",
        href: (role) => moduleHref(role, "students"),
      },
      {
        id: "student-attendance",
        label: "Attendance",
        icon: ClipboardList,
        moduleKey: "attendance",
        href: (role) => moduleHref(role, "attendance"),
      },
      {
        id: "student-timetable",
        label: "Timetable",
        icon: CalendarDays,
        moduleKey: "timetable",
        href: (role) => timetableHref(role, "view"),
      },
    ],
  },
  {
    id: "communication",
    label: "Communication",
    icon: MessageSquare,
    collapsible: true,
    items: [
      {
        id: "chat",
        label: "Chat",
        icon: MessageSquare,
        moduleKey: "chat",
        href: (role) => moduleHref(role, "chat"),
      },
      {
        id: "announcements",
        label: "Announcements",
        icon: Bell,
        moduleKey: "announcements",
        href: (role) => moduleHref(role, "announcements"),
      },
      {
        id: "notifications",
        label: "Notifications",
        icon: Bell,
        moduleKey: "notifications",
        href: (role) => moduleHref(role, "notifications"),
      },
    ],
  },
  {
    id: "resources",
    label: "School",
    icon: Calendar,
    collapsible: true,
    items: [
      {
        id: "school-calendar",
        label: "School Calendar",
        icon: CalendarDays,
        moduleKey: "school-calendar",
        href: (role) => moduleHref(role, "school-calendar"),
      },
    ],
  },
];

/** Accountant portal sidebar — finance-focused modules from accountant RBAC defaults. */
export const ACCOUNTANT_SIDEBAR_NAV: SidebarNavGroup[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    collapsible: false,
    items: [
      {
        id: "dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        moduleKey: "dashboard",
        href: (role) => moduleHref(role, "dashboard"),
        isActive: (pathname, role) => pathname === `/panel/${role}`,
      },
    ],
  },
  {
    id: "students",
    label: "Students",
    icon: GraduationCap,
    collapsible: true,
    items: [
      {
        id: "register-student",
        label: "Register Student",
        icon: UserPlus,
        moduleKey: "student-management",
        href: (role) => studentManagementHref(role, "registration"),
        isActive: (pathname, role) =>
          pathname.startsWith(`${p(role)}/student-management/registration`),
      },
      {
        id: "students",
        label: "Students",
        icon: GraduationCap,
        moduleKey: "students",
        href: (role) => moduleHref(role, "students"),
      },
      {
        id: "student-attendance",
        label: "Student Attendance",
        icon: ClipboardList,
        moduleKey: "attendance",
        href: (role) => moduleHref(role, "attendance"),
      },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    icon: Wallet,
    collapsible: true,
    items: [
      {
        id: "finance-dashboard",
        label: "Finance Dashboard",
        icon: LayoutDashboard,
        moduleKey: "finance-dashboard",
        href: (role) => moduleHref(role, "finance-dashboard"),
      },
      {
        id: "fee-structure",
        label: "Fee Structure",
        icon: Wallet,
        moduleKey: "student-management",
        href: (role) => studentManagementHref(role, "fees-structure"),
      },
      {
        id: "fee-management",
        label: "Fee Management",
        icon: DollarSign,
        moduleKey: "fees",
        href: (role) => moduleHref(role, "fees"),
      },
      {
        id: "staff-salary",
        label: "Staff Salary",
        icon: DollarSign,
        moduleKey: "salary",
        href: (role) => moduleHref(role, "salary"),
      },
      {
        id: "academy-expenses",
        label: "Academy Expenses",
        icon: Receipt,
        moduleKey: "expenses",
        href: (role) => moduleHref(role, "expenses"),
      },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    icon: BarChart3,
    collapsible: true,
    items: [
      {
        id: "reports",
        label: "Reports",
        icon: BarChart3,
        moduleKey: "reports",
        href: (role) => moduleHref(role, "reports"),
      },
      {
        id: "datasheets",
        label: "Datasheets",
        icon: FileText,
        moduleKey: "datasheets",
        href: (role) => moduleHref(role, "datasheets"),
      },
    ],
  },
  {
    id: "communication",
    label: "Communication",
    icon: MessageSquare,
    collapsible: true,
    items: [
      {
        id: "chat",
        label: "Chat",
        icon: MessageSquare,
        moduleKey: "chat",
        href: (role) => moduleHref(role, "chat"),
      },
    ],
  },
  {
    id: "resources",
    label: "Resources",
    icon: Calendar,
    collapsible: true,
    items: [
      {
        id: "school-calendar",
        label: "School Calendar",
        icon: CalendarDays,
        moduleKey: "school-calendar",
        href: (role) => moduleHref(role, "school-calendar"),
      },
      {
        id: "notifications",
        label: "Notifications",
        icon: Bell,
        moduleKey: "notifications",
        href: (role) => moduleHref(role, "notifications"),
      },
    ],
  },
  {
    id: "account-tools",
    label: "My Account",
    icon: UserCircle,
    collapsible: true,
    items: [
      {
        id: "profile",
        label: "My Profile",
        icon: UserCircle,
        moduleKey: "settings",
        href: (role) => moduleHref(role, "settings"),
      },
      {
        id: "leave",
        label: "Leave Management",
        icon: Calendar,
        moduleKey: "leave",
        href: (role) => moduleHref(role, "leave"),
      },
      {
        id: "staff-attendance",
        label: "My Attendance",
        icon: Clock,
        moduleKey: "staff-attendance",
        href: (role) => moduleHref(role, "staff-attendance"),
        isActive: (pathname, role) => {
          const base = moduleHref(role, "staff-attendance");
          return (
            pathname === base ||
            pathname.startsWith(`${base}/`) ||
            pathname.includes("/staff-attendance")
          );
        },
      },
    ],
  },
];

export function sidebarNavForRole(role: Role): SidebarNavGroup[] {
  if (role === "teacher") return TEACHER_SIDEBAR_NAV;
  if (role === "accountant") return ACCOUNTANT_SIDEBAR_NAV;
  if (role === "parent") return PARENT_SIDEBAR_NAV;
  return SIDEBAR_NAV;
}

export function navItemIsActive(item: SidebarNavItem, pathname: string, role: Role): boolean {
  if (item.isActive) return item.isActive(pathname, role);
  const href = item.href(role);
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function groupIsOpen(group: SidebarNavGroup, pathname: string, role: Role): boolean {
  return group.items.some((item) => navItemIsActive(item, pathname, role));
}

/** Primary destinations for the mobile bottom tab bar (order matters).
 * Admin uses sidebar *group* ids (main menu). Other roles use item ids. */
export const MOBILE_PRIMARY_NAV_IDS: Record<Role, string[]> = {
  admin: [
    "dashboard",
    "academic-setup",
    "student-management",
    "teacher-management",
    "finance",
    "administration",
  ],
  accountant: ["dashboard", "students", "fee-management", "academy-expenses", "chat"],
  teacher: ["dashboard", "my-classes", "attendance", "chat", "exams"],
  parent: ["dashboard", "students", "student-attendance", "chat", "announcements"],
  student: ["dashboard", "student-timetable", "exams", "chat", "announcements"],
};

/** Admin mobile main-menu group ids (must match SIDEBAR_NAV groups). */
export const ADMIN_MOBILE_GROUP_IDS = [
  "dashboard",
  "academic-setup",
  "student-management",
  "teacher-management",
  "finance",
  "administration",
] as const;

/** Flatten sidebar items in nav order for lookup by id. */
export function flattenSidebarNav(role: Role): SidebarNavItem[] {
  const seen = new Set<string>();
  const out: SidebarNavItem[] = [];
  for (const group of sidebarNavForRole(role)) {
    for (const item of group.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}
