/** Removes the poster painted in index.html once the real screen is ready. */
export function hideBootSplash() {
  document.getElementById("boot-splash")?.remove();
}
