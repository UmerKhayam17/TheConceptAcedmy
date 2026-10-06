import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  FileBarChart2,
  MoreVertical,
  Pencil,
  Save,
  Search,
  Settings,
  UserPlus,
  Users,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Role } from "@/lib/auth";
import type { ModuleActionCaps } from "@/lib/permissions";
import {
  classDisplayName,
  fetchClasses,
  fetchSections,
  fetchSubjects,
  sectionDisplayName,
  subjectDisplayCode,
  subjectDisplayName,
  type SchoolSubject,
} from "@/lib/configApi";
import { fetchUsers } from "@/lib/usersApi";
import {
  fetchTeacherAssignments,
  syncSectionSubjectTeachers,
} from "@/lib/timetableApi";
import { systemConfigHref } from "@/lib/systemConfigMenus";
import { studentManagementHref } from "@/lib/studentManagementMenus";
import { moduleHref } from "@/lib/panelMenus";
import { cn } from "@/lib/utils";

type SectionDraft = Record<string, string>;
type StatusFilter = "all" | "assigned" | "unassigned";
type SortMode = "subject" | "status" | "teacher";

function classIdOf(entity: { class?: string | { _id: string } } | null | undefined): string {
  if (!entity?.class) return "";
  return typeof entity.class === "object" ? entity.class._id : String(entity.class);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function buildDraftFromRows(
  sectionId: string,
  subjects: SchoolSubject[],
  rows: Array<{ section?: { _id: string }; subject?: { _id: string }; teacher?: { _id: string } }>,
): SectionDraft {
  const next: SectionDraft = {};
  for (const sub of subjects) {
    const assigned = rows.find(
      (r) => r.section?._id === sectionId && r.subject?._id === sub._id,
    );
    next[sub._id] = assigned?.teacher?._id || "";
  }
  return next;
}

const selectClass =
  "h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30";

function MetricCard({
  title,
  value,
  subtitle,
  icon,
  iconBg,
  iconColor,
  progress,
  progressColor = "bg-blue-600",
}: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: ReactNode;
  iconBg: string;
  iconColor: string;
  progress?: number;
  progressColor?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", iconBg, iconColor)}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">{value}</p>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
          {progress != null ? (
            <div className="mt-2.5 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", progressColor)}
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  dirty,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  dirty?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-sm font-medium transition-colors",
        active
          ? "border-blue-600 bg-blue-600 text-white shadow-sm"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
      )}
    >
      {children}
      {dirty ? <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500" /> : null}
    </button>
  );
}

