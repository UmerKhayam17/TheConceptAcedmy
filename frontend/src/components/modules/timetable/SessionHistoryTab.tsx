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

  const { search, setSearch, filtered: sessionsFiltered } = usePanelListSearch(sessions, (s) => [
    s.name,
    sessionStatus(s),
    s.startDate,
    s.endDate,
  ]);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex items-start gap-3">
        <History className="h-8 w-8 text-primary shrink-0 mt-1" />
        <div>
          <h2 className="font-semibold text-lg text-primary">Session history</h2>
        </div>
      </div>

      <PanelSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search sessions by name or status…"
        className="max-w-md"
      />

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-3 space-y-1 max-h-[420px] overflow-y-auto">
          {sessionsFiltered.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              {sessions.length === 0 ? "No sessions yet." : "No sessions match your search."}
            </p>
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
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={cloneForm.activate}
                onChange={(e) => setCloneForm((f) => ({ ...f, activate: e.target.checked }))}
              />
              Set as active session
            </label>
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
