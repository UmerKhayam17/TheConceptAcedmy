import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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
  EXTRA_CLASS_REASON_LABELS,
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
import { formatWallClockRange } from "@/lib/utils";

const selectClass =
  "h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950";

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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add extra class</DialogTitle>
          <DialogDescription className="space-y-1">
            <span className="block">
              {teacherName ? (
                <>
                  <span className="font-medium text-foreground">{teacherName}</span>
                  {" · "}
                </>
              ) : null}
              {formatLongDate(date)}
            </span>
            <span className="block">
              Record a class taken outside the published timetable. This entry applies to the selected
              date only.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {!fixedTeacherId && (
            <div>
              <Label className="mb-1 block text-xs text-slate-500">Teacher</Label>
              <select className={selectClass} value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                <option value="">Select teacher</option>
                {teachers
                  .filter((t) => String(t._id) !== String(lockedUserId || ""))
                  .map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1 block text-xs text-slate-500">Class</Label>
              <select
                className={selectClass}
                value={classId}
                onChange={(e) => {
                  setClassId(e.target.value);
                  setSectionId("");
                  setSubjectId("");
                }}
              >
                <option value="">Select class</option>
                {classes.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.className}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="mb-1 block text-xs text-slate-500">Section</Label>
              <select
                className={selectClass}
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
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1 block text-xs text-slate-500">Subject</Label>
              <select
                className={selectClass}
                value={subjectId}
                disabled={!classId}
                onChange={(e) => setSubjectId(e.target.value)}
              >
                <option value="">Select subject</option>
                {subjects.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.subjectName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="mb-1 block text-xs text-slate-500">Period</Label>
              <select
                className={selectClass}
                value={periodId}
                disabled={!classId || periodsLoading}
                onChange={(e) => setPeriodId(e.target.value)}
              >
                <option value="">
                  {!classId ? "Select class first" : periodsLoading ? "Loading…" : "Select period"}
                </option>
                {periods.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.label} ({formatWallClockRange(p.startTime, p.endTime, "–")})
                  </option>
                ))}
              </select>
              {classId && !periodsLoading && periods.length === 0 ? (
                <p className="mt-1 text-xs text-destructive">
                  No periods configured. Add them in Timetable configuration first.
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <Label className="mb-1 block text-xs text-slate-500">Reason</Label>
            <select
              className={selectClass}
              value={reason}
              onChange={(e) => setReason(e.target.value as ExtraClassReason)}
            >
              {(Object.keys(EXTRA_CLASS_REASON_LABELS) as ExtraClassReason[]).map((r) => (
                <option key={r} value={r}>
                  {EXTRA_CLASS_REASON_LABELS[r]}
                </option>
              ))}
            </select>
          </div>

          {reason === "cover" && (
            <div>
              <Label className="mb-1 block text-xs text-slate-500">Covering for</Label>
              <select className={selectClass} value={coveringFor} onChange={(e) => setCoveringFor(e.target.value)}>
                <option value="">Select teacher</option>
                {teachers
                  .filter((t) => String(t._id) !== String(effectiveTeacherId))
                  .map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </div>
          )}

          <div>
            <Label className="mb-1 block text-xs text-slate-500">Note (optional)</Label>
            <Textarea
              value={note}
              maxLength={300}
              rows={2}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Revision before exams"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!canSave || saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
