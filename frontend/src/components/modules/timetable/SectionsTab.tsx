import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ModuleActionCaps } from "@/lib/permissions";
import {
  createSection,
  deleteSection,
  fetchClasses,
  fetchSections,
  patchSection,
  type SchoolSection,
} from "@/lib/configApi";
import { fetchTeacherProfiles } from "@/lib/timetableApi";
import { rosterTeachers } from "./teacherRoster";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import { usePanelListSearch } from "@/hooks/usePanelListSearch";

const QUICK_SECTIONS = ["A", "B", "C", "D"];

type SectionForm = {
  name: string;
  teacherId: string;
  maxStudents: number;
};

const emptyForm = (): SectionForm => ({ name: "", teacherId: "", maxStudents: 40 });

function classNameOf(section: SchoolSection): string {
  const c = section.class;
  return typeof c === "object" && c?.name ? c.name : "—";
}

export default function SectionsTab({
  sessionId,
  caps,
}: {
  sessionId: string;
  caps: ModuleActionCaps;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [classId, setClassId] = useState("");
  const [viewAll, setViewAll] = useState(false);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<SchoolSection | null>(null);
  const [form, setForm] = useState<SectionForm>(emptyForm());

  useEffect(() => {
    setClassId("");
    setViewAll(false);
  }, [sessionId]);

  const { data: classes = [] } = useQuery({
    queryKey: ["config-classes", sessionId],
    queryFn: () => fetchClasses(sessionId),
    enabled: !!sessionId,
  });

  const { data: teacherProfiles = [] } = useQuery({
    queryKey: ["timetable-teacher-profiles", sessionId],
    queryFn: () => fetchTeacherProfiles(sessionId),
    enabled: !!sessionId,
  });

  const roster = rosterTeachers(teacherProfiles);
  const sectionTeacherOptions =
    form.teacherId && !roster.some((t) => t._id === form.teacherId) && edit?.teacher
      ? [...roster, { _id: edit.teacher._id, name: edit.teacher.name }]
      : roster;

  const sectionsQueryKey = viewAll
    ? ["config-sections", "session", sessionId]
    : ["config-sections", "class", classId];

  const { data: sections = [], isLoading } = useQuery({
    queryKey: sectionsQueryKey,
    queryFn: () =>
      viewAll ? fetchSections({ sessionId }) : fetchSections({ classId }),
    enabled: !!sessionId && (viewAll || !!classId),
  });

  const { search, setSearch, filtered: sectionsFiltered } = usePanelListSearch(sections, (s) => [
    s.name,
    classNameOf(s),
    s.teacher?.name,
    s.studentCount,
    s.maxStudents,
  ]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["config-sections"] });
    qc.invalidateQueries({ queryKey: ["config-classes"] });
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        teacher: form.teacherId || null,
        maxStudents: form.maxStudents,
      };
      if (edit) return patchSection(edit._id, payload);
      if (!classId) throw new Error("Select a class first");
      return createSection({ ...payload, class: classId });
    },
    onSuccess: () => {
      invalidate();
      setOpen(false);
      setEdit(null);
      toast({ title: edit ? "Section updated" : "Section created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const delMut = useMutation({
    mutationFn: deleteSection,
    onSuccess: () => {
      invalidate();
      toast({ title: "Section deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const bulkMut = useMutation({
    mutationFn: async (names: string[]) => {
      if (!classId) throw new Error("Select a class first");
      const existing = new Set(sections.map((s) => s.name.toUpperCase()));
      const toCreate = names.filter((n) => !existing.has(n.toUpperCase()));
      await Promise.all(
        toCreate.map((name) => createSection({ name, class: classId, maxStudents: 40 }))
      );
      return toCreate.length;
    },
    onSuccess: (count) => {
      invalidate();
      toast({ title: count ? `Added ${count} section(s)` : "Sections already exist" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openCreate = () => {
    setEdit(null);
    setForm(emptyForm());
    setOpen(true);
  };

  const openEditRow = (s: SchoolSection) => {
    setEdit(s);
    setForm({
      name: s.name,
      teacherId: s.teacher?._id || "",
      maxStudents: s.maxStudents ?? 40,
    });
    setOpen(true);
  };

  if (!sessionId) {
    return null;
  }

  const selectedClass = classes.find((c) => c._id === classId);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <Card className="p-4 flex flex-col sm:flex-row sm:flex-wrap gap-4 sm:items-end">
        <div className="min-w-[200px] flex-1">
          <Label className="text-xs text-muted-foreground">Class</Label>
          <select
            className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setViewAll(false);
            }}
            disabled={viewAll}
          >
            <option value="">Select class</option>
            {classes.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 pb-1">
          <input
            type="checkbox"
            id="view-all-sections"
            checked={viewAll}
            onChange={(e) => setViewAll(e.target.checked)}
            className="rounded border-input"
          />
          <Label htmlFor="view-all-sections" className="text-sm font-normal cursor-pointer">
            Show all sections in session
          </Label>
        </div>
      </Card>

      {(classId || viewAll) && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <PanelSearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search section, class, teacher…"
              className="max-w-xs"
            />
            {caps.canCreate && !viewAll && classId && (
              <>
                <Button className="gap-2" onClick={openCreate}>
                  <Plus className="h-4 w-4" /> Add section
                </Button>
                <span className="text-xs text-muted-foreground">Quick add:</span>
                {QUICK_SECTIONS.map((name) => (
                  <Button
                    key={name}
                    variant="outline"
                    size="sm"
                    disabled={bulkMut.isPending || sections.some((s) => s.name.toUpperCase() === name)}
                    onClick={() => bulkMut.mutate([name])}
                  >
                    {name}
                  </Button>
                ))}
              </>
            )}
            {selectedClass && !viewAll && (
              <Badge variant="secondary" className="ml-auto">
                {selectedClass.name} · {sections.length} section(s)
              </Badge>
            )}
            {viewAll && (
              <Badge variant="secondary" className="ml-auto">
                {sections.length} section(s) across all classes
              </Badge>
            )}
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left p-3 font-medium">Section</th>
                    {(viewAll || !classId) && <th className="text-left p-3 font-medium">Class</th>}
                    <th className="text-left p-3 font-medium">Class teacher</th>
                    <th className="text-left p-3 font-medium">Enrolled</th>
                    <th className="text-left p-3 font-medium">Capacity</th>
                    {(caps.canEdit || caps.canDelete) && (
                      <th className="text-right p-3 font-medium">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground">
                        Loading…
                      </td>
                    </tr>
                  )}
                  {!isLoading && sectionsFiltered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground">
                        {sections.length === 0
                          ? "No sections yet. Add sections for this class (e.g. A, B, C)."
                          : "No sections match your search."}
                      </td>
                    </tr>
                  )}
                  {sectionsFiltered.map((s) => {
                    const enrolled = s.studentCount ?? 0;
                    const cap = s.maxStudents ?? 40;
                    const full = enrolled >= cap;
                    return (
                      <tr key={s._id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="p-3 font-semibold text-primary">{s.name}</td>
                        {viewAll && <td className="p-3">{classNameOf(s)}</td>}
                        <td className="p-3 text-muted-foreground">
                          {s.teacher?.name || "—"}
                        </td>
                        <td className="p-3">
                          <span className={full ? "text-amber-700 font-medium" : ""}>
                            {enrolled}
                          </span>
                        </td>
                        <td className="p-3">{cap}</td>
                        {(caps.canEdit || caps.canDelete) && (
                          <td className="p-3 text-right space-x-1">
                            {caps.canEdit && (
                              <Button variant="ghost" size="icon" onClick={() => openEditRow(s)} aria-label="Edit">
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            {caps.canDelete && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  if (enrolled > 0) {
                                    toast({
                                      title: "Cannot delete",
                                      description: `${enrolled} student(s) enrolled in this section.`,
                                      variant: "destructive",
                                    });
                                    return;
                                  }
                                  if (confirm(`Delete section "${s.name}"?`)) delMut.mutate(s._id);
                                }}
                                aria-label="Delete"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit ? "Edit section" : "New section"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Section name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. A"
              />
            </div>
            <div>
              <Label>Class teacher (optional)</Label>
              <select
                className="w-full h-10 rounded-md border px-3 text-sm"
                value={form.teacherId}
                onChange={(e) => setForm((f) => ({ ...f, teacherId: e.target.value }))}
              >
                <option value="">None</option>
                {sectionTeacherOptions.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {sectionTeacherOptions.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Sync teachers for this session under System Config → Teachers.
                </p>
              )}
            </div>
            <div>
              <Label>Max students</Label>
              <Input
                type="number"
                min={1}
                value={form.maxStudents}
                onChange={(e) => setForm((f) => ({ ...f, maxStudents: Number(e.target.value) || 40 }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!form.name.trim() || saveMut.isPending || (!edit && !classId)}
              onClick={() => saveMut.mutate()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
