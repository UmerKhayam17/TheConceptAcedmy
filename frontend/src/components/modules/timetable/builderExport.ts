import { scheduleSlotEntries, type PeriodSlot, type ScheduleSlot } from "@/lib/timetableApi";
import type { Weekday } from "@/lib/configApi";
import { DAY_FULL_LABELS, slotMatchesPeriod } from "./constants";

type CellPlain = { title: string; teachers: string; room: string };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cellFromSlot(slot: ScheduleSlot | undefined): CellPlain | null {
  if (!slot) return null;
  const entries = scheduleSlotEntries(slot);
  return {
    title: entries.map((e) => e.subject.name).join(" / "),
    teachers: entries.map((e) => e.teacher?.name || "—").join(" / "),
    room: slot.room?.code || slot.room?.name || "",
  };
}

function plainCell(slot: ScheduleSlot | undefined): string {
  const c = cellFromSlot(slot);
  if (!c) return "";
  const meta = [c.teachers, c.room].filter(Boolean).join(" · ");
  return meta ? `${c.title} — ${meta}` : c.title;
}

export type BuilderExportOpts = {
  title: string;
  subtitle: string;
  days: Weekday[];
  periods: PeriodSlot[];
  slots: ScheduleSlot[];
  getSlot: (day: Weekday, periodId: string) => ScheduleSlot | undefined;
};

function openPrintFrame(html: string): void {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(iframe);
  const cleanup = () => {
    window.setTimeout(() => {
      iframe.remove();
      URL.revokeObjectURL(url);
    }, 500);
  };
  iframe.onload = () => {
    try {
      iframe.contentWindow?.addEventListener("afterprint", cleanup);
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      window.setTimeout(cleanup, 60_000);
    } catch {
      cleanup();
    }
  };
  iframe.src = url;
}

function buildBuilderPrintHtml(opts: BuilderExportOpts): { html: string; documentTitle: string } {
  const { title, subtitle, days, periods, getSlot } = opts;
  if (!days.length || !periods.length) throw new Error("Nothing to print");

  const head = periods
    .map((p, i) => {
      const name = p.label || `Period ${p.order || i + 1}`;
      return `<th><div class="period-name">${escapeHtml(name)}</div><div class="period-time">${escapeHtml(
        `${p.startTime} – ${p.endTime}`
      )}</div></th>`;
    })
    .join("");

  const body = days
    .map((day) => {
      const cells = periods
        .map((p) => {
          const cell = cellFromSlot(getSlot(day, p._id));
          if (!cell) return `<td class="empty"></td>`;
          return `<td>
            <div class="subject">${escapeHtml(cell.title)}</div>
            <div class="teacher">${escapeHtml(cell.teachers)}</div>
            ${cell.room ? `<div class="room">${escapeHtml(cell.room)}</div>` : ""}
          </td>`;
        })
        .join("");
      return `<tr><th class="day-cell">${escapeHtml(DAY_FULL_LABELS[day])}</th>${cells}</tr>`;
    })
    .join("");

  const documentTitle = title.replace(/[^\w.-]+/g, "_").slice(0, 80) || "timetable";
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  body { font-family: Arial, sans-serif; color: #000; margin: 16px; background: #fff; }
  h1 { text-align: center; font-size: 18px; margin: 0 0 4px; }
  .subtitle { text-align: center; font-size: 12px; margin: 0 0 12px; color: #444; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; border: 2px solid #000; }
  th, td { border: 1px solid #000; padding: 6px 4px; text-align: center; vertical-align: middle; }
  thead th { background: #d9d9d9; font-size: 11px; }
  .day-cell { background: #bdd7ee; font-weight: 700; width: 110px; }
  .subject { font-weight: 700; font-size: 11px; }
  .teacher, .room { font-size: 9px; color: #555; margin-top: 2px; }
  .period-time { font-size: 9px; font-weight: 600; margin-top: 2px; }
  td.empty { height: 40px; }
</style></head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="subtitle">${escapeHtml(subtitle)}</p>
  <table>
    <thead><tr><th>Day</th>${head}</tr></thead>
    <tbody>${body}</tbody>
  </table>
</body></html>`;

  return { html, documentTitle };
}

/** Print section timetable: Day rows × Period columns. */
export function printBuilderGrid(opts: BuilderExportOpts): void {
  const { html } = buildBuilderPrintHtml(opts);
  openPrintFrame(html);
}

/** Download section timetable as a real .pdf file. */
export async function downloadBuilderGridPdf(opts: BuilderExportOpts): Promise<void> {
  const { html, documentTitle } = buildBuilderPrintHtml(opts);
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;left:-10000px;top:0;width:1400px;height:900px;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(iframe);

  try {
    await new Promise<void>((resolve, reject) => {
      iframe.onload = () => resolve();
      iframe.onerror = () => reject(new Error("Failed to load PDF preview"));
      iframe.src = url;
    });
    const target = iframe.contentDocument?.body;
    if (!target) throw new Error("PDF preview body missing");
    const canvas = await html2canvas(target, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      windowWidth: 1400,
    });
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const ratio = Math.min(
      (pageW - margin * 2) / canvas.width,
      (pageH - margin * 2) / canvas.height
    );
    pdf.addImage(
      canvas.toDataURL("image/png"),
      "PNG",
      (pageW - canvas.width * ratio) / 2,
      margin,
      canvas.width * ratio,
      canvas.height * ratio
    );
    pdf.save(`${documentTitle}.pdf`);
  } finally {
    iframe.remove();
    URL.revokeObjectURL(url);
  }
}

/** Excel-compatible .xls download for section timetable. */
export function exportBuilderGridExcel(opts: BuilderExportOpts): void {
  const { title, subtitle, days, periods, getSlot } = opts;
  if (!days.length || !periods.length) throw new Error("Nothing to export");

  const header = [
    "Day",
    ...periods.map((p, i) => {
      const name = /^period/i.test(p.label || "") ? p.label! : `Period ${p.order || i + 1}`;
      return `${name} (${p.startTime}-${p.endTime})`;
    }),
  ];

  const rows = days.map((day) => [
    DAY_FULL_LABELS[day],
    ...periods.map((p) => plainCell(getSlot(day, p._id))),
  ]);

  const table = [header, ...rows]
    .map(
      (row) =>
        `<tr>${row
          .map((c) => `<td>${escapeHtml(String(c))}</td>`)
          .join("")}</tr>`
    )
    .join("");

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"/></head>
<body><p>${escapeHtml(title)}</p><p>${escapeHtml(subtitle)}</p>
<table>${table}</table></body></html>`;

  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stem = title.replace(/[^\w.-]+/g, "_").slice(0, 80) || "timetable";
  a.href = url;
  a.download = `${stem}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Unused helper kept for slotMatching consumers. */
export function findSlot(
  slots: ScheduleSlot[],
  day: Weekday,
  periodId: string
): ScheduleSlot | undefined {
  return slots.find((s) => s.day === day && slotMatchesPeriod(s, periodId));
}
