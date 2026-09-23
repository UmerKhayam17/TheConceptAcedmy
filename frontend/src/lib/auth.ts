import { getApiRoot, parseJson } from "@/lib/api";

export type Role = "admin" | "accountant" | "teacher" | "parent" | "student";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  modulePermissions?: Record<string, string[]>;
}

const USER_KEY = "tces_user";
const ACCESS_KEY = "tces_access";
const REFRESH_LOCK_KEY = "tces_refresh_lock";

const AUTH_EVT = "tces-auth-change";
const REFRESH_BUFFER_MS = 60_000;

const authChannel =
  typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("tces-auth") : null;

function dispatch() {
  window.dispatchEvent(new Event(AUTH_EVT));
}

export function getAccessToken(): string | null {
  try {
    const saved = localStorage.getItem(ACCESS_KEY);
    if (saved) return saved;
    const legacy = sessionStorage.getItem(ACCESS_KEY);
    if (legacy) {
      localStorage.setItem(ACCESS_KEY, legacy);
      sessionStorage.removeItem(ACCESS_KEY);
      return legacy;
    }
    return null;
  } catch {
    return null;
  }
}

function setAccessToken(token: string | null) {
  try {
    if (token) localStorage.setItem(ACCESS_KEY, token);
    else localStorage.removeItem(ACCESS_KEY);
    sessionStorage.removeItem(ACCESS_KEY);
  } catch {
    /* ignore */
  }
}

function readStoredUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const u = JSON.parse(raw) as SessionUser;
    if (!u?.id || !u?.email || !u?.role) return null;
    return u;
  } catch {
    return null;
  }
}

function persistUser(user: SessionUser) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearStorage() {
  localStorage.removeItem(USER_KEY);
  setAccessToken(null);
  stopProactiveRefresh();
}

/** Clear session and notify listeners (route guards redirect to login). */
export function invalidateSession() {
  clearStorage();
  authChannel?.postMessage({ type: "logout" });
  dispatch();
}

export function normalizeRole(role: string | undefined): Role | null {
  const r = String(role || "").toLowerCase();
  if (r === "admin" || r === "accountant" || r === "teacher" || r === "parent" || r === "student") return r;
  return null;
}

export function getSession(): SessionUser | null {
  return readStoredUser();
}

