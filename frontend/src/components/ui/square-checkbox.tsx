import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/** Explicit square checkbox (same control as student registration list). */
export function SquareCheckbox({
  checked,
  indeterminate = false,
  onChange,
  "aria-label": ariaLabel,
  className,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  "aria-label": string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={ariaLabel}
      onClick={onChange}
      className={cn(
        "inline-flex h-4 w-4 min-h-4 min-w-4 shrink-0 items-center justify-center rounded-[3px] border border-slate-300 bg-white p-0 transition-colors",
        "hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        (checked || indeterminate) && "border-primary bg-primary text-primary-foreground",
        className,
      )}
    >
      {indeterminate ? (
        <Minus className="h-3 w-3" strokeWidth={3} />
      ) : checked ? (
        <Check className="h-3 w-3" strokeWidth={3} />
      ) : null}
    </button>
  );
}
