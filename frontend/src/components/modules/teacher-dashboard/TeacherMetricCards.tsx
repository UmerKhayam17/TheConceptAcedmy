import { Link } from "react-router-dom";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type MetricTone = "blue" | "green" | "purple" | "orange";

const TONE: Record<
  MetricTone,
  {
    iconBg: string;
    icon: string;
    hint: string;
    deco: string;
    link: string;
  }
> = {
  blue: {
    iconBg: "bg-[#DBEAFE]",
    icon: "text-[#3B82F6]",
    hint: "text-[#60A5FA]",
    deco: "text-[#93C5FD]/35",
    link: "text-[#3B82F6]",
  },
  green: {
    iconBg: "bg-[#D1FAE5]",
    icon: "text-[#10B981]",
    hint: "text-[#34D399]",
    deco: "text-[#6EE7B7]/40",
    link: "text-[#3B82F6]",
  },
  purple: {
    iconBg: "bg-[#EDE9FE]",
    icon: "text-[#8B5CF6]",
    hint: "text-[#A78BFA]",
    deco: "text-[#C4B5FD]/40",
    link: "text-[#3B82F6]",
  },
  orange: {
    iconBg: "bg-[#FFEDD5]",
    icon: "text-[#F59E0B]",
    hint: "text-[#FBBF24]",
    deco: "text-[#FDBA74]/45",
    link: "text-[#F59E0B]",
  },
};

export type TeacherMetric = {
  id: string;
  label: string;
  value: string | number;
  hint: string;
  linkLabel: string;
  href: string;
  tone: MetricTone;
  icon: LucideIcon;
};

export function TeacherMetricCards({ metrics }: { metrics: TeacherMetric[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 w-full">
      {metrics.map((m) => (
        <MetricCard key={m.id} metric={m} />
      ))}
    </div>
  );
}

function MetricCard({ metric }: { metric: TeacherMetric }) {
  const tone = TONE[metric.tone];
  const Icon = metric.icon;

  return (
    <Card className="relative overflow-hidden rounded-xl border border-[#E5E7EB] bg-white p-3.5 sm:p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] h-full">
      <Icon
        className={cn(
          "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-14 w-14 stroke-[1.25]",
          tone.deco,
        )}
        aria-hidden
      />

      <div className="relative flex h-full flex-col">
        <div className={cn("h-8 w-8 rounded-full grid place-items-center shrink-0", tone.iconBg)}>
          <Icon className={cn("h-3.5 w-3.5", tone.icon)} strokeWidth={2.25} aria-hidden />
        </div>

        <div className="mt-2.5 pr-12">
          <p className="text-[12px] font-semibold text-[#334155] leading-none">{metric.label}</p>
          <p className="mt-1.5 text-[1.55rem] font-bold tabular-nums leading-none tracking-tight text-[#0F172A]">
            {metric.value}
          </p>
          <p className={cn("mt-1.5 text-[11px] font-medium leading-none", tone.hint)}>{metric.hint}</p>
        </div>

        <div className="mt-auto pt-2.5 flex justify-end">
          <Link
            to={metric.href}
            className={cn(
              "inline-flex items-center gap-1 text-[11px] font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/35 rounded-sm group/link",
              tone.link,
            )}
          >
            <span>{metric.linkLabel}</span>
            <ArrowRight
              className="h-3 w-3 shrink-0 transition-transform group-hover/link:translate-x-0.5"
              strokeWidth={2.25}
              aria-hidden
            />
          </Link>
        </div>
      </div>
    </Card>
  );
}
