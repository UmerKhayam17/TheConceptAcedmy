import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ClipboardList,
  GraduationCap,
  Layers,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ModuleActionCaps } from "@/lib/permissions";
import {
  createAcademyDiscipline,
  createStandardDisciplines,
  deleteAcademyDiscipline,
  fetchAcademyClasses,
  fetchDisciplinesByClassWithMeta,
  fetchSubjectsByClass,
  updateAcademyDiscipline,
  type AcademyDiscipline,
  type AcademySubject,
} from "@/lib/studentManagementApi";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import { matchesPanelSearch } from "@/lib/panelSearch";
import { useSessionScope } from "@/components/modules/timetable/SessionBar";
import { sessionLabelFromAcademyClass } from "./studentDisplayUtils";

function subjectNames(ids: AcademyDiscipline["subjectIds"]): string {
  if (!Array.isArray(ids) || !ids.length) return "No stream subjects yet";
  return ids
    .map((s) => (typeof s === "string" ? s : s.subjectName))
    .filter(Boolean)
    .join(", ");
}

function subjectIdList(ids: AcademyDiscipline["subjectIds"]): string[] {
  if (!Array.isArray(ids)) return [];
  return ids.map((s) => (typeof s === "string" ? s : s._id));
}

function formatCreated(iso?: string) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function DisciplinesTab({
  caps,
  sessionId,
}: {
  caps: ModuleActionCaps;
  sessionId: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [classId, setClassId] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<AcademyDiscipline | null>(null);
  const [form, setForm] = useState({
    name: "",
    code: "",
    status: "active" as "active" | "inactive",
    subjectIds: [] as string[],
  });
  const [search, setSearch] = useState("");
  const { apiSessionId, writable, hasScope } = useSessionScope(sessionId);

  const { data: classes = [], isLoading: classesLoading } = useQuery({
    queryKey: ["academy-classes", sessionId],
    queryFn: () => fetchAcademyClasses({ sessionId: apiSessionId }),
    enabled: hasScope,
  });

  useEffect(() => {
    setClassId("");
  }, [sessionId]);

  const { data: discResult, isLoading: discLoading } = useQuery({
    queryKey: ["academy-disciplines", classId],
    queryFn: () => fetchDisciplinesByClassWithMeta(classId),
    enabled: Boolean(classId),
  });

  const disciplines = discResult?.data ?? [];
  const meta = discResult?.meta;

  const { data: subjects = [] } = useQuery({
    queryKey: ["academy-subjects", classId],
    queryFn: () => fetchSubjectsByClass(classId, { status: "active" }),
    enabled: Boolean(classId),
  });

  const selectedClass = classes.find((c) => c._id === classId);

  const disciplinesFiltered = useMemo(() => {
    if (!search.trim()) return disciplines;
    return disciplines.filter((d) =>
      matchesPanelSearch(search, d.name, d.code, subjectNames(d.subjectIds), d.status),
    );
  }, [disciplines, search]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["academy-disciplines", classId] });
    qc.invalidateQueries({ queryKey: ["enrollment-subjects"] });
  };

  const openCreate = () => {
    if (!writable) {
      toast({
        title: "Read-only session",
        description: "Switch to the active session to manage disciplines.",
        variant: "destructive",
      });
      return;
    }
    if (!classId) {
      toast({ title: "Select a class first", variant: "destructive" });
      return;
    }
    setEdit(null);
    setForm({ name: "", code: "", status: "active", subjectIds: [] });
    setOpen(true);
  };

  const openEdit = (d: AcademyDiscipline) => {
    if (!writable) {
      toast({
        title: "Read-only session",
        description: "Switch to the active session to edit disciplines.",
        variant: "destructive",
      });
      return;
    }
    setEdit(d);
    setForm({
      name: d.name,
      code: d.code,
      status: d.status,
      subjectIds: subjectIdList(d.subjectIds),
    });
    setOpen(true);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (edit) {
        return updateAcademyDiscipline(edit._id, {
          name: form.name.trim(),
          code: form.code.trim() || undefined,
          status: form.status,
          subjectIds: form.subjectIds,
        });
      }
      return createAcademyDiscipline({
        name: form.name.trim(),
        code: form.code.trim() || undefined,
        classId,
        subjectIds: form.subjectIds,
        status: form.status,
      });
    },
    onSuccess: () => {
      toast({ title: edit ? "Discipline updated" : "Discipline created" });
      setOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const defaultsMut = useMutation({
    mutationFn: () => createStandardDisciplines(classId),
    onSuccess: (res) => {
      const linkedMsg =
        res.linked?.length
          ? ` Linked subjects: ${res.linked.map((l) => `${l.code}(${l.count})`).join(", ")}.`
          : " Assign stream subjects (Bio/Math/CS) next — keep English/Urdu/Islamiyat as shared.";
      toast({
        title: `Created ${res.created}, skipped ${res.skipped}`,
        description: linkedMsg,
      });
      invalidate();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteAcademyDiscipline(id),
    onSuccess: () => {
      toast({ title: "Discipline deleted" });
      invalidate();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const toggleSubject = (id: string) => {
    setForm((f) => ({
      ...f,
      subjectIds: f.subjectIds.includes(id)
        ? f.subjectIds.filter((x) => x !== id)
        : [...f.subjectIds, id],
    }));
  };

  const streamCandidates = subjects.filter((s: AcademySubject) => {
    const n = s.subjectName.toLowerCase();
    // Hint which subjects typically belong in streams vs shared compulsory.
    const shared =
      n.includes("english") ||
      n.includes("urdu") ||
      n.includes("islam") ||
      n.includes("pakistan");
    return !shared;
  });

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between">
        <div className="space-y-1">
          <h2 className="font-display text-xl font-semibold text-primary">Disciplines / Streams</h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Configure Medical, Engineering, and ICS for 1st Year / 2nd Year only. Shared subjects
            (English, Urdu, Islamiyat / Pakistan Studies) stay on the class — do not add them here.
            9th, 10th, and other classes leave this empty so registration hides the Discipline field.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {caps.canCreate && (
            <>
              <Button
                type="button"
                variant="outline"
                className="gap-1.5"
                disabled={!classId || !writable || defaultsMut.isPending}
                onClick={() => defaultsMut.mutate()}
              >
                <Sparkles className="h-4 w-4" />
                Add Medical / Eng / ICS
              </Button>
              <Button type="button" className="gap-1.5" disabled={!classId || !writable} onClick={openCreate}>
                <Plus className="h-4 w-4" /> Add discipline
              </Button>
            </>
          )}
        </div>
      </div>

      <Card className="p-4 space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="disc-class">Class</Label>
            <select
              id="disc-class"
              className="w-full h-10 rounded-md border bg-background px-3 text-sm"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              disabled={classesLoading || !hasScope}
            >
              <option value="">Select class…</option>
              {classes.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.className}
                  {sessionLabelFromAcademyClass(c) ? ` · ${sessionLabelFromAcademyClass(c)}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 flex flex-col justify-end">
            {classId && meta && (
              <p className="text-xs text-muted-foreground">
                {meta.requiresDiscipline
                  ? "Registration will require a discipline for this class."
                  : "No active disciplines — Discipline field hidden at registration (e.g. 9th/10th)."}
                {meta.suggestsDisciplines
                  ? " Class name looks like 1st/2nd Year — streams are recommended."
                  : ""}
              </p>
            )}
          </div>
        </div>

        {classId && (
          <PanelSearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search disciplines…"
            className="max-w-md"
          />
        )}
      </Card>

      {!classId ? (
        <p className="text-sm text-muted-foreground">Select a class to manage streams.</p>
      ) : discLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : disciplinesFiltered.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground space-y-2">
          <p>No disciplines for {selectedClass?.className || "this class"}.</p>
          <p>
            For 1st / 2nd Year: create subjects first (shared + stream), then click{" "}
            <strong>Add Medical / Eng / ICS</strong> to seed packages and auto-link matching subjects.
          </p>
        </Card>
      ) : (
        <div className="overflow-x-auto border rounded-md">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Code</th>
                <th className="text-left p-3 font-medium">Stream subjects</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {disciplinesFiltered.map((d) => (
                <tr key={d._id} className="border-b last:border-0">
                  <td className="p-3 font-medium">{d.name}</td>
                  <td className="p-3 font-mono text-xs">{d.code}</td>
                  <td className="p-3 text-muted-foreground">{subjectNames(d.subjectIds)}</td>
                  <td className="p-3 capitalize">{d.status}</td>
                  <td className="p-3 text-right">
                    <div className="inline-flex gap-1">
                      {caps.canEdit && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => openEdit(d)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {caps.canDelete && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => {
                            if (confirm(`Delete discipline "${d.name}"?`)) deleteMut.mutate(d._id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{edit ? "Edit discipline" : "Add discipline"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Medical"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Code</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="medical"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <select
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value as "active" | "inactive" }))
                }
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Stream subjects</Label>
              <p className="text-xs text-muted-foreground">
                Select only stream subjects (e.g. Biology / Math / CS). Leave English, Urdu, and
                Islamiyat / Pakistan Studies unchecked — they remain shared for every student.
              </p>
              <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-1">
                {(streamCandidates.length ? streamCandidates : subjects).map((s) => (
                  <label key={s._id} className="flex items-center gap-2 text-sm py-1 px-1 rounded hover:bg-muted/40">
                    <input
                      type="checkbox"
                      checked={form.subjectIds.includes(s._id)}
                      onChange={() => toggleSubject(s._id)}
                    />
                    <span>{s.subjectName}</span>
                    <span className="text-xs text-muted-foreground font-mono">{s.subjectCode}</span>
                  </label>
                ))}
                {subjects.length === 0 && (
                  <p className="text-xs text-muted-foreground p-2">No subjects on this class yet.</p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!form.name.trim() || saveMut.isPending}
              onClick={() => saveMut.mutate()}
            >
              {edit ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
