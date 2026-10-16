import type { ReactNode } from "react";
import { CalendarDays } from "lucide-react";

/**
 * Same top-bar pattern as admin Class Board / Timetable Builder.
 */
export function ParentStudentBanner({
  title = "Time Table",
  subtitle = "Weekly class schedule for your child. Switch weeks or view a single day.",
  childPicker,
}: {
  title?: string;
  subtitle?: string;
  /** Optional control (e.g. child select) shown under the subtitle on small screens / beside title. */
  childPicker?: ReactNode;
  /** @deprecated kept for call-site compatibility — profile card removed to match admin top bar */
  student?: unknown;
}) {
  return (
    <div className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
            <CalendarDays className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight">
                {title}
              </h2>
              {childPicker}
            </div>
            <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500 max-w-md">
              {subtitle}
            </p>
          </div>
        </div>
        <div className="shrink-0 rounded-lg bg-primary/10 px-3 py-2 max-w-[14rem]">
          <p className="text-xs sm:text-sm italic leading-snug text-[#1a2b4b]/80">
            <span className="mr-1 text-primary not-italic font-serif text-base leading-none">
              &ldquo;
            </span>
            Education is the key to a better tomorrow.
            <span className="ml-0.5 text-primary not-italic font-serif text-base leading-none">
              &rdquo;
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
