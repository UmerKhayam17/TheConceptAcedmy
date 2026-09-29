import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
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
        typeFilter && typeOptions.includes(typeFilter as CanonicalAssessmentType) ? (typeFilter as CanonicalAssessmentType) : typeOptions[0],
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
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{nounTitle}</p>
          <p className="text-lg font-semibold text-primary">{isLoading ? "…" : items.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Class assignments</p>
          <p className="text-lg font-semibold text-amber-700 dark:text-amber-400">
            {isLoading ? "…" : assignedCount}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Published</p>
          <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
            {isLoading ? "…" : publishedCount}
          </p>
        </Card>
      </div>

      <Card className="p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0 flex-1">
            <div className="min-w-0">
              <Label className="mb-1 block text-xs">Search</Label>
              <PanelSearchBar
                value={search}
                onChange={setSearch}
                placeholder={`Search ${noun} name or type…`}
                className="max-w-none w-full min-w-0"
                inputClassName="h-9"
              />
            </div>
            <div className="min-w-0">
              <Label className="mb-1 block text-xs">Type</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="">All types</option>
                {typeOptions.map((key) => (
                  <option key={key} value={key}>
                    {ASSESSMENT_TYPES[key].label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {canManage && (
              <Button size="sm" variant="gold" className="whitespace-nowrap" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Add {noun}
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left p-2.5 font-medium">Name</th>
                <th className="text-left p-2.5 font-medium">Type</th>
                <th className="text-left p-2.5 font-medium">Classes</th>
                {canManage && <th className="text-right p-2.5 font-medium">Action</th>}
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
                <tr key={item._id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-2.5 font-medium">{item.name}</td>
                  <td className="p-2.5 text-muted-foreground">
                    {ASSESSMENT_TYPE_LABELS[item.assessmentType as AssessmentType] || item.assessmentType}
                  </td>
                  <td className="p-2.5">{item.assignmentCount ?? 0}</td>
                  {canManage && (
                    <td className="p-2.5 text-right space-x-1">
                      <Button size="sm" variant="outline" onClick={() => openEdit(item)}>
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={deleteMut.isPending && deleteMut.variables === item._id}
                        onClick={() => {
                          if (window.confirm(`Remove "${item.name}" from the catalog?`)) {
                            deleteMut.mutate(item._id);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

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
            <Button variant="gold" onClick={save} disabled={saving || !form.name.trim()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
