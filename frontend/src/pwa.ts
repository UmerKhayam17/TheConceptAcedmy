import { registerSW } from "virtual:pwa-register";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Listener = () => void;

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let standalone = false;
const listeners = new Set<Listener>();

/** How often to poll for a new service worker while the app is open. */
const UPDATE_CHECK_MS = 5 * 60 * 1000;

function emit() {
  listeners.forEach((listener) => listener());
}

export function isStandaloneApp() {
  return standalone;
}

export function getInstallPrompt() {
  return deferredPrompt;
}

export function subscribePwa(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function promptPwaInstall() {
  if (!deferredPrompt) return "unavailable" as const;
  await deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  deferredPrompt = null;
  if (choice.outcome === "accepted") standalone = true;
  emit();
  return choice.outcome;
}

function readStandalone() {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || Boolean(nav.standalone);
}

if (typeof window !== "undefined") {
  standalone = readStandalone();

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    emit();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    standalone = true;
    emit();
  });

  /**
   * Production PWA: vite-plugin-pwa `registerType: "autoUpdate"` + skipWaiting
   * means a new deploy activates the SW and reloads clients so installed phones
   * pick up the new build without reinstalling.
   */
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      // autoUpdate normally reloads; force apply if a waiting worker exists
      void updateSW(true);
    },
    onOfflineReady() {
      /* precache ready */
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;

      const checkForUpdate = () => {
        registration.update().catch(() => undefined);
      };

      checkForUpdate();
      window.setInterval(checkForUpdate, UPDATE_CHECK_MS);

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") checkForUpdate();
      });

      window.addEventListener("focus", checkForUpdate);
      window.addEventListener("online", checkForUpdate);
    },
    onRegisterError(err) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn("[pwa] service worker registration failed", err);
      }
    },
  });
}
