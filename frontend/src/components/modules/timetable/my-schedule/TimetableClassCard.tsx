import type { ScheduleSlot } from "@/lib/timetableApi";
import { scheduleStatusForDate } from "@/lib/teacherDashboard";
import { cn } from "@/lib/utils";
import { classLabel, roomLabel } from "./dateUtils";
import { subjectTheme } from "./subjectTheme";

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
  const statusLabel =
    status === "completed" ? "Completed" : status === "ongoing" ? "Ongoing" : "Upcoming";
  const SubjectIcon = theme.Icon;
  const room = roomLabel(slot);
  const clazz = classLabel(slot);
  const meta = [clazz, room].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-[68px] w-full min-w-[150px] gap-2 rounded-md border-l-[3px] p-2.5 text-left",
        "transition-all duration-150 hover:-translate-y-px hover:shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300",
        theme.card,
        theme.icon,
      )}
      aria-label={`${slot.subject.name}, ${meta || "class"}, ${statusLabel}`}
    >
      <SubjectIcon className="mt-0.5 size-4 shrink-0" strokeWidth={2} aria-hidden />
      <div className="min-w-0 text-[#334155]">
        <h3 className="truncate text-[12px] font-extrabold leading-4">{slot.subject.name}</h3>
        <p className="truncate text-[10px] leading-3.5 text-[#94A3B8]">{meta || "—"}</p>
        <span className="mt-1 inline-flex rounded-sm bg-white/80 px-1.5 py-0.5 text-[9px] font-bold text-[#94A3B8]">
          {statusLabel}
        </span>
      </div>
    </button>
  );
}
