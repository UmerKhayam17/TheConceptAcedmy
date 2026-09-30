import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertCircle, Check, Copy, Pencil, Plus, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { ModuleActionCaps } from "@/lib/permissions";
import type { Weekday } from "@/lib/configApi";
import { fetchClasses, fetchSections, fetchSubjects } from "@/lib/configApi";
import { fetchUsers } from "@/lib/usersApi";
import {
  createTimetableVersion,
  deleteScheduleSlot,
  duplicateTimetableVersion,
  fetchPeriodTemplates,
  fetchTeacherProfiles,
  fetchTimetableGrid,
  fetchTimetableVersions,
  moveScheduleSlot,
  publishTimetableVersion,
  scheduleSlotEntries,
  upsertScheduleSlot,
  validateTimetableVersion,
  type PeriodSlot,
  type ScheduleSlot,
} from "@/lib/timetableApi";
import type { SchoolSubject } from "@/lib/configApi";
import {
  DAY_FULL_LABELS,
  DAY_LABELS,
  FULL_WEEK_DAYS,
  normalizeWorkingDays,
  slotMatchesPeriod,
} from "./constants";
import TimetableSlotCard from "./TimetableSlotCard";

type DayApplyMode = "single" | "fullWeek" | "custom";
type SlotSubjectOption =
  | { key: string; kind: "single"; label: string; subjectIds: [string] }
  | { key: string; kind: "choice"; label: string; groupName: string; subjectIds: string[] };

function buildSlotSubjectOptions(subjects: SchoolSubject[]): SlotSubjectOption[] {
  const byGroup = new Map<string, SchoolSubject[]>();
  const singles: SchoolSubject[] = [];

  for (const s of subjects) {
    const groupName = s.choiceGroupName?.trim();
    if (s.enrollmentType === "choice" && groupName) {
      const key = groupName.toLowerCase();
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key)!.push(s);
    } else {
      singles.push(s);
    }
  }

  const options: SlotSubjectOption[] = [];

  for (const group of byGroup.values()) {
    const sorted = [...group].sort((a, b) => a.name.localeCompare(b.name));
    if (sorted.length >= 2) {
      const groupName = sorted[0].choiceGroupName!.trim();
      options.push({
        key: `choice:${groupName.toLowerCase()}`,
        kind: "choice",
        groupName,
        subjectIds: sorted.map((s) => s._id),
        label: sorted.map((s) => s.name).join(" / "),
      });
    } else {
      singles.push(...sorted);
    }
  }

  for (const s of singles) {
    options.push({
      key: s._id,
      kind: "single",
      subjectIds: [s._id],
      label: s.name,
    });
  }

  return options.sort((a, b) => a.label.localeCompare(b.label));
}

function optionKeyForSlot(slot: ScheduleSlot | undefined, options: SlotSubjectOption[]): string {
  if (!slot) return "";
  const entryIds = scheduleSlotEntries(slot).map((e) => e.subject._id);
  if (entryIds.length > 1) {
    const match = options.find(
      (o) =>
        o.kind === "choice" &&
        o.subjectIds.length === entryIds.length &&
        o.subjectIds.every((id) => entryIds.includes(id))
    );
    if (match) return match.key;
  }
  return options.find((o) => o.kind === "single" && o.subjectIds[0] === slot.subject._id)?.key
    || slot.subject._id;
}

