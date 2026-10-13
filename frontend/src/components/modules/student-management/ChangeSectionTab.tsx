import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  Clock,
  Eye,
  Filter,
  GraduationCap,
  Hash,
  Layers,
  Loader2,
  Search,
  UserRound,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { resolveUploadUrl } from "@/lib/api";
import type { ModuleActionCaps } from "@/lib/permissions";
import {
  changeStudentSection,
  fetchAcademyClasses,
  fetchAcademyStudents,
  fetchEnrollmentSubjects,
  fetchSectionsByClass,
  getAcademyStudent,
  type AcademyStudent,
  type AcademySubject,
} from "@/lib/studentManagementApi";
import ClassProgramSelect from "@/components/modules/ClassProgramSelect";
import { useSessionScope } from "@/components/modules/timetable/SessionBar";
import { classLabel, formatPkr, subjectList } from "./studentDisplayUtils";

const STEPS = [
  "Select Class",
  "Select Student",
  "Current Info",
  "Select New Section",
  "Check Subjects",
  "Confirm",
] as const;

function idOf(ref: string | { _id: string } | null | undefined): string {
  if (!ref) return "";
  return typeof ref === "object" ? ref._id : String(ref);
}

function sectionNameOf(s: AcademyStudent | null | undefined): string {
  if (!s?.sectionId) return "—";
  return typeof s.sectionId === "object" ? s.sectionId.sectionName || "—" : "—";
}

function subjectIdsOf(s: AcademyStudent | null | undefined): string[] {
  return (s?.selectedSubjects || []).map((x) => (typeof x === "string" ? x : x._id));
}

function rollOf(s: AcademyStudent) {
  return s.rollNumber || s.studentId || s.registrationNumber || "—";
}

function StudentAvatar({
  student,
  size = "md",
}: {
  student: Pick<AcademyStudent, "studentName" | "photoImage">;
  size?: "sm" | "md" | "lg";
}) {
  const src = student.photoImage ? resolveUploadUrl(student.photoImage) : null;
  const box = size === "lg" ? "h-14 w-14" : size === "sm" ? "h-9 w-9" : "h-11 w-11";
  const icon = size === "lg" ? "h-7 w-7" : size === "sm" ? "h-4 w-4" : "h-5 w-5";
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={cn(box, "rounded-full object-cover border border-border shrink-0")}
      />
    );
  }
  return (
    <div
      className={cn(
        box,
        "rounded-full bg-primary/10 text-primary grid place-items-center shrink-0",
      )}
    >
      <UserRound className={icon} />
    </div>
  );
}

function ActiveBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
      Active
    </span>
  );
}

