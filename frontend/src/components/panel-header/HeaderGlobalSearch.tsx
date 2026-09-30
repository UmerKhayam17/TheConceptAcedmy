import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export default function HeaderGlobalSearch({
  value,
  onChange,
  placeholder = "Search anything...",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative w-[155px] shrink-0 sm:w-[165px]", className)}>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
        aria-hidden
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(
          "h-10 w-full rounded-lg border-[#DCE4EF] bg-white pl-8 pr-3 text-xs text-[#10244A]",
          "placeholder:text-slate-400",
          "transition-all duration-150 ease-out",
          "focus-visible:border-[#1769E0] focus-visible:ring-2 focus-visible:ring-[#1769E0]/25 focus-visible:ring-offset-0",
        )}
      />
    </div>
  );
}
