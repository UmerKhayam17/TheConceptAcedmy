import { useState } from "react";
import { AlertTriangle, CheckCircle2, Receipt, Wallet } from "lucide-react";
import type { ModuleActionCaps, PermLevel } from "@/lib/permissions";
import AcademyFeesManagement from "@/components/modules/student-management/AcademyFeesManagement";
import FeeDefaultersTab from "@/components/modules/student-management/FeeDefaultersTab";
import FeePaidTab from "@/components/modules/student-management/FeePaidTab";
import { usePanelSession } from "@/components/panel-header/PanelSessionContext";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

type FeesView = "records" | "paid" | "defaulters";

const STAFF_TABS: {
  id: FeesView;
  label: string;
  icon: typeof Receipt;
}[] = [
  { id: "records", label: "Fee records", icon: Receipt },
  { id: "paid", label: "Paid", icon: CheckCircle2 },
  { id: "defaulters", label: "Defaulters", icon: AlertTriangle },
];

/** Panel Fee Management — live academy tuition fees from the API */
const FeesModule = ({ perm: _perm, caps }: { perm: PermLevel; caps: ModuleActionCaps }) => {
  const { user } = useAuth();
  const isParent = user?.role === "parent";
  const [view, setView] = useState<FeesView>("records");
  /** Student whose Collect Fee window should open on the Fee records tab. */
  const [collectStudentId, setCollectStudentId] = useState<string | null>(null);
  const { sessionId } = usePanelSession();

  const tabs = isParent ? STAFF_TABS.filter((t) => t.id === "records") : STAFF_TABS;

  return (
    <div className="min-h-full bg-slate-50 px-3 py-4 sm:px-6 sm:py-6 lg:px-8 space-y-4">
      <div className="sticky top-0 z-20 space-y-3 rounded-xl bg-slate-50/95 pb-1 backdrop-blur-sm">
        {/* Same compact theme header as Staff Salary / Subjects */}
        <div className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
                <Wallet className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight">
                  Fee Management
                </h2>
                <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500 max-w-md">
                  Collect tuition, review paid vouchers, and follow up on defaulters.
                </p>
              </div>
            </div>
            <div className="shrink-0 rounded-lg bg-primary/10 px-3 py-2 max-w-[14rem]">
              <p className="text-xs sm:text-sm italic leading-snug text-[#1a2b4b]/80">
                <span className="mr-1 text-primary not-italic font-serif text-base leading-none">
                  &ldquo;
                </span>
                Every fee collected builds tomorrow.
                <span className="ml-0.5 text-primary not-italic font-serif text-base leading-none">
                  &rdquo;
                </span>
              </p>
            </div>
          </div>
        </div>

        {tabs.length > 1 ? (
          <div
            role="tablist"
            aria-label="Fee views"
            className="grid w-full grid-cols-3 gap-2 rounded-xl bg-white p-2 shadow-sm ring-1 ring-black/[0.04]"
          >
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = view === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setView(tab.id)}
                  className={cn(
                    "flex h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "border border-primary/30 bg-background text-[#1a2b4b] hover:bg-primary/5",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={2.25} />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {view === "defaulters" && !isParent ? (
        <FeeDefaultersTab
          caps={caps}
          sessionId={sessionId}
          onCollectFee={(id) => {
            setCollectStudentId(id);
            setView("records");
          }}
        />
      ) : view === "paid" && !isParent ? (
        <FeePaidTab caps={caps} sessionId={sessionId} />
      ) : (
        <AcademyFeesManagement
          caps={caps}
          sessionId={isParent ? undefined : sessionId}
          collectStudentId={isParent ? null : collectStudentId}
          onCollectHandled={() => setCollectStudentId(null)}
        />
      )}
    </div>
  );
};

export default FeesModule;
