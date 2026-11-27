import { adoptLoginSession, authedFetch, ensureAccessToken, type LoginSessionPayload } from "@/lib/auth";
import { getApiRoot, parseJson } from "@/lib/api";
import { downloadBlobFile } from "@/lib/downloadFile";

export interface BackupCollectionInfo {
  name: string;
  count: number;
}

export interface BackupFileInfo {
  createdAt?: string;
  database?: string;
  collections: BackupCollectionInfo[];
  totalDocs: number;
  /** Uploaded files (photos, slips, papers) in the backup; absent in old database-only backups. */
  files?: { count: number; bytes: number };
}

export interface RestoreResult extends BackupFileInfo {
  restoredDocs: number;
  restoredFiles: number;
  safetyBackup: string;
  /** New login for the restored main-admin account (null if it is not in the backup). */
  session?: LoginSessionPayload | null;
  /** Set on the client: true when this tab switched to that session. */
  signedIn?: boolean;
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = await parseJson<{ message?: string }>(res);
  return body?.message || fallback;
}

export interface BackupSettings {
  configured: boolean;
  backupPath: string | null;
}

export async function fetchBackupSettings(): Promise<BackupSettings> {
  const res = await authedFetch("/backup/settings", { method: "GET" });
  if (!res.ok) throw new Error(await errorMessage(res, "Could not load backup settings"));
  const body = await parseJson<{ data?: BackupSettings }>(res);
  return body.data || { configured: false, backupPath: null };
}

/** Set (or change) the server folder where backups are stored. */
export async function saveBackupSettings(backupPath: string): Promise<BackupSettings> {
  const res = await authedFetch("/backup/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ backupPath }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Could not save backup path"));
  const body = await parseJson<{ data?: BackupSettings }>(res);
  if (!body.data?.configured) throw new Error("Backup path was not saved");
  return body.data;
}

/** Download the full database plus uploaded files as one .ndjson.gz file. */
export async function downloadDatabaseBackup(): Promise<string> {
  const res = await authedFetch("/backup/download", { method: "GET" });
  if (!res.ok) throw new Error(await errorMessage(res, "Backup failed"));
  const name =
    res.headers.get("X-Backup-Filename") ||
    res.headers.get("Content-Disposition")?.match(/filename="?([^";]+)"?/)?.[1] ||
    "academy-backup.ndjson.gz";
  const blob = await res.blob();
  if (!blob.size) throw new Error("Backup download was empty");
  await downloadBlobFile(blob, name);
  return name;
}

/**
 * Read the header line of a backup file in the browser (no upload), so the admin
 * can see when it was made before confirming. Returns null if the browser cannot
 * decompress gzip; throws if the file is clearly not a backup.
 */
export async function readBackupHeader(file: File): Promise<BackupFileInfo | null> {
  if (typeof DecompressionStream === "undefined") return null;
  const reader = file
    .stream()
    .pipeThrough(new DecompressionStream("gzip"))
    .pipeThrough(new TextDecoderStream())
    .getReader();
  let text = "";
  try {
    while (!text.includes("\n") && text.length < 2_000_000) {
      const { value, done } = await reader.read();
      if (done) break;
      text += value;
    }
  } catch {
    throw new Error("This is not a valid backup file");
  } finally {
    void reader.cancel().catch(() => {});
  }
  let header: {
    type?: string;
    format?: string;
    createdAt?: string;
    database?: string;
    collections?: BackupCollectionInfo[];
    files?: { count: unknown; bytes: unknown };
  };
  try {
    header = JSON.parse(text.split("\n")[0]);
  } catch {
    throw new Error("This is not a valid backup file");
  }
  if (header?.type !== "header" || header.format !== "academy-backup") {
    throw new Error("This is not an academy backup file");
  }
  // Counts are Extended JSON ({"$numberInt":"12"}, $numberLong, …) in the file.
  const toNumber = (v: unknown) =>
    Number(v && typeof v === "object" ? Object.values(v as Record<string, unknown>)[0] : v) || 0;
  const collections = (header.collections || []).map((c) => ({
    name: c.name,
    count: toNumber(c.count),
  }));
  return {
    createdAt: header.createdAt,
    database: header.database,
    collections,
    totalDocs: collections.reduce((sum, c) => sum + c.count, 0),
    files: header.files
      ? { count: toNumber(header.files.count), bytes: toNumber(header.files.bytes) }
      : undefined,
  };
}

