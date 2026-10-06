import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ALL_SESSIONS_ID,
  fetchSessions,
  isAllSessions,
  sessionStatus,
  type AcademicSession,
  type SessionStatus,
} from "@/lib/configApi";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<SessionStatus, string> = {
  active: "Active",
  completed: "Completed",
  archived: "Archived",
};

const DOT_CLASS: Record<SessionStatus | "all" | "none", string> = {
  active: "bg-[#16A66A]",
  completed: "bg-slate-400",
  archived: "bg-slate-300",
  all: "bg-sky-500",
  none: "bg-slate-300",
};

function sessionTitle(session: AcademicSession | undefined, sessionId: string): string {
  if (isAllSessions(sessionId)) return "All sessions";
  if (!session) return "Select session";
  const st = sessionStatus(session);
  return `${session.name} (${STATUS_LABEL[st]})`;
}

export default function AcademicSessionHeaderSelector({
  sessionId,
  onSessionChange,
  allowAllSessions = true,
  className,
}: {
  sessionId: string;
  onSessionChange: (id: string) => void;
  allowAllSessions?: boolean;
  className?: string;
}) {
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: () => fetchSessions(),
  });

  const selected = useMemo(
    () => (!isAllSessions(sessionId) ? sessions.find((s) => s._id === sessionId) : undefined),
    [sessionId, sessions],
  );

  const statusKey: SessionStatus | "all" | "none" = isAllSessions(sessionId)
    ? "all"
    : selected
      ? sessionStatus(selected)
      : "none";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={isLoading}
          aria-label="Select academic year"
          className={cn(
            "flex h-11 w-[148px] shrink-0 items-center gap-2 rounded-lg border border-[#DCE4EF] bg-white px-2.5 text-left",
            "transition-all duration-150 ease-out hover:border-[#B8C7DC] hover:bg-[#F8FBFF]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1769E0]/30",
            "disabled:cursor-wait disabled:opacity-70",
            className,
          )}
        >
          <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT_CLASS[statusKey])} aria-hidden />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[12px] font-semibold text-[#10244A]">
              {isLoading ? "Loading…" : sessionTitle(selected, sessionId)}
            </span>
            <span className="block text-[10px] text-slate-400">Academic Year</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="cms-portal w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Academic sessions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {allowAllSessions && (
          <DropdownMenuItem
            className="cursor-pointer text-sm"
            onSelect={() => onSessionChange(ALL_SESSIONS_ID)}
          >
            All sessions
          </DropdownMenuItem>
        )}
        {sessions.map((s) => {
          const st = sessionStatus(s);
          return (
            <DropdownMenuItem
              key={s._id}
              className="cursor-pointer text-sm"
              onSelect={() => onSessionChange(s._id)}
            >
              <span className={cn("mr-2 h-2 w-2 rounded-full", DOT_CLASS[st])} aria-hidden />
              {s.name}
              <span className="ml-auto text-[10px] text-muted-foreground">{STATUS_LABEL[st]}</span>
            </DropdownMenuItem>
          );
        })}
        {!isLoading && sessions.length === 0 && (
          <DropdownMenuItem disabled>No sessions found</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
