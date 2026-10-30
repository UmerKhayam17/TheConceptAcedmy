import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronDown,
  Clock3,
  Pencil,
  Plus,
  Receipt,
  Search,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import PanelStatCard from "@/components/modules/PanelStatCard";
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
import { useAuth } from "@/hooks/useAuth";
import type { ModuleActionCaps } from "@/lib/permissions";
import { systemConfigHref } from "@/lib/systemConfigMenus";
import {
  createAcademyExpense,
  deleteAcademyExpense,
  EXPENSE_CATEGORY_LABELS,
  expenseCategoryLabel,
  exportAcademyExpenseReport,
  fetchAcademyExpenses,
  fetchAcademyExpenseSummary,
  fetchExpenseCategories,
  updateAcademyExpense,
  type AcademyExpense,
  type ExpenseCategoryConfig,
  type ExpenseReportFormat,
} from "@/lib/studentManagementApi";
import { cn, localYmd } from "@/lib/utils";
import { deliverReportBlob, openReportPreviewTab } from "@/lib/reportDownload";
import { formatPkr } from "./studentDisplayUtils";
import { DEFAULT_PAGE_SIZE } from "./PageSizeSelect";
import ListPagination from "./ListPagination";
import { DefaulterListDownload } from "./DefaulterListDownload";

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

const filterControlClass =
  "h-10 w-full cursor-pointer appearance-none truncate rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-sm font-medium text-slate-800 shadow-none outline-none transition-[border-color,box-shadow] hover:border-slate-300 focus:border-[#1a2b4b]/40 focus:ring-2 focus:ring-[#1a2b4b]/10";

function ExpenseFilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="relative block">
        <select
          className={filterControlClass}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      </span>
    </label>
  );
}

const formLabelClass =
  "text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500";
const formControlClass =
  "h-10 min-w-0 rounded-lg border-slate-200 bg-white text-base text-slate-800 shadow-none placeholder:text-slate-400 focus-visible:border-[#1a2b4b]/35 focus-visible:ring-2 focus-visible:ring-[#1a2b4b]/10 focus-visible:ring-offset-0 md:text-sm";
const formSelectClass =
  "h-10 w-full min-w-0 cursor-pointer appearance-none truncate rounded-lg border border-slate-200 bg-white pl-3 pr-9 text-base text-slate-800 shadow-none outline-none transition-[border-color,box-shadow] hover:border-slate-300 focus:border-[#1a2b4b]/35 focus:ring-2 focus:ring-[#1a2b4b]/10 md:text-sm";

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "online", label: "Online" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
] as const;

function FormField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <Label className={formLabelClass}>{label}</Label>
      {children}
    </div>
  );
}

