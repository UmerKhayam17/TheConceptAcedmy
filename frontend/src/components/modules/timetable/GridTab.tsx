import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Eraser,
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
  clearVersionSlots,
  createTimetableVersion,
  deleteScheduleSlot,
  fetchClassBoard,
  fetchPeriodTemplates,
  fetchTeacherProfiles,
  fetchTimetableGrid,
  fetchTimetableVersions,
  moveScheduleSlot,
  publishTimetableVersion,
  isDeletedSubject,
  scheduleSlotEntries,
  scheduleSlotTitle,
  upsertScheduleSlot,
  validateTimetableVersion,
  type PeriodSlot,
  type ScheduleSlot,
} from "@/lib/timetableApi";
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
import {
  buildSlotSubjectOptions,
  isTimetableOnlyCombine,
  optionKeyForSlot,
  slotEntrySubjectIds,
  type SlotSubjectOption,
} from "./slotSubjectOptions";

type BoardViewMode = "week" | "day";
type DayApplyMode = "single" | "fullWeek" | "custom";

const WEEKDAY_FROM_JS: Weekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function todayWeekday(): Weekday {
  return WEEKDAY_FROM_JS[new Date().getDay()] || "monday";
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
  const [focusDay, setFocusDay] = useState<Weekday>(() => todayWeekday());
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date()));
  const [slotDialog, setSlotDialog] = useState<{
    day: Weekday;
    period: PeriodSlot;
    existing?: ScheduleSlot;
  } | null>(null);
  const [form, setForm] = useState<{
    combineSubjects: boolean;
    optionKey: string;
    customSubjectIds: string[];
    teachersBySubject: Record<string, string>;
    roomId: string;
    dayApplyMode: DayApplyMode;
    selectedDays: Weekday[];
  }>({
    combineSubjects: false,
    optionKey: "",
    customSubjectIds: [],
    teachersBySubject: {},
    roomId: "",
    dayApplyMode: "single",
    selectedDays: [],
  });
  const [draggingSlotId, setDraggingSlotId] = useState<string | null>(null);
  const [dropOver, setDropOver] = useState<{ day: Weekday; periodId: string } | null>(null);
  const [editingLive, setEditingLive] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
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
    setFocusDay(todayWeekday());
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
      toast({
        title: v.status === "published" ? "Opened published timetable" : "Timetable ready",
        description: "One timetable per section — edit this sheet, then publish.",
      });
    },
    onError: (e: Error) => {
      autoDraftForSectionRef.current = null;
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  // Auto-open/create the single timetable for this section (no multi-version).
  useEffect(() => {
    if (!sectionId || !versionsFetched || !caps.canCreate) return;
    if (versions.some((v) => v.status === "draft" || v.status === "published")) return;
    if (!templates.length) return;
    if (createVersionMut.isPending) return;
    if (autoDraftForSectionRef.current === sectionId) return;
    autoDraftForSectionRef.current = sectionId;
    createVersionMut.mutate();
  }, [
    sectionId,
    versionsFetched,
    versions,
    templates.length,
    caps.canCreate,
    createVersionMut.isPending,
  ]);

  const clearVersionMut = useMutation({
    mutationFn: async () => {
      if (!sectionId) throw new Error("Select a section first");
      // Clear both draft and published sheets for this section so it is fully empty.
      const targets = versions.filter(
        (v) => v.status === "draft" || v.status === "published"
      );
      if (!targets.length) {
        if (!activeVersionId) throw new Error("No timetable selected");
        return clearVersionSlots(activeVersionId, { includeLocked: true });
      }
      let deleted = 0;
      for (const v of targets) {
        // eslint-disable-next-line no-await-in-loop
        const r = await clearVersionSlots(v._id, { includeLocked: true });
        deleted += r.deleted || 0;
      }
      return { deleted, versionId: activeVersionId, includeLocked: true as const };
    },
    onSuccess: async (result) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["timetable-grid"] }),
        qc.invalidateQueries({ queryKey: ["timetable-versions", sessionId, sectionId] }),
        qc.invalidateQueries({ queryKey: ["class-board", sessionId] }),
        qc.invalidateQueries({ queryKey: ["section-schedule", sessionId] }),
        qc.invalidateQueries({ queryKey: ["my-teacher-schedule", sessionId] }),
      ]);
      setClearOpen(false);
      toast({
        title: result.deleted ? "Timetable cleared" : "Nothing to clear",
        description: result.deleted
          ? `Removed ${result.deleted} lesson${result.deleted === 1 ? "" : "s"} from this section (draft + published).`
          : "No lessons found for this section.",
      });
    },
    onError: (e: Error) =>
      toast({ title: "Could not clear", description: e.message, variant: "destructive" }),
  });

  const saveSlotMut = useMutation({
    mutationFn: () => {
      if (!slotDialog || !activeVersionId) throw new Error("No slot selected");
      const subjectIds = form.combineSubjects
        ? form.customSubjectIds
        : subjectOptions.find((o) => o.key === form.optionKey)?.subjectIds;
      if (!subjectIds?.length) throw new Error("Select a subject");
      if (form.combineSubjects && subjectIds.length < 2) {
        throw new Error("Select at least two subjects to combine");
      }
      const entries = subjectIds.map((subjectId) => {
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

  const [validationErrors, setValidationErrors] = useState<
    { code: string; message: string; day?: string; subjectId?: string }[]
  >([]);

  const validateMut = useMutation({
    mutationFn: () => validateTimetableVersion(activeVersionId, false),
    onSuccess: (r) => {
      if (r.valid) {
        setValidationErrors([]);
        toast({
          title: "Validation passed",
          description: r.warnings.length ? `${r.warnings.length} warning(s)` : "No issues found",
        });
        return;
      }
      setValidationErrors(r.errors || []);
      const first = r.errors?.[0];
      const where = first?.day ? `${DAY_FULL_LABELS[first.day as Weekday] || first.day}: ` : "";
      const detail = first?.message ? `${where}${first.message}` : null;
      toast({
        title: "Validation failed",
        description: detail
          ? `${detail}${r.errors.length > 1 ? ` (+${r.errors.length - 1} more — see list below)` : ""}`
          : `${r.errors.length} error(s)`,
        variant: "destructive",
      });
    },
    onError: (e: Error) =>
      toast({ title: "Validation failed", description: e.message, variant: "destructive" }),
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

  const workingDays = normalizeWorkingDays(grid?.workingDays);
  const lecturePeriods = (grid?.periods || []).filter((p) => p.type === "lecture");
  const displayDays = viewMode === "day" ? [focusDay] : workingDays;
  /** Day used for the side “lessons” list — today in week view when possible. */
  const lessonsDay = useMemo(() => {
    if (viewMode === "day") return focusDay;
    const today = todayWeekday();
    if (workingDays.includes(today)) return today;
    return workingDays[0] || focusDay;
  }, [viewMode, focusDay, workingDays]);
  const isLessonsToday = lessonsDay === todayWeekday();
  /** Kept for any legacy shared-day references in week chrome. */
  const sharedDay = lessonsDay;
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

  /** Lessons for the selected class (not school-wide). */
  const { data: classBoard } = useQuery({
    queryKey: ["class-board", sessionId, classId || "none", lessonsDay, "draft"],
    queryFn: () =>
      fetchClassBoard({
        sessionId,
        classId: classId || undefined,
        day: lessonsDay,
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
    if (!classId) return [];

    const map = new Map<string, Item>();
    const rows = (classBoard?.sections || []).filter((row) => {
      const rowClassId = String(row.class?._id || "");
      if (rowClassId !== String(classId)) return false;
      if (sectionId) return String(row.section?._id || "") === String(sectionId);
      return true;
    });
    const boardPeriods = (classBoard?.periods || []).filter((p) => p.type === "lecture");

    for (const row of rows) {
      for (const slot of row.slots) {
        const entries = scheduleSlotEntries(slot);
        if (!entries.length) continue;
        const period =
          boardPeriods.find((p) => slotMatchesPeriod(slot, p._id)) ||
          lecturePeriods.find((p) => slotMatchesPeriod(slot, p._id));
        const label = classSectionBoardLabel(
          row.class?.name,
          row.section?.name,
          row.section?.label,
        );
        const shared = Boolean(slot.combinedGroupId);
        const key = shared ? `shared:${slot.combinedGroupId}` : `slot:${slot._id}`;
        const existing = map.get(key);
        if (existing) {
          if (!existing.sections.includes(label)) existing.sections.push(label);
          continue;
        }
        map.set(key, {
          id: key,
          title: scheduleSlotTitle(slot),
          subjectName: entries[0]?.subject?.name || "",
          teachers: entries.map((e) => e.teacher?.name || "—").join(" / ") || "—",
          periodLabel: period?.label || `P${period?.order || ""}`,
          periodOrder: period?.order ?? 999,
          sections: [label],
          shared,
        });
      }
    }

    // Include current section grid slots (covers publish mode / board loading).
    const boardSectionLabel = classSectionBoardLabel(
      selectedClass?.name || selectedClass?.className,
      selectedSection?.name,
      undefined,
    );
    for (const slot of grid?.slots || []) {
      if (slot.day !== lessonsDay) continue;
      const entries = scheduleSlotEntries(slot);
      if (!entries.length) continue;
      const period = lecturePeriods.find((p) => slotMatchesPeriod(slot, p._id));
      const shared = Boolean(slot.combinedGroupId);
      const key = shared ? `shared:${slot.combinedGroupId}` : `slot:${slot._id}`;
      if (map.has(key)) continue;
      map.set(key, {
        id: key,
        title: scheduleSlotTitle(slot),
        subjectName: entries[0]?.subject?.name || "",
        teachers: entries.map((e) => e.teacher?.name || "—").join(" / ") || "—",
        periodLabel: period?.label || `P${period?.order || ""}`,
        periodOrder: period?.order ?? 999,
        sections: [boardSectionLabel || "Section"],
        shared,
      });
    }

    return [...map.values()].sort(
      (a, b) =>
        a.periodOrder - b.periodOrder ||
        a.sections[0]?.localeCompare(b.sections[0] || "") ||
        a.title.localeCompare(b.title),
    );
  }, [
    classId,
    sectionId,
    grid?.slots,
    classBoard,
    lessonsDay,
    lecturePeriods,
    selectedClass,
    selectedSection,
  ]);

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
        if (isDeletedSubject(e.subject)) continue;
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
  const activeSubjectIds = form.combineSubjects
    ? form.customSubjectIds
    : selectedOption?.subjectIds || [];
  const multiSubjectLesson = activeSubjectIds.length > 1;

  /** Session roster only. Teachers who can teach this subject are listed first. */
  const teachersForSubject = (subjectId: string) =>
    orderRosterForSubject(
      teacherProfiles,
      subjects.find((s) => s._id === subjectId),
    );

  const defaultTeacherForSubject = (subjectId: string, existing?: ScheduleSlot) => {
    if (existing) {
      const fromExisting = scheduleSlotEntries(existing).find(
        (e) => e.subject?._id === subjectId && !isDeletedSubject(e.subject)
      )?.teacher?._id;
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
  const gridLessonCount = grid?.slots?.length || 0;
  const canShowClearTimetable = canManageGrid && Boolean(sectionId);
  const canClearTimetable = canShowClearTimetable && Boolean(sessionId);
  const clearSectionLabel = selectedClass
    ? `${classDisplayName(selectedClass)}${selectedSection?.name ? ` · ${selectedSection.name}` : ""}`
    : "this section";

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
    const combineSubjects = isTimetableOnlyCombine(existing, subjectOptions);
    const optionKey = combineSubjects ? "" : optionKeyForSlot(existing, subjectOptions);
    const option = subjectOptions.find((o) => o.key === optionKey);
    const teachersBySubject: Record<string, string> = {};
    if (existing) {
      for (const e of scheduleSlotEntries(existing)) {
        if (e.subject?._id && e.teacher?._id && !isDeletedSubject(e.subject)) {
          teachersBySubject[e.subject._id] = e.teacher._id;
        }
      }
    } else if (option) {
      Object.assign(teachersBySubject, teachersBySubjectForOption(option, existing));
    }
    setForm({
      combineSubjects,
      optionKey,
      customSubjectIds: combineSubjects ? slotEntrySubjectIds(existing) : [],
      teachersBySubject,
      roomId: existing?.room?._id || "",
      dayApplyMode: "single",
      selectedDays: [day],
    });
    setSlotDialog({ day, period, existing });
  };

  const canSaveSlot =
    activeSubjectIds.length > 0 &&
    (!form.combineSubjects || activeSubjectIds.length >= 2) &&
    activeSubjectIds.every((id) => form.teachersBySubject[id]) &&
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

      <div className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
              <LayoutGrid className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight">
                Timetable Builder
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500 max-w-md">
                Plan and manage one timetable per section — edit the sheet, then publish when ready.
              </p>
            </div>
          </div>
          <div className="shrink-0 rounded-lg bg-primary/10 px-3 py-2 max-w-[14rem]">
            <p className="text-xs sm:text-sm italic leading-snug text-[#1a2b4b]/80">
              <span className="mr-1 text-primary not-italic font-serif text-base leading-none">
                &ldquo;
              </span>
              Education is the key to a better tomorrow.
              <span className="ml-0.5 text-primary not-italic font-serif text-base leading-none">
                &rdquo;
              </span>
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {sectionId && caps.canCreate && !draftVersion && !publishedVersion && (
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => createVersionMut.mutate()}
            disabled={createVersionMut.isPending}
          >
            <Plus className="h-3.5 w-3.5" /> Create timetable
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
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setEditingLive(false)}
              >
                <Check className="h-3.5 w-3.5" /> Done editing
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => validateMut.mutate()}
            >
              <AlertCircle className="h-3.5 w-3.5" /> Validate
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
            {canShowClearTimetable && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                disabled={!canClearTimetable || clearVersionMut.isPending}
                onClick={() => setClearOpen(true)}
                title="Clear all draft and published lessons for this section"
              >
                <Eraser className="h-3.5 w-3.5" /> Clear timetable
              </Button>
            )}
          </>
        )}
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
                  setValidationErrors([]);
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
                  setValidationErrors([]);
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
            {activeVersionId && (
              <Badge variant={grid?.version.status === "published" ? "default" : "secondary"}>
                {classLabel ? classDisplayName(classLabel) : "—"} · {sectionLabel?.name || "—"}
                {grid?.version.status === "published" ? " · Published" : " · Draft"}
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

          {validationErrors.length > 0 && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-destructive">
                  Validation errors ({validationErrors.length})
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => setValidationErrors([])}
                >
                  Dismiss
                </Button>
              </div>
              <ul className="space-y-1.5 text-sm text-destructive/90">
                {validationErrors.slice(0, 12).map((err, i) => (
                  <li key={`${err.code}-${err.day || ""}-${i}`} className="flex gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      {err.day
                        ? `${DAY_FULL_LABELS[err.day as Weekday] || err.day}: `
                        : ""}
                      {err.message}
                      {err.code ? (
                        <span className="ml-1 text-xs text-muted-foreground">({err.code})</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
              {validationErrors.length > 12 && (
                <p className="text-xs text-muted-foreground">
                  +{validationErrors.length - 12} more not shown
                </p>
              )}
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
            {canShowClearTimetable && (
              <button
                type="button"
                disabled={!canClearTimetable || clearVersionMut.isPending}
                onClick={() => setClearOpen(true)}
                className="flex w-full items-start gap-3 rounded-xl border border-destructive/20 px-3 py-2.5 text-left hover:bg-destructive/5 transition-colors disabled:pointer-events-none disabled:opacity-50"
              >
                <Eraser className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
                <span>
                  <span className="block text-sm font-medium text-destructive">
                    Clear timetable
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Empty draft + published for this section
                  </span>
                </span>
              </button>
            )}
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
              <h3 className="text-sm font-semibold">
                {isLessonsToday ? "Today's Lessons" : "Day Lessons"}
              </h3>
              <span className="text-[11px] text-muted-foreground">
                {selectedClass
                  ? `${classDisplayName(selectedClass)}${
                      selectedSection?.name ? ` · ${selectedSection.name}` : ""
                    }`
                  : "Select a class"}{" "}
                · {DAY_FULL_LABELS[lessonsDay]}
              </span>
            </div>
            {!classId ? (
              <p className="text-xs text-muted-foreground py-2">
                Select a class to see its lessons for this day.
              </p>
            ) : upcomingLessons.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                No lessons for this class on this day yet.
              </p>
            ) : (
              <ul className="space-y-2 max-h-[28rem] overflow-y-auto pr-0.5">
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
            <div className="space-y-2 rounded-md border p-3">
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  className="mt-0.5"
                  checked={form.combineSubjects}
                  onCheckedChange={(v) => {
                    const on = v === true;
                    setForm((f) => {
                      if (!on) {
                        return {
                          ...f,
                          combineSubjects: false,
                          customSubjectIds: [],
                          teachersBySubject: {},
                        };
                      }
                      const seed =
                        f.customSubjectIds.length >= 2
                          ? f.customSubjectIds
                          : selectedOption?.subjectIds ||
                            (f.optionKey ? [f.optionKey] : []);
                      return {
                        ...f,
                        combineSubjects: true,
                        optionKey: "",
                        customSubjectIds: seed.filter(Boolean),
                        teachersBySubject: f.teachersBySubject,
                      };
                    });
                  }}
                />
                <span>
                  <span className="block text-sm font-medium">
                    Combine subjects in this period
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Timetable only (e.g. Pst / Isl) — does not change admission choice groups.
                  </span>
                </span>
              </label>
            </div>

            {form.combineSubjects ? (
              <div className="space-y-2 rounded-md border p-3">
                <Label>Subjects (pick 2 or more)</Label>
                <p className="text-xs text-muted-foreground">
                  Each subject needs a different teacher. Cell shows as Subject / Subject.
                </p>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                  {subjects.map((s) => {
                    if (!s._id) return null;
                    const checked = form.customSubjectIds.includes(s._id);
                    return (
                      <label key={s._id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            setForm((f) => {
                              const next = new Set(f.customSubjectIds);
                              if (v) next.add(s._id);
                              else next.delete(s._id);
                              const customSubjectIds = [...next];
                              const teachersBySubject = { ...f.teachersBySubject };
                              for (const id of Object.keys(teachersBySubject)) {
                                if (!next.has(id)) delete teachersBySubject[id];
                              }
                              return { ...f, customSubjectIds, teachersBySubject };
                            });
                          }}
                        />
                        {s.name || "Untitled"}
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div>
                <Label>Subject</Label>
                <select
                  className="w-full h-10 rounded-md border px-3 text-sm"
                  value={form.optionKey}
                  onChange={(e) => {
                    const key = e.target.value;
                    const option = subjectOptions.find((o) => o.key === key);
                    setForm((f) => ({
                      ...f,
                      combineSubjects: false,
                      optionKey: key,
                      customSubjectIds: [],
                      teachersBySubject: teachersBySubjectForOption(option),
                      roomId: f.roomId,
                    }));
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
                    Admission choice group — students pick from these subjects. Assign one teacher
                    each.
                  </p>
                )}
              </div>
            )}

            {activeSubjectIds.map((subjectId) => {
              const sub = subjects.find((s) => s._id === subjectId);
              const label = multiSubjectLesson
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

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear this section timetable?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  This permanently empties{" "}
                  <span className="font-medium text-foreground">{clearSectionLabel}</span>
                  {gridLessonCount
                    ? ` (${gridLessonCount} lesson${gridLessonCount === 1 ? "" : "s"} on the open sheet)`
                    : ""}
                  .
                </p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>
                    <span className="font-medium text-foreground">Draft and published</span> sheets
                    for this section are both cleared.
                  </li>
                  <li>Locked lessons are removed too — the sheet becomes fully empty.</li>
                  <li>Other sections are not changed.</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearVersionMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={clearVersionMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                clearVersionMut.mutate();
              }}
            >
              {clearVersionMut.isPending ? "Clearing…" : "Clear full timetable"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


