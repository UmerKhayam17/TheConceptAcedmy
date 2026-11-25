import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Banknote, Check, HandCoins, Landmark, Plus, type LucideIcon } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { fetchStaffUsers } from "@/lib/staffApi";
import {
  cancelStaffAdvance,
  createStaffAdvance,
  repayStaffAdvance,
  updateStaffAdvance,
  type StaffAdvance,
  type StaffAdvanceStatus,
  type StaffAdvanceType,
} from "@/lib/studentManagementApi";
import { MONTH_NAMES } from "./studentDisplayUtils";

/** Shared helpers + modals for Advances & Loans (list page, detail page, staff profile). */

/** Table styling shared by the list and detail pages (navy title bar, light column header). */
export const advTable = {
  head: "bg-slate-100/80 dark:bg-slate-800/60",
  th: "px-4 py-3.5 text-left font-medium text-[#1a2b4b] dark:text-slate-200",
  thRight: "px-4 py-3.5 text-right font-medium text-[#1a2b4b] dark:text-slate-200",
  row: "border-t border-slate-100 dark:border-slate-800",
  td: "px-4 py-3.5",
  totalRow: "border-t border-emerald-100 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30",
};

/** White card with a dark navy title bar: icon, title, and an optional note on the right. */
export function AdvancePanel({
  title,
  icon: Icon,
  iconClassName,
  right,
  tone = "dark",
  children,
  className,
}: {
  title: string;
  icon: LucideIcon;
  iconClassName?: string;
  right?: ReactNode;
  /** "dark" = navy bar (main tables), "soft" = pale blue bar (small side cards). */
  tone?: "dark" | "soft";
  children: ReactNode;
  className?: string;
}) {
  const dark = tone === "dark";
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-card shadow-sm",
        dark ? "border-[#14213d]/10" : "border-blue-100 dark:border-slate-800",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-3 px-4 py-3 sm:px-5",
          dark
            ? "bg-[#14213d] text-white"
            : "border-b border-blue-100 bg-blue-50/70 text-[#14213d] dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-100",
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5 font-semibold">
          <Icon className={cn("h-5 w-5 shrink-0", iconClassName ?? (dark ? "text-white" : "text-[#14213d] dark:text-slate-100"))} />
          <span className="truncate">{title}</span>
        </div>
        {right ? (
          <div className={cn("shrink-0 text-sm", dark ? "text-white/85" : "text-muted-foreground")}>{right}</div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/** The fields every modal needs; works for list rows and the detail record. */
export type AdvanceLike = Pick<
  StaffAdvance,
  | "_id"
  | "staffId"
  | "type"
  | "amount"
  | "installmentAmount"
  | "recoveredAmount"
  | "remainingAmount"
  | "givenDate"
  | "startMonth"
  | "startYear"
  | "paymentMethod"
  | "notes"
>;

export function formatRs(n?: number) {
  if (n == null || Number.isNaN(n)) return "Rs —";
  return `Rs ${Math.round(n).toLocaleString()}`;
}

export function fmtDate(v?: string) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function staffOf(a: Pick<StaffAdvance, "staffId">) {
  return typeof a.staffId === "object" && a.staffId ? a.staffId : null;
}

export const TYPE_LABEL: Record<StaffAdvanceType, string> = { advance: "Advance", loan: "Loan" };
export const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  online: "Online",
  other: "Other",
};

export const periodShort = (month?: number, year?: number) =>
  month && year ? `${MONTH_NAMES[month - 1]?.slice(0, 3)} ${year}` : "—";

/** Months a loan needs at its installment rate (display only). */
export function monthsToRecover(remaining: number, installment: number) {
  if (!(installment > 0) || !(remaining > 0)) return 0;
  return Math.ceil(remaining / installment);
}

export function StatusBadge({ status }: { status: StaffAdvanceStatus }) {
  const cls =
    status === "active"
      ? "bg-orange-50 text-orange-700"
      : status === "closed"
        ? "bg-emerald-50 text-emerald-700"
        : "bg-muted text-muted-foreground";
  const label = status === "active" ? "Active" : status === "closed" ? "Recovered" : "Cancelled";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", cls)}>
      {label}
    </span>
  );
}

export function TypeBadge({ type }: { type: StaffAdvanceType }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        type === "loan" ? "bg-primary/10 text-primary" : "bg-accent/20 text-accent-foreground",
      )}
    >
      {TYPE_LABEL[type]}
    </span>
  );
}

/** Refresh everything an advance change can touch. */
export function useInvalidateAdvances() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["staff-advances"] });
    qc.invalidateQueries({ queryKey: ["staff-advance"] });
    qc.invalidateQueries({ queryKey: ["staff-advance-summary"] });
    qc.invalidateQueries({ queryKey: ["academy-salaries"] });
    qc.invalidateQueries({ queryKey: ["academy-salaries-summary"] });
    qc.invalidateQueries({ queryKey: ["staff-salaries"] });
  };
}

