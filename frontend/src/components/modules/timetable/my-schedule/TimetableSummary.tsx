import { BookOpen, CalendarCheck, Clock3, Coffee } from "lucide-react";

export function TimetableSummary({
  totalClasses,
  teachingHours,
  freePeriods,
  classesToday,
}: {
  totalClasses: number;
  teachingHours: number;
  freePeriods: number;
  classesToday: number;
}) {
  const hoursLabel =
    teachingHours % 1 === 0 ? `${teachingHours}h` : `${teachingHours.toFixed(1)}h`;

  const items = [
    {
      title: "Total Classes",
      value: String(totalClasses),
      description: "Scheduled this week",
      Icon: BookOpen,
    },
    {
      title: "Teaching Hours",
      value: hoursLabel,
      description: "Total teaching time",
      Icon: Clock3,
    },
    {
      title: "Free Periods",
      value: String(freePeriods),
      description: "Available periods",
      Icon: Coffee,
    },
    {
      title: "Classes Today",
      value: String(classesToday),
      description: "Scheduled for today",
      Icon: CalendarCheck,
    },
  ] as const;

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(({ title, value, description, Icon }) => (
        <div
          key={title}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 shrink-0">
              <Icon className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-slate-500">{title}</p>
              <p className="mt-0.5 text-xl font-bold text-[#0B2347] tabular-nums">{value}</p>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">{description}</p>
        </div>
      ))}
    </section>
  );
}
