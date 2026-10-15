import type { ComponentType } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Stat tile matching Student Management (Subjects / Registration). */
export default function PanelStatCard({
  label,
  value,
  hint,
  icon: Icon,
  iconWrapClass,
  iconClass,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: ComponentType<{ className?: string }>;
  iconWrapClass: string;
  iconClass: string;
}) {
  return (
    <Card className="rounded-2xl border-0 bg-white p-4 shadow-sm ring-1 ring-black/[0.04]">
      <div className="flex items-center gap-3.5">
        <span
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg",
            iconWrapClass
          )}
        >
          <Icon className={cn("h-5 w-5", iconClass)} />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-slate-500">{label}</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums tracking-tight text-[#1a2b4b]">
            {value}
          </p>
          {hint ? <p className="mt-0.5 text-xs font-medium text-slate-500">{hint}</p> : null}
        </div>
      </div>
    </Card>
  );
}
