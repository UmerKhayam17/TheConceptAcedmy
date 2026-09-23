import { ChevronDown, Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { DefaulterReportFormat } from "@/lib/studentManagementApi";

const itemClass =
  "cursor-pointer gap-3 rounded-md px-2 py-2 focus:bg-muted focus:text-foreground";

export function DefaulterListDownload({
  exporting,
  onDownload,
  className,
}: {
  exporting: DefaulterReportFormat | null;
  onDownload: (format: DefaulterReportFormat) => void;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className={cn("h-9 gap-2 bg-background shadow-sm", className)}
          disabled={Boolean(exporting)}
        >
          <Download className="h-4 w-4" />
          {exporting ? "Downloading…" : "Download defaulter list"}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 p-1.5 shadow-lg">
        <DropdownMenuLabel className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Export format
        </DropdownMenuLabel>
        <DropdownMenuItem className={itemClass} onClick={() => onDownload("xlsx")}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
            <FileSpreadsheet className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium leading-tight">Excel</span>
            <span className="block text-xs text-muted-foreground">Spreadsheet (.xlsx)</span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem className={itemClass} onClick={() => onDownload("pdf")}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
            <FileText className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium leading-tight">PDF</span>
            <span className="block text-xs text-muted-foreground">Printable report</span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
