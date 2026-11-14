import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  BarChart3,
  // Brain, // used by the hidden Online Quiz tile
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

const QUOTES = [
  {
    kicker: "Encouragement",
    title: "Encourage More. Compare Less.",
    body: "Every child grows at their own pace.",
  },
  {
    kicker: "Growth",
    title: "Small Steps. Big Change.",
    body: "Daily effort matters more than a perfect score.",
  },
  {
    kicker: "Care",
    title: "Be Present. Be Proud.",
    body: "Your attention is the best support they can get.",
  },
];

type Tone = {
  wrap: string;
  icon: string;
};

type TileTone = {
  card: string;
  icon: string;
  label: string;
};

const TILES: {
  label: string;
  view?: string;
  to?: string;
  Icon: LucideIcon;
  tone: TileTone;
}[] = [
  // Hidden for now: there is no real online quiz yet (it opened the desktop Class Tests page).
  // {
  //   label: "Online Quiz",
  //   to: testExamsHref(ROLE, "enter-tests"),
  //   Icon: Brain,
  //   tone: {
  //     card: "border-[#C4B5FD] bg-gradient-to-b from-[#EDE9FE] to-[#DDD6FE] shadow-[0_10px_22px_rgba(109,40,217,0.18)]",
  //     icon: "text-[#5B21B6]",
  //     label: "text-[#1E1B4B]",
  //   },
  // },
  {
    label: "Academics",
    view: "academics",
    Icon: GraduationCap,
    tone: {
      card: "border-[#5EEAD4] bg-gradient-to-b from-[#CCFBF1] to-[#99F6E4] shadow-[0_10px_22px_rgba(15,118,110,0.18)]",
      icon: "text-[#0F766E]",
      label: "text-[#134E4A]",
    },
  },
  {
    label: "Attendance",
    to: moduleHref(ROLE, "attendance"),
    Icon: CalendarDays,
    tone: {
      card: "border-[#FDBA74] bg-gradient-to-b from-[#FFEDD5] to-[#FED7AA] shadow-[0_10px_22px_rgba(234,88,12,0.18)]",
      icon: "text-[#C2410C]",
      label: "text-[#7C2D12]",
    },
  },
  {
    label: "Notice Board",
    to: moduleHref(ROLE, "announcements"),
    Icon: Megaphone,
    tone: {
      card: "border-[#F9A8D4] bg-gradient-to-b from-[#FCE7F3] to-[#FBCFE8] shadow-[0_10px_22px_rgba(219,39,119,0.18)]",
      icon: "text-[#BE185D]",
      label: "text-[#831843]",
    },
  },
  {
    label: "Date Sheet",
    to: testExamsHref(ROLE, "date-sheet"),
    Icon: FileText,
    tone: {
      card: "border-[#7DD3FC] bg-gradient-to-b from-[#E0F2FE] to-[#BAE6FD] shadow-[0_10px_22px_rgba(8,145,178,0.18)]",
      icon: "text-[#0369A1]",
      label: "text-[#0C4A6E]",
    },
  },
  {
    label: "Results",
    to: testExamsHref(ROLE, "report-card"),
    Icon: BarChart3,
    tone: {
      card: "border-[#BEF264] bg-gradient-to-b from-[#F7FEE7] to-[#D9F99D] shadow-[0_10px_22px_rgba(101,163,13,0.18)]",
      icon: "text-[#4D7C0F]",
      label: "text-[#365314]",
    },
  },
  {
    label: "Timetable",
    to: timetableHref(ROLE, "view"),
    Icon: CalendarClock,
    tone: {
      card: "border-[#C4B5FD] bg-gradient-to-b from-[#EDE9FE] to-[#DDD6FE] shadow-[0_10px_22px_rgba(109,40,217,0.18)]",
      icon: "text-[#5B21B6]",
      label: "text-[#1E1B4B]",
    },
  },
];

const ROWS: {
  label: string;
  hint: string;
  view?: string;
  to?: string;
  Icon: LucideIcon;
  tone: Tone;
}[] = [
  { label: "Fee", hint: "Invoices, dues & payment history", view: "fees", Icon: Receipt, tone: { wrap: "bg-[#BBF7D0]", icon: "text-[#16A34A]" } },
  // Timetable moved up into the tile grid.
  {
    label: "Academic Calendar",
    hint: "Holidays, events & important dates",
    view: "calendar",
    Icon: CalendarRange,
    tone: { wrap: "bg-[#FDE68A]", icon: "text-[#B45309]" },
  },
];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "GOOD MORNING";
  if (hour < 17) return "GOOD AFTERNOON";
  return "GOOD EVENING";
}

