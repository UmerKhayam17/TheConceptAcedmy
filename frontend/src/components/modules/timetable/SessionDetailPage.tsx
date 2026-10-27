import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarRange, CheckCircle2, Download, Layers, Users, GraduationCap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { ModuleActionCaps } from "@/lib/permissions";
import {
  completeSession,
  fetchSessionHistory,
  shiftSessionConfiguration,
  sessionStatus,
  type SessionStatus,
} from "@/lib/configApi";
import { systemConfigHref } from "@/lib/systemConfigMenus";
import { studentManagementHref } from "@/lib/studentManagementMenus";
import SessionEnrollmentImportFields, {
  buildSessionImportPayload,
  defaultSessionImportForm,
  type SessionImportFormState,
  validateSessionImportForm,
} from "@/components/modules/timetable/SessionEnrollmentImportFields";

const STATUS_LABEL: Record<SessionStatus, string> = {
  active: "Active",
  completed: "Completed",
  archived: "Archived",
};

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

export default function SessionDetailPage({
  sessionId,
  caps,
}: {
  sessionId: string;
  caps: ModuleActionCaps;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const role = user?.role ?? "admin";
  const [importOpen, setImportOpen] = useState(false);
  const [importForm, setImportForm] = useState<SessionImportFormState>(() => ({
    ...defaultSessionImportForm(),
    enabled: true,
  }));

  const { data: history, isLoading, isError, error } = useQuery({
    queryKey: ["session-history", sessionId],
    queryFn: () => fetchSessionHistory(sessionId),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["academic-sessions"] });
    qc.invalidateQueries({ queryKey: ["session-history", sessionId] });
  };

  const closeMut = useMutation({
    mutationFn: () => completeSession(sessionId),
    onSuccess: () => {
      invalidate();
      toast({
        title: "Session closed",
        description: "This session is now completed and read-only.",
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const importMut = useMutation({
    mutationFn: async () => {
      const importError = validateSessionImportForm(importForm);
      if (importError) throw new Error(importError);
      return shiftSessionConfiguration(sessionId, buildSessionImportPayload(importForm));
    },
    onSuccess: (result) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["academy-classes"] });
      setImportOpen(false);
      setImportForm({ ...defaultSessionImportForm(), enabled: true });
      const e = result.enrollment;
      const skipped = e.skipped?.length ?? 0;
      toast({
        title: "Configuration shifted",
        description: `${e.sections} sections, ${e.feeStructures} fee structures, timetable setup copied.${skipped ? ` ${skipped} class(es) skipped.` : ""}`,
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-12 text-center text-muted-foreground text-sm">
        Loading session summary…
      </div>
    );
  }

  if (isError || !history) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-12 space-y-4 text-center">
        <p className="text-destructive text-sm">{error instanceof Error ? error.message : "Session not found."}</p>
        <Button variant="outline" asChild>
          <Link to={systemConfigHref(role, "academic")}>Back to sessions</Link>
        </Button>
      </div>
    );
  }

  const session = history.session;
  const status = sessionStatus(session);
  const academy = history.academy ?? {
    classCount: 0,
    sectionCount: 0,
    studentCount: 0,
    classes: [],
  };

  const handleClose = () => {
    if (
      !confirm(
        "Close this session? It will be marked completed and draft timetables will be archived.",
      )
    ) {
      return;
    }
    closeMut.mutate();
  };

  const stats = [
    { label: "Classes", value: academy.classCount, icon: GraduationCap },
    { label: "Sections", value: academy.sectionCount, icon: Layers },
    { label: "Students", value: academy.studentCount, icon: Users },
    { label: "Timetable versions", value: history.summary.timetableVersions, icon: CalendarRange },
  ];

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="space-y-2">
          <Button variant="ghost" size="sm" className="gap-1 -ml-2 h-8" asChild>
            <Link to={systemConfigHref(role, "academic")}>
              <ArrowLeft className="h-4 w-4" /> All sessions
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-2xl font-bold text-primary">{session.name}</h2>
            <Badge variant="outline" className="capitalize">
              {STATUS_LABEL[status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {formatDate(session.startDate)} – {formatDate(session.endDate)}
          </p>
        </div>

        {caps.canEdit && (
          <div className="flex flex-wrap gap-2">
            {status === "active" && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                disabled={closeMut.isPending}
                onClick={handleClose}
              >
                <CheckCircle2 className="h-4 w-4" /> Close session
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <s.icon className="h-3.5 w-3.5" />
              {s.label}
            </div>
            <div className="font-display text-2xl font-bold text-primary">{s.value}</div>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-b bg-muted/30">
          <h3 className="font-semibold text-primary">Enrollment structure</h3>
          {caps.canEdit && status === "active" && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => {
                  setImportForm({ ...defaultSessionImportForm(), enabled: true });
                  setImportOpen(true);
                }}
              >
                <Download className="h-4 w-4" /> Shift configuration
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link to={studentManagementHref(role, "classes")}>Manage in Enrollment</Link>
              </Button>
            </div>
          )}
        </div>
        {academy.classes.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              No classes linked to this session yet.
            </p>
            {caps.canEdit && status === "active" && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => {
                  setImportForm({ ...defaultSessionImportForm(), enabled: true });
                  setImportOpen(true);
                }}
              >
                <Download className="h-4 w-4" /> Shift configuration from session
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Class</th>
                  <th className="text-left font-medium px-4 py-2.5">Sections</th>
                  <th className="text-left font-medium px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {academy.classes.map((cls) => (
                  <tr key={cls._id} className="border-t border-border">
                    <td className="px-4 py-2.5 font-medium text-primary">{cls.className}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {cls.sections.length === 0
                        ? "—"
                        : cls.sections.map((sec) => sec.sectionName).join(", ")}
                    </td>
                    <td className="px-4 py-2.5 capitalize text-xs">{cls.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <h3 className="font-semibold text-primary">Timetable summary</h3>
        <dl className="grid sm:grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground text-xs">Schedule slots</dt>
            <dd className="font-medium">{history.summary.scheduleSlots}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Version statuses</dt>
            <dd className="font-medium">
              {Object.keys(history.summary.versionsByStatus || {}).length === 0
                ? "None"
                : Object.entries(history.summary.versionsByStatus)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" · ")}
            </dd>
          </div>
        </dl>
      </Card>

      {history.auditLogs?.length > 0 && (
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold text-primary">Recent activity</h3>
          <ul className="text-sm space-y-2 max-h-48 overflow-y-auto">
            {history.auditLogs.slice(0, 8).map((log) => (
              <li key={log._id} className="flex justify-between gap-2 text-muted-foreground">
                <span>{log.action.replace(/_/g, " ")}</span>
                <span className="text-xs shrink-0">
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
          </ul>
        </Card>
      )}

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Shift configuration from session</DialogTitle>
          </DialogHeader>
          <SessionEnrollmentImportFields
            excludeSessionId={sessionId}
            value={importForm}
            onChange={setImportForm}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => importMut.mutate()} disabled={importMut.isPending}>
              Shift configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
