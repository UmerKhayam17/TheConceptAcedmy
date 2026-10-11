import { useEffect, useMemo, useState } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, format, isAfter, isBefore, isSameMonth, isValid, parse, parseISO, setMonth as setDateMonth, setYear } from "date-fns";
import { DayPicker } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Display / type as dd/mm/yyyy; value is always ISO yyyy-mm-dd for APIs. */

const MONTH_OPTIONS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function isoToDmy(iso?: string): string {
  if (!iso) return "";
  const d = parseISO(iso.length >= 10 ? iso.slice(0, 10) : iso);
  if (!isValid(d)) return "";
  return format(d, "dd/MM/yyyy");
}

export function dmyToIso(dmy: string): string | null {
  const trimmed = dmy.trim();
  if (!trimmed) return "";
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const parsed = parse(
    `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`,
    "dd/MM/yyyy",
    new Date(),
  );
  if (!isValid(parsed)) return null;
  if (parsed.getDate() !== day || parsed.getMonth() + 1 !== month || parsed.getFullYear() !== year) {
    return null;
  }
  return format(parsed, "yyyy-MM-dd");
}

/** Mask digits into dd/mm/yyyy while typing. */
export function formatDmyInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function selectClassName() {
  return cn(
    "h-9 cursor-pointer rounded-md border border-input bg-background px-2.5 text-sm font-medium text-foreground",
    "outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring",
  );
}

type DateDmYInputProps = {
  id?: string;
  value: string;
  onChange: (isoDate: string) => void;
  disabled?: boolean;
  className?: string;
  /** Max selectable / typed date (ISO). Defaults to today for birth dates. */
  maxIso?: string;
  minIso?: string;
  placeholder?: string;
};

