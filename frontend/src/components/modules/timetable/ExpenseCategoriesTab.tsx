import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  Building2,
  Car,
  CheckCircle2,
  CircleOff,
  Coffee,
  Fuel,
  HandHeart,
  LayoutGrid,
  ListPlus,
  Megaphone,
  Package,
  Pencil,
  PenLine,
  Phone,
  Plus,
  Printer,
  Receipt,
  Shapes,
  Smartphone,
  Tags,
  Trash2,
  Users,
  Wallet,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { ModuleActionCaps } from "@/lib/permissions";
import {
  createExpenseCategory,
  deleteExpenseCategory,
  fetchExpenseCategories,
  seedExpenseCategories,
  updateExpenseCategory,
  type ExpenseCategoryConfig,
} from "@/lib/studentManagementApi";
import PanelStatCard from "@/components/modules/PanelStatCard";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import { cn } from "@/lib/utils";

const QK = ["expense-categories"] as const;

const BLURBS: Record<string, string> = {
  rent: "Monthly rent and related expenses.",
  utilities: "Electricity, water, internet and utility bills.",
  supplies: "Office, classroom and general supplies.",
  maintenance: "Repairs, cleaning and facility maintenance.",
  marketing: "Promotions, events and advertising.",
  transport: "Vehicle fuel, travel and transport costs.",
  staff_other: "Staff welfare and other related expenses.",
  other: "Miscellaneous expenses.",
};

type CategoryVisual = { Icon: LucideIcon; wrap: string; color: string };

const BLUE: Pick<CategoryVisual, "wrap" | "color"> = {
  wrap: "bg-[#dbeafe]",
  color: "text-[#2563eb]",
};
const GREEN: Pick<CategoryVisual, "wrap" | "color"> = {
  wrap: "bg-[#d1fae5]",
  color: "text-[#059669]",
};
const VIOLET: Pick<CategoryVisual, "wrap" | "color"> = {
  wrap: "bg-[#ede9fe]",
  color: "text-[#7c3aed]",
};
const AMBER: Pick<CategoryVisual, "wrap" | "color"> = {
  wrap: "bg-[#ffedd5]",
  color: "text-[#ea580c]",
};
const ROSE: Pick<CategoryVisual, "wrap" | "color"> = {
  wrap: "bg-[#ffe4e6]",
  color: "text-[#e11d48]",
};
const YELLOW: Pick<CategoryVisual, "wrap" | "color"> = {
  wrap: "bg-[#fef3c7]",
  color: "text-[#d97706]",
};

/** First matching rule wins, so more specific names stay ahead of general ones. */
const ICON_RULES: { test: RegExp; Icon: LucideIcon; tone: Pick<CategoryVisual, "wrap" | "color"> }[] = [
  { test: /ufone|u fone|mobile card/i, Icon: Smartphone, tone: BLUE },
  { test: /postpaid|phone/i, Icon: Phone, tone: VIOLET },
  { test: /ptcl|internet|broadband|wifi/i, Icon: Wifi, tone: BLUE },
  { test: /electric|power|utilit/i, Icon: Zap, tone: YELLOW },
  { test: /donat|charit/i, Icon: HandHeart, tone: ROSE },
  { test: /entertain|refresh|tea|coffee/i, Icon: Coffee, tone: AMBER },
  { test: /equip/i, Icon: Wrench, tone: AMBER },
  { test: /petrol|fuel|lubric|oil/i, Icon: Fuel, tone: YELLOW },
  { test: /stationer|stationary|suppl/i, Icon: PenLine, tone: GREEN },
  { test: /print|photo/i, Icon: Printer, tone: BLUE },
  { test: /wage|salar|payroll/i, Icon: Wallet, tone: GREEN },
  { test: /repair|maint/i, Icon: Wrench, tone: AMBER },
  { test: /travel|transport/i, Icon: Car, tone: BLUE },
  { test: /advert|market/i, Icon: Megaphone, tone: ROSE },
  { test: /cash|paid to/i, Icon: Banknote, tone: GREEN },
  { test: /rent|building/i, Icon: Building2, tone: BLUE },
  { test: /staff/i, Icon: Users, tone: VIOLET },
  { test: /misc|other/i, Icon: Shapes, tone: VIOLET },
];