export default function GridTab({
  sessionId,
  caps,
}: {
  sessionId: string;
  caps: ModuleActionCaps;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [versionId, setVersionId] = useState("");
  const [slotDialog, setSlotDialog] = useState<{
    day: Weekday;
    period: PeriodSlot;
    existing?: ScheduleSlot;
  } | null>(null);
  const [form, setForm] = useState<{
    optionKey: string;
    teachersBySubject: Record<string, string>;
    roomId: string;
    dayApplyMode: DayApplyMode;
    selectedDays: Weekday[];
  }>({ optionKey: "", teachersBySubject: {}, roomId: "", dayApplyMode: "single", selectedDays: [] });
  const [draggingSlotId, setDraggingSlotId] = useState<string | null>(null);
  const [dropOver, setDropOver] = useState<{ day: Weekday; periodId: string } | null>(null);
  const [editingLive, setEditingLive] = useState(false);
  const skipClickRef = useRef(false);
  /** Sync ref so dragOver/drop work before React re-renders after dragStart. */
  const draggingSlotIdRef = useRef<string | null>(null);

  useEffect(() => {
    setClassId("");
    setSectionId("");
    setVersionId("");
    setEditingLive(false);
  }, [sessionId]);

  const { data: classes = [] } = useQuery({
    queryKey: ["config-classes", sessionId],
    queryFn: () => fetchClasses(sessionId),
    enabled: !!sessionId,
  });

  const { data: sections = [] } = useQuery({
    queryKey: ["config-sections", classId, sessionId],
    queryFn: () => fetchSections({ classId, sessionId }),
    enabled: !!classId,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["timetable-periods", sessionId],
    queryFn: () => fetchPeriodTemplates(sessionId),
    enabled: !!sessionId,
  });

  const { data: versions = [] } = useQuery({
    queryKey: ["timetable-versions", sessionId, sectionId],
    queryFn: () => fetchTimetableVersions({ sessionId, sectionId }),
    enabled: !!sessionId && !!sectionId,
  });

  const draftVersion = versions.find((v) => v.status === "draft");
  const publishedVersion = versions.find((v) => v.status === "published");
  const defaultVersion = draftVersion || publishedVersion;
  const activeVersionId = versionId || defaultVersion?._id || "";
  const activeVersion = versions.find((v) => v._id === activeVersionId);

  const { data: grid, isLoading } = useQuery({
    queryKey: ["timetable-grid", activeVersionId],
    queryFn: () => fetchTimetableGrid(activeVersionId),
    enabled: !!activeVersionId,
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ["config-subjects", classId],
    queryFn: () => fetchSubjects(classId),
    enabled: !!classId,
  });

  const { data: teacherProfiles = [] } = useQuery({
    queryKey: ["timetable-teacher-profiles", sessionId],
    queryFn: () => fetchTeacherProfiles(sessionId),
    enabled: !!sessionId,
  });

  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: fetchUsers });

  const createVersionMut = useMutation({
    mutationFn: () => {
      const tpl = templates.find((t) => t.isDefault) || templates[0];
      if (!tpl) throw new Error("Create an academy time configuration in Setup first");
      return createTimetableVersion({
        session: sessionId,
        class: classId,
        section: sectionId,
        periodTemplate: tpl._id,
      });
    },
    onSuccess: (v) => {
      setVersionId(v._id);
      qc.invalidateQueries({ queryKey: ["timetable-versions", sessionId, sectionId] });
      toast({ title: "Draft timetable created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const saveSlotMut = useMutation({
    mutationFn: () => {
      if (!slotDialog || !activeVersionId) throw new Error("No slot selected");
      const option = subjectOptions.find((o) => o.key === form.optionKey);
      if (!option) throw new Error("Select a subject");
      const entries = option.subjectIds.map((subjectId) => {
        const teacher = form.teachersBySubject[subjectId];
        if (!teacher) throw new Error("Select a teacher for each subject");
        return { subject: subjectId, teacher };
      });

      const payload: Parameters<typeof upsertScheduleSlot>[1] = {
        day: slotDialog.day,
        periodId: slotDialog.period._id,
        entries,
        room: form.roomId || null,
      };

      if (form.dayApplyMode === "fullWeek") {
        payload.applyToFullWeek = true;
      } else if (form.dayApplyMode === "custom") {
        const days = [...(form.selectedDays.length ? form.selectedDays : [slotDialog.day])];
        if (!days.includes(slotDialog.day)) days.push(slotDialog.day);
        payload.days = days;
      }

      return upsertScheduleSlot(activeVersionId, payload);
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["timetable-grid", activeVersionId] });
      qc.invalidateQueries({ queryKey: ["section-schedule", sessionId, sectionId] });
      qc.invalidateQueries({ queryKey: ["my-teacher-schedule", sessionId] });
      setSlotDialog(null);
      const multi =
        result && typeof result === "object" && "created" in result
          ? (result as { created: number }).created
          : 0;
      toast({
        title: multi > 1 ? `Saved on ${multi} days` : "Slot saved",
        description:
          multi > 1
            ? "Same subject, teacher, and period applied across the selected days."
            : undefined,
      });
    },
    onError: (e: Error) =>
      toast({
        title: "Could not save slot",
        description: e.message,
        variant: "destructive",
      }),
  });

  const deleteSlotMut = useMutation({
    mutationFn: (id: string) => deleteScheduleSlot(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timetable-grid", activeVersionId] });
      qc.invalidateQueries({ queryKey: ["section-schedule", sessionId, sectionId] });
      qc.invalidateQueries({ queryKey: ["my-teacher-schedule", sessionId] });
    },
  });

  const moveSlotMut = useMutation({
    mutationFn: ({ slotId, day, periodId }: { slotId: string; day: Weekday; periodId: string }) =>
      moveScheduleSlot(slotId, { day, periodId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timetable-grid", activeVersionId] });
      qc.invalidateQueries({ queryKey: ["section-schedule", sessionId, sectionId] });
      qc.invalidateQueries({ queryKey: ["my-teacher-schedule", sessionId] });
      toast({ title: "Lesson moved" });
    },
    onError: (e: Error) =>
      toast({ title: "Could not move lesson", description: e.message, variant: "destructive" }),
  });

  const validateMut = useMutation({
    mutationFn: () => validateTimetableVersion(activeVersionId, false),
    onSuccess: (r) => {
      if (r.valid) toast({ title: "Validation passed", description: `${r.warnings.length} warnings` });
      else toast({ title: "Validation failed", description: `${r.errors.length} errors`, variant: "destructive" });
    },
  });

  const publishMut = useMutation({
    mutationFn: () => publishTimetableVersion(activeVersionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timetable-versions", sessionId, sectionId] });
      qc.invalidateQueries({ queryKey: ["timetable-grid", activeVersionId] });
      qc.invalidateQueries({ queryKey: ["section-schedule", sessionId, sectionId] });
      qc.invalidateQueries({ queryKey: ["my-teacher-schedule", sessionId] });
      setEditingLive(true);
      toast({
        title: "Timetable published",
        description: "Use Edit timetable anytime to change the live schedule.",
      });
    },
    onError: (e: Error) => toast({ title: "Cannot publish", description: e.message, variant: "destructive" }),
  });

  const duplicateMut = useMutation({
    mutationFn: () => duplicateTimetableVersion(activeVersionId),
    onSuccess: (v) => {
      setVersionId(v._id);
      qc.invalidateQueries({ queryKey: ["timetable-versions", sessionId, sectionId] });
      toast({ title: "Draft duplicated" });
    },
  });

  const workingDays = normalizeWorkingDays(grid?.workingDays);
  const lecturePeriods = (grid?.periods || []).filter((p) => p.type === "lecture");

  const getSlot = (day: Weekday, periodId: string) =>
    grid?.slots.find((s) => s.day === day && slotMatchesPeriod(s, periodId));

  const subjectOptions = useMemo(() => buildSlotSubjectOptions(subjects), [subjects]);

  const selectedOption = subjectOptions.find((o) => o.key === form.optionKey);

  const panelTeachers = useMemo(
    () =>
      users
        .filter((u) => {
          const rn = typeof u.role === "object" && u.role?.name ? u.role.name : "";
          return rn === "teacher" || rn === "admin";
        })
        .map((u) => ({ _id: u._id, name: u.name })),
    [users]
  );

  /** All teachers — same pool for every class/section (multi-section teaching). */
  const teachersForSubject = (subjectId: string) => {
    if (!subjectId) return panelTeachers;
    const seen = new Set<string>();
    const suggested: { _id: string; name: string }[] = [];
    const add = (t?: { _id: string; name: string } | null) => {
      if (!t?._id || seen.has(t._id)) return;
      seen.add(t._id);
      suggested.push({ _id: t._id, name: t.name });
    };

    add(subjects.find((s) => s._id === subjectId)?.teacher);
    for (const profile of teacherProfiles) {
      if (profile.subjects?.some((s) => s._id === subjectId)) {
        add(profile.user);
      }
    }
    const rest = panelTeachers.filter((t) => !seen.has(t._id));
    return [...suggested, ...rest];
  };

  const defaultTeacherForSubject = (subjectId: string, existing?: ScheduleSlot) => {
    if (existing) {
      const fromExisting = scheduleSlotEntries(existing).find(
        (e) => e.subject._id === subjectId
      )?.teacher._id;
      if (fromExisting) return fromExisting;
    }
    return teachersForSubject(subjectId)[0]?._id || "";
  };

  const teachersBySubjectForOption = (option: SlotSubjectOption | undefined, existing?: ScheduleSlot) => {
    const next: Record<string, string> = {};
    if (!option) return next;
    for (const subjectId of option.subjectIds) {
      next[subjectId] = defaultTeacherForSubject(subjectId, existing);
    }
    return next;
  };

  const canManageGrid = caps.canEdit || caps.canCreate;
  const isPublished =
    activeVersion?.status === "published" || grid?.version.status === "published";
  const canEditGrid =
    canManageGrid &&
    (activeVersion?.status === "draft" || (isPublished && editingLive)) &&
    (grid?.version.status === "draft" || grid?.version.status === "published");
  const canPublishVersion =
    canManageGrid &&
    activeVersion &&
    (activeVersion.status === "draft" || activeVersion.status === "archived");

  const handleCellClick = (day: Weekday, period: PeriodSlot) => {
    if (skipClickRef.current) {
      skipClickRef.current = false;
      return;
    }
    openCell(day, period);
  };

  const handleDrop = (e: React.DragEvent, day: Weekday, periodId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDropOver(null);
    if (!canEditGrid) return;
    const slotId =
      e.dataTransfer.getData("application/timetable-slot-id") ||
      e.dataTransfer.getData("text/plain") ||
      draggingSlotIdRef.current ||
      draggingSlotId;
    if (!slotId) return;
    skipClickRef.current = true;
    draggingSlotIdRef.current = null;
    setDraggingSlotId(null);
    moveSlotMut.mutate({ slotId, day, periodId });
  };

  const beginSlotDrag = (e: React.DragEvent, slotId: string) => {
    if (!canEditGrid) {
      e.preventDefault();
      return;
    }
    draggingSlotIdRef.current = slotId;
    setDraggingSlotId(slotId);
    e.dataTransfer.setData("application/timetable-slot-id", slotId);
    e.dataTransfer.setData("text/plain", slotId);
    e.dataTransfer.effectAllowed = "move";
  };

  const endSlotDrag = () => {
    draggingSlotIdRef.current = null;
    setDraggingSlotId(null);
    setDropOver(null);
  };

  const openCell = (day: Weekday, period: PeriodSlot) => {
    if (!canEditGrid) return;
    const existing = getSlot(day, period._id);
    const optionKey = optionKeyForSlot(existing, subjectOptions);
    const option = subjectOptions.find((o) => o.key === optionKey);
    setForm({
      optionKey,
      teachersBySubject: teachersBySubjectForOption(option, existing),
      roomId: existing?.room?._id || "",
      dayApplyMode: "single",
      selectedDays: [day],
    });
    setSlotDialog({ day, period, existing });
  };

  const canSaveSlot =
    Boolean(selectedOption) &&
    (selectedOption?.subjectIds.every((id) => form.teachersBySubject[id]) ?? false) &&
    (form.dayApplyMode !== "custom" || form.selectedDays.length > 0);

  const sectionLabel = sections.find((s) => s._id === sectionId);
  const classLabel = classes.find((c) => c._id === classId);

  if (!sessionId) {
    return null;
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="min-w-[140px]">
          <Label className="text-xs text-muted-foreground">Class</Label>
          <select
            className="mt-1 w-full h-10 rounded-md border px-3 text-sm"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setSectionId("");
              setVersionId("");
              setEditingLive(false);
            }}
          >
            <option value="">Select class</option>
            {classes.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        </div>
        <div className="min-w-[120px]">
          <Label className="text-xs text-muted-foreground">Section</Label>
          <select
            className="mt-1 w-full h-10 rounded-md border px-3 text-sm"
            value={sectionId}
            onChange={(e) => {
              setSectionId(e.target.value);
              setVersionId("");
              setEditingLive(false);
            }}
            disabled={!classId}
          >
            <option value="">Select section</option>
            {sections.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
        </div>
        {sectionId && versions.length > 0 && (
          <div className="min-w-[180px]">
            <Label className="text-xs text-muted-foreground">Version</Label>
            <select
              className="mt-1 w-full h-10 rounded-md border px-3 text-sm"
              value={activeVersionId}
              onChange={(e) => {
                setVersionId(e.target.value);
                setEditingLive(false);
              }}
            >
              {versions.map((v) => (
                <option key={v._id} value={v._id}>
                  v{v.version} · {v.status}
                </option>
              ))}
            </select>
          </div>
        )}
        {sectionId && caps.canCreate && !draftVersion && !publishedVersion && (
          <Button className="gap-2" onClick={() => createVersionMut.mutate()} disabled={createVersionMut.isPending}>
            <Plus className="h-4 w-4" /> New draft
          </Button>
        )}
        {activeVersionId && canManageGrid && (
          <>
            {isPublished && !editingLive && (
              <Button
                className="gap-2"
                onClick={() => {
                  if (publishedVersion?._id) setVersionId(publishedVersion._id);
                  setEditingLive(true);
                }}
              >
                <Pencil className="h-4 w-4" /> Edit this timetable
              </Button>
            )}
            {isPublished && editingLive && (
              <Button variant="outline" className="gap-2" onClick={() => setEditingLive(false)}>
                <Check className="h-4 w-4" /> Done editing
              </Button>
            )}
            {!isPublished && activeVersion?.status === "draft" && (
              <Badge variant="secondary" className="h-10 px-3 text-xs font-normal gap-1.5">
                <Pencil className="h-3.5 w-3.5" /> Draft — click lessons to edit
              </Badge>
            )}
            <Button variant="outline" className="gap-2" onClick={() => validateMut.mutate()}>
              <AlertCircle className="h-4 w-4" /> Validate
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => duplicateMut.mutate()}>
              <Copy className="h-4 w-4" /> Duplicate
            </Button>
            {canPublishVersion && grid && (
              <Button className="gap-2" onClick={() => publishMut.mutate()} disabled={publishMut.isPending}>
                <Send className="h-4 w-4" /> Publish
              </Button>
            )}
          </>
        )}
      </div>

      {sectionId && isPublished && !editingLive && canManageGrid && grid && (
        <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-amber-900 dark:text-amber-200">
            This timetable is published. Turn on edit mode to change subjects, teachers, or move lessons.
          </p>
          <Button
            size="sm"
            className="gap-2 shrink-0"
            onClick={() => {
              if (publishedVersion?._id) setVersionId(publishedVersion._id);
              setEditingLive(true);
            }}
          >
            <Pencil className="h-4 w-4" /> Edit this timetable
          </Button>
        </div>
      )}

      {sectionId && grid && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-primary">
              {classLabel?.name} — {sectionLabel?.name}
            </h2>
            <Badge variant={grid.version.status === "published" ? "default" : "secondary"}>
              v{grid.version.version} · {grid.version.status}
            </Badge>
            {isPublished && !editingLive && canManageGrid && (
              <span className="text-xs text-muted-foreground">
                Published — click Edit timetable to change lessons
              </span>
            )}
            {canEditGrid && (
              <span className="text-xs text-muted-foreground">
                Drag a lesson to move it · click the pencil to edit details
              </span>
            )}
            {canEditGrid && isPublished && (
              <span className="text-xs text-amber-700 dark:text-amber-400">Editing live timetable</span>
            )}
          </div>

          <Card className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 w-28">Time</th>
                  {workingDays.map((d) => (
                    <th key={d} className="text-left p-3">{DAY_LABELS[d]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lecturePeriods.map((period) => (
                  <tr key={period._id} className="border-t">
                    <td className="p-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {period.startTime}
                      <br />
                      {period.endTime}
                    </td>
                    {workingDays.map((day) => {
                      const slot = getSlot(day, period._id);
                      const isDropTarget =
                        dropOver?.day === day && dropOver?.periodId === period._id;
                      const isDragActive = Boolean(draggingSlotId || draggingSlotIdRef.current);
                      return (
                        <td
                          key={day}
                          className={cn(
                            "p-2 align-top min-w-[100px] min-h-[64px] transition-colors",
                            canEditGrid && "hover:bg-muted/40",
                            isDropTarget && "bg-accent/15 ring-2 ring-inset ring-accent/50",
                            moveSlotMut.isPending && "pointer-events-none opacity-60"
                          )}
                          onClick={() => handleCellClick(day, period)}
                          onDragEnter={(e) => {
                            if (!canEditGrid) return;
                            if (!draggingSlotIdRef.current && !draggingSlotId) return;
                            e.preventDefault();
                            setDropOver({ day, periodId: period._id });
                          }}
                          onDragOver={(e) => {
                            if (!canEditGrid) return;
                            // Accept drops even before React state catches up from dragStart
                            if (!draggingSlotIdRef.current && !draggingSlotId) {
                              const types = Array.from(e.dataTransfer.types || []);
                              if (
                                !types.includes("application/timetable-slot-id") &&
                                !types.includes("text/plain")
                              ) {
                                return;
                              }
                            }
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                            setDropOver({ day, periodId: period._id });
                          }}
                          onDragLeave={(e) => {
                            // Ignore leave events that bubble from children
                            const related = e.relatedTarget as Node | null;
                            if (related && e.currentTarget.contains(related)) return;
                            setDropOver((prev) =>
                              prev?.day === day && prev?.periodId === period._id ? null : prev
                            );
                          }}
                          onDrop={(e) => handleDrop(e, day, period._id)}
                        >
                          {slot ? (
                            <TimetableSlotCard
                              slot={slot}
                              draggable={canEditGrid && !slot.locked}
                              isDragging={draggingSlotId === slot._id}
                              isDropTarget={isDropTarget && draggingSlotId !== slot._id}
                              onEdit={
                                canEditGrid
                                  ? () => {
                                      skipClickRef.current = true;
                                      openCell(day, period);
                                    }
                                  : undefined
                              }
                              onDragStart={(e) => beginSlotDrag(e, slot._id)}
                              onDragEnd={endSlotDrag}
                              onDragOver={(e) => {
                                if (!canEditGrid) return;
                                if (
                                  !draggingSlotIdRef.current &&
                                  !draggingSlotId &&
                                  !Array.from(e.dataTransfer.types || []).length
                                ) {
                                  return;
                                }
                                e.preventDefault();
                                e.stopPropagation();
                                e.dataTransfer.dropEffect = "move";
                                setDropOver({ day, periodId: period._id });
                              }}
                              onDrop={(e) => handleDrop(e, day, period._id)}
                            />
                          ) : (
                            <span
                              className={cn(
                                "block min-h-[52px] text-muted-foreground",
                                isDragActive && canEditGrid && "rounded border border-dashed border-muted-foreground/30",
                                isDropTarget && "font-medium text-accent border-accent/50"
                              )}
                            >
                              {isDropTarget ? "Drop here" : "—"}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      <Dialog open={!!slotDialog} onOpenChange={(o) => !o && setSlotDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {slotDialog ? `${DAY_LABELS[slotDialog.day]} · ${slotDialog.period.label}` : "Edit slot"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Subject</Label>
              <select
                className="w-full h-10 rounded-md border px-3 text-sm"
                value={form.optionKey}
                onChange={(e) => {
                  const key = e.target.value;
                  const option = subjectOptions.find((o) => o.key === key);
                  setForm({
                    optionKey: key,
                    teachersBySubject: teachersBySubjectForOption(option),
                    roomId: "",
                    dayApplyMode: form.dayApplyMode,
                    selectedDays: form.selectedDays,
                  });
                }}
              >
                <option value="">Select subject</option>
                {subjectOptions.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
              {selectedOption?.kind === "choice" && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Choice group — students split across these subjects in the same period. Assign one
                  teacher for each.
                </p>
              )}
            </div>

            {selectedOption &&
              selectedOption.subjectIds.map((subjectId) => {
                const sub = subjects.find((s) => s._id === subjectId);
                const label =
                  selectedOption.kind === "choice"
                    ? `Teacher · ${sub?.name || "Subject"}`
                    : "Teacher";
                return (
                  <div key={subjectId}>
                    <Label>{label}</Label>
                    <select
                      className="w-full h-10 rounded-md border px-3 text-sm"
                      value={form.teachersBySubject[subjectId] || ""}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          teachersBySubject: {
                            ...f.teachersBySubject,
                            [subjectId]: e.target.value,
                          },
                        }))
                      }
                    >
                      <option value="">Select teacher</option>
                      {teachersForSubject(subjectId).map((t) => (
                        <option key={t._id} value={t._id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}

            <div className="space-y-2 rounded-md border p-3">
              <Label className="text-sm font-medium">Apply schedule to</Label>
              <div className="space-y-2 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="dayApplyMode"
                    className="h-4 w-4 accent-primary"
                    checked={form.dayApplyMode === "single"}
                    onChange={() =>
                      setForm((f) => ({
                        ...f,
                        dayApplyMode: "single",
                        selectedDays: slotDialog ? [slotDialog.day] : f.selectedDays,
                      }))
                    }
                  />
                  <span>
                    This day only
                    {slotDialog ? ` (${DAY_FULL_LABELS[slotDialog.day]})` : ""}
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="dayApplyMode"
                    className="h-4 w-4 accent-primary"
                    checked={form.dayApplyMode === "fullWeek"}
                    onChange={() =>
                      setForm((f) => ({
                        ...f,
                        dayApplyMode: "fullWeek",
                        selectedDays: [...FULL_WEEK_DAYS],
                      }))
                    }
                  />
                  <span>Full week (Mon–Fri)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="dayApplyMode"
                    className="h-4 w-4 accent-primary"
                    checked={form.dayApplyMode === "custom"}
                    onChange={() =>
                      setForm((f) => ({
                        ...f,
                        dayApplyMode: "custom",
                        selectedDays:
                          f.selectedDays.length > 0
                            ? f.selectedDays
                            : slotDialog
                              ? [slotDialog.day]
                              : [],
                      }))
                    }
                  />
                  <span>Select specific days</span>
                </label>
              </div>

              {(form.dayApplyMode === "fullWeek" || form.dayApplyMode === "custom") && (
                <div className="flex flex-wrap gap-3 pt-1">
                  {(form.dayApplyMode === "fullWeek" ? FULL_WEEK_DAYS : workingDays).map((day) => {
                    const checked =
                      form.dayApplyMode === "fullWeek"
                        ? true
                        : form.selectedDays.includes(day);
                    const lockedPrimary = slotDialog?.day === day;
                    return (
                      <label
                        key={day}
                        className={cn(
                          "inline-flex items-center gap-2 text-sm",
                          form.dayApplyMode === "fullWeek" && "opacity-70"
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={form.dayApplyMode === "fullWeek" || lockedPrimary}
                          onCheckedChange={(v) => {
                            if (form.dayApplyMode !== "custom") return;
                            setForm((f) => {
                              const on = v === true;
                              let next = f.selectedDays.filter((d) => d !== day);
                              if (on) next = [...next, day];
                              if (slotDialog && !next.includes(slotDialog.day)) {
                                next = [...next, slotDialog.day];
                              }
                              return { ...f, selectedDays: next };
                            });
                          }}
                        />
                        {DAY_LABELS[day]}
                      </label>
                    );
                  })}
                </div>
              )}

              {form.dayApplyMode !== "single" && (
                <p className="text-xs text-muted-foreground">
                  Conflicts on any selected day (teacher, class/section, or room) will block saving
                  all days.
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            {slotDialog?.existing && (
              <Button
                variant="destructive"
                onClick={() => {
                  deleteSlotMut.mutate(slotDialog.existing!._id);
                  setSlotDialog(null);
                }}
              >
                Clear
              </Button>
            )}
            <Button variant="outline" onClick={() => setSlotDialog(null)}>Cancel</Button>
            <Button disabled={!canSaveSlot || saveSlotMut.isPending} onClick={() => saveSlotMut.mutate()}>
              {form.dayApplyMode === "single"
                ? "Save"
                : form.dayApplyMode === "fullWeek"
                  ? "Save full week"
                  : `Save ${Math.max(form.selectedDays.length, 1)} days`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


