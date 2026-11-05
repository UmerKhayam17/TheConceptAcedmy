import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  ALL_SESSIONS_ID,
  activateSession,
  canActivateSession,
  fetchSessions,
  isAllSessions,
  isSessionScopeWritable,
  isSessionWritable,
  sessionStatus,
  type AcademicSession,
  type SessionStatus,
} from "@/lib/configApi";

const STATUS_SUFFIX: Record<SessionStatus, string> = {
  active: " (active)",
  completed: " (completed)",
  archived: " (archived)",
};

function isValidSessionSelection(sessionId: string, sessions: AcademicSession[]): boolean {
  if (isAllSessions(sessionId)) return true;
  return sessions.some((s) => s._id === sessionId);
}

/**
 * Defaults to the active session on first load / refresh.
 * Allows browsing past sessions or “All sessions” until the next refresh
 * (selection is in-memory only — not persisted).
 */
export function useActiveSessionId(
  sessionId: string,
  setSessionId: (id: string) => void
): string {
  const { data: sessions = [] } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: () => fetchSessions(),
  });

  useEffect(() => {
    if (!sessions.length) return;

    if (sessionId && isValidSessionSelection(sessionId, sessions)) return;

    const pick =
      sessions.find((s) => s.isActive && isSessionWritable(s)) ||
      sessions.find((s) => isSessionWritable(s)) ||
      sessions[0];
    if (pick && pick._id !== sessionId) setSessionId(pick._id);
  }, [sessionId, sessions, setSessionId]);

  return sessionId;
}

/** Shared scope flags for modules that respect the session bar. */
export function useSessionScope(sessionId: string) {
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: () => fetchSessions(),
  });

  return useMemo(() => {
    const isAll = isAllSessions(sessionId);
    const selected = !isAll ? sessions.find((s) => s._id === sessionId) : undefined;
    const writable = isSessionScopeWritable(sessionId, sessions);
    return {
      sessions,
      isLoading,
      isAll,
      selected,
      writable,
      /** Pass to list APIs: undefined means all sessions. */
      apiSessionId: isAll || !sessionId ? undefined : sessionId,
      /** True when a concrete session or all-sessions is selected. */
      hasScope: Boolean(sessionId),
    };
  }, [sessionId, sessions, isLoading]);
}

export default function SessionBar({
  sessionId,
  onSessionChange,
  extra,
  allowAllSessions = true,
}: {
  sessionId: string;
  onSessionChange: (id: string) => void;
  extra?: React.ReactNode;
  /** When false, hide the “All sessions” option (e.g. session detail pages). */
  allowAllSessions?: boolean;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: () => fetchSessions(),
  });

  const selected = !isAllSessions(sessionId) ? sessions.find((s) => s._id === sessionId) : undefined;
  const selectedWritable = selected ? isSessionWritable(selected) : false;
  const browsingPastOrAll =
    Boolean(sessionId) && (isAllSessions(sessionId) || (selected && !selectedWritable));

  const activateMut = useMutation({
    mutationFn: () => activateSession(sessionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academic-sessions"] });
      toast({ title: "Session is now active", description: "You can add classes and timetable data." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="border-b bg-muted/30">
      <div className="px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-end gap-4">
        <div className="min-w-[220px]">
          <Label className="text-xs text-muted-foreground">Academic session</Label>
          <select
            className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={sessionId}
            onChange={(e) => onSessionChange(e.target.value)}
            disabled={isLoading}
          >
            <option value="">{isLoading ? "Loading…" : "Select session"}</option>
            {allowAllSessions && (
              <option value={ALL_SESSIONS_ID}>All Sessions</option>
            )}
            {sessions.map((s: AcademicSession) => {
              const st = sessionStatus(s);
              return (
                <option key={s._id} value={s._id}>
                  {s.name}
                  {STATUS_SUFFIX[st]}
                </option>
              );
            })}
          </select>
        </div>

        {sessionId && selected && canActivateSession(selected) && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={activateMut.isPending}
            onClick={() => activateMut.mutate()}
          >
            Set as active session
          </Button>
        )}

        {extra}
      </div>

      {browsingPastOrAll && (
        <div className="px-4 sm:px-6 lg:px-8 pb-3">
          <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2">
            {isAllSessions(sessionId)
              ? "Viewing all sessions — search and browse only. Create and edit stay on the active session. Refresh returns to the active session."
              : `Viewing ${selected?.name ?? "past session"} (read-only). Completed sessions cannot be reactivated — create a new session instead. Refresh returns to the active session.`}
          </p>
        </div>
      )}
    </div>
  );
}
