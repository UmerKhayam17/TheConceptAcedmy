import type { ReactNode } from "react";
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Weekday } from "@/lib/configApi";
import { DAY_FULL_LABELS } from "../constants";

export type ViewMode = "week" | "day";

type Option = { value: string; label: string };

const triggerClass =
  "h-9 w-full rounded-md border-[#E2E8F0] bg-white px-3 text-xs font-medium text-[#475569] shadow-[0_1px_2px_rgba(15,42,86,0.04)] gap-2 hover:bg-white focus:ring-1 focus:ring-[#BFDBFE]";

export function TimetableFilters({
  monthValue,
  months,
  onMonthChange,
  viewMode,
  onViewModeChange,
  dayFocus,
  onDayFocusChange,
  days,
  classFilter,
  onClassFilterChange,
  classOptions,
  subjectFilter,
  onSubjectFilterChange,
  subjectOptions,
  weekLabel,
  onPrevWeek,
  onNextWeek,
}: {
  monthValue: string;
  months: Option[];
  onMonthChange: (value: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (value: ViewMode) => void;
  dayFocus: Weekday;
  onDayFocusChange: (value: Weekday) => void;
  days: Weekday[];
  classFilter: string;
  onClassFilterChange: (value: string) => void;
  classOptions: Option[];
  subjectFilter: string;
  onSubjectFilterChange: (value: string) => void;
  subjectOptions: Option[];
  weekLabel: string;
  onPrevWeek: () => void;
  onNextWeek: () => void;
}) {
  return (
    <section className="rounded-xl border border-[#E8EEF6] bg-[#F7FAFD] px-4 py-3.5 shadow-[0_2px_8px_rgba(15,42,86,0.04)]">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <FilterField>
            <Select value={monthValue} onValueChange={onMonthChange}>
              <SelectTrigger className={`${triggerClass} min-w-[12.5rem]`}>
                <CalendarDays className="size-3.5 text-[#64748B] shrink-0" aria-hidden />
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField>
            <Select value={viewMode} onValueChange={(v) => onViewModeChange(v as ViewMode)}>
              <SelectTrigger className={`${triggerClass} min-w-[11.5rem]`}>
                <CalendarRange className="size-3.5 text-[#64748B] shrink-0" aria-hidden />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Week View</SelectItem>
                <SelectItem value="day">Day View</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>

          {viewMode === "day" ? (
            <FilterField label="Day">
              <Select value={dayFocus} onValueChange={(v) => onDayFocusChange(v as Weekday)}>
                <SelectTrigger className={`${triggerClass} min-w-[9rem]`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {days.map((d) => (
                    <SelectItem key={d} value={d}>
                      {DAY_FULL_LABELS[d]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
          ) : null}

          <FilterField label="Class">
            <Select value={classFilter} onValueChange={onClassFilterChange}>
              <SelectTrigger className={`${triggerClass} min-w-[12.5rem]`}>
                <SelectValue placeholder="Class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classes</SelectItem>
                {classOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Subject">
            <Select value={subjectFilter} onValueChange={onSubjectFilterChange}>
              <SelectTrigger className={`${triggerClass} min-w-[13rem]`}>
                <SelectValue placeholder="Subject" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All subjects</SelectItem>
                {subjectOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
        </div>

        <div className="flex items-center justify-end gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-9 rounded-md border-[#E2E8F0] bg-white text-[#64748B] shadow-[0_1px_2px_rgba(15,42,86,0.04)] hover:bg-white hover:text-[#475569]"
            onClick={onPrevWeek}
            aria-label="Previous week"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <div className="flex h-9 min-w-[9.5rem] items-center justify-center rounded-md border border-[#E2E8F0] bg-white px-4 text-xs font-medium text-[#475569] shadow-[0_1px_2px_rgba(15,42,86,0.04)] tabular-nums whitespace-nowrap">
            {weekLabel}
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-9 rounded-md border-[#E2E8F0] bg-white text-[#64748B] shadow-[0_1px_2px_rgba(15,42,86,0.04)] hover:bg-white hover:text-[#475569]"
            onClick={onNextWeek}
            aria-label="Next week"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}

function FilterField({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      {label ? (
        <span className="mb-1 block text-[10px] font-semibold text-[#94A3B8]">{label}</span>
      ) : null}
      {children}
    </div>
  );
}
