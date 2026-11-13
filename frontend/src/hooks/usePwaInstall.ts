import { useSyncExternalStore } from "react";
import { getInstallPrompt, isStandaloneApp, subscribePwa } from "@/pwa";

function isIosBrowser() {
  if (typeof navigator === "undefined") return false;
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return true;
  // iPadOS 13+ reports itself as a Mac; a touch screen gives it away.
  return /macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
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
