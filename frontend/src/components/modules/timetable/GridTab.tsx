import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Copy,
  FileDown,
  FileSpreadsheet,
  LayoutGrid,
  Link2,
  Pencil,
  Plus,
  Printer,
  Send,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { ModuleActionCaps } from "@/lib/permissions";
import type { Weekday } from "@/lib/configApi";
import {
  classDisplayName,
  classSectionBoardLabel,
  fetchClasses,
  fetchSections,
  fetchSubjects,
  groupClassesByProgram,
  sortClassesByLevel,
} from "@/lib/configApi";
import {
  createTimetableVersion,
  deleteScheduleSlot,
  duplicateTimetableVersion,
  fetchClassBoard,
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
  assignUniqueSubjectColors,
  colorForSubjectName,
  dotForSubjectName,
  normalizeWorkingDays,
  slotMatchesPeriod,
  subjectColorKey,
} from "./constants";
import { orderRosterForSubject } from "./teacherRoster";
import { subjectIcon } from "@/lib/subjectTheme";
import {
  downloadBuilderGridPdf,
  exportBuilderGridExcel,
  printBuilderGrid,
} from "./builderExport";
import {
  addDays,
  formatWeekRange,
  startOfWeekMonday,
  weekDates,
} from "./my-schedule/dateUtils";
import TimetableSlotCard from "./TimetableSlotCard";

