import { CheckCircle2 } from "lucide-react";
import type { ModuleActionCaps } from "@/lib/permissions";
import AcademyFeesManagement from "./AcademyFeesManagement";

export default function FeePaidTab({
  caps,
  sessionId = "",
}: {
  caps: ModuleActionCaps;
  sessionId?: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-bold text-primary flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          Paid fees
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Review paid vouchers, edit payment details, print receipts, and download the collection report.
        </p>
      </div>

      <AcademyFeesManagement
        caps={caps}
        sessionId={sessionId}
        lockedStatus="paid"
        showGenerate={false}
        showBulkActions={false}
      />
    </div>
  );
}
