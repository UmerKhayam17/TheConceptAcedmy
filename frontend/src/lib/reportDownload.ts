/** Shared report delivery: PDF opens in a preview tab; Excel downloads. */

export type ReportFileFormat = "pdf" | "xlsx";

/** Sanitize a token for filenames: `Ali Khan` → `Ali-Khan`. */
export function safeReportFileToken(value: string, fallback = "report"): string {
  const cleaned = String(value || fallback)
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "");
  return cleaned || fallback;
}

/**
 * Deliver a generated report blob.
 * - PDF → browser preview tab (print / download from there)
 * - Excel → direct file download
 */
export function deliverReportBlob(
  blob: Blob,
  fileName: string,
  format: ReportFileFormat,
  previewWindow?: Window | null,
): "preview" | "download" {
  const url = URL.createObjectURL(blob);
  const name = fileName.endsWith(`.${format}`) ? fileName : `${fileName}.${format}`;

  if (format === "pdf") {
    const win = previewWindow && !previewWindow.closed ? previewWindow : null;
    if (win) {
      writePdfPreview(win, url, name);
      win.focus();
      // Keep the file available while the preview is open so Download still works later.
      const revoke = () => URL.revokeObjectURL(url);
      win.addEventListener("pagehide", revoke);
      window.setTimeout(revoke, 30 * 60_000);
      return "preview";
    }
    // Popup blocked — fall back to download
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return "download";
  }

  previewWindow?.close();
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return "download";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Fill the preview tab with the PDF plus a toolbar. Saving from the browser's own PDF
 * viewer names a blob file with a random id, so the Download button carries the real name.
 */
function writePdfPreview(win: Window, url: string, name: string) {
  const safeName = escapeHtml(name);
  const doc = win.document;
  doc.open();
  doc.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeName}</title>
  <style>
    html, body { margin: 0; height: 100%; background: #525659; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
    .bar { position: fixed; inset: 0 0 auto 0; height: 52px; box-sizing: border-box; padding: 0 16px;
      display: flex; align-items: center; justify-content: space-between; gap: 12px; background: #0E2A4E; color: #fff; }
    .name { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .actions { display: flex; gap: 8px; flex-shrink: 0; }
    .btn { font: inherit; font-size: 13px; font-weight: 600; border: 0; border-radius: 6px; padding: 8px 14px;
      cursor: pointer; text-decoration: none; }
    .print { background: #fff; color: #0E2A4E; }
    .download { background: #E8A317; color: #111; }
    iframe { position: fixed; top: 52px; left: 0; width: 100%; height: calc(100% - 52px); border: 0; background: #525659; }
  </style>
</head>
<body>
  <div class="bar">
    <span class="name">${safeName}</span>
    <div class="actions">
      <button type="button" class="btn print" id="report-print">Print</button>
      <a class="btn download" href="${url}" download="${safeName}">Download PDF</a>
    </div>
  </div>
  <iframe id="report-pdf" src="${url}" title="${safeName}"></iframe>
</body>
</html>`);
  doc.close();
  // Attached from here rather than an inline script so a page CSP cannot block it.
  doc.getElementById("report-print")?.addEventListener("click", () => {
    const frame = doc.getElementById("report-pdf") as HTMLIFrameElement | null;
    try {
      frame?.contentWindow?.focus();
      frame?.contentWindow?.print();
    } catch {
      win.print();
    }
  });
}

/** Open a blank tab early (before await) so the popup is not blocked. */
export function openReportPreviewTab(format: ReportFileFormat): Window | null {
  if (format !== "pdf") return null;
  return window.open("about:blank", "_blank");
}