// ── Modal styling — same as Student Fee Details ─────────────────────────
const formLabelClass = "text-sm font-medium text-muted-foreground";
const formControlClass =
  "h-10 min-w-0 rounded-md border-input bg-background text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0";
const formSelectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-70";
const sectionTitleClass = "text-sm font-semibold text-primary";
const sectionCardClass = "rounded-md border bg-background p-4 space-y-4";
const cancelBtnClass =
  "h-10 w-full gap-2 border-primary text-primary hover:bg-primary/5 hover:text-primary sm:w-auto";
const primaryBtnClass = "h-10 w-full gap-2 sm:w-auto";

function dialogShellClass(width: string) {
  return cn(
    "flex w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:w-full sm:p-0 max-h-[94dvh]",
    "[&>button]:right-5 [&>button]:top-5 [&>button]:text-primary-foreground [&>button]:opacity-100 [&>button]:hover:text-primary-foreground",
    width,
  );
}

function FormField({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <Label className={formLabelClass}>{label}</Label>
      {children}
    </div>
  );
}

function ModalHeader({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <DialogHeader className="shrink-0 space-y-1 bg-primary px-6 py-4 pr-12 text-left text-primary-foreground">
      <DialogTitle className="flex items-center gap-3 text-xl font-semibold text-primary-foreground">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-foreground/15">
          <Icon className="h-5 w-5" />
        </span>
        {title}
      </DialogTitle>
      <DialogDescription className="pl-12 text-primary-foreground/80">{description}</DialogDescription>
    </DialogHeader>
  );
}

function ModalFooter({ children }: { children: ReactNode }) {
  return (
    <DialogFooter className="shrink-0 flex-col gap-2 border-t bg-background px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:space-x-0">
      {children}
    </DialogFooter>
  );
}

// ── Give / edit ─────────────────────────────────────────────────────────

type FormState = {
  staffId: string;
  type: StaffAdvanceType;
  amount: string;
  installmentAmount: string;
  givenDate: string;
  startMonth: string;
  startYear: string;
  paymentMethod: string;
  notes: string;
};

function emptyForm(staffId = ""): FormState {
  const now = new Date();
  return {
    staffId,
    type: "advance",
    amount: "",
    installmentAmount: "",
    givenDate: todayIso(),
    startMonth: String(now.getMonth() + 1),
    startYear: String(now.getFullYear()),
    paymentMethod: "cash",
    notes: "",
  };
}

function formFrom(a: AdvanceLike): FormState {
  return {
    staffId: staffOf(a)?._id || "",
    type: a.type,
    amount: String(a.amount),
    installmentAmount: String(a.installmentAmount || ""),
    givenDate: a.givenDate ? a.givenDate.slice(0, 10) : todayIso(),
    startMonth: String(a.startMonth),
    startYear: String(a.startYear),
    paymentMethod: a.paymentMethod || "cash",
    notes: a.notes || "",
  };
}

