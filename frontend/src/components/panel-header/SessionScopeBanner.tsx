import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  activateSession,
  canActivateSession,
  isAllSessions,
  isSessionWritable,
} from "@/lib/configApi";
import { usePanelSession } from "./PanelSessionContext";

/** Read-only / all-sessions warning + optional “Set as active” under the portal header. */
export default function SessionScopeBanner() {
  const { sessionId, selected } = usePanelSession();
  const { toast } = useToast();
  const qc = useQueryClient();

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

  if (!browsingPastOrAll && !(selected && canActivateSession(selected))) return null;

  return (
    <div className="border-b bg-muted/20 px-4 py-2.5 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center gap-3">
        {browsingPastOrAll && (
          <p className="flex-1 rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            {isAllSessions(sessionId)
              ? "Viewing all sessions — search and browse only. Create and edit stay on the active session."
              : `Viewing ${selected?.name ?? "past session"} (read-only). Completed sessions cannot be reactivated — create a new session instead.`}
          </p>
        )}
        {selected && canActivateSession(selected) && (
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
      </div>
    </div>
  );
}