export default function AssignmentsTab({
  sessionId,
  caps,
  search: searchProp,
  onSearchChange,
  hidePageTitle = false,
}: {
  sessionId: string;
  caps: ModuleActionCaps;
  search?: string;
  onSearchChange?: (value: string) => void;
  hidePageTitle?: boolean;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { role: roleParam } = useParams();
  const role = (roleParam || "admin") as Role;
  const canEdit = caps.canCreate || caps.canEdit;

  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [internalSearch, setInternalSearch] = useState("");
  const search = searchProp ?? internalSearch;
  const setSearch = onSearchChange ?? setInternalSearch;
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("subject");
  const [draftsBySection, setDraftsBySection] = useState<Record<string, SectionDraft>>({});
  const [dirtySections, setDirtySections] = useState<Set<string>>(() => new Set());
  const [subjectsByClass, setSubjectsByClass] = useState<Record<string, SchoolSubject[]>>({});

  const { data: classes = [] } = useQuery({
    queryKey: ["config-classes", sessionId],
    queryFn: () => fetchClasses(sessionId),
    enabled: !!sessionId,
  });

  const { data: allSections = [] } = useQuery({
    queryKey: ["config-sections-all", sessionId],
    queryFn: () => fetchSections({ sessionId }),
    enabled: !!sessionId,
  });

  const { data: classSections = [] } = useQuery({
    queryKey: ["config-sections", classId, sessionId],
    queryFn: () => fetchSections({ classId, sessionId }),
    enabled: !!classId,
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ["config-subjects", classId],
    queryFn: () => fetchSubjects(classId),
    enabled: !!classId,
  });

  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: fetchUsers });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["timetable-assignments", sessionId],
    queryFn: () => fetchTeacherAssignments({ sessionId }),
    enabled: !!sessionId,
  });

  const teachers = useMemo(
    () =>
      users
        .filter((u) => {
          const rn = typeof u.role === "object" && u.role?.name ? u.role.name : "";
          return rn === "teacher" || rn === "admin";
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    [users],
  );

  useEffect(() => {
    setClassId("");
    setSectionId("");
    setDraftsBySection({});
    setDirtySections(new Set());
    setSubjectsByClass({});
  }, [sessionId]);

  useEffect(() => {
    if (!classId && classes.length) setClassId(classes[0]._id);
  }, [classes, classId]);

  useEffect(() => {
    if (!classId) {
      setSectionId("");
      return;
    }
    if (!classSections.some((s) => s._id === sectionId)) {
      setSectionId(classSections[0]?._id || "");
    }
  }, [classId, classSections, sectionId]);

  useEffect(() => {
    if (!classId || !subjects.length) return;
    setSubjectsByClass((prev) => ({ ...prev, [classId]: subjects }));
  }, [classId, subjects]);

  useEffect(() => {
    if (!sectionId || !subjects.length) return;
    if (dirtySections.has(sectionId)) return;
    setDraftsBySection((prev) => ({
      ...prev,
      [sectionId]: buildDraftFromRows(sectionId, subjects, rows),
    }));
  }, [sectionId, subjects, rows, dirtySections]);

  const draft = draftsBySection[sectionId] || {};
  const dirty = dirtySections.size > 0;
  const currentDirty = dirtySections.has(sectionId);

  const assignedCount = subjects.filter((s) => draft[s._id]).length;
  const totalSubjects = subjects.length;
  const unassignedCount = Math.max(0, totalSubjects - assignedCount);
  const assignedPct = totalSubjects > 0 ? Math.round((assignedCount / totalSubjects) * 100) : 0;

  const sectionProgress = useMemo(() => {
    const map = new Map<string, { assigned: number; total: number }>();
    for (const sec of classSections) {
      const d = draftsBySection[sec._id];
      let assigned = 0;
      if (d) {
        assigned = subjects.filter((s) => d[s._id]).length;
      } else {
        assigned = subjects.filter((s) =>
          rows.some((r) => r.section?._id === sec._id && r.subject?._id === s._id && r.teacher?._id),
        ).length;
      }
      map.set(sec._id, { assigned, total: subjects.length });
    }
    return map;
  }, [classSections, draftsBySection, subjects, rows]);

  const loadByTeacher = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const sec = r.section?._id;
      const sub = r.subject?._id;
      const tid = r.teacher?._id;
      if (!sec || !sub || !tid) continue;
      if (draftsBySection[sec]) continue;
      map.set(tid, (map.get(tid) || 0) + 1);
    }
    for (const draftMap of Object.values(draftsBySection)) {
      for (const tid of Object.values(draftMap)) {
        if (!tid) continue;
        map.set(tid, (map.get(tid) || 0) + 1);
      }
    }
    return map;
  }, [rows, draftsBySection]);

  const teacherLoad = useMemo(
    () =>
      teachers
        .map((t) => ({ teacher: t, count: loadByTeacher.get(t._id) || 0 }))
        .sort((a, b) => b.count - a.count || a.teacher.name.localeCompare(b.teacher.name)),
    [teachers, loadByTeacher],
  );

  const maxTeacherLoad = useMemo(
    () => Math.max(1, ...teacherLoad.map((t) => t.count), 1),
    [teacherLoad],
  );

  const teachersWithLoad = teacherLoad.filter((t) => t.count > 0);

  const filteredSubjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = [...subjects];

    list = list.filter((s) => {
      const tid = draft[s._id] || "";
      if (statusFilter === "assigned" && !tid) return false;
      if (statusFilter === "unassigned" && tid) return false;
      if (teacherFilter !== "all" && tid !== teacherFilter) return false;
      if (!q) return true;
      const name = subjectDisplayName(s).toLowerCase();
      const code = subjectDisplayCode(s).toLowerCase();
      const teacherName = teachers.find((t) => t._id === tid)?.name?.toLowerCase() || "";
      return name.includes(q) || code.includes(q) || teacherName.includes(q);
    });

    list.sort((a, b) => {
      if (sortMode === "status") {
        const aa = draft[a._id] ? 1 : 0;
        const bb = draft[b._id] ? 1 : 0;
        if (aa !== bb) return aa - bb;
      }
      if (sortMode === "teacher") {
        const an = teachers.find((t) => t._id === draft[a._id])?.name || "";
        const bn = teachers.find((t) => t._id === draft[b._id])?.name || "";
        const cmp = an.localeCompare(bn);
        if (cmp) return cmp;
      }
      return subjectDisplayName(a).localeCompare(subjectDisplayName(b));
    });

    return list;
  }, [subjects, search, draft, teachers, statusFilter, teacherFilter, sortMode]);

  const setTeacher = (subjectId: string, teacherId: string) => {
    if (!sectionId) return;
    setDraftsBySection((prev) => ({
      ...prev,
      [sectionId]: { ...(prev[sectionId] || {}), [subjectId]: teacherId },
    }));
    setDirtySections((prev) => new Set(prev).add(sectionId));
  };

  const resolveClassForSection = (secId: string) => {
    const sec = allSections.find((s) => s._id === secId);
    return classIdOf(sec);
  };

  const saveMut = useMutation({
    mutationFn: async (sectionIds: string[]) => {
      for (const secId of sectionIds) {
        const clsId = resolveClassForSection(secId) || classId;
        const classSubjects = subjectsByClass[clsId] || (clsId === classId ? subjects : []);
        const sectionDraft = draftsBySection[secId] || {};
        if (!clsId) throw new Error("Could not resolve class for a section.");
        const loaded = classSubjects.length ? classSubjects : await fetchSubjects(clsId);
        if (!classSubjects.length) {
          setSubjectsByClass((prev) => ({ ...prev, [clsId]: loaded }));
        }
        await syncSectionSubjectTeachers({
          session: sessionId,
          class: clsId,
          section: secId,
          items: loaded.map((s) => ({
            subject: s._id,
            teacher: sectionDraft[s._id] || null,
          })),
        });
      }
    },
    onSuccess: (_data, sectionIds) => {
      qc.invalidateQueries({ queryKey: ["timetable-assignments", sessionId] });
      setDirtySections((prev) => {
        const next = new Set(prev);
        for (const id of sectionIds) next.delete(id);
        return next;
      });
      toast({
        title: sectionIds.length > 1 ? "All assignments saved" : "Section assignments saved",
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (!sessionId) return null;

  const selectedClass = classes.find((c) => c._id === classId);
  const selectedSection = classSections.find((s) => s._id === sectionId);
  const dirtyCount = dirtySections.size;
  const donutR = 38;
  const donutC = 2 * Math.PI * donutR;
  const donutDash = (assignedPct / 100) * donutC;

  return (
    <div className="bg-slate-50/80 px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-blue-100 bg-[#F0F7FF] px-5 py-4 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
            <Users className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold tracking-tight text-slate-900">Assign Subject Teachers</h2>
            <p className="mt-1 text-sm leading-snug text-slate-600 whitespace-pre-line">
              {`Assign a teacher to each subject, switch class or section freely — changes stay until you save.
Teacher load updates as you assign.`}
            </p>
          </div>
        </div>
        <p className="shrink-0 text-sm italic text-blue-600 sm:max-w-[14rem] sm:text-right">
          “Great teachers build great futures.”
        </p>
      </div>

      {/* Left half: KPI cards + filters + table | Right: workload & panels aligned to top */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,26%)] xl:items-start">
        <div className="min-w-0 space-y-4">
          <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Total Subjects"
              value={totalSubjects}
              subtitle={`Assigned: ${assignedCount} | Unassigned: ${unassignedCount}`}
              icon={<BookOpen className="h-5 w-5" />}
              iconBg="bg-blue-50"
              iconColor="text-blue-600"
              progress={assignedPct}
              progressColor="bg-blue-600"
            />
            <MetricCard
              title="Total Teachers"
              value={teachers.length}
              subtitle="Active Teachers"
              icon={<Users className="h-5 w-5" />}
              iconBg="bg-emerald-50"
              iconColor="text-emerald-600"
            />
            <MetricCard
              title="Assigned Subjects"
              value={assignedCount}
              subtitle={`Out of ${totalSubjects || 0}`}
              icon={<CheckCircle2 className="h-5 w-5" />}
              iconBg="bg-violet-50"
              iconColor="text-violet-600"
            />
            <MetricCard
              title="Unassigned Subjects"
              value={unassignedCount}
              subtitle="Need Teacher Assignment"
              icon={<AlertTriangle className="h-5 w-5" />}
              iconBg="bg-amber-50"
              iconColor="text-amber-600"
            />
          </div>

          {/* Class / section bar */}
          <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-3 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-600 w-16 shrink-0">Class</span>
                  <div className="flex flex-wrap gap-2">
                    {classes.length === 0 ? (
                      <span className="text-sm text-slate-400">No classes</span>
                    ) : (
                      classes.map((c) => {
                        const classSecIds = allSections
                          .filter((s) => classIdOf(s) === c._id)
                          .map((s) => s._id);
                        return (
                          <Chip
                            key={c._id}
                            active={c._id === classId}
                            dirty={classSecIds.some((id) => dirtySections.has(id))}
                            onClick={() => setClassId(c._id)}
                          >
                            {classDisplayName(c)}
                          </Chip>
                        );
                      })
                    )}
                  </div>
                </div>
                {classId ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-600 w-16 shrink-0">Section</span>
                    <div className="flex flex-wrap gap-2">
                      {classSections.map((s) => {
                        const prog = sectionProgress.get(s._id);
                        return (
                          <Chip
                            key={s._id}
                            active={s._id === sectionId}
                            dirty={dirtySections.has(s._id)}
                            onClick={() => setSectionId(s._id)}
                          >
                            <span>{sectionDisplayName(s)}</span>
                            {prog && prog.total > 0 ? (
                              <span
                                className={cn(
                                  "rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                                  s._id === sectionId
                                    ? "bg-white/20 text-white"
                                    : "bg-slate-100 text-slate-500",
                                )}
                              >
                                {prog.assigned}/{prog.total}
                              </span>
                            ) : null}
                          </Chip>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>

              {canEdit ? (
                <div className="flex flex-wrap gap-2 shrink-0">
                  <Button
                    variant="outline"
                    className="h-9 gap-2 border-blue-600 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                    disabled={!sectionId || !currentDirty || saveMut.isPending || totalSubjects === 0}
                    onClick={() => saveMut.mutate([sectionId])}
                  >
                    <Save className="h-4 w-4" />
                    Save Section
                  </Button>
                  <Button
                    className="h-9 gap-2 bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                    disabled={!dirty || saveMut.isPending}
                    onClick={() => saveMut.mutate([...dirtySections])}
                  >
                    <Save className="h-4 w-4" />
                    {saveMut.isPending
                      ? "Saving…"
                      : dirtyCount > 1
                        ? `Save All (${dirtyCount})`
                        : "Save All"}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>

          <Card className="overflow-hidden rounded-xl border-slate-200/80 shadow-sm bg-white min-w-0">
            <div className="border-b border-slate-100 px-5 py-3.5">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between xl:gap-4">
                {/* Left: title + badge + progress */}
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-slate-900 truncate leading-tight">
                      {selectedClass ? classDisplayName(selectedClass) : "—"}
                      {selectedSection ? (
                        <span className="font-normal text-slate-500">
                          {" "}
                          · Section {sectionDisplayName(selectedSection)}
                        </span>
                      ) : null}
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {assignedCount} of {totalSubjects || 0} subjects assigned
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100 shrink-0">
                    <CheckCircle2 className="h-3 w-3" />
                    {assignedCount} subjects assigned
                  </span>
                  {currentDirty ? (
                    <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-100 shrink-0">
                      Unsaved
                    </span>
                  ) : null}
                  <div className="flex items-center gap-2 shrink-0 min-w-[7rem] max-w-[10rem]">
                    <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all"
                        style={{ width: `${assignedPct}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold tabular-nums text-slate-700 w-8">
                      {assignedPct}%
                    </span>
                  </div>
                </div>

                {/* Right: search + filters — same line */}
                <div className="flex flex-wrap items-center gap-2 shrink-0 xl:justify-end">
                  <div className="relative w-full sm:w-[14rem] xl:w-[15rem]">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      className="h-9 w-full rounded-full border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      placeholder="Search subject or teacher…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <select
                    className={cn(selectClass, "rounded-full")}
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  >
                    <option value="all">All Status</option>
                    <option value="assigned">Assigned</option>
                    <option value="unassigned">Unassigned</option>
                  </select>
                  <select
                    className={cn(selectClass, "rounded-full max-w-[9.5rem]")}
                    value={teacherFilter}
                    onChange={(e) => setTeacherFilter(e.target.value)}
                  >
                    <option value="all">All Teachers</option>
                    {teachers.map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className={cn(selectClass, "rounded-full")}
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as SortMode)}
                  >
                    <option value="subject">Sort by</option>
                    <option value="status">Sort by status</option>
                    <option value="teacher">Sort by teacher</option>
                  </select>
                </div>
              </div>
            </div>

            {!classId || !sectionId ? (
              <p className="p-10 text-center text-sm text-slate-400">Select a class and section to assign teachers.</p>
            ) : isLoading ? (
              <p className="p-10 text-center text-sm text-slate-400">Loading…</p>
            ) : filteredSubjects.length === 0 ? (
              <p className="p-10 text-center text-sm text-slate-400">
                {subjects.length === 0 ? "No subjects for this class yet." : "No subjects match your filters."}
              </p>
            ) : (
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80 text-slate-500">
                    <th className="w-8 px-2 py-2 text-left font-medium">#</th>
                    <th className="w-[22%] px-2 py-2 text-left font-medium">Subject</th>
                    <th className="w-[14%] px-2 py-2 text-left font-medium">Code</th>
                    <th className="w-[34%] px-2 py-2 text-left font-medium">Teacher</th>
                    <th className="w-[18%] px-2 py-2 text-left font-medium">Status</th>
                    <th className="w-10 px-2 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubjects.map((sub, idx) => {
                    const teacherId = draft[sub._id] || "";
                    const unassigned = !teacherId;
                    const teacher = teachers.find((t) => t._id === teacherId);
                    return (
                      <tr
                        key={sub._id}
                        className={cn(
                          "border-b border-slate-100 last:border-0",
                          unassigned ? "bg-amber-50/70" : "bg-white hover:bg-slate-50/60",
                        )}
                      >
                        <td className="px-2 py-2 tabular-nums text-slate-400">{idx + 1}</td>
                        <td className="px-2 py-2 font-medium text-slate-800 truncate">
                          {subjectDisplayName(sub)}
                        </td>
                        <td className="px-2 py-2">
                          <span className="inline-block max-w-full truncate rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                            {subjectDisplayCode(sub) || "—"}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex min-w-0 items-center gap-1.5">
                            {teacher ? (
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[9px] font-semibold text-white">
                                {initials(teacher.name)}
                              </span>
                            ) : (
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-400">
                                <Users className="h-3 w-3" />
                              </span>
                            )}
                            <select
                              id={`teacher-select-${sub._id}`}
                              className={cn(
                                "h-8 min-w-0 flex-1 rounded-md border bg-white px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/30",
                                unassigned
                                  ? "border-amber-200 text-slate-400"
                                  : "border-slate-200 text-slate-800",
                              )}
                              value={teacherId}
                              disabled={!canEdit}
                              onChange={(e) => setTeacher(sub._id, e.target.value)}
                            >
                              <option value="">Select teacher…</option>
                              {teachers.map((t) => (
                                <option key={t._id} value={t._id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          {unassigned ? (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                              <AlertTriangle className="h-2.5 w-2.5" />
                              Unassigned
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                              <CheckCircle2 className="h-2.5 w-2.5" />
                              Assigned
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button
                            type="button"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-blue-600 hover:bg-blue-50 disabled:opacity-40"
                            disabled={!canEdit}
                            title="Change teacher"
                            onClick={() =>
                              document.getElementById(`teacher-select-${sub._id}`)?.focus()
                            }
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}
          </Card>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4 self-start">
          {/* Teacher Workload */}
          <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Teacher Workload</h3>
            </div>
            {teachers.length === 0 ? (
              <p className="text-sm text-slate-400 py-2">No teachers found.</p>
            ) : (
              <ul className="space-y-3.5">
                {(teachersWithLoad.length ? teachersWithLoad : teacherLoad.slice(0, 8)).map(
                  ({ teacher, count }) => {
                    const pct = Math.round((count / maxTeacherLoad) * 100);
                    return (
                      <li key={teacher._id} className="flex items-start gap-2.5">
                        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-semibold text-white">
                          {initials(teacher.name)}
                        </span>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-800">{teacher.name}</p>
                              <p className="text-xs text-emerald-600 font-medium">
                                {count} subject{count === 1 ? "" : "s"} assigned
                              </p>
                            </div>
                            <button type="button" className="text-slate-300 hover:text-slate-500 p-0.5">
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-emerald-500 transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-[11px] font-semibold tabular-nums text-emerald-600 w-8 text-right">
                              {pct}%
                            </span>
                          </div>
                        </div>
                      </li>
                    );
                  },
                )}
              </ul>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs">
              <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600">
                <Users className="h-3.5 w-3.5" />
                {teachersWithLoad.length} Teachers assigned
              </span>
              <span className="inline-flex items-center gap-1.5 font-medium text-amber-600">
                <AlertTriangle className="h-3.5 w-3.5" />
                {unassignedCount} Subjects unassigned
              </span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm space-y-2.5">
            <h3 className="text-sm font-semibold text-slate-900">Quick Actions</h3>
            <div className="space-y-2">
              <Link
                to={systemConfigHref(role, "teachers")}
                className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50/80 px-3 py-2.5 transition-colors hover:bg-emerald-50"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                  <UserPlus className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-800">Add Teacher</span>
                  <span className="block text-xs text-slate-500">Register a new teacher</span>
                </span>
              </Link>
              <Link
                to={studentManagementHref(role, "subjects")}
                className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/80 px-3 py-2.5 transition-colors hover:bg-blue-50"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <BookOpen className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-800">Manage Subjects</span>
                  <span className="block text-xs text-slate-500">Add or edit subjects</span>
                </span>
              </Link>
              <Link
                to={moduleHref(role, "reports")}
                className="flex items-start gap-3 rounded-xl border border-violet-100 bg-violet-50/80 px-3 py-2.5 transition-colors hover:bg-violet-50"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
                  <FileBarChart2 className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-800">View Reports</span>
                  <span className="block text-xs text-slate-500">Teacher & subject reports</span>
                </span>
              </Link>
              <Link
                to={systemConfigHref(role, "timetable-rules")}
                className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-2.5 transition-colors hover:bg-amber-50"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                  <Settings className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-800">Settings</span>
                  <span className="block text-xs text-slate-500">Configure academic settings</span>
                </span>
              </Link>
            </div>
          </div>

          {/* Assignment Summary */}
          <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Assignment Summary</h3>
            <div className="flex items-center gap-4">
              <div className="relative h-[5.5rem] w-[5.5rem] shrink-0">
                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                  <circle cx="50" cy="50" r={donutR} fill="none" stroke="#FEF3C7" strokeWidth="10" />
                  <circle
                    cx="50"
                    cy="50"
                    r={donutR}
                    fill="none"
                    stroke="#10B981"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${donutDash} ${donutC - donutDash}`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-bold tabular-nums text-slate-900">{assignedPct}%</span>
                </div>
              </div>
              <ul className="space-y-2 text-xs flex-1 min-w-0">
                <li className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-slate-600">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> Assigned
                  </span>
                  <span className="font-semibold tabular-nums text-slate-800">{assignedCount}</span>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-slate-600">
                    <span className="h-2 w-2 rounded-full bg-amber-400" /> Unassigned
                  </span>
                  <span className="font-semibold tabular-nums text-slate-800">{unassignedCount}</span>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-slate-600">
                    <span className="h-2 w-2 rounded-full bg-slate-300" /> Total Subjects
                  </span>
                  <span className="font-semibold tabular-nums text-slate-800">{totalSubjects}</span>
                </li>
              </ul>
            </div>
            <p className="text-center text-xs text-slate-500">
              {assignedCount} of {totalSubjects || 0} subjects assigned
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
