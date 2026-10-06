import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ALL_SESSIONS_ID,
  fetchSessions,
  isAllSessions,
  isSessionScopeWritable,
  isSessionWritable,
  type AcademicSession,
} from "@/lib/configApi";

const STORAGE_KEY = "panel:academic-session-id";

type PanelSessionContextValue = {
  sessionId: string;
  setSessionId: (id: string) => void;
  sessions: AcademicSession[];
  isLoading: boolean;
  isAll: boolean;
  selected: AcademicSession | undefined;
  writable: boolean;
  apiSessionId: string | undefined;
  hasScope: boolean;
  allowAllSessions: boolean;
  setAllowAllSessions: (allow: boolean) => void;
  /** Optional portal header search (modules may sync). */
  headerSearch: string;
  setHeaderSearch: (value: string) => void;
};

const PanelSessionContext = createContext<PanelSessionContextValue | null>(null);

function readStoredSessionId(): string {
  try {
    return sessionStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function writeStoredSessionId(id: string) {
  try {
    if (!id) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore quota / private mode */
  }
}

function isValidSelection(sessionId: string, sessions: AcademicSession[]): boolean {
  if (isAllSessions(sessionId)) return true;
  return sessions.some((s) => s._id === sessionId);
}

export function PanelSessionProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionIdState] = useState(readStoredSessionId);
  const [allowAllSessions, setAllowAllSessions] = useState(true);
  const [headerSearch, setHeaderSearch] = useState("");

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: () => fetchSessions(),
  });

  const setSessionId = useCallback((id: string) => {
    setSessionIdState(id);
    writeStoredSessionId(id);
  }, []);

  useEffect(() => {
    if (!sessions.length) return;
    if (sessionId && isValidSelection(sessionId, sessions)) return;

    const pick =
      sessions.find((s) => s.isActive && isSessionWritable(s)) ||
      sessions.find((s) => isSessionWritable(s)) ||
      sessions[0];
    if (pick && pick._id !== sessionId) setSessionId(pick._id);
  }, [sessionId, sessions, setSessionId]);

  useEffect(() => {
    if (!allowAllSessions && isAllSessions(sessionId) && sessions.length) {
      const pick =
        sessions.find((s) => s.isActive && isSessionWritable(s)) ||
        sessions.find((s) => isSessionWritable(s)) ||
        sessions[0];
      if (pick) setSessionId(pick._id);
    }
  }, [allowAllSessions, sessionId, sessions, setSessionId]);

  const value = useMemo(() => {
    const isAll = isAllSessions(sessionId);
    const selected = !isAll ? sessions.find((s) => s._id === sessionId) : undefined;
    const writable = isSessionScopeWritable(sessionId, sessions);
    return {
      sessionId,
      setSessionId,
      sessions,
      isLoading,
      isAll,
      selected,
      writable,
      apiSessionId: isAll || !sessionId ? undefined : sessionId,
      hasScope: Boolean(sessionId),
      allowAllSessions,
      setAllowAllSessions,
      headerSearch,
      setHeaderSearch,
    };
  }, [
    sessionId,
    setSessionId,
    sessions,
    isLoading,
    allowAllSessions,
    headerSearch,
  ]);

  return (
    <PanelSessionContext.Provider value={value}>{children}</PanelSessionContext.Provider>
  );
}

export function usePanelSession(): PanelSessionContextValue {
  const ctx = useContext(PanelSessionContext);
  if (!ctx) {
    throw new Error("usePanelSession must be used within PanelSessionProvider");
  }
  return ctx;
}

/** Safe when provider may be absent (e.g. public pages). */
export function usePanelSessionOptional(): PanelSessionContextValue | null {
  return useContext(PanelSessionContext);
}

export { ALL_SESSIONS_ID };
