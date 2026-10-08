import { classSectionBoardLabel } from "@/lib/configApi";
import { scheduleSlotEntries, type PeriodSlot, type ScheduleSlot } from "@/lib/timetableApi";
import { slotMatchesPeriod } from "./constants";

export type ClassBoardExportRow = {
  section: {
    _id: string;
    name: string;
    label?: string;
  };
  class?: { _id: string; name: string } | null;
  slots: ScheduleSlot[];
};

type CellData = {
  title: string;
  teachers: string;
  room: string;
  shared: boolean;
  parallel: boolean;
};

export type ClassBoardPrintOpts = {
  title: string;
  subtitle: string;
  rows: ClassBoardExportRow[];
  periods: PeriodSlot[];
  className?: string;
  dayLabel?: string;
  sessionName?: string;
  effectiveDate?: string;
  /** When true, print sheet is labeled DRAFT (review before publish). */
  isDraft?: boolean;
};

function sectionLabel(row: ClassBoardExportRow): string {
  return classSectionBoardLabel(row.class?.name, row.section.name, row.section.label);
}

function slotCell(slot: ScheduleSlot | undefined): CellData | null {
  if (!slot) return null;
  const entries = scheduleSlotEntries(slot);
  return {
    title: entries.map((e) => e.subject.name).join(" / "),
    teachers: entries.map((e) => e.teacher?.name || "—").join(" / "),
    room: slot.room?.code || slot.room?.name || "",
    shared: Boolean(slot.combinedGroupId),
    parallel: entries.length > 1,
  };
}

