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
