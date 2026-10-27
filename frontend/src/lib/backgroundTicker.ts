/**
 * Repeating timer that keeps running when the tab is in the background.
 * Browsers heavily throttle page timers in hidden tabs; timers inside a
 * dedicated Web Worker are not throttled the same way. Falls back to
 * window.setInterval when workers are unavailable.
 */
export function startBackgroundTicker(intervalMs: number, onTick: () => void): () => void {
  try {
    const source = `let t=null;onmessage=(e)=>{clearInterval(t);if(e.data>0)t=setInterval(()=>postMessage(0),e.data);};`;
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    const worker = new Worker(url);
    worker.onmessage = () => onTick();
    worker.postMessage(intervalMs);
    return () => {
      worker.postMessage(0);
      worker.terminate();
      URL.revokeObjectURL(url);
    };
  } catch {
    const id = window.setInterval(onTick, intervalMs);
    return () => window.clearInterval(id);
  }
}

type WakeLockSentinelLike = { release: () => Promise<void> };

/** Keeps the screen awake (where supported) so the monitor PC does not sleep mid-scan. */
export function holdScreenAwake(): () => void {
  const nav = navigator as Navigator & {
    wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
  };
  if (!nav.wakeLock) return () => {};
  let sentinel: WakeLockSentinelLike | null = null;
  let released = false;
  const acquire = () => {
    if (released || document.visibilityState !== "visible") return;
    nav.wakeLock
      ?.request("screen")
      .then((s) => {
        if (released) void s.release();
        else sentinel = s;
      })
      .catch(() => {
        /* denied or unsupported — scanning still works */
      });
  };
  // The lock is dropped whenever the tab is hidden; take it again on return.
  const onVisible = () => {
    if (document.visibilityState === "visible") acquire();
  };
  acquire();
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    released = true;
    document.removeEventListener("visibilitychange", onVisible);
    void sentinel?.release().catch(() => {});
  };
}
