import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { WifiOff } from "lucide-react";

function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

function formatSavedAt(ms: number) {
  const d = new Date(ms);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `today, ${time}`;
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${time}`;
}

/**
 * Shown while the device has no internet: screens keep working from the data saved on the
 * device, and this tells the user how old that data is.
 */
export default function OfflineBanner() {
  const online = useOnline();
  const qc = useQueryClient();
  const [savedAt, setSavedAt] = useState(0);

  useEffect(() => {
    if (online) return;
    const latest = qc
      .getQueryCache()
      .getAll()
      .reduce((max, q) => Math.max(max, q.state.dataUpdatedAt || 0), 0);
    setSavedAt(latest);
  }, [online, qc]);

  if (online) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-slate-800 px-3 py-1.5 text-center text-xs font-medium text-white"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      <span>
        You&apos;re offline — showing saved data
        {savedAt ? ` from ${formatSavedAt(savedAt)}` : ""}. Changes need internet.
      </span>
    </div>
  );
}
