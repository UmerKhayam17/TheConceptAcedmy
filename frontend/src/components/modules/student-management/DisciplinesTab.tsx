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
import disciplineBanner from "@/assets/discipline-banner.jpg";
import {
  createAcademyDiscipline,
  createStandardDisciplines,
  deleteAcademyDiscipline,
  fetchAcademyClasses,
  fetchAcademyDisciplines,
  fetchSubjectsByClass,
  updateAcademyDiscipline,
  type AcademyDiscipline,
  type AcademySubject,
} from "@/lib/studentManagementApi";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import { matchesPanelSearch } from "@/lib/panelSearch";
import { useSessionScope } from "@/components/modules/timetable/SessionBar";
import { sessionLabelFromAcademyClass } from "./studentDisplayUtils";
import { createdByLabel } from "@/lib/createdBy";

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

function disciplineClassId(d: AcademyDiscipline) {
  const c = d.classId;
  if (typeof c === "object" && c) return c._id;
  return c || "";
}

function disciplineClassName(d: AcademyDiscipline, fallback = "—") {
  const c = d.classId;
  if (typeof c === "object" && c?.className) return c.className;
  return fallback;
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
  const [createClassId, setCreateClassId] = useState("");
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
    queryKey: ["academy-disciplines", apiSessionId ?? "all", classId || "all"],
    queryFn: () =>
      fetchAcademyDisciplines({
        sessionId: apiSessionId,
        classId: classId || undefined,
      }),
    enabled: hasScope,
  });

  const disciplines = discResult?.data ?? [];
  const meta = discResult?.meta;

  const subjectClassId = edit ? disciplineClassId(edit) : createClassId || classId;

  const { data: subjects = [] } = useQuery({
    queryKey: ["academy-subjects", subjectClassId],
    queryFn: () => fetchSubjectsByClass(subjectClassId, { status: "active" }),
    enabled: open && Boolean(subjectClassId),
  });

  const selectedClass = classes.find((c) => c._id === classId);

  const disciplinesFiltered = useMemo(() => {
    if (!search.trim()) return disciplines;
    return disciplines.filter((d) =>
      matchesPanelSearch(
        search,
        d.name,
        d.code,
        disciplineClassName(d, ""),
        subjectNames(d.subjectIds),
        createdByLabel(d.createdBy),
        d.status,
      ),
    );
  }, [disciplines, search]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["academy-disciplines"] });
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
    setEdit(null);
    setCreateClassId(classId);
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
      const targetClassId = createClassId || classId;
      if (!targetClassId) throw new Error("Select a class for this discipline.");
      return createAcademyDiscipline({
        name: form.name.trim(),
        code: form.code.trim() || undefined,
        classId: targetClassId,
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

  const totalCount = disciplines.length;
  const showEmpty = !discLoading && disciplinesFiltered.length === 0;

  return (
    <div className="space-y-4 px-4 py-5 sm:px-6 lg:px-8">
      <section className="relative min-h-[128px] overflow-hidden rounded-2xl border border-[#D6E4F7] bg-[#F4F8FF] px-4 py-3 sm:px-5">
        <img
          src={disciplineBanner}
          alt=""
          className="pointer-events-none absolute right-0 top-1/2 hidden h-[112px] w-auto max-w-[46%] -translate-y-1/2 object-contain mix-blend-multiply lg:block"
        />
        <div className="relative flex items-center gap-3 lg:max-w-[62%]">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#1769E0] text-white shadow-sm">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold tracking-tight text-[#10244A] sm:text-lg">
              Disciplines / Streams
            </h2>
            <p className="mt-0.5 text-[13px] leading-snug text-slate-600">
              Academic streams for 1st Year and 2nd Year — Medical, Engineering, and ICS.
            </p>
            <p className="text-[13px] leading-snug text-slate-500">
              Shared subjects stay on the class. Other classes leave this empty.
            </p>
          </div>
        </div>
      </section>

      <Card className="rounded-2xl border-[#E6EEF8] p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="w-full max-w-[240px] shrink-0 space-y-1.5">
            <Label htmlFor="disc-class" className="flex items-center gap-1.5 text-sm font-semibold text-[#10244A]">
              <GraduationCap className="h-4 w-4 text-[#1769E0]" />
              Class
            </Label>
            <select
              id="disc-class"
              className="h-11 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm text-slate-600 outline-none transition-colors focus:border-[#1769E0] focus:ring-2 focus:ring-[#1769E0]/15"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              disabled={classesLoading || !hasScope}
            >
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.className}
                  {sessionLabelFromAcademyClass(c) ? ` · ${sessionLabelFromAcademyClass(c)}` : ""}
                </option>
              ))}
            </select>
          </div>
          {caps.canCreate && (
            <div className="flex flex-wrap gap-2 lg:shrink-0">
              <Button
                type="button"
                variant="outline"
                className="h-11 gap-1.5 rounded-lg border-[#D6E4F7] bg-white px-4 text-sm font-semibold text-[#10244A] hover:bg-[#F4F8FF]"
                disabled={!classId || !writable || defaultsMut.isPending}
                onClick={() => defaultsMut.mutate()}
              >
                <Sparkles className="h-4 w-4 text-[#1769E0]" />
                {defaultsMut.isPending ? "Adding…" : "Add Medical / Eng / ICS"}
              </Button>
              <Button
                type="button"
                className="h-11 gap-1.5 rounded-lg bg-[#1769E0] px-4 text-sm font-semibold text-white hover:bg-[#1458C4]"
                onClick={openCreate}
              >
                <Plus className="h-4 w-4" />
                Add discipline
              </Button>
            </div>
          )}
        </div>
        {classId && meta && (
          <p className="mt-3 text-xs text-slate-500">
            {meta.requiresDiscipline
              ? "Registration will require a discipline for this class."
              : "No active disciplines — the Discipline field stays hidden at registration (for example 9th and 10th)."}
            {meta.suggestsDisciplines
              ? " This class looks like 1st or 2nd Year, so streams are recommended."
              : ""}
          </p>
        )}
      </Card>

      <Card className="overflow-hidden rounded-2xl border-[#E6EEF8] shadow-sm">
        <div className="flex flex-col gap-3 border-b border-[#EEF2F7] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#EEF5FF] text-[#1769E0]">
              <Layers className="h-4 w-4" />
            </span>
            <h3 className="truncate text-sm font-semibold text-[#10244A] sm:text-[15px]">
              Configured Disciplines / Streams
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PanelSearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search disciplines…"
              className="w-full flex-none sm:w-56"
            />
            <p className="inline-flex items-center gap-2 text-sm text-slate-500">
              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[#EEF5FF] px-2 text-xs font-semibold text-[#1769E0]">
                {search.trim() ? disciplinesFiltered.length : totalCount}
              </span>
              Total Disciplines
            </p>
          </div>
        </div>

        {discLoading ? (
          <p className="px-5 py-16 text-center text-sm text-slate-500">Loading disciplines…</p>
        ) : showEmpty ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="relative mb-4">
              <div className="grid h-16 w-16 place-items-center rounded-full bg-[#EEF5FF] text-[#1769E0]">
                <ClipboardList className="h-7 w-7" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 grid h-6 w-6 place-items-center rounded-full bg-[#1769E0] text-white ring-2 ring-white">
                <Plus className="h-3.5 w-3.5" />
              </span>
            </div>
            <p className="text-base font-semibold text-[#10244A]">
              {search.trim() ? "No matching disciplines" : "No disciplines added yet"}
            </p>
            <p className="mt-1 max-w-md text-sm text-slate-500">
              {search.trim()
                ? "Try a different name, code, or subject."
                : classId
                  ? `Nothing is configured for ${selectedClass?.className || "this class"} yet. For 1st and 2nd Year, add Medical, Engineering, and ICS after subjects exist.`
                  : "No streams are configured for this session yet. Choose a class, then add Medical, Engineering, or ICS."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[#EEF2F7] bg-[#F8FAFC]">
                <tr className="text-left text-xs font-medium text-slate-500">
                  <th className="w-12 px-4 py-3 sm:px-5">#</th>
                  <th className="px-3 py-3">Class</th>
                  <th className="px-3 py-3">Discipline / Stream</th>
                  <th className="px-3 py-3">Created At</th>
                  <th className="px-3 py-3">Created by</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-4 py-3 text-right sm:px-5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {disciplinesFiltered.map((d, index) => (
                  <tr key={d._id} className="border-b border-[#F1F5F9] last:border-0 hover:bg-[#F8FBFF]">
                    <td className="px-4 py-3.5 text-slate-500 sm:px-5">{index + 1}</td>
                    <td className="px-3 py-3.5 font-medium text-[#10244A]">
                      {disciplineClassName(d, selectedClass?.className)}
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="font-medium text-[#10244A]">{d.name}</div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        <span className="font-mono">{d.code}</span>
                        <span> · {subjectNames(d.subjectIds)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-slate-600">{formatCreated(d.createdAt)}</td>
                    <td className="px-3 py-3.5 text-slate-600">{createdByLabel(d.createdBy)}</td>
                    <td className="px-3 py-3.5">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                          d.status === "active"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {d.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right sm:px-5">
                      <div className="inline-flex gap-1">
                        {caps.canEdit && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-[#1769E0] hover:bg-[#EEF5FF] hover:text-[#1458C4]"
                            onClick={() => openEdit(d)}
                            aria-label={`Edit ${d.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {caps.canDelete && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-slate-400 hover:bg-red-50 hover:text-destructive"
                            onClick={() => {
                              if (confirm(`Delete discipline "${d.name}"?`)) deleteMut.mutate(d._id);
                            }}
                            aria-label={`Delete ${d.name}`}
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
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{edit ? "Edit discipline" : "Add discipline"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {!edit && (
              <div className="space-y-1.5">
                <Label>Class</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={createClassId}
                  onChange={(e) => {
                    setCreateClassId(e.target.value);
                    setForm((f) => ({ ...f, subjectIds: [] }));
                  }}
                >
                  <option value="">Select class...</option>
                  {classes.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.className}
                      {sessionLabelFromAcademyClass(c) ? ` · ${sessionLabelFromAcademyClass(c)}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
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
              disabled={!form.name.trim() || saveMut.isPending || (!edit && !createClassId)}
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
