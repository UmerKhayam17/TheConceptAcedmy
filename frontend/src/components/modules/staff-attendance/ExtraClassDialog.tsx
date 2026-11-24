import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarPlus,
  Loader2,
  Plus,
  RefreshCcw,
  UserRoundCheck,
  BookOpenCheck,
  type LucideIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createStaffExtraClass,
  fetchExtraClassPeriods,
  type ExtraClassReason,
} from "@/lib/aiAttendanceApi";
import {
  fetchAcademyClasses,
  fetchSectionsByClass,
  fetchSubjectsByClass,
} from "@/lib/studentManagementApi";
import { fetchStaffUsers, type StaffUser } from "@/lib/staffApi";
import { useToast } from "@/hooks/use-toast";
import { cn, formatWallClockRange } from "@/lib/utils";

// Modal styling — same as the Loan / Advance and Student Fee Details modals.
const formLabelClass = "text-sm font-medium text-muted-foreground";
const formControlClass =
  "h-10 min-w-0 rounded-md border-input bg-background text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0";
const formSelectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-70";
const sectionTitleClass = "text-sm font-semibold text-primary";
const sectionCardClass = "rounded-md border bg-background p-4 space-y-4";
const cancelBtnClass =
  "h-10 w-full gap-2 border-primary text-primary hover:bg-primary/5 hover:text-primary sm:w-auto";
const primaryBtnClass = "h-10 w-full gap-2 sm:w-auto";
const dialogShellClass = cn(
  "flex w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:w-full sm:p-0 max-h-[94dvh] sm:max-w-[38rem]",
  "[&>button]:right-5 [&>button]:top-5 [&>button]:text-primary-foreground [&>button]:opacity-100 [&>button]:hover:text-primary-foreground",
);

const REASONS: { value: ExtraClassReason; label: string; hint: string; icon: LucideIcon }[] = [
  { value: "extra", label: "Extra class", hint: "Additional class outside the timetable", icon: BookOpenCheck },
  { value: "makeup", label: "Make-up class", hint: "Replaces a class that was missed", icon: RefreshCcw },
  { value: "cover", label: "Cover", hint: "Taking the class of an absent teacher", icon: UserRoundCheck },
];

/** "2026-11-24" → "Tuesday, 24 November 2026" (falls back to the raw value). */
function formatLongDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function isTeacherUser(u: StaffUser) {
  const role = typeof u.role === "object" && u.role ? u.role.name : u.role;
  return role === "teacher" && u.isActive !== false;
}

