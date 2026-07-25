import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ModuleActionCaps } from "@/lib/permissions";
import { fetchMyStaffAttendance, fetchStaffAttendanceDay } from "@/lib/aiAttendanceApi";
import { useAuth } from "@/hooks/useAuth";

function fmtTime(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

export default function StaffAttendanceModule({ caps }: { caps: ModuleActionCaps; perm?: string }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const now = new Date();
  const [date, setDate] = useState(now.toISOString().slice(0, 10));
  const [month] = useState(now.getMonth() + 1);
  const [year] = useState(now.getFullYear());

  const { data: dayData, isLoading: dayLoading } = useQuery({
    queryKey: ["staff-attendance-day", date, isAdmin],
    queryFn: () => fetchStaffAttendanceDay(date, isAdmin ? undefined : user?.id),
    enabled: caps.canView && Boolean(date),
  });

  const { data: monthRows = [], isLoading: monthLoading } = useQuery({
    queryKey: ["staff-attendance-mine", month, year],
    queryFn: () => fetchMyStaffAttendance(month, year),
    enabled: caps.canView && !isAdmin,
  });

  const records = useMemo(() => dayData?.records || [], [dayData]);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-primary">My Attendance</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Check-in / check-out from the AI face recognition system (and manual marks).
        </p>
      </div>

      <Card className="p-4 space-y-3 max-w-3xl">
        <div className="max-w-xs">
          <Label htmlFor="staff-att-date">Date</Label>
          <Input
            id="staff-att-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1"
          />
        </div>

        {dayLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-3 text-xs">
              {Object.entries(dayData?.summary || {}).map(([k, v]) => (
                <span key={k} className="rounded-full bg-muted px-2.5 py-1 capitalize">
                  {k}: {v}
                </span>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    {isAdmin && <th className="text-left p-2">Staff</th>}
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">First check-in</th>
                    <th className="text-left p-2">Last check-out</th>
                    <th className="text-left p-2">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {records.length === 0 && (
                    <tr>
                      <td colSpan={isAdmin ? 5 : 4} className="p-6 text-center text-muted-foreground">
                        No attendance for this date.
                      </td>
                    </tr>
                  )}
                  {records.map((r) => {
                    const name =
                      typeof r.userId === "object" && r.userId ? r.userId.name : "—";
                    return (
                      <tr key={r._id} className="border-b">
                        {isAdmin && <td className="p-2 font-medium">{name}</td>}
                        <td className="p-2 capitalize">{r.status}</td>
                        <td className="p-2">{fmtTime(r.checkIn)}</td>
                        <td className="p-2">{fmtTime(r.checkOut)}</td>
                        <td className="p-2 uppercase text-xs">{r.source}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {!isAdmin && (
        <Card className="p-4 space-y-3 max-w-3xl">
          <h2 className="font-medium text-sm">This month</h2>
          {monthLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left p-2">Date</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">First check-in</th>
                    <th className="text-left p-2">Last check-out</th>
                    <th className="text-left p-2">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {monthRows.map((r) => (
                    <tr key={r._id} className="border-b">
                      <td className="p-2">{String(r.date).slice(0, 10)}</td>
                      <td className="p-2 capitalize">{r.status}</td>
                      <td className="p-2">{fmtTime(r.checkIn)}</td>
                      <td className="p-2">{fmtTime(r.checkOut)}</td>
                      <td className="p-2 uppercase text-xs">{r.source}</td>
                    </tr>
                  ))}
                  {!monthRows.length && (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground">
                        No records this month yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
