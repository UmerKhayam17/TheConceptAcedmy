import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChevronLeft,
  ChevronRight,
  Info,
  Layers,
  List,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { ModuleActionCaps } from "@/lib/permissions";
import {
  createAcademySection,
  deleteAcademySection,
  fetchAcademyClasses,
  fetchAcademySectionsBySession,
  fetchAcademyStudents,
  fetchSectionsByClass,
  fetchSubjectsByClass,
  updateAcademySection,
  type AcademySection,
  type AcademySectionWithClass,
} from "@/lib/studentManagementApi";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import ClassProgramSelect from "@/components/modules/ClassProgramSelect";
import { classDisplayName } from "@/lib/configApi";
import { matchesPanelSearch } from "@/lib/panelSearch";
import { useSessionScope } from "@/components/modules/timetable/SessionBar";
import { sessionLabelFromAcademyClass } from "./studentDisplayUtils";

const QUICK_SECTIONS = ["A", "B", "C", "D"] as const;
const PAGE_SIZE = 10;

function sectionIdOf(student: { sectionId?: string | { _id: string } | null }): string {
  if (!student.sectionId) return "";
  return typeof student.sectionId === "object" ? student.sectionId._id : String(student.sectionId);
}

function classIdOf(section: AcademySection | AcademySectionWithClass): string {
  if (!section.classId) return "";
  return typeof section.classId === "object" ? section.classId._id : String(section.classId);
}

function classNameOf(
  section: AcademySection | AcademySectionWithClass,
  classes: { _id: string; className: string }[],
): string {
  const withMeta = section as AcademySectionWithClass;
  if (withMeta.className) return withMeta.className;
  if (typeof section.classId === "object" && section.classId?.className) {
    return section.classId.className;
  }
  return classes.find((c) => c._id === classIdOf(section))?.className || "—";
}

function sessionLabelOf(
  section: AcademySection | AcademySectionWithClass,
  classes: { _id: string; className: string }[],
): string {
  const withMeta = section as AcademySectionWithClass;
  if (withMeta.sessionName) return withMeta.sessionName;
  const cls = classes.find((c) => c._id === classIdOf(section));
  return cls ? sessionLabelFromAcademyClass(cls as never) : "";
}

