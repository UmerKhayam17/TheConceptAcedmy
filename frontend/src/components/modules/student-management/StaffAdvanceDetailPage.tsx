import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
  Ban,
  Banknote,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Clock3,
  HandCoins,
  Landmark,
  Pencil,
  Receipt,
  UserRound,
  Wallet,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ModuleActionCaps } from "@/lib/permissions";
import type { Role } from "@/lib/auth";
import { salaryDetailHref } from "@/lib/panelMenus";
import { resolveUploadUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { deliverReportBlob, openReportPreviewTab, type ReportFileFormat } from "@/lib/reportDownload";
import { DefaulterListDownload } from "./DefaulterListDownload";
import {
  exportStaffAdvanceReport,
  fetchStaffAdvance,
  type StaffAdvanceDetail,
  type StaffAdvanceReportKind,
} from "@/lib/studentManagementApi";
import FilterToolbar, { FilterToolbarActions } from "@/components/modules/FilterToolbar";
import { MetricCard } from "./AcademySalaryManagement";
import {
  AdvancePanel,
  advTable,
  AdvanceFormDialog,
  CancelAdvanceDialog,
  METHOD_LABEL,
  RepayAdvanceDialog,
  StatusBadge,
  TYPE_LABEL,
  TypeBadge,
  fmtDate,
  formatRs,
  monthsToRecover,
  periodShort,
  staffOf,
  type AdvanceLike,
} from "./staffAdvanceShared";

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-right font-medium text-[#14213d] dark:text-slate-100">{children}</span>
    </div>
  );
}

