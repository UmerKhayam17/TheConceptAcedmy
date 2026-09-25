import { useRef } from "react";
import { GripVertical, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { scheduleSlotEntries, type ScheduleSlot } from "@/lib/timetableApi";
import { subjectColor } from "./constants";

export default function TimetableSlotCard({
  slot,
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
  draggable: boolean;
  isDragging: boolean;
  isDropTarget?: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  /** Opens the subject/teacher edit dialog for this lesson. */
  onEdit?: () => void;
}) {
  const entries = scheduleSlotEntries(slot);
  const isChoice = entries.length > 1;
  const title = entries.map((e) => e.subject.name).join(" / ");
  const didDragRef = useRef(false);

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
      className={cn(
        "group relative rounded-md border p-2 select-none",
        subjectColor(slot.subject._id),
        draggable && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40 ring-2 ring-primary/40",
        isDropTarget && "ring-2 ring-accent/60"
      )}
      onClick={(e) => {
        if (!onEdit || didDragRef.current) return;
        e.stopPropagation();
        onEdit();
      }}
    >
      <div className="flex items-start gap-1">
        {draggable && (
          <span title="Drag to move" className="mt-0.5 shrink-0 opacity-50 group-hover:opacity-90" aria-hidden>
            <GripVertical className="h-3.5 w-3.5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm leading-snug">{title}</div>
          {isChoice ? (
            <div className="mt-1 space-y-0.5">
              {entries.map((e) => (
                <div key={e.subject._id} className="text-xs opacity-80">
                  {e.subject.name}: {e.teacher.name}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs opacity-80">{slot.teacher.name}</div>
          )}
        </div>
        {onEdit && (
          <button
            type="button"
            title="Edit lesson"
            className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10"
            draggable={false}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">Edit lesson</span>
          </button>
        )}
      </div>
    </div>
  );
}
