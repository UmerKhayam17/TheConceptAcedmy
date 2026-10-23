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
      win.location.replace(url);
      win.focus();
      window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
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

/** Open a blank tab early (before await) so the popup is not blocked. */
export function openReportPreviewTab(format: ReportFileFormat): Window | null {
  if (format !== "pdf") return null;
  return window.open("about:blank", "_blank");
}
