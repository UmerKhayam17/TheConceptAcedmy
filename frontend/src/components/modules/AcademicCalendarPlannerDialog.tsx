import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  createCalendarItems,
  fetchPlannerOptions,
  updateCalendarItem,
  type CalendarEvent,
  type CalendarItemType,
  type EventCategory,
} from "@/lib/academicCalendarApi";
import { createHoliday, type HolidayCategory } from "@/lib/holidayApi";
import { cn } from "@/lib/utils";

const WEEKDAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

type CreateKind = CalendarItemType | "holiday";
type BulkMode = "single" | "month" | "year";

export type PlannerSeed = {
  kind?: CreateKind;
  date?: string;
  /** Prefer bulk month / year when opening from those actions. */
  bulk?: BulkMode;
  /** When editing an existing calendar item (not holiday). */
  editEvent?: CalendarEvent;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  sessionStart: string;
  sessionEnd: string;
  workingDays: string[];
  canManageHolidays: boolean;
  seed: PlannerSeed | null;
  /** Visible month when using bulk-month (0-based month). */
  monthCursor: { y: number; m: number } | null;
};

const KIND_OPTIONS: { value: CreateKind; label: string; hint: string }[] = [
  { value: "lesson_plan", label: "Lesson plan", hint: "Staff only — parents never see these" },
  { value: "homework", label: "Homework", hint: "Parents of that class see it" },
  { value: "event", label: "School event", hint: "PTM, sports day, trip… parents see it" },
  { value: "holiday", label: "Holiday / vacation", hint: "Marks the school closed" },
];

const EVENT_CATS: { value: EventCategory; label: string }[] = [
  { value: "ptm", label: "PTM" },
  { value: "sports", label: "Sports" },
  { value: "function", label: "Function" },
  { value: "trip", label: "Trip" },
  { value: "meeting", label: "Meeting" },
  { value: "competition", label: "Competition" },
  { value: "other", label: "Other" },
];

