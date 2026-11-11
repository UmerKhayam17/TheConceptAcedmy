import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Atom,
  BookOpen,
  Building2,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flag,
  Flame,
  HardHat,
  Landmark,
  Moon,
  MoonStar,
  Mountain,
  Palmtree,
  Pencil,
  Plus,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { usePanelSession } from "@/components/panel-header/PanelSessionContext";
import { normalizeWorkingDays } from "@/components/modules/timetable/constants";
import type { Weekday } from "@/lib/configApi";
import FilterToolbar, { FilterToolbarActions } from "@/components/modules/FilterToolbar";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import { usePanelListSearch } from "@/hooks/usePanelListSearch";
import {
  approveHoliday,
  createHoliday,
  deleteHoliday,
  fetchSessionHolidays,
  updateHoliday,
  type HolidayAppliesTo,
  type HolidayCategory,
  type HolidayStatus,
  type SchoolHoliday,
} from "@/lib/holidayApi";
import { localTodayYmd } from "@/lib/localDate";
import type { ModuleActionCaps } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_KEYS: Weekday[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const EMPTY_APPLIES: HolidayAppliesTo = { students: true, teachers: true, staff: true };

type Draft = {
  name: string;
  category: HolidayCategory;
  startDate: string;
  endDate: string;
  status: HolidayStatus;
  appliesTo: HolidayAppliesTo;
  notes: string;
};

function emptyDraft(today: string): Draft {
  return {
    name: "",
    category: "public",
    startDate: today,
    endDate: today,
    status: "approved",
    appliesTo: { ...EMPTY_APPLIES },
    notes: "",
  };
}

function ymdOf(year: number, monthIndex: number, day: number) {
  const date = new Date(Date.UTC(year, monthIndex, day));
  return date.toISOString().slice(0, 10);
}

function calendarCells(year: number, monthIndex: number) {
  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const cells: Array<{ day: number; ymd: string; outside: boolean }> = [];
  for (let i = 0; i < firstWeekday; i += 1) {
    const ymd = ymdOf(year, monthIndex, i - firstWeekday + 1);
    cells.push({ day: Number(ymd.slice(8, 10)), ymd, outside: true });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ day, ymd: ymdOf(year, monthIndex, day), outside: false });
  }
  let extra = 1;
  while (cells.length % 7 !== 0) {
    const ymd = ymdOf(year, monthIndex + 1, extra);
    cells.push({ day: extra, ymd, outside: true });
    extra += 1;
  }
  return cells;
}

function parseYmd(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y, m, d };
}

