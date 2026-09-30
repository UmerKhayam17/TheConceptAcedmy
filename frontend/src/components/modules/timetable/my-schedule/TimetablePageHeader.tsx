import { CalendarDays } from "lucide-react";

export function TimetablePageHeader({
  weeklyClasses,
  teachingHours,
}: {
  weeklyClasses?: number;
  teachingHours?: number;
}) {
  const hoursLabel =
    teachingHours == null
      ? null
      : teachingHours % 1 === 0
        ? `${teachingHours} Teaching Hours`
        : `${teachingHours.toFixed(1)} Teaching Hours`;

  return (
    <section
      className="flex flex-col justify-between gap-4 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-white p-5 md:flex-row md:items-center"
      aria-label="Your Timetable"
    >
      <div className="flex items-start gap-4 min-w-0">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm">
          <CalendarDays className="h-6 w-6" strokeWidth={2} aria-hidden />
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-[#0B2347]">Your Timetable</h2>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Here is your weekly teaching schedule. Stay organized and make the most of your day.
          </p>
        </div>
      </div>

      {weeklyClasses != null || hoursLabel ? (
        <div className="hidden items-center gap-2 md:flex shrink-0">
          {weeklyClasses != null ? (
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
              {weeklyClasses} Classes This Week
            </span>
          ) : null}
          {hoursLabel ? (
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
              {hoursLabel}
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