function SubjectChecklist({
  coreSubjects,
  choiceGroups,
  sharedSubjects,
  streamSubjects,
  selectedSubjects,
  isFullPackage,
  onToggleFullPackage,
  onToggleSubject,
}: {
  coreSubjects: AcademySubject[];
  choiceGroups: { _id: string; groupName: string; pickCount: number; subjects: AcademySubject[] }[];
  sharedSubjects: AcademySubject[];
  streamSubjects: AcademySubject[];
  selectedSubjects: string[];
  isFullPackage: boolean;
  onToggleFullPackage: (checked: boolean) => void;
  onToggleSubject: (id: string, opts?: { keepFullPackage?: boolean }) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={isFullPackage}
          onChange={(e) => onToggleFullPackage(e.target.checked)}
        />
        Full package
      </label>
      <div className="space-y-1.5 max-h-56 overflow-y-auto rounded-md border p-2">
        {sharedSubjects.length > 0 || streamSubjects.length > 0 ? (
          <>
            {streamSubjects.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Stream</p>
                {streamSubjects.map((s) => (
                  <label key={s._id} className="flex items-center gap-2 text-sm py-0.5">
                    <input
                      type="checkbox"
                      checked={isFullPackage || selectedSubjects.includes(s._id)}
                      disabled={isFullPackage}
                      onChange={() => onToggleSubject(s._id)}
                    />
                    {s.subjectName}
                  </label>
                ))}
              </div>
            )}
            {sharedSubjects.length > 0 && (
              <div className={streamSubjects.length ? "pt-2 border-t" : ""}>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Shared</p>
                {sharedSubjects.map((s) => (
                  <label key={s._id} className="flex items-center gap-2 text-sm py-0.5">
                    <input
                      type="checkbox"
                      checked={isFullPackage || selectedSubjects.includes(s._id)}
                      disabled={isFullPackage}
                      onChange={() => onToggleSubject(s._id)}
                    />
                    {s.subjectName}
                  </label>
                ))}
              </div>
            )}
          </>
        ) : (
          coreSubjects.map((s) => (
            <label key={s._id} className="flex items-center gap-2 text-sm py-0.5">
              <input
                type="checkbox"
                checked={isFullPackage || selectedSubjects.includes(s._id)}
                disabled={isFullPackage}
                onChange={() => onToggleSubject(s._id)}
              />
              {s.subjectName}
            </label>
          ))
        )}
        {choiceGroups.map((g) => (
          <div key={g._id} className="pt-2 border-t">
            <p className="text-xs font-semibold text-muted-foreground mb-1">
              {g.groupName} (pick {g.pickCount})
            </p>
            {g.subjects.map((s) => (
              <label key={s._id} className="flex items-center gap-2 text-sm py-0.5">
                <input
                  type="checkbox"
                  checked={selectedSubjects.includes(s._id)}
                  onChange={() => onToggleSubject(s._id, { keepFullPackage: isFullPackage })}
                />
                {s.subjectName}
              </label>
            ))}
          </div>
        ))}
        {!coreSubjects.length && !choiceGroups.length ? (
          <p className="text-xs text-muted-foreground">No subjects for this section.</p>
        ) : null}
      </div>
    </div>
  );
}

