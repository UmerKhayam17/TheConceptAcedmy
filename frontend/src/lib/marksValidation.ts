/** Enter → next marks field in the same table; Shift+Enter → previous. */
export function handleMarksFieldEnterKey(
  e: { key: string; shiftKey: boolean; preventDefault: () => void; currentTarget: HTMLElement },
) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const current = e.currentTarget;
  const root = current.closest("table") ?? document;
  const fields = Array.from(
    root.querySelectorAll<HTMLInputElement>("[data-marks-field]:not(:disabled)"),
  ).filter((el) => el.offsetParent !== null);
  const i = fields.indexOf(current as HTMLInputElement);
  if (i < 0) return;
  const next = fields[e.shiftKey ? i - 1 : i + 1];
  if (!next) return;
  next.focus();
  next.select();
}

/** Keep typed marks within [0, maxTotal]. Empty string stays empty for unfinished cells. */
export function clampMarksInput(raw: string, maxTotal: number): string {
  if (raw.trim() === "") return "";
  const n = Number(raw);
  if (!Number.isFinite(n)) return "";
  if (n < 0) return "0";
  if (Number.isFinite(maxTotal) && maxTotal >= 0 && n > maxTotal) return String(maxTotal);
  return raw;
}

/** Returns an error message when obtained exceeds total (or values are invalid). */
export function validateObtainedVsTotal(obtained: number, total: number): string | null {
  if (!Number.isFinite(obtained) || !Number.isFinite(total)) {
    return "Enter valid marks.";
  }
  if (total < 1) return "Total marks must be at least 1.";
  if (obtained < 0) return "Obtained marks cannot be negative.";
  if (obtained > total) {
    return `Obtained marks cannot be greater than total marks (${total}).`;
  }
  return null;
}
