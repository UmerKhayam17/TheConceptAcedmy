import { useState } from "react";
import { format, isValid, parseISO } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
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

type SingleDatePickerProps = {
  label: string;
  value: string;
  onChange: (ymd: string) => void;
  minDate?: Date;
  maxDate?: Date;
  className?: string;
  disabled?: boolean;
};

function SingleDatePicker({
  label,
  value,
  onChange,
  minDate,
  maxDate,
  className,
  disabled,
}: SingleDatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = ymdToDate(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-10 min-w-0 flex-1 justify-start gap-2 px-3 font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
          aria-label={`${label} date`}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
          <span className="truncate tabular-nums">
            <span className="text-muted-foreground">{label}: </span>
            {selected ? format(selected, "dd/MM/yyyy") : "Select"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          initialFocus
          mode="single"
          defaultMonth={selected || minDate || maxDate || new Date()}
          selected={selected}
          disabled={(date) =>
            (minDate ? date < minDate : false) || (maxDate ? date > maxDate : false)
          }
          onSelect={(date) => {
            if (!date) return;
            onChange(localDateYmd(date));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

type DateRangePickerFieldProps = {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  className?: string;
  disabled?: boolean;
};

/** Two separate fields: "From" and "To" date pickers. */
export function DateRangePickerField({
  from,
  to,
  onChange,
  className,
  disabled,
}: DateRangePickerFieldProps) {
  const fromDate = ymdToDate(from);
  const toDate = ymdToDate(to);

  return (
    <div className="flex min-w-[18rem] shrink-0 items-center gap-2">
      <SingleDatePicker
        label="From"
        value={from}
        maxDate={toDate}
        className={className}
        disabled={disabled}
        onChange={(nextFrom) => {
          // Keep the range valid: if To is empty or before From, align it.
          const nextTo = !to || to < nextFrom ? nextFrom : to;
          onChange(nextFrom, nextTo);
        }}
      />
      <SingleDatePicker
        label="To"
        value={to}
        minDate={fromDate}
        className={className}
        disabled={disabled}
        onChange={(nextTo) => {
          const nextFrom = !from || from > nextTo ? nextTo : from;
          onChange(nextFrom, nextTo);
        }}
      />
    </div>
  );
}
