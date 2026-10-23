import { useSyncExternalStore } from "react";
import { getSession, restoreSessionOnce, SessionUser } from "@/lib/auth";

export type AuthState = {
  user: SessionUser | null;
  /** True until first session restore attempt finishes */
  loading: boolean;
};

const USER_KEY = "tces_user";

/**
 * One auth store shared by every useAuth() caller. The session is restored once per
 * page load (not once per component), and the snapshot only changes when the stored
 * user actually changes — so cross-tab events no longer re-render the whole panel.
 */
let snapshot: AuthState = { user: getSession(), loading: true };
let userKey = JSON.stringify(snapshot.user);
let started = false;
const listeners = new Set<() => void>();

function setSnapshot(user: SessionUser | null, loading: boolean) {
  const key = JSON.stringify(user);
  if (key === userKey && loading === snapshot.loading) return;
  snapshot = { user: key === userKey ? snapshot.user : user, loading };
  userKey = key;
  listeners.forEach((listener) => listener());
}

function sync() {
  setSnapshot(getSession(), snapshot.loading);
}

function onStorage(e: StorageEvent) {
  // key === null means localStorage.clear() in another tab.
  if (e.key === USER_KEY || e.key === null) sync();
}

function start() {
  if (started) return;
  started = true;
  window.addEventListener("tces-auth-change", sync);
  window.addEventListener("storage", onStorage);
  void restoreSessionOnce()
    .then((restored) => setSnapshot(restored ?? getSession(), false))
    .catch(() => setSnapshot(getSession(), false));
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return snapshot;
}

export const useAuth = (): AuthState => useSyncExternalStore(subscribe, getSnapshot);
