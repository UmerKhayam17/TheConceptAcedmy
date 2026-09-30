import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { fetchMyTeacherSchedule, type ScheduleSlot } from "@/lib/timetableApi";
import { DAY_LABELS, DAY_ORDER, subjectColor } from "./constants";
import type { Weekday } from "@/lib/configApi";

function periodTimeLabel(slot: ScheduleSlot) {
  if (slot.startTime && slot.endTime) return `${slot.startTime} – ${slot.endTime}`;
  if (slot.startTime) return slot.startTime;
  if (slot.periodLabel) return slot.periodLabel;
  return "";
}

function sortSlots(a: ScheduleSlot, b: ScheduleSlot) {
  const ao = a.periodOrder ?? 999;
  const bo = b.periodOrder ?? 999;
  if (ao !== bo) return ao - bo;
  return String(a.startTime || a.periodId).localeCompare(String(b.startTime || b.periodId));
}

export default function MyScheduleTab({ sessionId }: { sessionId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["my-teacher-schedule", sessionId],
    queryFn: () => fetchMyTeacherSchedule(sessionId),
    enabled: !!sessionId,
  });

  if (!sessionId) return null;
  if (isLoading) return <p className="p-6 text-muted-foreground text-sm">Loading schedule…</p>;

  const slots = data?.slots || [];
  if (!slots.length) {
    return <p className="p-6 text-muted-foreground text-sm">No classes scheduled for you in this session.</p>;
  }

  const days = [...new Set(slots.map((s) => s.day))].sort(
    (a, b) => DAY_ORDER.indexOf(a as Weekday) - DAY_ORDER.indexOf(b as Weekday)
  ) as Weekday[];

  const byDay = (day: Weekday) =>
    slots.filter((s) => s.day === day).sort(sortSlots);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {days.map((day) => (
          <Card key={day} className="p-4">
            <h3 className="font-semibold text-primary mb-3">{DAY_LABELS[day]}</h3>
            <ul className="space-y-2">
              {byDay(day).map((s) => {
                const time = periodTimeLabel(s);
                return (
                  <li key={s._id} className={`rounded-md border p-2 text-sm ${subjectColor(s.subject._id)}`}>
                    {time ? (
                      <div className="text-[11px] font-mono font-medium opacity-80 mb-0.5">{time}</div>
                    ) : null}
                    <div className="font-semibold">{s.subject.name}</div>
                    <div className="text-xs opacity-80">
                      {typeof s.class === "object" && s.class?.name ? `${s.class.name} ` : ""}
                      {typeof s.section === "object" && s.section?.name ? s.section.name : ""}
                      {s.periodLabel ? ` · ${s.periodLabel}` : ""}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
