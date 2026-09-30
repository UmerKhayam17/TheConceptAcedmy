import type { ReactNode } from "react";
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
} from "lucide-react";
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
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterField label="Month">
            <Select value={monthValue} onValueChange={onMonthChange}>
              <SelectTrigger className="h-10 w-full min-w-[145px] rounded-lg border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm gap-2 hover:border-blue-300 hover:bg-slate-50">
                <CalendarDays className="h-4 w-4 text-slate-400 shrink-0" aria-hidden />
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

          <FilterField label="View">
            <Select value={viewMode} onValueChange={(v) => onViewModeChange(v as ViewMode)}>
              <SelectTrigger className="h-10 w-full min-w-[145px] rounded-lg border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm gap-2 hover:border-blue-300 hover:bg-slate-50">
                <CalendarRange className="h-4 w-4 text-slate-400 shrink-0" aria-hidden />
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
                <SelectTrigger className="h-10 w-full min-w-[145px] rounded-lg border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm">
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
              <SelectTrigger className="h-10 w-full min-w-[145px] rounded-lg border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm">
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
              <SelectTrigger className="h-10 w-full min-w-[145px] rounded-lg border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm">
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

        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 rounded-lg border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50"
            onClick={onPrevWeek}
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex h-10 min-w-[170px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-[#0B2347] tabular-nums whitespace-nowrap">
            {weekLabel}
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 rounded-lg border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50"
            onClick={onNextWeek}
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            className="ml-1 h-10 rounded-lg bg-[#0B2347] px-4 text-sm font-semibold text-white hover:bg-blue-900"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
          </Button>
        </div>
      </div>
    </section>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-[145px]">
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </label>
      {children}
    </div>
  );
}
