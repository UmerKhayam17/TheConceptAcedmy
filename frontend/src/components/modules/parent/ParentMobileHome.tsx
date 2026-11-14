import { useEffect, useState, type CSSProperties } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  BarChart3,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Check,
  ChevronRight,
  FileText,
  GraduationCap,
  Home,
  Megaphone,
  Menu,
  Receipt,
  UserRound,
} from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { moduleHref } from "@/lib/panelMenus";
import { timetableHref } from "@/lib/timetableMenus";
import { testExamsHref } from "@/lib/testExamsMenus";
import { resolveUploadUrl, type AcademyStudent, type AcademyStudentRecord } from "@/lib/studentManagementApi";
import { classLabel } from "@/components/modules/student-management/studentDisplayUtils";
import ParentMobileFees from "@/components/modules/parent/ParentMobileFees";
import ParentMobileCalendar from "@/components/modules/parent/ParentMobileCalendar";
import { cn } from "@/lib/utils";

const ROLE = "parent" as const;

const SLIDES = [
  {
    label: "Encouragement",
    title: (
      <>
        Encourage More.
        <br />
        Compare Less.
      </>
    ),
    body: "Every child grows at their own pace.",
  },
  {
    label: "Daily Reminder",
    title: (
      <>
        Small Steps.
        <br />
        Big Progress.
      </>
    ),
    body: "Consistency turns effort into achievement.",
  },
  {
    label: "Parent Support",
    title: (
      <>
        Listen More.
        <br />
        Inspire Always.
      </>
    ),
    body: "Your support builds lifelong confidence.",
  },
];

const TILES: {
  label: string;
  view?: string;
  to?: string;
  Icon: LucideIcon;
  color: string;
  ink: string;
}[] = [
  {
    label: "Academics",
    view: "academics",
    Icon: GraduationCap,
    color: "#c9f2d5",
    ink: "#005a4e",
  },
  {
    label: "Attendance",
    to: moduleHref(ROLE, "attendance"),
    Icon: CalendarDays,
    color: "#ffe1a3",
    ink: "#eb5300",
  },
  {
    label: "Notice Board",
    to: moduleHref(ROLE, "announcements"),
    Icon: Megaphone,
    color: "#f8c8d6",
    ink: "#d9165b",
  },
  {
    label: "Date Sheet",
    to: testExamsHref(ROLE, "date-sheet"),
    Icon: FileText,
    color: "#c7e1f7",
    ink: "#125bc7",
  },
  {
    label: "Results",
    to: testExamsHref(ROLE, "report-card"),
    Icon: BarChart3,
    color: "#d6f0bb",
    ink: "#087645",
  },
  {
    label: "Timetable",
    to: timetableHref(ROLE, "view"),
    Icon: CalendarClock,
    color: "#e9c1f4",
    ink: "#5b20c5",
  },
];

const ROWS: {
  label: string;
  hint: string;
  view: string;
  Icon: LucideIcon;
  wrap: string;
  icon: string;
}[] = [
  {
    label: "Fee",
    hint: "Invoices, dues & payment history",
    view: "fees",
    Icon: Receipt,
    wrap: "bg-[#BBF7D0]",
    icon: "text-[#16A34A]",
  },
  {
    label: "Academic Calendar",
    hint: "Holidays, events & important dates",
    view: "calendar",
    Icon: CalendarRange,
    wrap: "bg-[#FEF3C7]",
    icon: "text-[#B45309]",
  },
];

function getGreeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Karachi",
      hour: "numeric",
      hourCycle: "h23",
    }).format(new Date()),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function todayLabel() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    weekday: "short",
    day: "2-digit",
    month: "short",
  })
    .format(new Date())
    .replace(",", "");
}

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
      : "Class";
  const rawSection = refName(student.sectionId, "sectionName");
  if (!rawSection) return className;
  const section = /^section\b/i.test(rawSection) ? rawSection : `Section ${rawSection}`;
  return `${className} · ${section}`;
}