function toUtc(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}
function fromUtc(ms: number) {
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
function addDays(ymd: string, n: number) {
  return fromUtc(toUtc(ymd) + n * 86400000);
}
function weekdayIdx(ymd: string) {
  return (new Date(toUtc(ymd)).getUTCDay() + 6) % 7;
}
function daysInMonth(year: number, month0: number) {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}
function ymdOf(year: number, month0: number, day: number) {
  return fromUtc(Date.UTC(year, month0, day));
}

function workingDatesInRange(
  start: string,
  end: string,
  working: Set<string>,
  sessionStart: string,
  sessionEnd: string,
) {
  const out: string[] = [];
  let d = start;
  for (let i = 0; i < 400 && d <= end; i += 1) {
    if (d >= sessionStart && d <= sessionEnd && working.has(WEEKDAY_KEYS[weekdayIdx(d)])) out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

type FormState = {
  kind: CreateKind;
  title: string;
  description: string;
  objectives: string;
  activities: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  eventCategory: EventCategory;
  classId: string;
  sectionId: string;
  subjectId: string;
  bulk: BulkMode;
  durationDays: number;
  holidayCategory: HolidayCategory;
};

function emptyForm(seed: PlannerSeed | null, today: string): FormState {
  const edit = seed?.editEvent;
  return {
    kind: (edit?.kind as CreateKind) || seed?.kind || "lesson_plan",
    title: edit?.title || "",
    description: edit?.description || "",
    objectives: edit?.objectives || "",
    activities: edit?.activities || "",
    startDate: edit?.startDate || seed?.date || today,
    endDate: edit?.endDate || seed?.date || today,
    startTime: edit?.startTime || "",
    endTime: edit?.endTime || "",
    eventCategory: (edit?.eventCategory as EventCategory) || "other",
    classId: edit?.classId || "",
    sectionId: edit?.sectionId || "",
    subjectId: edit?.subjectId || "",
    bulk: seed?.bulk || "single",
    durationDays: edit && edit.endDate > edit.startDate
      ? Math.max(0, Math.round((toUtc(edit.endDate) - toUtc(edit.startDate)) / 86400000))
      : 0,
    holidayCategory: "public",
  };
}

export default function AcademicCalendarPlannerDialog({
  open,
  onOpenChange,
  sessionId,
  sessionStart,
  sessionEnd,
  workingDays,
  canManageHolidays,
  seed,
  monthCursor,
}: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const today = sessionStart;
  const editing = Boolean(seed?.editEvent?.itemId);
  const [form, setForm] = useState<FormState>(() => emptyForm(seed, today));

  useEffect(() => {
    if (open) setForm(emptyForm(seed, seed?.date || sessionStart));
  }, [open, seed, sessionStart]);

  const { data: options } = useQuery({
    queryKey: ["academic-calendar-options", sessionId],
    queryFn: () => fetchPlannerOptions(sessionId),
    enabled: open && Boolean(sessionId),
  });

  const working = useMemo(() => new Set(workingDays), [workingDays]);
  const sections = (options?.sections || []).filter((s) => !form.classId || s.classId === form.classId);
  const subjects = (options?.subjects || []).filter((s) => !form.classId || s.classId === form.classId);

  const bulkDates = useMemo(() => {
    if (form.bulk === "single" || form.kind === "holiday" || editing) return [] as string[];
    if (form.bulk === "month" && monthCursor) {
      const start = ymdOf(monthCursor.y, monthCursor.m, 1);
      const end = ymdOf(monthCursor.y, monthCursor.m, daysInMonth(monthCursor.y, monthCursor.m));
      return workingDatesInRange(start, end, working, sessionStart, sessionEnd);
    }
    return workingDatesInRange(sessionStart, sessionEnd, working, sessionStart, sessionEnd);
  }, [form.bulk, form.kind, editing, monthCursor, working, sessionStart, sessionEnd]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const saveMut = useMutation({
    mutationFn: async () => {
      const title = form.title.trim();
      if (!title) throw new Error("Title is required");

      if (form.kind === "holiday") {
        if (!canManageHolidays) throw new Error("You cannot manage holidays");
        if (form.endDate < form.startDate) throw new Error("End date must be on or after the start date");
        return createHoliday(sessionId, {
          name: title,
          category: form.holidayCategory,
          startDate: form.startDate,
          endDate: form.endDate,
          status: "approved",
          notes: form.description.trim(),
          appliesTo: { students: true, teachers: true, staff: true },
        });
      }

      if ((form.kind === "lesson_plan" || form.kind === "homework") && !form.classId) {
        throw new Error("Choose a class");
      }

      const base = {
        sessionId,
        type: form.kind,
        title,
        description: form.description.trim(),
        objectives: form.objectives.trim(),
        activities: form.activities.trim(),
        startTime: form.startTime,
        endTime: form.endTime,
        eventCategory: form.kind === "event" ? form.eventCategory : undefined,
        classId: form.classId || null,
        sectionId: form.sectionId || null,
        subjectId: form.subjectId || null,
      };

      if (editing && seed?.editEvent?.itemId) {
        return updateCalendarItem(seed.editEvent.itemId, {
          ...base,
          startDate: form.startDate,
          endDate: form.endDate || form.startDate,
        });
      }

      if (form.bulk !== "single" && bulkDates.length) {
        return createCalendarItems({
          ...base,
          dates: bulkDates,
          durationDays: form.kind === "homework" ? form.durationDays : 0,
        });
      }

      return createCalendarItems({
        ...base,
        startDate: form.startDate,
        endDate: form.endDate || form.startDate,
      });
    },
    onSuccess: (data) => {
      const count = data && typeof data === "object" && "count" in data ? Number((data as { count: number }).count) : 1;
      toast({
        title: editing ? "Updated" : "Added to calendar",
        description: editing
          ? "Changes saved."
          : form.kind === "holiday"
            ? "Holiday added."
            : `${count} item${count === 1 ? "" : "s"} created.`,
      });
      void qc.invalidateQueries({ queryKey: ["academic-calendar"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Could not save", description: err.message, variant: "destructive" });
    },
  });

  const kindChoices = KIND_OPTIONS.filter((k) => k.value !== "holiday" || canManageHolidays);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit calendar item" : "Plan on the calendar"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update this lesson plan, homework or event."
              : "Add a lesson plan, homework, school event or holiday — one day, a full month, or the whole session."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {!editing && (
            <div className="grid grid-cols-2 gap-2">
              {kindChoices.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => set("kind", k.value)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left transition-colors",
                    form.kind === k.value
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-slate-200 hover:bg-slate-50",
                  )}
                >
                  <span className="block text-sm font-semibold text-[#1a2b4b]">{k.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{k.hint}</span>
                </button>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="cal-title">Title</Label>
            <Input
              id="cal-title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder={
                form.kind === "lesson_plan"
                  ? "e.g. Fractions — introduction"
                  : form.kind === "homework"
                    ? "e.g. Chapter 4 exercises"
                    : form.kind === "holiday"
                      ? "e.g. Eid-ul-Fitr"
                      : "e.g. Annual sports day"
              }
            />
          </div>

          {form.kind !== "holiday" && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Class {form.kind !== "event" ? "*" : "(optional)"}</Label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={form.classId}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, classId: e.target.value, sectionId: "", subjectId: "" }))
                    }
                  >
                    <option value="">{form.kind === "event" ? "Whole school" : "Select class"}</option>
                    {(options?.classes || []).map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.className}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Section</Label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={form.sectionId}
                    disabled={!sections.length}
                    onChange={(e) => set("sectionId", e.target.value)}
                  >
                    <option value="">All sections</option>
                    {sections.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.sectionName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Subject</Label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={form.subjectId}
                    disabled={!subjects.length}
                    onChange={(e) => set("subjectId", e.target.value)}
                  >
                    <option value="">Optional</option>
                    {subjects.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.subjectName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {form.kind === "event" && (
                <div className="space-y-1.5">
                  <Label>Event type</Label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={form.eventCategory}
                    onChange={(e) => set("eventCategory", e.target.value as EventCategory)}
                  >
                    {EVENT_CATS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {form.kind === "lesson_plan" && (
                <>
                  <div className="space-y-1.5">
                    <Label>Objectives</Label>
                    <Textarea
                      value={form.objectives}
                      onChange={(e) => set("objectives", e.target.value)}
                      rows={2}
                      placeholder="What students should learn"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Activities</Label>
                    <Textarea
                      value={form.activities}
                      onChange={(e) => set("activities", e.target.value)}
                      rows={2}
                      placeholder="Class activities / teaching steps"
                    />
                  </div>
                </>
              )}
            </>
          )}

          {form.kind === "holiday" && (
            <div className="space-y-1.5">
              <Label>Category</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.holidayCategory}
                onChange={(e) => set("holidayCategory", e.target.value as HolidayCategory)}
              >
                <option value="public">Public holiday</option>
                <option value="islamic">Islamic</option>
                <option value="government">Government</option>
                <option value="vacation">Vacation</option>
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Notes / description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
            />
          </div>

          {!editing && form.kind !== "holiday" && (
            <div className="space-y-2">
              <Label>When</Label>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["single", "One day / range"],
                    ["month", "Full month (working days)"],
                    ["year", "Full session (working days)"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => set("bulk", key)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium",
                      form.bulk === key
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {form.bulk !== "single" && (
                <p className="text-xs text-slate-500">
                  Will create <strong>{bulkDates.length}</strong> item
                  {bulkDates.length === 1 ? "" : "s"}
                  {form.bulk === "month" && monthCursor
                    ? ` for ${monthCursor.y}-${String(monthCursor.m + 1).padStart(2, "0")}`
                    : " across the session"}
                  {form.kind === "homework" ? " (due date = given date + days below)." : "."}
                </p>
              )}
            </div>
          )}

          {(form.bulk === "single" || form.kind === "holiday" || editing) && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cal-start">{form.kind === "homework" ? "Given on" : "Start date"}</Label>
                <Input
                  id="cal-start"
                  type="date"
                  value={form.startDate}
                  min={sessionStart}
                  max={sessionEnd}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm((f) => ({
                      ...f,
                      startDate: v,
                      endDate: f.endDate < v ? v : f.endDate,
                    }));
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cal-end">{form.kind === "homework" ? "Due date" : "End date"}</Label>
                <Input
                  id="cal-end"
                  type="date"
                  value={form.endDate}
                  min={form.startDate || sessionStart}
                  max={sessionEnd}
                  onChange={(e) => set("endDate", e.target.value)}
                />
              </div>
            </div>
          )}

          {form.kind === "homework" && form.bulk !== "single" && !editing && (
            <div className="space-y-1.5">
              <Label>Days until due (from each given date)</Label>
              <Input
                type="number"
                min={0}
                max={60}
                value={form.durationDays}
                onChange={(e) => set("durationDays", Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
          )}

          {form.kind !== "holiday" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Start time</Label>
                <Input type="time" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>End time</Label>
                <Input type="time" value={form.endTime} onChange={(e) => set("endTime", e.target.value)} />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saveMut.isPending}>
            Cancel
          </Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? "Saving…" : editing ? "Save changes" : "Add to calendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