function TopBar({ title, description, icon: Icon }: { title: string; description: string; icon: typeof Receipt }) {
  return (
    <div className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
            <Icon className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight">{title}</h2>
            <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500 max-w-xl">{description}</p>
          </div>
        </div>
        <div className="shrink-0 rounded-lg bg-primary/10 px-3 py-2 max-w-[14rem]">
          <p className="text-xs sm:text-sm italic leading-snug text-[#1a2b4b]/80">
            <span className="mr-1 text-primary not-italic font-serif text-base leading-none">&ldquo;</span>
            A great school builds great futures.
            <span className="ml-0.5 text-primary not-italic font-serif text-base leading-none">&rdquo;</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function ProfileItem({ icon: Icon, label, children }: { icon: typeof Receipt; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 min-w-0">
      <Icon className="h-4 w-4 mt-0.5 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <div className="text-sm font-semibold text-[#1a2b4b]">{children}</div>
      </div>
    </div>
  );
}

function personName(v: StaffAdvanceDetail["createdBy"]) {
  return v && typeof v === "object" ? v.name : "—";
}

/** One advance / loan: summary, recovery progress, history and upcoming salary deductions. */
type ExportParams = { type?: string; status?: string; search?: string; staffId?: string; ids?: string[] };

export default function StaffAdvanceDetailPage({
  advanceId,
  caps,
}: {
  advanceId: string;
  caps: ModuleActionCaps;
}) {
  const navigate = useNavigate();
  const { role = "admin" } = useParams<{ role: Role }>();
  const [editOpen, setEditOpen] = useState(false);
  const [repayFor, setRepayFor] = useState<AdvanceLike | null>(null);
  const [cancelFor, setCancelFor] = useState<AdvanceLike | null>(null);
  const { toast } = useToast();
  const [exporting, setExporting] = useState<ReportFileFormat | null>(null);
  const handleExport = async (format: ReportFileFormat, kind: StaffAdvanceReportKind, params: ExportParams) => {
    setExporting(format);
    const preview = openReportPreviewTab(format);
    try {
      const blob = await exportStaffAdvanceReport({ kind, ...params }, format);
      const base = kind === "repayments" ? "Advance-Loan-Repayments" : "Staff-Advances-Loans";
      const mode = deliverReportBlob(blob, `${base}_${new Date().toISOString().slice(0, 10)}.${format}`, format, preview);
      toast({
        title: mode === "preview" ? "Report preview opened" : "Excel downloaded",
        description: mode === "preview" ? "Use Print or Download from the preview window." : "Advances & loans report downloaded.",
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

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["staff-advance", advanceId],
    queryFn: () => fetchStaffAdvance(advanceId),
  });

  if (isLoading || isError || !data) {
    return (
      <div className="min-h-full bg-slate-50 px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <TopBar
          icon={HandCoins}
          title="Advance / Loan Details"
          description="Manage advance and loan information, recovery and repayments."
        />
        <Card
          className={cn(
            "rounded-2xl border-0 p-10 text-center text-sm shadow-sm",
            isLoading ? "text-muted-foreground" : "text-destructive",
          )}
        >
          {isLoading ? "Loading…" : error instanceof Error ? error.message : "Could not load this record."}
        </Card>
      </div>
    );
  }

  const a = data;
  const staff = staffOf(a);
  const name = staff?.name || "—";
  const roleLabel = staff?.designation || staff?.role?.name?.replace(/_/g, " ") || "";
  const isActive = a.status === "active";
  const pct = a.amount > 0 ? Math.min(100, Math.round((a.recoveredAmount / a.amount) * 100)) : 0;
  const months = monthsToRecover(a.remainingAmount, a.installmentAmount);
  const TypeIcon = a.type === "loan" ? Landmark : HandCoins;
  // Modals only need the list-row fields.
  const asRow = a as unknown as AdvanceLike;
  const repayments = [...a.repayments].sort(
    (x, y) => new Date(y.paidAt || 0).getTime() - new Date(x.paidAt || 0).getTime(),
  );
  const viaSalary = a.repayments
    .filter((r) => r.salaryRecordId)
    .reduce((n, r) => n + (Number(r.amount) || 0), 0);
  const viaCash = a.recoveredAmount - viaSalary;

  return (
    <div className="min-h-full bg-slate-50 px-4 py-6 sm:px-6 lg:px-8 space-y-4">
      {/* Top bar — same as Parent Account Details */}
      <TopBar
        icon={TypeIcon}
        title={`${TYPE_LABEL[a.type]} Details`}
        description={`Manage ${TYPE_LABEL[a.type].toLowerCase()} information, recovery and repayments.`}
      />

      {/* Profile card — same as the parent account card */}
      <div className="rounded-2xl border-0 bg-white p-5 sm:p-6 shadow-sm ring-1 ring-black/[0.04]">
        <div className="flex flex-col sm:flex-row gap-5 sm:items-start">
          <div className="h-24 w-24 sm:h-28 sm:w-28 shrink-0 rounded-full overflow-hidden bg-slate-100 ring-4 ring-slate-50 flex items-center justify-center">
            {staff?.profileImage ? (
              <img src={resolveUploadUrl(staff.profileImage)} alt="" className="h-full w-full object-cover" />
            ) : (
              <UserRound className="h-10 w-10 text-slate-400" />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1a2b4b] truncate">{name}</h2>
              <TypeBadge type={a.type} />
              <StatusBadge status={a.status} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-4">
              <ProfileItem icon={UserRound} label="Staff role">
                <span className="capitalize">{roleLabel || "—"}</span>
              </ProfileItem>
              <ProfileItem icon={CalendarDays} label="Given on">
                {fmtDate(a.givenDate)}
              </ProfileItem>
              <ProfileItem icon={CreditCard} label="Paid out by">
                {METHOD_LABEL[a.paymentMethod || ""] || "—"}
              </ProfileItem>
              <ProfileItem icon={TypeIcon} label={`${TYPE_LABEL[a.type]} amount`}>
                <span className="tabular-nums">{formatRs(a.amount)}</span>
              </ProfileItem>
              <ProfileItem icon={CalendarClock} label="Deduct from">
                {periodShort(a.startMonth, a.startYear)}
              </ProfileItem>
              <ProfileItem icon={Wallet} label="Still owed">
                <span className="tabular-nums text-[#EA580C]">
                  {a.status === "cancelled" ? "—" : formatRs(a.remainingAmount)}
                </span>
              </ProfileItem>
            </div>
          </div>
        </div>
      </div>

      {/* Figures */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          title={`${TYPE_LABEL[a.type]} Amount`}
          value={formatRs(a.amount)}
          description={`Given ${fmtDate(a.givenDate)}`}
          icon={TypeIcon}
          iconBg="hsl(var(--primary) / 0.1)"
          iconColor="hsl(var(--primary))"
          valueClass="text-primary"
        />
        <MetricCard
          title="Recovered"
          value={formatRs(a.recoveredAmount)}
          description={`${pct}% paid back`}
          icon={CheckCircle2}
          iconBg="#DCFCE7"
          iconColor="#16A66A"
          valueClass="text-[#16A66A]"
        />
        <MetricCard
          title="Still Owed"
          value={a.status === "cancelled" ? "—" : formatRs(a.remainingAmount)}
          description={a.status === "closed" ? "Fully recovered" : a.status === "cancelled" ? "Cancelled" : "To recover"}
          icon={Clock3}
          iconBg="#FFEDD5"
          iconColor="#EA580C"
          valueClass="text-[#EA580C]"
        />
        <MetricCard
          title="Monthly Deduction"
          value={a.type === "loan" ? formatRs(a.installmentAmount) : "Full"}
          description={
            a.type === "loan"
              ? isActive && months > 0
                ? `About ${months} month${months === 1 ? "" : "s"} left`
                : "Per salary"
              : "From the next salary"
          }
          icon={CalendarClock}
          iconBg="hsl(var(--accent) / 0.18)"
          iconColor="hsl(var(--accent))"
          valueClass="text-primary"
        />
      </div>

      {/* Progress */}
      <Card className="p-4 shadow-sm border-border/80">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-semibold text-primary">Recovery progress</span>
          <span className="tabular-nums text-muted-foreground">
            {formatRs(a.recoveredAmount)} of {formatRs(a.amount)} · <span className="font-semibold text-primary">{pct}%</span>
          </span>
        </div>
        <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-3 rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <span>
            Through salary: <span className="font-semibold text-[#1a2b4b]">{formatRs(viaSalary)}</span>
          </span>
          <span>
            Paid back directly: <span className="font-semibold text-[#1a2b4b]">{formatRs(viaCash)}</span>
          </span>
        </div>
      </Card>

      {/* Action bar — same card + toolbar as the list page filter bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
          <FilterToolbar>
            <p className="text-sm text-slate-500">
              {caps.canEdit && isActive
                ? "Staff paid money back directly? Record it here."
                : "Print or export this record and its repayments."}
            </p>
            <FilterToolbarActions>
              <DefaulterListDownload
                variant="outline"
                size="default"
                className="shrink-0"
                label="Print / Export"
                exporting={exporting}
                reportKinds={[
                  { id: "repayments", label: "Repayment Statement" },
                  { id: "list", label: `${TYPE_LABEL[a.type]} Summary` },
                ]}
                onDownload={(format, kind) =>
                  void handleExport(format, kind === "list" ? "list" : "repayments", { ids: [a._id] })
                }
              />
              {caps.canDelete && isActive && a.recoveredAmount <= 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 h-10 shrink-0 rounded-md border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setCancelFor(asRow)}
                >
                  <Ban className="h-4 w-4" />
                  Cancel
                </Button>
              ) : null}
              {caps.canEdit && isActive ? (
                <>
                  <Button
                    type="button"
                    className="gap-2 h-10 shrink-0 rounded-md bg-sky-500 px-5 font-semibold text-white shadow-md hover:bg-sky-600"
                    onClick={() => setEditOpen(true)}
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    className="gap-2 h-10 shrink-0 rounded-md px-5 font-semibold shadow-md"
                    onClick={() => setRepayFor(asRow)}
                  >
                    <Banknote className="h-4 w-4" />
                    Receive payment
                  </Button>
                </>
              ) : null}
            </FilterToolbarActions>
          </FilterToolbar>
        </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* History */}
        <AdvancePanel
          title="Repayment History"
          icon={CalendarDays}
          className="xl:col-span-2 self-start"
          right={`${a.repayments.length} ${a.repayments.length === 1 ? "entry" : "entries"}`}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={advTable.head}>
                <tr>
                  <th className={advTable.th}>Date</th>
                  <th className={advTable.th}>Recovered through</th>
                  <th className={advTable.th}>Salary month</th>
                  <th className={advTable.thRight}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {repayments.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-10 text-center text-muted-foreground">
                      Nothing recovered yet. It is deducted when a salary voucher is paid.
                    </td>
                  </tr>
                ) : (
                  repayments.map((r) => {
                    const voucher = r.salaryRecordId && typeof r.salaryRecordId === "object" ? r.salaryRecordId : null;
                    const voucherId = voucher?._id || (typeof r.salaryRecordId === "string" ? r.salaryRecordId : "");
                    return (
                      <tr key={r._id} className={advTable.row}>
                        <td className={advTable.td}>
                          <span className="inline-flex items-center gap-2 whitespace-nowrap text-[#14213d] dark:text-slate-100">
                            <CalendarDays className="h-4 w-4 text-slate-500" />
                            {fmtDate(r.paidAt)}
                          </span>
                        </td>
                        <td className={advTable.td}>
                          {voucherId ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
                              onClick={() => navigate(salaryDetailHref(role, voucherId))}
                            >
                              <Receipt className="h-4 w-4" />
                              Salary {voucher?.voucherNumber || "voucher"}
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-2 text-[#14213d] dark:text-slate-100">
                              <CreditCard className="h-4 w-4 text-violet-600" />
                              Paid back directly
                            </span>
                          )}
                        </td>
                        <td className={cn(advTable.td, "text-slate-500")}>
                          {voucherId ? periodShort(voucher?.month ?? r.month, voucher?.year ?? r.year) : "—"}
                        </td>
                        <td className={cn(advTable.td, "text-right font-semibold tabular-nums text-[#16A66A]")}>
                          {formatRs(r.amount)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {repayments.length > 0 ? (
                <tfoot>
                  <tr className={advTable.totalRow}>
                    <td colSpan={3} className={cn(advTable.td, "font-bold text-[#14213d] dark:text-slate-100")}>
                      Total recovered
                    </td>
                    <td className={cn(advTable.td, "text-right text-base font-bold tabular-nums text-[#16A66A]")}>
                      {formatRs(a.recoveredAmount)}
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </AdvancePanel>

        <div className="space-y-4">
          {/* Details */}
          <AdvancePanel title="Details" icon={Receipt} iconClassName="text-amber-400">
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              <InfoRow label="Type">
                <TypeBadge type={a.type} />
              </InfoRow>
              <InfoRow label="Amount">{formatRs(a.amount)}</InfoRow>
              {a.type === "loan" ? <InfoRow label="Monthly installment">{formatRs(a.installmentAmount)}</InfoRow> : null}
              <InfoRow label="Deduct from">{periodShort(a.startMonth, a.startYear)}</InfoRow>
              <InfoRow label="Given on">{fmtDate(a.givenDate)}</InfoRow>
              <InfoRow label="Paid out by">{METHOD_LABEL[a.paymentMethod || ""] || "—"}</InfoRow>
              <InfoRow label="Recorded by">{personName(a.createdBy)}</InfoRow>
              {a.closedAt ? <InfoRow label="Fully recovered on">{fmtDate(a.closedAt)}</InfoRow> : null}
              {a.notes ? (
                <div className="px-4 py-2.5 text-sm">
                  <p className="text-muted-foreground">Notes</p>
                  <p className="mt-1 whitespace-pre-wrap text-[#1a2b4b]">{a.notes}</p>
                </div>
              ) : null}
            </div>
          </AdvancePanel>

          {/* Upcoming */}
          {isActive ? (
            <AdvancePanel title="Next salary deductions" icon={Clock3} tone="soft">
              {a.upcomingDeductions.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No pending salary voucher yet. It will be deducted when the next salaries are generated.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {a.upcomingDeductions.map((u) => (
                    <button
                      key={u.salaryRecordId}
                      type="button"
                      onClick={() => navigate(salaryDetailHref(role, u.salaryRecordId))}
                      className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted/40"
                    >
                      <span>
                        <span className="block font-medium text-[#1a2b4b]">{periodShort(u.month, u.year)}</span>
                        <span className="block text-xs text-muted-foreground">{u.voucherNumber || "Pending voucher"}</span>
                      </span>
                      <span className="text-base font-bold tabular-nums text-rose-600">− {formatRs(u.amount)}</span>
                    </button>
                  ))}
                </div>
              )}
            </AdvancePanel>
          ) : null}
        </div>
      </div>

      <AdvanceFormDialog open={editOpen} onOpenChange={setEditOpen} editing={asRow} />
      <RepayAdvanceDialog advance={repayFor} onClose={() => setRepayFor(null)} />
      <CancelAdvanceDialog advance={cancelFor} onClose={() => setCancelFor(null)} />
    </div>
  );
}
