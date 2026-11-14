import { Capacitor } from "@capacitor/core";

/** Convert a Blob to base64 (no data: prefix) for Capacitor Filesystem. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || "");
      const comma = raw.indexOf(",");
      resolve(comma >= 0 ? raw.slice(comma + 1) : raw);
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(blob);
  });
}

function safeFileName(name: string, fallback = "download.pdf"): string {
  const cleaned = String(name || fallback).replace(/[^\w.\-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

/**
 * Save a blob as a file download.
 * - Web: standard browser download
 * - Capacitor (Android/iOS): write to Documents, then open the native share sheet
 *   so the PDF can be saved/opened without leaving the app for Chrome.
 */
export async function downloadBlobFile(blob: Blob, fileName: string): Promise<void> {
  const name = safeFileName(fileName);

  if (Capacitor.isNativePlatform()) {
    try {
      const { Directory, Filesystem } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");
      const data = await blobToBase64(blob);
      await Filesystem.writeFile({
        path: name,
        data,
        directory: Directory.Documents,
      });
      const { uri } = await Filesystem.getUri({
        path: name,
        directory: Directory.Documents,
      });
      await Share.share({
        title: name,
        url: uri,
        dialogTitle: "Save result PDF",
      });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "");
      // Share sheet cancel is fine — file may already be saved.
      if (/cancel|dismiss|abort/i.test(message)) return;
      // Plugin missing / native bridge not ready → fall through to web download.
      if (!/not implemented|plugin|unavailable|reject/i.test(message)) throw error;
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
