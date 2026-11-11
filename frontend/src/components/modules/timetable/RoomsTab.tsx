import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DoorOpen, Plus, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ModuleActionCaps } from "@/lib/permissions";
import { fetchClasses, classDisplayName } from "@/lib/configApi";
import { createRoom, deleteRoom, fetchRooms, updateRoom, type Room } from "@/lib/timetableApi";
import FilterToolbar, { FilterToolbarActions } from "@/components/modules/FilterToolbar";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import { usePanelListSearch } from "@/hooks/usePanelListSearch";

const ROOM_TYPES = [
  { value: "classroom", label: "Classroom" },
  { value: "lab", label: "Lab" },
  { value: "hall", label: "Hall" },
  { value: "computer", label: "Computer Lab" },
] as const;

const QK = (sid: string) => ["timetable-rooms", sid] as const;

function assignedClassId(room: Room): string {
  if (!room.assignedClass) return "";
  return typeof room.assignedClass === "string" ? room.assignedClass : room.assignedClass._id;
}

function assignedClassLabel(room: Room): string {
  if (!room.assignedClass || typeof room.assignedClass === "string") return "—";
  return classDisplayName(room.assignedClass) || "—";
}

export default function RoomsTab({ sessionId, caps }: { sessionId: string; caps: ModuleActionCaps }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Room | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [form, setForm] = useState({
    name: "",
    code: "",
    capacity: 35,
    type: "classroom",
    assignedClass: "",
  });

  const { data: rooms = [], isLoading } = useQuery({
    queryKey: QK(sessionId),
    queryFn: () => fetchRooms(sessionId),
    enabled: !!sessionId,
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["config-classes", sessionId],
    queryFn: () => fetchClasses(sessionId),
    enabled: !!sessionId,
  });

  const assignedClassIds = new Set(
    rooms
      .filter((r) => !edit || r._id !== edit._id)
      .map((r) => assignedClassId(r))
      .filter(Boolean),
  );

  const roomsByType = typeFilter ? rooms.filter((r) => r.type === typeFilter) : rooms;

  const { search, setSearch, filtered: roomsFiltered } = usePanelListSearch(roomsByType, (r) => [
    r.code,
    r.name,
    r.type,
    r.capacity,
    assignedClassLabel(r),
  ]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name,
        code: form.code,
        capacity: form.capacity,
        type: form.type,
        assignedClass: form.assignedClass || null,
      };
      if (edit) return updateRoom(edit._id, body);
      return createRoom({ session: sessionId, ...body });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK(sessionId) });
      setOpen(false);
      toast({ title: edit ? "Room updated" : "Room created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const delMut = useMutation({
    mutationFn: deleteRoom,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK(sessionId) });
      toast({ title: "Room deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (!sessionId) {
    return null;
  }

  return (
    <div className="min-h-full bg-slate-50 px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
              <DoorOpen className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight">
                Rooms
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500 max-w-xl">
                Assign each room to at most one class. A class can only use its own room on the timetable.
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
            className="h-10 rounded-md border border-input bg-background px-3 text-sm w-[10rem] shrink-0"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Room type filter"
          >
            <option value="">All Types</option>
            {ROOM_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
          <PanelSearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search code, name, class…"
            className="min-w-[12rem] flex-1 max-w-md"
          />
          {caps.canCreate && (
            <FilterToolbarActions>
              <Button
                className="h-10 gap-2"
                onClick={() => {
                  setEdit(null);
                  setForm({ name: "", code: "", capacity: 35, type: "classroom", assignedClass: "" });
                  setOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> Add room
              </Button>
            </FilterToolbarActions>
          )}
        </FilterToolbar>
      </Card>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left p-3">Code</th>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Type</th>
              <th className="text-left p-3">Assigned class</th>
              <th className="text-left p-3">Capacity</th>
              {(caps.canEdit || caps.canDelete) && <th className="text-right p-3">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && roomsFiltered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  {rooms.length === 0 ? "No rooms" : "No rooms match your filters."}
                </td>
              </tr>
            )}
            {roomsFiltered.map((r) => (
              <tr key={r._id} className="border-b last:border-0">
                <td className="p-3 font-mono text-xs">{r.code}</td>
                <td className="p-3 font-medium">{r.name}</td>
                <td className="p-3 capitalize">{r.type}</td>
                <td className="p-3">{assignedClassLabel(r)}</td>
                <td className="p-3">{r.capacity}</td>
                {(caps.canEdit || caps.canDelete) && (
                  <td className="p-3 text-right space-x-1">
                    {caps.canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEdit(r);
                          setForm({
                            name: r.name,
                            code: r.code,
                            capacity: r.capacity,
                            type: r.type,
                            assignedClass: assignedClassId(r),
                          });
                          setOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {caps.canDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => confirm("Delete room?") && delMut.mutate(r._id)}
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit ? "Edit room" : "New room"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Code</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              />
            </div>
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>Type</Label>
              <select
                className="w-full h-10 rounded-md border px-3 text-sm"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              >
                {ROOM_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Assigned class</Label>
              <select
                className="w-full h-10 rounded-md border px-3 text-sm"
                value={form.assignedClass}
                onChange={(e) => setForm((f) => ({ ...f, assignedClass: e.target.value }))}
              >
                <option value="">Not Assigned</option>
                {classes.map((c) => {
                  const taken = assignedClassIds.has(c._id) && form.assignedClass !== c._id;
                  return (
                    <option key={c._id} value={c._id} disabled={taken}>
                      {classDisplayName(c)}
                      {taken ? " (already has a room)" : ""}
                    </option>
                  );
                })}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                One class per room. Shared halls can stay unassigned.
              </p>
            </div>
            <div>
              <Label>Capacity</Label>
              <Input
                type="number"
                value={form.capacity}
                onChange={(e) => setForm((f) => ({ ...f, capacity: Number(e.target.value) }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!form.name || !form.code || saveMut.isPending} onClick={() => saveMut.mutate()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
