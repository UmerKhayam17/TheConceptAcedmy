import { useSyncExternalStore } from "react";
import { getInstallPrompt, isStandaloneApp, subscribePwa } from "@/pwa";

function isIosBrowser() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function usePwaInstall() {
  const prompt = useSyncExternalStore(subscribePwa, getInstallPrompt, () => null);
  const installed = useSyncExternalStore(subscribePwa, isStandaloneApp, () => false);
  const ios = isIosBrowser() && !installed;
  return {
    canInstall: Boolean(prompt) && !installed,
    installed,
    ios,
  };
}
