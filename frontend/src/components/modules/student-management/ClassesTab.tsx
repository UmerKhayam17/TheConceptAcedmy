import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { classDetailHref } from "@/lib/studentManagementMenus";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { GraduationCap, Plus, Pencil, Trash2 } from "lucide-react";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import FilterToolbar, { FilterToolbarActions } from "@/components/modules/FilterToolbar";
import { useToast } from "@/hooks/use-toast";
import type { ModuleActionCaps } from "@/lib/permissions";
import {
  createAcademyClass, deleteAcademyClass, fetchAcademyClasses, updateAcademyClass, type AcademyClass,
} from "@/lib/studentManagementApi";
import { useSessionScope } from "@/components/modules/timetable/SessionBar";
import { sessionLabelFromAcademyClass } from "./studentDisplayUtils";

const QK = ["academy-classes"] as const;

export default function ClassesTab({ caps, sessionId }: { caps: ModuleActionCaps; sessionId: string }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const role = user?.role ?? "admin";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive">("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<AcademyClass | null>(null);
  const [form, setForm] = useState({ className: "", status: "active" as "active" | "inactive" });
  const { apiSessionId, writable, isAll, hasScope } = useSessionScope(sessionId);
  const showSessionCol = isAll || !writable;

  const { data: classes = [], isLoading } = useQuery({
    queryKey: [...QK, sessionId, search],
    queryFn: () => fetchAcademyClasses({ sessionId: apiSessionId, search: search || undefined }),
    enabled: hasScope,
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!writable || !apiSessionId) throw new Error("Switch to the active academic session to make changes.");
      if (edit) return updateAcademyClass(edit._id, form);
      return createAcademyClass({ ...form, sessionId: apiSessionId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      setOpen(false);
      setEdit(null);
      toast({ title: edit ? "Class updated" : "Class created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteAcademyClass(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      toast({ title: "Class deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openCreate = () => {
    if (!writable || !apiSessionId) {
      toast({
        title: "Active session required",
        description: "Switch to the active academic session to add classes.",
        variant: "destructive",
      });
      return;
    }
    setEdit(null);
    setForm({ className: "", status: "active" });
    setOpen(true);
  };

  const openEdit = (c: AcademyClass) => {
    if (!writable) {
      toast({
        title: "Read-only session",
        description: "Switch to the active academic session to edit.",
        variant: "destructive",
      });
      return;
    }
    setEdit(c);
    setForm({ className: c.className, status: c.status });
    setOpen(true);
  };

  const colSpan = 3 + (showSessionCol ? 1 : 0) + ((writable && (caps.canEdit || caps.canDelete)) ? 1 : 0);
  const visibleClasses = statusFilter ? classes.filter((c) => c.status === statusFilter) : classes;

  return (
    <div className="min-h-full bg-slate-50 px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
              <GraduationCap className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight">
                Classes
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500 max-w-xl">
                Add and manage the classes of the session. Open a class to see its sections, subjects and fees.
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
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | "active" | "inactive")}
            aria-label="Status filter"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <PanelSearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search classes…"
            className="min-w-[12rem] flex-1 max-w-md"
          />
          {caps.canCreate && writable && (
            <FilterToolbarActions>
              <Button onClick={openCreate} className="gap-2 h-10" disabled={!hasScope}>
                <Plus className="h-4 w-4" /> Add Class
              </Button>
            </FilterToolbarActions>
          )}
        </FilterToolbar>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left p-3 font-medium">Class</th>
                {showSessionCol && <th className="text-left p-3 font-medium">Session</th>}
                <th className="text-left p-3 font-medium">Subjects</th>
                <th className="text-left p-3 font-medium">Status</th>
                {writable && (caps.canEdit || caps.canDelete) && (
                  <th className="text-right p-3 font-medium">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={colSpan} className="p-8 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {!isLoading && !hasScope && (
                <tr><td colSpan={colSpan} className="p-8 text-center text-muted-foreground">—</td></tr>
              )}
              {!isLoading && hasScope && visibleClasses.length === 0 && (
                <tr>
                  <td colSpan={colSpan} className="p-8 text-center text-muted-foreground">
                    {classes.length > 0
                      ? "No classes match your filters"
                      : isAll
                        ? "No classes found"
                        : "No classes for this session yet"}
                  </td>
                </tr>
              )}
              {visibleClasses.map((c) => (
                <tr
                  key={c._id}
                  className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                  onClick={() => navigate(classDetailHref(role, c._id))}
                >
                  <td className="p-3 font-medium text-primary">
                    {c.className}
                  </td>
                  {showSessionCol && (
                    <td className="p-3 text-muted-foreground text-xs">
                      {sessionLabelFromAcademyClass(c) || "—"}
                    </td>
                  )}
                  <td className="p-3">{c.totalSubjects}</td>
                  <td className="p-3">
                    <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${
                      c.status === "active" ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground"
                    }`}>{c.status}</span>
                  </td>
                  {writable && (caps.canEdit || caps.canDelete) && (
                    <td className="p-3 text-right space-x-1">
                      {caps.canEdit && (
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEdit(c); }} aria-label="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {caps.canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete class "${c.className}"?`)) delMut.mutate(c._id);
                          }}
                          aria-label="Delete"
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
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit ? "Edit Class" : "New Class"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Class name</Label>
              <Input value={form.className} onChange={(e) => setForm((f) => ({ ...f, className: e.target.value }))} placeholder="e.g. 9th" required />
            </div>
            <div>
              <Label>Status</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as "active" | "inactive" }))}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!form.className.trim() || saveMut.isPending} onClick={() => saveMut.mutate()}>
              {saveMut.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
