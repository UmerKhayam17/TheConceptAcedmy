let bootDone = false;

/** Removes the poster painted in index.html once the real screen is ready. */
export function hideBootSplash() {
  bootDone = true;
  document.documentElement.classList.add("boot-done");
  document.getElementById("boot-splash")?.remove();
}

/** True once the first screen (login or panel) has been shown. */
export function isBootDone() {
  return bootDone;
}

/**
 * True inside the installed app (Android APK, or PWA opened from the home screen).
 * index.html marks <html class="is-app"> before anything renders.
 */
export function isInstalledApp() {
  return typeof document !== "undefined" && document.documentElement.classList.contains("is-app");
}