export default function ChangeSectionTab({
  caps,
  sessionId,
}: {
  caps: ModuleActionCaps;
  sessionId: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { apiSessionId, writable, hasScope } = useSessionScope(sessionId);

  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [isFullPackage, setIsFullPackage] = useState(false);
  const [notes, setNotes] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [subjectsOpen, setSubjectsOpen] = useState(false);

  useEffect(() => {
    setClassId("");
    setStudentId("");
    setSectionId("");
    setSelectedSubjects([]);
    setIsFullPackage(false);
    setNotes("");
    setStudentSearch("");
    setSubjectsOpen(false);
  }, [sessionId]);

  useEffect(() => {
    setStudentId("");
    setSectionId("");
    setSelectedSubjects([]);
    setIsFullPackage(false);
    setNotes("");
    setStudentSearch("");
    setSubjectsOpen(false);
  }, [classId]);

  const { data: classes = [] } = useQuery({
    queryKey: ["academy-classes", sessionId, "change-section"],
    queryFn: () => fetchAcademyClasses({ status: "active", sessionId: apiSessionId }),
    enabled: hasScope,
  });

  const selectedClass = classes.find((c) => c._id === classId);

  const { data: studentsPage, isLoading: studentsLoading } = useQuery({
    queryKey: ["change-section-students", classId, studentSearch, apiSessionId],
    queryFn: () =>
      fetchAcademyStudents({
        classId,
        status: "active",
        search: studentSearch || undefined,
        sessionId: apiSessionId,
        limit: 100,
        page: 1,
      }),
    enabled: Boolean(classId),
  });
  const students = studentsPage?.students || [];

  const { data: student, isLoading: studentLoading } = useQuery({
    queryKey: ["change-section-student", studentId],
    queryFn: () => getAcademyStudent(studentId),
    enabled: Boolean(studentId),
  });

  const currentSectionId = idOf(student?.sectionId);

  useEffect(() => {
    if (!student) return;
    setIsFullPackage(Boolean(student.isFullPackage));
    setSelectedSubjects(subjectIdsOf(student));
    setSectionId("");
    setNotes("");
    setSubjectsOpen(false);
  }, [student?._id]);

  const { data: sections = [], isLoading: sectionsLoading } = useQuery({
    queryKey: ["change-section-sections", classId],
    queryFn: () => fetchSectionsByClass(classId, { status: "active" }),
    enabled: Boolean(classId),
  });

  const targetSections = useMemo(
    () => sections.filter((s) => s._id !== currentSectionId),
    [sections, currentSectionId],
  );

  const disciplineId = idOf(student?.disciplineId);

  const { data: layout, isLoading: layoutLoading } = useQuery({
    queryKey: ["change-section-subjects", classId, sectionId, disciplineId],
    queryFn: () => fetchEnrollmentSubjects(classId, sectionId, disciplineId || undefined),
    enabled: Boolean(classId && sectionId),
  });

  const coreSubjects = layout?.coreSubjects || [];
  const choiceGroups = layout?.choiceGroups || [];
  const sharedSubjects = layout?.sharedSubjects || [];
  const streamSubjects = layout?.streamSubjects || [];

  useEffect(() => {
    if (!layout || !student) return;
    const allowed = new Set([
      ...coreSubjects.map((s) => s._id),
      ...choiceGroups.flatMap((g) => g.subjects.map((s) => s._id)),
    ]);
    if (student.isFullPackage) {
      setIsFullPackage(true);
      setSelectedSubjects(coreSubjects.map((s) => s._id));
      return;
    }
    setIsFullPackage(false);
    setSelectedSubjects(subjectIdsOf(student).filter((id) => allowed.has(id)));
  }, [layout, sectionId, student]);

  const subjectsMayDiffer = useMemo(() => {
    if (!student || !sectionId || !layout) return false;
    const allowed = new Set([
      ...coreSubjects.map((s) => s._id),
      ...choiceGroups.flatMap((g) => g.subjects.map((s) => s._id)),
    ]);
    const current = subjectIdsOf(student);
    return current.some((id) => !allowed.has(id)) || allowed.size !== current.length;
  }, [student, sectionId, layout, coreSubjects, choiceGroups]);

  const toggleSubject = (id: string, opts?: { keepFullPackage?: boolean }) => {
    if (!opts?.keepFullPackage) setIsFullPackage(false);
    setSelectedSubjects((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const mut = useMutation({
    mutationFn: () =>
      changeStudentSection(studentId, {
        sectionId,
        selectedSubjects,
        isFullPackage,
        notes: notes.trim() || undefined,
      }),
    onSuccess: (result) => {
      const name =
        typeof result.student.sectionId === "object"
          ? result.student.sectionId?.sectionName
          : targetSections.find((s) => s._id === sectionId)?.sectionName;
      toast({
        title: "Section updated",
        description: `${result.student.studentName} moved to ${name || "new section"}. Unpaid challans synced.`,
      });
      qc.invalidateQueries({ queryKey: ["change-section-students"] });
      qc.invalidateQueries({ queryKey: ["change-section-student", studentId] });
      qc.invalidateQueries({ queryKey: ["academy-students"] });
      setSectionId("");
      setNotes("");
      setSubjectsOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Could not change section", description: err.message, variant: "destructive" });
    },
  });

  const subjectsReady = isFullPackage || selectedSubjects.length > 0;
  const canSubmit =
    caps.canEdit &&
    writable &&
    Boolean(studentId && sectionId) &&
    subjectsReady &&
    !mut.isPending;

  const activeStepIndex = !classId
    ? 0
    : !studentId
      ? 1
      : !sectionId
        ? student
          ? 3
          : 2
        : !subjectsReady
          ? 4
          : 5;

  const completedThrough = !classId
    ? -1
    : !studentId
      ? 0
      : !student
        ? 1
        : !sectionId
          ? 2
          : !subjectsReady
            ? 3
            : 4;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-primary/10 bg-primary/5 px-5 py-4 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ArrowLeftRight className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold tracking-tight text-primary">Change Section</h2>
            <p className="mt-1 text-sm leading-snug text-muted-foreground whitespace-pre-line">
              {`Move an active student from one section to another without opening the full edit form.
Only active students can be moved here — use Assign Section after payment for pending enrollments.`}
            </p>
          </div>
        </div>
        <p className="shrink-0 text-sm italic text-primary/70 sm:max-w-[14rem] sm:text-right">
          “Every student belongs in the right place.”
        </p>
      </div>

      {!writable ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          Switch to the active session to change sections.
        </div>
      ) : null}

      {/* Stepper */}
      <Card className="px-3 py-4 sm:px-5 overflow-x-auto">
        <ol className="flex items-center min-w-[640px] gap-0">
          {STEPS.map((label, i) => {
            const done = i <= completedThrough;
            const active = i === activeStepIndex;
            return (
              <li key={label} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1.5 min-w-[4.5rem]">
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold border-2 transition-colors",
                      done || active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted text-muted-foreground border-border",
                    )}
                  >
                    {done && !active ? <Check className="h-4 w-4" /> : i + 1}
                  </span>
                  <span
                    className={cn(
                      "text-[11px] sm:text-xs font-medium text-center leading-tight",
                      active ? "text-primary" : done ? "text-primary/80" : "text-muted-foreground",
                    )}
                  >
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 ? (
                  <div
                    className={cn(
                      "h-0.5 flex-1 mx-1 sm:mx-2 rounded-full",
                      i < completedThrough || (i === completedThrough && activeStepIndex > i)
                        ? "bg-primary"
                        : "bg-border",
                    )}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </Card>

      {/* Class + Student */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4 sm:p-5 space-y-3">
          <div>
            <h2 className="text-base font-semibold text-primary">1. Select Class</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose the class for which you want to change the section.
            </p>
          </div>
          <ClassProgramSelect
            className="w-full"
            value={classId}
            onChange={setClassId}
            classes={classes}
            emptyLabel="Select class…"
            disabled={!hasScope}
          />
        </Card>

        <Card className="p-4 sm:p-5 space-y-3">
          <div>
            <h2 className="text-base font-semibold text-primary">2. Search Student</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Search and select an active student from the selected class.
            </p>
          </div>
          {!classId ? (
            <p className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-lg">
              Select a class to load students.
            </p>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <input
                  className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Search by name, roll no or registration no..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                />
              </div>
              <div className="max-h-64 overflow-y-auto rounded-lg border divide-y">
                {studentsLoading ? (
                  <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading students…
                  </div>
                ) : students.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground text-center">
                    No active students in this class.
                  </div>
                ) : (
                  students.map((s) => {
                    const selected = studentId === s._id;
                    return (
                      <button
                        key={s._id}
                        type="button"
                        onClick={() => setStudentId(s._id)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
                          selected ? "bg-primary/5" : "hover:bg-muted/40",
                        )}
                      >
                        <StudentAvatar student={s} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-primary truncate">{s.studentName}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            Roll No: {rollOf(s)} · {classLabel(s.classId)}
                          </p>
                        </div>
                        <ActiveBadge />
                        {selected ? (
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shrink-0">
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Current info + New section */}
      {studentId ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-primary/10 bg-primary/5 px-4 py-3">
              <UserRound className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-primary">Current Student Information</h2>
            </div>
            {studentLoading || !student ? (
              <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading student…
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-3 px-4 py-4 border-b">
                  <StudentAvatar student={student} size="lg" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-primary text-lg truncate">{student.studentName}</p>
                      <ActiveBadge />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatPkr(student.monthlyFee)} / month
                      {student.isFullPackage ? " · Full package" : ""}
                    </p>
                  </div>
                </div>
                <dl className="divide-y">
                  <div className="flex items-center gap-3 px-4 py-3 bg-muted/20">
                    <GraduationCap className="h-4 w-4 text-primary shrink-0" />
                    <dt className="text-sm text-muted-foreground w-32 shrink-0">Class</dt>
                    <dd className="text-sm font-medium">{classLabel(student.classId)}</dd>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Layers className="h-4 w-4 text-primary shrink-0" />
                    <dt className="text-sm text-muted-foreground w-32 shrink-0">Current Section</dt>
                    <dd className="text-sm font-medium">{sectionNameOf(student)}</dd>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-3 bg-muted/20">
                    <Hash className="h-4 w-4 text-primary shrink-0" />
                    <dt className="text-sm text-muted-foreground w-32 shrink-0">Roll No</dt>
                    <dd className="text-sm font-medium">{rollOf(student)}</dd>
                  </div>
                </dl>
              </div>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-primary/10 bg-primary/5 px-4 py-3">
              <Filter className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-primary">Select New Section</h2>
            </div>
            <div className="p-4 sm:p-5 space-y-4">
              <p className="text-sm text-muted-foreground">
                Choose the new section from the same class
                {selectedClass ? ` (${selectedClass.className})` : ""} sections.
              </p>
              {sectionsLoading ? (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading sections…
                </div>
              ) : targetSections.length === 0 ? (
                <p className="text-sm text-muted-foreground">No other active sections in this class.</p>
              ) : (
                <div className="relative">
                  <Layers className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <select
                    className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-8 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={sectionId}
                    onChange={(e) => setSectionId(e.target.value)}
                  >
                    <option value="">Select new section…</option>
                    {targetSections.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.sectionName}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {sectionId ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-amber-900">Subjects May Differ</p>
                      <p className="text-xs text-amber-800/90 mt-0.5 leading-relaxed">
                        {subjectsMayDiffer
                          ? "The new section has a different subject layout. Please review and re-select the subjects if needed."
                          : "Review subjects for the new section before confirming the change."}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 text-primary hover:text-primary hover:bg-primary/5 px-2"
                    onClick={() => setSubjectsOpen(true)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View Subject Comparison
                  </Button>
                </div>
              ) : null}

              {sectionId ? (
                <div>
                  <Label className="text-muted-foreground">Notes (optional)</Label>
                  <Textarea
                    className="mt-1.5"
                    rows={2}
                    maxLength={500}
                    placeholder="Reason for section change…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      ) : null}

      {/* Footer */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-primary/15 bg-primary/5 px-4 py-3.5">
        <div className="flex items-start gap-2.5 min-w-0">
          <Clock className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-primary">What happens after you confirm?</p>
            <p className="text-xs sm:text-sm text-primary/80 mt-0.5 leading-relaxed">
              The system will update the section, recalculate fees (if needed) and sync unpaid
              challans automatically.
            </p>
          </div>
        </div>
        {caps.canEdit ? (
          <Button
            type="button"
            className="gap-2 shrink-0 sm:min-w-[10.5rem]"
            disabled={!canSubmit}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowLeftRight className="h-4 w-4" />
            )}
            Change Section
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground shrink-0">No permission to change sections.</p>
        )}
      </div>

      {/* Subject comparison dialog */}
      <Dialog open={subjectsOpen} onOpenChange={setSubjectsOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Subject comparison</DialogTitle>
          </DialogHeader>
          {student ? (
            <div className="space-y-4 text-sm">
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-1">Current subjects</p>
                <p>{subjectList(student.selectedSubjects, student.isFullPackage)}</p>
              </div>
              {layoutLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading new section subjects…
                </div>
              ) : (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">
                    Subjects for{" "}
                    {targetSections.find((s) => s._id === sectionId)?.sectionName || "new section"}
                  </p>
                  <SubjectChecklist
                    coreSubjects={coreSubjects}
                    choiceGroups={choiceGroups}
                    sharedSubjects={sharedSubjects}
                    streamSubjects={streamSubjects}
                    selectedSubjects={selectedSubjects}
                    isFullPackage={isFullPackage}
                    onToggleFullPackage={(checked) => {
                      setIsFullPackage(checked);
                      if (checked) setSelectedSubjects(coreSubjects.map((s) => s._id));
                    }}
                    onToggleSubject={toggleSubject}
                  />
                </div>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" onClick={() => setSubjectsOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