/** Give a new advance / loan (editing = null) or edit an existing one. */
export function AdvanceFormDialog({
  open,
  onOpenChange,
  editing,
  lockedStaffId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: AdvanceLike | null;
  /** Staff is fixed (staff profile) — hide the picker. */
  lockedStaffId?: string;
}) {
  const { toast } = useToast();
  const invalidate = useInvalidateAdvances();
  const [form, setForm] = useState<FormState>(() => emptyForm(lockedStaffId));

  useEffect(() => {
    if (open) setForm(editing ? formFrom(editing) : emptyForm(lockedStaffId));
  }, [open, editing, lockedStaffId]);

  const { data: staffList = [] } = useQuery({
    queryKey: ["users-module-list", "staff"],
    queryFn: fetchStaffUsers,
    enabled: open && !lockedStaffId && !editing,
  });
  const activeStaff = useMemo(
    () => staffList.filter((s) => s.isActive).sort((a, b) => a.name.localeCompare(b.name)),
    [staffList],
  );

  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 1, y, y + 1, y + 2];
  }, []);

  const saveMut = useMutation({
    mutationFn: () => {
      const common = {
        amount: Number(form.amount),
        installmentAmount: form.type === "loan" ? Number(form.installmentAmount) : undefined,
        givenDate: form.givenDate || undefined,
        startMonth: Number(form.startMonth),
        startYear: Number(form.startYear),
        paymentMethod: form.paymentMethod,
        notes: form.notes.trim(),
      };
      if (editing) {
        const patch = { ...common };
        if (editing.type !== "loan") delete patch.installmentAmount;
        return updateStaffAdvance(editing._id, patch);
      }
      return createStaffAdvance({ staffId: form.staffId, type: form.type, ...common });
    },
    onSuccess: () => {
      invalidate();
      toast({
        title: editing ? "Saved" : `${TYPE_LABEL[form.type]} recorded`,
        description: editing ? undefined : "It will be deducted from the staff member's pending salary vouchers.",
      });
      onOpenChange(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const formAmount = Number(form.amount) || 0;
  const formInstallment = Number(form.installmentAmount) || 0;
  const formValid =
    Boolean(lockedStaffId || editing || form.staffId) &&
    formAmount > 0 &&
    (form.type === "advance" || (formInstallment > 0 && formInstallment <= formAmount));
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogShellClass("sm:max-w-[36rem]")}>
        <ModalHeader
          icon={(editing ? editing.type : form.type) === "loan" ? Landmark : HandCoins}
          title={editing ? `Edit ${TYPE_LABEL[editing.type].toLowerCase()}` : "Give advance / loan"}
          description={
            editing
              ? "Change the amount, installment or start month. Pending salary vouchers update automatically."
              : "It will be deducted from the staff member's salary vouchers automatically."
          }
        />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/30 px-5 py-4">
          <div className="space-y-4">
            {!editing ? (
              <section className={sectionCardClass}>
                <p className={sectionTitleClass}>Type</p>
                <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
                  {(["advance", "loan"] as const).map((t) => {
                    const Icon = t === "loan" ? Landmark : HandCoins;
                    const on = form.type === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => set({ type: t })}
                        className={cn(
                          "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                          on
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-primary/30 bg-background text-primary hover:bg-primary/5",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                            on ? "bg-primary-foreground/15 text-primary-foreground" : "bg-primary/10 text-primary",
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">{TYPE_LABEL[t]}</span>
                          <span
                            className={cn(
                              "block text-xs leading-snug",
                              on ? "text-primary-foreground/80" : "text-muted-foreground",
                            )}
                          >
                            {t === "advance"
                              ? "Taken back in full from the next salary"
                              : "Taken back in monthly installments"}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <section className={sectionCardClass}>
              <p className={sectionTitleClass}>Details</p>
              <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2">
                {!lockedStaffId && !editing ? (
                  <FormField label="Staff member" className="min-[480px]:col-span-2">
                    <select
                      className={formSelectClass}
                      value={form.staffId}
                      onChange={(e) => set({ staffId: e.target.value })}
                    >
                      <option value="">Select staff…</option>
                      {activeStaff.map((s) => (
                        <option key={s._id} value={s._id}>
                          {s.name}
                          {s.designation ? ` (${s.designation})` : ""}
                        </option>
                      ))}
                    </select>
                  </FormField>
                ) : null}
                <FormField label="Amount (Rs)">
                  <Input
                    className={formControlClass}
                    type="number"
                    min={1}
                    step="1"
                    value={form.amount}
                    onChange={(e) => set({ amount: e.target.value })}
                    placeholder="e.g. 20000"
                  />
                  {editing && editing.recoveredAmount > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Already recovered: {formatRs(editing.recoveredAmount)}
                    </p>
                  ) : null}
                </FormField>
                {form.type === "loan" ? (
                  <FormField label="Monthly installment (Rs)">
                    <Input
                      className={formControlClass}
                      type="number"
                      min={1}
                      step="1"
                      value={form.installmentAmount}
                      onChange={(e) => set({ installmentAmount: e.target.value })}
                      placeholder="e.g. 5000"
                    />
                    {formAmount > 0 && formInstallment > 0 ? (
                      <p
                        className={cn(
                          "text-xs",
                          formInstallment > formAmount ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {formInstallment > formAmount
                          ? "Installment is more than the loan"
                          : `About ${monthsToRecover(formAmount - (editing?.recoveredAmount || 0), formInstallment)} month(s)`}
                      </p>
                    ) : null}
                  </FormField>
                ) : null}
                <FormField label="Given on" className={form.type === "loan" ? "min-[480px]:col-span-2" : undefined}>
                  <Input
                    className={formControlClass}
                    type="date"
                    value={form.givenDate}
                    onChange={(e) => set({ givenDate: e.target.value })}
                  />
                </FormField>
              </div>
            </section>

            <section className={sectionCardClass}>
              <p className={sectionTitleClass}>Recovery & payment</p>
              <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2">
                <FormField label="Deduct from month">
                  <select
                    className={formSelectClass}
                    value={form.startMonth}
                    onChange={(e) => set({ startMonth: e.target.value })}
                  >
                    {MONTH_NAMES.map((m, i) => (
                      <option key={m} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Year">
                  <select
                    className={formSelectClass}
                    value={form.startYear}
                    onChange={(e) => set({ startYear: e.target.value })}
                  >
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Paid out by" className="min-[480px]:col-span-2">
                  <select
                    className={formSelectClass}
                    value={form.paymentMethod}
                    onChange={(e) => set({ paymentMethod: e.target.value })}
                  >
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="online">Online</option>
                    <option value="other">Other</option>
                  </select>
                </FormField>
                <FormField label="Notes (optional)" className="min-[480px]:col-span-2">
                  <Textarea
                    className={cn(formControlClass, "h-auto min-h-[4.5rem] py-2")}
                    rows={2}
                    value={form.notes}
                    onChange={(e) => set({ notes: e.target.value })}
                    placeholder="Reason, approved by…"
                  />
                </FormField>
              </div>
            </section>
          </div>
        </div>
        <ModalFooter>
          <Button type="button" variant="outline" className={cancelBtnClass} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className={primaryBtnClass}
            disabled={!formValid || saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            {editing ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {saveMut.isPending ? "Saving…" : editing ? "Save changes" : `Give ${TYPE_LABEL[form.type].toLowerCase()}`}
          </Button>
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Receive payment ─────────────────────────────────────────────────────

/** Staff pays money back directly (outside salary). */
export function RepayAdvanceDialog({ advance, onClose }: { advance: AdvanceLike | null; onClose: () => void }) {
  const { toast } = useToast();
  const invalidate = useInvalidateAdvances();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());

  useEffect(() => {
    if (advance) {
      setAmount(String(advance.remainingAmount));
      setDate(todayIso());
    }
  }, [advance]);

  const repayMut = useMutation({
    mutationFn: () => repayStaffAdvance(advance!._id, { amount: Number(amount), paidAt: date || undefined }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Payment received", description: `${formatRs(Number(amount))} recorded.` });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const remaining = advance?.remainingAmount || 0;
  const value = Number(amount);

  return (
    <Dialog open={Boolean(advance)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={dialogShellClass("sm:max-w-[28rem]")}>
        <ModalHeader
          icon={Banknote}
          title="Receive payment"
          description="Record money the staff member paid back directly, outside salary."
        />
        {advance ? (
          <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30 px-5 py-4">
            <div className={sectionCardClass}>
              <div className="flex items-center justify-between gap-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm">
                <span className="min-w-0 truncate font-medium text-primary">
                  {staffOf(advance)?.name ? `${staffOf(advance)?.name} · ` : ""}
                  {TYPE_LABEL[advance.type]}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-xs text-muted-foreground">Still owed</span>
                  <span className="font-bold text-primary">{formatRs(remaining)}</span>
                </span>
              </div>
              <FormField label="Amount received (Rs)">
                <Input
                  className={formControlClass}
                  type="number"
                  min={1}
                  max={remaining}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                {value > remaining ? (
                  <p className="text-xs text-destructive">More than the amount still owed</p>
                ) : null}
              </FormField>
              <FormField label="Date">
                <Input className={formControlClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </FormField>
            </div>
          </div>
        ) : null}
        <ModalFooter>
          <Button type="button" variant="outline" className={cancelBtnClass} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            className={primaryBtnClass}
            disabled={repayMut.isPending || !(value > 0) || value > remaining}
            onClick={() => repayMut.mutate()}
          >
            <Check className="h-4 w-4" />
            {repayMut.isPending ? "Saving…" : "Receive payment"}
          </Button>
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Cancel ──────────────────────────────────────────────────────────────

export function CancelAdvanceDialog({
  advance,
  onClose,
  onCancelled,
}: {
  advance: AdvanceLike | null;
  onClose: () => void;
  onCancelled?: () => void;
}) {
  const { toast } = useToast();
  const invalidate = useInvalidateAdvances();
  const cancelMut = useMutation({
    mutationFn: () => cancelStaffAdvance(advance!._id),
    onSuccess: () => {
      invalidate();
      toast({ title: "Cancelled" });
      onClose();
      onCancelled?.();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={Boolean(advance)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={dialogShellClass("sm:max-w-[28rem]")}>
        <ModalHeader
          icon={Ban}
          title={`Cancel this ${advance ? TYPE_LABEL[advance.type].toLowerCase() : ""}?`}
          description="Use this only if it was entered by mistake."
        />
        <div className="bg-muted/30 px-5 py-4 text-sm text-muted-foreground">
          {formatRs(advance?.amount)} will no longer be deducted from salary.
        </div>
        <ModalFooter>
          <Button type="button" variant="outline" className={cancelBtnClass} onClick={onClose}>
            Keep it
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="h-10 w-full gap-2 sm:w-auto"
            disabled={cancelMut.isPending}
            onClick={() => cancelMut.mutate()}
          >
            Yes, cancel
          </Button>
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}