type StatusFilter = "" | "active" | "inactive";
type SortKey = "name-asc" | "name-desc" | "newest" | "usage";

const selectClass =
  "h-10 rounded-md border border-input bg-background px-3 text-sm shrink-0";

function categoryBlurb(row: ExpenseCategoryConfig) {
  return row.description?.trim() || BLURBS[row.key] || "";
}

function categoryVisual(row: ExpenseCategoryConfig): CategoryVisual {
  const label = `${row.key} ${row.name}`;
  const match = ICON_RULES.find((rule) => rule.test.test(label));
  if (match) return { Icon: match.Icon, ...match.tone };
  return { Icon: Receipt, ...BLUE };
}

function formatCreated(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function ExpenseCategoriesTab({ caps }: { caps: ModuleActionCaps }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<ExpenseCategoryConfig | null>(null);
  const [form, setForm] = useState({ name: "", description: "", isActive: true });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [sort, setSort] = useState<SortKey>("name-asc");

  const { data: categories = [], isLoading } = useQuery({
    queryKey: QK,
    queryFn: fetchExpenseCategories,
  });

  const stats = useMemo(() => {
    const now = new Date();
    const active = categories.filter((c) => c.isActive).length;
    const inactive = categories.length - active;
    const records = categories.reduce((sum, c) => sum + (c.usageCount || 0), 0);
    const createdThisMonth = categories.filter((c) => {
      if (!c.createdAt) return false;
      const date = new Date(c.createdAt);
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }).length;
    const activePct = categories.length ? Math.round((active / categories.length) * 100) : 0;
    return { active, inactive, records, createdThisMonth, activePct };
  }, [categories]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = categories.filter((c) => {
      if (status === "active" && !c.isActive) return false;
      if (status === "inactive" && c.isActive) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) || categoryBlurb(c).toLowerCase().includes(q)
      );
    });
    list.sort((a, b) => {
      if (sort === "name-desc") return b.name.localeCompare(a.name);
      if (sort === "newest") {
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      }
      if (sort === "usage") return (b.usageCount || 0) - (a.usageCount || 0);
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [categories, search, status, sort]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const name = form.name.trim();
      if (!name) throw new Error("Category name is required");
      const body = {
        name,
        description: form.description.trim(),
        isActive: form.isActive,
      };
      if (edit) return updateExpenseCategory(edit._id, body);
      return createExpenseCategory(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      setOpen(false);
      toast({ title: edit ? "Category updated" : "Category added" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const seedMut = useMutation({
    mutationFn: seedExpenseCategories,
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: QK });
      toast({
        title: result.created > 0 ? "Categories created" : "Categories already exist",
        description:
          result.created > 0
            ? `${result.created} categor${result.created === 1 ? "y" : "ies"} saved to the database.${
                result.skipped ? ` ${result.skipped} already existed.` : ""
              }`
            : "All sheet categories are already in the database.",
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const delMut = useMutation({
    mutationFn: deleteExpenseCategory,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      toast({ title: "Category deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openCreate = () => {
    setEdit(null);
    setForm({ name: "", description: "", isActive: true });
    setOpen(true);
  };

  return (
    <div className="min-h-full bg-slate-50 px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
              <Tags className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight">
                Expense Categories
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500 max-w-md">
                Names used in Academy Expenses. Renaming a category updates existing records.
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

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <PanelStatCard
          label="Total Categories"
          value={isLoading ? "…" : categories.length}
          hint={isLoading ? undefined : `${stats.createdThisMonth} new this month`}
          icon={LayoutGrid}
          iconWrapClass="bg-[#dbeafe]"
          iconClass="text-[#2563eb]"
        />
        <PanelStatCard
          label="Active Categories"
          value={isLoading ? "…" : stats.active}
          hint={isLoading ? undefined : `${stats.activePct}%`}
          icon={CheckCircle2}
          iconWrapClass="bg-[#d1fae5]"
          iconClass="text-[#059669]"
        />
        <PanelStatCard
          label="Inactive Categories"
          value={isLoading ? "…" : stats.inactive}
          hint={stats.inactive === 0 ? "None inactive" : "Hidden from new expenses"}
          icon={CircleOff}
          iconWrapClass="bg-[#ede9fe]"
          iconClass="text-[#7c3aed]"
        />
        <PanelStatCard
          label="Expense Records"
          value={isLoading ? "…" : stats.records}
          hint="Across all categories"
          icon={Receipt}
          iconWrapClass="bg-[#ffedd5]"
          iconClass="text-[#ea580c]"
        />
      </div>

      <Card className="rounded-2xl border-0 bg-white p-3 shadow-sm ring-1 ring-black/[0.04]">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <PanelSearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search categories..."
            className="max-w-none sm:max-w-none lg:flex-1"
          />
          <select
            className={cn(selectClass, "w-full lg:w-[9.5rem]")}
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            aria-label="Status"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select
            className={cn(selectClass, "w-full lg:w-[12.5rem]")}
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort categories"
          >
            <option value="name-asc">Sort by: Name (A-Z)</option>
            <option value="name-desc">Sort by: Name (Z-A)</option>
            <option value="newest">Sort by: Newest</option>
            <option value="usage">Sort by: Usage</option>
          </select>
          {caps.canCreate && (
            <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
              <Button
                variant="outline"
                className="h-10 w-full gap-2 sm:w-auto"
                disabled={seedMut.isPending}
                onClick={() => seedMut.mutate()}
              >
                <ListPlus className="h-4 w-4" />
                {seedMut.isPending ? "Creating…" : "Create default categories"}
              </Button>
              <Button className="h-10 w-full gap-2 sm:w-auto" onClick={openCreate}>
                <Plus className="h-4 w-4" /> Add Category
              </Button>
            </div>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden rounded-2xl border-0 bg-white shadow-sm ring-1 ring-black/[0.04]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-slate-50/80">
              <tr>
                <th className="p-3 text-left font-medium text-slate-500">Name</th>
                <th className="p-3 text-left font-medium text-slate-500">Usage</th>
                <th className="p-3 text-left font-medium text-slate-500">Status</th>
                <th className="hidden p-3 text-left font-medium text-slate-500 md:table-cell">
                  Created On
                </th>
                {(caps.canEdit || caps.canDelete) && (
                  <th className="p-3 text-right font-medium text-slate-500">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    {categories.length === 0
                      ? "No expense categories yet."
                      : "No categories match your search."}
                  </td>
                </tr>
              )}
              {rows.map((c) => {
                const visual = categoryVisual(c);
                const blurb = categoryBlurb(c);
                const usage = c.usageCount || 0;
                return (
                  <tr key={c._id} className="border-b last:border-0">
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                            visual.wrap,
                          )}
                        >
                          <visual.Icon className={cn("h-4 w-4", visual.color)} />
                        </span>
                        <div className="min-w-0">
                          <div className="font-semibold text-[#1a2b4b]">{c.name}</div>
                          {blurb ? (
                            <div className="truncate text-xs text-slate-500">{blurb}</div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap p-3 text-slate-600">
                      {usage} {usage === 1 ? "record" : "records"}
                    </td>
                    <td className="p-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                          c.isActive
                            ? "bg-emerald-500/15 text-emerald-700"
                            : "bg-slate-100 text-slate-500",
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            c.isActive ? "bg-emerald-500" : "bg-slate-400",
                          )}
                        />
                        {c.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="hidden whitespace-nowrap p-3 text-slate-600 md:table-cell">
                      {formatCreated(c.createdAt)}
                    </td>
                    {(caps.canEdit || caps.canDelete) && (
                      <td className="p-3 text-right whitespace-nowrap">
                        {caps.canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-slate-500"
                            onClick={() => {
                              setEdit(c);
                              setForm({
                                name: c.name,
                                description: c.description || "",
                                isActive: c.isActive,
                              });
                              setOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {caps.canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-rose-500 hover:text-rose-600"
                            disabled={delMut.isPending}
                            onClick={() => {
                              if (!confirm(`Delete “${c.name}”?`)) return;
                              delMut.mutate(c._id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit ? "Edit category" : "New expense category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Academy Rent, Electricity Bills"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Short note shown under the category name"
                rows={2}
                maxLength={160}
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
              <div>
                <Label htmlFor="expense-category-active">Active</Label>
                <p className="text-xs text-muted-foreground">
                  Inactive categories stay on past expenses and are hidden from new ones.
                </p>
              </div>
              <Switch
                id="expense-category-active"
                checked={form.isActive}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, isActive: checked }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!form.name.trim() || saveMut.isPending} onClick={() => saveMut.mutate()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
