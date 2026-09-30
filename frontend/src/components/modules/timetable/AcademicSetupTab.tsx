import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, Eye, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { ModuleActionCaps } from "@/lib/permissions";
import {
  completeSession,
  createSession,
  fetchSessions,
  shiftSessionConfiguration,
  sessionStatus,
  type AcademicSession,
} from "@/lib/configApi";
import { sessionDetailHref } from "@/lib/systemConfigMenus";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import { matchesPanelSearch } from "@/lib/panelSearch";
import SessionEnrollmentImportFields, {
  buildSessionImportPayload,
  defaultSessionImportForm,
  type SessionImportFormState,
  validateSessionImportForm,
} from "@/components/modules/timetable/SessionEnrollmentImportFields";

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return value;
  }
}

export default function AcademicSetupTab({
  sessionId,
  caps,
  onSessionCreated,
}: {
  sessionId: string;
  caps: ModuleActionCaps;
  onSessionCreated?: (id: string) => void;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const role = user?.role ?? "admin";
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", startDate: "", endDate: "" });
  const [importForm, setImportForm] = useState<SessionImportFormState>(defaultSessionImportForm);
  const [search, setSearch] = useState("");

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: () => fetchSessions(),
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return sessions;
    return sessions.filter((s) =>
      matchesPanelSearch(search, s.name, sessionStatus(s), s.isActive ? "active" : "inactive"),
    );
  }, [sessions, search]);

  const selected = sessions.find((s) => s._id === sessionId);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["academic-sessions"] });
    qc.invalidateQueries({ queryKey: ["session-history"] });
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const importError = validateSessionImportForm(importForm);
      if (importError) throw new Error(importError);

      const session = await createSession({
        name: form.name,
        startDate: form.startDate,
        endDate: form.endDate,
        isActive: true,
      });

      if (importForm.enabled && importForm.sourceSessionId && session._id) {
        try {
          const shiftResult = await shiftSessionConfiguration(
            session._id,
            buildSessionImportPayload(importForm),
          );
          return { session, shiftResult };
        } catch (shiftErr) {
          const shiftMessage = shiftErr instanceof Error ? shiftErr.message : "Shift failed";
          const err = new Error(
            `Session "${form.name}" was created, but shifting configuration failed: ${shiftMessage}. Open the session and use Shift configuration to retry.`,
          ) as Error & { sessionId?: string };
          err.sessionId = session._id;
          throw err;
        }
      }
      return { session, shiftResult: null };
    },
    onSuccess: ({ session, shiftResult }) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["academy-classes"] });
      if (session?._id) onSessionCreated?.(session._id);
      setOpen(false);
      setForm({ name: "", startDate: "", endDate: "" });
      setImportForm(defaultSessionImportForm());
      if (shiftResult) {
        const e = shiftResult.enrollment;
        const skipped = e.skipped?.length ?? 0;
        toast({
          title: "Session created & configuration shifted",
          description: `${e.sections} sections, ${e.feeStructures} fee structures, timetable setup copied.${skipped ? ` ${skipped} class(es) skipped.` : ""}`,
        });
      } else {
        toast({ title: "Session created", description: "Add classes and subjects from Student Management." });
      }
    },
    onError: (e: Error & { sessionId?: string }) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["academy-classes"] });
      if (e.sessionId) onSessionCreated?.(e.sessionId);
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const closeMut = useMutation({
    mutationFn: completeSession,
    onSuccess: () => {
      invalidate();
      toast({ title: "Session closed" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleClose = (id: string) => {
    if (!confirm("Close this session? It will be marked completed.")) return;
    closeMut.mutate(id);
  };

  const actionPending = closeMut.isPending;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <PanelSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search sessions…"
          className="max-w-md"
        />
        {caps.canCreate && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setForm({ name: "", startDate: "", endDate: "" });
              setImportForm(defaultSessionImportForm());
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> New session
          </Button>
        )}
      </div>

      {selected && (
        <Card className="p-4 border-accent/30 bg-accent/5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-semibold text-primary">{selected.name}</div>
              <div className="text-sm text-muted-foreground mt-1">
                {formatDate(selected.startDate)} – {formatDate(selected.endDate)}
                {" · "}
                <span className="capitalize">{sessionStatus(selected)}</span>
              </div>
            </div>
            <Button size="sm" variant="outline" className="gap-1" asChild>
              <Link to={sessionDetailHref(role, selected._id)}>
                <Eye className="h-4 w-4" /> View detail
              </Link>
            </Button>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30 font-display font-semibold text-primary">
          All sessions ({filtered.length}{search.trim() ? ` of ${sessions.length}` : ""})
        </div>
        {isLoading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Loading sessions…</p>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {sessions.length === 0 ? "No sessions yet." : "No sessions match your search."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Session</th>
                  <th className="text-left font-medium px-4 py-2.5">Period</th>
                  <th className="text-left font-medium px-4 py-2.5">Status</th>
                  <th className="text-right font-medium px-4 py-2.5 min-w-[12rem]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s: AcademicSession) => {
                  const status = sessionStatus(s);
                  const isSelected = s._id === sessionId;
                  return (
                    <tr
                      key={s._id}
                      className={`border-t border-border ${isSelected ? "bg-accent/5" : "hover:bg-muted/20"}`}
                    >
                      <td className="px-4 py-2.5">
                        <Link
                          to={sessionDetailHref(role, s._id)}
                          className="flex items-center gap-2 font-medium text-primary hover:text-accent"
                        >
                          <CalendarRange className="h-4 w-4 text-accent shrink-0" />
                          {s.name}
                          {isSelected && (
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-accent">
                              Selected
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {formatDate(s.startDate)} – {formatDate(s.endDate)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`text-xs font-semibold rounded-full px-2 py-0.5 capitalize ${
                            status === "active"
                              ? "bg-accent/15 text-accent"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" asChild>
                            <Link to={sessionDetailHref(role, s._id)}>
                              <Eye className="h-3.5 w-3.5" /> Detail
                            </Link>
                          </Button>
                          {caps.canEdit && status === "active" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              disabled={actionPending}
                              onClick={() => handleClose(s._id)}
                            >
                              Close
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New academic session</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="2026–2027"
              />
            </div>
            <div>
              <Label>Start date</Label>
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </div>
            <div>
              <Label>End date</Label>
              <Input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </div>
            {caps.canCreate && (
              <SessionEnrollmentImportFields value={importForm} onChange={setImportForm} />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              Create session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
