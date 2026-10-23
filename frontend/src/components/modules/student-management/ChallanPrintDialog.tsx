import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchAdditionalCharges,
  fetchStudentFeeHistory,
  type AdditionalCharge,
  type FeeReceiptSize,
} from "@/lib/studentManagementApi";
import {
  applicableChargesForFees,
  chargeIdsOnFee,
  feeAmountWithCharges,
  feePreviewLines,
} from "@/lib/additionalCharges";
import { AdditionalChargesChecklist } from "./AdditionalChargesChecklist";
import { formatPkr, MONTH_NAMES } from "./studentDisplayUtils";

export type ChallanPrintRequest = {
  studentId: string;
  size: FeeReceiptSize;
  months?: number;
};

/** Stable empty list — `data = []` in useQuery creates a new [] every render and loops effects. */
const EMPTY_CHARGES: AdditionalCharge[] = [];

function periodLabel(fee: { feeType: string; month?: number; year?: number }) {
  if (fee.feeType === "admission") return "Admission";
  return `${MONTH_NAMES[(Number(fee.month) || 1) - 1]} ${fee.year || ""}`.trim();
}

function sameIdList(a: string[], b: string[]) {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

export function ChallanPrintDialog({
  request,
  onClose,
  onConfirm,
  confirming,
}: {
  request: ChallanPrintRequest | null;
  onClose: () => void;
  onConfirm: (chargeIds: string[]) => void;
  confirming?: boolean;
}) {
  const [selectedChargeIds, setSelectedChargeIds] = useState<string[]>([]);

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ["academy-fee-history", request?.studentId, "challan-charges"],
    queryFn: () => fetchStudentFeeHistory(request!.studentId),
    enabled: Boolean(request?.studentId),
  });

  const { data: chargesData, isLoading: chargesLoading } = useQuery({
    queryKey: ["additional-charges"],
    queryFn: fetchAdditionalCharges,
    enabled: Boolean(request),
  });
  const allCharges = chargesData ?? EMPTY_CHARGES;

  const unpaid = useMemo(
    () =>
      (history?.records || []).filter(
        (r) =>
          (r.status === "pending" || r.status === "overdue") &&
          (r.feeType === "monthly" || r.feeType === "admission" || r.feeType === "stationery")
      ),
    [history]
  );

  const chargeableFees = useMemo(
    () => unpaid.filter((f) => f.feeType === "monthly" || f.feeType === "admission"),
    [unpaid]
  );

  const applicable = useMemo(
    () => applicableChargesForFees(allCharges, history?.student, chargeableFees),
    [allCharges, history?.student, chargeableFees]
  );

  useEffect(() => {
    if (!request?.studentId || !history) {
      setSelectedChargeIds((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    // Only pre-check charges already baked on the voucher — do not rewrite from student defaults.
    const fromFees = chargeableFees.flatMap((fee) => chargeIdsOnFee(fee));
    const applicableIds = new Set(applicable.map((c) => c._id));
    const next = [...new Set(fromFees)].filter((id) => applicableIds.has(id));
    setSelectedChargeIds((prev) => (sameIdList(prev, next) ? prev : next));
  }, [request?.studentId, history, chargeableFees, applicable]);

  const totalPreview = useMemo(() => {
    let total = 0;
    for (const fee of unpaid) {
      if (fee.feeType === "stationery") {
        total += Number(fee.amount) || 0;
        continue;
      }
      total += feeAmountWithCharges(fee, history?.student, allCharges, selectedChargeIds);
    }
    return Math.round(total * 100) / 100;
  }, [unpaid, allCharges, selectedChargeIds, history?.student]);

  return (
    <Dialog open={Boolean(request)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Print fee challan</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Select additional charges to include. Stationery already on the challan stays active with
            any other selected charges.
          </p>
          <div className="rounded-md border">
            <div className="px-3 py-2 border-b text-xs font-medium text-muted-foreground">
              Additional charges
            </div>
            {historyLoading || chargesLoading ? (
              <p className="px-3 py-4 text-muted-foreground">Loading…</p>
            ) : (
              <AdditionalChargesChecklist
                charges={applicable}
                selectedIds={selectedChargeIds}
                onChange={setSelectedChargeIds}
              />
            )}
          </div>

          <div className="rounded-md border">
            <div className="px-3 py-2 border-b text-xs font-medium text-muted-foreground">
              Challan breakdown
            </div>
            {historyLoading ? (
              <p className="px-3 py-4 text-muted-foreground">Loading…</p>
            ) : unpaid.length === 0 ? (
              <p className="px-3 py-4 text-muted-foreground">No unpaid fees to print.</p>
            ) : (
              <ul className="max-h-56 overflow-y-auto divide-y">
                {unpaid.map((fee) => {
                  const lines =
                    fee.feeType === "stationery"
                      ? [
                          {
                            key: "stationery",
                            name: "Stationery",
                            amount: Number(fee.amount) || 0,
                            kind: "charge" as const,
                          },
                        ]
                      : feePreviewLines(fee, history?.student, allCharges, selectedChargeIds);
                  const feeTotal =
                    fee.feeType === "stationery"
                      ? Number(fee.amount) || 0
                      : feeAmountWithCharges(
                          fee,
                          history?.student,
                          allCharges,
                          selectedChargeIds
                        );
                  return (
                    <li key={fee._id} className="px-3 py-2">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-medium">{periodLabel(fee)}</span>
                        <span className="font-semibold tabular-nums">{formatPkr(feeTotal)}</span>
                      </div>
                      <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                        {lines.map((line) => (
                          <li key={line.key} className="flex items-baseline justify-between gap-3">
                            <span
                              className={
                                line.kind === "tuition" || line.kind === "admission"
                                  ? "text-foreground/80"
                                  : undefined
                              }
                            >
                              {line.name}
                            </span>
                            <span className="tabular-nums font-medium text-foreground/90">
                              {formatPkr(line.amount)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex items-center justify-between px-3 py-2 border-t bg-muted/30">
              <span className="text-muted-foreground">
                {unpaid.length} unpaid item{unpaid.length === 1 ? "" : "s"}
              </span>
              <span className="font-semibold">{formatPkr(totalPreview)}</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={confirming}>
            Cancel
          </Button>
          <Button
            variant="hero"
            disabled={confirming || historyLoading}
            onClick={() => onConfirm(selectedChargeIds)}
          >
            {confirming ? "Printing…" : "Print challan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
