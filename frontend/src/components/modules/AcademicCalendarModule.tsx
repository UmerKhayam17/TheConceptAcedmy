import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  GraduationCap,
  List,
  NotebookPen,
  PartyPopper,
  Pencil,
  Plus,
  Printer,
  Sun,
  Flag,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SyllabusText } from "@/components/ui/syllabus-text";
import FilterToolbar, { FilterToolbarActions } from "@/components/modules/FilterToolbar";
import AcademicCalendarPlannerDialog, {
  type PlannerSeed,
} from "@/components/modules/AcademicCalendarPlannerDialog";
import { usePanelSession } from "@/components/panel-header/PanelSessionContext";
import { useToast } from "@/hooks/use-toast";
import {
  deleteCalendarItem,
  fetchAcademicCalendar,
  type CalendarEvent,
  type CalendarEventKind,
} from "@/lib/academicCalendarApi";
import { holidayIconFor } from "@/lib/holidayIcons";
import { localTodayYmd } from "@/lib/localDate";
import { cn } from "@/lib/utils";

// ── Date helpers (pure YYYY-MM-DD, UTC math so no timezone drift) ──────────

const WEEKDAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toUtc(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}
function fromUtc(ms: number) {
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function addDays(ymd: string, n: number) {
  return fromUtc(toUtc(ymd) + n * 86400000);
}
/** 0 = Monday … 6 = Sunday */
function weekdayIdx(ymd: string) {
  return (new Date(toUtc(ymd)).getUTCDay() + 6) % 7;
}
function ymdOf(year: number, month0: number, day: number) {
  return fromUtc(Date.UTC(year, month0, day));
}
function daysInMonth(year: number, month0: number) {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}
function formatLong(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${WEEKDAY_SHORT[weekdayIdx(ymd)]}, ${d} ${MONTHS[(m || 1) - 1].slice(0, 3)} ${y}`;
}
function formatRange(a: string, b: string) {
  return a === b ? formatLong(a) : `${formatLong(a)} – ${formatLong(b)}`;
}

// ── Event kinds ─────────────────────────────────────────────────────────────

const KIND_ORDER: CalendarEventKind[] = [
  "vacation",
  "holiday",
  "exam",
  "test",
  "event",
  "homework",
  "lesson_plan",
  "session",
];

const KIND_META: Record<
  CalendarEventKind,
  { label: string; chip: string; dot: string; cell: string; icon: typeof CalendarDays }
> = {
  session: {
    label: "Session",
    chip: "bg-slate-800 text-white",
    dot: "bg-slate-700",
    cell: "bg-slate-200",
    icon: Flag,
  },
  holiday: {
    label: "Holiday",
    chip: "bg-rose-100 text-rose-800 ring-1 ring-rose-200",
    dot: "bg-rose-500",
    cell: "bg-rose-100",
    icon: Sun,
  },
  vacation: {
    label: "Vacation",
    chip: "bg-violet-100 text-violet-800 ring-1 ring-violet-200",
    dot: "bg-violet-500",
    cell: "bg-violet-100",
    icon: CalendarRange,
  },
  test: {
    label: "Test",
    chip: "bg-sky-100 text-sky-800 ring-1 ring-sky-200",
    dot: "bg-sky-500",
    cell: "bg-sky-100",
    icon: ClipboardList,
  },
  exam: {
    label: "Exam",
    chip: "bg-amber-100 text-amber-900 ring-1 ring-amber-200",
    dot: "bg-amber-500",
    cell: "bg-amber-100",
    icon: GraduationCap,
  },
  lesson_plan: {
    label: "Lesson plan",
    chip: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200",
    dot: "bg-emerald-500",
    cell: "bg-emerald-100",
    icon: BookOpen,
  },
  homework: {
    label: "Homework",
    chip: "bg-orange-100 text-orange-900 ring-1 ring-orange-200",
    dot: "bg-orange-500",
    cell: "bg-orange-100",
    icon: NotebookPen,
  },
  event: {
    label: "Event",
    chip: "bg-teal-100 text-teal-900 ring-1 ring-teal-200",
    dot: "bg-teal-500",
    cell: "bg-teal-100",
    icon: PartyPopper,
  },
};

/** Holidays/vacations get their own icon (Eid → moon, Kashmir Day → mountain…); others use the kind icon. */
function eventIcon(e: Pick<CalendarEvent, "kind" | "title" | "category">) {
  if (e.kind === "holiday" || e.kind === "vacation") {
    return holidayIconFor({ name: e.title, category: e.kind === "vacation" ? "vacation" : e.category });
  }
  return (KIND_META[e.kind] || KIND_META.event).icon;
}

type ViewMode = "month" | "year" | "list";

function classLabel(e: CalendarEvent) {
  return [e.className, e.sectionName].filter(Boolean).join(" – ");
}

/** Collapse a day's events into short chips: "Test # 1 · 9 classes". */
function summarizeDay(events: CalendarEvent[]) {
  const groups = new Map<string, { kind: CalendarEventKind; label: string; items: CalendarEvent[]; tentative: boolean }>();
  for (const e of events) {
    const base = e.kind === "test" || e.kind === "exam" ? e.assessmentName || e.title : e.title;
    const key = `${e.kind}|${base}`;
    const g = groups.get(key) || { kind: e.kind, label: base, items: [], tentative: false };
    g.items.push(e);
    g.tentative = g.tentative || Boolean(e.tentative);
    groups.set(key, g);
  }
  return [...groups.values()]
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
    .map((g) => {
      if ((g.kind === "test" || g.kind === "exam") && g.items.length === 1) {
        return { ...g, label: g.items[0].subjectName ? `${g.label}: ${g.items[0].subjectName}` : g.label };
      }
      if (g.kind === "test" || g.kind === "exam") {
        const classes = new Set(g.items.map(classLabel));
        return { ...g, label: `${g.label} · ${classes.size} class${classes.size === 1 ? "" : "es"}` };
      }
      return g;
    });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

// ── Component ──────────────────────────────────────────────────────────────

export default function AcademicCalendarModule() {
  const today = localTodayYmd();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { apiSessionId } = usePanelSession();
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [view, setView] = useState<ViewMode>("month");
  const [hidden, setHidden] = useState<Set<CalendarEventKind>>(new Set());
  const [cursor, setCursor] = useState<{ y: number; m: number } | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [plannerSeed, setPlannerSeed] = useState<PlannerSeed | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["academic-calendar", apiSessionId || "", classId, sectionId],
    queryFn: () => fetchAcademicCalendar({ sessionId: apiSessionId, classId, sectionId }),
  });

  const canPlan = Boolean(data?.scope?.canPlan);
  const canManageHolidays = Boolean(data?.scope?.canManageHolidays);
  const isParent = Boolean(data?.scope?.parent);

  const openPlanner = (seed: PlannerSeed | null = null) => {
    setPlannerSeed(seed);
    setPlannerOpen(true);
  };

  const deleteMut = useMutation({
    mutationFn: (itemId: string) => deleteCalendarItem(itemId),
    onSuccess: () => {
      toast({ title: "Removed", description: "Calendar item deleted." });
      void qc.invalidateQueries({ queryKey: ["academic-calendar"] });
    },
    onError: (err: Error) => {
      toast({ title: "Could not delete", description: err.message, variant: "destructive" });
    },
  });

  const session = data?.session || null;
  const workingDays = useMemo(() => new Set(session?.workingDays || []), [session?.workingDays]);

  // Reset class/section if the session changes and the option disappears.
  useEffect(() => {
    if (!data) return;
    if (classId && !data.filters.classes.some((c) => c._id === classId)) setClassId("");
    if (sectionId && !data.filters.sections.some((s) => s._id === sectionId)) setSectionId("");
  }, [data, classId, sectionId]);

  // Start on the current month if it is inside the session, otherwise on the session's first month.
  useEffect(() => {
    if (!session || cursor) return;
    const inSession = today >= session.startDate && today <= session.endDate;
    const anchor = inSession ? today : session.startDate;
    const [y, m] = anchor.split("-").map(Number);
    setCursor({ y, m: m - 1 });
  }, [session, cursor, today]);

  const events = useMemo(
    () => (data?.events || []).filter((e) => !hidden.has(e.kind)),
    [data?.events, hidden],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      let d = e.startDate;
      const end = e.endDate && e.endDate >= e.startDate ? e.endDate : e.startDate;
      for (let i = 0; i < 400 && d <= end; i += 1) {
        const list = map.get(d) || [];
        list.push(e);
        map.set(d, list);
        d = addDays(d, 1);
      }
    }
    return map;
  }, [events]);

  const stats = useMemo(() => {
    const all = data?.events || [];
    const testDays = new Set(all.filter((e) => e.kind === "test").map((e) => e.startDate)).size;
    const examDays = new Set(all.filter((e) => e.kind === "exam").map((e) => e.startDate)).size;
    const offDays = all.filter((e) => e.kind === "holiday" || e.kind === "vacation").length;
    const next = all.find((e) => e.endDate >= today && e.kind !== "session");
    return { testDays, examDays, offDays, next };
  }, [data?.events, today]);

  const sessionMonths = useMemo(() => {
    if (!session) return [] as { y: number; m: number }[];
    const [sy, sm] = session.startDate.split("-").map(Number);
    const [ey, em] = session.endDate.split("-").map(Number);
    const out: { y: number; m: number }[] = [];
    let y = sy;
    let m = sm - 1;
    while ((y < ey || (y === ey && m <= em - 1)) && out.length < 36) {
      out.push({ y, m });
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
    return out;
  }, [session]);

  const sectionsForClass = (data?.filters.sections || []).filter((s) => !classId || s.classId === classId);

  const toggleKind = (k: CalendarEventKind) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const shiftMonth = (delta: number) =>
    setCursor((c) => {
      if (!c) return c;
      let m = c.m + delta;
      let y = c.y;
      while (m < 0) {
        m += 12;
        y -= 1;
      }
      while (m > 11) {
        m -= 12;
        y += 1;
      }
      return { y, m };
    });

  const goToday = () => {
    const [y, m] = today.split("-").map(Number);
    setCursor({ y, m: m - 1 });
    setView("month");
  };

  const printCalendar = () => {
    if (!session) return;
    const scopeLabel = [
      data?.filters.classes.find((c) => c._id === classId)?.className,
      data?.filters.sections.find((s) => s._id === sectionId)?.sectionName,
    ]
      .filter(Boolean)
      .join(" – ");
    const rows = events
      .map((e) => {
        const syllabus = e.syllabus ? `<div class="syl" dir="auto">${escapeHtml(e.syllabus)}</div>` : "";
        return `<tr>
          <td class="nowrap">${escapeHtml(formatRange(e.startDate, e.endDate))}</td>
          <td><span class="tag ${e.kind}">${KIND_META[e.kind].label}</span>${e.tentative ? ' <span class="tent">tentative</span>' : ""}</td>
          <td><strong>${escapeHtml(e.title)}</strong>${syllabus}</td>
          <td class="nowrap">${escapeHtml(classLabel(e) || "Whole school")}</td>
        </tr>`;
      })
      .join("");
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!doctype html><html><head><meta charset="utf-8">
      <title>Academic Calendar – ${escapeHtml(session.name)}</title>
      <style>
        body{font-family:system-ui,Segoe UI,Arial,sans-serif;color:#1a2b4b;margin:24px}
        h1{font-size:20px;margin:0}
        p.sub{margin:4px 0 16px;color:#64748b;font-size:13px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #e2e8f0;padding:6px 8px;text-align:left;vertical-align:top}
        th{background:#f8fafc}
        .nowrap{white-space:nowrap}
        .syl{color:#475569;margin-top:2px;white-space:pre-wrap}
        .tag{display:inline-block;border-radius:999px;padding:1px 8px;font-weight:600;font-size:11px}
        .session{background:#e2e8f0}.holiday{background:#ffe4e6}.vacation{background:#ede9fe}
        .test{background:#e0f2fe}.exam{background:#fef3c7}
        .lesson_plan{background:#d1fae5}.homework{background:#ffedd5}.event{background:#ccfbf1}
        .tent{color:#c2410c;font-size:11px}
      </style></head><body>
      <h1>Academic Calendar — ${escapeHtml(session.name)}</h1>
      <p class="sub">${escapeHtml(formatLong(session.startDate))} to ${escapeHtml(formatLong(session.endDate))}${
        scopeLabel ? ` · ${escapeHtml(scopeLabel)}` : ""
      }</p>
      <table><thead><tr><th>Date</th><th>Type</th><th>Event</th><th>Class</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4">No events.</td></tr>'}</tbody></table>
      <script>window.onload=function(){window.print()}</script>
      </body></html>`);
    win.document.close();
  };

  const dayEvents = openDay ? byDay.get(openDay) || [] : [];

  return (
    <div className="min-h-full space-y-4 bg-white px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-black/[0.04] sm:px-5 sm:py-3.5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
              <CalendarRange className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold leading-tight tracking-tight text-[#1a2b4b] sm:text-xl">
                Academic Calendar
              </h2>
              <p className="mt-0.5 max-w-xl text-xs leading-snug text-slate-500 sm:text-sm">
                {session
                  ? `${session.name} · ${formatLong(session.startDate)} to ${formatLong(session.endDate)}`
                  : "Holidays, lesson plans, homework, events, tests and exams in one place."}
              </p>
            </div>
          </div>
          <div className="max-w-[15rem] shrink-0 rounded-lg bg-primary/10 px-3 py-2">
            <p className="text-xs italic leading-snug text-[#1a2b4b]/80 sm:text-sm">
              <span className="mr-1 font-serif text-base not-italic leading-none text-primary">
                &ldquo;
              </span>
              A great school builds great futures.
              <span className="ml-0.5 font-serif text-base not-italic leading-none text-primary">
                &rdquo;
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<Flag className="h-5 w-5 text-slate-700" />}
          iconClass="bg-slate-100"
          label="Coming up next"
          value={stats.next ? stats.next.title : "—"}
          hint={stats.next ? formatRange(stats.next.startDate, stats.next.endDate) : "Nothing scheduled ahead"}
          small
        />
        <StatCard
          icon={<ClipboardList className="h-5 w-5 text-sky-600" />}
          iconClass="bg-sky-100"
          label="Test days"
          value={stats.testDays}
          hint="Days with a class test"
        />
        <StatCard
          icon={<GraduationCap className="h-5 w-5 text-amber-600" />}
          iconClass="bg-amber-100"
          label="Exam days"
          value={stats.examDays}
          hint="Mid-term, final and other exams"
        />
        <StatCard
          icon={<Sun className="h-5 w-5 text-rose-600" />}
          iconClass="bg-rose-100"
          label="Holidays & vacations"
          value={stats.offDays}
          hint="School closed"
        />
      </div>

      {/* Toolbar */}
      <Card className="p-3 shadow-sm sm:p-4">
        <FilterToolbar>
          <select
            className="h-10 w-full shrink-0 rounded-md border border-input bg-background px-3 text-sm sm:w-[11rem]"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setSectionId("");
            }}
            aria-label="Class filter"
          >
            <option value="">All classes</option>
            {(data?.filters.classes || []).map((c) => (
              <option key={c._id} value={c._id}>
                {c.className}
              </option>
            ))}
          </select>
          <select
            className="h-10 w-full shrink-0 rounded-md border border-input bg-background px-3 text-sm sm:w-[11rem]"
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            aria-label="Section filter"
            disabled={!sectionsForClass.length}
          >
            <option value="">All sections</option>
            {sectionsForClass.map((s) => (
              <option key={s._id} value={s._id}>
                {s.sectionName}
              </option>
            ))}
          </select>
          <div className="inline-flex shrink-0 rounded-md border border-input p-0.5" role="tablist" aria-label="Calendar view">
            {(
              [
                ["month", "Month", CalendarDays],
                ["year", "Year", CalendarRange],
                ["list", "List", List],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={view === key}
                onClick={() => setView(key)}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded px-3 text-sm font-medium",
                  view === key ? "bg-primary text-primary-foreground" : "text-slate-600 hover:bg-slate-100",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
          <FilterToolbarActions>
            {canPlan && session && (
              <>
                <Button
                  variant="outline"
                  className="h-10 gap-1.5"
                  onClick={() => openPlanner({ kind: "lesson_plan", date: today, bulk: "month" })}
                >
                  <CalendarRange className="h-4 w-4" />
                  Plan month
                </Button>
                <Button className="h-10 gap-1.5" onClick={() => openPlanner({ date: today })}>
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </>
            )}
            <Button variant="outline" className="h-10 gap-1.5" onClick={printCalendar} disabled={!session}>
              <Printer className="h-4 w-4" />
              Print
            </Button>
          </FilterToolbarActions>
        </FilterToolbar>

        {/* Legend / type toggles */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {KIND_ORDER.filter((k) => !(isParent && k === "lesson_plan")).map((k) => {
            const off = hidden.has(k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggleKind(k)}
                aria-pressed={!off}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                  off ? "border-slate-200 text-slate-400 line-through" : "border-slate-200 text-slate-700",
                )}
              >
                <span className={cn("h-2.5 w-2.5 rounded-full", off ? "bg-slate-300" : KIND_META[k].dot)} />
                {KIND_META[k].label}
              </button>
            );
          })}
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <span className="h-3 w-5 rounded border border-dashed border-slate-400" />
            Draft / tentative
          </span>
        </div>
      </Card>

      {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">Loading calendar…</p>}
      {isError && <p className="py-10 text-center text-sm text-destructive">{(error as Error).message}</p>}
      {!isLoading && !isError && !session && (
        <p className="py-10 text-center text-sm text-muted-foreground">No academic session has been set up yet.</p>
      )}

      {session && cursor && view === "month" && (
        <MonthView
          y={cursor.y}
          m={cursor.m}
          today={today}
          byDay={byDay}
          workingDays={workingDays}
          sessionStart={session.startDate}
          sessionEnd={session.endDate}
          onPrev={() => shiftMonth(-1)}
          onNext={() => shiftMonth(1)}
          onToday={goToday}
          onOpenDay={setOpenDay}
        />
      )}

      {session && view === "year" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sessionMonths.map(({ y, m }) => (
            <MiniMonth
              key={`${y}-${m}`}
              y={y}
              m={m}
              today={today}
              byDay={byDay}
              workingDays={workingDays}
              onOpenDay={setOpenDay}
              onOpenMonth={() => {
                setCursor({ y, m });
                setView("month");
              }}
            />
          ))}
        </div>
      )}

      {session && view === "list" && <ListView events={events} today={today} />}

      <Dialog open={Boolean(openDay)} onOpenChange={(o) => !o && setOpenDay(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{openDay ? formatLong(openDay) : ""}</DialogTitle>
            <DialogDescription>
              {openDay && !workingDays.has(WEEKDAY_KEYS[weekdayIdx(openDay)])
                ? "Not a working day."
                : `${dayEvents.length} item${dayEvents.length === 1 ? "" : "s"} on this day.`}
            </DialogDescription>
          </DialogHeader>
          {canPlan && openDay && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => {
                  setOpenDay(null);
                  openPlanner({ kind: "lesson_plan", date: openDay });
                }}
              >
                <BookOpen className="h-3.5 w-3.5" /> Lesson plan
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => {
                  setOpenDay(null);
                  openPlanner({ kind: "homework", date: openDay });
                }}
              >
                <NotebookPen className="h-3.5 w-3.5" /> Homework
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => {
                  setOpenDay(null);
                  openPlanner({ kind: "event", date: openDay });
                }}
              >
                <PartyPopper className="h-3.5 w-3.5" /> Event
              </Button>
              {canManageHolidays && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => {
                    setOpenDay(null);
                    openPlanner({ kind: "holiday", date: openDay });
                  }}
                >
                  <Sun className="h-3.5 w-3.5" /> Holiday
                </Button>
              )}
            </div>
          )}
          <div className="space-y-2">
            {dayEvents.length === 0 && <p className="text-sm text-muted-foreground">Nothing scheduled.</p>}
            {dayEvents.map((e) => (
              <EventCard
                key={`${e.id}-${openDay}`}
                e={e}
                hideLessonPlanNote={isParent}
                onEdit={
                  e.canEdit
                    ? () => {
                        setOpenDay(null);
                        openPlanner({ editEvent: e });
                      }
                    : undefined
                }
                onDelete={
                  e.canEdit && e.itemId
                    ? () => {
                        if (window.confirm(`Delete “${e.title}”?`)) deleteMut.mutate(e.itemId!);
                      }
                    : undefined
                }
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {session && apiSessionId && (
        <AcademicCalendarPlannerDialog
          open={plannerOpen}
          onOpenChange={setPlannerOpen}
          sessionId={apiSessionId}
          sessionStart={session.startDate}
          sessionEnd={session.endDate}
          workingDays={session.workingDays || []}
          canManageHolidays={canManageHolidays}
          seed={plannerSeed}
          monthCursor={cursor}
        />
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatCard({
  icon,
  iconClass,
  label,
  value,
  hint,
  small,
}: {
  icon: ReactNode;
  iconClass: string;
  label: string;
  value: ReactNode;
  hint: string;
  small?: boolean;
}) {
  return (
    <Card className="flex items-center gap-3 rounded-2xl border-slate-200/80 p-4 shadow-sm">
      <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", iconClass)}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className={cn("truncate font-semibold leading-tight text-[#1a2b4b]", small ? "text-base" : "text-2xl")}>
          {value}
        </p>
        <p className="truncate text-xs text-slate-400">{hint}</p>
      </div>
    </Card>
  );
}

function EventCard({
  e,
  onEdit,
  onDelete,
  hideLessonPlanNote,
}: {
  e: CalendarEvent;
  onEdit?: () => void;
  onDelete?: () => void;
  hideLessonPlanNote?: boolean;
}) {
  const meta = KIND_META[e.kind] || KIND_META.event;
  const Icon = eventIcon(e);
  const timeLabel = [e.startTime, e.endTime].filter(Boolean).join(" – ");
  return (
    <div className={cn("rounded-lg border p-3", e.tentative ? "border-dashed border-slate-300" : "border-slate-200")}>
      <div className="flex items-start gap-2">
        <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md", meta.chip)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 text-sm font-semibold text-[#1a2b4b]">{e.title}</p>
            {(onEdit || onDelete) && (
              <div className="flex shrink-0 gap-1">
                {onEdit && (
                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit} aria-label="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
                {onDelete && (
                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={onDelete} aria-label="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            )}
          </div>
          <p className="text-xs text-slate-500">
            {[
              meta.label,
              e.eventCategory && e.eventCategory !== "other" ? e.eventCategory : "",
              e.assessmentTypeLabel && e.assessmentTypeLabel !== meta.label ? e.assessmentTypeLabel : "",
              classLabel(e) || (e.kind === "event" && !e.classId ? "Whole school" : ""),
              e.subjectName,
              e.disciplineName,
              e.totalMarks ? `${e.totalMarks} marks` : "",
              timeLabel,
              e.createdByName ? `by ${e.createdByName}` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {e.startDate !== e.endDate && (
            <p className="text-xs text-slate-500">
              {e.kind === "homework" ? `Due ${formatLong(e.endDate)}` : formatRange(e.startDate, e.endDate)}
            </p>
          )}
          {e.tentative && (
            <p className="mt-1 text-xs font-medium text-orange-700">
              {e.kind === "test" || e.kind === "exam" ? "Draft — not yet published" : "Tentative date"}
            </p>
          )}
          {!hideLessonPlanNote && e.kind === "lesson_plan" && (
            <p className="mt-1 text-[11px] text-emerald-700">Visible to staff only</p>
          )}
          {e.objectives && (
            <p className="mt-1.5 text-xs text-slate-600">
              <span className="font-medium">Objectives:</span> {e.objectives}
            </p>
          )}
          {e.activities && (
            <p className="mt-1 text-xs text-slate-600">
              <span className="font-medium">Activities:</span> {e.activities}
            </p>
          )}
          {e.description && <p className="mt-1 text-xs text-slate-500 whitespace-pre-wrap">{e.description}</p>}
          {e.syllabus && (
            <div className="mt-1.5 rounded bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
              <SyllabusText text={e.syllabus} className="block whitespace-pre-wrap" />
            </div>
          )}
          {e.notes && <p className="mt-1 text-xs text-slate-500">{e.notes}</p>}
        </div>
      </div>
    </div>
  );
}

function MonthView({
  y,
  m,
  today,
  byDay,
  workingDays,
  sessionStart,
  sessionEnd,
  onPrev,
  onNext,
  onToday,
  onOpenDay,
}: {
  y: number;
  m: number;
  today: string;
  byDay: Map<string, CalendarEvent[]>;
  workingDays: Set<string>;
  sessionStart: string;
  sessionEnd: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onOpenDay: (ymd: string) => void;
}) {
  const first = ymdOf(y, m, 1);
  const lead = weekdayIdx(first);
  const total = daysInMonth(y, m);
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: total }, (_, i) => ymdOf(y, m, i + 1)),
  ];
  while (cells.length % 7) cells.push(null);

  return (
    <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-3 sm:px-5">
        <h3 className="font-display text-lg font-semibold text-[#1a2b4b]">
          {MONTHS[m]} {y}
        </h3>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={onToday}>
            Today
          </Button>
          <Button variant="ghost" size="icon" onClick={onPrev} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onNext} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {WEEKDAY_SHORT.map((d, i) => (
          <div key={d} className={cn("py-2", !workingDays.has(WEEKDAY_KEYS[i]) && "text-slate-400")}>
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((ymd, i) => {
          if (!ymd) return <div key={`blank-${i}`} className="min-h-[3.5rem] border-b border-r border-slate-100 bg-slate-50/50 sm:min-h-[6.5rem]" />;
          const list = byDay.get(ymd) || [];
          const groups = summarizeDay(list);
          const offDay = !workingDays.has(WEEKDAY_KEYS[weekdayIdx(ymd)]);
          const outside = ymd < sessionStart || ymd > sessionEnd;
          const day = Number(ymd.slice(8));
          // Fill the whole day box with the colour of its most important event.
          const topKind = groups[0]?.kind;
          return (
            <button
              key={ymd}
              type="button"
              onClick={() => onOpenDay(ymd)}
              className={cn(
                "flex min-h-[3.5rem] flex-col items-stretch gap-1 border-b border-r border-slate-100 p-1 text-left transition-colors sm:min-h-[7.5rem] sm:p-1.5",
                topKind
                  ? cn(KIND_META[topKind].cell, "hover:brightness-95")
                  : cn("hover:bg-primary/5", (offDay || outside) && "bg-slate-50"),
              )}
            >
              <span
                className={cn(
                  "inline-flex h-6 w-6 items-center justify-center self-start rounded-full text-xs font-semibold",
                  ymd === today ? "bg-primary text-primary-foreground" : offDay || outside ? "text-slate-400" : "text-[#1a2b4b]",
                )}
              >
                {day}
              </span>
              {/* Phone: dots */}
              <span className="flex flex-wrap gap-0.5 sm:hidden">
                {groups.slice(0, 4).map((g, gi) => (
                  <span key={gi} className={cn("h-1.5 w-1.5 rounded-full", KIND_META[g.kind].dot)} />
                ))}
              </span>
              {/* Tablet+: chips */}
              <span className="hidden flex-col gap-0.5 sm:flex">
                {groups.slice(0, 3).map((g, gi) => {
                  const isOff = g.kind === "holiday" || g.kind === "vacation";
                  const ChipIcon = isOff && g.items[0] ? eventIcon(g.items[0]) : null;
                  return (
                    <span
                      key={gi}
                      className={cn(
                        "flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-semibold leading-tight lg:text-sm",
                        KIND_META[g.kind].chip,
                        g.tentative && "border border-dashed border-current ring-0",
                      )}
                      title={g.label}
                    >
                      {ChipIcon && <ChipIcon className="h-4 w-4 shrink-0 lg:h-5 lg:w-5" />}
                      <span className="truncate">{g.label}</span>
                    </span>
                  );
                })}
                {groups.length > 3 && (
                  <span className="px-1 text-xs font-semibold text-slate-600">+{groups.length - 3} more</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function MiniMonth({
  y,
  m,
  today,
  byDay,
  workingDays,
  onOpenDay,
  onOpenMonth,
}: {
  y: number;
  m: number;
  today: string;
  byDay: Map<string, CalendarEvent[]>;
  workingDays: Set<string>;
  onOpenDay: (ymd: string) => void;
  onOpenMonth: () => void;
}) {
  const first = ymdOf(y, m, 1);
  const lead = weekdayIdx(first);
  const total = daysInMonth(y, m);
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: total }, (_, i) => ymdOf(y, m, i + 1)),
  ];
  let monthCount = 0;
  for (let d = 1; d <= total; d += 1) {
    const list = byDay.get(ymdOf(y, m, d));
    if (list?.some((e) => e.kind === "test" || e.kind === "exam")) monthCount += 1;
  }

  return (
    <Card className="rounded-2xl border-slate-200/80 p-3 shadow-sm">
      <button
        type="button"
        onClick={onOpenMonth}
        className="mb-2 flex w-full items-baseline justify-between text-left hover:text-primary"
      >
        <span className="font-display text-sm font-semibold text-[#1a2b4b]">
          {MONTHS[m]} {y}
        </span>
        <span className="text-[11px] text-slate-400">
          {monthCount ? `${monthCount} test/exam day${monthCount === 1 ? "" : "s"}` : ""}
        </span>
      </button>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-slate-400">
        {WEEKDAY_SHORT.map((d) => (
          <span key={d}>{d.slice(0, 1)}</span>
        ))}
        {cells.map((ymd, i) => {
          if (!ymd) return <span key={`b-${i}`} />;
          const list = byDay.get(ymd) || [];
          const top = KIND_ORDER.find((k) => list.some((e) => e.kind === k));
          const offDay = !workingDays.has(WEEKDAY_KEYS[weekdayIdx(ymd)]);
          return (
            <button
              key={ymd}
              type="button"
              onClick={() => onOpenDay(ymd)}
              title={list.length ? list.map((e) => e.title).slice(0, 4).join("\n") : undefined}
              className={cn(
                "aspect-square rounded text-[11px] leading-none",
                top ? KIND_META[top].cell : "",
                top ? "font-semibold text-[#1a2b4b]" : offDay ? "text-slate-300" : "text-slate-600",
                ymd === today && "ring-2 ring-primary",
              )}
            >
              {Number(ymd.slice(8))}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function ListView({ events, today }: { events: CalendarEvent[]; today: string }) {
  const [upcomingOnly, setUpcomingOnly] = useState(false);
  const shown = upcomingOnly ? events.filter((e) => e.endDate >= today) : events;

  const byMonth = useMemo(() => {
    const map = new Map<string, Map<string, CalendarEvent[]>>();
    for (const e of shown) {
      const mk = e.startDate.slice(0, 7);
      const month = map.get(mk) || new Map<string, CalendarEvent[]>();
      const list = month.get(e.startDate) || [];
      list.push(e);
      month.set(e.startDate, list);
      map.set(mk, month);
    }
    return map;
  }, [shown]);

  return (
    <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
        <h3 className="font-display text-lg font-semibold text-[#1a2b4b]">All dates</h3>
        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={upcomingOnly} onChange={(e) => setUpcomingOnly(e.target.checked)} />
          Upcoming only
        </label>
      </div>
      {shown.length === 0 && <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nothing to show.</p>}
      <div className="divide-y divide-slate-100">
        {[...byMonth.entries()].map(([mk, days]) => {
          const [yy, mm] = mk.split("-").map(Number);
          return (
            <section key={mk}>
              <h4 className="sticky top-0 z-[1] bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:px-5">
                {MONTHS[mm - 1]} {yy}
              </h4>
              {[...days.entries()].map(([ymd, list]) => (
                <div key={ymd} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:gap-4 sm:px-5">
                  <div className={cn("w-36 shrink-0 text-sm font-semibold", ymd === today ? "text-primary" : "text-[#1a2b4b]")}>
                    {formatLong(ymd)}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    {list.map((e) => (
                      <EventCard key={e.id} e={e} />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </Card>
  );
}
