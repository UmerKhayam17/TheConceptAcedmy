import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  createAcademyExpense,
  deleteAcademyExpense,
  EXPENSE_CATEGORY_LABELS,
  fetchAcademyExpenses,
  fetchAcademyExpenseSummary,
  updateAcademyExpense,
  type AcademyExpense,
  type ExpenseCategory,
} from "@/lib/studentManagementApi";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import { formatPkr } from "./studentDisplayUtils";
import PageSizeSelect, { DEFAULT_PAGE_SIZE } from "./PageSizeSelect";

const CATEGORIES = Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[];

const emptyForm = () => ({
  title: "",
  category: "other" as ExpenseCategory,
  amount: "",
  expenseDate: new Date().toISOString().slice(0, 10),
  vendor: "",
  description: "",
  paymentMethod: "cash",
  referenceNumber: "",
  status: "paid" as "paid" | "planned",
});

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    planned: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  };
  return (
    <span
      className={`text-xs font-semibold rounded-full px-2 py-0.5 capitalize ${
        colors[status] || "bg-muted text-muted-foreground"
      }`}
    >
      {status}
    </span>
  );
}

export default function AcademyExpensesManagement({ caps }: { caps: ModuleActionCaps }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AcademyExpense | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<AcademyExpense | null>(null);

  const filterParams = useMemo(
    () => ({
      month: Number(month),
      year: Number(year),
      category: categoryFilter || undefined,
    }),
    [month, year, categoryFilter]
  );

  useEffect(() => {
    setPage(1);
  }, [month, year, categoryFilter, statusFilter, search]);

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["academy-expenses-summary", filterParams],
    queryFn: () => fetchAcademyExpenseSummary(filterParams),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["academy-expenses", page, pageSize, statusFilter, search, filterParams],
    queryFn: () =>
      fetchAcademyExpenses({
        page,
        limit: pageSize,
        status: statusFilter || undefined,
        search: search.trim() || undefined,
        ...filterParams,
      }),
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const amount = Number(form.amount);
      if (!form.title.trim() || !amount || amount <= 0) {
        throw new Error("Title and a valid amount are required");
      }
      const body = {
        title: form.title.trim(),
        category: form.category,
        amount,
        expenseDate: form.expenseDate,
        vendor: form.vendor.trim() || undefined,
        description: form.description.trim() || undefined,
        paymentMethod: form.paymentMethod || undefined,
        referenceNumber: form.referenceNumber.trim() || undefined,
        status: form.status,
      };
      if (editing) return updateAcademyExpense(editing._id, body);
      return createAcademyExpense(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academy-expenses"] });
      qc.invalidateQueries({ queryKey: ["academy-expenses-summary"] });
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm());
      toast({ title: editing ? "Expense updated" : "Expense recorded" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteAcademyExpense(deleteTarget!._id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academy-expenses"] });
      qc.invalidateQueries({ queryKey: ["academy-expenses-summary"] });
      setDeleteTarget(null);
      toast({ title: "Expense deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const records = data?.records ?? [];
  const pagination = data?.pagination;
  const canManage = caps.canCreate || caps.canEdit;
  const canDelete = caps.canDelete;

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (row: AcademyExpense) => {
    setEditing(row);
    setForm({
      title: row.title,
      category: row.category,
      amount: String(row.amount),
      expenseDate: row.expenseDate.slice(0, 10),
      vendor: row.vendor || "",
      description: row.description || "",
      paymentMethod: row.paymentMethod || "cash",
      referenceNumber: row.referenceNumber || "",
      status: row.status,
    });
    setDialogOpen(true);
  };

  const topCategories = useMemo(() => {
    if (!summary?.byCategory) return [];
    return Object.entries(summary.byCategory)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  }, [summary]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Total</p>
          <p className="text-lg font-semibold text-primary">
            {summaryLoading ? "…" : formatPkr(summary?.totalAmount)}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Paid</p>
          <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
            {summaryLoading ? "…" : formatPkr(summary?.paidAmount)}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Planned</p>
          <p className="text-lg font-semibold text-amber-700 dark:text-amber-400">
            {summaryLoading ? "…" : formatPkr(summary?.plannedAmount)}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Entries</p>
          <p className="text-lg font-semibold text-primary">
            {summaryLoading ? "…" : summary?.recordsCount ?? 0}
          </p>
        </Card>
      </div>

      {topCategories.length > 0 && (
        <Card className="p-3">
          <p className="text-xs text-muted-foreground mb-1">Top categories this period</p>
          <div className="flex flex-wrap gap-2">
            {topCategories.map(([cat, amt]) => (
              <span
                key={cat}
                className="text-xs rounded-full bg-muted px-2.5 py-1"
              >
                {EXPENSE_CATEGORY_LABELS[cat as ExpenseCategory] || cat}: {formatPkr(amt)}
              </span>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-3">
        <div className="flex flex-wrap gap-3 items-end justify-between">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <Label className="text-xs">Month</Label>
              <Input
                type="number"
                min={1}
                max={12}
                className="w-20 h-9"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Year</Label>
              <Input
                type="number"
                className="w-24 h-9"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Category</Label>
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm min-w-[8rem]"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="">All</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {EXPENSE_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All</option>
                <option value="paid">Paid</option>
                <option value="planned">Planned</option>
              </select>
            </div>
          </div>
          {canManage && (
            <Button size="sm" variant="hero" onClick={openCreate}>
              Add expense
            </Button>
          )}
        </div>
      </Card>

      <PanelSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search title, vendor, reference…"
        className="max-w-md"
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left p-2.5 font-medium">Date</th>
                <th className="text-left p-2.5 font-medium">Title</th>
                <th className="text-left p-2.5 font-medium hidden md:table-cell">Category</th>
                <th className="text-left p-2.5 font-medium">Amount</th>
                <th className="text-left p-2.5 font-medium">Status</th>
                <th className="text-right p-2.5 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    Loading expenses…
                  </td>
                </tr>
              )}
              {!isLoading && records.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    No expenses for this period. Add rent, utilities, supplies, and other operating
                    costs.
                  </td>
                </tr>
              )}
              {records.map((row) => (
                <tr key={row._id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-2.5 whitespace-nowrap">
                    {new Date(row.expenseDate).toLocaleDateString()}
                  </td>
                  <td className="p-2.5">
                    <div className="font-medium">{row.title}</div>
                    {row.vendor && (
                      <div className="text-xs text-muted-foreground">{row.vendor}</div>
                    )}
                  </td>
                  <td className="p-2.5 hidden md:table-cell">
                    {EXPENSE_CATEGORY_LABELS[row.category] || row.category}
                  </td>
                  <td className="p-2.5">{formatPkr(row.amount)}</td>
                  <td className="p-2.5">
                    <StatusPill status={row.status} />
                  </td>
                  <td className="p-2.5 text-right space-x-1">
                    {canManage && (
                      <Button size="sm" variant="outline" onClick={() => openEdit(row)}>
                        Edit
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setDeleteTarget(row)}
                      >
                        Delete
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pagination && (
          <div className="flex justify-center items-center gap-3 p-3 border-t flex-wrap">
            <PageSizeSelect
              value={pageSize}
              onChange={(n) => {
                setPageSize(n);
                setPage(1);
              }}
            />
            {pagination.pages > 1 && (
              <>
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Prev
                </Button>
                <span className="text-sm self-center">
                  Page {page} / {pagination.pages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </>
            )}
          </div>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(o) => !o && setDialogOpen(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit expense" : "Add academy expense"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Office rent — May"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={form.category}
                onChange={(e) =>
                  setForm((f) => ({ ...f, category: e.target.value as ExpenseCategory }))
                }
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {EXPENSE_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Amount (PKR)</Label>
              <Input
                type="number"
                min={0}
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input
                type="date"
                value={form.expenseDate}
                onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value as "paid" | "planned" }))
                }
              >
                <option value="paid">Paid</option>
                <option value="planned">Planned</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Vendor (optional)</Label>
              <Input
                value={form.vendor}
                onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Payment method</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={form.paymentMethod}
                onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))}
              >
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="online">Online</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Reference (optional)</Label>
              <Input
                value={form.referenceNumber}
                onChange={(e) => setForm((f) => ({ ...f, referenceNumber: e.target.value }))}
                placeholder="Invoice / receipt number"
              />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="hero" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
              {editing ? "Save changes" : "Add expense"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete expense?</DialogTitle>
          </DialogHeader>
          {deleteTarget && (
            <p className="text-sm text-muted-foreground">
              Remove <span className="font-medium text-foreground">{deleteTarget.title}</span> (
              {formatPkr(deleteTarget.amount)})? This cannot be undone.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMut.isPending}
              onClick={() => deleteMut.mutate()}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