export function DateDmYInput({
  id,
  value,
  onChange,
  disabled,
  className,
  maxIso,
  minIso = "1900-01-01",
  placeholder = "dd/mm/yyyy",
}: DateDmYInputProps) {
  const [text, setText] = useState(() => isoToDmy(value));
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Date>(() => {
    if (value) {
      const d = parseISO(value.slice(0, 10));
      if (isValid(d)) return d;
    }
    return new Date();
  });

  useEffect(() => {
    setText(isoToDmy(value));
    if (value) {
      const d = parseISO(value.slice(0, 10));
      if (isValid(d)) setMonth(d);
    }
  }, [value]);

  const selected = value ? parseISO(value.slice(0, 10)) : undefined;
  const selectedDate = selected && isValid(selected) ? selected : undefined;

  const maxDate = maxIso ? parseISO(maxIso.slice(0, 10)) : undefined;
  const minDate = minIso ? parseISO(minIso.slice(0, 10)) : undefined;
  const fromYear = minDate && isValid(minDate) ? minDate.getFullYear() : 1900;
  const toYear = maxDate && isValid(maxDate) ? maxDate.getFullYear() : new Date().getFullYear();

  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = toYear; y >= fromYear; y -= 1) years.push(y);
    return years;
  }, [fromYear, toYear]);

  const todayIso = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const canUseToday =
    (!maxIso || todayIso <= maxIso.slice(0, 10)) && (!minIso || todayIso >= minIso.slice(0, 10));

  const canGoPrev =
    !minDate ||
    !isValid(minDate) ||
    isAfter(addMonths(month, -1), minDate) ||
    isSameMonth(addMonths(month, -1), minDate);

  const canGoNext =
    !maxDate ||
    !isValid(maxDate) ||
    isBefore(addMonths(month, 1), maxDate) ||
    isSameMonth(addMonths(month, 1), maxDate);

  const jumpToMonth = (monthIndex: number) => {
    setMonth((current) => setDateMonth(current, monthIndex));
  };

  const jumpToYear = (year: number) => {
    setMonth((current) => setYear(current, year));
  };

  const commitText = (raw: string) => {
    const formatted = formatDmyInput(raw);
    setText(formatted);
    if (!formatted) {
      onChange("");
      return;
    }
    if (formatted.length < 10) return;
    const iso = dmyToIso(formatted);
    if (iso === null) return;
    if (iso === "") {
      onChange("");
      return;
    }
    if (maxIso && iso > maxIso.slice(0, 10)) return;
    if (minIso && iso < minIso.slice(0, 10)) return;
    onChange(iso);
  };

  const applyIso = (iso: string) => {
    onChange(iso);
    setText(isoToDmy(iso));
    const d = parseISO(iso);
    if (isValid(d)) setMonth(d);
  };

  return (
    <div className={cn("relative", className)}>
      <CalendarIcon className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={id}
        inputMode="numeric"
        placeholder={placeholder}
        disabled={disabled}
        className="pl-9 pr-11 tabular-nums tracking-wide"
        value={text}
        onChange={(e) => commitText(e.target.value)}
        onBlur={() => {
          if (!text) {
            onChange("");
            return;
          }
          const iso = dmyToIso(text);
          if (iso) {
            if (maxIso && iso > maxIso.slice(0, 10)) {
              setText(isoToDmy(value));
              return;
            }
            if (minIso && iso < minIso.slice(0, 10)) {
              setText(isoToDmy(value));
              return;
            }
            applyIso(iso);
          } else {
            setText(isoToDmy(value));
          }
        }}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Open calendar"
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[320px] overflow-hidden rounded-xl border border-border/80 p-0 shadow-xl"
          align="end"
          sideOffset={8}
        >
          <div className="bg-gradient-to-br from-primary via-primary to-[hsl(var(--primary-glow))] px-4 py-3.5 text-primary-foreground">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-primary-foreground/70">
              Date of birth
            </p>
            <p className="mt-1 font-display text-2xl font-semibold tracking-tight tabular-nums">
              {selectedDate ? format(selectedDate, "dd MMM yyyy") : "Select date"}
            </p>
            <p className="mt-0.5 text-xs text-primary-foreground/65">
              {selectedDate ? format(selectedDate, "EEEE") : "Day / Month / Year"}
            </p>
          </div>

          <div className="space-y-3 bg-background p-3">
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                disabled={!canGoPrev}
                onClick={() => setMonth((m) => addMonths(m, -1))}
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <select
                aria-label="Month"
                className={cn(selectClassName(), "min-w-0 flex-[1.4]")}
                value={month.getMonth()}
                onChange={(e) => jumpToMonth(Number(e.target.value))}
              >
                {MONTH_OPTIONS.map((label, index) => (
                  <option key={label} value={index}>
                    {label}
                  </option>
                ))}
              </select>

              <select
                aria-label="Year"
                className={cn(selectClassName(), "min-w-0 flex-1 tabular-nums")}
                value={month.getFullYear()}
                onChange={(e) => jumpToYear(Number(e.target.value))}
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                disabled={!canGoNext}
                onClick={() => setMonth((m) => addMonths(m, 1))}
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <DayPicker
              mode="single"
              month={month}
              onMonthChange={setMonth}
              selected={selectedDate}
              onSelect={(day) => {
                if (!day) return;
                applyIso(format(day, "yyyy-MM-dd"));
                setOpen(false);
              }}
              disabled={[
                ...(maxDate && isValid(maxDate) ? [{ after: maxDate }] : []),
                ...(minDate && isValid(minDate) ? [{ before: minDate }] : []),
              ]}
              fromYear={fromYear}
              toYear={toYear}
              showOutsideDays
              className="w-full"
              classNames={{
                months: "flex w-full flex-col",
                month: "w-full space-y-2",
                caption: "hidden",
                nav: "hidden",
                table: "w-full border-collapse",
                head_row: "flex w-full",
                head_cell:
                  "w-9 flex-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
                row: "mt-1 flex w-full",
                cell: "relative h-9 w-9 flex-1 p-0 text-center text-sm focus-within:relative focus-within:z-20",
                day: cn(
                  "mx-auto flex h-9 w-9 items-center justify-center rounded-full p-0 text-sm font-medium transition-colors",
                  "hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "aria-selected:opacity-100",
                ),
                day_selected:
                  "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground shadow-sm",
                day_today: "bg-accent/25 text-accent-foreground ring-1 ring-accent/50",
                day_outside: "text-muted-foreground/40",
                day_disabled: "text-muted-foreground/30 line-through decoration-muted-foreground/30",
                day_hidden: "invisible",
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-3 py-2.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2.5 text-xs"
              disabled={!value}
              onClick={() => {
                onChange("");
                setText("");
              }}
            >
              Clear
            </Button>
            <div className="flex gap-1.5">
              {canUseToday && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs"
                  onClick={() => {
                    applyIso(todayIso);
                    setOpen(false);
                  }}
                >
                  Today
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                className="h-8 px-3 text-xs"
                disabled={!selectedDate}
                onClick={() => setOpen(false)}
              >
                Done
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
