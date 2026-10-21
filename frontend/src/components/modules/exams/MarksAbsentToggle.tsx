import { cn } from "@/lib/utils";

/** Present / Absent segment — outline style aligned with Award list buttons. */
export default function MarksAbsentToggle({
  absent,
  onChange,
  disabled,
  size = "default",
}: {
  absent: boolean;
  onChange: (absent: boolean) => void;
  disabled?: boolean;
  size?: "default" | "sm";
}) {
  const sm = size === "sm";
  return (
    <div
      role="group"
      aria-label="Attendance"
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border border-slate-200 bg-slate-50/80 p-0.5",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <button
        type="button"
        disabled={disabled}
        aria-pressed={!absent}
        title="Present"
        onClick={() => onChange(false)}
        className={cn(
          "rounded-[5px] font-medium tracking-tight transition-all",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a2b4b]/20",
          sm ? "h-7 min-w-[1.85rem] px-2 text-[11px]" : "h-8 min-w-[4.5rem] px-3 text-xs",
          !absent
            ? "bg-white text-[#1a2b4b] shadow-sm ring-1 ring-slate-200/80"
            : "bg-transparent text-slate-500 hover:text-[#1a2b4b]",
        )}
      >
        {sm ? "P" : "Present"}
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={absent}
        title="Absent"
        onClick={() => onChange(true)}
        className={cn(
          "rounded-[5px] font-medium tracking-tight transition-all",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/20",
          sm ? "h-7 min-w-[1.85rem] px-2 text-[11px]" : "h-8 min-w-[4.5rem] px-3 text-xs",
          absent
            ? "bg-white text-[#b91c1c] shadow-sm ring-1 ring-red-200"
            : "bg-transparent text-slate-500 hover:text-[#1a2b4b]",
        )}
      >
        {sm ? "A" : "Absent"}
      </button>
    </div>
  );
}

/** Compact badge for lists / results tables. */
export function AbsentBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-red-200 bg-red-50 px-2 py-0.5",
        "text-[11px] font-semibold uppercase tracking-wide text-[#b91c1c]",
        className,
      )}
    >
      Absent
    </span>
  );
}
