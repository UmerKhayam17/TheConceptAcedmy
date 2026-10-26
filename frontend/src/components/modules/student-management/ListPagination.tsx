import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import PageSizeSelect from "./PageSizeSelect";

function pageWindow(current: number, totalPages: number, max: number): number[] {
  const pages = Math.max(1, totalPages);
  const size = Math.min(max, pages);
  const half = Math.floor(size / 2);
  let start = Math.max(1, current - half);
  let end = start + size - 1;
  if (end > pages) {
    end = pages;
    start = Math.max(1, end - size + 1);
  }
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function PageButtons({
  page,
  totalPages,
  onPageChange,
  max,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  max: number;
}) {
  const numbers = pageWindow(page, totalPages, max);
  return (
    <nav className="flex items-center justify-center gap-1" aria-label="Pagination">
      <Button
        type="button"
        variant="outline"
        className="h-9 w-9 shrink-0 rounded-lg p-0"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      {numbers.map((n) => (
        <Button
          key={n}
          type="button"
          variant={n === page ? "default" : "outline"}
          className={cn(
            "h-9 min-w-9 rounded-lg px-2 text-sm font-semibold tabular-nums",
            n === page && "shadow-sm",
          )}
          onClick={() => onPageChange(n)}
          aria-label={`Page ${n}`}
          aria-current={n === page ? "page" : undefined}
        >
          {n}
        </Button>
      ))}
      <Button
        type="button"
        variant="outline"
        className="h-9 w-9 shrink-0 rounded-lg p-0"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        aria-label="Next page"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </nav>
  );
}

export default function ListPagination({
  page,
  totalPages,
  total,
  from,
  to,
  pageSize,
  onPageSizeChange,
  onPageChange,
  noun,
  attached = true,
  className,
}: {
  page: number;
  totalPages: number;
  total: number;
  from?: number;
  to?: number;
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  onPageChange: (page: number) => void;
  /** Word after the count, e.g. "students". */
  noun?: string;
  /** Sits on the bottom edge of a table card. */
  attached?: boolean;
  className?: string;
}) {
  const safePages = Math.max(1, totalPages || 1);
  const safePage = Math.min(Math.max(1, page || 1), safePages);
  const rangeFrom =
    from ?? (total === 0 || !pageSize ? 0 : (safePage - 1) * pageSize + 1);
  const rangeTo = to ?? (pageSize ? Math.min(safePage * pageSize, total) : total);

  return (
    <div
      className={cn(
        "flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-3.5",
        attached ? "border-t bg-muted/10" : "rounded-xl border bg-card shadow-sm",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
        <p className="min-w-0 text-[13px] leading-5 text-muted-foreground sm:text-sm">
          Showing{" "}
          <span className="font-semibold tabular-nums text-foreground">{rangeFrom.toLocaleString()}</span>
          {" to "}
          <span className="font-semibold tabular-nums text-foreground">{rangeTo.toLocaleString()}</span>
          {" of "}
          <span className="font-semibold tabular-nums text-foreground">{total.toLocaleString()}</span>
          {noun ? ` ${noun}` : ""}
        </p>
        {onPageSizeChange && pageSize != null ? (
          <PageSizeSelect value={pageSize} onChange={onPageSizeChange} />
        ) : null}
      </div>

      {safePages > 1 ? (
        <div className="min-w-0">
          <div className="sm:hidden">
            <PageButtons page={safePage} totalPages={safePages} onPageChange={onPageChange} max={3} />
            <p className="mt-1.5 text-center text-[11px] font-medium tabular-nums text-muted-foreground">
              Page {safePage} of {safePages}
            </p>
          </div>
          <div className="hidden sm:block">
            <PageButtons page={safePage} totalPages={safePages} onPageChange={onPageChange} max={5} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
