import { Link } from "react-router-dom";
import {
  CalendarDays,
  CalendarPlus,
  Download,
  FileText,
  type LucideIcon,
} from "lucide-react";
import { LEGEND_SUBJECTS, subjectTheme } from "../my-schedule/subjectTheme";
import { assessmentTypeLabel } from "@/lib/assessmentTaxonomy";
import { cn } from "@/lib/utils";

export type UpcomingExamItem = {
  id: string;
  dateLabel: string;
  title: string;
  timeLabel?: string;
  typeLabel: string;
  typeTone: "test" | "quiz" | "practical" | "exam" | "other";
};

const TYPE_TONE: Record<UpcomingExamItem["typeTone"], string> = {
  test: "bg-blue-100 text-blue-700",
  quiz: "bg-emerald-100 text-emerald-700",
  practical: "bg-violet-100 text-violet-700",
  exam: "bg-amber-100 text-amber-800",
  other: "bg-slate-100 text-slate-600",
};

export function examTypeTone(type?: string): UpcomingExamItem["typeTone"] {
  const t = String(type || "").toLowerCase();
  if (t.includes("quiz")) return "quiz";
  if (t.includes("practical") || t.includes("lab")) return "practical";
  if (t.includes("mid") || t.includes("final") || t.includes("exam")) return "exam";
  if (t.includes("test") || t.includes("unit") || t.includes("weekly") || t.includes("monthly")) {
    return "test";
  }
  return "other";
}

export function ParentSubjectLegend({ subjectNames }: { subjectNames: string[] }) {
  const fromData = new Map<string, (typeof LEGEND_SUBJECTS)[number]>();
  for (const name of subjectNames) {
    const theme = subjectTheme("", name);
    fromData.set(theme.key, theme);
  }
  const display = fromData.size
    ? [...fromData.values()]
    : LEGEND_SUBJECTS.filter((s) =>
        ["mathematics", "english", "physics", "chemistry", "biology", "computer", "pe", "urdu", "islamiat", "art"].includes(
          s.key,
        ),
      );

  // Always append "Other" for empty/unknown cells context
  const withOther = display.some((d) => d.key === "general")
    ? display
    : [...display, subjectTheme("", "Other")];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-[0_2px_8px_rgba(15,42,86,0.04)] h-full">
      <h3 className="text-sm font-bold text-[#0B2347]">Subject Legend</h3>
      <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
        {withOther.map((s) => (
          <li key={s.key} className="flex items-center gap-2 min-w-0">
            <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", s.accent)} aria-hidden />
            <span className="truncate text-[12px] text-slate-600">{s.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ParentUpcomingExams({
  items,
  viewAllHref,
}: {
  items: UpcomingExamItem[];
  viewAllHref: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-[0_2px_8px_rgba(15,42,86,0.04)] h-full">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-[#0B2347]">Upcoming Exams / Assessments</h3>
        <Link to={viewAllHref} className="text-[11px] font-semibold text-sky-600 hover:underline">
          View All
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">No upcoming exams scheduled yet.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5"
            >
              <div className="w-12 shrink-0 text-center">
                <p className="text-[11px] font-bold text-[#0B2347] leading-tight">{item.dateLabel}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-[#0F172A] truncate">{item.title}</p>
                {item.timeLabel ? (
                  <p className="text-[11px] text-slate-400 mt-0.5">{item.timeLabel}</p>
                ) : null}
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  TYPE_TONE[item.typeTone],
                )}
              >
                {item.typeLabel || assessmentTypeLabel(item.typeLabel) || "Test"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type QuickAction = {
  label: string;
  description: string;
  icon: LucideIcon;
  to?: string;
  onClick?: () => void;
};

export function ParentQuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-[0_2px_8px_rgba(15,42,86,0.04)] h-full">
      <h3 className="text-sm font-bold text-[#0B2347]">Quick Actions</h3>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {actions.map((a) => {
          const Icon = a.icon;
          const className =
            "flex flex-col items-start gap-2 rounded-xl border border-slate-100 bg-white px-3 py-3 text-left shadow-sm hover:border-sky-200 hover:shadow-md transition-all";
          const body = (
            <>
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                <Icon className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-[12px] font-semibold text-[#0F172A] leading-tight">
                  {a.label}
                </span>
                <span className="mt-0.5 block text-[10px] text-slate-400 leading-snug">
                  {a.description}
                </span>
              </span>
            </>
          );
          if (a.to) {
            return (
              <Link key={a.label} to={a.to} className={className}>
                {body}
              </Link>
            );
          }
          return (
            <button key={a.label} type="button" onClick={a.onClick} className={className}>
              {body}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export const PARENT_QUICK_ACTION_ICONS = {
  CalendarDays,
  Download,
  FileText,
  CalendarPlus,
} as const;
