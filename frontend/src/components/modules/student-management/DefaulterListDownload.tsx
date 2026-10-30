import { ChevronDown, Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { ReportFileFormat } from "@/lib/reportDownload";

const itemClass =
  "cursor-pointer gap-3 rounded-md px-2 py-2 focus:bg-muted focus:text-foreground";

export type ReportExportKind = {
  id: string;
  label: string;
  /** Greys out this kind's Excel / PDF items (e.g. until required filters are chosen). */
  disabled?: boolean;
  /** Shown next to the label while disabled. */
  hint?: string;
};

/** Shared Print / Export menu (Excel + PDF preview) used across fee, salary, attendance, etc. */
export function DefaulterListDownload({
  exporting,
  onDownload,
  className,
  label = "Print / Export",
  variant = "outline",
  size = "sm",
  disabled = false,
  reportKinds,
}: {
  exporting: ReportFileFormat | null;
  onDownload: (format: ReportFileFormat, reportKind?: string) => void;
  className?: string;
  label?: string;
  variant?: "outline" | "default";
  size?: "sm" | "default";
  disabled?: boolean;
  /** When set, groups Excel/PDF under each report kind (e.g. Student List / Contact List). */
  reportKinds?: ReportExportKind[];
}) {
  const isPrimary = variant === "default";
  const busy = Boolean(exporting);
  const kinds = reportKinds?.length ? reportKinds : null;

  const formatItems = (reportKind?: string, itemsDisabled = false) => (
    <>
      <DropdownMenuItem
        className={itemClass}
        disabled={itemsDisabled}
        onClick={() => onDownload("xlsx", reportKind)}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
          <FileSpreadsheet className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium leading-tight">Excel</span>
          <span className="block text-xs text-muted-foreground">Spreadsheet (.xlsx)</span>
        </span>
      </DropdownMenuItem>
      <DropdownMenuItem
        className={itemClass}
        disabled={itemsDisabled}
        onClick={() => onDownload("pdf", reportKind)}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
          <FileText className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium leading-tight">PDF</span>
          <span className="block text-xs text-muted-foreground">
            Preview, then print or download
          </span>
        </span>
      </DropdownMenuItem>
    </>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size={size}
          variant={variant}
          className={cn(
            "inline-flex items-center gap-2 whitespace-nowrap px-3 text-sm font-medium shadow-sm",
            size === "sm" ? "h-9" : "h-10",
            !isPrimary &&
              "border-border bg-background text-foreground hover:bg-muted hover:text-foreground",
            isPrimary &&
              "border-0 bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
            className,
          )}
          disabled={busy || disabled}
        >
          <Download className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
          <span className="truncate">{busy ? "Preparing…" : label}</span>
          <span
            className={cn(
              "ml-0.5 h-4 w-px shrink-0",
              isPrimary ? "bg-primary-foreground/25" : "bg-border",
            )}
            aria-hidden
          />
          <ChevronDown
            className={cn("h-3.5 w-3.5 shrink-0", isPrimary ? "opacity-80" : "opacity-60")}
            aria-hidden
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={cn("p-1.5 shadow-lg", kinds ? "w-64" : "w-60")}
      >
        {kinds ? (
          kinds.map((kind, index) => (
            <div key={kind.id}>
              {index > 0 ? <DropdownMenuSeparator className="my-1.5" /> : null}
              <DropdownMenuLabel className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {kind.label}
                {kind.disabled && kind.hint ? (
                  <span className="ml-1 normal-case tracking-normal text-muted-foreground/80">
                    · {kind.hint}
                  </span>
                ) : null}
              </DropdownMenuLabel>
              {formatItems(kind.id, kind.disabled)}
            </div>
          ))
        ) : (
          <>
            <DropdownMenuLabel className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Export format
            </DropdownMenuLabel>
            {formatItems()}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Alias for clarity in non-fee panels. */
export const ReportExportMenu = DefaulterListDownload;
