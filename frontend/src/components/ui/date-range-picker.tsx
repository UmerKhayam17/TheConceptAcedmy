import { useEffect, useState } from "react";
import { format, isValid, parseISO } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { localDateYmd } from "@/lib/localDate";
import { cn } from "@/lib/utils";

function ymdToDate(ymd?: string): Date | undefined {
  if (!ymd) return undefined;
  const d = parseISO(ymd.slice(0, 10));
  return isValid(d) ? d : undefined;
}

function formatRangeLabel(from?: string, to?: string) {
  const fromDate = ymdToDate(from);
  const toDate = ymdToDate(to);
  if (!fromDate) return "Select date range";
  if (!toDate || from === to) return format(fromDate, "dd/MM/yyyy");
  return `${format(fromDate, "dd/MM/yyyy")} – ${format(toDate, "dd/MM/yyyy")}`;
}

type DateRangePickerFieldProps = {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  className?: string;
  disabled?: boolean;
};

/** One field: click → pick From & To on the calendar → filter updates. */
export function DateRangePickerField({
  from,
  to,
  onChange,
  className,
  disabled,
}: DateRangePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>({
    from: ymdToDate(from),
    to: ymdToDate(to),
  });

  useEffect(() => {
    if (!open) {
      setDraft({ from: ymdToDate(from), to: ymdToDate(to) });
    }
  }, [from, to, open]);

  const applyRange = (range?: DateRange) => {
    if (!range?.from) return;
    const nextFrom = localDateYmd(range.from);
    const nextTo = localDateYmd(range.to ?? range.from);
    onChange(nextFrom, nextTo);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next && draft?.from) {
          applyRange(draft);
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-10 min-w-[14rem] justify-start gap-2 px-3 font-normal shrink-0",
            !from && "text-muted-foreground",
            className,
          )}
          aria-label="Date range"
        >
          <CalendarIcon className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
          <span className="truncate tabular-nums">{formatRangeLabel(from, to)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          initialFocus
          mode="range"
          numberOfMonths={2}
          defaultMonth={ymdToDate(from) || new Date()}
          selected={draft}
          onSelect={(range) => {
            setDraft(range);
            if (range?.from && range?.to) {
              applyRange(range);
              setOpen(false);
            }
          }}
        />
        <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
          <p className="text-[11px] text-muted-foreground">
            {draft?.from && !draft?.to ? "Pick an end date" : "Click start, then end date"}
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8"
            disabled={!draft?.from}
            onClick={() => {
              applyRange(draft);
              setOpen(false);
            }}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
