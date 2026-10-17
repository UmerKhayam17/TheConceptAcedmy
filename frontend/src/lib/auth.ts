import { getApiRoot, parseJson } from "@/lib/api";

export type Role = "admin" | "accountant" | "teacher" | "parent" | "student";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  profileImage?: string | null;
  modulePermissions?: Record<string, string[]>;
  /** Bootstrap admin (SEED_ADMIN_EMAIL) — full access; other admins use modulePermissions. */
  isSystemAdmin?: boolean;
}

const USER_KEY = "tces_user";
const ACCESS_KEY = "tces_access";
const REFRESH_LOCK_KEY = "tces_refresh_lock";

const AUTH_EVT = "tces-auth-change";
/** Refresh access token this long before JWT exp (works with ~15m access lifetime). */
const REFRESH_BUFFER_MS = 90_000;
const REFRESH_RETRY_ATTEMPTS = 3;
const RESTORE_RETRY_MS = 4_000;

const authChannel =
  typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("tces-auth") : null;

/** In-memory only — never persist access JWT in localStorage (XSS can steal it). */
let memoryAccessToken: string | null = null;
let restoreRetryTimer: ReturnType<typeof setTimeout> | null = null;

function purgeLegacyAccessTokenStorage() {
  try {
    localStorage.removeItem(ACCESS_KEY);
    sessionStorage.removeItem(ACCESS_KEY);
  } catch {
    /* ignore */
  }
}

purgeLegacyAccessTokenStorage();

function dispatch() {
  window.dispatchEvent(new Event(AUTH_EVT));
}

export function getAccessToken(): string | null {
  return memoryAccessToken;
}

function setAccessToken(token: string | null) {
  memoryAccessToken = token || null;
  purgeLegacyAccessTokenStorage();
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
  stopRestoreRetry();
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

function stopRestoreRetry() {
  if (restoreRetryTimer) {
    clearTimeout(restoreRetryTimer);
    restoreRetryTimer = null;
  }
}

function scheduleProactiveRefresh(token: string) {
  stopProactiveRefresh();
  const exp = decodeTokenExpiryMs(token);
  if (!exp) return;
  const delay = Math.max(5_000, exp - Date.now() - REFRESH_BUFFER_MS);
  proactiveRefreshTimer = setTimeout(() => {
    void refreshAccessToken({ force: true }).catch(() => {
      /* network blip — next API call will retry */
    });
  }, delay);
}

/** Soft retry after temporary restore failures (backend restart / HMR race). */
function scheduleRestoreRetry() {
  stopRestoreRetry();
  restoreRetryTimer = setTimeout(() => {
    restoreRetryTimer = null;
    void restoreSessionOnce().catch(() => {
      /* ignore */
    });
  }, RESTORE_RETRY_MS);
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
      stopRestoreRetry();
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
    if (res.status === 401 || res.status === 403) return null;
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
      profileImage: (d as SessionUser).profileImage || null,
      modulePermissions: d.modulePermissions,
      isSystemAdmin: Boolean((d as SessionUser).isSystemAdmin),
    };
  } catch {
    return null;
  }
}

type RefreshResult = {
  token: string | null;
  /** Backend confirmed the refresh session is invalid/revoked (401/403). */
  authFailed: boolean;
  /** Network error, timeout, or HTTP 5xx / other soft failure. */
  temporaryFailure: boolean;
};