function MegaphoneArt() {
  return (
    <svg className="absolute left-1/2 top-1/2 h-auto w-[151px] max-w-none -translate-x-1/2 -translate-y-[48%] -rotate-[3deg]" viewBox="0 0 180 160" aria-hidden>
      <defs>
        <linearGradient id="paHorn" x1="45" y1="42" x2="142" y2="110">
          <stop stopColor="#65bfff" />
          <stop offset=".52" stopColor="#1470e8" />
          <stop offset="1" stopColor="#07379d" />
        </linearGradient>
        <linearGradient id="paRim" x1="118" y1="37" x2="155" y2="105">
          <stop stopColor="#ffed63" />
          <stop offset=".55" stopColor="#ffbe05" />
          <stop offset="1" stopColor="#e48b00" />
        </linearGradient>
        <filter id="paShadow" x="-30%" y="-30%" width="170%" height="190%">
          <feDropShadow dx="0" dy="7" stdDeviation="5" floodColor="#123f82" floodOpacity=".28" />
        </filter>
      </defs>
      <g fill="none" stroke="#ffb900" strokeLinecap="round" strokeWidth="7">
        <path d="m126 28 9-16" />
        <path d="m141 39 18-8" />
        <path d="m145 55 20 1" />
      </g>
      <g filter="url(#paShadow)">
        <path d="m52 91 25-5 18 50c1 4-1 7-5 8l-10 2c-4 1-7-1-7-5L63 99 52 91Z" fill="#0753c4" />
        <path d="M41 67c-8 5-10 16-5 24 5 9 16 12 24 6l14-8-18-31-15 9Z" fill="#1787f2" />
        <path
          d="M54 56 124 32l25 45-59 45c-5 4-12 2-15-3L48 70c-3-5 0-12 6-14Z"
          fill="url(#paHorn)"
        />
        <path d="M55 57c14 8 25 27 27 43" fill="none" stroke="#9bd7ff" strokeWidth="4" />
        <ellipse cx="136" cy="54" rx="20" ry="34" transform="rotate(-29 136 54)" fill="url(#paRim)" />
        <ellipse cx="136" cy="54" rx="14" ry="27" transform="rotate(-29 136 54)" fill="#e8efff" />
        <ellipse cx="137" cy="54" rx="6" ry="12" transform="rotate(-29 137 54)" fill="#3666c8" />
      </g>
      <path d="M34 133c-10-1-17-8-18-18 11 0 18 6 18 18Z" fill="#31ad52" />
      <path d="M99 143c3-13 11-20 24-20-1 13-9 20-24 20Z" fill="#3ab44e" />
      <path d="M99 143c8-4 14-9 19-16" fill="none" stroke="#1c8737" strokeWidth="2" />
    </svg>
  );
}

function PromoCarousel() {
  const [slide, setSlide] = useState(0);
  const current = SLIDES[slide];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSlide((prev) => (prev + 1) % SLIDES.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="relative z-[5] -mt-[32px] px-3.5" aria-label="Parent tips carousel">
      <article className="relative grid h-[153px] grid-cols-[34%_66%] items-center overflow-hidden rounded-[29px] border border-[#ffd85a] bg-[radial-gradient(circle_at_1%_95%,#ffd74666,transparent_35%),linear-gradient(115deg,#fffef7,#fff9df_70%,#fff0a4)] shadow-[0_13px_25px_#1a437a38]">
        <div className="pointer-events-none absolute -left-[65px] -top-[63px] h-[155px] w-[155px] rounded-full border-[16px] border-[#ffcf303f]" />
        <div className="pointer-events-none absolute -bottom-[31px] -right-[28px] h-[100px] w-[100px] rounded-full border-[12px] border-[#ffc9185e]" />
        <div className="relative z-[1] h-full">
          <MegaphoneArt />
        </div>
        <div className="relative z-[2] min-w-0 py-3 pl-0 pr-3">
          <p className="mb-1 flex items-center gap-1.5 whitespace-nowrap text-[10px] font-extrabold uppercase tracking-[0.05em] text-[#c77700]">
            <span className="h-px w-5 bg-[#d18a00]" />
            {current.label}
            <span className="h-px min-w-[13px] flex-1 bg-[#d18a00]" />
          </p>
          <h2 className="m-0 text-[clamp(18px,5.8vw,25px)] font-extrabold leading-[1.1] tracking-[-0.045em] text-[#09245c]">
            {current.title}
          </h2>
          <span className="mt-2 block text-[clamp(9px,3.05vw,12px)] font-semibold leading-tight text-[#14213e]">
            {current.body}
          </span>
        </div>
      </article>
      <div className="mt-3 mb-2 flex justify-center gap-1.5" role="tablist" aria-label="Choose encouragement slide">
        {SLIDES.map((item, index) => (
          <button
            key={item.label}
            type="button"
            role="tab"
            aria-label={`Show slide ${index + 1}`}
            aria-current={slide === index}
            onClick={() => setSlide(index)}
            className={cn(
              "h-1.5 rounded-full border-0 p-0 transition-all",
              slide === index ? "w-[18px] bg-[#0967d6]" : "w-1.5 bg-[#bdc9db]",
            )}
          />
        ))}
      </div>
    </section>
  );
}