type BoardViewMode = "week" | "day";
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
  const [viewMode, setViewMode] = useState<BoardViewMode>("week");
  const [focusDay, setFocusDay] = useState<Weekday>("monday");
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date()));
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
  const autoDraftForSectionRef = useRef<string | null>(null);

  useEffect(() => {
    setClassId("");
    setSectionId("");
    setVersionId("");
    setEditingLive(false);
    setViewMode("week");
    setFocusDay("monday");
    setWeekStart(startOfWeekMonday(new Date()));
    autoDraftForSectionRef.current = null;
  }, [sessionId]);

  const { data: classesRaw = [] } = useQuery({
    queryKey: ["config-classes", sessionId],
    queryFn: () => fetchClasses(sessionId),
    enabled: !!sessionId,
  });
  const classes = useMemo(() => sortClassesByLevel(classesRaw), [classesRaw]);
  const classGroups = useMemo(() => groupClassesByProgram(classes), [classes]);

  /** Full subject catalog — shared with Class Board for identical colors. */
  const { data: allSubjectsRaw = [] } = useQuery({
    queryKey: ["config-subjects", "all"],
    queryFn: () => fetchSubjects(),
    enabled: !!sessionId,
    staleTime: 60_000,
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

  const {
    data: versions = [],
    isFetched: versionsFetched,
  } = useQuery({
    queryKey: ["timetable-versions", sessionId, sectionId],
    queryFn: () => fetchTimetableVersions({ sessionId, sectionId }),
    enabled: !!sessionId && !!sectionId,
  });

  // Default: first class so the page is not empty.
  useEffect(() => {
    if (!classes.length) return;
    if (!classId || !classes.some((c) => c._id === classId)) {
      setClassId(classes[0]._id);
      setSectionId("");
      setVersionId("");
    }
  }, [classes, classId]);

  // Default: first section of the selected class.
  useEffect(() => {
    if (!classId || !sections.length) return;
    if (!sectionId || !sections.some((s) => s._id === sectionId)) {
      setSectionId(sections[0]._id);
      setVersionId("");
      setEditingLive(false);
    }
  }, [classId, sections, sectionId]);

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
    onError: (e: Error) => {
      autoDraftForSectionRef.current = null;
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  // Auto-create a draft so the builder grid is ready by default.
  useEffect(() => {
    if (!sectionId || !versionsFetched || !caps.canCreate) return;
    if (versions.length > 0) return;
    if (!templates.length) return;
    if (createVersionMut.isPending) return;
    if (autoDraftForSectionRef.current === sectionId) return;
    autoDraftForSectionRef.current = sectionId;
    createVersionMut.mutate();
  }, [
    sectionId,
    versionsFetched,
    versions.length,
    templates.length,
    caps.canCreate,
    createVersionMut.isPending,
  ]);

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
  const displayDays = viewMode === "day" ? [focusDay] : workingDays;
  const sharedDay =
    viewMode === "day" ? focusDay : workingDays[0] || focusDay;
  const selectedSection = sections.find((s) => s._id === sectionId);
  const selectedClass = classes.find((c) => c._id === classId);

  const dayDateMap = useMemo(() => {
    const days = workingDays.length ? workingDays : FULL_WEEK_DAYS;
    const entries = weekDates(weekStart, days);
    return new Map(entries.map((e) => [e.day, e.date] as const));
  }, [weekStart, workingDays]);

  const formatDayDate = (day: Weekday) => {
    const d = dayDateMap.get(day);
    if (!d) return DAY_LABELS[day];
    return d.toLocaleDateString("en", { month: "short", day: "numeric" });
  };

  useEffect(() => {
    if (workingDays.length && !workingDays.includes(focusDay)) {
      setFocusDay(workingDays[0]);
    }
  }, [workingDays, focusDay]);

  const { data: classBoard } = useQuery({
    queryKey: ["class-board", sessionId, classId || "all", sharedDay, "draft"],
    queryFn: () =>
      fetchClassBoard({
        sessionId,
        classId: classId || undefined,
        day: sharedDay,
        versionMode: "draft",
      }),
    enabled: !!sessionId && !!classId,
  });

  const upcomingLessons = useMemo(() => {
    type Item = {
      id: string;
      title: string;
      subjectName: string;
      teachers: string;
      periodLabel: string;
      periodOrder: number;
      sections: string[];
      shared: boolean;
    };
    const map = new Map<string, Item>();
    const boardSectionLabel = classSectionBoardLabel(
      selectedClass?.name || selectedClass?.className,
      selectedSection?.name,
      undefined
    );

    // Current section lessons for the focused / shared day
    for (const slot of grid?.slots || []) {
      if (slot.day !== sharedDay) continue;
      const entries = scheduleSlotEntries(slot);
      if (!entries.length) continue;
      const period = lecturePeriods.find((p) => slotMatchesPeriod(slot, p._id));
      const shared = Boolean(slot.combinedGroupId);
      const key = shared ? `shared:${slot.combinedGroupId}` : `slot:${slot._id}`;
      if (map.has(key)) continue;
      map.set(key, {
        id: key,
        title: entries.map((e) => e.subject.name).join(" / "),
        subjectName: entries[0]?.subject?.name || "",
        teachers: entries.map((e) => e.teacher?.name || "—").join(" / "),
        periodLabel: period?.label || `P${period?.order || ""}`,
        periodOrder: period?.order ?? 999,
        sections: [boardSectionLabel || "Section"],
        shared,
      });
    }

    // Enrich shared groups with sibling section labels from class board
    const rows = classBoard?.sections || [];
    const boardPeriods = (classBoard?.periods || []).filter((p) => p.type === "lecture");
    for (const row of rows) {
      for (const slot of row.slots) {
        if (!slot.combinedGroupId) continue;
        const key = `shared:${slot.combinedGroupId}`;
        const label = classSectionBoardLabel(
          row.class?.name,
          row.section.name,
          row.section.label
        );
        const existing = map.get(key);
        if (existing) {
          if (!existing.sections.includes(label)) existing.sections.push(label);
          continue;
        }
        const entries = scheduleSlotEntries(slot);
        if (!entries.length) continue;
        const period = boardPeriods.find((p) => slotMatchesPeriod(slot, p._id));
        map.set(key, {
          id: key,
          title: entries.map((e) => e.subject.name).join(" / "),
          subjectName: entries[0]?.subject?.name || "",
          teachers: entries.map((e) => e.teacher?.name || "—").join(" / "),
          periodLabel: period?.label || `P${period?.order || ""}`,
          periodOrder: period?.order ?? 999,
          sections: [label],
          shared: true,
        });
      }
    }

    return [...map.values()]
      .sort((a, b) => a.periodOrder - b.periodOrder || a.title.localeCompare(b.title))
      .slice(0, 5);
  }, [grid?.slots, classBoard, sharedDay, lecturePeriods, selectedClass, selectedSection]);

  const getSlot = (day: Weekday, periodId: string) =>
    grid?.slots.find((s) => s.day === day && slotMatchesPeriod(s, periodId));

  const legendSubjects = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of subjects) {
      const name = s.name?.trim();
      if (!name) continue;
      const key = subjectColorKey(name);
      if (!map.has(key)) map.set(key, name);
    }
    for (const slot of grid?.slots || []) {
      for (const e of scheduleSlotEntries(slot)) {
        const name = e.subject?.name?.trim();
        if (!name) continue;
        const key = subjectColorKey(name);
        if (!map.has(key)) map.set(key, name);
      }
    }
    return [...map.entries()]
      .map(([key, name]) => ({ key, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [subjects, grid?.slots]);

  /** School-wide unique colors — same mapping as Class Board. */
  const subjectColorByKey = useMemo(() => {
    const classIds = new Set(classes.map((c) => c._id));
    const names: string[] = [];
    for (const s of allSubjectsRaw) {
      const cid = typeof s.class === "object" ? s.class?._id : s.class;
      if (classIds.size && cid && !classIds.has(String(cid))) continue;
      if (s.name?.trim()) names.push(s.name);
    }
    if (!names.length) {
      for (const s of legendSubjects) names.push(s.name);
    }
    return assignUniqueSubjectColors(names);
  }, [allSubjectsRaw, classes, legendSubjects]);

  const subjectOptions = useMemo(() => buildSlotSubjectOptions(subjects), [subjects]);

  const selectedOption = subjectOptions.find((o) => o.key === form.optionKey);

  /** Session roster only. Teachers who can teach this subject are listed first. */
  const teachersForSubject = (subjectId: string) =>
    orderRosterForSubject(
      teacherProfiles,
      subjects.find((s) => s._id === subjectId),
    );

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

  const sectionLabel = selectedSection;
  const classLabel = selectedClass;

  const boardTitle = `${classLabel ? classDisplayName(classLabel) : "Class"} — ${
    sectionLabel?.name || "Section"
  }`;
  const boardSubtitle =
    viewMode === "day"
      ? `${DAY_FULL_LABELS[focusDay]} · ${grid?.version.status || "draft"}`
      : `Weekly timetable · ${grid?.version.status || "draft"}`;

  const exportOpts = () => ({
    title: boardTitle,
    subtitle: boardSubtitle,
    days: displayDays,
    periods: lecturePeriods,
    slots: grid?.slots || [],
    getSlot,
  });

  const canExportGrid = Boolean(grid && lecturePeriods.length && displayDays.length);

  const handlePrint = () => {
    try {
      printBuilderGrid(exportOpts());
    } catch (e) {
      toast({
        title: "Could not print",
        description: e instanceof Error ? e.message : "Print failed",
        variant: "destructive",
      });
    }
  };

  const handleDownloadPdf = async () => {
    try {
      await downloadBuilderGridPdf(exportOpts());
      toast({ title: "PDF downloaded", description: boardSubtitle });
    } catch (e) {
      toast({
        title: "Could not download PDF",
        description: e instanceof Error ? e.message : "PDF failed",
        variant: "destructive",
      });
    }
  };

  const handleExportExcel = () => {
    try {
      exportBuilderGridExcel(exportOpts());
      toast({ title: "Excel downloaded", description: boardSubtitle });
    } catch (e) {
      toast({
        title: "Could not export",
        description: e instanceof Error ? e.message : "Export failed",
        variant: "destructive",
      });
    }
  };

  if (!sessionId) {
    return null;
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      <div className="text-xs text-muted-foreground">
        Timetable <span className="mx-1">›</span>{" "}
        <span className="text-foreground font-medium">Timetable builder</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LayoutGrid className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight text-primary">
              Timetable Builder
            </h2>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Plan and manage the timetable by selecting class, section and version. Click on any
              cell to add or edit a lesson.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sectionId && caps.canCreate && !draftVersion && !publishedVersion && (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => createVersionMut.mutate()}
              disabled={createVersionMut.isPending}
            >
              <Plus className="h-3.5 w-3.5" /> New draft
            </Button>
          )}
          {activeVersionId && canManageGrid && (
            <>
              {isPublished && !editingLive && (
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    if (publishedVersion?._id) setVersionId(publishedVersion._id);
                    setEditingLive(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit timetable
                </Button>
              )}
              {isPublished && editingLive && (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditingLive(false)}>
                  <Check className="h-3.5 w-3.5" /> Done editing
                </Button>
              )}
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => validateMut.mutate()}>
                <AlertCircle className="h-3.5 w-3.5" /> Validate
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => duplicateMut.mutate()}>
                <Copy className="h-3.5 w-3.5" /> Duplicate
              </Button>
              {canPublishVersion && grid && (
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => publishMut.mutate()}
                  disabled={publishMut.isPending}
                >
                  <Send className="h-3.5 w-3.5" /> Publish
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px] xl:items-start">
        <div className="space-y-4 min-w-0">
          <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3 shadow-sm">
            <div className="min-w-[160px]">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Class</Label>
              <select
                className="mt-1 w-full h-10 rounded-lg border bg-background px-3 text-sm"
                value={classId}
                onChange={(e) => {
                  setClassId(e.target.value);
                  setSectionId("");
                  setVersionId("");
                  setEditingLive(false);
                  autoDraftForSectionRef.current = null;
                }}
              >
                <option value="">Select class</option>
                {classGroups.map((g) => (
                  <optgroup key={g.key} label={g.label}>
                    {g.classes.map((c) => (
                      <option key={c._id} value={c._id}>
                        {classDisplayName(c)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="min-w-[140px]">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Section</Label>
              <select
                className="mt-1 w-full h-10 rounded-lg border bg-background px-3 text-sm"
                value={sectionId}
                onChange={(e) => {
                  setSectionId(e.target.value);
                  setVersionId("");
                  setEditingLive(false);
                  autoDraftForSectionRef.current = null;
                }}
                disabled={!classId}
              >
                <option value="">Select section</option>
                {sections.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            {sectionId && versions.length > 0 && (
              <div className="min-w-[180px]">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Version</Label>
                <select
                  className="mt-1 w-full h-10 rounded-lg border bg-background px-3 text-sm"
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
            {activeVersionId && (
              <Badge variant={grid?.version.status === "published" ? "default" : "secondary"}>
                {classLabel ? classDisplayName(classLabel) : "—"} · {sectionLabel?.name || "—"}
                {grid ? ` · v${grid.version.version}` : ""}
              </Badge>
            )}
            {sectionId && (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 rounded-full border bg-background px-1 py-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => setWeekStart((w) => addDays(w, -7))}
                    aria-label="Previous week"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="min-w-[9.5rem] text-center text-xs font-medium tabular-nums">
                    {formatWeekRange(weekStart, workingDays.length || 6)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => setWeekStart((w) => addDays(w, 7))}
                    aria-label="Next week"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex rounded-full border bg-muted/40 p-1">
                  <button
                    type="button"
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                      viewMode === "week"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => setViewMode("week")}
                  >
                    Week View
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                      viewMode === "day"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => setViewMode("day")}
                  >
                    Day View
                  </button>
                </div>
              </div>
            )}
          </div>

          {viewMode === "day" && sectionId && (
            <div className="flex flex-wrap gap-1.5">
              {workingDays.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setFocusDay(d)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    focusDay === d
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  )}
                >
                  {DAY_FULL_LABELS[d].slice(0, 3)} · {formatDayDate(d)}
                </button>
              ))}
            </div>
          )}

          {sectionId && isPublished && !editingLive && canManageGrid && grid && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
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

          {sectionId && !grid && (isLoading || createVersionMut.isPending) && (
            <p className="text-sm text-muted-foreground">Loading timetable grid…</p>
          )}

          {!sectionId && (
            <Card className="rounded-2xl border p-8 text-sm text-muted-foreground shadow-sm">
              Select a class and section to open the timetable grid.
            </Card>
          )}

          {sectionId && !templates.length && versionsFetched && versions.length === 0 && (
            <Card className="rounded-2xl border p-8 text-sm text-muted-foreground shadow-sm">
              Create an academy time configuration (periods) in System Config first.
            </Card>
          )}

          {sectionId && grid && (
            <>
          {canEditGrid && (
            <p className="text-xs text-muted-foreground px-1">
              Drag a lesson to move it · click a cell to place or edit
              {isPublished ? " · editing live timetable" : ""}
            </p>
          )}

          <Card className="overflow-hidden rounded-2xl border shadow-sm">
            <div className="w-full overflow-hidden">
              <table className="w-full table-fixed text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-muted/50">
                    <th className="w-[120px] border-b px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Day
                    </th>
                    {lecturePeriods.map((p) => (
                      <th
                        key={p._id}
                        className="border-b px-1.5 py-3 text-center font-semibold overflow-hidden"
                      >
                        <div className="text-sm truncate">{p.label || `P${p.order}`}</div>
                        <div className="text-[11px] font-normal text-muted-foreground truncate">
                          {p.startTime} – {p.endTime}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayDays.map((day) => (
                    <tr key={day} className="align-top">
                      <td className="w-[120px] border-b bg-primary/5 px-3 py-3 font-semibold overflow-hidden">
                        <div className="truncate">{DAY_FULL_LABELS[day]}</div>
                        <div className="mt-0.5 text-[11px] font-normal text-muted-foreground">
                          {formatDayDate(day)}
                        </div>
                      </td>
                      {lecturePeriods.map((period) => {
                        const slot = getSlot(day, period._id);
                        const isDropTarget =
                          dropOver?.day === day && dropOver?.periodId === period._id;
                        const isDragActive = Boolean(draggingSlotId || draggingSlotIdRef.current);
                        return (
                          <td
                            key={period._id}
                            className={cn(
                              "border-b p-1.5 align-top overflow-hidden",
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
                                colorClass={colorForSubjectName(
                                  scheduleSlotEntries(slot)[0]?.subject?.name ||
                                    slot.subject?.name ||
                                    "",
                                  subjectColorByKey
                                )}
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
                              <button
                                type="button"
                                className={cn(
                                  "flex h-[72px] w-full min-w-0 items-center justify-center rounded-xl border border-dashed text-xs text-muted-foreground transition-colors",
                                  canEditGrid && "hover:border-primary/40 hover:bg-primary/5",
                                  isDropTarget &&
                                    isDragActive &&
                                    "border-primary bg-primary/5 ring-2 ring-primary/30"
                                )}
                                disabled={!canEditGrid}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCellClick(day, period);
                                }}
                              >
                                {canEditGrid
                                  ? isDropTarget && isDragActive
                                    ? "Drop"
                                    : "+"
                                  : "—"}
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground px-1">
            {legendSubjects.length > 0 ? (
              legendSubjects.map((s) => {
                const Icon = subjectIcon(s.name);
                return (
                  <span key={s.key} className="inline-flex items-center gap-1.5">
                    <span
                      className={cn(
                        "inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10",
                        dotForSubjectName(s.name, subjectColorByKey)
                      )}
                      aria-hidden
                    />
                    <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                    {s.name}
                  </span>
                );
              })
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-emerald-600" /> Shared / Combined
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Link2 className="h-3.5 w-3.5 text-violet-600" /> Parallel
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Circle className="h-3.5 w-3.5" /> Normal
                </span>
              </>
            )}
          </div>
            </>
          )}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4">
          <Card className="rounded-2xl border p-4 shadow-sm space-y-2">
            <h3 className="text-sm font-semibold mb-2">Quick Actions</h3>
            <button
              type="button"
              disabled={!canExportGrid}
              onClick={handlePrint}
              className="flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left hover:bg-muted/40 transition-colors disabled:pointer-events-none disabled:opacity-50"
            >
              <Printer className="h-4 w-4 mt-0.5 text-slate-600 shrink-0" />
              <span>
                <span className="block text-sm font-medium">Print Class Sheet</span>
                <span className="text-xs text-muted-foreground">
                  Section printable sheet
                  {grid?.version.status === "draft" ? " (draft)" : ""}
                </span>
              </span>
            </button>
            <button
              type="button"
              disabled={!canExportGrid}
              onClick={() => void handleDownloadPdf()}
              className="flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left hover:bg-muted/40 transition-colors disabled:pointer-events-none disabled:opacity-50"
            >
              <FileDown className="h-4 w-4 mt-0.5 text-rose-600 shrink-0" />
              <span>
                <span className="block text-sm font-medium">Download PDF</span>
                <span className="text-xs text-muted-foreground">
                  Academy sheet as a .pdf file
                </span>
              </span>
            </button>
            <button
              type="button"
              disabled={!canExportGrid}
              onClick={handleExportExcel}
              className="flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left hover:bg-muted/40 transition-colors disabled:pointer-events-none disabled:opacity-50"
            >
              <FileSpreadsheet className="h-4 w-4 mt-0.5 text-emerald-700 shrink-0" />
              <span>
                <span className="block text-sm font-medium">Export to Excel</span>
                <span className="text-xs text-muted-foreground">
                  Same timetable sheet data
                </span>
              </span>
            </button>
          </Card>

          <Card className="rounded-2xl border p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-semibold">Upcoming Lessons</h3>
              <span className="text-[11px] text-muted-foreground">
                {selectedClass ? classDisplayName(selectedClass) : "Class"} ·{" "}
                {DAY_FULL_LABELS[sharedDay]}
              </span>
            </div>
            {upcomingLessons.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                No lessons for this class on this day yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {upcomingLessons.map((item) => {
                  const Icon = subjectIcon(item.subjectName);
                  return (
                    <li
                      key={item.id}
                      className={cn(
                        "rounded-xl border px-3 py-2.5 text-xs space-y-1 shadow-sm",
                        colorForSubjectName(item.subjectName, subjectColorByKey)
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold">
                          <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                          <span className="truncate">{item.title}</span>
                        </span>
                        {item.shared ? (
                          <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 border-0 shrink-0">
                            Shared
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-muted-foreground truncate">{item.sections.join(", ")}</p>
                      <p className="text-muted-foreground">
                        {item.periodLabel} · {item.teachers}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </aside>
      </div>

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
                    {teacherProfiles.length === 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Add this person under System Config → Teachers for the current session.
                      </p>
                    )}
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


