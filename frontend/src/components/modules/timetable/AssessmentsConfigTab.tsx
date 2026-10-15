import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ClipboardList,
  FileStack,
  GraduationCap,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import type { ModuleActionCaps } from "@/lib/permissions";
import {
  ASSESSMENT_TYPE_LABELS,
  ASSESSMENT_TYPES,
  typesForCategory,
  type AssessmentCategory,
  type AssessmentType,
  type CanonicalAssessmentType,
} from "@/lib/assessmentTaxonomy";
import {
  addAssessmentPlanItem,
  deleteAssessmentPlanItem,
  fetchAssessmentPlan,
  updateAssessmentPlanItem,
  type AssessmentPlanItem,
} from "@/lib/configApi";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import PanelStatCard from "@/components/modules/PanelStatCard";
import { matchesPanelSearch } from "@/lib/panelSearch";

/**
 * System Config → Assessment Catalog.
 * Tests and exams are separate panels. Class assignment happens on the Tests and Exams pages.
 */
export default function AssessmentsConfigTab({
  sessionId,
  caps,
  category,
}: {
  sessionId: string;
  caps: ModuleActionCaps;
  category: AssessmentCategory;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const canManage = caps.canCreate || caps.canEdit;
  const noun = category === "test" ? "test" : "exam";
  const nounTitle = category === "test" ? "Tests" : "Exams";
  const HeaderIcon = category === "test" ? ClipboardList : GraduationCap;

  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AssessmentPlanItem | null>(null);
  const [form, setForm] = useState({ name: "", assessmentType: typesForCategory(category)[0] });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["assessment-plan", sessionId],
    queryFn: () => fetchAssessmentPlan(sessionId),
    enabled: Boolean(sessionId),
  });

  const plan = data?.plan;
  const items = (plan?.items ?? []).filter((item) => item.category === category);
  const assignedCount = items.reduce((sum, item) => sum + (item.assignmentCount ?? 0), 0);
  const publishedCount = items.reduce((sum, item) => sum + (item.publishedCount ?? 0), 0);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["assessment-plan", sessionId] });

  const typeOptions = typesForCategory(category);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (typeFilter && item.assessmentType !== typeFilter) return false;
      return matchesPanelSearch(
        search,
        item.name,
        ASSESSMENT_TYPE_LABELS[item.assessmentType as AssessmentType],
      );
    });
  }, [items, typeFilter, search]);

  const addMut = useMutation({
    mutationFn: (body: { name: string; assessmentType: string }) => addAssessmentPlanItem(sessionId, body),
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      toast({ title: "Added to catalog" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ itemId, body }: { itemId: string; body: { name: string; assessmentType: string } }) =>
      updateAssessmentPlanItem(sessionId, itemId, body),
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      setEditing(null);
      toast({ title: "Catalog item updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (itemId: string) => deleteAssessmentPlanItem(sessionId, itemId),
    onSuccess: () => {
      invalidate();
      toast({ title: "Removed from catalog" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: "",
      assessmentType:
        typeFilter && typeOptions.includes(typeFilter as CanonicalAssessmentType)
          ? (typeFilter as CanonicalAssessmentType)
          : typeOptions[0],
    });
    setDialogOpen(true);
  };

  const openEdit = (item: AssessmentPlanItem) => {
    setEditing(item);
    setForm({
      name: item.name,
      assessmentType: item.assessmentType as CanonicalAssessmentType,
    });
    setDialogOpen(true);
  };

  const save = () => {
    const name = form.name.trim();
    if (!name) return;
    const body = { name, assessmentType: form.assessmentType };
    if (editing) updateMut.mutate({ itemId: editing._id, body });
    else addMut.mutate(body);
  };

  const saving = addMut.isPending || updateMut.isPending;
  const formTypes = typeOptions;

  if (!sessionId) {
    return (
      <p className="px-4 sm:px-6 lg:px-8 py-8 text-sm text-muted-foreground">
        Pick an academic session to manage the assessment catalog.
      </p>
    );
  }

  if (isError) {
    return (
      <p className="px-4 sm:px-6 lg:px-8 py-8 text-sm text-destructive">
        {error instanceof Error ? error.message : "Failed to load assessment catalog."}
      </p>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
              <HeaderIcon className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight">
                {category === "test" ? "Test Catalog" : "Exam Catalog"}
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500 max-w-md">
                Define {noun} names and types for this session. Assign them to classes from Examination.
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

      <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        <PanelStatCard
          label={nounTitle}
          value={isLoading ? "…" : items.length}
          hint={`In this session ${noun} catalog`}
          icon={HeaderIcon}
          iconWrapClass="bg-[#dbeafe]"
          iconClass="text-[#2563eb]"
        />
        <PanelStatCard
          label="Class assignments"
          value={isLoading ? "…" : assignedCount}
          hint="Linked to classes"
          icon={FileStack}
          iconWrapClass="bg-[#ede9fe]"
          iconClass="text-[#7c3aed]"
        />
        <PanelStatCard
          label="Published"
          value={isLoading ? "…" : publishedCount}
          hint="Ready for marks"
          icon={CheckCircle2}
          iconWrapClass="bg-[#d1fae5]"
          iconClass="text-[#059669]"
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <PanelSearchBar
            value={search}
            onChange={setSearch}
            placeholder={`Search ${noun} name or type…`}
            className="min-w-[12rem] flex-1 max-w-md"
          />
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm w-[10rem] shrink-0"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Type filter"
          >
            <option value="">All types</option>
            {typeOptions.map((key) => (
              <option key={key} value={key}>
                {ASSESSMENT_TYPES[key].label}
              </option>
            ))}
          </select>
          {canManage && (
            <Button size="sm" className="h-10 gap-2 ml-auto whitespace-nowrap" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Add {noun}
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-[#1a2b4b]">Catalog items</p>
            <p className="text-xs text-slate-500">
              {isLoading
                ? `Loading ${noun}s…`
                : `${filtered.length} ${noun}${filtered.length === 1 ? "" : "s"}${
                    search.trim() || typeFilter ? " matching filters" : " in catalog"
                  }.`}
            </p>
          </div>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left p-3 font-medium text-slate-600">Name</th>
                <th className="text-left p-3 font-medium text-slate-600">Type</th>
                <th className="text-left p-3 font-medium text-slate-600">Classes</th>
                {canManage && <th className="text-right p-3 font-medium text-slate-600">Action</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={canManage ? 4 : 3} className="p-6 text-center text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading catalog…
                    </span>
                  </td>
                </tr>
              )}
              {!isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 4 : 3} className="p-8 text-center text-muted-foreground">
                    No {noun}s for this session yet. Add the ones you need.
                  </td>
                </tr>
              )}
              {!isLoading && items.length > 0 && filtered.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 4 : 3} className="p-8 text-center text-muted-foreground">
                    Nothing matches these filters.
                  </td>
                </tr>
              )}
              {filtered.map((item) => (
                <tr key={item._id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80">
                  <td className="p-3 font-medium text-[#1a2b4b]">{item.name}</td>
                  <td className="p-3 text-muted-foreground">
                    {ASSESSMENT_TYPE_LABELS[item.assessmentType as AssessmentType] || item.assessmentType}
                  </td>
                  <td className="p-3">{item.assignmentCount ?? 0}</td>
                  {canManage && (
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-0.5">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-sky-600 hover:text-sky-700"
                          title="Edit"
                          aria-label="Edit"
                          onClick={() => openEdit(item)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          title="Delete"
                          aria-label="Delete"
                          disabled={deleteMut.isPending && deleteMut.variables === item._id}
                          onClick={() => {
                            if (window.confirm(`Remove "${item.name}" from the catalog?`)) {
                              deleteMut.mutate(item._id);
                            }
                          }}
                        >
                          {deleteMut.isPending && deleteMut.variables === item._id ? (
                            <Loader2 className="h-4 w-4 animate-spin text-destructive" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-destructive" />
                          )}
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => !saving && setDialogOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${noun}` : `Add ${noun}`}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                maxLength={120}
                placeholder={category === "test" ? "e.g. September weekly test" : "e.g. Mid year paper"}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.assessmentType}
                onChange={(e) =>
                  setForm((f) => ({ ...f, assessmentType: e.target.value as CanonicalAssessmentType }))
                }
              >
                {formTypes.map((key) => (
                  <option key={key} value={key}>
                    {ASSESSMENT_TYPES[key].label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button className="gap-2" onClick={save} disabled={saving || !form.name.trim()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
