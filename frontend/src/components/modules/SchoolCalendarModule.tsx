import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchAnnouncements, type Announcement } from "@/lib/announcementApi";
import { fetchSessions } from "@/lib/configApi";
import { cn } from "@/lib/utils";

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function daysInMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function announcementDate(a: Announcement): Date | null {
  const raw = a.createdAt || (a as { publishAt?: string }).publishAt;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * School calendar — month view highlighting announcement / notice days,
 * plus active session context. (Dedicated holiday API can plug in later.)
 */
export default function SchoolCalendarModule() {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState(() => new Date());

  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ["school-calendar-announcements"],
    queryFn: () => fetchAnnouncements(),
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["school-calendar-sessions"],
    queryFn: () => fetchSessions(),
    retry: false,
  });

  const activeSession = useMemo(
    () => sessions.find((s) => s.status === "active") || sessions[0],
    [sessions],
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<string, Announcement[]>();
    announcements.forEach((a) => {
      const d = announcementDate(a);
      if (!d) return;
      if (d.getMonth() !== cursor.getMonth() || d.getFullYear() !== cursor.getFullYear()) return;
      const key = d.getDate().toString();
      const list = map.get(key) || [];
      list.push(a);
      map.set(key, list);
    });
    return map;
  }, [announcements, cursor]);

  const selectedEvents = useMemo(() => {
    return announcements.filter((a) => {
      const d = announcementDate(a);
      return d && sameDay(d, selected);
    });
  }, [announcements, selected]);

  const leadingBlanks = cursor.getDay();
  const totalDays = daysInMonth(cursor);
  const monthLabel = cursor.toLocaleString(undefined, { month: "long", year: "numeric" });
  const today = new Date();

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <CalendarDays className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight text-[#1a2b4b]">
            School Calendar
          </h2>
          <p className="text-sm text-muted-foreground max-w-xl">
            Academic notices and key dates from the school. Select a day to see details.
          </p>
        </div>
      </div>

      {activeSession && (
        <Card className="rounded-xl border bg-slate-50/80 p-4 text-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Current session</p>
          <p className="mt-1 font-semibold text-[#1a2b4b]">{activeSession.name}</p>
          <p className="mt-0.5 text-muted-foreground capitalize">
            Status: {activeSession.status || "—"}
          </p>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="rounded-2xl border p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="font-display text-lg font-semibold text-[#1a2b4b]">{monthLabel}</h3>
            <div className="flex gap-1">
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8"
                onClick={() =>
                  setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
                }
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8"
                onClick={() =>
                  setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
                }
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {Array.from({ length: leadingBlanks }).map((_, i) => (
              <div key={`b-${i}`} className="aspect-square" />
            ))}
            {Array.from({ length: totalDays }).map((_, i) => {
              const day = i + 1;
              const date = new Date(cursor.getFullYear(), cursor.getMonth(), day);
              const hasEvents = (eventsByDay.get(String(day)) || []).length > 0;
              const isSelected = sameDay(date, selected);
              const isToday = sameDay(date, today);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelected(date)}
                  className={cn(
                    "relative flex aspect-square flex-col items-center justify-center rounded-lg text-sm transition-colors",
                    isSelected
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "hover:bg-muted",
                    isToday && !isSelected && "ring-1 ring-primary/40",
                  )}
                >
                  {day}
                  {hasEvents && (
                    <span
                      className={cn(
                        "absolute bottom-1.5 h-1 w-1 rounded-full",
                        isSelected ? "bg-primary-foreground" : "bg-primary",
                      )}
                    />
                  )}
                </button>
              );
            })}
          </div>
          {isLoading && (
            <p className="mt-3 text-xs text-muted-foreground">Loading school notices…</p>
          )}
        </Card>

        <Card className="rounded-2xl border p-4 shadow-sm sm:p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Selected day</p>
          <p className="mt-1 font-semibold text-[#1a2b4b]">
            {selected.toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>

          <div className="mt-4 space-y-3">
            {selectedEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No school notices on this day. Holidays and event schedules will appear here as
                the academy publishes them.
              </p>
            ) : (
              selectedEvents.map((a) => (
                <div
                  key={a._id}
                  className="rounded-xl border bg-slate-50/80 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-[#1a2b4b]">{a.title}</p>
                    <Badge variant="outline" className="capitalize text-[10px]">
                      {a.targetAudience || "notice"}
                    </Badge>
                  </div>
                  {a.body ? (
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-4">{a.body}</p>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