function decodeTokenExpiryMs(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function isAccessTokenExpiringSoon(token: string | null, bufferMs = REFRESH_BUFFER_MS): boolean {
  if (!token) return true;
  const exp = decodeTokenExpiryMs(token);
  if (!exp) return true;
  return Date.now() >= exp - bufferMs;
}

let proactiveRefreshTimer: ReturnType<typeof setTimeout> | null = null;

function stopProactiveRefresh() {
  if (proactiveRefreshTimer) {
    clearTimeout(proactiveRefreshTimer);
    proactiveRefreshTimer = null;
  }
}

function scheduleProactiveRefresh(_token: string) {
  // Disabled: do not auto-refresh on a timer (avoids surprise logout/reload cycles).
  stopProactiveRefresh();
}

function broadcastToken(token: string) {
  authChannel?.postMessage({ type: "token", accessToken: token });
}

if (authChannel) {
  authChannel.onmessage = (event) => {
    const data = event.data as { type?: string; accessToken?: string };
    if (data?.type === "token" && data.accessToken) {
      setAccessToken(data.accessToken);
      scheduleProactiveRefresh(data.accessToken);
      dispatch();
    }
    if (data?.type === "logout") {
      clearStorage();
      dispatch();
    }
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tryAcquireRefreshLock(): boolean {
  try {
    const now = Date.now();
    const raw = localStorage.getItem(REFRESH_LOCK_KEY);
    if (raw) {
      const lock = JSON.parse(raw) as { ts?: number };
      if (lock.ts && now - lock.ts < 15_000) return false;
    }
    localStorage.setItem(REFRESH_LOCK_KEY, JSON.stringify({ ts: now }));
    return true;
  } catch {
    return true;
  }
}

function releaseRefreshLock() {
  try {
    localStorage.removeItem(REFRESH_LOCK_KEY);
  } catch {
    /* ignore */
  }
}

async function fetchMe(accessToken: string): Promise<SessionUser | null> {
  try {
    const res = await fetch(`${getApiRoot()}/auth/me`, {
      method: "GET",
      credentials: "include",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const body = await parseJson<{ success?: boolean; data?: SessionUser }>(res);
    const d = body.data;
    if (!d?.id || !d.email) return null;
    const role = normalizeRole(d.role as string);
    if (!role) return null;
    return {
      id: String(d.id),
      email: d.email,
      name: d.name,
      role,
      modulePermissions: d.modulePermissions,
    };
  } catch {
    return null;
  }
}

type RefreshResult = { token: string | null; authFailed: boolean };

async function fetchRefreshOnce(): Promise<RefreshResult> {
  try {
    const res = await fetch(`${getApiRoot()}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.status === 401 || res.status === 403) {
      return { token: null, authFailed: true };
    }
    if (!res.ok) {
      return { token: null, authFailed: false };
    }
    const body = await parseJson<{ success?: boolean; data?: { accessToken?: string } }>(res);
    const token = body.data?.accessToken || null;
    return { token, authFailed: !token };
  } catch {
    return { token: null, authFailed: false };
  }
}

let refreshPromise: Promise<string | null> | null = null;

/** Refresh access token using httpOnly cookie. Single-flight per tab; coordinates across tabs. */
export async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const existing = getAccessToken();
    if (existing && !isAccessTokenExpiringSoon(existing, 0)) {
      return existing;
    }

    const hasLock = tryAcquireRefreshLock();
    if (!hasLock) {
      for (let i = 0; i < 20; i++) {
        await sleep(250);
        const token = getAccessToken();
        if (token && !isAccessTokenExpiringSoon(token, 0)) {
          return token;
        }
      }
    }

    try {
      const result = await fetchRefreshOnce();

      if (result.token) {
        setAccessToken(result.token);
        scheduleProactiveRefresh(result.token);
        broadcastToken(result.token);
        dispatch();
        return result.token;
      }

      // Do not auto-logout on refresh failure (network / cookie / transient 401).
      // Keep the existing session; only explicit logout() clears it.
      return null;
    } finally {
      if (hasLock) releaseRefreshLock();
    }
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

/** Return a valid access token, refreshing proactively when needed. */
export async function ensureAccessToken(): Promise<string | null> {
  const token = getAccessToken();
  if (token && !isAccessTokenExpiringSoon(token)) {
    return token;
  }
  return refreshAccessToken();
}

/** Restore session using access token and/or httpOnly refresh cookie. */
export async function restoreSession(): Promise<SessionUser | null> {
  const cachedUser = readStoredUser();
  let token = getAccessToken();

  if (token && !isAccessTokenExpiringSoon(token, 0)) {
    const user = await fetchMe(token);
    if (user) {
      persistUser(user);
      scheduleProactiveRefresh(token);
      dispatch();
      return user;
    }
  }

  const newToken = await refreshAccessToken();
  if (newToken) {
    const user = await fetchMe(newToken);
    if (user) {
      persistUser(user);
      dispatch();
      return user;
    }
  }

  if (cachedUser && getAccessToken()) {
    scheduleProactiveRefresh(getAccessToken()!);
    dispatch();
    return cachedUser;
  }

  return null;
}

let sessionRestorePromise: Promise<SessionUser | null> | null = null;

/** Single in-flight bootstrap for concurrent useAuth() mounts (e.g. React Strict Mode). */
export function restoreSessionOnce(): Promise<SessionUser | null> {
  if (!sessionRestorePromise) {
    sessionRestorePromise = restoreSession().finally(() => {
      sessionRestorePromise = null;
    });
  }
  return sessionRestorePromise;
}

export async function loginWithPassword(email: string, password: string): Promise<SessionUser> {
  const res = await fetch(`${getApiRoot()}/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await parseJson<{
    success?: boolean;
    message?: string;
    data?: { accessToken?: string; user?: { id: string; name: string; email: string; role?: string; modulePermissions?: Record<string, string[]> } };
  }>(res);
  if (!res.ok || !body.success || !body.data?.accessToken || !body.data?.user) {
    const msg = body.message || (res.status === 401 ? "Invalid email or password." : "Sign-in failed.");
    throw new Error(msg);
  }
  const { accessToken, user: u } = body.data;
  const role = normalizeRole(u.role);
  if (!role) throw new Error("Unknown account role.");
  const session: SessionUser = {
    id: String(u.id),
    email: u.email,
    name: u.name,
    role,
    modulePermissions: u.modulePermissions,
  };
  setAccessToken(accessToken);
  scheduleProactiveRefresh(accessToken);
  broadcastToken(accessToken);
  persistUser(session);
  dispatch();
  return session;
}

export async function logout(): Promise<void> {
  const token = getAccessToken();
  try {
    await fetch(`${getApiRoot()}/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {
    /* still clear client */
  }
  invalidateSession();
}

export const panelPathFor = (role: Role): string => `/panel/${role}`;

function buildAuthedHeaders(init: RequestInit, token: string | null): Record<string, string> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!(init.body instanceof FormData) && init.method !== "GET" && init.method !== "HEAD") {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }
  return headers;
}

/**
 * Authenticated fetch with proactive token refresh and automatic 401 → refresh → retry.
 */
export async function authedFetch(path: string, init: RequestInit = {}, retried = false): Promise<Response> {
  const token = await ensureAccessToken();
  const url = `${getApiRoot()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: buildAuthedHeaders(init, token),
  });

  if (res.status === 401 && !retried) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return authedFetch(path, init, true);
    }
    // Keep the session; caller can surface the API error without forcing logout.
  }

  return res;
}
