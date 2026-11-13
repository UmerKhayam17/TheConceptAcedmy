import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  ArrowLeftRight,
  BarChart3,
  Brain,
  CalendarDays,
  Check,
  ChevronRight,
  FileText,
  GraduationCap,
  Home,
  Megaphone,
  Receipt,
  UserRound,
} from "lucide-react";
import { moduleHref } from "@/lib/panelMenus";
import { timetableHref } from "@/lib/timetableMenus";
import { testExamsHref } from "@/lib/testExamsMenus";
import { resolveUploadUrl, type AcademyStudent, type AcademyStudentRecord } from "@/lib/studentManagementApi";
import { classLabel } from "@/components/modules/student-management/studentDisplayUtils";
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

const TILES: {
  label: string;
  view?: string;
  to?: string;
  Icon: LucideIcon;
  tone: Tone;
}[] = [
  { label: "Online Quiz", to: testExamsHref(ROLE, "enter-tests"), Icon: Brain, tone: { wrap: "bg-[#F3E8FF]", icon: "text-[#7C3AED]" } },
  { label: "Academics", view: "academics", Icon: GraduationCap, tone: { wrap: "bg-[#E6F7F4]", icon: "text-[#0F766E]" } },
  { label: "Attendance", to: moduleHref(ROLE, "attendance"), Icon: CalendarDays, tone: { wrap: "bg-[#FFF4E5]", icon: "text-[#EA580C]" } },
  { label: "Notice Board", to: moduleHref(ROLE, "announcements"), Icon: Megaphone, tone: { wrap: "bg-[#FDE8F3]", icon: "text-[#DB2777]" } },
  { label: "Date Sheet", to: testExamsHref(ROLE, "date-sheet"), Icon: FileText, tone: { wrap: "bg-[#E6F7FB]", icon: "text-[#0891B2]" } },
  { label: "Results", to: testExamsHref(ROLE, "report-card"), Icon: BarChart3, tone: { wrap: "bg-[#E7F0FF]", icon: "text-[#2563EB]" } },
];