function todayLabel() {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function refName(ref: unknown, key: string) {
  if (!ref || typeof ref !== "object") return "";
  const value = (ref as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function classSectionLine(student: AcademyStudent) {
  const rawClass = classLabel(student.classId);
  const className = rawClass && rawClass !== "—"
    ? (/^class\b/i.test(rawClass) ? rawClass : `Class ${rawClass}`)
    : "Class";
  const rawSection = refName(student.sectionId, "sectionName");
  if (!rawSection) return className;
  const section = /^section\b/i.test(rawSection) ? rawSection : `Section ${rawSection}`;
  return `${className} · ${section}`;
}

function Plants() {
  return (
    <svg viewBox="0 0 120 96" className="h-24 w-28 shrink-0" aria-hidden>
      <ellipse cx="38" cy="78" rx="22" ry="6" fill="#E7C98A" />
      <ellipse cx="82" cy="82" rx="18" ry="5" fill="#E7C98A" />
      <path d="M28 78c0-14 8-22 10-22s10 8 10 22" fill="#F4D7A2" />
      <path d="M74 82c0-12 7-18 8-18s8 6 8 18" fill="#F4D7A2" />
      <path d="M38 56c-10-14-6-28 2-32 2 10 4 18 10 24" fill="#7DBA62" />
      <path d="M40 54c8-16 18-18 22-12-8 4-14 12-14 20" fill="#5FA34A" />
      <path d="M82 64c-8-12-4-24 2-28 2 8 3 14 8 20" fill="#8BC46A" />
      <path d="M84 62c6-12 14-12 16-6-6 2-10 8-10 14" fill="#6AAD52" />
      <circle cx="92" cy="22" r="8" fill="#F2C14E" />
    </svg>
  );
}

function QuoteCard() {
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  return (
    <div>
      <div
        ref={scroller}
        onScroll={() => {
          const el = scroller.current;
          if (!el || el.clientWidth === 0) return;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {QUOTES.map((quote) => (
          <article
            key={quote.title}
            className="min-w-full snap-center rounded-[22px] bg-[#F8E7C4] px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
          >
            <div className="flex items-center gap-2">
              <Plants />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9A7040]">
                  {quote.kicker}
                </p>
                <h2 className="mt-1 text-[1.35rem] font-bold leading-tight text-[#3F2A14]">
                  {quote.title}
                </h2>
                <p className="mt-1 text-xs text-[#8A6844]">{quote.body}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-center gap-1.5">
        {QUOTES.map((quote, i) => (
          <button
            key={quote.title}
            type="button"
            aria-label={`Show quote ${i + 1}`}
            onClick={() => {
              const el = scroller.current;
              if (!el) return;
              el.scrollTo({ left: el.clientWidth * i, behavior: "smooth" });
              setIndex(i);
            }}
            className={cn(
              "h-1.5 rounded-full transition-all",
              i === index ? "w-4 bg-[#13B6C6]" : "w-1.5 bg-[#C5D5DE]",
            )}
          />
        ))}
      </div>
    </div>
  );
}

function EmptyNote({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-10 text-center shadow-sm">
      <p className="font-semibold text-[#10243E]">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{body}</p>
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
  const rawView = params.get("view");
  const view = rawView === "fees" || rawView === "calendar" ? rawView : "";
  const student = record?.student || students.find((s) => s._id === selectedId);
  const displayName = student?.studentName || parentName || "Parent";

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
    <div className="min-h-full bg-[#F4F6F8] pb-8">
      <header className="relative overflow-hidden bg-gradient-to-b from-[#2ED3E0] via-[#18C3D4] to-[#12B3C8] px-4 pb-16 pt-[calc(var(--safe-top)+0.5rem)] text-white">
        <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full border border-white/15" />
        <div className="pointer-events-none absolute right-6 top-16 h-24 w-24 rounded-full border border-white/10" />
        <div className="relative flex items-start justify-between">
          <button
            type="button"
            onClick={() => setOpenMobile(true)}
            aria-label="Open account menu"
            className="grid h-11 w-11 place-items-center rounded-2xl bg-white/20 text-white"
          >
            <Menu className="h-5 w-5" strokeWidth={2.25} />
          </button>
          <button
            type="button"
            onClick={cycleChild}
            aria-label={students.length > 1 ? "Switch child" : "One child linked"}
            className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-[#7DD3FC] to-[#2563EB] text-white shadow-md ring-2 ring-white/70"
          >
            {students.length > 1 ? (
              <ArrowLeftRight className="h-5 w-5" />
            ) : (
              <GraduationCap className="h-6 w-6" />
            )}
          </button>
        </div>
        <p className="relative mt-5 text-[12px] font-bold tracking-[0.22em] text-white/95">
          {greeting()}
        </p>
        <h1 className="relative mt-1.5 truncate text-[2.4rem] font-extrabold leading-none tracking-tight">
          {displayName}
        </h1>
        <p className="relative mt-2.5 flex items-center gap-1.5 text-[17px] font-bold text-white">
          <Home className="h-[18px] w-[18px]" strokeWidth={2.25} />
          The Concept Academy
        </p>
        <div className="relative mt-3 flex items-center gap-2">
          <span className="rounded-full bg-white px-3.5 py-1 text-[13px] font-bold text-[#0F3A4A]">
            Parent
          </span>
          <span className="rounded-full bg-white/20 px-3.5 py-1 text-[13px] font-semibold text-white">
            {todayLabel()}
          </span>
        </div>
      </header>

      <div className="relative z-10 -mt-10 space-y-5 px-4">
        <QuoteCard />

        <section>
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-[#8AA0AE]">
            <span className="h-px w-4 bg-[#B7C9D2]" />
            STUDENT
          </div>
          {studentsLoading || (selectedId && recordLoading && !student) ? (
            <div className="h-[74px] animate-pulse rounded-2xl bg-white/80" />
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
                      "flex shrink-0 items-center gap-3 rounded-2xl border-2 bg-white px-3.5 py-3 text-left shadow-[0_8px_20px_rgba(15,23,42,0.08)]",
                      students.length === 1 ? "w-full" : "w-max max-w-[min(100%,320px)]",
                      active ? "border-[#3EC6D4]" : "border-[#E5EAF0]",
                    )}
                  >
                    <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-[#1EC6D6] text-white">
                      {childPhoto ? (
                        <img src={childPhoto} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <UserRound className="h-6 w-6" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block whitespace-normal break-words text-[18px] font-extrabold leading-snug text-[#102A43]">
                        {shown.studentName}
                      </span>
                      <span className="mt-0.5 block whitespace-normal break-words text-[16px] font-bold leading-snug text-[#0F3A4A]">
                        {classSectionLine(shown)}
                      </span>
                    </span>
                    {active ? (
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#13C4C4] text-white">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="grid grid-cols-3 gap-x-2.5 gap-y-3">
          {TILES.map((tile) => {
            const academicsTo = tile.label === "Academics" && student
              ? `/panel/parent/students/${student._id}`
              : tile.to;
            const inner = (
              <>
                <tile.Icon className={cn("h-8 w-8", tile.tone.icon)} strokeWidth={2.25} />
                <span className={cn("text-center text-[14px] font-extrabold leading-tight", tile.tone.label)}>
                  {tile.label}
                </span>
              </>
            );
            const className = cn(
              "flex min-h-[112px] flex-col items-center justify-center gap-2.5 rounded-[22px] border px-2 py-3.5",
              tile.tone.card,
            );
            if (academicsTo) {
              return (
                <Link key={tile.label} to={academicsTo} className={className}>
                  {inner}
                </Link>
              );
            }
            return (
              <button key={tile.label} type="button" onClick={() => openView(tile.view || "")} className={className}>
                {inner}
              </button>
            );
          })}
        </section>

        <section className="overflow-hidden rounded-[24px] border border-[#E5EAF0] bg-white shadow-[0_10px_28px_rgba(15,23,42,0.1)]">
          {ROWS.map((row, index) => {
            const inner = (
              <>
                <span className={cn("grid h-[56px] w-[56px] shrink-0 place-items-center rounded-[16px]", row.tone.wrap)}>
                  <row.Icon className={cn("h-7 w-7", row.tone.icon)} strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-bold leading-tight text-[#0F172A]">{row.label}</span>
                  <span className="mt-0.5 block truncate text-[13px] font-medium leading-tight text-[#64748B]">{row.hint}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-[#94A3B8]" />
              </>
            );
            const className = cn(
              "flex w-full items-center gap-3.5 px-4 py-4 text-left active:bg-[#F8FAFC]",
              index > 0 && "border-t border-[#EEF2F6]",
            );
            if (row.to) {
              return (
                <Link key={row.label} to={row.to} className={className}>
                  {inner}
                </Link>
              );
            }
            return (
              <button key={row.label} type="button" onClick={() => openView(row.view || "")} className={className}>
                {inner}
              </button>
            );
          })}
        </section>
      </div>
    </div>
  );
}
