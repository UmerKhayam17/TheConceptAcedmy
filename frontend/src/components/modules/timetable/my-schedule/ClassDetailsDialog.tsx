import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ScheduleSlot } from "@/lib/timetableApi";
import { periodTimeLabel, scheduleStatusForDate } from "@/lib/teacherDashboard";
import { cn } from "@/lib/utils";
import { classLabel, roomLabel } from "./dateUtils";
import { STATUS_STYLE, subjectTheme } from "./subjectTheme";

export function ClassDetailsDialog({
  open,
  onOpenChange,
  slot,
  columnDate,
  classHref,
  attendanceHref,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slot: ScheduleSlot | null;
  columnDate: Date | null;
  classHref: string;
  attendanceHref: string;
}) {
  const status = slot && columnDate ? scheduleStatusForDate(slot, columnDate) : "upcoming";
  const theme = slot ? subjectTheme(slot.subject._id, slot.subject.name) : null;
  const statusUi = STATUS_STYLE[status];
  const SubjectIcon = theme?.Icon;
  const dateLabel = columnDate
    ? columnDate.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

  return (
    <Dialog open={open && Boolean(slot)} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md rounded-2xl border-slate-200 p-0 gap-0 overflow-hidden"
        onClose={() => onOpenChange(false)}
      >
        {slot && theme && SubjectIcon ? (
          <div className="p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                  Timetable Details
                </p>
                <DialogHeader className="mt-1 space-y-0">
                  <DialogTitle className="flex items-center gap-2 text-xl font-bold text-[#0B2347]">
                    <SubjectIcon className={cn("h-5 w-5 shrink-0", theme.icon)} aria-hidden />
                    {slot.subject.name}
                  </DialogTitle>
                </DialogHeader>
                <span
                  className={cn(
                    "mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold w-fit",
                    statusUi.className,
                  )}
                >
                  {statusUi.label}
                </span>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <DetailRow label="Class" value={classLabel(slot)} />
              <DetailRow label="Date" value={dateLabel} />
              <DetailRow label="Time" value={periodTimeLabel(slot)} />
              <DetailRow label="Room" value={roomLabel(slot) || "—"} />
              <DetailRow
                label="Period"
                value={
                  slot.periodLabel ||
                  (slot.periodOrder != null ? `Period ${slot.periodOrder}` : "—")
                }
              />
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <Link
                to={classHref}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                View Class
              </Link>
              <Link
                to={attendanceHref}
                className="rounded-lg bg-[#0B2347] px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-blue-900"
              >
                Mark Attendance
              </Link>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-[#0B2347] text-right">{value}</span>
    </div>
  );
}
