const path = require('path');

/**
 * Upload safety: files under /uploads are served from the API's own origin, so a stored
 * .html/.js/.svg file opened directly could run script with the app's privileges (stored XSS).
 * Two layers:
 *  1. Upload allow-lists (below) — the stored extension and MIME type come from the server,
 *     never from the client's filename or Content-Type.
 *  2. Serving headers (setUploadSecurityHeaders) — applied to EVERY file, including ones
 *     uploaded before this fix.
 */

/** Chat attachments: extension → MIME type we store and serve. Mirrors the chat input's `accept`. */
const CHAT_FILE_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.rtf': 'application/rtf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

/** Photos (profile, student, test paper). */
const IMAGE_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

/** Payment slips: photo or PDF. */
const SLIP_TYPES = { ...IMAGE_TYPES, '.pdf': 'application/pdf' };

/** Client MIME types that are never accepted, whatever the extension says. */
// Exact types only: a loose /xml/ would also reject Word/Excel (application/vnd.openxmlformats-…).
const DANGEROUS_MIME =
  /^(text\/html|application\/xhtml\+xml|text\/xml|application\/xml|(text|application)\/(x-)?(javascript|ecmascript)|application\/x-(sh|msdownload|msdos-program|httpd-php)|application\/java-archive)$/i;

/**
 * Safe to display in the browser tab; everything else is forced to download.
 * SVG is shown inline (chat thumbnails need image/svg+xml) — its scripts cannot run because
 * every upload is served with the CSP sandbox below.
 */
const INLINE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.heic', '.heif', '.pdf', '.mp4', '.mp3', '.ogg', '.wav']);

function extOf(filename) {
  return path.extname(String(filename || '')).toLowerCase();
}

/**
 * Check an uploaded file against an allow-list. Returns { ext, mime } (server-decided) or null.
 * The extension must be listed; the client's MIME type must agree with it (when `strictMime`)
 * or at least not be a dangerous type.
 */
function classifyUpload(file, allowed, { strictMime = false } = {}) {
  const ext = extOf(file?.originalname);
  const mime = allowed[ext];
  if (!mime) return null;
  const clientMime = String(file?.mimetype || '').toLowerCase();
  if (DANGEROUS_MIME.test(clientMime) && !(ext === '.svg' && clientMime === 'image/svg+xml')) return null;
  if (strictMime) {
    const sameFamily = clientMime === mime || (mime === 'image/jpeg' && clientMime === 'image/jpg');
    if (!sameFamily) return null;
  }
  return { ext, mime };
}

/** express.static `setHeaders` hook for /uploads. */
function setUploadSecurityHeaders(res, filePath) {
  const ext = extOf(filePath);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (ext !== '.pdf') {
    // An opaque, script-less sandbox: even an HTML/SVG file opened directly cannot run code
    // or read the app's storage. (PDF is left out: browsers refuse to render PDFs in a sandbox.)
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox"
    );
  }
  if (!INLINE_EXT.has(ext)) {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment');
  }
}

module.exports = {
  CHAT_FILE_TYPES,
  IMAGE_TYPES,
  SLIP_TYPES,
  classifyUpload,
  setUploadSecurityHeaders,
};
