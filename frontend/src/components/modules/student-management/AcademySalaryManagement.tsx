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
import { useToast } from "@/hooks/use-toast";
import type { ModuleActionCaps } from "@/lib/permissions";
import {
  fetchAcademySalaries,
  fetchAcademySalarySummary,
  generateMonthlySalaries,
  payAcademySalary,
  type AcademySalaryRecord,
} from "@/lib/studentManagementApi";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import { formatPkr, MONTH_NAMES } from "./studentDisplayUtils";
import PageSizeSelect, { DEFAULT_PAGE_SIZE } from "./PageSizeSelect";

function staffFromRecord(rec: AcademySalaryRecord) {
  const s = rec.staffId;
  if (typeof s === "object" && s) return s;
  return null;
}

function staffName(rec: AcademySalaryRecord) {
  return staffFromRecord(rec)?.name ?? "—";
}

function staffRole(rec: AcademySalaryRecord) {
  const r = staffFromRecord(rec)?.role;
  return typeof r === "object" && r?.name ? r.name : "—";
}

function periodLabel(r: AcademySalaryRecord) {
  return `${MONTH_NAMES[(r.month || 1) - 1]} ${r.year}`;
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    cancelled: "bg-muted text-muted-foreground",
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

export default function AcademySalaryManagement({ caps }: { caps: ModuleActionCaps }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [statusFilter, setStatusFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState<"" | "teacher" | "accountant">("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [search, setSearch] = useState("");
  const [payRecord, setPayRecord] = useState<AcademySalaryRecord | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [paymentNotes, setPaymentNotes] = useState("");

  const filterParams = useMemo(
    () => ({
      month: Number(month),
      year: Number(year),
      roleName: roleFilter || undefined,
    }),
    [month, year, roleFilter]
  );

  useEffect(() => {
    setPage(1);
  }, [month, year, statusFilter, roleFilter, search]);

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["academy-salaries-summary", filterParams],
    queryFn: () => fetchAcademySalarySummary(filterParams),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["academy-salaries", page, pageSize, search, statusFilter, filterParams],
    queryFn: () =>
      fetchAcademySalaries({
        page,
        limit: pageSize,
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        ...filterParams,
      }),
  });

  const genMut = useMutation({
    mutationFn: () =>
      generateMonthlySalaries({
        month: Number(month),
        year: Number(year),
        roleName: roleFilter || undefined,
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["academy-salaries"] });
      qc.invalidateQueries({ queryKey: ["academy-salaries-summary"] });
      toast({
        title: "Salaries generated",
        description: `${r.created} created, ${r.skipped} skipped (no salary or duplicate)`,
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const payMut = useMutation({
    mutationFn: () =>
      payAcademySalary(payRecord!._id, {
        paymentMethod,
        notes: paymentNotes.trim() || undefined,
      }),
    onSuccess: (rec) => {
      qc.invalidateQueries({ queryKey: ["academy-salaries"] });
      qc.invalidateQueries({ queryKey: ["academy-salaries-summary"] });
      setPayRecord(null);
      setPaymentNotes("");
      toast({
        title: "Salary paid",
        description: rec.voucherNumber ? `Voucher ${rec.voucherNumber}` : undefined,
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const records = data?.records ?? [];
  const pagination = data?.pagination;

  const canPay = caps.canEdit || caps.canCreate;
  const canGenerate = caps.canCreate || caps.canEdit;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Paid</p>
          <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
            {summaryLoading ? "…" : formatPkr(summary?.totalPaid)}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Pending</p>
          <p className="text-lg font-semibold text-amber-700 dark:text-amber-400">
            {summaryLoading ? "…" : formatPkr(summary?.totalPending)}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Vouchers</p>
          <p className="text-lg font-semibold text-primary">
            {summaryLoading ? "…" : summary?.recordsCount ?? 0}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Active staff</p>
          <p className="text-lg font-semibold text-primary">
            {summaryLoading ? "…" : summary?.activeStaff ?? 0}
          </p>
          <p className="text-[10px] text-muted-foreground">With salary &gt; 0</p>
        </Card>
      </div>

      <Card className="p-3">
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
            <Label className="text-xs">Role</Label>
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm min-w-[7rem]"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as "" | "teacher" | "accountant")}
            >
              <option value="">All staff</option>
              <option value="teacher">Teachers</option>
              <option value="accountant">Accountants</option>
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
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
            </select>
          </div>
          {canGenerate && (
            <Button
              size="sm"
              variant="secondary"
              disabled={genMut.isPending}
              onClick={() => genMut.mutate()}
            >
              {genMut.isPending ? "Generating…" : "Generate monthly salaries"}
            </Button>
          )}
        </div>
      </Card>

      <PanelSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search staff, role, voucher…"
        className="max-w-md"
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left p-2.5 font-medium">Voucher</th>
                <th className="text-left p-2.5 font-medium">Staff</th>
                <th className="text-left p-2.5 font-medium hidden sm:table-cell">Role</th>
                <th className="text-left p-2.5 font-medium">Period</th>
                <th className="text-left p-2.5 font-medium">Amount</th>
                <th className="text-left p-2.5 font-medium">Status</th>
                <th className="text-right p-2.5 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    Loading salary records…
                  </td>
                </tr>
              )}
              {!isLoading && records.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    No salary vouchers for this period. Generate monthly salaries after setting staff
                    salaries in Staff management.
                  </td>
                </tr>
              )}
              {records.map((r) => {
                const payable = r.status === "pending";
                return (
                  <tr key={r._id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-2.5 font-mono text-xs">{r.voucherNumber || "—"}</td>
                    <td className="p-2.5">
                      <div className="font-medium">{staffName(r)}</div>
                      <div className="text-xs text-muted-foreground">
                        Base: {formatPkr(staffFromRecord(r)?.salary)}
                      </div>
                    </td>
                    <td className="p-2.5 hidden sm:table-cell capitalize">{staffRole(r)}</td>
                    <td className="p-2.5">{periodLabel(r)}</td>
                    <td className="p-2.5">{formatPkr(r.amount)}</td>
                    <td className="p-2.5">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="p-2.5 text-right">
                      {payable && canPay && (
                        <Button
                          size="sm"
                          variant="hero"
                          disabled={payMut.isPending}
                          onClick={() => {
                            setPayRecord(r);
                            setPaymentMethod("bank_transfer");
                            setPaymentNotes("");
                          }}
                        >
                          Mark paid
                        </Button>
                      )}
                      {r.status === "paid" && r.paidAt && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(r.paidAt).toLocaleDateString()}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
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

      <Dialog open={Boolean(payRecord)} onOpenChange={(o) => !o && setPayRecord(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record salary payment</DialogTitle>
          </DialogHeader>
          {payRecord && (
            <div className="space-y-3 text-sm">
              <p>
                <span className="text-muted-foreground">Staff:</span>{" "}
                <span className="font-medium">{staffName(payRecord)}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Amount:</span>{" "}
                <span className="font-semibold">{formatPkr(payRecord.amount)}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Period:</span> {periodLabel(payRecord)}
              </p>
              <div className="space-y-1.5">
                <Label>Payment method</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="cash">Cash</option>
                  <option value="online">Online</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Notes (optional)</Label>
                <Input
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="Transaction reference"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayRecord(null)}>
              Cancel
            </Button>
            <Button variant="hero" disabled={payMut.isPending} onClick={() => payMut.mutate()}>
              Confirm payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
