import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download } from "lucide-react";

/**
 * Moves phones on an OLD Android app (APK) to the newest one.
 *
 * APKs built from now on contain their own updater (android/.../AppUpdater.java) and tell the
 * site so by setting window.__TCA_APK_VERSION. Older APKs can't update themselves, but they
 * still load this website, so the site checks: inside the app + no updater mark + a newer APK
 * on the server  ->  ask the parent to install it once. After that one install, every future
 * APK update is offered by the app itself.
 *
 * The download opens in the phone's browser (Chrome): the app only opens links to other
 * addresses there, so the "www." address is used on purpose.
 */

type ApkInfo = { versionCode: number; size?: number };

const SNOOZE_KEY = "tca-apk-notice-snoozed";
/** The app sets the mark when its page loads; give it time before deciding it is old. */
const WAIT_FOR_NATIVE_MS = 5000;

declare global {
  interface Window {
    Capacitor?: unknown;
    __TCA_APK_VERSION?: number;
  }
}

function downloadUrl() {
  const { protocol, hostname } = window.location;
  const other = hostname.startsWith("www.") ? hostname.slice(4) : `www.${hostname}`;
  return `${protocol}//${other}/downloads/tca.apk?v=${Date.now()}`;
}

export default function AppApkUpdateNotice() {
  const [info, setInfo] = useState<ApkInfo | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.Capacitor) return; // website in a browser
    try {
      if (sessionStorage.getItem(SNOOZE_KEY)) return;
    } catch {
      /* storage unavailable */
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (typeof window.__TCA_APK_VERSION === "number") return; // new APK: it updates itself
      try {
        const res = await fetch(`/downloads/tca-version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as ApkInfo;
        if (!cancelled && data?.versionCode) setInfo(data);
      } catch {
        /* offline: ask next time */
      }
    }, WAIT_FOR_NATIVE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  if (!info || typeof document === "undefined") return null;

  const later = () => {
    try {
      sessionStorage.setItem(SNOOZE_KEY, "1");
    } catch {
      /* storage unavailable */
    }
    setInfo(null);
  };

  const size = info.size ? ` (${(info.size / 1024 / 1024).toFixed(1)} MB)` : "";

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end bg-[#4B5563]/45">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Update the app"
        className="w-full rounded-t-[28px] bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_40px_rgba(15,23,42,0.12)]"
      >
        <div className="flex justify-center">
          <span className="h-1 w-10 rounded-full bg-[#E5E7EB]" />
        </div>
        <div className="mt-5 flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#DBEAFE] text-[#0B63CE]">
            <Download className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-[20px] font-bold text-[#111827]">Update the app</h2>
            <p className="text-[13px] text-[#6B7280]">A new version is ready{size}</p>
          </div>
        </div>
        <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-[14px] leading-relaxed text-[#374151]">
          <li>Tap <b>Update now</b>. The new app downloads in your browser.</li>
          <li>Open the downloaded file and tap <b>Install</b>.</li>
          <li>You only do this once. Future updates install from inside the app.</li>
        </ol>
        <button
          type="button"
          onClick={() => {
            window.location.href = downloadUrl();
          }}
          className="mt-5 h-12 w-full rounded-2xl bg-[#0B63CE] text-[15px] font-semibold text-white active:bg-[#0A56B3]"
        >
          Update now
        </button>
        <button
          type="button"
          onClick={later}
          className="mt-2 h-11 w-full rounded-2xl text-[14px] font-semibold text-[#6B7280] active:bg-[#F3F4F6]"
        >
          Later
        </button>
      </div>
    </div>,
    document.body,
  );
}
