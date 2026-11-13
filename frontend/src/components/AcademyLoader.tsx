import type { ReactNode } from "react";
import { isBootDone, isInstalledApp } from "@/lib/bootSplash";

/**
 * The new-style loader: 12 gold bars with a fading trail, stepping clockwise
 * (same as the splash in index.html and the Android app).
 */
export function Spokes({ size = 44, color = "#f5b301" }: { size?: number; color?: string }) {
  const barW = Math.max(3, Math.round(size * 0.09));
  const barH = Math.round(size * 0.27);
  return (
    <div
      className="relative shrink-0 animate-[boot-spin_1s_steps(12)_infinite]"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {Array.from({ length: 12 }, (_, k) => (
        <i
          key={k}
          className="absolute top-0 rounded-full"
          style={{
            left: (size - barW) / 2,
            width: barW,
            height: barH,
            background: color,
            transformOrigin: `${barW / 2}px ${size / 2}px`,
            transform: `rotate(${-k * 30}deg)`,
            opacity: 1 - k * 0.075,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Loading screen while the session is checked or a page's code is loading.
 * - Installed app, first start: full splash picture with the loader (matches the native splash).
 * - Installed app, later page changes: just the small loader.
 * - Website in a browser: whatever the page passes as `web` (its original loading screen).
 */
export default function AcademyLoader({ web = null }: { web?: ReactNode }) {
  if (!isInstalledApp()) return <>{web}</>;

  if (!isBootDone()) {
    return (
      <div
        className="relative min-h-dvh bg-[#0047da] bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: 'url("/splash.jpg")' }}
        role="status"
        aria-live="polite"
        aria-label="Loading the academy portal"
      >
        <div className="absolute inset-x-0 bottom-[5%] flex flex-col items-center gap-2.5">
          <Spokes />
          <span className="text-[13px] font-semibold tracking-[2px] text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.45)]">
            LOADING...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-white" role="status" aria-live="polite" aria-label="Loading">
      <Spokes />
    </div>
  );
}
