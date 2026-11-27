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
    <AcademyFeesManagement
      caps={caps}
      sessionId={sessionId}
      lockedStatus="paid"
      showGenerate={false}
      showBulkActions={false}
    />
  );
}