export type RestorePhase =
  | "uploading"
  | "validating"
  | "safety"
  | "restoring"
  | "rolling_back"
  | "done"
  | "failed";

export interface RestoreProgress {
  phase: RestorePhase;
  /** 0–100 across the whole restore. */
  percent: number;
  /** 0–100 within the current step. */
  stepPercent: number;
  done: number;
  total: number;
}

/** Share of the overall bar each step covers: [start, end]. */
const PHASE_RANGE: Record<RestorePhase, [number, number]> = {
  uploading: [0, 25],
  validating: [25, 40],
  safety: [40, 60],
  restoring: [60, 99],
  rolling_back: [60, 99],
  done: [100, 100],
  failed: [0, 0],
};

function makeProgress(phase: RestorePhase, done: number, total: number): RestoreProgress {
  const stepPercent = total > 0 ? Math.min(100, (done / total) * 100) : 0;
  const [start, end] = PHASE_RANGE[phase];
  return { phase, done, total, stepPercent, percent: start + ((end - start) * stepPercent) / 100 };
}

function newJobId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Server-side progress (plain fetch: no login needed while accounts are being replaced). */
async function fetchRestoreStatus(jobId: string) {
  try {
    const res = await fetch(`${getApiRoot()}/backup/status/${encodeURIComponent(jobId)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = await parseJson<{ data?: { phase: RestorePhase; done: number; total: number } }>(res);
    return body.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Upload a backup and replace the whole database (and uploaded files) with it.
 * Reports upload progress, then the server's own progress, through `onProgress`.
 * When the server signs the admin back in, the new session is adopted here.
 */
export async function restoreDatabaseBackup(
  file: File,
  onProgress: (p: RestoreProgress) => void = () => {},
): Promise<RestoreResult> {
  const jobId = newJobId();
  const fd = new FormData();
  // Text fields must come before the file for the server to see them.
  fd.append("confirm", "RESTORE");
  fd.append("jobId", jobId);
  fd.append("file", file);

  const token = await ensureAccessToken();
  let uploadDone = false;
  let finished = false;
  onProgress(makeProgress("uploading", 0, file.size));

  const poll = window.setInterval(async () => {
    if (!uploadDone || finished) return;
    const s = await fetchRestoreStatus(jobId);
    if (s && !finished && s.phase !== "done" && s.phase !== "failed") {
      onProgress(makeProgress(s.phase, s.done, s.total));
    }
  }, 600);

  try {
    const { status, body } = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${getApiRoot()}/backup/restore`);
      xhr.withCredentials = true;
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(makeProgress("uploading", e.loaded, e.total));
      };
      xhr.upload.onload = () => {
        uploadDone = true;
        onProgress(makeProgress("validating", 0, 1));
      };
      xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
      xhr.onerror = () => reject(new Error("Network error while restoring. Check the server and try again."));
      xhr.onabort = () => reject(new Error("Restore was cancelled"));
      xhr.send(fd);
    });
    finished = true;

    let parsed: { success?: boolean; message?: string; data?: RestoreResult } = {};
    try {
      parsed = body ? JSON.parse(body) : {};
    } catch {
      /* non-JSON error page */
    }
    if (status < 200 || status >= 300 || !parsed.data) {
      throw new Error(parsed.message || `Restore failed (HTTP ${status})`);
    }

    const result = parsed.data;
    if (result.session?.accessToken && result.session.user) {
      try {
        adoptLoginSession(result.session);
        result.signedIn = true;
      } catch {
        result.signedIn = false;
      }
    } else {
      result.signedIn = false;
    }
    onProgress(makeProgress("done", 1, 1));
    return result;
  } finally {
    finished = true;
    window.clearInterval(poll);
  }
}
