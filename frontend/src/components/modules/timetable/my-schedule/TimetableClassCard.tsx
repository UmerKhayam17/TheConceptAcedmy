import type { ScheduleSlot } from "@/lib/timetableApi";
import { scheduleStatusForDate } from "@/lib/teacherDashboard";
import { cn } from "@/lib/utils";
import { classLabel, roomLabel } from "./dateUtils";
import { STATUS_STYLE, subjectTheme } from "./subjectTheme";

export function TimetableClassCard({
  slot,
  columnDate,
  onClick,
}: {
  slot: ScheduleSlot;
  columnDate: Date;
  onClick?: () => void;
}) {
  const theme = subjectTheme(slot.subject._id, slot.subject.name);
  const status = scheduleStatusForDate(slot, columnDate);
  const statusUi = STATUS_STYLE[status];
  const SubjectIcon = theme.Icon;
  const room = roomLabel(slot);
  const clazz = classLabel(slot);
  const meta = [clazz, room].filter(Boolean).join(" • ");

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative w-full min-h-[112px] rounded-xl border text-left overflow-hidden",
        "pl-3.5 pr-3 pt-3 pb-2.5",
        "shadow-[0_2px_8px_rgba(15,42,86,0.06)]",
        "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(15,42,86,0.1)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300",
        theme.border,
        theme.bg,
      )}
      aria-label={`${slot.subject.name}, ${meta || "class"}, ${statusUi.label}`}
    >
      <span
        className={cn("absolute inset-y-0 left-0 w-[4px] rounded-l-xl", theme.accent)}
        aria-hidden
      />

      <div className="flex items-start gap-2.5 min-w-0">
        <span
          className={cn(
            "grid h-9 w-9 place-items-center rounded-lg border border-white/80 bg-white/80 shrink-0",
            theme.icon,
          )}
          style={{
            boxShadow: `0 0 0 1px ${theme.accentHex}22, 0 4px 14px ${theme.accentHex}40`,
          }}
          aria-hidden
        >
          <SubjectIcon className="h-4 w-4" strokeWidth={2.25} />
        </span>

        <div className="min-w-0 flex-1 pt-0.5">
          <p className="truncate text-[13px] font-bold text-[#0B2347] leading-tight">
            {slot.subject.name}
          </p>
          <p className="mt-1 truncate text-[11px] font-medium text-slate-500">{meta || "—"}</p>
        </div>
      </div>

      <div className="mt-3">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold",
            statusUi.className,
          )}
        >
          {statusUi.label}
        </span>
      </div>
    </button>
  );
}
