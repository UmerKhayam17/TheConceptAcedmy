import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Database,
  DatabaseBackup,
  Download,
  FileArchive,
  FileImage,
  FolderCog,
  HardDrive,
  Loader2,
  Pencil,
  ShieldCheck,
  Upload,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { logout } from "@/lib/auth";
import {
  downloadDatabaseBackup,
  fetchBackupSettings,
  readBackupHeader,
  restoreDatabaseBackup,
  saveBackupSettings,
  type BackupFileInfo,
  type RestorePhase,
  type RestoreProgress,
  type RestoreResult,
} from "@/lib/backupApi";
import { cn } from "@/lib/utils";

/** Same modal chrome as Give advance / loan. */
const restoreFormLabelClass = "text-sm font-medium text-muted-foreground";
const restoreFormControlClass =
  "h-10 min-w-0 rounded-md border-input bg-background text-sm font-mono tracking-wide focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0";
const restoreSectionTitleClass = "text-sm font-semibold text-primary";
const restoreSectionCardClass = "rounded-md border bg-background p-4 space-y-3";
const restoreCancelBtnClass =
  "h-10 w-full gap-2 border-primary text-primary hover:bg-primary/5 hover:text-primary sm:w-auto";
const restorePrimaryBtnClass = "h-10 w-full gap-2 sm:w-auto";
const restoreDialogShellClass = cn(
  "flex w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:w-full sm:max-w-[36rem] sm:p-0 max-h-[94dvh]",
  "[&>button]:right-5 [&>button]:top-5 [&>button]:text-primary-foreground [&>button]:opacity-100 [&>button]:hover:text-primary-foreground",
);

