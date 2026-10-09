import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ModuleActionCaps } from "@/lib/permissions";
import { fetchStaffUsers } from "@/lib/staffApi";
import { fetchSessions, type Weekday } from "@/lib/configApi";
import {
  createTeacherProfile,
  deleteTeacherProfile,
  fetchPeriodTemplates,
  fetchRooms,
  fetchTeacherProfiles,
  syncAllTeacherProfiles,
  updateTeacherProfile,
  type TeacherProfile,
  type TeacherProfileInput,
} from "@/lib/timetableApi";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import { usePanelListSearch } from "@/hooks/usePanelListSearch";
import { DAY_LABELS, normalizeWorkingDays } from "./constants";

const QK = (sid: string) => ["timetable-teacher-profiles", sid] as const;

type AvailabilityMap = Partial<Record<Weekday, string[]>>;

function availabilitySummary(profile: TeacherProfile) {
  if (!profile.availability?.length) return "All school periods";
  const limited = profile.availability.filter((row) => row.periodIds?.length);
  if (!limited.length) return "No periods marked";
  return limited.map((row) => DAY_LABELS[row.day]).join(", ");
}

export default function TeacherProfilesTab({ sessionId, caps }: { sessionId: string; caps: ModuleActionCaps }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TeacherProfile | null>(null);
  const [userId, setUserId] = useState("");
  const [maxDay, setMaxDay] = useState(6);
  const [maxWeek, setMaxWeek] = useState(30);
  const [limitAvailability, setLimitAvailability] = useState(false);
  const [availability, setAvailability] = useState<AvailabilityMap>({});
  const [roomIds, setRoomIds] = useState<string[]>([]);

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: QK(sessionId),
    queryFn: () => fetchTeacherProfiles(sessionId),
    enabled: !!sessionId,
  });

  const { data: staffUsers = [] } = useQuery({
    queryKey: ["users-module-list", "staff"],
    queryFn: fetchStaffUsers,
  });
  const { data: sessions = [] } = useQuery({ queryKey: ["sessions"], queryFn: () => fetchSessions() });
  const { data: templates = [] } = useQuery({
    queryKey: ["timetable-period-templates", sessionId],
    queryFn: () => fetchPeriodTemplates(sessionId),
    enabled: !!sessionId,
  });
  const { data: rooms = [] } = useQuery({
    queryKey: ["timetable-rooms", sessionId],
    queryFn: () => fetchRooms(sessionId),
    enabled: !!sessionId,
  });

  const workingDays = useMemo(
    () => normalizeWorkingDays(sessions.find((s) => s._id === sessionId)?.workingDays),
    [sessions, sessionId],
  );
  const lecturePeriods = useMemo(() => {
    const template = templates.find((t) => t.isDefault) || templates[0];
    return (template?.slots || []).filter((slot) => slot.type === "lecture");
  }, [templates]);
  useEffect(() => {
    if (!limitAvailability || lecturePeriods.length === 0) return;
    setAvailability((current) => {
      if (Object.keys(current).length > 0) return current;
      const next: AvailabilityMap = {};
      for (const day of workingDays) next[day] = lecturePeriods.map((period) => period._id);
      return next;
    });
  }, [limitAvailability, lecturePeriods, workingDays]);

  const profileUserIds = useMemo(() => new Set(profiles.map((p) => p.user?._id).filter(Boolean)), [profiles]);

  /** Staff teacher accounts not yet on this session roster (for manual add only). */
  const teachersPendingProfile = staffUsers.filter((u) => {
    const roleName =
      typeof u.role === "object" && u.role?.name
        ? u.role.name
        : String(u.role || "").toLowerCase();
    return u.isActive !== false && roleName === "teacher" && !profileUserIds.has(u._id);
  });

  const resetForm = () => {
    setEditing(null);
    setUserId("");
    setMaxDay(6);
    setMaxWeek(30);
    setLimitAvailability(false);
    setAvailability({});
    setRoomIds([]);
  };

  const openCreate = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (profile: TeacherProfile) => {
    const nextAvailability: AvailabilityMap = {};
    for (const row of profile.availability || []) {
      nextAvailability[row.day] = (row.periodIds || []).map(String);
    }
    setEditing(profile);
    setUserId(profile.user._id);
    setMaxDay(profile.maxLecturesPerDay || 6);
    setMaxWeek(profile.maxLecturesPerWeek || 30);
    setLimitAvailability((profile.availability || []).length > 0);
    setAvailability(nextAvailability);
    setRoomIds((profile.preferredRooms || []).map((room) => room._id));
    setOpen(true);
  };

  const togglePeriod = (day: Weekday, periodId: string, checked: boolean) => {
    setAvailability((current) => {
      const ids = new Set(current[day] || []);
      if (checked) ids.add(periodId);
      else ids.delete(periodId);
      return { ...current, [day]: [...ids] };
    });
  };

  const toggleRoom = (roomId: string, checked: boolean) => {
    setRoomIds((current) => (checked ? [...current, roomId] : current.filter((id) => id !== roomId)));
  };

  const saveMut = useMutation({
    mutationFn: () => {
      const allOpen =
        !limitAvailability ||
        workingDays.every((day) => lecturePeriods.every((period) => (availability[day] || []).includes(period._id)));
      const body: TeacherProfileInput = {
        maxLecturesPerDay: maxDay,
        maxLecturesPerWeek: maxWeek,
        preferredRooms: roomIds,
        availability: allOpen
          ? []
          : workingDays.map((day) => ({
              day,
              periodIds: availability[day] || [],
            })),
      };
      if (editing) return updateTeacherProfile(editing._id, body);
      return createTeacherProfile({ ...body, user: userId, session: sessionId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK(sessionId) });
      setOpen(false);
      resetForm();
      toast({ title: editing ? "Teacher profile updated" : "Teacher profile created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const delMut = useMutation({
    mutationFn: deleteTeacherProfile,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK(sessionId) });
      toast({ title: "Profile removed" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const syncMut = useMutation({
    mutationFn: () => syncAllTeacherProfiles(sessionId),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: QK(sessionId) });
      qc.invalidateQueries({ queryKey: ["timetable-teacher-profiles", sessionId] });
      toast({
        title: "Teachers synced",
        description:
          result.created > 0
            ? `Added ${result.created} teacher profile${result.created === 1 ? "" : "s"} for this session.`
            : "Every active teaching staff member already has a profile for this session.",
      });
    },
    onError: (e: Error) => toast({ title: "Sync failed", description: e.message, variant: "destructive" }),
  });

  const { search, setSearch, filtered: profilesFiltered } = usePanelListSearch(profiles, (p) => [
    p.user.name,
    p.user.email,
    p.maxLecturesPerDay,
    p.maxLecturesPerWeek,
    availabilitySummary(p),
  ]);

  if (!sessionId) return null;

  const canSave = Boolean(userId) && maxDay >= 1 && maxWeek >= 1 && !saveMut.isPending;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <p className="text-sm text-muted-foreground max-w-3xl">
        Session teachers appear here after sync or manual add. Timetable, subject teachers, and class teachers use this roster — not the general staff list. Sync pulls every active teaching staff account into this session with default scheduling limits.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <PanelSearchBar value={search} onChange={setSearch} placeholder="Search teacher name or email…" className="max-w-md" />
        <div className="flex flex-col gap-2 w-full sm:w-auto sm:flex-row">
          {caps.canCreate && (
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full justify-center gap-2 sm:h-9 sm:w-auto"
              disabled={syncMut.isPending}
              onClick={() => syncMut.mutate()}
            >
              <RefreshCw className={`h-4 w-4 shrink-0 ${syncMut.isPending ? "animate-spin" : ""}`} />
              {syncMut.isPending ? "Syncing…" : "Sync all teachers"}
            </Button>
          )}
          {caps.canCreate && (
            <Button className="h-10 w-full justify-center gap-2 shrink-0 sm:h-9 sm:w-auto" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add teacher profile
            </Button>
          )}
        </div>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left p-3">Teacher</th>
              <th className="text-left p-3">Max/day</th>
              <th className="text-left p-3">Max/week</th>
              <th className="text-left p-3">Availability</th>
              {(caps.canEdit || caps.canDelete) && <th className="text-right p-3">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">Loading…</td>
              </tr>
            )}
            {!isLoading && profilesFiltered.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  {profiles.length === 0 ? "No teacher profiles for this session yet." : "No profiles match your search."}
                </td>
              </tr>
            )}
            {profilesFiltered.map((p) => (
                <tr key={p._id} className="border-b">
                  <td className="p-3">
                    <div className="font-medium">{p.user.name}</div>
                    <div className="text-xs text-muted-foreground">{p.user.email}</div>
                  </td>
                  <td className="p-3">{p.maxLecturesPerDay}</td>
                  <td className="p-3">{p.maxLecturesPerWeek}</td>
                  <td className="p-3">{availabilitySummary(p)}</td>
                  {(caps.canEdit || caps.canDelete) && (
                    <td className="p-3 text-right whitespace-nowrap">
                      {caps.canEdit && (
                        <Button variant="ghost" size="icon" onClick={() => openEdit(p)} aria-label="Edit profile">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {caps.canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => confirm("Remove profile?") && delMut.mutate(p._id)}
                          aria-label="Remove profile"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) resetForm(); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit teacher profile" : "Teacher profile"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Teacher</Label>
              {editing ? (
                <p className="mt-1 text-sm font-medium">{editing.user.name}</p>
              ) : (
                <select
                  className="mt-1 w-full h-10 rounded-md border px-3 text-sm"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                >
                  <option value="">Select teaching staff to add</option>
                  {teachersPendingProfile.map((t) => (
                    <option key={t._id} value={t._id}>{t.name} ({t.email})</option>
                  ))}
                </select>
              )}
              {!editing && teachersPendingProfile.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  All active teaching staff are on this session roster, or none exist in Staff yet. Use Sync all teachers to add missing profiles.
                </p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Max lectures per day</Label>
                <Input className="mt-1" type="number" min={1} value={maxDay} onChange={(e) => setMaxDay(Number(e.target.value))} />
              </div>
              <div>
                <Label>Max lectures per week</Label>
                <Input className="mt-1" type="number" min={1} value={maxWeek} onChange={(e) => setMaxWeek(Number(e.target.value))} />
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={limitAvailability}
                  onCheckedChange={(checked) => {
                    const on = checked === true;
                    setLimitAvailability(on);
                    if (on && lecturePeriods.length) {
                      const next: AvailabilityMap = {};
                      for (const day of workingDays) next[day] = lecturePeriods.map((period) => period._id);
                      setAvailability(next);
                    }
                  }}
                />
                Limit available periods
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                Leave this off to allow every school period. Turn it on to uncheck periods they cannot teach, such as period 1.
              </p>
              {limitAvailability && lecturePeriods.length === 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Set Academy Time Configuration first so periods can be marked.
                </p>
              )}
              {limitAvailability && lecturePeriods.length > 0 && (
                <div className="mt-2 overflow-x-auto rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-2">Day</th>
                        {lecturePeriods.map((period) => (
                          <th key={period._id} className="p-2 font-medium">
                            {period.label || `P${period.order}`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {workingDays.map((day) => (
                        <tr key={day} className="border-t">
                          <td className="p-2">{DAY_LABELS[day]}</td>
                          {lecturePeriods.map((period) => (
                            <td key={period._id} className="p-2 text-center">
                              <Checkbox
                                checked={(availability[day] || []).includes(period._id)}
                                onCheckedChange={(checked) => togglePeriod(day, period._id, checked === true)}
                                aria-label={`${DAY_LABELS[day]} ${period.label || period.order}`}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <Label>Preferred rooms</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Auto Generate tries these rooms before the class room.
              </p>
              {rooms.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">No rooms for this session yet.</p>
              ) : (
                <div className="mt-2 grid gap-2 sm:grid-cols-2 max-h-32 overflow-y-auto rounded-md border p-3">
                  {rooms.map((room) => (
                    <label key={room._id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={roomIds.includes(room._id)}
                        onCheckedChange={(checked) => toggleRoom(room._id, checked === true)}
                      />
                      <span>{room.name}{room.code ? ` (${room.code})` : ""}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }}>Cancel</Button>
            <Button disabled={!canSave} onClick={() => saveMut.mutate()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
