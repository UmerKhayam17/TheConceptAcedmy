import { useState } from "react";
import type { ModuleActionCaps, PermLevel } from "@/lib/permissions";
import AcademyFeesManagement from "@/components/modules/student-management/AcademyFeesManagement";
import FeeDefaultersTab from "@/components/modules/student-management/FeeDefaultersTab";
import FeePaidTab from "@/components/modules/student-management/FeePaidTab";
import { usePanelSession } from "@/components/panel-header/PanelSessionContext";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

type FeesView = "records" | "paid" | "defaulters";

/** Panel Fee Management — live academy tuition fees from the API */
const FeesModule = ({ perm: _perm, caps }: { perm: PermLevel; caps: ModuleActionCaps }) => {
  const { user } = useAuth();
  const isParent = user?.role === "parent";
  const [view, setView] = useState<FeesView>("records");
  const { sessionId } = usePanelSession();

  return (
    <div>
      <div className="px-3 sm:px-6 lg:px-8 py-4 space-y-4">
        <div className="flex w-full sm:w-fit gap-1 p-1 rounded-lg bg-muted/50">
          <button
            type="button"
            onClick={() => setView("records")}
            className={cn(
              "flex-1 sm:flex-none px-3 py-2 sm:py-1.5 text-sm font-medium rounded-md transition-colors",
              view === "records"
                ? "bg-background text-primary shadow-sm"
                : "text-muted-foreground hover:text-primary"
            )}
          >
            Fee records
          </button>
          {!isParent && (
            <button
              type="button"
              onClick={() => setView("paid")}
              className={cn(
                "flex-1 sm:flex-none px-3 py-2 sm:py-1.5 text-sm font-medium rounded-md transition-colors",
                view === "paid"
                  ? "bg-background text-primary shadow-sm"
                  : "text-muted-foreground hover:text-primary"
              )}
            >
              Paid
            </button>
          )}
          {!isParent && (
            <button
              type="button"
              onClick={() => setView("defaulters")}
              className={cn(
                "flex-1 sm:flex-none px-3 py-2 sm:py-1.5 text-sm font-medium rounded-md transition-colors",
                view === "defaulters"
                  ? "bg-background text-primary shadow-sm"
                  : "text-muted-foreground hover:text-primary"
              )}
            >
              Defaulters
            </button>
          )}
        </div>
        {view === "defaulters" && !isParent ? (
          <FeeDefaultersTab caps={caps} sessionId={sessionId} />
        ) : view === "paid" && !isParent ? (
          <FeePaidTab caps={caps} sessionId={sessionId} />
        ) : (
          <AcademyFeesManagement caps={caps} sessionId={isParent ? undefined : sessionId} />
        )}
      </div>
    </div>
  );
};

export default FeesModule;
