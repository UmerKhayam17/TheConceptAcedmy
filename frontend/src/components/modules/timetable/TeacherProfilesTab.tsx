import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pencil, Plus, RefreshCw, Trash2, UserCircle, Users } from "lucide-react";
import { avatarTone } from "@/lib/avatarTone";
import { cn } from "@/lib/utils";
import FilterToolbar, { FilterToolbarActions } from "@/components/modules/FilterToolbar";
import { resolveUploadUrl } from "@/lib/api";
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

/** True when the teacher is limited to some periods (an empty list means every school period). */
function isLimited(profile: TeacherProfile) {
  return Boolean(profile.availability?.length);
}

/** Same square avatar as Staff Logins: photo, or the first letter on a stable pastel tone. */
function TeacherAvatar({ name, profileImage }: { name: string; profileImage?: string }) {
  const imgSrc = profileImage ? resolveUploadUrl(profileImage) : null;
  if (imgSrc) {
    return (
      <img src={imgSrc} alt="" className="h-8 w-8 shrink-0 rounded-md border border-border object-cover" />
    );
  }
  const initial = String(name || "").trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-semibold",
        avatarTone(name || ""),
      )}
    >
      {initial}
    </span>
  );
}

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

  const [availabilityFilter, setAvailabilityFilter] = useState<"" | "all" | "limited">("");
  const profilesByAvailability = availabilityFilter
    ? profiles.filter((p) => (availabilityFilter === "limited") === isLimited(p))
    : profiles;

  const { search, setSearch, filtered: profilesFiltered } = usePanelListSearch(profilesByAvailability, (p) => [
    p.user.name,
    p.user.email,
    p.maxLecturesPerDay,
    p.maxLecturesPerWeek,
    availabilitySummary(p),
    ...(p.preferredRooms || []).map((room) => room.name),
  ]);

  if (!sessionId) return null;

  const canSave = Boolean(userId) && maxDay >= 1 && maxWeek >= 1 && !saveMut.isPending;
  const hasActions = caps.canEdit || caps.canDelete;
  const colSpan = 6 + (hasActions ? 1 : 0);
  const thClass =
    "whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600";

  return (
    <div className="min-h-full bg-slate-50 px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
              <UserCircle className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight">
                Teachers
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500 max-w-xl">
                The session's teacher roster used by the timetable, subject teachers and class teachers. Sync adds
                every active teaching staff account with default limits.
              </p>
            </div>
          </div>
          <div className="shrink-0 rounded-lg bg-primary/10 px-3 py-2 max-w-[15rem]">
            <p className="text-xs sm:text-sm italic leading-snug text-[#1a2b4b]/80">
              <span className="mr-1 text-primary not-italic font-serif text-base leading-none">
                &ldquo;
              </span>
              A great school builds great futures.
              <span className="ml-0.5 text-primary not-italic font-serif text-base leading-none">
                &rdquo;
              </span>
            </p>
          </div>
        </div>
      </div>

      <Card className="p-3 sm:p-4 shadow-sm border-border/80">
        <FilterToolbar>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm w-[12rem] shrink-0"
            value={availabilityFilter}
            onChange={(e) => setAvailabilityFilter(e.target.value as "" | "all" | "limited")}
            aria-label="Availability filter"
          >
            <option value="">All Availability</option>
            <option value="all">All school periods</option>
            <option value="limited">Limited availability</option>
          </select>
          <PanelSearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search teacher, email or room…"
            className="min-w-[12rem] flex-1 max-w-md"
          />
          {caps.canCreate && (
            <FilterToolbarActions>
              <Button
                type="button"
                variant="outline"
                className="gap-2 h-10"
                disabled={syncMut.isPending}
                onClick={() => syncMut.mutate()}
              >
                <RefreshCw className={`h-4 w-4 shrink-0 ${syncMut.isPending ? "animate-spin" : ""}`} />
                {syncMut.isPending ? "Syncing…" : "Sync all teachers"}
              </Button>
              <Button className="gap-2 h-10" onClick={openCreate}>
                <Plus className="h-4 w-4" /> Add teacher profile
              </Button>
            </FilterToolbarActions>
          )}
        </FilterToolbar>
      </Card>

      <Card className="overflow-hidden shadow-sm border-border/80">
        <div className="flex items-center justify-between gap-2 border-b bg-white px-4 py-3">
          <div className="flex min-w-0 items-center gap-2 font-display font-semibold text-[#1a2b4b]">
            <Users className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">Session teachers</span>
          </div>
          <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            {profilesFiltered.length}
            {profilesFiltered.length !== profiles.length ? ` of ${profiles.length}` : ""}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="border-b bg-[#eef4fc]">
              <tr>
                <th className={`${thClass} w-12`}>#</th>
                <th className={thClass}>Teacher</th>
                <th className={`${thClass} text-center`}>Max / day</th>
                <th className={`${thClass} text-center`}>Max / week</th>
                <th className={thClass}>Availability</th>
                <th className={thClass}>Preferred rooms</th>
                {hasActions && <th className={`${thClass} text-right`}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={colSpan} className="p-10 text-center text-muted-foreground">
                    Loading teachers…
                  </td>
                </tr>
              )}
              {!isLoading && profilesFiltered.length === 0 && (
                <tr>
                  <td colSpan={colSpan} className="p-10 text-center">
                    <UserCircle className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-2 text-sm font-medium text-slate-600">
                      {profiles.length === 0 ? "No teachers on this session yet" : "No teachers match your filters"}
                    </p>
                    {profiles.length === 0 && caps.canCreate && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Use Sync all teachers to add every active teaching staff account.
                      </p>
                    )}
                  </td>
                </tr>
              )}
              {profilesFiltered.map((p, index) => {
                const limited = isLimited(p);
                const rooms = p.preferredRooms || [];
                return (
                  <tr key={p._id} className="border-b last:border-0 transition-colors hover:bg-slate-50/80">
                    <td className="px-4 py-3 text-xs font-medium text-slate-400">{index + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <TeacherAvatar name={p.user.name} profileImage={p.user.profileImage} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-[#1a2b4b]">{p.user.name}</p>
                          <p className="truncate text-xs text-slate-500">{p.user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex min-w-[2.25rem] justify-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        {p.maxLecturesPerDay}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex min-w-[2.25rem] justify-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        {p.maxLecturesPerWeek}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {limited ? (
                        <div className="space-y-1">
                          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                            Limited
                          </span>
                          <p className="text-xs text-slate-500">{availabilitySummary(p)}</p>
                        </div>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                          All school periods
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {rooms.length ? (
                        <div className="flex max-w-[16rem] flex-wrap gap-1">
                          {rooms.map((room) => (
                            <span
                              key={room._id}
                              className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-600"
                            >
                              {room.code || room.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Class room</span>
                      )}
                    </td>
                    {hasActions && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-0.5">
                          {caps.canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-primary"
                              onClick={() => openEdit(p)}
                              aria-label={`Edit ${p.user.name}`}
                              title="Edit profile"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {caps.canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 hover:bg-destructive/10"
                              onClick={() =>
                                confirm(`Remove ${p.user.name} from this session's teachers?`) && delMut.mutate(p._id)
                              }
                              aria-label={`Remove ${p.user.name}`}
                              title="Remove from session"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
                  <option value="">Select Teaching Staff To Add</option>
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
