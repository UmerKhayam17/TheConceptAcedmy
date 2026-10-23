import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Receipt, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  expenseCategoryLabel,
  exportAcademyExpenseReport,
  fetchAcademyExpenses,
  fetchAcademyExpenseSummary,
  updateAcademyExpense,
  type AcademyExpense,
  type ExpenseCategory,
  type ExpenseReportFormat,
} from "@/lib/studentManagementApi";
import { cn } from "@/lib/utils";
import { deliverReportBlob, openReportPreviewTab } from "@/lib/reportDownload";
import { formatPkr } from "./studentDisplayUtils";
import PageSizeSelect, { DEFAULT_PAGE_SIZE } from "./PageSizeSelect";
import { DefaulterListDownload } from "./DefaulterListDownload";

const CATEGORIES = Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[];

const FULL_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const selectClass =
  "h-10 rounded-md border border-input bg-background px-3 text-sm min-w-[7.5rem] shrink-0";

const emptyForm = () => ({
  title: "",
  category: "rent" as ExpenseCategory,
  categoryOther: "",
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
  const [exporting, setExporting] = useState<ExpenseReportFormat | null>(null);

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
        categoryOther:
          form.category === "other" ? form.categoryOther.trim() || undefined : undefined,
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
      categoryOther: row.categoryOther || "",
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

  const handleExport = async (format: ExpenseReportFormat) => {
    setExporting(format);
    const preview = openReportPreviewTab(format);
    try {
      const blob = await exportAcademyExpenseReport(
        {
          month: Number(month),
          year: Number(year),
          category: categoryFilter || undefined,
          status: statusFilter || undefined,
          search: search.trim() || undefined,
        },
        format,
      );
      const monthLabel = FULL_MONTH_NAMES[Number(month) - 1] || month;
      const mode = deliverReportBlob(
        blob,
        `Academy-Expenses_${monthLabel}-${year}.${format}`,
        format,
        preview,
      );
      toast({
        title: mode === "preview" ? "Report preview opened" : "Excel downloaded",
        description:
          mode === "preview"
            ? "Use Print or Download from the preview window."
            : "Expense report downloaded.",
      });
    } catch (e) {
      preview?.close();
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : "Could not export",
        variant: "destructive",
      });
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="min-h-full bg-slate-50 px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      {/* Compact theme header — matches Staff Salary / Subjects */}
      <div className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
              <Receipt className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight">
                Academy Expenses
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500 max-w-md">
                Track rent, utilities, supplies, and other operating costs for the academy.
              </p>
            </div>
          </div>
          <div className="shrink-0 rounded-lg bg-primary/10 px-3 py-2 max-w-[14rem]">
            <p className="text-xs sm:text-sm italic leading-snug text-[#1a2b4b]/80">
              <span className="mr-1 text-primary not-italic font-serif text-base leading-none">
                &ldquo;
              </span>
              A great school builds great futures.
              <span className="ml-0.5 text-primary not-italic font-serif text-base leading-none">
                &rdquo;
              </span>
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
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

      <Card className="p-3 sm:p-4 shadow-sm border-border/80">
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={cn(selectClass, "w-[10rem]")}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            aria-label="Month"
          >
            {FULL_MONTH_NAMES.map((name, i) => (
              <option key={name} value={String(i + 1)}>
                {name}
              </option>
            ))}
          </select>
          <select
            className={cn(selectClass, "w-[7rem] min-w-[7rem]")}
            value={year}
            onChange={(e) => setYear(e.target.value)}
            aria-label="Year"
          >
            {Array.from({ length: 6 }, (_, i) => now.getFullYear() - 2 + i).map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
          <select
            className={cn(selectClass, "min-w-[10rem]")}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Category"
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {EXPENSE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <select
            className={cn(selectClass, "min-w-[8rem]")}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Status"
          >
            <option value="">All status</option>
            <option value="paid">Paid</option>
            <option value="planned">Planned</option>
          </select>

          <div className="relative min-w-[12rem] flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, vendor, invoice / slip…"
              className="h-10 pl-9"
              aria-label="Search expenses"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0 ml-auto">
            {canManage && (
              <Button className="gap-2 h-10" onClick={openCreate}>
                <Plus className="h-4 w-4" /> Add expense
              </Button>
            )}
            {caps.canView && (
              <DefaulterListDownload
                size="default"
                label="Print / Export"
                exporting={exporting}
                onDownload={(format) => void handleExport(format)}
              />
            )}
          </div>
        </div>
      </Card>

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
                    {expenseCategoryLabel(row)}
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
        <DialogContent className="sm:max-w-xl gap-0 p-0 overflow-hidden">
          <DialogHeader className="border-b border-border/80 bg-slate-50/80 px-5 py-4 space-y-1">
            <DialogTitle className="text-lg font-semibold text-[#1a2b4b]">
              {editing ? "Edit expense" : "Add academy expense"}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Record an operating cost with category, amount, and payment details.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Title
              </Label>
              <Input
                className="h-10"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Office rent — May"
              />
            </div>
            <div className={cn("space-y-1.5", form.category === "other" ? "" : "sm:col-span-2")}>
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Category
              </Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.category}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    category: e.target.value as ExpenseCategory,
                    categoryOther:
                      e.target.value === "other" ? f.categoryOther : "",
                  }))
                }
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {EXPENSE_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            {form.category === "other" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Specify category
                </Label>
                <Input
                  className="h-10"
                  value={form.categoryOther}
                  onChange={(e) => setForm((f) => ({ ...f, categoryOther: e.target.value }))}
                  placeholder="e.g. Legal fees, Event refreshments"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Amount (PKR)
              </Label>
              <Input
                className="h-10"
                type="number"
                min={0}
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Date
              </Label>
              <Input
                className="h-10"
                type="date"
                value={form.expenseDate}
                onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Status
              </Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
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
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Vendor
              </Label>
              <Input
                className="h-10"
                value={form.vendor}
                onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Payment method
              </Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.paymentMethod}
                onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))}
              >
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="online">Online</option>
                <option value="cheque">Cheque</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Invoice number or slip number
              </Label>
              <Input
                className="h-10"
                value={form.referenceNumber}
                onChange={(e) => setForm((f) => ({ ...f, referenceNumber: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Notes
              </Label>
              <Textarea
                rows={3}
                className="min-h-[4.5rem] resize-y"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional details about this expense"
              />
            </div>
          </div>
          <DialogFooter className="border-t border-border/80 bg-slate-50/60 px-5 py-3.5 sm:justify-end">
            <Button variant="outline" className="h-10" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button className="h-10 gap-2" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
              <Plus className="h-4 w-4" />
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