function formatLong(ymd: string) {
  const { y, m, d } = parseYmd(ymd);
  if (!y || !m || !d) return ymd;
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]} ${y}`;
}

function weekdayLong(ymd: string) {
  const { y, m, d } = parseYmd(ymd);
  return WEEKDAY_LONG[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function covers(holiday: SchoolHoliday, ymd: string) {
  return ymd >= holiday.startDate && ymd <= holiday.endDate;
}

function appliesLabel(applies?: HolidayAppliesTo) {
  if (!applies) return "All";
  if (applies.students && applies.teachers && applies.staff) return "All";
  const parts = [
    applies.students ? "Students" : "",
    applies.teachers ? "Teachers" : "",
    applies.staff ? "Staff" : "",
  ].filter(Boolean);
  return parts.join(", ") || "—";
}

function typeLabel(category: HolidayCategory) {
  if (category === "public") return "Public";
  if (category === "islamic") return "Islamic";
  if (category === "government") return "Government";
  return "Vacation";
}

function calendarLabel(holiday: SchoolHoliday) {
  const name = holiday.shortName || holiday.name;
  return holiday.status === "pending" ? `${name} (Expected)` : name;
}

const HOLIDAY_ICONS: { match: RegExp; icon: LucideIcon }[] = [
  { match: /kashmir/i, icon: Mountain },
  { match: /pakistan/i, icon: Flag },
  { match: /labour|labor/i, icon: HardHat },
  { match: /takbeer/i, icon: Atom },
  { match: /independence/i, icon: Sparkles },
  { match: /iqbal/i, icon: BookOpen },
  { match: /quaid/i, icon: Landmark },
  { match: /fitr/i, icon: Moon },
  { match: /adha/i, icon: MoonStar },
  { match: /ashura/i, icon: Flame },
  { match: /milad/i, icon: Star },
];

function holidayIcon(holiday: SchoolHoliday): LucideIcon {
  const key = `${holiday.code || ""} ${holiday.name || ""} ${holiday.shortName || ""}`;
  const found = HOLIDAY_ICONS.find((row) => row.match.test(key));
  if (found) return found.icon;
  if (holiday.category === "vacation") return Palmtree;
  if (holiday.category === "islamic") return Moon;
  if (holiday.category === "government") return Building2;
  return Flag;
}

function HolidayGlyph({ holiday, className }: { holiday: SchoolHoliday; className?: string }) {
  const Icon = holidayIcon(holiday);
  return (
    <span
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
        tone(holiday).badge,
        className,
      )}
      title={holiday.name}
    >
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}

const HOLIDAY_TONES: { match: RegExp; cell: string; badge: string }[] = [
  { match: /kashmir/i, cell: "bg-rose-100 text-rose-900 ring-rose-200", badge: "bg-rose-100 text-rose-800" },
  { match: /pakistan/i, cell: "bg-emerald-100 text-emerald-900 ring-emerald-200", badge: "bg-emerald-100 text-emerald-800" },
  { match: /labour|labor/i, cell: "bg-amber-100 text-amber-900 ring-amber-200", badge: "bg-amber-100 text-amber-800" },
  { match: /takbeer/i, cell: "bg-orange-100 text-orange-900 ring-orange-200", badge: "bg-orange-100 text-orange-800" },
  { match: /independence/i, cell: "bg-lime-100 text-lime-900 ring-lime-200", badge: "bg-lime-100 text-lime-800" },
  { match: /iqbal/i, cell: "bg-teal-100 text-teal-900 ring-teal-200", badge: "bg-teal-100 text-teal-800" },
  { match: /quaid/i, cell: "bg-green-100 text-green-900 ring-green-200", badge: "bg-green-100 text-green-800" },
  { match: /fitr/i, cell: "bg-yellow-100 text-yellow-900 ring-yellow-200", badge: "bg-yellow-100 text-yellow-800" },
  { match: /adha/i, cell: "bg-fuchsia-100 text-fuchsia-900 ring-fuchsia-200", badge: "bg-fuchsia-100 text-fuchsia-800" },
  { match: /ashura/i, cell: "bg-red-100 text-red-900 ring-red-200", badge: "bg-red-100 text-red-800" },
  { match: /milad/i, cell: "bg-violet-100 text-violet-900 ring-violet-200", badge: "bg-violet-100 text-violet-800" },
];

const FALLBACK_TONES = [
  { cell: "bg-pink-100 text-pink-900 ring-pink-200", badge: "bg-pink-100 text-pink-800" },
  { cell: "bg-cyan-100 text-cyan-900 ring-cyan-200", badge: "bg-cyan-100 text-cyan-800" },
  { cell: "bg-indigo-100 text-indigo-900 ring-indigo-200", badge: "bg-indigo-100 text-indigo-800" },
  { cell: "bg-stone-100 text-stone-800 ring-stone-200", badge: "bg-stone-100 text-stone-700" },
];

function holidayKey(holiday: SchoolHoliday) {
  return `${holiday.code || ""} ${holiday.name || ""} ${holiday.shortName || ""}`;
}

function tone(holiday: SchoolHoliday) {
  const key = holidayKey(holiday);
  const named = HOLIDAY_TONES.find((row) => row.match.test(key));
  if (named) return { cell: named.cell, badge: named.badge };
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_TONES[hash % FALLBACK_TONES.length];
}

export default function HolidaysCalendarModule({ caps }: { caps: ModuleActionCaps }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const today = localTodayYmd();
  const canEdit = caps.canCreate || caps.canEdit;
  const { apiSessionId, isAll, selected } = usePanelSession();
  const workingDays = useMemo(() => normalizeWorkingDays(selected?.workingDays), [selected?.workingDays]);
  const activeId = apiSessionId || "";
  const [typeFilter, setTypeFilter] = useState<"" | HolidayCategory>("");
  const [statusFilter, setStatusFilter] = useState<"" | HolidayStatus>("");
  const [cursor, setCursor] = useState(() => {
    const [y, m] = today.split("-").map(Number);
    return new Date(y, (m || 1) - 1, 1);
  });
  const [editor, setEditor] = useState<null | { id?: string; draft: Draft }>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["session-holidays", activeId],
    queryFn: () => fetchSessionHolidays(activeId),
    enabled: Boolean(activeId),
  });

  const holidays = data?.holidays || [];
  const counts = data?.counts || { total: 0, confirmed: 0, pending: 0, vacations: 0 };
  const vacationNames = holidays.filter((h) => h.category === "vacation").map((h) => h.name);
  const holidaysByFilter = useMemo(() => {
    return holidays.filter((holiday) => {
      if (typeFilter && holiday.category !== typeFilter) return false;
      if (statusFilter && holiday.status !== statusFilter) return false;
      return true;
    });
  }, [holidays, typeFilter, statusFilter]);
  const { search, setSearch, filtered: holidaysFiltered } = usePanelListSearch(holidaysByFilter, (holiday) => [
    holiday.name,
    holiday.shortName,
    holiday.category,
    typeLabel(holiday.category),
    holiday.status,
    holiday.startDate,
    holiday.endDate,
    appliesLabel(holiday.appliesTo),
    holiday.notes,
  ]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["session-holidays", activeId] });

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!editor) return;
      const body = editor.draft;
      if (editor.id) return updateHoliday(editor.id, body);
      return createHoliday(activeId, body);
    },
    onSuccess: (result) => {
      const cleared = result?.cleared;
      const removed = (cleared?.students || 0) + (cleared?.staff || 0);
      toast({
        title: editor?.id ? "Holiday updated" : "Holiday added",
        description: removed ? `Removed ${removed} automatic absent mark${removed === 1 ? "" : "s"}.` : undefined,
      });
      setEditor(null);
      invalidate();
    },
    onError: (e: Error) => toast({ title: "Could not save holiday", description: e.message, variant: "destructive" }),
  });

  const approveMut = useMutation({
    mutationFn: (id: string) => approveHoliday(id),
    onSuccess: (result) => {
      const removed = (result.cleared?.students || 0) + (result.cleared?.staff || 0);
      toast({
        title: "Holiday confirmed",
        description: removed
          ? `Attendance will skip this date. Removed ${removed} automatic absent mark${removed === 1 ? "" : "s"}.`
          : "Attendance will skip this date for the selected people.",
      });
      invalidate();
    },
    onError: (e: Error) => toast({ title: "Could not confirm", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteHoliday(id),
    onSuccess: () => {
      toast({ title: "Holiday removed" });
      setRemoveId(null);
      invalidate();
    },
    onError: (e: Error) => toast({ title: "Could not delete", description: e.message, variant: "destructive" }),
  });

  const year = cursor.getFullYear();
  const monthIndex = cursor.getMonth();
  const cells = calendarCells(year, monthIndex);
  const goToday = () => {
    const [y, m] = today.split("-").map(Number);
    setCursor(new Date(y, (m || 1) - 1, 1));
  };

  const upcoming = holidaysFiltered
    .filter((h) => h.endDate >= today)
    .slice(0, 4);

  const openCreate = () => setEditor({ draft: emptyDraft(today) });
  const openEdit = (holiday: SchoolHoliday) =>
    setEditor({
      id: holiday._id,
      draft: {
        name: holiday.name,
        category: holiday.category,
        startDate: holiday.startDate,
        endDate: holiday.endDate,
        status: holiday.status,
        appliesTo: { ...EMPTY_APPLIES, ...holiday.appliesTo },
        notes: holiday.notes || "",
      },
    });

  return (
    <div className="min-h-full space-y-4 bg-white px-4 py-6 sm:px-6 lg:px-8">
      <div className="rounded-xl border-0 bg-white px-4 py-3 shadow-sm ring-1 ring-black/[0.04] sm:px-5 sm:py-3.5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
              <CalendarDays className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold leading-tight tracking-tight text-[#1a2b4b] sm:text-xl">
                Holidays
              </h2>
              <p className="mt-0.5 max-w-xl text-xs leading-snug text-slate-500 sm:text-sm">
                Manage public holidays, Islamic dates, and school vacations for this session.
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<CalendarDays className="h-5 w-5 text-slate-600" />}
          iconClass="bg-gray-100"
          label="Total Holidays"
          value={counts.total}
          hint="On this calendar"
        />
        <StatCard
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
          iconClass="bg-emerald-100"
          label="Confirmed"
          value={counts.confirmed}
          hint="Approved by Admin"
        />
        <StatCard
          icon={<Clock3 className="h-5 w-5 text-orange-500" />}
          iconClass="bg-orange-100"
          label="Pending Review"
          value={counts.pending}
          hint="Requires Confirmation"
        />
        <StatCard
          icon={<CalendarRange className="h-5 w-5 text-violet-600" />}
          iconClass="bg-violet-100"
          label="School Vacations"
          value={counts.vacations}
          hint={vacationNames.length ? vacationNames.join(" + ") : "Add summer or winter break"}
        />
      </div>

      <Card className="p-3 sm:p-4 shadow-sm border-border/80">
        <FilterToolbar>
          <select
            className="h-10 w-[10rem] shrink-0 rounded-md border border-input bg-background px-3 text-sm"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as "" | HolidayCategory)}
            aria-label="Holiday type filter"
          >
            <option value="">All Types</option>
            <option value="public">Public</option>
            <option value="islamic">Islamic</option>
            <option value="government">Government</option>
            <option value="vacation">School vacation</option>
          </select>
          <select
            className="h-10 w-[10rem] shrink-0 rounded-md border border-input bg-background px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | HolidayStatus)}
            aria-label="Holiday status filter"
          >
            <option value="">All Statuses</option>
            <option value="approved">Confirmed</option>
            <option value="pending">Pending</option>
          </select>
          <PanelSearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search holidays…"
            className="min-w-[12rem] max-w-md flex-1"
          />
          {canEdit && (
            <FilterToolbarActions>
              <Button className="h-10 gap-1.5" onClick={openCreate} disabled={!activeId}>
                <Plus className="h-4 w-4" />
                Add Holiday
              </Button>
            </FilterToolbarActions>
          )}
        </FilterToolbar>
      </Card>

      {isAll && (
        <p className="text-sm text-muted-foreground">Select an academic session to view holidays.</p>
      )}

      <div className="grid items-stretch gap-4 xl:grid-cols-[32rem_minmax(0,1fr)]">
        <Card className="flex h-full flex-col rounded-2xl border-slate-200/80 p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                <CalendarDays className="h-4 w-4" />
              </span>
              <h3 className="truncate text-sm font-semibold text-[#1a2b4b] sm:text-base">
                Academic Calendar – {year}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-lg border border-slate-200 bg-white">
                <button
                  type="button"
                  className="rounded-l-lg p-1.5 text-slate-500 hover:bg-slate-50"
                  onClick={() => setCursor(new Date(year, monthIndex - 1, 1))}
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-[7.25rem] px-1 text-center text-sm font-medium text-[#1a2b4b]">
                  {MONTHS_LONG[monthIndex]} {year}
                </span>
                <button
                  type="button"
                  className="rounded-r-lg p-1.5 text-slate-500 hover:bg-slate-50"
                  onClick={() => setCursor(new Date(year, monthIndex + 1, 1))}
                  aria-label="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                className="h-8 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
                onClick={goToday}
              >
                Today
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 text-center text-xs font-medium text-slate-400">
            {WEEKDAYS.map((day) => (
              <div key={day} className="py-1.5">{day}</div>
            ))}
          </div>
          <div className="grid flex-1 grid-cols-7 gap-1">
            {cells.map((cell) => {
              const dayHolidays = cell.outside ? [] : holidaysFiltered.filter((h) => covers(h, cell.ymd));
              const primary = dayHolidays[0];
              const weekday = WEEKDAY_KEYS[new Date(`${cell.ymd}T00:00:00Z`).getUTCDay()];
              const weeklyOff = !cell.outside && !primary && !workingDays.includes(weekday);
              const isToday = cell.ymd === today;
              const label = primary
                ? calendarLabel(primary) + (dayHolidays.length > 1 ? ` +${dayHolidays.length - 1}` : "")
                : weeklyOff
                  ? "Weekly Off"
                  : "";
              const DayIcon = primary ? holidayIcon(primary) : weeklyOff ? Sun : null;
              return (
                <div
                  key={cell.ymd}
                  title={label || undefined}
                  className={cn(
                    "flex min-h-[4.25rem] flex-col items-center justify-center rounded-lg px-0.5 py-1 text-center",
                    cell.outside && "text-slate-300",
                    !cell.outside && !primary && !weeklyOff && "text-slate-700",
                    primary?.category === "vacation" && "bg-violet-100 text-violet-800",
                    primary && primary.category !== "vacation" && primary.category !== "government" && "bg-emerald-100 text-emerald-800",
                    primary?.category === "government" && "bg-orange-100 text-orange-800",
                    weeklyOff && "bg-sky-100 text-sky-700",
                    isToday && "ring-1 ring-sky-400",
                  )}
                >
                  <span className="text-sm font-semibold leading-none">{cell.day}</span>
                  {DayIcon && <DayIcon className="mt-1 h-3.5 w-3.5" />}
                  {label && (
                    <span className="mt-0.5 line-clamp-2 text-[10px] font-medium leading-tight">{label}</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Holiday</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-violet-500" /> Vacation</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-orange-400" /> Event</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-400" /> Weekly Off</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-300" /> Regular Day</span>
          </div>
        </Card>

        <div className="relative h-full min-h-[24rem]">
        <Card className="absolute inset-0 flex flex-col overflow-hidden rounded-2xl border-slate-200/80 shadow-sm">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
            <h3 className="font-display text-lg font-semibold text-[#1a2b4b]">Holiday Management</h3>
            <span className="text-sm text-muted-foreground">
              {holidaysFiltered.length}
              {holidaysFiltered.length !== holidays.length ? ` of ${holidays.length}` : ""}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 text-left text-xs font-semibold text-slate-500">
                <tr>
                  <th className="whitespace-nowrap bg-gray-50 px-3 py-2.5">Date</th>
                  <th className="whitespace-nowrap bg-gray-50 px-3 py-2.5">Day</th>
                  <th className="bg-gray-50 px-3 py-2.5">Holiday</th>
                  <th className="whitespace-nowrap bg-gray-50 px-3 py-2.5">Type</th>
                  <th className="whitespace-nowrap bg-gray-50 px-3 py-2.5">Applies</th>
                  <th className="whitespace-nowrap bg-gray-50 px-3 py-2.5">Status</th>
                  {canEdit && <th className="whitespace-nowrap bg-gray-50 px-3 py-2.5 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Loading holidays…</td>
                  </tr>
                )}
                {isError && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-destructive">
                      {(error as Error).message}
                    </td>
                  </tr>
                )}
                {!isLoading && !isError && holidaysFiltered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      {holidays.length === 0 ? "No holidays for this session yet." : "No holidays match your filters."}
                    </td>
                  </tr>
                )}
                {holidaysFiltered.map((holiday) => (
                  <tr key={holiday._id}>
                    <td className="whitespace-nowrap border-t border-slate-100 px-3 py-2.5 font-medium leading-snug text-[#1a2b4b]">
                      {holiday.startDate === holiday.endDate ? (
                        formatLong(holiday.startDate)
                      ) : (
                        <>
                          <span className="block">{formatLong(holiday.startDate)}</span>
                          <span className="block">{formatLong(holiday.endDate)}</span>
                        </>
                      )}
                    </td>
                    <td className="whitespace-nowrap border-t border-slate-100 px-3 py-2.5 text-slate-500">{weekdayLong(holiday.startDate)}</td>
                    <td className="whitespace-nowrap border-t border-slate-100 px-3 py-2.5 font-medium text-[#1a2b4b]">
                      <span className="inline-flex items-center gap-2">
                        <HolidayGlyph holiday={holiday} className="h-6 w-6 rounded-md" />
                        {holiday.name}
                      </span>
                    </td>
                    <td className="whitespace-nowrap border-t border-slate-100 px-3 py-2.5">
                      <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", tone(holiday).badge)}>
                        {typeLabel(holiday.category)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap border-t border-slate-100 px-3 py-2.5 text-slate-600">{appliesLabel(holiday.appliesTo)}</td>
                    <td className="whitespace-nowrap border-t border-slate-100 px-3 py-2.5">
                      {holiday.status === "approved" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Confirmed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-700">
                          <Clock3 className="h-3.5 w-3.5" />
                          Pending
                        </span>
                      )}
                    </td>
                    {canEdit && (
                      <td className="whitespace-nowrap border-t border-slate-100 px-3 py-2.5 text-right">
                        <div className="inline-flex justify-end">
                          {holiday.status === "pending" && (
                            <button
                              type="button"
                              className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50"
                              title="Confirm holiday"
                              onClick={() => approveMut.mutate(holiday._id)}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                            title="Edit holiday"
                            onClick={() => openEdit(holiday)}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50"
                            title="Delete holiday"
                            onClick={() => setRemoveId(holiday._id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-2xl border-amber-100 bg-amber-50/70 p-5 shadow-sm">
          <h3 className="font-display text-base font-semibold text-[#1a2b4b]">Upcoming Holidays</h3>
          <ul className="mt-4 space-y-3">
            {upcoming.length === 0 && <li className="text-sm text-slate-500">No upcoming holidays in this session.</li>}
            {upcoming.map((holiday) => (
              <li key={holiday._id} className="flex items-start gap-3 text-sm">
                <HolidayGlyph holiday={holiday} className="mt-0.5" />
                <span>
                  <span className="block font-semibold text-[#1a2b4b]">{formatLong(holiday.startDate)}</span>
                  <span className="text-slate-600">
                    {holiday.name}
                    {holiday.status === "pending" ? " (Expected)" : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="rounded-2xl border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-display text-base font-semibold text-[#1a2b4b]">How It Works</h3>
          <ol className="mt-4 space-y-2 text-sm text-slate-600">
            <li>1. The system pre-fills Pakistan’s fixed public holidays for the session.</li>
            <li>2. Fixed holidays are confirmed automatically.</li>
            <li>3. Islamic holidays are saved as estimates and stay pending.</li>
            <li>4. An admin reviews the dates and confirms them. Only confirmed holidays affect attendance.</li>
          </ol>
        </Card>

        <Card className="rounded-2xl border-emerald-100 bg-emerald-50/80 p-5 shadow-sm">
          <h3 className="flex items-center gap-2 font-display text-base font-semibold text-[#1a2b4b]">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Attendance Protection
          </h3>
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            <li>Confirmed holiday days are skipped in attendance.</li>
            <li>No automatic absent marking for students, teachers, or staff.</li>
            <li>Pending estimates do not change attendance until you confirm them.</li>
          </ul>
        </Card>
      </div>

      <Dialog open={Boolean(editor)} onOpenChange={(open) => !open && setEditor(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editor?.id ? "Edit holiday" : "Add holiday"}</DialogTitle>
          </DialogHeader>
          {editor && (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="holiday-name">Name</Label>
                <Input
                  id="holiday-name"
                  value={editor.draft.name}
                  onChange={(e) => setEditor({ ...editor, draft: { ...editor.draft, name: e.target.value } })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="holiday-start">Start date</Label>
                  <Input
                    id="holiday-start"
                    type="date"
                    value={editor.draft.startDate}
                    onChange={(e) => setEditor({ ...editor, draft: { ...editor.draft, startDate: e.target.value } })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="holiday-end">End date</Label>
                  <Input
                    id="holiday-end"
                    type="date"
                    value={editor.draft.endDate}
                    onChange={(e) => setEditor({ ...editor, draft: { ...editor.draft, endDate: e.target.value } })}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="holiday-type">Type</Label>
                  <select
                    id="holiday-type"
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={editor.draft.category}
                    onChange={(e) =>
                      setEditor({ ...editor, draft: { ...editor.draft, category: e.target.value as HolidayCategory } })
                    }
                  >
                    <option value="public">Public</option>
                    <option value="islamic">Islamic</option>
                    <option value="government">Government</option>
                    <option value="vacation">School vacation</option>
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="holiday-status">Status</Label>
                  <select
                    id="holiday-status"
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={editor.draft.status}
                    onChange={(e) =>
                      setEditor({ ...editor, draft: { ...editor.draft, status: e.target.value as HolidayStatus } })
                    }
                  >
                    <option value="approved">Confirmed</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>
              </div>
              <fieldset className="grid gap-2">
                <legend className="text-sm font-medium">Applies to</legend>
                {([
                  ["students", "Students"],
                  ["teachers", "Teachers"],
                  ["staff", "Other staff"],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-slate-700">
                    <Checkbox
                      checked={editor.draft.appliesTo[key]}
                      onCheckedChange={(checked) =>
                        setEditor({
                          ...editor,
                          draft: {
                            ...editor.draft,
                            appliesTo: { ...editor.draft.appliesTo, [key]: checked === true },
                          },
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
              <div className="grid gap-1.5">
                <Label htmlFor="holiday-notes">Notes</Label>
                <Input
                  id="holiday-notes"
                  value={editor.draft.notes}
                  onChange={(e) => setEditor({ ...editor, draft: { ...editor.draft, notes: e.target.value } })}
                  placeholder="Optional"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditor(null)}>Cancel</Button>
            <Button
              disabled={saveMut.isPending || !editor?.draft.name.trim()}
              onClick={() => saveMut.mutate()}
            >
              {saveMut.isPending ? "Saving…" : editor?.draft.status === "approved" ? "Save and confirm" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(removeId)} onOpenChange={(open) => !open && setRemoveId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove this holiday?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The date becomes a normal school day again. People who were expected and had no attendance can show as absent.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteMut.isPending || !removeId}
              onClick={() => removeId && deleteMut.mutate(removeId)}
            >
              {deleteMut.isPending ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  icon,
  iconClass,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  iconClass: string;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <Card className="flex items-center gap-3 rounded-2xl border-slate-200/80 p-4 shadow-sm">
      <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl", iconClass)}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="text-2xl font-semibold leading-tight text-[#1a2b4b]">{value}</p>
        <p className="truncate text-xs text-slate-400">{hint}</p>
      </div>
    </Card>
  );
}
