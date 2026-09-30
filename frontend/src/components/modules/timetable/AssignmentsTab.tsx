import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Pencil,
  Save,
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
import PanelSearchBar from "@/components/modules/PanelSearchBar";
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

function StatCard({
  label,
  value,
  hint,
  accent,
  progress,
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: "default" | "warning" | "success";
  progress?: number;
  icon?: ReactNode;
}) {
  return (
    <Card
      className={cn(
        "p-4 shadow-sm border-slate-200/80",
        accent === "warning" && "border-amber-200 bg-amber-50/60",
        accent === "success" && "border-emerald-200 bg-emerald-50/50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="text-2xl font-semibold tabular-nums tracking-tight text-slate-900">{value}</p>
          {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
        </div>
        {icon ? (
          <div
            className={cn(
              "rounded-lg p-2 shrink-0",
              accent === "warning"
                ? "bg-amber-100 text-amber-600"
                : accent === "success"
                  ? "bg-emerald-100 text-emerald-600"
                  : "bg-blue-50 text-blue-600",
            )}
          >
            {icon}
          </div>
        ) : null}
      </div>
      {progress != null ? (
        <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              accent === "warning" ? "bg-amber-500" : "bg-blue-600",
            )}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      ) : null}
    </Card>
  );
}

function Donut({ assigned, total }: { assigned: number; total: number }) {
  const pct = total > 0 ? Math.round((assigned / total) * 100) : 0;
  const r = 36;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div className="relative mx-auto h-28 w-28">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#E2E8F0" strokeWidth="10" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="#2563EB"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-semibold tabular-nums text-slate-900">{pct}%</span>
        <span className="text-[10px] text-slate-500">Assigned</span>
      </div>
    </div>
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
  /** When provided with onSearchChange, search is controlled by the portal header. */
  search?: string;
  onSearchChange?: (value: string) => void;
  /** Hide the in-page title when the portal header already shows it. */
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
    () => Math.max(1, ...teacherLoad.map((t) => t.count), totalSubjects || 1),
    [teacherLoad, totalSubjects],
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

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      {!hidePageTitle ? (
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">Assign Subject Teachers</h2>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Assign a teacher to each subject, switch class or section freely — changes stay until you save.
            Teacher load updates as you assign.
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground max-w-3xl">
          Assign a teacher to each subject, switch class or section freely — changes stay until you save.
          Teacher load updates as you assign.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Subjects"
          value={totalSubjects}
          hint={totalSubjects ? `${assignedPct}% assigned in this section` : "No subjects yet"}
          progress={assignedPct}
          icon={<BookOpen className="h-4 w-4" />}
        />
        <StatCard
          label="Total Teachers"
          value={teachers.length}
          hint="Active teachers available"
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Assigned Subjects"
          value={`${assignedCount} / ${totalSubjects || 0}`}
          hint="In the selected section"
          accent="success"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <StatCard
          label="Unassigned Subjects"
          value={unassignedCount}
          hint={unassignedCount ? "Needs a teacher" : "All covered"}
          accent={unassignedCount ? "warning" : "default"}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3 min-w-0 flex-1">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Class</p>
              <div className="flex flex-wrap gap-1.5">
                {classes.map((c) => {
                  const active = c._id === classId;
                  const classSecIds = allSections.filter((s) => classIdOf(s) === c._id).map((s) => s._id);
                  const hasDirty = classSecIds.some((id) => dirtySections.has(id));
                  return (
                    <button
                      key={c._id}
                      type="button"
                      onClick={() => setClassId(c._id)}
                      className={cn(
                        "relative rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                        active
                          ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                      )}
                    >
                      {classDisplayName(c)}
                      {hasDirty ? (
                        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            {classId ? (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Section</p>
                <div className="flex flex-wrap gap-1.5">
                  {classSections.map((s) => {
                    const active = s._id === sectionId;
                    const prog = sectionProgress.get(s._id);
                    const hasDirty = dirtySections.has(s._id);
                    return (
                      <button
                        key={s._id}
                        type="button"
                        onClick={() => setSectionId(s._id)}
                        className={cn(
                          "relative inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                          active
                            ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                        )}
                      >
                        <span>{sectionDisplayName(s)}</span>
                        {prog && prog.total > 0 ? (
                          <span
                            className={cn(
                              "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums font-semibold",
                              active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500",
                            )}
                          >
                            {prog.assigned}/{prog.total}
                          </span>
                        ) : null}
                        {hasDirty ? (
                          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          {canEdit && (
            <div className="flex flex-wrap gap-2 shrink-0">
              <Button
                variant="outline"
                className="gap-2 border-blue-600 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                disabled={!sectionId || !currentDirty || saveMut.isPending || totalSubjects === 0}
                onClick={() => saveMut.mutate([sectionId])}
              >
                <Save className="h-4 w-4" />
                Save Section
              </Button>
              <Button
                className="gap-2 bg-blue-600 text-white hover:bg-blue-700"
                disabled={!dirty || saveMut.isPending}
                onClick={() => saveMut.mutate([...dirtySections])}
              >
                <Save className="h-4 w-4" />
                {saveMut.isPending ? "Saving…" : dirtyCount > 1 ? `Save All (${dirtyCount})` : "Save All"}
              </Button>
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <Card className="overflow-hidden min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 bg-muted/20">
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-semibold truncate">
                {selectedClass ? classDisplayName(selectedClass) : "—"}
                {selectedSection ? (
                  <span className="text-muted-foreground font-normal">
                    {" "}
                    · Section {sectionDisplayName(selectedSection)}
                  </span>
                ) : null}
              </p>
              <div className="flex items-center gap-2 max-w-xs">
                <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${assignedPct}%` }}
                  />
                </div>
                <span className="text-xs tabular-nums text-slate-500 shrink-0">
                  {assignedCount}/{totalSubjects || 0} · {assignedPct}%
                </span>
              </div>
            </div>
            {currentDirty ? (
              <Badge variant="outline" className="border-amber-300 text-amber-700">
                Unsaved changes
              </Badge>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
            {onSearchChange == null && (
              <PanelSearchBar
                value={search}
                onChange={setSearch}
                placeholder="Search subject or teacher…"
                className="max-w-xs flex-1 min-w-[12rem]"
              />
            )}
            <select
              className="h-9 rounded-md border bg-background px-2.5 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="all">All status</option>
              <option value="assigned">Assigned</option>
              <option value="unassigned">Unassigned</option>
            </select>
            <select
              className="h-9 rounded-md border bg-background px-2.5 text-sm max-w-[10rem]"
              value={teacherFilter}
              onChange={(e) => setTeacherFilter(e.target.value)}
            >
              <option value="all">All teachers</option>
              {teachers.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border bg-background px-2.5 text-sm"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
            >
              <option value="subject">Sort by subject</option>
              <option value="status">Sort by status</option>
              <option value="teacher">Sort by teacher</option>
            </select>
          </div>

          {!classId || !sectionId ? (
            <p className="p-10 text-sm text-center text-muted-foreground">
              Select a class and section to assign teachers.
            </p>
          ) : isLoading ? (
            <p className="p-10 text-sm text-center text-muted-foreground">Loading…</p>
          ) : filteredSubjects.length === 0 ? (
            <p className="p-10 text-sm text-center text-muted-foreground">
              {subjects.length === 0 ? "No subjects for this class yet." : "No subjects match your filters."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    <th className="text-left p-3 font-medium w-10">#</th>
                    <th className="text-left p-3 font-medium">Subject</th>
                    <th className="text-left p-3 font-medium w-24">Code</th>
                    <th className="text-left p-3 font-medium min-w-[15rem]">Teacher</th>
                    <th className="text-left p-3 font-medium w-32">Status</th>
                    <th className="text-right p-3 font-medium w-16">Actions</th>
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
                          "border-b last:border-0",
                          unassigned && "bg-amber-50/50 dark:bg-amber-950/15",
                        )}
                      >
                        <td className="p-3 text-muted-foreground tabular-nums">{idx + 1}</td>
                        <td className="p-3 font-medium">{subjectDisplayName(sub)}</td>
                        <td className="p-3">
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                            {subjectDisplayCode(sub) || "—"}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2 max-w-sm">
                            {teacher ? (
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[11px] font-semibold text-blue-700">
                                {initials(teacher.name)}
                              </span>
                            ) : (
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-amber-300 text-amber-600">
                                <Users className="h-3.5 w-3.5" />
                              </span>
                            )}
                            <select
                              id={`teacher-select-${sub._id}`}
                              className={cn(
                                "h-9 flex-1 min-w-0 rounded-md border bg-white px-2.5 text-sm",
                                unassigned && "border-amber-300 text-slate-400",
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
                        <td className="p-3">
                          {unassigned ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                              <AlertTriangle className="h-3 w-3" />
                              Unassigned
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" />
                              Assigned
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            disabled={!canEdit}
                            title="Change teacher"
                            onClick={() => {
                              document.getElementById(`teacher-select-${sub._id}`)?.focus();
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <aside className="space-y-3 xl:sticky xl:top-4 self-start">
          <Card className="p-4 space-y-3 border-slate-200/80">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Teacher Workload</h3>
              <Badge variant="secondary" className="tabular-nums bg-blue-50 text-blue-700 hover:bg-blue-50">
                {teachersWithLoad.length}/{teachers.length}
              </Badge>
            </div>
            <p className="text-xs text-slate-500">Updates live as you assign (includes unsaved).</p>
            {teachers.length === 0 ? (
              <p className="text-sm text-slate-500 py-2">No teachers found.</p>
            ) : (
              <ul className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {(teachersWithLoad.length ? teachersWithLoad : teacherLoad.slice(0, 6)).map(
                  ({ teacher, count }) => {
                    const pct = Math.round((count / maxTeacherLoad) * 100);
                    return (
                      <li key={teacher._id} className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[11px] font-semibold text-blue-700">
                            {initials(teacher.name)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-sm font-medium text-slate-800">{teacher.name}</p>
                              <span className="tabular-nums text-xs font-semibold text-emerald-600 shrink-0">
                                {pct}%
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500">
                              {count} subject{count === 1 ? "" : "s"} assigned
                            </p>
                            <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-emerald-500 transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  },
                )}
              </ul>
            )}
            <div className="border-t border-slate-100 pt-2 text-xs text-slate-500 flex justify-between gap-2">
              <span>{teachersWithLoad.length} teachers assigned</span>
              <span>{unassignedCount} subjects unassigned</span>
            </div>
            {dirtyCount > 0 ? (
              <p className="text-xs text-amber-600">
                {dirtyCount} section{dirtyCount === 1 ? "" : "s"} with unsaved changes
              </p>
            ) : null}
          </Card>

          <Card className="p-4 space-y-2 border-slate-200/80">
            <h3 className="text-sm font-semibold text-slate-900">Quick Actions</h3>
            <div className="grid gap-2">
              <Link
                to={systemConfigHref(role, "teachers")}
                className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 transition-colors"
              >
                <UserPlus className="h-4 w-4" />
                Add Teacher
              </Link>
              <Link
                to={studentManagementHref(role, "subjects")}
                className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800 hover:bg-blue-100 transition-colors"
              >
                <BookOpen className="h-4 w-4" />
                Manage Subjects
              </Link>
              <Link
                to={systemConfigHref(role, "timetable-rules")}
                className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 transition-colors"
              >
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </div>
          </Card>

          <Card className="p-4 space-y-3 border-slate-200/80">
            <h3 className="text-sm font-semibold text-slate-900">Assignment Summary</h3>
            <Donut assigned={assignedCount} total={totalSubjects} />
            <ul className="space-y-1.5 text-xs">
              <li className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-slate-500">
                  <span className="h-2 w-2 rounded-full bg-blue-600" /> Assigned
                </span>
                <span className="font-medium tabular-nums text-slate-800">{assignedCount}</span>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-slate-500">
                  <span className="h-2 w-2 rounded-full bg-amber-500" /> Unassigned
                </span>
                <span className="font-medium tabular-nums text-slate-800">{unassignedCount}</span>
              </li>
              <li className="flex items-center justify-between gap-2 border-t border-slate-100 pt-1.5">
                <span className="text-slate-500">Total subjects</span>
                <span className="font-semibold tabular-nums text-slate-900">{totalSubjects}</span>
              </li>
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