function formatDate(iso?: string) {
  if (!iso) return "unknown date";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function restoreDialogTitle(opts: {
  result: RestoreResult | null;
  error: string | null;
  restoring: boolean;
}) {
  if (opts.result) return "Restore complete";
  if (opts.error) return "Restore failed";
  if (opts.restoring) return "Restoring…";
  return "Confirm full restore";
}

function restoreDialogDescription(opts: {
  result: RestoreResult | null;
  error: string | null;
  restoring: boolean;
}) {
  if (opts.result) return "The system has been replaced with the selected backup.";
  if (opts.error) return "Previous data should have been put back if a safety copy was made.";
  if (opts.restoring) return "Keep this window open until every step finishes.";
  return "This will replace the live database and uploaded files.";
}

function restoreDialogIcon(opts: {
  result: RestoreResult | null;
  error: string | null;
  restoring: boolean;
}) {
  if (opts.result) return CheckCircle2;
  if (opts.error) return XCircle;
  if (opts.restoring) return Loader2;
  return DatabaseBackup;
}

/** Steps shown in the restore progress list, in order. */
const STEPS: { phase: RestorePhase; label: string }[] = [
  { phase: "uploading", label: "Uploading backup file" },
  { phase: "validating", label: "Checking the backup file" },
  { phase: "safety", label: "Saving a safety copy of current data" },
  { phase: "restoring", label: "Restoring records and files" },
];

const COVERAGE = [
  {
    title: "Whole database",
    description:
      "Students, fees, attendance, salaries, exams, timetable, users, roles, and settings.",
    icon: Database,
    iconBg: "#E0F2FE",
    iconColor: "#0284C7",
  },
  {
    title: "Uploaded files",
    description:
      "Student and staff photos, face photos, payment slips, test papers, and chat attachments.",
    icon: FileImage,
    iconBg: "#DCFCE7",
    iconColor: "#16A34A",
  },
  {
    title: "Safe restore",
    description:
      "File is validated first. A safety copy is saved. On failure, current data is restored.",
    icon: ShieldCheck,
    iconBg: "#FEF3C7",
    iconColor: "#D97706",
  },
] as const;

function stepState(step: RestorePhase, current: RestorePhase | null): "done" | "active" | "todo" {
  if (!current) return "todo";
  if (current === "done") return "done";
  const order = STEPS.map((s) => s.phase);
  const cur = current === "rolling_back" ? order.indexOf("restoring") : order.indexOf(current);
  const idx = order.indexOf(step);
  if (idx < cur) return "done";
  if (idx === cur) return "active";
  return "todo";
}

/** Administration → Database Backup (main admin only; access gated by resolveModuleCaps). */
const BackupModule = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<BackupFileInfo | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [progress, setProgress] = useState<RestoreProgress | null>(null);
  const [result, setResult] = useState<RestoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pathDraft, setPathDraft] = useState("");
  const [editingPath, setEditingPath] = useState(false);

  const {
    data: settings,
    isLoading: settingsLoading,
    isError: settingsError,
    error: settingsErr,
  } = useQuery({
    queryKey: ["backup-settings"],
    queryFn: fetchBackupSettings,
  });

  const pathConfigured = Boolean(settings?.configured && settings.backupPath);
  const showSetup = !settingsLoading && !pathConfigured;

  const savePathMut = useMutation({
    mutationFn: (backupPath: string) => saveBackupSettings(backupPath),
    onSuccess: (data) => {
      qc.setQueryData(["backup-settings"], data);
      setEditingPath(false);
      setPathDraft(data.backupPath || "");
      toast({
        title: "Backup folder saved",
        description: `Backups will be stored at ${data.backupPath}`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not save path",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const restoring = Boolean(progress) && !result && !error;
  const RestoreHeaderIcon = restoreDialogIcon({ result, error, restoring });

  const handleDownload = async () => {
    if (!pathConfigured) {
      toast({
        title: "Backup folder required",
        description: "Set a server backup folder before creating a backup.",
        variant: "destructive",
      });
      return;
    }
    setDownloading(true);
    try {
      const name = await downloadDatabaseBackup();
      toast({
        title: "Backup downloaded",
        description: `Saved to your Downloads as ${name}.`,
      });
    } catch (err) {
      toast({
        title: "Backup failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleFilePicked = async (picked: File | undefined) => {
    if (fileInput.current) fileInput.current.value = "";
    if (!picked) return;
    try {
      const header = await readBackupHeader(picked);
      setInfo(header);
      setConfirmText("");
      setProgress(null);
      setResult(null);
      setError(null);
      setFile(picked);
    } catch (err) {
      toast({
        title: "Cannot use this file",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };

  const closeDialog = () => {
    if (restoring) return;
    setFile(null);
    setInfo(null);
    setConfirmText("");
    setProgress(null);
    setResult(null);
    setError(null);
  };

  const handleRestore = async () => {
    if (!file || confirmText !== "RESTORE") return;
    setError(null);
    setResult(null);
    try {
      const res = await restoreDatabaseBackup(file, setProgress);
      setResult(res);
      if (!res.signedIn) {
        window.setTimeout(() => {
          void logout().finally(() => window.location.assign("/login"));
        }, 4000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const finishAndReload = () => {
    window.location.reload();
  };

  const busy = downloading || restoring;

  return (
    <div className="min-h-full bg-slate-50 px-3 py-4 sm:px-6 sm:py-6 lg:px-8 space-y-5">
      {/* Page header — matches Staff Salary / Fee Management */}
      <div className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
              <DatabaseBackup className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight">
                Database Backup
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500 max-w-lg">
                Create a full academy snapshot, or restore from a verified backup file.
              </p>
            </div>
          </div>
          <div className="shrink-0 rounded-lg bg-primary/10 px-3 py-2 max-w-[14rem]">
            <p className="text-xs sm:text-sm italic leading-snug text-[#1a2b4b]/80">
              <span className="mr-1 text-primary not-italic font-serif text-base leading-none">
                &ldquo;
              </span>
              Protect today&apos;s work for tomorrow.
              <span className="ml-0.5 text-primary not-italic font-serif text-base leading-none">
                &rdquo;
              </span>
            </p>
          </div>
        </div>
      </div>

      {settingsLoading ? (
        <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-6 text-sm text-slate-500 shadow-sm ring-1 ring-black/[0.04]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading backup settings…
        </div>
      ) : null}

      {settingsError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {(settingsErr as Error)?.message || "Could not load backup settings."}
        </div>
      ) : null}

      {/* First-time setup — required before Create / Restore are available */}
      {showSetup || editingPath ? (
        <section className="rounded-xl border border-primary/20 bg-white p-5 shadow-sm ring-1 ring-black/[0.04] sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#EEF5FF] text-[#1769E0]">
              <FolderCog className="h-5 w-5" strokeWidth={2.25} />
            </span>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                  {showSetup ? "Required once" : "Update path"}
                </p>
                <h3 className="mt-1 text-base font-bold text-[#1a2b4b]">
                  {showSetup ? "Set backup folder" : "Change backup folder"}
                </h3>
                <p className="mt-1 text-sm leading-snug text-slate-500">
                  Enter a full folder path <strong className="font-medium text-[#1a2b4b]">on this
                  server</strong> (for example <span className="font-mono text-xs">D:\AcademyBackups</span>).
                  Used for restore safety copies. Create backup downloads only to this computer.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="backup-path">Backup folder path</Label>
                <Input
                  id="backup-path"
                  value={pathDraft}
                  onChange={(e) => setPathDraft(e.target.value)}
                  placeholder={
                    typeof navigator !== "undefined" && /win/i.test(navigator.userAgent)
                      ? "D:\\AcademyBackups"
                      : "/var/backups/academy"
                  }
                  className="font-mono text-sm"
                  disabled={savePathMut.isPending}
                  autoComplete="off"
                  autoFocus={showSetup}
                />
                <p className="text-xs text-muted-foreground">
                  The folder is created if it does not exist. The server process must be allowed to
                  write there.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="h-10 gap-2 rounded-lg bg-[#1a2b4b] text-white hover:bg-[#142238]"
                  disabled={savePathMut.isPending || !pathDraft.trim()}
                  onClick={() => savePathMut.mutate(pathDraft.trim())}
                >
                  {savePathMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {savePathMut.isPending ? "Saving…" : "Save backup folder"}
                </Button>
                {editingPath && pathConfigured ? (
                  <Button
                    variant="outline"
                    className="h-10"
                    disabled={savePathMut.isPending}
                    onClick={() => {
                      setEditingPath(false);
                      setPathDraft(settings?.backupPath || "");
                    }}
                  >
                    Cancel
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {pathConfigured && !editingPath ? (
        <div className="flex flex-col gap-2 rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-black/[0.04] sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Backup folder
            </p>
            <p className="mt-0.5 truncate font-mono text-sm text-[#1a2b4b]">{settings?.backupPath}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 shrink-0 gap-1.5"
            onClick={() => {
              setPathDraft(settings?.backupPath || "");
              setEditingPath(true);
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
            Change
          </Button>
        </div>
      ) : null}

      {/* Create / Restore only after a backup folder is configured */}
      {pathConfigured && !editingPath ? (
      <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
        <section className="flex h-full flex-col rounded-xl bg-white p-5 shadow-sm ring-1 ring-black/[0.04]">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#EEF5FF] text-[#1769E0]">
              <HardDrive className="h-5 w-5" strokeWidth={2.25} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-[#1a2b4b]">Create backup</h3>
              <p className="mt-1 min-h-[2.5rem] text-sm leading-snug text-slate-500">
                Download a compressed snapshot to this computer (browser Downloads folder only).
              </p>
            </div>
          </div>
          <div className="mt-4 flex min-h-[4.5rem] flex-1 flex-col justify-center rounded-lg border border-slate-200 bg-slate-50/80 px-3.5 py-3">
            <Button
              className="h-10 w-full gap-2 rounded-lg bg-[#1a2b4b] text-white hover:bg-[#142238] sm:w-auto"
              onClick={() => void handleDownload()}
              disabled={busy || !pathConfigured || editingPath}
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {downloading ? "Preparing backup…" : "Download backup"}
            </Button>
            <p className="mt-2 text-xs text-slate-500">
              {downloading
                ? "Preparing your snapshot. Please keep this page open until the download finishes."
                : "Saves only to your browser Downloads, not to the configured server folder."}
            </p>
          </div>
        </section>

        <section className="flex h-full flex-col rounded-xl bg-white p-5 shadow-sm ring-1 ring-black/[0.04]">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#FFF7ED] text-[#EA580C]">
              <Upload className="h-5 w-5" strokeWidth={2.25} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-[#1a2b4b]">Restore from backup</h3>
              <p className="mt-1 min-h-[2.5rem] text-sm leading-snug text-slate-500">
                Replace the live system with a previous backup. Requires confirmation and runs a
                safety copy first.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              if (!busy) setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (busy) return;
              void handleFilePicked(e.dataTransfer.files?.[0]);
            }}
            className={cn(
              "mt-4 flex min-h-[4.5rem] flex-1 w-full items-center gap-3 rounded-lg border border-dashed px-3.5 py-3 text-left transition-colors",
              dragOver
                ? "border-primary bg-primary/5"
                : "border-slate-200 bg-slate-50/80 hover:border-slate-300 hover:bg-slate-50",
              busy && "pointer-events-none opacity-60",
            )}
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white shadow-sm ring-1 ring-slate-200/80">
              <FileArchive className="h-4 w-4 text-slate-600" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-[#1a2b4b]">
                Drop a file here, or browse
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                Accepts <span className="font-medium">.ndjson.gz</span> academy backups
              </span>
            </span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".gz,application/gzip"
            className="hidden"
            onChange={(e) => void handleFilePicked(e.target.files?.[0])}
          />
        </section>
      </div>
      ) : null}

      {/* What’s included */}
      <div>
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          What&apos;s included
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {COVERAGE.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/[0.04]"
              >
                <span
                  className="grid h-10 w-10 place-items-center rounded-lg"
                  style={{ backgroundColor: item.iconBg, color: item.iconColor }}
                >
                  <Icon className="h-5 w-5" strokeWidth={2.25} />
                </span>
                <p className="mt-3 text-sm font-bold text-[#1a2b4b]">{item.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{item.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Security / ops notes */}
      <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-4 sm:p-5">
        <div className="flex gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700">
            <AlertTriangle className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <div className="min-w-0 space-y-2">
            <p className="text-sm font-bold text-amber-950">Before you restore</p>
            <ul className="space-y-1.5 text-xs leading-relaxed text-amber-900/90 sm:text-[13px]">
              <li>
                Backup files contain private data (including password hashes). Store them securely.
              </li>
              <li>
                Restore <strong>replaces everything</strong> with the backup. Data added after that
                backup was made will be lost.
              </li>
              <li>
                Other signed-in users are paused during restore and should reload afterwards.
              </li>
              <li>
                Server config files (<span className="font-mono text-[11px]">.env</span>, Firebase
                keys) are not included. Keep your own copies.
              </li>
            </ul>
          </div>
        </div>
      </div>

      <Dialog
        open={Boolean(file)}
        onOpenChange={(open) => {
          if (!open && !restoring) closeDialog();
        }}
      >
        <DialogContent
          className={restoreDialogShellClass}
          onClose={() => {
            if (!restoring) closeDialog();
          }}
          onPointerDownOutside={(e) => {
            if (restoring) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (restoring) e.preventDefault();
          }}
        >
          <DialogHeader className="shrink-0 space-y-1 bg-primary px-6 py-4 pr-12 text-left text-primary-foreground">
            <DialogTitle className="flex items-center gap-3 text-xl font-semibold text-primary-foreground">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-foreground/15">
                <RestoreHeaderIcon
                  className={cn("h-5 w-5", restoring && !result && !error && "animate-spin")}
                />
              </span>
              {restoreDialogTitle({ result, error, restoring })}
            </DialogTitle>
            <DialogDescription className="pl-12 text-primary-foreground/80">
              {restoreDialogDescription({ result, error, restoring })}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/30 px-5 py-4">
            <div className="space-y-4">
              <section className={restoreSectionCardClass}>
                <p className={restoreSectionTitleClass}>Backup file</p>
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <FileArchive className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-semibold text-foreground">{file?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {file ? formatSize(file.size) : ""}
                      {info ? ` · Made ${formatDate(info.createdAt)}` : ""}
                    </p>
                    {info ? (
                      <p className="text-xs text-muted-foreground">
                        {info.totalDocs.toLocaleString()} records · {info.collections.length} tables
                        {info.files
                          ? ` · ${info.files.count.toLocaleString()} files (${formatSize(info.files.bytes)})`
                          : ""}
                      </p>
                    ) : null}
                    {info && !info.files ? (
                      <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                        Older backup: no uploaded files inside. Current photos and documents stay as
                        they are.
                      </p>
                    ) : null}
                  </div>
                </div>
              </section>

              {progress || result || error ? (
                <section className={restoreSectionCardClass}>
                  <p className={restoreSectionTitleClass}>
                    {result ? "Result" : error ? "Progress" : "Progress"}
                  </p>
                  {!error ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{result ? "Finished" : "Overall progress"}</span>
                        <span className="font-medium tabular-nums text-foreground">
                          {Math.round(result ? 100 : progress?.percent ?? 0)}%
                        </span>
                      </div>
                      <Progress value={result ? 100 : progress?.percent ?? 0} className="h-2" />
                    </div>
                  ) : null}
                  <ul className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
                    {STEPS.map((step) => {
                      const state = result ? "done" : stepState(step.phase, progress?.phase ?? null);
                      const failedHere = Boolean(error) && state === "active";
                      return (
                        <li key={step.phase} className="flex items-center gap-2 text-sm">
                          {failedHere ? (
                            <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                          ) : state === "done" ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                          ) : state === "active" ? (
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                          ) : (
                            <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                          )}
                          <span
                            className={cn(
                              "leading-snug",
                              state === "todo" ? "text-muted-foreground" : "text-foreground",
                              state === "active" && !error && "font-medium",
                            )}
                          >
                            {step.phase === "restoring" && progress?.phase === "rolling_back"
                              ? "Something failed: putting previous data back"
                              : step.label}
                            {state === "active" && !error && progress && progress.total > 1
                              ? ` (${Math.round(progress.stepPercent)}%)`
                              : ""}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  {result ? (
                    <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
                      {result.restoredDocs.toLocaleString()} records and{" "}
                      {result.restoredFiles.toLocaleString()} files restored from{" "}
                      {formatDate(result.createdAt)}.{" "}
                      {result.signedIn
                        ? "You are still signed in."
                        : "Your account was not in this backup. You will be signed out to log in again."}
                    </p>
                  ) : null}
                  {error ? (
                    <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                      {error}
                    </p>
                  ) : null}
                </section>
              ) : (
                <>
                  <section className={restoreSectionCardClass}>
                    <p className={cn(restoreSectionTitleClass, "flex items-center gap-1.5")}>
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                      Warning
                    </p>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      All current data and uploaded files will be{" "}
                      <strong className="text-foreground">replaced</strong> by this backup. Anything
                      entered after it was made will be lost.
                    </p>
                  </section>

                  <section className={restoreSectionCardClass}>
                    <p className={restoreSectionTitleClass}>Confirmation</p>
                    <div className="min-w-0 space-y-1.5">
                      <Label htmlFor="restore-confirm" className={restoreFormLabelClass}>
                        Type <span className="font-mono font-semibold text-foreground">RESTORE</span>{" "}
                        to confirm
                      </Label>
                      <Input
                        id="restore-confirm"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        autoComplete="off"
                        placeholder="RESTORE"
                        className={restoreFormControlClass}
                      />
                      <p className="text-xs text-muted-foreground">
                        Required exactly as shown, in capitals.
                      </p>
                    </div>
                  </section>
                </>
              )}
            </div>
          </div>

          <DialogFooter className="shrink-0 flex-col gap-2 border-t bg-background px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:space-x-0">
            {result ? (
              result.signedIn ? (
                <Button className={restorePrimaryBtnClass} onClick={finishAndReload}>
                  Reload academy
                </Button>
              ) : null
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className={restoreCancelBtnClass}
                  onClick={closeDialog}
                  disabled={restoring}
                >
                  {error ? "Close" : "Cancel"}
                </Button>
                {!error ? (
                  <Button
                    type="button"
                    variant="destructive"
                    className={restorePrimaryBtnClass}
                    disabled={restoring || confirmText !== "RESTORE"}
                    onClick={() => void handleRestore()}
                  >
                    {restoring ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Restoring…
                      </>
                    ) : (
                      <>
                        <DatabaseBackup className="h-4 w-4" />
                        Restore database
                      </>
                    )}
                  </Button>
                ) : null}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BackupModule;
