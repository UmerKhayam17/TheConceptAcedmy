import { LEGEND_SUBJECTS, STATUS_STYLE, subjectTheme } from "./subjectTheme";

export function TimetableLegend({ subjectNames }: { subjectNames: string[] }) {
  const fromData = new Map<string, (typeof LEGEND_SUBJECTS)[number]>();
  for (const name of subjectNames) {
    const theme = subjectTheme("", name);
    if (theme.key !== "general") fromData.set(theme.key, theme);
  }
  const display = fromData.size ? [...fromData.values()] : LEGEND_SUBJECTS.slice(0, 5);
  const statusKeys = Object.keys(STATUS_STYLE) as Array<keyof typeof STATUS_STYLE>;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="text-xs font-bold text-[#0B2347]">Subjects</span>
        {display.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full shrink-0 ${s.accent}`} aria-hidden />
            <span className="text-[10px] text-slate-500">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <span className="text-xs font-bold text-[#0B2347]">Status</span>
        {statusKeys.map((key) => {
          const s = STATUS_STYLE[key];
          return (
            <span key={String(key)} className="flex items-center gap-1.5 text-[10px] text-slate-500">
              <span className={`h-2 w-2 rounded-full shrink-0 ${s.dot}`} aria-hidden />
              {s.label}
            </span>
          );
        })}
      </div>
    </section>
  );
}
