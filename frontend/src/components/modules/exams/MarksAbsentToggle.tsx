import { cn } from "@/lib/utils";

/** Compact P / A attendance toggle — green Present, red Absent when selected. */
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
  const box = sm ? "h-7 w-7 text-[11px]" : "h-8 w-8 text-xs";

  return (
    <div
      role="group"
      aria-label="Attendance"
      className={cn(
        "inline-flex shrink-0 items-center gap-1",
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
          box,
          "inline-flex items-center justify-center rounded-lg font-bold leading-none transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
          !absent
            ? "bg-primary text-primary-foreground shadow-sm"
            : "bg-slate-100 text-slate-500 hover:bg-slate-200/80 hover:text-slate-700",
        )}
      >
        P
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={absent}
        title="Absent"
        onClick={() => onChange(true)}
        className={cn(
          box,
          "inline-flex items-center justify-center rounded-lg font-bold leading-none transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30",
          absent
            ? "bg-destructive text-destructive-foreground shadow-sm"
            : "bg-slate-100 text-slate-500 hover:bg-slate-200/80 hover:text-slate-700",
        )}
      >
        A
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
