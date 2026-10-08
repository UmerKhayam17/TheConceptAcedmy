import { useRef } from "react";
import { DoorOpen, GripVertical, Link2, User, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { subjectIcon } from "@/lib/subjectTheme";
import { scheduleSlotEntries, type ScheduleSlot } from "@/lib/timetableApi";
import { subjectColor } from "./constants";

/** Fixed-height lesson cell for Timetable Builder — Class Board visual style. */
export default function TimetableSlotCard({
  slot,
  colorClass,
  draggable,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onEdit,
}: {
  slot: ScheduleSlot;
  colorClass?: string;
  draggable: boolean;
  isDragging: boolean;
  isDropTarget?: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onEdit?: () => void;
}) {
  const entries = scheduleSlotEntries(slot);
  const title = entries.map((e) => e.subject.name).join(" / ");
  const teachers = entries.map((e) => e.teacher?.name || "—").join(" / ");
  const isParallel = entries.length > 1;
  const roomLabel = slot.room?.code || slot.room?.name || "—";
  const didDragRef = useRef(false);
  const colorId = entries[0]?.subject?._id || slot.subject?._id || "";
  const PrimaryIcon = subjectIcon(entries[0]?.subject.name || slot.subject?.name);

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable) {
          e.preventDefault();
          return;
        }
        didDragRef.current = true;
        onDragStart(e);
      }}
      onDragEnd={() => {
        onDragEnd();
        window.setTimeout(() => {
          didDragRef.current = false;
        }, 80);
      }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={(e) => {
        if (!onEdit || didDragRef.current) return;
        e.stopPropagation();
        onEdit();
      }}
      className={cn(
        "relative flex h-[72px] w-full min-w-0 flex-col justify-center overflow-hidden rounded-xl border px-2.5 py-1.5 text-left text-xs leading-snug select-none shadow-sm transition-shadow",
        colorClass || subjectColor(colorId),
        draggable && "cursor-grab active:cursor-grabbing hover:shadow-md",
        isDragging && "opacity-40 ring-2 ring-primary/40",
        isDropTarget && "ring-2 ring-primary/50"
      )}
    >
      {draggable && (
        <span className="absolute left-1 top-1.5 opacity-40" aria-hidden>
          <GripVertical className="h-3 w-3" />
        </span>
      )}
      {(slot.combinedGroupId || isParallel) && (
        <span
          className={cn(
            "absolute bottom-1.5 right-1.5",
            slot.combinedGroupId ? "text-emerald-600" : "text-violet-600"
          )}
          title={slot.combinedGroupId ? "Shared / combined lesson" : "Parallel entry"}
        >
          {slot.combinedGroupId ? (
            <Users className="h-3.5 w-3.5" />
          ) : (
            <Link2 className="h-3 w-3" />
          )}
        </span>
      )}
      <div className={cn("min-w-0 overflow-hidden pr-5", draggable && "pl-3.5")}>
        <div className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-[13px]" title={title}>
          <PrimaryIcon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
          <span className="truncate">{title}</span>
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1 text-muted-foreground" title={teachers}>
          <User className="h-3 w-3 shrink-0" />
          <span className="truncate">{teachers}</span>
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1 pr-4 text-muted-foreground" title={roomLabel}>
          <DoorOpen className="h-3 w-3 shrink-0" />
          <span className="truncate">{roomLabel}</span>
        </div>
      </div>
    </div>
  );
}
