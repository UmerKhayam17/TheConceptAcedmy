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

/**
 * Print layout matched to academy timetable sheet:
 * centered title, Class | Period columns, subject + full teacher name.
 */
export function printClassBoard(opts: {
  title: string;
  subtitle: string;
  rows: ClassBoardExportRow[];
  periods: PeriodSlot[];
  className?: string;
  dayLabel?: string;
  sessionName?: string;
  effectiveDate?: string;
}): void {
  const { rows, periods, dayLabel, sessionName, effectiveDate } = opts;
  if (!rows.length || !periods.length) {
    throw new Error("Nothing to print — load a class board first.");
  }

  const matrix = buildMatrix(rows, periods);
  const dateLabel = effectiveDate || formatEffectiveDate();
  const line2Parts = ["Timetable"];
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

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Class Timetable</title>
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
      width: 72px;
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
      padding: 10px 6px;
      border: 1px solid #000;
      white-space: nowrap;
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

  // Blob URL so the print footer is not the panel page URL / separator line.
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

/** Downloads Class Board as an Excel-compatible .xls (HTML table). */
export function exportClassBoardExcel(opts: {
  className?: string;
  dayLabel: string;
  rows: ClassBoardExportRow[];
  periods: PeriodSlot[];
}): void {
  const { className, dayLabel, rows, periods } = opts;
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
  const tableRows = [
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
  a.download = `${fileStem(className, dayLabel)}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}