function EmptyNote({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-[#d7e6f5] bg-white/90 px-4 py-10 text-center shadow-sm">
      <p className="font-extrabold text-[#08215a]">{title}</p>
      <p className="mt-1 text-sm font-medium text-[#64748B]">{body}</p>
    </div>
  );
}

export default function ParentMobileHome({
  parentName,
  students,
  studentsLoading,
  selectedId,
  onSelect,
  record,
  recordLoading,
}: {
  parentName: string;
  students: AcademyStudent[];
  studentsLoading: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  record?: AcademyStudentRecord;
  recordLoading: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const { setOpenMobile } = useSidebar();
  const [greeting, setGreeting] = useState(getGreeting);
  const rawView = params.get("view");
  const view = rawView === "fees" || rawView === "calendar" ? rawView : "";
  const student = record?.student || students.find((s) => s._id === selectedId);
  const displayName = student?.studentName || parentName || "Parent";

  useEffect(() => {
    const timer = window.setInterval(() => setGreeting(getGreeting()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const openView = (id: string) => {
    const next = new URLSearchParams(params);
    next.set("view", id);
    setParams(next);
  };
  const closeView = () => {
    const next = new URLSearchParams(params);
    next.delete("view");
    setParams(next, { replace: true });
  };

  const cycleChild = () => {
    if (students.length < 2) return;
    const index = students.findIndex((s) => s._id === selectedId);
    const next = students[(index + 1) % students.length];
    if (next) onSelect(next._id);
  };

  if (view === "fees") {
    return (
      <ParentMobileFees
        onBack={closeView}
        student={student}
        record={record}
        loading={studentsLoading || recordLoading}
      />
    );
  }

  if (view === "calendar") {
    return (
      <ParentMobileCalendar
        onBack={closeView}
        student={student}
        loading={studentsLoading || recordLoading}
      />
    );
  }

  return (
    <div className="min-h-full overflow-x-hidden bg-[linear-gradient(180deg,#e7f4ff_0%,#f7fbff_78%)] pb-6 text-[#081c4d]">
      <header className="relative h-[320px] overflow-hidden bg-[radial-gradient(circle_at_70%_24%,#1674ee80,transparent_34%),linear-gradient(135deg,#071958,#0739ac_62%,#0873ed)] px-[19px] pt-[calc(var(--safe-top)+0.35rem)] text-white">
        <div className="pointer-events-none absolute -left-[34px] -top-[70px] h-[124px] w-[252px] -rotate-[10deg] rounded-[0_0_80%_45%] bg-[linear-gradient(145deg,#2995ff99,#086ce300)]" />
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 430 260"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path
            d="M-8 207c104 5 186 17 277-22 70-30 107-82 172-107v182H-8v-53Z"
            fill="#062d91"
            fillOpacity=".72"
          />
          <path d="M-8 256c103-25 188-8 277-50 68-32 107-88 172-110v164H-8v-4Z" fill="#ffb900" />
          <path d="M-8 260c105-20 192-8 278-42 75-30 105-78 171-102v144H-8Z" fill="#ffd52a" />
          <path d="M-8 260c111-12 198-5 280-32 70-23 105-71 169-91v123H-8Z" fill="#f8fcff" />
          <path d="M204 260c69-6 111-20 149-46 32-22 55-31 88-39v85H204Z" fill="#dbeeff" />
        </svg>
        <div
          className="pointer-events-none absolute right-[91px] top-[15px] h-[59px] w-[60px] opacity-[0.56]"
          style={{
            backgroundImage: "radial-gradient(circle,#48b9ff 2.2px,transparent 2.8px)",
            backgroundSize: "14px 14px",
          }}
        />

        <nav className="relative z-[3] flex items-start justify-between" aria-label="Dashboard actions">
          <button
            type="button"
            onClick={() => setOpenMobile(true)}
            aria-label="Open account menu"
            className="grid h-12 w-12 place-items-center rounded-[15px] border-0 bg-[linear-gradient(145deg,#4aa4ff,#1262d8_65%,#0751c5)] text-white shadow-[inset_0_1px_3px_#ffffff70,0_7px_14px_#001d6b45]"
          >
            <Menu className="h-[22px] w-[22px]" strokeWidth={2.1} />
          </button>
          <button
            type="button"
            onClick={cycleChild}
            aria-label={students.length > 1 ? "Switch child" : "One child linked"}
            className="grid h-12 w-12 place-items-center rounded-full border-2 border-white bg-[linear-gradient(145deg,#b439ef,#5e17d3_58%,#30129c)] text-white shadow-[inset_0_1px_3px_#ffffff80,0_7px_16px_#11115b4f]"
          >
            {students.length > 1 ? (
              <ArrowLeftRight className="h-5 w-5" strokeWidth={2.1} />
            ) : (
              <GraduationCap className="h-6 w-6" strokeWidth={1.6} />
            )}
          </button>
        </nav>

        <div className="relative z-[2] mt-3.5">
          <p className="m-0 text-[13px] font-extrabold uppercase tracking-[0.105em]">{greeting}</p>
          <h1
            className="mt-0.5 max-w-full break-words text-[clamp(29px,8.6vw,38px)] font-extrabold uppercase leading-[1.03] tracking-[-0.045em]"
            style={{ textShadow: "0 3px 9px #001a6940" }}
          >
            {displayName}
          </h1>
          <p className="mt-1.5 flex items-center gap-2 text-[16px] font-bold">
            <Home className="h-[17px] w-[17px]" strokeWidth={1.7} />
            The Concept Academy
          </p>
          <div className="mt-2.5 flex gap-2.5">
            <span className="inline-flex min-h-[29px] items-center rounded-full bg-white px-3.5 py-1 text-[12px] font-extrabold text-[#1154b7] shadow-[0_4px_9px_#041e7040]">
              Parent
            </span>
            <span className="inline-flex min-h-[29px] items-center rounded-full border border-white/10 bg-[#4e90e5a8] px-3.5 py-1 text-[12px] font-extrabold text-white">
              {todayLabel()}
            </span>
          </div>
        </div>
      </header>

      <PromoCarousel />

      <section className="px-4 pb-2">
        <h2 className="mb-2 mt-1 flex items-center gap-1.5 text-[15px] font-extrabold uppercase tracking-[0.03em] text-[#0c60bd]">
          <span className="h-0.5 w-[18px] rounded bg-[#0c60bd]" />
          Student
        </h2>

        {studentsLoading || (selectedId && recordLoading && !student) ? (
          <div className="h-20 animate-pulse rounded-[24px] bg-white/80" />
        ) : students.length === 0 ? (
          <EmptyNote
            title="No children linked yet"
            body={`Ask the school office to link a student to ${parentName}.`}
          />
        ) : (
          <div className="flex gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {students.map((child) => {
              const active = child._id === (student?._id || selectedId);
              const shown = active && record?.student ? record.student : child;
              const childPhoto = shown.photoImage ? resolveUploadUrl(shown.photoImage) : "";
              return (
                <button
                  key={child._id}
                  type="button"
                  onClick={() => onSelect(child._id)}
                  className={cn(
                    "flex h-20 shrink-0 items-center rounded-[24px] border-[1.7px] bg-white/85 px-2.5 py-1.5 text-left shadow-[0_5px_12px_#194a8121]",
                    students.length === 1 ? "w-full" : "w-max max-w-[min(100%,320px)]",
                    active ? "border-[#0963c9]" : "border-[#d5e4f4]",
                  )}
                >
                  <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-[#0b69c9] bg-[#b8d2e9] text-[#0863c5]">
                    {childPhoto ? (
                      <img src={childPhoto} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <UserRound className="h-7 w-7" />
                    )}
                  </span>
                  <span className="ml-2.5 min-w-0 flex-1">
                    <span className="block truncate text-[clamp(17px,5.2vw,22px)] font-extrabold leading-tight text-[#08215a]">
                      {shown.studentName}
                    </span>
                    <span className="mt-1 block truncate text-[clamp(12px,3.8vw,15px)] font-bold text-[#0863c5]">
                      {classSectionLine(shown)}
                    </span>
                  </span>
                  {active ? (
                    <span className="ml-auto grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-[#0870da] text-white">
                      <Check className="h-5 w-5" strokeWidth={3} />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-4 grid grid-cols-3 gap-x-[15px] gap-y-2.5">
          {TILES.map((tile) => {
            const academicsTo =
              tile.label === "Academics" && student
                ? `/panel/parent/students/${student._id}`
                : tile.to;
            const style = { "--tile": tile.color, "--ink": tile.ink } as CSSProperties;
            const inner = (
              <>
                <tile.Icon className="h-11 w-11" style={{ color: tile.ink }} strokeWidth={2.4} />
                <span className="mt-1.5 whitespace-nowrap text-center text-[clamp(11px,3.4vw,15px)] font-extrabold leading-none text-[#091944]">
                  {tile.label}
                </span>
              </>
            );
            const className =
              "flex aspect-[1.08] min-w-0 flex-col items-center justify-center rounded-[23px] border border-[color-mix(in_srgb,var(--tile)_72%,#5380aa)] px-1 py-2 shadow-[inset_0_1px_2px_#fff,0_6px_12px_#163b7028]";
            const bgStyle = {
              ...style,
              background: `linear-gradient(145deg,#ffffff70,${tile.color})`,
            } as CSSProperties;

            if (academicsTo) {
              return (
                <Link key={tile.label} to={academicsTo} className={className} style={bgStyle}>
                  {inner}
                </Link>
              );
            }
            return (
              <button
                key={tile.label}
                type="button"
                onClick={() => openView(tile.view || "")}
                className={className}
                style={bgStyle}
              >
                {inner}
              </button>
            );
          })}
        </div>

        <section className="mt-4 overflow-hidden rounded-[24px] border border-[#d7e6f5] bg-white shadow-[0_8px_20px_#194a8120]">
          {ROWS.map((row, index) => (
            <button
              key={row.label}
              type="button"
              onClick={() => openView(row.view)}
              className={cn(
                "flex w-full items-center gap-3.5 px-4 py-4 text-left active:bg-[#F8FAFC]",
                index > 0 && "border-t border-[#EEF2F6]",
              )}
            >
              <span className={cn("grid h-14 w-14 shrink-0 place-items-center rounded-[16px]", row.wrap)}>
                <row.Icon className={cn("h-7 w-7", row.icon)} strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-extrabold leading-tight text-[#08215a]">{row.label}</span>
                <span className="mt-0.5 block truncate text-[13px] font-medium leading-tight text-[#64748B]">
                  {row.hint}
                </span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-[#94A3B8]" />
            </button>
          ))}
        </section>
      </section>
    </div>
  );
}
