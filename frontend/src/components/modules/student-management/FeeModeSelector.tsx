import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type FeeMode = "normal" | "waiver";

/** Student (or fee profile) has nothing left to pay after discounts. */
export function isFullFeeWaiver(student: {
  monthlyFee?: number;
  admissionFee?: number;
  monthlyFeeDiscount?: number;
  admissionFeeDiscount?: number;
}): boolean {
  const monthly = Math.max(0, Number(student.monthlyFee) || 0);
  const admission = Math.max(0, Number(student.admissionFee) || 0);
  const monthlyDisc = Math.max(0, Number(student.monthlyFeeDiscount) || 0);
  const admissionDisc = Math.max(0, Number(student.admissionFeeDiscount) || 0);
  const monthlyDue = Math.max(0, monthly - Math.min(monthlyDisc, monthly));
  const admissionDue = Math.max(0, admission - Math.min(admissionDisc, admission));
  return monthlyDue === 0 && admissionDue === 0 && (monthly > 0 || admission > 0);
}

/** Fee row is a settled free/waiver challan, or the student is on full waiver. */
export function isFreeFeeStudent(
  record: { amount?: number; status?: string; notes?: string },
  student?: {
    monthlyFee?: number;
    admissionFee?: number;
    monthlyFeeDiscount?: number;
    admissionFeeDiscount?: number;
  } | null,
): boolean {
  const amount = Number(record.amount) || 0;
  if (amount === 0 && (record.status === "paid" || record.status === "waived")) return true;
  if (student && isFullFeeWaiver(student)) return true;
  return /full fee waiver|free student/i.test(String(record.notes || ""));
}

export function FeeModeSelector({
  value,
  onChange,
  disabled,
  className,
}: {
  value: FeeMode;
  onChange: (mode: FeeMode) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2.5", className)}>
      <div>
        <p className="text-sm font-medium text-foreground">Fee arrangement</p>
        <p className="text-xs text-muted-foreground">Select how this student’s fees are billed</p>
      </div>

      <div
        role="group"
        aria-label="Fee arrangement"
        className="grid grid-cols-1 gap-2 sm:grid-cols-2"
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange("normal")}
          className={cn(
            "group relative rounded-md border px-4 py-3.5 text-left transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            value === "normal"
              ? "border-foreground/25 bg-foreground/[0.04] shadow-sm"
              : "border-border bg-background hover:border-foreground/20 hover:bg-muted/40",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          <span className="flex items-start justify-between gap-3">
            <span>
              <span className="block text-sm font-semibold tracking-tight text-foreground">
                Normal fees
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                Standard billing with optional partial discount
              </span>
            </span>
            <span
              className={cn(
                "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                value === "normal"
                  ? "border-foreground bg-foreground text-background"
                  : "border-muted-foreground/40 bg-transparent",
              )}
              aria-hidden
            >
              {value === "normal" ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : null}
            </span>
          </span>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange("waiver")}
          className={cn(
            "group relative rounded-md border px-4 py-3.5 text-left transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            value === "waiver"
              ? "border-foreground/25 bg-foreground/[0.04] shadow-sm"
              : "border-border bg-background hover:border-foreground/20 hover:bg-muted/40",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          <span className="flex items-start justify-between gap-3">
            <span>
              <span className="block text-sm font-semibold tracking-tight text-foreground">
                Full waiver
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                No fees due — recorded as paid at ₨ 0 each month
              </span>
            </span>
            <span
              className={cn(
                "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                value === "waiver"
                  ? "border-foreground bg-foreground text-background"
                  : "border-muted-foreground/40 bg-transparent",
              )}
              aria-hidden
            >
              {value === "waiver" ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : null}
            </span>
          </span>
        </button>
      </div>

      {value === "waiver" && (
        <p className="text-xs text-muted-foreground">
          Full waiver selected. Monthly challans will be auto-settled as Paid at ₨ 0.
        </p>
      )}
    </div>
  );
}

export function FreeStudentBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5",
        "text-[11px] font-medium uppercase tracking-wide text-muted-foreground",
        className,
      )}
    >
      Free
    </span>
  );
}
