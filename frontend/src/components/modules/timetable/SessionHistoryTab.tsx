import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Archive, CheckCircle2, Copy, History } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ModuleActionCaps } from "@/lib/permissions";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import FilterToolbar from "@/components/modules/FilterToolbar";
import { usePanelListSearch } from "@/hooks/usePanelListSearch";
import {
  archiveSession,
  cloneSessionStructure,
  completeSession,
  fetchSessionHistory,
  fetchSessions,
  type AcademicSession,
  type SessionStatus,
} from "@/lib/configApi";

const STATUS_LABEL: Record<SessionStatus, string> = {
  active: "Active",
  completed: "Completed",
  archived: "Archived",
};

const STATUS_STYLE: Record<SessionStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-700 border-emerald-300",
  completed: "bg-amber-500/15 text-amber-800 border-amber-300",
  archived: "bg-muted text-muted-foreground border-border",
};

function sessionStatus(s: AcademicSession): SessionStatus {
  return s.status || (s.isActive ? "active" : s.isClosed ? "completed" : "active");
}

export default function SessionHistoryTab({ caps }: { caps: ModuleActionCaps }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneForm, setCloneForm] = useState({
    name: "",
    startDate: "",
    endDate: "",
    activate: true,
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: () => fetchSessions(),
  });

  const { data: history, isLoading } = useQuery({
    queryKey: ["session-history", selectedId],
    queryFn: () => fetchSessionHistory(selectedId),
    enabled: !!selectedId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["academic-sessions"] });
    qc.invalidateQueries({ queryKey: ["session-history", selectedId] });
  };

  const completeMut = useMutation({
    mutationFn: completeSession,
    onSuccess: () => {
      invalidate();
      toast({ title: "Session completed", description: "Timetable drafts archived; data is read-only." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const archiveMut = useMutation({
    mutationFn: archiveSession,
    onSuccess: () => {
      invalidate();
      toast({ title: "Session archived" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const cloneMut = useMutation({
    mutationFn: () => cloneSessionStructure(selectedId, cloneForm),
    onSuccess: (data) => {
      invalidate();
      setCloneOpen(false);
      setSelectedId(data.session._id);
      toast({
        title: "Next session created",
        description: `Configuration shifted to "${data.session.name}".`,
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const selected = sessions.find((s) => s._id === selectedId);
  const status = selected ? sessionStatus(selected) : null;

  const [statusFilter, setStatusFilter] = useState<"" | SessionStatus>("");
  const sessionsByStatus = statusFilter
    ? sessions.filter((s) => sessionStatus(s) === statusFilter)
    : sessions;

  const { search, setSearch, filtered: sessionsFiltered } = usePanelListSearch(sessionsByStatus, (s) => [
    s.name,
    sessionStatus(s),
    s.startDate,
    s.endDate,
  ]);

  return (
    <div className="min-h-full bg-slate-50 px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
              <History className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight">
                Session History
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500 max-w-xl">
                Review past sessions, complete or archive them, and shift the configuration to the next session.
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
            onChange={(e) => setStatusFilter(e.target.value as "" | SessionStatus)}
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
        </FilterToolbar>
      </Card>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-3 space-y-1 max-h-[420px] overflow-y-auto">
          {sessionsFiltered.length === 0 && sessions.length > 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">No sessions match your filters.</p>
          ) : null}
          {sessionsFiltered.map((s) => {
            const st = sessionStatus(s);
            return (
              <button
                key={s._id}
                type="button"
                onClick={() => setSelectedId(s._id)}
                className={`w-full text-left rounded-lg border p-3 transition-colors ${
                  selectedId === s._id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{s.name}</span>
                  <Badge variant="outline" className={STATUS_STYLE[st]}>
                    {STATUS_LABEL[st]}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(s.startDate).toLocaleDateString()} – {new Date(s.endDate).toLocaleDateString()}
                </p>
              </button>
            );
          })}
          {sessions.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground text-center">No sessions yet</p>
          )}
        </Card>

        <Card className="lg:col-span-2 p-4">
          {!selectedId && <div className="min-h-[8rem]" />}
          {selectedId && isLoading && <p className="text-sm text-muted-foreground">Loading history…</p>}
          {selectedId && history && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-primary">{history.session.name}</h3>
                  {status && (
                    <Badge variant="outline" className={`mt-1 ${STATUS_STYLE[status]}`}>
                      {STATUS_LABEL[status]}
                    </Badge>
                  )}
                </div>
                {caps.canEdit && (
                  <div className="flex flex-wrap gap-2">
                    {status === "active" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => confirm("Complete this session? Draft timetables will be archived.") && completeMut.mutate(selectedId)}
                      >
                        <CheckCircle2 className="h-4 w-4" /> Complete
                      </Button>
                    )}
                    {status !== "archived" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => confirm("Archive this session? All data becomes read-only.") && archiveMut.mutate(selectedId)}
                      >
                        <Archive className="h-4 w-4" /> Archive
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className="gap-1"
                      onClick={() => {
                        const nextYear = history.session.name.replace(/\d{4}/g, (y) => String(Number(y) + 1));
                        setCloneForm({
                          name: nextYear.includes("–") ? nextYear : `${nextYear} (new)`,
                          startDate: "",
                          endDate: "",
                          activate: true,
                        });
                        setCloneOpen(true);
                      }}
                    >
                      <Copy className="h-4 w-4" /> Shift to next session
                    </Button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                {[
                  ["Classes", history.summary.classCount],
                  ["Sections", history.summary.sectionCount],
                  ["Students", history.summary.studentCount],
                  ["Timetable versions", history.summary.timetableVersions],
                ].map(([label, val]) => (
                  <div key={label} className="rounded-md border p-2 bg-muted/30">
                    <div className="text-lg font-semibold">{val}</div>
                    <div className="text-xs text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2">Timetable versions</h4>
                {history.timetableVersions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No timetable versions</p>
                ) : (
                  <div className="max-h-40 overflow-y-auto border rounded-md">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="text-left p-2">Class</th>
                          <th className="text-left p-2">Section</th>
                          <th className="text-left p-2">Ver</th>
                          <th className="text-left p-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.timetableVersions.map((v) => (
                          <tr key={v._id} className="border-t">
                            <td className="p-2">{v.class?.name}</td>
                            <td className="p-2">{v.section?.name}</td>
                            <td className="p-2">v{v.version}</td>
                            <td className="p-2 capitalize">{v.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2">Audit log</h4>
                <ul className="text-xs space-y-2 max-h-48 overflow-y-auto border rounded-md p-2">
                  {history.auditLogs.map((log) => (
                    <li key={log._id} className="border-b border-border/50 pb-2 last:border-0">
                      <span className="font-mono text-primary">{log.action}</span>
                      <span className="text-muted-foreground"> · {log.user?.name || "System"}</span>
                      <br />
                      <span className="text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true,
                        })}
                      </span>
                    </li>
                  ))}
                  {history.auditLogs.length === 0 && (
                    <li className="text-muted-foreground">No audit entries yet</li>
                  )}
                </ul>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Dialog open={cloneOpen} onOpenChange={setCloneOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Shift configuration to new session</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>New session name</Label>
              <Input value={cloneForm.name} onChange={(e) => setCloneForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Start date</Label>
                <Input type="date" value={cloneForm.startDate} onChange={(e) => setCloneForm((f) => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div>
                <Label>End date</Label>
                <Input type="date" value={cloneForm.endDate} onChange={(e) => setCloneForm((f) => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              The new session becomes the active session. The current active session is closed and becomes
              read-only. Only one session can be active at a time.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloneOpen(false)}>Cancel</Button>
            <Button
              disabled={!cloneForm.name || !cloneForm.startDate || !cloneForm.endDate || cloneMut.isPending}
              onClick={() => cloneMut.mutate()}
            >
              Shift configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