function FormField({
  label,
  className,
  hint,
  children,
}: {
  label: string;
  className?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <Label className={formLabelClass}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * Add a class a teacher takes on one date that is not on the timetable.
 * Period time is chosen from the timetable configuration (period template) of the section.
 */
export default function ExtraClassDialog({
  open,
  onOpenChange,
  sessionId,
  date,
  teacherId: fixedTeacherId,
  teacherName,
  lockedUserId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  date: string;
  /** Set when opened from a teacher's row; otherwise a teacher picker is shown. */
  teacherId?: string;
  teacherName?: string;
  /** The viewer: they cannot add an extra class for themselves. */
  lockedUserId?: string;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [teacherId, setTeacherId] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [reason, setReason] = useState<ExtraClassReason>("extra");
  const [coveringFor, setCoveringFor] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTeacherId(fixedTeacherId || "");
    setClassId("");
    setSectionId("");
    setSubjectId("");
    setPeriodId("");
    setReason("extra");
    setCoveringFor("");
    setNote("");
  }, [open, fixedTeacherId]);

  const { data: staff = [] } = useQuery({
    queryKey: ["staff-users", "extra-class"],
    queryFn: fetchStaffUsers,
    enabled: open,
  });
  const teachers = useMemo(
    () =>
      staff
        .filter(isTeacherUser)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [staff],
  );

  const { data: classes = [] } = useQuery({
    queryKey: ["academy-classes", sessionId, "extra-class"],
    queryFn: () => fetchAcademyClasses({ sessionId, status: "active" }),
    enabled: open && Boolean(sessionId),
  });

  const { data: sections = [] } = useQuery({
    queryKey: ["academy-sections", classId],
    queryFn: () => fetchSectionsByClass(classId, { status: "active" }),
    enabled: open && Boolean(classId),
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ["academy-subjects", classId, sectionId || "", ""],
    queryFn: () =>
      fetchSubjectsByClass(classId, { status: "active", sectionId: sectionId || undefined }),
    enabled: open && Boolean(classId),
  });

  const { data: periodData, isLoading: periodsLoading } = useQuery({
    queryKey: ["extra-class-periods", sessionId, sectionId],
    queryFn: () => fetchExtraClassPeriods(sessionId, sectionId || undefined),
    enabled: open && Boolean(sessionId) && Boolean(classId),
  });
  const periods = periodData?.periods || [];

  // The configuration can change with the section, so drop a period that no longer exists.
  useEffect(() => {
    if (periodId && !periods.some((p) => p._id === periodId)) setPeriodId("");
  }, [periods, periodId]);

  const effectiveTeacherId = fixedTeacherId || teacherId;
  const canSave = Boolean(
    effectiveTeacherId && classId && subjectId && periodId && (reason !== "cover" || coveringFor),
  );

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await createStaffExtraClass({
        sessionId,
        date,
        userId: effectiveTeacherId,
        classId,
        sectionId: sectionId || undefined,
        subjectId,
        periodId,
        reason,
        coveringFor: reason === "cover" ? coveringFor : undefined,
        note: note.trim() || undefined,
      });
      toast({ title: "Extra class added", description: "Mark its attendance in the teacher's row." });
      onCreated();
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Could not add extra class",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogShellClass}>
        <DialogHeader className="shrink-0 space-y-1 bg-primary px-6 py-4 pr-12 text-left text-primary-foreground">
          <DialogTitle className="flex items-center gap-3 text-xl font-semibold text-primary-foreground">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-foreground/15">
              <CalendarPlus className="h-5 w-5" />
            </span>
            Add extra class
          </DialogTitle>
          <DialogDescription className="space-y-0.5 pl-12 text-primary-foreground/80">
            <span className="block font-medium text-primary-foreground">
              {teacherName ? `${teacherName} · ` : ""}
              {formatLongDate(date)}
            </span>
            <span className="block">
              Record a class taken outside the published timetable. This entry applies to the
              selected date only.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/30 px-5 py-4">
          <div className="space-y-4">
            <section className={sectionCardClass}>
              <p className={sectionTitleClass}>Reason</p>
              <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-3">
                {REASONS.map((r) => {
                  const Icon = r.icon;
                  const on = reason === r.value;
                  return (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setReason(r.value)}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-primary/30 bg-background text-primary hover:bg-primary/5",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                          on ? "bg-primary-foreground/15 text-primary-foreground" : "bg-primary/10 text-primary",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{r.label}</span>
                        <span
                          className={cn(
                            "block text-xs leading-snug",
                            on ? "text-primary-foreground/80" : "text-muted-foreground",
                          )}
                        >
                          {r.hint}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className={sectionCardClass}>
              <p className={sectionTitleClass}>Class details</p>
              <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2">
                {!fixedTeacherId ? (
                  <FormField label="Teacher" className="min-[480px]:col-span-2">
                    <select
                      className={formSelectClass}
                      value={teacherId}
                      onChange={(e) => setTeacherId(e.target.value)}
                    >
                      <option value="">Select teacher…</option>
                      {teachers
                        .filter((t) => String(t._id) !== String(lockedUserId || ""))
                        .map((t) => (
                          <option key={t._id} value={t._id}>
                            {t.name}
                          </option>
                        ))}
                    </select>
                  </FormField>
                ) : null}
                <FormField label="Class">
                  <select
                    className={formSelectClass}
                    value={classId}
                    onChange={(e) => {
                      setClassId(e.target.value);
                      setSectionId("");
                      setSubjectId("");
                    }}
                  >
                    <option value="">Select class…</option>
                    {classes.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.className}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Section">
                  <select
                    className={formSelectClass}
                    value={sectionId}
                    disabled={!classId}
                    onChange={(e) => {
                      setSectionId(e.target.value);
                      setSubjectId("");
                    }}
                  >
                    <option value="">{classId ? "All sections" : "Select class first"}</option>
                    {sections.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.sectionName}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Subject">
                  <select
                    className={formSelectClass}
                    value={subjectId}
                    disabled={!classId}
                    onChange={(e) => setSubjectId(e.target.value)}
                  >
                    <option value="">{classId ? "Select subject…" : "Select class first"}</option>
                    {subjects.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.subjectName}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField
                  label="Period"
                  hint={
                    classId && !periodsLoading && periods.length === 0 ? (
                      <span className="text-destructive">
                        No periods configured. Add them in Timetable configuration first.
                      </span>
                    ) : (
                      "Time comes from the timetable configuration."
                    )
                  }
                >
                  <select
                    className={formSelectClass}
                    value={periodId}
                    disabled={!classId || periodsLoading}
                    onChange={(e) => setPeriodId(e.target.value)}
                  >
                    <option value="">
                      {!classId ? "Select class first" : periodsLoading ? "Loading…" : "Select period…"}
                    </option>
                    {periods.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.label} ({formatWallClockRange(p.startTime, p.endTime, "–")})
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>
            </section>

            <section className={sectionCardClass}>
              <p className={sectionTitleClass}>{reason === "cover" ? "Cover & notes" : "Notes"}</p>
              <div className="grid grid-cols-1 gap-4">
                {reason === "cover" ? (
                  <FormField label="Covering for">
                    <select
                      className={formSelectClass}
                      value={coveringFor}
                      onChange={(e) => setCoveringFor(e.target.value)}
                    >
                      <option value="">Select absent teacher…</option>
                      {teachers
                        .filter((t) => String(t._id) !== String(effectiveTeacherId))
                        .map((t) => (
                          <option key={t._id} value={t._id}>
                            {t.name}
                          </option>
                        ))}
                    </select>
                  </FormField>
                ) : null}
                <FormField label="Notes (optional)">
                  <Textarea
                    className={cn(formControlClass, "h-auto min-h-[4.5rem] py-2")}
                    value={note}
                    maxLength={300}
                    rows={2}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. Revision before exams, approved by…"
                  />
                </FormField>
              </div>
            </section>
          </div>
        </div>

        <DialogFooter className="shrink-0 flex-col gap-2 border-t bg-background px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:space-x-0">
          <Button
            type="button"
            variant="outline"
            className={cancelBtnClass}
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="button" className={primaryBtnClass} onClick={save} disabled={!canSave || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {saving ? "Saving…" : "Add extra class"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