export default function SectionsTab({ caps, sessionId }: { caps: ModuleActionCaps; sessionId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [classFilter, setClassFilter] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<AcademySection | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({
    classId: "",
    sectionName: "",
    useClassSubjects: true,
    subjectIds: [] as string[],
    status: "active" as "active" | "inactive",
  });
  const { apiSessionId, writable, hasScope, isAll } = useSessionScope(sessionId);

  const { data: classes = [] } = useQuery({
    queryKey: ["academy-classes", sessionId],
    queryFn: () => fetchAcademyClasses({ status: "active", sessionId: apiSessionId }),
    enabled: hasScope,
  });
  const selectedClass = classes.find((c) => c._id === classFilter);

  useEffect(() => {
    setClassFilter("");
    setSearch("");
    setPage(1);
  }, [sessionId]);

  useEffect(() => {
    setPage(1);
  }, [classFilter, search]);

  const { data: allSections = [], isLoading: sectionsLoading } = useQuery({
    queryKey: ["academy-sections", "session", sessionId, apiSessionId, classFilter],
    queryFn: async () => {
      if (classFilter) return fetchSectionsByClass(classFilter);
      return fetchAcademySectionsBySession(apiSessionId || undefined);
    },
    enabled: hasScope,
  });

  const formClassId = edit ? classIdOf(edit) : form.classId || classFilter;
  const { data: classSubjects = [] } = useQuery({
    queryKey: ["academy-subjects", formClassId],
    queryFn: () => fetchSubjectsByClass(formClassId, { status: "active" }),
    enabled: Boolean(formClassId) && open && !form.useClassSubjects,
  });

  const { data: studentsPage } = useQuery({
    queryKey: ["academy-section-enrolled", sessionId, apiSessionId, classFilter],
    queryFn: () =>
      fetchAcademyStudents({
        classId: classFilter || undefined,
        sessionId: apiSessionId || undefined,
        limit: 500,
        page: 1,
      }),
    enabled: hasScope,
  });

  const enrolledBySection = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of studentsPage?.students || []) {
      const sid = sectionIdOf(s);
      if (!sid) continue;
      map[sid] = (map[sid] || 0) + 1;
    }
    return map;
  }, [studentsPage?.students]);

  const filtered = useMemo(() => {
    if (!search.trim()) return allSections;
    return allSections.filter((s) =>
      matchesPanelSearch(
        search,
        s.sectionName,
        s.status,
        classNameOf(s, classes),
        sessionLabelOf(s, classes),
        s.useClassSubjects ? "class subjects" : "custom subjects",
        String(enrolledBySection[s._id] ?? 0),
      ),
    );
  }, [allSections, search, enrolledBySection, classes]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const showingFrom = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(safePage * PAGE_SIZE, filtered.length);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["academy-sections"] });
    qc.invalidateQueries({ queryKey: ["academy-section-enrolled"] });
    qc.invalidateQueries({ queryKey: ["config-sections"] });
  };

  const openCreate = () => {
    if (!writable) {
      toast({
        title: "Read-only session",
        description: "Switch to the active session to add sections.",
        variant: "destructive",
      });
      return;
    }
    if (!classFilter && classes.length === 0) {
      toast({ title: "No classes available", variant: "destructive" });
      return;
    }
    setEdit(null);
    setForm({
      classId: classFilter || classes[0]?._id || "",
      sectionName: "",
      useClassSubjects: true,
      subjectIds: [],
      status: "active",
    });
    setOpen(true);
  };

  const openEdit = (section: AcademySection) => {
    setEdit(section);
    setForm({
      classId: classIdOf(section),
      sectionName: section.sectionName,
      useClassSubjects: section.useClassSubjects,
      subjectIds: (section.subjectIds || []).map((s) => (typeof s === "string" ? s : s._id)),
      status: section.status,
    });
    setOpen(true);
  };

  const toggleSubject = (subjectId: string) => {
    setForm((f) => ({
      ...f,
      subjectIds: f.subjectIds.includes(subjectId)
        ? f.subjectIds.filter((id) => id !== subjectId)
        : [...f.subjectIds, subjectId],
    }));
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const targetClassId = edit ? classIdOf(edit) : form.classId;
      if (!targetClassId) throw new Error("Select a class");
      const payload = {
        sectionName: form.sectionName.trim(),
        classId: targetClassId,
        useClassSubjects: form.useClassSubjects,
        subjectIds: form.useClassSubjects ? [] : form.subjectIds,
        status: form.status,
      };
      if (edit) return updateAcademySection(edit._id, payload);
      return createAcademySection(payload);
    },
    onSuccess: () => {
      invalidate();
      setOpen(false);
      toast({ title: edit ? "Section updated" : "Section created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const bulkMut = useMutation({
    mutationFn: async (names: string[]) => {
      if (!classFilter) throw new Error("Select a class to quick-add sections");
      const existing = new Set(allSections.map((s) => s.sectionName.toUpperCase()));
      const toCreate = names.filter((n) => !existing.has(n.toUpperCase()));
      if (!toCreate.length) throw new Error("Those sections already exist");
      await Promise.all(
        toCreate.map((sectionName) =>
          createAcademySection({
            sectionName,
            classId: classFilter,
            useClassSubjects: true,
            subjectIds: [],
            status: "active",
          }),
        ),
      );
      return toCreate;
    },
    onSuccess: (created) => {
      invalidate();
      toast({
        title: created.length === 1 ? `Section ${created[0]} added` : `Added ${created.join(", ")}`,
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteAcademySection(id),
    onSuccess: () => {
      invalidate();
      toast({ title: "Section deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const hasActions = writable && (caps.canEdit || caps.canDelete);
  const colSpan = 5 + (hasActions ? 1 : 0);
  const listTitle = classFilter && selectedClass
    ? `Sections for ${classDisplayName(selectedClass)}${sessionLabelFromAcademyClass(selectedClass)
      ? ` · ${sessionLabelFromAcademyClass(selectedClass)}`
      : ""
    }`
    : "All sections";

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Layers className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-primary">Sections</h1>
            <p className="mt-1 text-sm text-muted-foreground max-w-xl">
              Create and manage class sections (A, B, C…). Timetable and enrollment both use these.
            </p>
          </div>
        </div>
        <p className="shrink-0 text-sm italic text-primary/70 sm:pt-1">
          “Better management, better learning.”
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end flex-1 min-w-0">
          <ClassProgramSelect
            className="w-full sm:w-[16.5rem] shrink-0"
            value={classFilter}
            onChange={setClassFilter}
            classes={classes}
            allowAll
            disabled={!hasScope || classes.length === 0}
            optionSuffix={
              isAll
                ? (c) => sessionLabelFromAcademyClass(classes.find((x) => x._id === c._id) as never) || undefined
                : undefined
            }
          />
          <PanelSearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search sections…"
            className="w-full sm:max-w-xs"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {caps.canCreate && writable && (
            <Button className="gap-2" onClick={openCreate} disabled={!hasScope}>
              <Plus className="h-4 w-4" /> Add Section
            </Button>
          )}
          <span className="inline-flex h-9 items-center rounded-md border bg-muted/40 px-3 text-xs font-medium text-muted-foreground">
            {filtered.length} section(s)
          </span>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 px-4 py-3 border-b bg-muted/20">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <List className="h-4 w-4 shrink-0" />
            <span className="truncate">{listTitle}</span>
          </div>
          {caps.canCreate && writable && classFilter ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Quick add:</span>
              {QUICK_SECTIONS.map((name) => (
                <Button
                  key={name}
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0 bg-primary/5 border-primary/20 text-primary hover:bg-primary/10"
                  disabled={
                    bulkMut.isPending ||
                    allSections.some((s) => s.sectionName.toUpperCase() === name)
                  }
                  onClick={() => bulkMut.mutate([name])}
                >
                  {name}
                </Button>
              ))}
            </div>
          ) : caps.canCreate && writable && !classFilter ? (
            <p className="text-xs text-muted-foreground">
              Filter by a class to use Quick add (A–D), or use Add Section.
            </p>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className="text-left p-3 font-medium w-12">#</th>
                <th className="text-left p-3 font-medium">Section</th>
                <th className="text-left p-3 font-medium">Enrolled</th>
                <th className="text-left p-3 font-medium">Subject Source</th>
                <th className="text-left p-3 font-medium">Status</th>
                {hasActions && <th className="text-right p-3 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {!hasScope && (
                <tr>
                  <td colSpan={colSpan} className="p-8 text-center text-muted-foreground">
                    —
                  </td>
                </tr>
              )}
              {hasScope && sectionsLoading && (
                <tr>
                  <td colSpan={colSpan} className="p-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {hasScope && !sectionsLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={colSpan} className="p-8 text-center text-muted-foreground">
                    {allSections.length === 0
                      ? "No sections yet. Use Add Section or filter a class for Quick add."
                      : "No sections match your search."}
                  </td>
                </tr>
              )}
              {pageRows.map((s, idx) => {
                const enrolled = enrolledBySection[s._id] ?? 0;
                const clsName = classNameOf(s, classes);
                const letter = (s.sectionName || "?").trim().charAt(0).toUpperCase() || "?";
                return (
                  <tr key={s._id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-3 text-muted-foreground tabular-nums">
                      {(safePage - 1) * PAGE_SIZE + idx + 1}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-sm font-bold text-primary">
                          {letter}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-primary truncate">
                            Section {s.sectionName}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{clsName}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="font-semibold tabular-nums">{enrolled}</span>
                      <span className="text-muted-foreground text-xs ml-1">
                        student{enrolled === 1 ? "" : "s"}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Users className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                        <span>
                          {s.useClassSubjects
                            ? "Default class subjects"
                            : `${s.subjectIds?.length || 0} custom subject(s)`}
                        </span>
                        {s.useClassSubjects ? (
                          <span title="Uses the subject list defined on the class">
                            <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="p-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                          s.status === "active"
                            ? "bg-emerald-500/15 text-emerald-700"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            s.status === "active" ? "bg-emerald-600" : "bg-muted-foreground",
                          )}
                        />
                        {s.status === "active" ? "Active" : "Inactive"}
                      </span>
                    </td>
                    {hasActions && (
                      <td className="p-3">
                        <div className="flex justify-end gap-1.5">
                          {caps.canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-md bg-primary/10 text-primary hover:bg-primary/15"
                              onClick={() => openEdit(s)}
                              aria-label="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {caps.canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/15"
                              aria-label="Delete"
                              onClick={() => {
                                if (confirm(`Delete section "${s.sectionName}"?`)) {
                                  delMut.mutate(s._id);
                                }
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-t text-sm text-muted-foreground">
          <p>
            Showing {showingFrom} to {showingTo} of {filtered.length} section(s)
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-md bg-primary px-2 text-xs font-semibold text-primary-foreground">
              {safePage}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit ? "Edit section" : "New section"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!edit ? (
              <ClassProgramSelect
                className="w-full"
                value={form.classId}
                onChange={(v) => setForm((f) => ({ ...f, classId: v, subjectIds: [] }))}
                classes={classes}
                emptyLabel="Select class…"
              />
            ) : null}
            <div>
              <Label>Section name</Label>
              <Input
                className="mt-1"
                value={form.sectionName}
                onChange={(e) => setForm((f) => ({ ...f, sectionName: e.target.value }))}
                placeholder="e.g. A"
              />
            </div>
            <label className="flex items-center gap-3">
              <Checkbox
                checked={form.useClassSubjects}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, useClassSubjects: Boolean(v), subjectIds: [] }))
                }
              />
              <span className="text-sm">Use class default subjects</span>
            </label>

            {!form.useClassSubjects && (
              <div className="space-y-2">
                <Label>Custom subjects for this section</Label>
                <div className="max-h-40 overflow-auto border rounded-md p-2 space-y-2">
                  {!formClassId ? (
                    <p className="text-xs text-muted-foreground">Select a class first.</p>
                  ) : classSubjects.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No subjects on this class.</p>
                  ) : (
                    classSubjects.map((sub) => (
                      <label key={sub._id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={form.subjectIds.includes(sub._id)}
                          onCheckedChange={() => toggleSubject(sub._id)}
                        />
                        <span>
                          {sub.subjectName} ({sub.subjectCode})
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                saveMut.isPending ||
                !form.sectionName.trim() ||
                (!edit && !form.classId) ||
                (!form.useClassSubjects && form.subjectIds.length === 0)
              }
              onClick={() => saveMut.mutate()}
            >
              {saveMut.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
