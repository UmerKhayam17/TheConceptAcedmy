import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

function formatHeaderDate(date = new Date()): string {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function HeaderDateDisplay({ className }: { className?: string }) {
  const label = formatHeaderDate();

  return (
    <div
      className={cn(
        "hidden items-center gap-1.5 text-[11px] font-medium text-slate-500 xl:flex",
        className,
      )}
      aria-label={`Today, ${label}`}
    >
      <CalendarDays className="h-[17px] w-[17px] shrink-0 text-[#10244A]" aria-hidden />
      <span className="whitespace-nowrap tabular-nums">{label}</span>
    </div>
  );
}
