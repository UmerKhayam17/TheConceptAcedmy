import type { ScheduleSlot } from "@/lib/timetableApi";
import { scheduleSlotTitle } from "@/lib/timetableApi";
import { cn } from "@/lib/utils";
import { roomLabel } from "../my-schedule/dateUtils";
import { subjectTheme } from "../my-schedule/subjectTheme";

export function ParentLessonCard({ slot }: { slot: ScheduleSlot }) {
  const subjectName = scheduleSlotTitle(slot) || slot.subject?.name || "Class";
  const theme = subjectTheme(slot.subject?._id || "", slot.subject?.name || subjectName);
  const SubjectIcon = theme.Icon;
  const room = roomLabel(slot) || (slot.room?.code ? `Room ${slot.room.code}` : "");

  return (
    <div
      className={cn(
        "flex h-full min-h-[64px] w-full gap-2 rounded-xl border border-transparent p-2.5 text-left",
        theme.bg,
        theme.icon,
      )}
      title={[subjectName, room].filter(Boolean).join(" · ")}
    >
      <SubjectIcon className="mt-0.5 size-4 shrink-0" strokeWidth={2} aria-hidden />
      <div className="min-w-0">
        <p className="truncate text-[12px] font-bold leading-4 text-[#334155]">{subjectName}</p>
        {room ? (
          <p className="mt-0.5 truncate text-[10px] leading-3.5 text-slate-500">{room}</p>
        ) : null}
      </div>
    </div>
  );
}

export function ParentEmptyCell() {
  return (
    <div className="flex h-full min-h-[64px] flex-col items-center justify-center gap-0.5 rounded-xl bg-slate-50/80 text-slate-300">
      <span className="text-base leading-none">—</span>
      <span className="text-[9px] font-medium">No Class</span>
    </div>
  );
}
