import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function PanelSearchBar({
  value,
  onChange,
  placeholder = "Search…",
  className,
  inputClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}) {
  return (
    <div
      className={cn(
        "relative w-full min-w-0 max-w-full sm:w-auto sm:max-w-md sm:flex-1",
        className,
        "max-sm:!w-full max-sm:!min-w-0 max-sm:!max-w-full",
      )}
    >
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        className={cn("pl-9 pr-9 h-10", inputClassName)}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={placeholder}
      />
      {value ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-0 top-0 h-10 w-10 text-muted-foreground"
          onClick={() => onChange("")}
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}