const ROWS: {
  label: string;
  hint: string;
  view?: string;
  to?: string;
  Icon: LucideIcon;
  tone: Tone;
}[] = [
  { label: "Fee", hint: "Invoices, dues & payment history", view: "fees", Icon: Receipt, tone: { wrap: "bg-[#E8F8EE]", icon: "text-[#16A34A]" } },
  { label: "Timetable", hint: "Weekly class schedule", to: timetableHref(ROLE, "view"), Icon: CalendarDays, tone: { wrap: "bg-[#E7F0FF]", icon: "text-[#2563EB]" } },
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

function formatMoney(amount: number) {
  return `Rs ${Math.round(amount).toLocaleString("en-PK")}`;
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
  const view = params.get("view") === "fees" ? "fees" : "";
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

  if (view) {
    return (
      <FeatureScreen
        view={view}
        onBack={closeView}
        student={student}
        record={record}
        loading={studentsLoading || recordLoading}
      />
    );
  }

  return (
    <div className="min-h-full bg-[#E7F6FB] pb-8">
      <header className="relative overflow-hidden bg-gradient-to-b from-[#2ED3E0] via-[#18C3D4] to-[#12B3C8] px-4 pb-16 pt-[max(0.85rem,env(safe-area-inset-top))] text-white">
        <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full border border-white/15" />
        <div className="pointer-events-none absolute right-6 top-16 h-24 w-24 rounded-full border border-white/10" />
        <div className="relative flex items-start justify-between">
          <button
            type="button"
            onClick={cycleChild}
            aria-label={students.length > 1 ? "Switch child" : "One child linked"}
            className="grid h-11 w-11 place-items-center rounded-2xl bg-white/20 text-white"
          >
            <ArrowLeftRight className="h-5 w-5" />
          </button>
          <span
            aria-hidden
            className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-[#7DD3FC] to-[#2563EB] text-white shadow-md ring-2 ring-white/70"
          >
            <GraduationCap className="h-6 w-6" />
          </span>
        </div>
        <p className="relative mt-5 text-[11px] font-semibold tracking-[0.22em] text-white/90">
          {greeting()}
        </p>
        <h1 className="relative mt-1 truncate text-[2rem] font-bold leading-none tracking-tight">
          {displayName}
        </h1>
        <p className="relative mt-2 flex items-center gap-1.5 text-sm text-white/95">
          <Home className="h-3.5 w-3.5" />
          The Concept Academy
        </p>
        <div className="relative mt-3 flex items-center gap-2">
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#0F3A4A]">
            Parent
          </span>
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium text-white">
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
                      "flex min-w-[240px] flex-1 items-center gap-3 rounded-2xl border-2 bg-white px-3 py-3 text-left shadow-sm",
                      active ? "border-[#3EC6D4]" : "border-transparent",
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
                      <span className="block truncate text-base font-semibold text-[#17324A]">
                        {shown.studentName}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-[#13A8B8]">
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

        <section className="grid grid-cols-3 gap-x-2 gap-y-4">
          {TILES.map((tile) => {
            const academicsTo = tile.label === "Academics" && student
              ? `/panel/parent/students/${student._id}`
              : tile.to;
            const inner = (
              <>
                <span className={cn("grid h-14 w-14 place-items-center rounded-2xl", tile.tone.wrap)}>
                  <tile.Icon className={cn("h-6 w-6", tile.tone.icon)} strokeWidth={1.75} />
                </span>
                <span className="text-center text-[11px] font-medium leading-tight text-[#334155]">
                  {tile.label}
                </span>
              </>
            );
            const className = "flex flex-col items-center gap-1.5";
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

        <section className="overflow-hidden rounded-[28px] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
          {ROWS.map((row, index) => {
            const inner = (
              <>
                <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", row.tone.wrap)}>
                  <row.Icon className={cn("h-5 w-5", row.tone.icon)} strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[#17324A]">{row.label}</span>
                  <span className="block truncate text-xs text-[#94A3B8]">{row.hint}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[#CBD5E1]" />
              </>
            );
            const className = cn(
              "flex w-full items-center gap-3 px-4 py-3.5 text-left",
              index > 0 && "border-t border-[#F1F5F9]",
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

function FeatureScreen({
  view,
  onBack,
  student,
  record,
  loading,
}: {
  view: string;
  onBack: () => void;
  student?: AcademyStudent;
  record?: AcademyStudentRecord;
  loading: boolean;
}) {
  const fees = record?.fees;

  return (
    <div className="min-h-full bg-[#E7F6FB] pb-8">
      <div className="sticky top-0 z-10 flex items-center gap-3 bg-[#E7F6FB]/95 px-3 py-3 backdrop-blur">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#17324A] shadow-sm"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold text-[#17324A]">Fee</h1>
          {student ? <p className="truncate text-xs text-[#13A8B8]">{classSectionLine(student)}</p> : null}
        </div>
      </div>
      <div className="space-y-3 px-4">
        {loading ? <div className="h-24 animate-pulse rounded-2xl bg-white/80" /> : null}

        {view === "fees" && !loading && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-500">Paid</p>
                <p className="mt-1 text-lg font-bold text-[#17324A]">{formatMoney(fees?.summary.totalPaid || 0)}</p>
              </div>
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-500">Due</p>
                <p className="mt-1 text-lg font-bold text-[#17324A]">{formatMoney(fees?.summary.totalPending || 0)}</p>
              </div>
            </div>
            {(fees?.records || []).length === 0 ? (
              <EmptyNote title="No fee vouchers yet" body="Invoices from the school will show up here." />
            ) : (
              <ul className="overflow-hidden rounded-2xl bg-white shadow-sm">
                {fees!.records.map((fee, index) => (
                  <li
                    key={fee._id}
                    className={cn("flex items-center justify-between gap-3 px-4 py-3", index > 0 && "border-t border-[#F1F5F9]")}
                  >
                    <div>
                      <p className="text-sm font-semibold capitalize text-[#17324A]">
                        {fee.feeType} · {fee.month}/{fee.year}
                      </p>
                      <p className="text-xs capitalize text-slate-400">{fee.status}</p>
                    </div>
                    <p className="text-sm font-semibold text-[#17324A]">{formatMoney(fee.amount)}</p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