async function fetchRefreshOnce(): Promise<RefreshResult> {
  try {
    const res = await fetch(`${getApiRoot()}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.status === 401 || res.status === 403) {
      return { token: null, authFailed: true, temporaryFailure: false };
    }
    if (res.status >= 500 || res.status === 429) {
      return { token: null, authFailed: false, temporaryFailure: true };
    }
    if (!res.ok) {
      return { token: null, authFailed: false, temporaryFailure: true };
    }
    const body = await parseJson<{ success?: boolean; data?: { accessToken?: string } }>(res);
    const token = body.data?.accessToken || null;
    if (!token) {
      return { token: null, authFailed: false, temporaryFailure: true };
    }
    return { token, authFailed: false, temporaryFailure: false };
  } catch {
    return { token: null, authFailed: false, temporaryFailure: true };
  }
}

async function fetchRefreshWithRetry(attempts = REFRESH_RETRY_ATTEMPTS): Promise<RefreshResult> {
  let last: RefreshResult = { token: null, authFailed: false, temporaryFailure: true };
  for (let i = 0; i < attempts; i++) {
    if (i > 0) {
      await sleep(300 * 2 ** (i - 1));
    }
    last = await fetchRefreshOnce();
    if (last.token || last.authFailed) return last;
  }
  return last;
}

let refreshPromise: Promise<string | null> | null = null;
/** Outcome of the most recent refresh attempt (for restoreSession soft-fail handling). */
let lastRefreshMeta: RefreshResult | null = null;

export type RefreshOptions = {
  /** Skip “token still valid” short-circuit — required after a 401 from the API. */
  force?: boolean;
  /**
   * When true, clear the client session only if the backend confirms the refresh
   * token is invalid/revoked (401/403). Never logs out on network/5xx.
   */
  logoutOnAuthFailure?: boolean;
};

/** Refresh access token using httpOnly cookie. Single-flight per tab; coordinates across tabs. */
export async function refreshAccessToken(options: RefreshOptions = {}): Promise<string | null> {
  const { force = false, logoutOnAuthFailure = false } = options;

  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const existing = getAccessToken();
    if (!force && existing && !isAccessTokenExpiringSoon(existing, 0)) {
      return existing;
    }

    const hasLock = tryAcquireRefreshLock();
    if (!hasLock) {
      // Wait for the other tab to finish refresh + BroadcastChannel update.
      for (let i = 0; i < 40; i++) {
        await sleep(250);
        const token = getAccessToken();
        if (
          token &&
          (force
            ? !isAccessTokenExpiringSoon(token, REFRESH_BUFFER_MS / 2)
            : !isAccessTokenExpiringSoon(token, 0))
        ) {
          return token;
        }
      }
      // Other tab may have failed temporarily — try ourselves below.
    }

    try {
      const result = await fetchRefreshWithRetry();
      lastRefreshMeta = result;

      if (result.token) {
        setAccessToken(result.token);
        scheduleProactiveRefresh(result.token);
        broadcastToken(result.token);
        stopRestoreRetry();
        dispatch();
        return result.token;
      }

      if (result.authFailed && logoutOnAuthFailure) {
        invalidateSession();
      }

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
  return refreshAccessToken({ force: !token || isAccessTokenExpiringSoon(token, 0) });
}

/**
 * Restore session using access token and/or httpOnly refresh cookie.
 * Temporary backend/network failures do not clear the session.
 */
export async function restoreSession(): Promise<SessionUser | null> {
  const cachedUser = readStoredUser();
  const token = getAccessToken();

  if (token && !isAccessTokenExpiringSoon(token, 0)) {
    const user = await fetchMe(token);
    if (user) {
      persistUser(user);
      scheduleProactiveRefresh(token);
      stopRestoreRetry();
      dispatch();
      return user;
    }
  }

  // Soft path: never logout on network/5xx — only when refresh meta says authFailed.
  const newToken = await refreshAccessToken({
    force: true,
    logoutOnAuthFailure: false,
  });

  if (newToken) {
    const user = await fetchMe(newToken);
    if (user) {
      persistUser(user);
      stopRestoreRetry();
      dispatch();
      return user;
    }
    // Got access token but /me failed softy — keep token, use cache if present.
    if (cachedUser) {
      scheduleProactiveRefresh(newToken);
      stopRestoreRetry();
      dispatch();
      return cachedUser;
    }
  }

  if (lastRefreshMeta?.authFailed) {
    if (cachedUser) {
      clearStorage();
      dispatch();
    }
    return null;
  }

  // Temporary failure (backend down / HMR race): keep cached profile, retry soon.
  if (cachedUser) {
    scheduleRestoreRetry();
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
    data?: {
      accessToken?: string;
      user?: {
        id: string;
        name: string;
        email: string;
        role?: string;
        profileImage?: string | null;
        modulePermissions?: Record<string, string[]>;
        isSystemAdmin?: boolean;
      };
    };
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
    profileImage: u.profileImage || null,
    modulePermissions: u.modulePermissions,
    isSystemAdmin: Boolean(u.isSystemAdmin),
  };
  setAccessToken(accessToken);
  scheduleProactiveRefresh(accessToken);
  broadcastToken(accessToken);
  persistUser(session);
  stopRestoreRetry();
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
 * Authenticated fetch with proactive token refresh and automatic 401 → force refresh → retry.
 * Logs out only when refresh is confirmed invalid — not on network/5xx.
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
    const refreshed = await refreshAccessToken({ force: true, logoutOnAuthFailure: true });
    if (refreshed) {
      return authedFetch(path, init, true);
    }
  }

  return res;
}
