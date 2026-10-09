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
  type FeeReceiptSize,
} from "@/lib/studentManagementApi";
import {
  applicableChargesForFees,
  chargeAppliesToStudent,
  baseFeeAmount,
} from "@/lib/additionalCharges";
import { AdditionalChargesChecklist } from "./AdditionalChargesChecklist";
import { formatPkr } from "./studentDisplayUtils";

export type ChallanPrintRequest = {
  studentId: string;
  size: FeeReceiptSize;
  months?: number;
};

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

  const { data: allCharges = [], isLoading: chargesLoading } = useQuery({
    queryKey: ["additional-charges"],
    queryFn: fetchAdditionalCharges,
    enabled: Boolean(request),
  });

  const unpaid = useMemo(
    () =>
      (history?.records || []).filter(
        (r) =>
          (r.status === "pending" || r.status === "overdue") &&
          (r.feeType === "monthly" || r.feeType === "admission")
      ),
    [history]
  );

  const applicable = useMemo(
    () => applicableChargesForFees(allCharges, history?.student, unpaid),
    [allCharges, history?.student, unpaid]
  );

  useEffect(() => {
    setSelectedChargeIds([]);
  }, [request?.studentId]);

  const totalPreview = useMemo(() => {
    let total = 0;
    for (const fee of unpaid) {
      total += baseFeeAmount(fee);
      for (const charge of applicable) {
        if (!selectedChargeIds.includes(charge._id)) continue;
        if (!chargeAppliesToStudent(charge, history?.student, fee.month)) continue;
        total += Number(charge.amount) || 0;
      }
    }
    return Math.round(total * 100) / 100;
  }, [unpaid, applicable, selectedChargeIds, history?.student]);

  return (
    <Dialog open={Boolean(request)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Print fee challan</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Additional charges are optional. Leave unchecked for tuition only.
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
            <div className="flex items-center justify-between px-3 py-2 border-t bg-muted/30">
              <span className="text-muted-foreground">
                {unpaid.length} unpaid month{unpaid.length === 1 ? "" : "s"}
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
