import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatPkr } from "@/lib/financeDashboardData";
import { fetchOpeningBalance } from "@/lib/studentManagementApi";
import { CalendarRange, CheckCircle2, Eye, Plus } from "lucide-react";
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
import FilterToolbar, { FilterToolbarActions } from "@/components/modules/FilterToolbar";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import { matchesPanelSearch } from "@/lib/panelSearch";
import SessionOpeningBalanceButton from "@/components/modules/timetable/SessionOpeningBalanceButton";
import SessionEnrollmentImportFields, {
  buildSessionImportPayload,
  defaultSessionImportForm,
  type SessionImportFormState,
  validateSessionImportForm,
} from "@/components/modules/timetable/SessionEnrollmentImportFields";

function SessionOpeningAmount({ sessionId }: { sessionId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["finance-opening-balance", sessionId],
    queryFn: () => fetchOpeningBalance(sessionId),
  });
  if (isLoading) return <span className="text-muted-foreground">…</span>;
  if (!data) return <span className="text-muted-foreground">—</span>;
  return <span className="font-medium tabular-nums">{formatPkr(data.amount)}</span>;
}

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
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "completed" | "archived">("");

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: () => fetchSessions(),
  });

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      const status = sessionStatus(s);
      if (statusFilter && status !== statusFilter) return false;
      if (!search.trim()) return true;
      return matchesPanelSearch(search, s.name, status, s.isActive ? "active" : "inactive");
    });
  }, [sessions, search, statusFilter]);

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
    <div className="min-h-full bg-slate-50 px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
              <CalendarRange className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight">
                Academic Sessions
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500 max-w-xl">
                Create sessions, set their dates, and edit the opening balance for each session.
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
            onChange={(e) => setStatusFilter(e.target.value as "" | "active" | "completed" | "archived")}
            aria-label="Status filter"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
          <PanelSearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search sessions…"
            className="min-w-[12rem] flex-1 max-w-md"
          />
          {caps.canCreate && (
            <FilterToolbarActions>
              <Button
                className="gap-2 h-10"
                onClick={() => {
                  setForm({ name: "", startDate: "", endDate: "" });
                  setImportForm(defaultSessionImportForm());
                  setOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> New session
              </Button>
            </FilterToolbarActions>
          )}
        </FilterToolbar>
      </Card>

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
                  <th className="text-left font-medium px-4 py-2.5">Opening balance</th>
                  <th className="text-right font-medium px-4 py-2.5">Actions</th>
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
                        <SessionOpeningAmount sessionId={s._id} />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                            asChild
                            aria-label="View session"
                          >
                            <Link to={sessionDetailHref(role, s._id)}>
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                          {caps.canEdit && status === "active" && <SessionOpeningBalanceButton session={s} iconOnly />}
                          {caps.canEdit && status === "active" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="Close session"
                              title="Close session"
                              disabled={actionPending}
                              onClick={() => handleClose(s._id)}
                            >
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
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