function slotCellPlain(slot: ScheduleSlot | undefined): string {
  const cell = slotCell(slot);
  if (!cell) return "";
  const meta = [cell.teachers, cell.room].filter(Boolean).join(" · ");
  return meta ? `${cell.title} (${cell.teachers})` : cell.title;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildMatrix(rows: ClassBoardExportRow[], periods: PeriodSlot[]) {
  return rows.map((row) => ({
    label: sectionLabel(row),
    cells: periods.map((period) => {
      const slot = row.slots.find((s) => slotMatchesPeriod(s, period._id));
      return slotCell(slot);
    }),
    plainCells: periods.map((period) => {
      const slot = row.slots.find((s) => slotMatchesPeriod(s, period._id));
      return slotCellPlain(slot);
    }),
  }));
}

function fileStem(className: string | undefined, dayLabel: string): string {
  const cls = (className || "all-classes").replace(/\s+/g, "-").toLowerCase();
  const day = dayLabel.replace(/\s+/g, "-").toLowerCase();
  return `class-board-${cls}-${day}`;
}

function formatEffectiveDate(d = new Date()): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function renderPrintCell(cell: CellData | null): string {
  if (!cell) {
    return `<td class="empty"></td>`;
  }
  return `<td>
    <div class="subject">${escapeHtml(cell.title)}</div>
    <div class="teacher">(${escapeHtml(cell.teachers)})</div>
  </td>`;
}

function buildClassBoardPrintHtml(opts: ClassBoardPrintOpts): { html: string; documentTitle: string } {
  const { rows, periods, dayLabel, sessionName, effectiveDate, isDraft, className } = opts;
  if (!rows.length || !periods.length) {
    throw new Error("Nothing to export — load a class board first.");
  }

  const matrix = buildMatrix(rows, periods);
  const dateLabel = effectiveDate || formatEffectiveDate();
  const line2Parts = ["Timetable"];
  if (isDraft) line2Parts.push("DRAFT");
  if (dayLabel) line2Parts.push(dayLabel);
  if (sessionName) line2Parts.push(sessionName);
  line2Parts.push(`Effective Date: ${dateLabel}`);

  const headFixed = periods
    .map((p, i) => {
      const num = p.order || i + 1;
      const name = /^period\b/i.test(String(p.label || ""))
        ? String(p.label)
        : `Period ${num}`;
      return `<th>
        <div class="period-name">${escapeHtml(name)}</div>
        <div class="period-time">(${escapeHtml(`${p.startTime} - ${p.endTime}`)})</div>
      </th>`;
    })
    .join("");

  const body = matrix
    .map(
      (row) =>
        `<tr>
          <th scope="row" class="class-cell">${escapeHtml(row.label)}</th>
          ${row.cells.map((cell) => renderPrintCell(cell)).join("")}
        </tr>`
    )
    .join("");

  const documentTitle = fileStem(className, dayLabel || "week");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(documentTitle)}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      border: 0;
      font-family: Arial, Helvetica, sans-serif;
      color: #000;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body { padding: 4px 2px 0; }
    .title {
      text-align: center;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0.02em;
      margin: 0 0 4px;
      text-transform: uppercase;
    }
    .subtitle {
      text-align: center;
      font-size: 13px;
      font-style: italic;
      margin: 0 0 16px;
      color: #111;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      border: 2.5px solid #000;
    }
    thead th {
      background: #d9d9d9;
      color: #000;
      font-weight: 700;
      font-size: 12px;
      text-align: center;
      vertical-align: middle;
      padding: 8px 4px;
      border: 1px solid #000;
    }
    thead th:first-child {
      width: 120px;
      min-width: 120px;
      font-size: 13px;
    }
    .period-name { line-height: 1.2; }
    .period-time {
      margin-top: 2px;
      font-size: 10px;
      font-weight: 600;
    }
    tbody th.class-cell {
      background: #bdd7ee;
      color: #000;
      font-weight: 700;
      font-size: 13px;
      text-align: center;
      vertical-align: middle;
      padding: 10px 12px;
      border: 1px solid #000;
      white-space: nowrap;
      width: 120px;
      min-width: 120px;
    }
    tbody td {
      background: #fff;
      border: 1px solid #000;
      padding: 8px 5px;
      text-align: center;
      vertical-align: middle;
    }
    td.empty { height: 44px; }
    .subject {
      font-weight: 700;
      font-size: 12px;
      color: #000;
      line-height: 1.25;
    }
    .teacher {
      margin-top: 3px;
      font-size: 10px;
      font-weight: 400;
      color: #666;
      line-height: 1.25;
    }
    @media print {
      thead th, tbody th.class-cell {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <h1 class="title">The Concept Academy Islamabad</h1>
  <p class="subtitle">${escapeHtml(line2Parts.join(" | "))}</p>
  <table>
    <thead>
      <tr>
        <th>Class</th>
        ${headFixed}
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>
</body>
</html>`;

  return { html, documentTitle };
}

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

/**
 * Print layout matched to academy timetable sheet:
 * centered title, Class | Period columns, subject + full teacher name.
 */
export function printClassBoard(opts: ClassBoardPrintOpts): void {
  const { html } = buildClassBoardPrintHtml(opts);
  openPrintFrame(html);
}

/**
 * Download a real PDF file of the academy Class Board sheet (landscape A4).
 */
export async function downloadClassBoardPdf(opts: ClassBoardPrintOpts): Promise<void> {
  const { html, documentTitle } = buildClassBoardPrintHtml(opts);
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

    const doc = iframe.contentDocument;
    const target = doc?.body;
    if (!target) throw new Error("PDF preview body missing");

    const canvas = await html2canvas(target, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      windowWidth: 1400,
    });
    const img = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const maxW = pageW - margin * 2;
    const maxH = pageH - margin * 2;
    const ratio = Math.min(maxW / canvas.width, maxH / canvas.height);
    const drawW = canvas.width * ratio;
    const drawH = canvas.height * ratio;
    const x = (pageW - drawW) / 2;
    pdf.addImage(img, "PNG", x, margin, drawW, drawH);
    pdf.save(`${documentTitle}.pdf`);
  } finally {
    iframe.remove();
    URL.revokeObjectURL(url);
  }
}

/** Downloads Class Board as an Excel-compatible .xls (HTML table). */
export function exportClassBoardExcel(opts: {
  className?: string;
  dayLabel: string;
  rows: ClassBoardExportRow[];
  periods: PeriodSlot[];
  versionMode?: "draft" | "published";
}): void {
  const { className, dayLabel, rows, periods, versionMode } = opts;
  if (!rows.length || !periods.length) {
    throw new Error("Nothing to export — load a class board first.");
  }

  const matrix = buildMatrix(rows, periods);
  const head = [
    "Class",
    ...periods.map((p, i) => {
      const name = /^period/i.test(p.label || "") ? p.label! : `Period ${p.order || i + 1}`;
      return `${name} (${p.startTime} - ${p.endTime})`;
    }),
  ];
  const modeNote =
    versionMode === "published"
      ? "Published (official)"
      : versionMode === "draft"
        ? "Draft (auto-generated from section timetables)"
        : "Auto-generated from section timetables";
  const tableRows = [
    `<tr><td colspan="${head.length}">${escapeHtml(modeNote)}</td></tr>`,
    `<tr>${head.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`,
    ...matrix.map(
      (row) =>
        `<tr><td>${escapeHtml(row.label)}</td>${row.plainCells
          .map((c) => `<td>${escapeHtml(c)}</td>`)
          .join("")}</tr>`
    ),
  ].join("");

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="UTF-8" /></head>
<body>
<table border="1">${tableRows}</table>
</body>
</html>`;

  const blob = new Blob(["\ufeff", html], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const modeSuffix = versionMode ? `-${versionMode}` : "";
  a.download = `${fileStem(className, dayLabel)}${modeSuffix}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}
