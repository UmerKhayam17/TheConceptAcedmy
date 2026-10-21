function marksFieldsInTable(from: HTMLElement): HTMLInputElement[] {
  const root = from.closest("table") ?? document;
  return Array.from(
    root.querySelectorAll<HTMLInputElement>("[data-marks-field]:not(:disabled)"),
  ).filter((el) => el.offsetParent !== null);
}

/** Resolve the marks input for this cell / row (toggle may live in a sibling cell). */
function marksFieldNear(el: HTMLElement): HTMLInputElement | null {
  if (el.matches?.("[data-marks-field]")) return el as HTMLInputElement;
  const cell = el.closest("td");
  if (cell) {
    const inCell = cell.querySelector<HTMLInputElement>("[data-marks-field]");
    if (inCell) return inCell;
  }
  const row = el.closest("tr");
  if (!row || !cell) return null;
  const cells = Array.from(row.querySelectorAll("td"));
  const start = cells.indexOf(cell as HTMLTableCellElement);
  for (let j = Math.max(0, start); j < cells.length; j++) {
    const found = cells[j].querySelector<HTMLInputElement>("[data-marks-field]");
    if (found) return found;
  }
  return null;
}

/** Focus next/previous marks field in the same table. */
export function focusAdjacentMarksField(
  from: HTMLElement,
  direction: "next" | "prev" = "next",
) {
  const fields = marksFieldsInTable(from);
  const current = marksFieldNear(from);
  const i = current ? fields.indexOf(current) : -1;
  if (i < 0) return;
  const target = fields[direction === "prev" ? i - 1 : i + 1];
  if (!target) return;
  queueMicrotask(() => {
    target.focus();
    target.select();
  });
}

/** Enter → next marks field in the same table; Shift+Enter → previous. */
export function handleMarksFieldEnterKey(
  e: { key: string; shiftKey: boolean; preventDefault: () => void; currentTarget: HTMLElement },
) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  focusAdjacentMarksField(e.currentTarget, e.shiftKey ? "prev" : "next");
}

/** -1 (or typing "-") marks the student as absent. */
export function marksInputMeansAbsent(raw: string): boolean {
  const t = String(raw ?? "").trim();
  return t === "-1" || Number(t) === -1;
}

/**
 * Keep typed marks within [0, maxTotal].
 * Empty stays empty. "-1" / "-" allowed for absent.
 */
export function clampMarksInput(raw: string, maxTotal: number): string {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  if (trimmed === "-" || trimmed === "-1") return trimmed;
  const n = Number(raw);
  if (!Number.isFinite(n)) return "";
  if (n < 0) return "0";
  if (Number.isFinite(maxTotal) && maxTotal >= 0 && n > maxTotal) return String(maxTotal);
  return raw;
}

/** Normalize UI cell → API payload (absent → obtained 0). */
export function normalizeMarksForSave(
  obtained: string,
  isAbsentFlag: boolean,
): { obtained: number; isAbsent: boolean } {
  if (isAbsentFlag || marksInputMeansAbsent(obtained)) {
    return { obtained: 0, isAbsent: true };
  }
  return { obtained: Number(obtained), isAbsent: false };
}

/** Returns an error message when obtained exceeds total (or values are invalid). */
export function validateObtainedVsTotal(
  obtained: number,
  total: number,
  opts?: { isAbsent?: boolean },
): string | null {
  if (opts?.isAbsent) return null;
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

/** Detect absent from stored assessment / subject mark. */
export function recordIsAbsent(row?: {
  isAbsent?: boolean;
  remarks?: string;
  obtainedMarks?: number;
  obtained?: number;
} | null): boolean {
  if (!row) return false;
  if (row.isAbsent) return true;
  if (String(row.remarks || "").toLowerCase().includes("absent")) return true;
  return false;
}