function FormSelect({
  value,
  onChange,
  ariaLabel,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <span className="relative block min-w-0">
      <select
        className={formSelectClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </span>
  );
}

const emptyForm = (category = "rent") => ({
  title: "",
  category,
  categoryOther: "",
  amount: "",
  expenseDate: localYmd(),
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

function categoryChoices(
  categories: ExpenseCategoryConfig[],
  selectedKey: string,
): ExpenseCategoryConfig[] {
  const active = categories.filter((c) => c.isActive);
  if (!selectedKey || active.some((c) => c.key === selectedKey)) return active;
  const current = categories.find((c) => c.key === selectedKey);
  if (current) return [current, ...active];
  return [
    {
      _id: selectedKey,
      key: selectedKey,
      name: EXPENSE_CATEGORY_LABELS[selectedKey] || selectedKey,
      isActive: false,
      sortOrder: 0,
    },
    ...active,
  ];
}

export default function AcademyExpensesManagement({ caps }: { caps: ModuleActionCaps }) {
  const { toast } = useToast();
  const { user } = useAuth();
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

  const { data: categories = [] } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: fetchExpenseCategories,
  });
  const activeCategories = useMemo(() => categories.filter((c) => c.isActive), [categories]);
  const formCategories = useMemo(
    () => categoryChoices(categories, form.category),
    [categories, form.category],
  );

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

  useEffect(() => {
    if (!dialogOpen || editing || activeCategories.length === 0) return;
    if (activeCategories.some((c) => c.key === form.category)) return;
    setForm((f) => ({ ...f, category: activeCategories[0].key }));
  }, [activeCategories, dialogOpen, editing, form.category]);

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
      if (!form.category) throw new Error("Choose an expense category");
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
    setForm(emptyForm(activeCategories[0]?.key || "rent"));
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

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <PanelStatCard
          label="Total"
          value={summaryLoading ? "…" : formatPkr(summary?.totalAmount)}
          hint={`${FULL_MONTH_NAMES[Number(month) - 1]} ${year}`}
          icon={Wallet}
          iconWrapClass="bg-[#dbeafe]"
          iconClass="text-[#2563eb]"
          valueClass="text-lg sm:text-2xl"
        />
        <PanelStatCard
          label="Paid"
          value={summaryLoading ? "…" : formatPkr(summary?.paidAmount)}
          hint={
            summaryLoading || !summary?.totalAmount
              ? "Settled this period"
              : `${Math.round(((summary.paidAmount ?? 0) / summary.totalAmount) * 100)}% of total`
          }
          icon={CheckCircle2}
          iconWrapClass="bg-[#d1fae5]"
          iconClass="text-[#059669]"
          valueClass="text-lg sm:text-2xl"
        />
        <PanelStatCard
          label="Planned"
          value={summaryLoading ? "…" : formatPkr(summary?.plannedAmount)}
          hint="Not yet paid"
          icon={Clock3}
          iconWrapClass="bg-[#ede9fe]"
          iconClass="text-[#7c3aed]"
          valueClass="text-lg sm:text-2xl"
        />
        <PanelStatCard
          label="Entries"
          value={summaryLoading ? "…" : summary?.recordsCount ?? 0}
          hint="Recorded this period"
          icon={Receipt}
          iconWrapClass="bg-[#ffedd5]"
          iconClass="text-[#ea580c]"
          valueClass="text-lg sm:text-2xl"
        />
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
                {expenseCategoryLabel({ category: cat }, categories)}: {formatPkr(amt)}
              </span>
            ))}
          </div>
        </Card>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-2.5 sm:grid-cols-4">
            <ExpenseFilterSelect label="Month" value={month} onChange={setMonth}>
              {FULL_MONTH_NAMES.map((name, i) => (
                <option key={name} value={String(i + 1)}>
                  {name}
                </option>
              ))}
            </ExpenseFilterSelect>
            <ExpenseFilterSelect label="Year" value={year} onChange={setYear}>
              {Array.from({ length: 6 }, (_, i) => now.getFullYear() - 2 + i).map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </ExpenseFilterSelect>
            <ExpenseFilterSelect
              label="Category"
              value={categoryFilter}
              onChange={setCategoryFilter}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c._id} value={c.key}>
                  {c.name}
                  {c.isActive ? "" : " (inactive)"}
                </option>
              ))}
            </ExpenseFilterSelect>
            <ExpenseFilterSelect label="Status" value={statusFilter} onChange={setStatusFilter}>
              <option value="">All status</option>
              <option value="paid">Paid</option>
              <option value="planned">Planned</option>
            </ExpenseFilterSelect>
          </div>

          <label className="block min-w-0 xl:w-72 xl:shrink-0">
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Title, vendor, invoice…"
                className="h-10 rounded-lg border-slate-200 bg-white pl-9 pr-9 text-sm shadow-none placeholder:text-slate-400 focus-visible:border-[#1a2b4b]/40 focus-visible:ring-[#1a2b4b]/10"
                aria-label="Search expenses"
              />
              {search ? (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </span>
          </label>

          <div className="flex min-w-0 flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:justify-end xl:shrink-0 xl:border-l xl:border-t-0 xl:pl-3 xl:pt-0">
            {canManage && (
              <Button
                className="h-10 gap-2 rounded-lg bg-[#1a2b4b] px-4 text-white shadow-sm hover:bg-[#15233d]"
                onClick={openCreate}
              >
                <Plus className="h-4 w-4" /> Add expense
              </Button>
            )}
            {caps.canView && (
              <DefaulterListDownload
                size="default"
                label="Print / Export"
                className="rounded-lg border-slate-200 shadow-none"
                exporting={exporting}
                onDownload={(format) => void handleExport(format)}
              />
            )}
          </div>
        </div>
      </div>

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
                    {expenseCategoryLabel(row, categories)}
                  </td>
                  <td className="p-2.5">{formatPkr(row.amount)}</td>
                  <td className="p-2.5">
                    <StatusPill status={row.status} />
                  </td>
                  <td className="p-2.5 text-right space-x-1 whitespace-nowrap">
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(row)}
                        aria-label="Edit"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(row)}
                        aria-label="Delete"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pagination && (
          <ListPagination
            page={page}
            totalPages={pagination.pages}
            total={pagination.total}
            pageSize={pageSize}
            onPageSizeChange={(n) => {
              setPageSize(n);
              setPage(1);
            }}
            onPageChange={setPage}
            noun="expenses"
          />
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(o) => !o && setDialogOpen(false)}>
        <DialogContent
          className={cn(
            "flex max-h-[90dvh] w-[calc(100%-1rem)] max-w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden rounded-2xl border-slate-200 bg-white p-0 shadow-xl",
            "sm:w-full sm:max-w-[40rem] sm:rounded-2xl sm:p-0",
          )}
        >
          <DialogHeader className="shrink-0 space-y-0 border-b border-slate-200 bg-white px-4 py-4 pr-12 text-left sm:px-6">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1a2b4b] text-white">
                <Receipt className="h-5 w-5" strokeWidth={2.25} />
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-base font-semibold tracking-tight text-[#1a2b4b] sm:text-lg">
                  {editing ? "Edit expense" : "Add academy expense"}
                </DialogTitle>
                <DialogDescription className="mt-1 text-sm leading-snug text-slate-500">
                  Record the cost, then add payment details if you have them.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
            <div className="space-y-5">
              <section className="space-y-3.5">
                <p className="text-xs font-semibold text-[#1a2b4b]">Expense</p>
                <div className="grid grid-cols-1 gap-3.5 min-[480px]:grid-cols-2">
                  <FormField label="Title" className="min-[480px]:col-span-2">
                    <Input
                      className={formControlClass}
                      value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                      placeholder="e.g. Office rent — May"
                    />
                  </FormField>
                  <FormField
                    label="Category"
                    className={form.category === "other" ? "" : "min-[480px]:col-span-2"}
                  >
                    <FormSelect
                      ariaLabel="Category"
                      value={form.category}
                      onChange={(category) =>
                        setForm((f) => ({
                          ...f,
                          category,
                          categoryOther: category === "other" ? f.categoryOther : "",
                        }))
                      }
                    >
                      {formCategories.length === 0 && <option value="">No categories</option>}
                      {formCategories.map((c) => (
                        <option key={c._id} value={c.key}>
                          {c.name}
                          {c.isActive ? "" : " (inactive)"}
                        </option>
                      ))}
                    </FormSelect>
                    {activeCategories.length === 0 && (
                      <p className="text-xs leading-relaxed text-slate-500">
                        Add categories in{" "}
                        <Link
                          to={systemConfigHref(user?.role ?? "admin", "expense-categories")}
                          className="font-medium text-[#1a2b4b] underline-offset-2 hover:underline"
                        >
                          Academic Setup → Expense Categories
                        </Link>
                        .
                      </p>
                    )}
                  </FormField>
                  {form.category === "other" && (
                    <FormField label="Specify category">
                      <Input
                        className={formControlClass}
                        value={form.categoryOther}
                        onChange={(e) => setForm((f) => ({ ...f, categoryOther: e.target.value }))}
                        placeholder="e.g. Legal fees"
                      />
                    </FormField>
                  )}
                  <FormField label="Amount">
                    <div className="relative min-w-0">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold tracking-wide text-slate-400">
                        PKR
                      </span>
                      <Input
                        className={cn(formControlClass, "pl-12")}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        value={form.amount}
                        onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                        placeholder="0.00"
                      />
                    </div>
                  </FormField>
                  <FormField label="Date">
                    <Input
                      className={cn(formControlClass, "min-w-0")}
                      type="date"
                      value={form.expenseDate}
                      onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))}
                    />
                  </FormField>
                  <FormField label="Status">
                    <div className="grid h-10 grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
                      {(
                        [
                          ["paid", "Paid"],
                          ["planned", "Planned"],
                        ] as const
                      ).map(([value, label]) => {
                        const active = form.status === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            className={cn(
                              "rounded-md text-sm font-medium transition-colors",
                              active
                                ? value === "paid"
                                  ? "bg-white text-emerald-700 shadow-sm"
                                  : "bg-white text-amber-700 shadow-sm"
                                : "text-slate-500 hover:text-slate-800",
                            )}
                            aria-pressed={active}
                            onClick={() => setForm((f) => ({ ...f, status: value }))}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </FormField>
                  <FormField label="Vendor">
                    <Input
                      className={formControlClass}
                      value={form.vendor}
                      onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))}
                      placeholder="Optional"
                    />
                  </FormField>
                </div>
              </section>

              <section className="space-y-3.5 border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold text-[#1a2b4b]">Payment</p>
                <div className="grid grid-cols-1 gap-3.5 min-[480px]:grid-cols-2">
                  <FormField label="Method">
                    <FormSelect
                      ariaLabel="Payment method"
                      value={form.paymentMethod}
                      onChange={(paymentMethod) => setForm((f) => ({ ...f, paymentMethod }))}
                    >
                      {PAYMENT_METHODS.map((method) => (
                        <option key={method.value} value={method.value}>
                          {method.label}
                        </option>
                      ))}
                    </FormSelect>
                  </FormField>
                  <FormField label="Invoice / slip">
                    <Input
                      className={formControlClass}
                      value={form.referenceNumber}
                      onChange={(e) => setForm((f) => ({ ...f, referenceNumber: e.target.value }))}
                      placeholder="Optional"
                    />
                  </FormField>
                  <FormField label="Notes" className="min-[480px]:col-span-2">
                    <Textarea
                      rows={3}
                      className="min-h-[5.5rem] resize-y rounded-lg border-slate-200 bg-white text-base text-slate-800 shadow-none placeholder:text-slate-400 focus-visible:border-[#1a2b4b]/35 focus-visible:ring-2 focus-visible:ring-[#1a2b4b]/10 focus-visible:ring-offset-0 md:text-sm"
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      placeholder="Optional details about this expense"
                    />
                  </FormField>
                </div>
              </section>
            </div>
          </div>
          <DialogFooter className="shrink-0 flex-col gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:space-x-0 sm:px-6 sm:py-4">
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full rounded-lg border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 sm:h-10 sm:w-auto"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="h-11 w-full gap-2 rounded-lg bg-[#1a2b4b] text-white shadow-sm hover:bg-[#15233d] sm:h-10 sm:w-auto"
              disabled={saveMut.isPending}
              onClick={() => saveMut.mutate()}
            >
              <Plus className="h-4 w-4" />
              {saveMut.isPending ? "Saving…" : editing ? "Save changes" : "Add expense"}
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
