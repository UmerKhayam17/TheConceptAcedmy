import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  Smartphone,
  ScanFace,
  BadgeCheck,
  Circle,
  UserPlus,
  UserRound,
  MonitorPlay,
  Cctv,
  Images,
  Trash2,
  Plus,
  Volume2,
  VolumeX,
  CheckCircle2,
  Clock3,
  LogOut,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import type { ModuleActionCaps } from "@/lib/permissions";
import {
  captureAiFace,
  deleteAiFaceImage,
  deleteAllAiFaceImages,
  fetchAiCameras,
  fetchAiCameraSnapshot,
  fetchAiPeople,
  fetchEnrollmentStatus,
  fetchAiFaceImageBlob,
  identifyAiFace,
  syncAiRoster,
  aiCameraAction,
  type AiPerson,
  type AiCamera,
} from "@/lib/aiAttendanceApi";
import { resolveUploadUrl } from "@/lib/api";
import {
  announceAttendance,
  loadVoiceSettings,
  primeAttendanceVoice,
  saveVoiceSettings,
  speakText,
  type AttendanceVoiceSettings,
} from "@/lib/attendanceVoice";
import socketService from "@/services/socket/socket.service";
import { holdScreenAwake, startBackgroundTicker } from "@/lib/backgroundTicker";
import { cn } from "@/lib/utils";

type Tab = "enrolled" | "enrollment" | "monitor" | "cameras";
/** Enrollment only — CCTV is for live attendance, not face registration. */
type EnrollMethod = "webcam" | "mobile";
type EnrollStatusFilter = "all" | "enrolled" | "not_enrolled";

const webcamSupported =
  typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

async function fileToJpegBase64(file: File, maxSide = 1280): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read image file"));
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.92);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Short label for the monitor status line. */
function monitorActionLabel(action?: string, status?: string | null) {
  switch (action) {
    case "check_in":
      return status ? status.replace(/_/g, " ") : "present";
    case "check_out":
      return "checked out";
    case "check_out_update":
      return "check-out time updated";
    case "already_marked":
    case "cooldown":
      return "already marked";
    default:
      return status ? status.replace(/_/g, " ") : "seen";
  }
}

type MonitorTone = "present" | "late" | "out" | "already" | "error";

/** One recently marked person shown as a big card on the live monitor. */
type MonitorHit = { key: string; name: string; label: string; pct: string; tone: MonitorTone; at: number };

function monitorTone(action?: string, status?: string | null, error?: string): MonitorTone {
  if (error) return "error";
  if (action === "check_out" || action === "check_out_update") return "out";
  if (action === "already_marked" || action === "cooldown") return "already";
  return status === "late" ? "late" : "present";
}

const MONITOR_TONE: Record<MonitorTone, { card: string; badge: string; Icon: LucideIcon }> = {
  present: {
    card: "bg-emerald-600 border-emerald-700 text-white",
    badge: "bg-white/20 text-white",
    Icon: CheckCircle2,
  },
  late: {
    card: "bg-amber-500 border-amber-600 text-white",
    badge: "bg-white/25 text-white",
    Icon: Clock3,
  },
  out: {
    card: "bg-sky-600 border-sky-700 text-white",
    badge: "bg-white/20 text-white",
    Icon: LogOut,
  },
  already: {
    card: "bg-emerald-50 border-emerald-400 text-emerald-900",
    badge: "bg-emerald-600 text-white",
    Icon: BadgeCheck,
  },
  error: {
    card: "bg-red-600 border-red-700 text-white",
    badge: "bg-white/20 text-white",
    Icon: AlertTriangle,
  },
};

function grabFromVideo(video: HTMLVideoElement | null): string | null {
  if (!video || !video.videoWidth || !video.videoHeight) return null;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.92);
}

function FaceThumb({ employeeId, enabled }: { employeeId: string; enabled: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) {
      setUrl(null);
      return;
    }
    let alive = true;
    let created = "";
    void fetchAiFaceImageBlob(employeeId, 0)
      .then((u) => {
        created = u;
        if (alive) setUrl(u);
        else URL.revokeObjectURL(u);
      })
      .catch(() => {
        if (alive) setUrl(null);
      });
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [employeeId, enabled]);

  return (
    <div className="h-11 w-11 rounded-lg overflow-hidden bg-muted shrink-0 border">
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full flex items-center justify-center text-muted-foreground">
          <ScanFace className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}

/** Profile photo when present; otherwise first enrollment face; otherwise placeholder. */
function PersonAvatar({
  person,
  selected,
}: {
  person: AiPerson;
  selected?: boolean;
}) {
  const profileSrc = person.photoUrl ? resolveUploadUrl(person.photoUrl) : "";
  const [profileFailed, setProfileFailed] = useState(false);
  useEffect(() => {
    setProfileFailed(false);
  }, [person.id, person.kind, person.photoUrl]);
  const showProfile = Boolean(profileSrc) && !profileFailed;

  if (showProfile) {
    return (
      <div
        className={cn(
          "h-11 w-11 rounded-lg overflow-hidden bg-muted shrink-0 border",
          selected && "ring-2 ring-primary-foreground/40",
        )}
      >
        <img
          src={profileSrc}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setProfileFailed(true)}
        />
      </div>
    );
  }

  if ((person.totalImages ?? 0) > 0) {
    return <FaceThumb employeeId={person.aiEmployeeId} enabled />;
  }

  return (
    <div
      className={cn(
        "h-11 w-11 rounded-lg overflow-hidden bg-muted shrink-0 border flex items-center justify-center text-muted-foreground",
        selected && "bg-primary-foreground/15 text-primary-foreground border-primary-foreground/30",
      )}
    >
      <UserRound className="h-4 w-4" />
    </div>
  );
}

function EnrollmentStatusBadge({
  enrolled,
  selected,
}: {
  enrolled: boolean;
  selected?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
        selected
          ? enrolled
            ? "bg-emerald-400/25 text-emerald-50"
            : "bg-primary-foreground/15 text-primary-foreground/90"
          : enrolled
            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
            : "bg-slate-100 text-slate-600 border border-slate-200",
      )}
    >
      {enrolled ? (
        <BadgeCheck className="h-3 w-3" />
      ) : (
        <Circle className="h-3 w-3" />
      )}
      {enrolled ? "Enrolled" : "Not enrolled"}
    </span>
  );
}

function FaceImageGrid({
  employeeId,
  count,
  canDelete,
  canAdd,
  busy,
  onDelete,
  onAdd,
}: {
  employeeId: string;
  count: number;
  canDelete?: boolean;
  canAdd?: boolean;
  busy?: boolean;
  onDelete?: (index: number) => void;
  onAdd?: () => void;
}) {
  const [urls, setUrls] = useState<string[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);

  useEffect(() => {
    if (!employeeId || count <= 0) {
      setUrls([]);
      return;
    }
    let cancelled = false;
    const created: string[] = [];
    void Promise.all(
      Array.from({ length: count }, (_, i) =>
        fetchAiFaceImageBlob(employeeId, i)
          .then((url) => {
            created.push(url);
            return url;
          })
          .catch(() => ""),
      ),
    ).then((next) => {
      if (cancelled) {
        created.forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      setUrls(next);
    });
    return () => {
      cancelled = true;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [employeeId, count]);

  if (count <= 0 && !canAdd) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center">
        <Images className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
        <p className="text-xs text-muted-foreground">No captured images yet</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {Array.from({ length: count }, (_, i) => (
          <div key={`${employeeId}-${i}`} className="relative aspect-square">
            <button
              type="button"
              className="h-full w-full rounded-lg overflow-hidden border bg-muted"
              onClick={() => urls[i] && setPreview(urls[i])}
            >
              {urls[i] ? (
                <img src={urls[i]} alt={`Capture ${i + 1}`} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full animate-pulse bg-muted" />
              )}
            </button>
            {canDelete && (
              <button
                type="button"
                aria-label={`Remove photo ${i + 1}`}
                disabled={busy}
                className="absolute top-1 right-1 h-7 w-7 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-destructive disabled:opacity-50"
                onClick={(e) => {
                  e.stopPropagation();
                  setPendingDelete(i);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
        {canAdd && (
          <button
            type="button"
            disabled={busy}
            onClick={onAdd}
            className="aspect-square rounded-lg border border-dashed bg-muted/30 flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground hover:bg-muted/60"
          >
            <Plus className="h-5 w-5" />
            Add
          </button>
        )}
      </div>
      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-md p-2 sm:p-3">
          <DialogTitle className="sr-only">Captured face</DialogTitle>
          {preview ? (
            <img
              src={preview}
              alt="Captured face"
              className="w-full rounded-md object-contain max-h-[75vh]"
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <AlertDialog open={pendingDelete != null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this photo?</AlertDialogTitle>
            <AlertDialogDescription>
              This enrollment image will be deleted. If fewer than 5 photos remain, the person will
              no longer be enrolled until you add more.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDelete != null) onDelete?.(pendingDelete);
                setPendingDelete(null);
              }}
            >
              Remove photo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function AiAttendanceModule({ caps }: { caps: ModuleActionCaps }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const canWrite = caps.canEdit || caps.canCreate;
  const [tab, setTab] = useState<Tab>("enrolled");
  const [voice, setVoice] = useState<AttendanceVoiceSettings>(() => loadVoiceSettings());
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const updateVoice = (next: Partial<AttendanceVoiceSettings>) => {
    primeAttendanceVoice();
    setVoice((prev) => {
      const merged = { ...prev, ...next };
      saveVoiceSettings(merged);
      return merged;
    });
  };

  // CCTV marks happen on the server; announce them while this page is open.
  useEffect(() => {
    void socketService.connectPanel();
    const onSync = (raw: unknown) => {
      const event = raw as {
        action?: string;
        source?: string;
        name?: string;
        status?: string;
        attendanceAction?: string;
      };
      if (event?.action !== "ai-marked" || event.source !== "cctv") return;
      void announceAttendance(
        { name: event.name || "", status: event.status, action: event.attendanceAction },
        voiceRef.current
      );
    };
    socketService.onModuleSync(onSync);
    return () => socketService.offModuleSync(onSync);
  }, []);
  const [selected, setSelected] = useState<AiPerson | null>(null);
  const [search, setSearch] = useState("");
  const [enrollStatusFilter, setEnrollStatusFilter] = useState<EnrollStatusFilter>("all");
  const [enrollMethod, setEnrollMethod] = useState<EnrollMethod>(() => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches) {
      return "mobile";
    }
    return webcamSupported ? "webcam" : "mobile";
  });

  const enrollVideoRef = useRef<HTMLVideoElement>(null);
  const monitorVideoRef = useRef<HTMLVideoElement>(null);
  const enrollStreamRef = useRef<MediaStream | null>(null);
  const monitorStreamRef = useRef<MediaStream | null>(null);
  const [enrollCamOn, setEnrollCamOn] = useState(false);
  const [enrollCamReady, setEnrollCamReady] = useState(false);
  const [monitorCamOn, setMonitorCamOn] = useState(false);
  const [monitorCamReady, setMonitorCamReady] = useState(false);

  const mobileFileRef = useRef<HTMLInputElement>(null);
  const galleryFileRef = useRef<HTMLInputElement>(null);
  const monitorScanBusy = useRef(false);
  const [monitorWatch, setMonitorWatch] = useState("");
  const [monitorHits, setMonitorHits] = useState<MonitorHit[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [liveFrame, setLiveFrame] = useState<string | null>(null);
  const [liveMeta, setLiveMeta] = useState<{
    connected?: boolean;
    lastError?: string;
    lastMatch?: {
      name?: string;
      confidence?: number;
      attendance?: string;
      at?: string;
    } | null;
    lastUnknown?: { at?: string; count?: number } | null;
  }>({});
  const [cctvUnknown, setCctvUnknown] = useState<{ count: number } | null>(null);
  const [camActionBusy, setCamActionBusy] = useState(false);

  const { data: people } = useQuery({
    queryKey: ["ai-attendance-people"],
    queryFn: fetchAiPeople,
    enabled: tab === "enrollment" || tab === "enrolled",
  });

  const { data: enrollStatus, refetch: refetchEnroll } = useQuery({
    queryKey: ["ai-enroll", selected?.aiEmployeeId],
    queryFn: () => fetchEnrollmentStatus(selected!.aiEmployeeId),
    enabled: Boolean(selected?.aiEmployeeId) && tab === "enrollment",
  });

  const { data: camerasData, refetch: refetchCameras, isFetching: camerasFetching } = useQuery({
    queryKey: ["ai-cameras"],
    queryFn: fetchAiCameras,
    enabled: tab === "cameras",
    refetchInterval: tab === "cameras" ? 5_000 : false,
  });

  const cameras = camerasData?.cameras ?? [];

  useEffect(() => {
    if (tab !== "cameras") {
      setLiveFrame(null);
      return;
    }
    if (!selectedCameraId && cameras.length) {
      setSelectedCameraId(cameras[0]._id);
    }
  }, [tab, cameras, selectedCameraId]);

  // Auto-start active cameras when opening AI CCTV (Node --watch clears in-memory poller)
  useEffect(() => {
    if (!canWrite || tab !== "cameras" || !cameras.length || camActionBusy) return;
    const anyRunning = cameras.some((c) => c.runtime?.running);
    if (anyRunning) return;
    let cancelled = false;
    (async () => {
      try {
        await aiCameraAction("start_all");
        if (!cancelled) await refetchCameras();
      } catch (e) {
        if (!cancelled) {
          toast({
            title: "Could not auto-start cameras",
            description: e instanceof Error ? e.message : String(e),
            variant: "destructive",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // intentionally only when entering cameras tab / camera list first loads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, cameras.length, canWrite]);

  // Poll live snapshot for selected camera
  useEffect(() => {
    if (tab !== "cameras" || !selectedCameraId) return;
    let cancelled = false;
    const pull = async () => {
      try {
        const snap = await fetchAiCameraSnapshot(selectedCameraId);
        if (cancelled) return;
        if (snap.ok && snap.image) setLiveFrame(snap.image);
        setLiveMeta({
          connected: snap.connected,
          lastError: snap.error || snap.lastError || "",
          lastMatch: snap.lastMatch || null,
          lastUnknown: snap.lastUnknown || null,
        });
      } catch (e) {
        if (!cancelled) {
          setLiveMeta({
            connected: false,
            lastError: e instanceof Error ? e.message : String(e),
          });
        }
      }
    };
    void pull();
    const t = setInterval(() => void pull(), 1500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [tab, selectedCameraId]);

  // CCTV "face not recognised" stays while the server still sees the face; it clears lastUnknown once the face leaves.
  useEffect(() => {
    const count = Number(liveMeta.lastUnknown?.count) || 0;
    setCctvUnknown(count > 0 ? { count } : null);
  }, [liveMeta.lastUnknown?.at, liveMeta.lastUnknown?.count]);

  const runCameraAction = async (action: string, cameraId?: string) => {
    setCamActionBusy(true);
    try {
      await aiCameraAction(action, cameraId);
      toast({
        title:
          action === "start_all"
            ? "Starting cameras"
            : action === "stop_all"
              ? "Stopping cameras"
              : action === "start"
                ? "Camera starting"
                : "Camera stopped",
      });
      await refetchCameras();
    } catch (e) {
      toast({
        title: "Camera action failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setCamActionBusy(false);
    }
  };
  const stopEnrollCam = () => {
    enrollStreamRef.current?.getTracks().forEach((t) => t.stop());
    enrollStreamRef.current = null;
    if (enrollVideoRef.current) enrollVideoRef.current.srcObject = null;
    setEnrollCamOn(false);
    setEnrollCamReady(false);
  };

  const stopMonitorCam = () => {
    monitorStreamRef.current?.getTracks().forEach((t) => t.stop());
    monitorStreamRef.current = null;
    if (monitorVideoRef.current) monitorVideoRef.current.srcObject = null;
    setMonitorCamOn(false);
    setMonitorCamReady(false);
  };

  // Stop cameras when leaving their tab / switching enroll method away from webcam
  useEffect(() => {
    if (tab !== "enrollment" || enrollMethod !== "webcam") stopEnrollCam();
    if (tab !== "monitor") stopMonitorCam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, enrollMethod]);

  useEffect(() => () => {
    stopEnrollCam();
    stopMonitorCam();
  }, []);

  const rosterMut = useMutation({
    mutationFn: syncAiRoster,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["ai-attendance-status"] });
      qc.invalidateQueries({ queryKey: ["ai-attendance-people"] });
      toast({
        title: "IDs linked in MongoDB",
        description: `Students ${data.students?.linked ?? 0} · Staff ${data.staff?.linked ?? 0}`,
      });
    },
    onError: (e: Error) => toast({ title: "Link failed", description: e.message, variant: "destructive" }),
  });

  const rosterPeople = useMemo(
    () => [...(people?.students || []), ...(people?.staff || [])],
    [people],
  );

  const enrollFilterCounts = useMemo(() => {
    let enrolled = 0;
    let notEnrolled = 0;
    for (const p of rosterPeople) {
      if (p.isTrained) enrolled += 1;
      else notEnrolled += 1;
    }
    return { all: rosterPeople.length, enrolled, notEnrolled };
  }, [rosterPeople]);

  const filteredPeople = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rosterPeople.filter((p) => {
      if (enrollStatusFilter === "enrolled" && !p.isTrained) return false;
      if (enrollStatusFilter === "not_enrolled" && p.isTrained) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.fatherName || "").toLowerCase().includes(q) ||
        p.label.toLowerCase().includes(q) ||
        p.aiEmployeeId.toLowerCase().includes(q)
      );
    });
  }, [rosterPeople, search, enrollStatusFilter]);

  const startWebcam = async (
    videoEl: HTMLVideoElement | null,
    streamRef: React.MutableRefObject<MediaStream | null>,
    setOn: (v: boolean) => void,
    setReady: (v: boolean) => void,
  ) => {
    if (!webcamSupported) {
      toast({
        title: "Webcam needs HTTPS",
        description: `Open ${typeof window !== "undefined" ? window.location.origin : "this site"} and accept the certificate, or use Mobile Camera.`,
        variant: "destructive",
      });
      return;
    }
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setReady(false);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (!videoEl) throw new Error("Video element missing");
      videoEl.srcObject = stream;
      await new Promise<void>((resolve, reject) => {
        const onReady = () => {
          videoEl.removeEventListener("loadeddata", onReady);
          resolve();
        };
        videoEl.addEventListener("loadeddata", onReady);
        videoEl.play().catch(reject);
        // Fallback if loadeddata already fired
        if (videoEl.readyState >= 2) onReady();
      });
      setOn(true);
      setReady(Boolean(videoEl.videoWidth));
    } catch (e) {
      setOn(false);
      setReady(false);
      toast({
        title: "Camera blocked",
        description: e instanceof Error ? e.message : "Could not open webcam",
        variant: "destructive",
      });
    }
  };

  const refreshEnrollment = () => {
    refetchEnroll();
    qc.invalidateQueries({ queryKey: ["ai-attendance-people"] });
  };

  const captureMut = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Select a person first");
      const image = grabFromVideo(enrollVideoRef.current);
      if (!image) throw new Error("Wait for the webcam preview to appear, then try again");
      return captureAiFace(selected.aiEmployeeId, image);
    },
    onSuccess: (data) => {
      refreshEnrollment();
      const enrolled = Boolean((data as { is_enrolled?: boolean }).is_enrolled);
      toast({
        title: enrolled ? "Face enrolled" : "Face captured",
        description: String((data as { message?: string }).message || ""),
      });
    },
    onError: (e: Error) => toast({ title: "Capture failed", description: e.message, variant: "destructive" }),
  });

  const deleteImageMut = useMutation({
    mutationFn: async (index: number) => {
      if (!selected) throw new Error("Select a person first");
      return deleteAiFaceImage(selected.aiEmployeeId, index);
    },
    onSuccess: (data) => {
      refreshEnrollment();
      toast({
        title: "Photo removed",
        description: String((data as { message?: string }).message || ""),
      });
    },
    onError: (e: Error) => toast({ title: "Remove failed", description: e.message, variant: "destructive" }),
  });

  const deleteAllMut = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Select a person first");
      return deleteAllAiFaceImages(selected.aiEmployeeId);
    },
    onSuccess: (data) => {
      refreshEnrollment();
      toast({
        title: "Photos cleared",
        description: String((data as { message?: string }).message || ""),
      });
    },
    onError: (e: Error) => toast({ title: "Remove failed", description: e.message, variant: "destructive" }),
  });

  const invalidateAttendanceQueries = () => {
    qc.invalidateQueries({ queryKey: ["academy-attendance-day"] });
    qc.invalidateQueries({ queryKey: ["staff-attendance-day"] });
    qc.invalidateQueries({ queryKey: ["staff-attendance-mine"] });
    qc.invalidateQueries({ queryKey: ["academy-attendance-today-dashboard"] });
  };

  useEffect(() => {
    if (tab !== "monitor" || !monitorCamOn || !monitorCamReady || !canWrite) {
      setMonitorWatch("");
      setMonitorHits([]);
      return;
    }
    let cancelled = false;
    // Cards mirror the latest scan: each stays while its face is in frame and goes as soon as a scan misses it.
    // A face that stays keeps its original time so the card order doesn't jump around.
    const showHits = (fresh: MonitorHit[]) => {
      setMonitorHits((prev) => {
        const seenAt = new Map(prev.map((h) => [h.key, h.at]));
        return fresh
          .map((h) => ({ ...h, at: seenAt.get(h.key) ?? h.at }))
          .sort((a, b) => b.at - a.at);
      });
    };
    const scan = async () => {
      if (cancelled || monitorScanBusy.current) return;
      const image = grabFromVideo(monitorVideoRef.current);
      if (!image) return;
      monitorScanBusy.current = true;
      try {
        // One call recognises every face and marks each person; repeat marks are
        // filtered on the server (shared with CCTV), so nobody is double-counted.
        const result = await identifyAiFace(image, true);
        if (cancelled) return;
        const people = result.people || [];
        // Faces seen but not recognised: show a red "not marked" card.
        const unknownHit: MonitorHit[] = result.unknownFaces
          ? [
              {
                key: "__unknown__",
                name:
                  result.unknownFaces === 1
                    ? "Face not recognised"
                    : `${result.unknownFaces} faces not recognised`,
                label: "Attendance not marked",
                pct: "",
                tone: "error",
                at: Date.now(),
              },
            ]
          : [];
        if (!result.matched || people.length === 0) {
          showHits(unknownHit);
          setMonitorWatch(
            result.unknownFaces
              ? `Watching… ${result.unknownFaces} unrecognised face${result.unknownFaces === 1 ? "" : "s"}`
              : "Watching… waiting for a clear face"
          );
          return;
        }
        const now = Date.now();
        const recognizedHits = people.map((p) => {
          const name = p.employee_name || "Matched";
          return {
            key: p.employee_id || name,
            name,
            label: p.error ? `Not saved: ${p.error}` : monitorActionLabel(p.attendance_action, p.status),
            pct: `${Math.round((p.confidence || 0) * 100)}%`,
            tone: monitorTone(p.attendance_action, p.status, p.error),
            at: now,
          };
        });
        showHits(recognizedHits.concat(unknownHit));
        setMonitorWatch(`Watching… ${people.length} recognised`);
        let changed = false;
        people.forEach((p) => {
          if (!p.announce) return;
          changed = true;
          void announceAttendance(
            { name: p.employee_name || "", status: p.status || "", action: p.attendance_action },
            voiceRef.current
          );
        });
        if (changed) invalidateAttendanceQueries();
      } catch (e) {
        if (!cancelled) {
          setMonitorWatch(e instanceof Error ? e.message : "Scan failed");
        }
      } finally {
        monitorScanBusy.current = false;
      }
    };
    setMonitorWatch("Watching… attendance marks automatically");
    void scan();
    // Scans about once a second; the busy flag skips a tick while a scan is still running.
    // Worker-driven so it keeps going if the tab is in the background.
    const stopTicker = startBackgroundTicker(1000, () => void scan());
    const releaseWake = holdScreenAwake();
    return () => {
      cancelled = true;
      stopTicker();
      releaseWake();
    };
    // invalidateAttendanceQueries is recreated each render; the scan only needs the latest closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, monitorCamOn, monitorCamReady, canWrite]);

  const onEnrollFiles = async (files: FileList | null) => {
    if (!canWrite) return;
    if (!files?.length) return;
    if (!selected) {
      toast({ title: "Select a person first", variant: "destructive" });
      return;
    }
    setUploadBusy(true);
    let ok = 0;
    let enrolled = false;
    let lastMsg = "";
    let failMsg = "";
    for (const file of Array.from(files)) {
      try {
        const image = await fileToJpegBase64(file);
        const data = await captureAiFace(selected.aiEmployeeId, image);
        ok += 1;
        lastMsg = String((data as { message?: string }).message || "");
        if ((data as { is_enrolled?: boolean }).is_enrolled) enrolled = true;
      } catch (e) {
        failMsg = e instanceof Error ? e.message : String(e);
      }
    }
    setUploadBusy(false);
    refreshEnrollment();
    if (ok) {
      toast({
        title: enrolled ? "Face enrolled" : `Captured ${ok} photo${ok > 1 ? "s" : ""}`,
        description: lastMsg || undefined,
      });
    }
    if (failMsg) toast({ title: "Some photos failed", description: failMsg, variant: "destructive" });
  };

  const imageCount = Number(enrollStatus?.total_images ?? enrollStatus?.image_count ?? 0);
  const isTrained = Boolean(enrollStatus?.is_trained);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const enrolledPeople = useMemo(() => {
    const all = [...(people?.students || []), ...(people?.staff || [])];
    return all.filter((p) => p.isTrained);
  }, [people]);

  const enrolledFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return enrolledPeople;
    return enrolledPeople.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.fatherName || "").toLowerCase().includes(q) ||
        p.label.toLowerCase().includes(q) ||
        p.aiEmployeeId.toLowerCase().includes(q),
    );
  }, [enrolledPeople, search]);

  const tabs: { id: Tab; label: string; short: string; Icon: LucideIcon }[] = [
    { id: "enrolled", label: "Enrolled", short: "Enrolled", Icon: BadgeCheck },
    { id: "enrollment", label: "Enrollment", short: "Enroll", Icon: UserPlus },
    { id: "monitor", label: "Live Monitor", short: "Live", Icon: MonitorPlay },
    { id: "cameras", label: "AI CCTV", short: "CCTV", Icon: Cctv },
  ];

  const imageBusy = uploadBusy || captureMut.isPending || deleteImageMut.isPending || deleteAllMut.isPending;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 w-full">
      <div className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
              <ScanFace className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight">
                AI Attendance
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500 max-w-md">
                Enroll faces with webcam or phone camera. CCTV is used only for live attendance.
              </p>
            </div>
          </div>
          <div
            className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5"
            aria-label="Attendance voice"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8", voice.enabled ? "text-primary" : "text-slate-400")}
              onClick={() => updateVoice({ enabled: !voice.enabled })}
              aria-pressed={voice.enabled}
              title={voice.enabled ? "Mute announcements" : "Turn announcements on"}
            >
              {voice.enabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(voice.volume * 100)}
              disabled={!voice.enabled}
              onChange={(e) => updateVoice({ volume: Number(e.target.value) / 100 })}
              className="h-1.5 w-24 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Announcement volume"
            />
            <span className="w-9 text-right text-xs tabular-nums text-slate-500">
              {voice.enabled ? `${Math.round(voice.volume * 100)}%` : "Off"}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs"
              disabled={!voice.enabled}
              onClick={() => {
                primeAttendanceVoice();
                void speakText("Voice announcements are on", voiceRef.current);
              }}
            >
              Test
            </Button>
          </div>
          <div className="hidden shrink-0 rounded-lg bg-primary/10 px-3 py-2 max-w-[14rem] xl:block">
            <p className="text-xs sm:text-sm italic leading-snug text-[#1a2b4b]/80">
              <span className="mr-1 text-primary not-italic font-serif text-base leading-none">
                &ldquo;
              </span>
              Education is the key to a better tomorrow.
              <span className="ml-0.5 text-primary not-italic font-serif text-base leading-none">
                &rdquo;
              </span>
            </p>
          </div>
        </div>
      </div>

      <div
        className="grid grid-cols-4 gap-1 rounded-xl border bg-background p-1"
        role="tablist"
        aria-label="AI Attendance sections"
      >
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 rounded-lg px-1 py-2 sm:py-1.5 text-[10px] sm:text-xs font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <t.Icon className="h-4 w-4 shrink-0" />
              <span className="truncate max-w-full">{t.short}</span>
            </button>
          );
        })}
      </div>

      {tab === "enrolled" && (
        <Card className="p-3 sm:p-4 space-y-3 w-full">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <Label>Enrolled for attendance</Label>
              <p className="text-xs text-muted-foreground mt-1">
                People with a trained face embedding (5+ captured images). Tap a row to view photos.
              </p>
            </div>
            <span className="text-sm font-medium shrink-0">{enrolledPeople.length} enrolled</span>
          </div>

          <Input
            placeholder="Search name, father, ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="max-h-[min(70vh,560px)] overflow-y-auto space-y-2">
            {enrolledFiltered.map((p) => {
              const rowKey = `${p.kind}-${p.id}`;
              const open = expandedId === rowKey;
              return (
                <div key={rowKey} className="rounded-lg border overflow-hidden">
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
                    onClick={() => setExpandedId(open ? null : rowKey)}
                  >
                    <PersonAvatar person={p} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">{p.name}</div>
                      {p.kind === "student" && p.fatherName ? (
                        <div className="text-xs font-medium text-foreground/80 truncate">
                          S/O {p.fatherName}
                        </div>
                      ) : null}
                      <div className="text-xs text-muted-foreground truncate">
                        {p.kind} · {p.label} · {p.totalImages ?? 0} photos
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <EnrollmentStatusBadge enrolled />
                      <span className="text-xs text-primary">{open ? "Hide" : "Photos"}</span>
                    </div>
                  </button>
                  {open && (
                    <div className="px-3 pb-3 space-y-2 border-t bg-muted/20 pt-3">
                      {p.kind === "student" && p.fatherName ? (
                        <p className="text-xs text-muted-foreground">
                          Father: <span className="font-medium text-foreground">{p.fatherName}</span>
                        </p>
                      ) : null}
                      <FaceImageGrid employeeId={p.aiEmployeeId} count={p.totalImages ?? 0} />
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={() => {
                          setSelected(p);
                          setTab("enrollment");
                        }}
                      >
                        Manage enrollment
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
            {!enrolledFiltered.length && (
              <p className="text-sm text-muted-foreground p-2">
                No one is enrolled yet. Go to the Enrollment tab to capture faces.
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            {canWrite && (
              <Button
                size="sm"
                className="w-full sm:w-auto"
                disabled={rosterMut.isPending}
                onClick={() => rosterMut.mutate()}
              >
                {rosterMut.isPending ? "Linking IDs…" : "Link student/staff IDs"}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => qc.invalidateQueries({ queryKey: ["ai-attendance-people"] })}
            >
              Refresh
            </Button>
          </div>
        </Card>
      )}

      {tab === "enrollment" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="p-3 sm:p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Students & staff</Label>
              <span className="text-xs text-muted-foreground">
                {filteredPeople.length} shown
              </span>
            </div>
            <div
              className="grid grid-cols-3 gap-1 rounded-lg border bg-muted/30 p-1"
              role="group"
              aria-label="Filter by enrollment status"
            >
              {(
                [
                  { key: "all" as const, label: "All", count: enrollFilterCounts.all },
                  {
                    key: "enrolled" as const,
                    label: "Enrolled",
                    count: enrollFilterCounts.enrolled,
                  },
                  {
                    key: "not_enrolled" as const,
                    label: "Not enrolled",
                    count: enrollFilterCounts.notEnrolled,
                  },
                ] as const
              ).map((f) => {
                const active = enrollStatusFilter === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setEnrollStatusFilter(f.key)}
                    className={cn(
                      "rounded-md px-1.5 py-1.5 text-[11px] sm:text-xs font-semibold transition-colors",
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-background hover:text-foreground",
                    )}
                  >
                    {f.label}
                    <span
                      className={cn(
                        "ml-1 tabular-nums",
                        active ? "text-primary-foreground/80" : "text-muted-foreground",
                      )}
                    >
                      ({f.count})
                    </span>
                  </button>
                );
              })}
            </div>
            <Input
              placeholder="Search name, father, ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div
              className={cn(
                "overflow-y-auto space-y-1",
                selected ? "max-h-44 lg:max-h-[480px]" : "max-h-[50vh] lg:max-h-[480px]",
              )}
            >
              {filteredPeople.map((p) => {
                const isSelected = selected?.id === p.id && selected.kind === p.kind;
                const enrolled = Boolean(p.isTrained);
                return (
                  <button
                    key={`${p.kind}-${p.id}`}
                    type="button"
                    className={cn(
                      "w-full text-left rounded-md px-2.5 py-2 text-sm border flex items-center gap-2.5",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary"
                        : "hover:bg-muted/50",
                    )}
                    onClick={() => setSelected(p)}
                  >
                    <PersonAvatar person={p} selected={isSelected} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{p.name}</div>
                      {p.kind === "student" && p.fatherName ? (
                        <div className="text-xs opacity-80 truncate">S/O {p.fatherName}</div>
                      ) : null}
                      <div className="text-xs opacity-80 truncate">
                        {p.kind} · {p.label} · {p.totalImages ?? 0}/5
                      </div>
                    </div>
                    <EnrollmentStatusBadge enrolled={enrolled} selected={isSelected} />
                  </button>
                );
              })}
              {!filteredPeople.length && (
                <p className="text-sm text-muted-foreground p-2">
                  {rosterPeople.length === 0
                    ? "No people — sync roster first."
                    : enrollStatusFilter === "enrolled"
                      ? "No enrolled people match this search."
                      : enrollStatusFilter === "not_enrolled"
                        ? "No not-enrolled people match this search."
                        : "No people match this search."}
                </p>
              )}
            </div>
          </Card>

          <Card className="p-3 sm:p-4 space-y-4">
            <div>
              <p className="text-sm font-medium break-words">
                {selected
                  ? `Enroll: ${selected.name}${
                      selected.kind === "student" && selected.fatherName
                        ? ` (S/O ${selected.fatherName})`
                        : ""
                    }`
                  : "Select a student or staff member"}
              </p>
              {selected && (
                <div className="mt-2 space-y-1.5">
                  <p className="text-xs text-muted-foreground">
                    Images: {imageCount}/5 · {isTrained ? "Enrolled (embedding ready)" : "Not enrolled yet"}
                  </p>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", isTrained ? "bg-emerald-500" : "bg-primary")}
                      style={{ width: `${Math.min(100, (imageCount / 5) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {selected && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">Captured images</p>
                  {canWrite && imageCount > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                      disabled={imageBusy}
                      onClick={() => {
                        if (window.confirm("Remove all enrollment photos for this person?")) {
                          deleteAllMut.mutate();
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Remove all
                    </Button>
                  )}
                </div>
                <FaceImageGrid
                  employeeId={selected.aiEmployeeId}
                  count={imageCount}
                  canDelete={canWrite}
                  canAdd={canWrite}
                  busy={imageBusy}
                  onDelete={(index) => deleteImageMut.mutate(index)}
                  onAdd={() => {
                    if (enrollMethod === "mobile") mobileFileRef.current?.click();
                    else if (enrollCamReady) captureMut.mutate();
                    else
                      toast({
                        title: enrollMethod === "webcam" ? "Start webcam first" : "Choose capture method",
                        description:
                          enrollMethod === "webcam"
                            ? "Start the webcam, then add another photo."
                            : "Use Take photo or Choose from gallery below.",
                      });
                  }}
                />
                {enrollStatus?.last_train_error ? (
                  <p className="text-xs text-destructive">{enrollStatus.last_train_error}</p>
                ) : null}
              </div>
            )}

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Capture method (enrollment — CCTV not used here)
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!webcamSupported}
                  onClick={() => setEnrollMethod("webcam")}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-md border p-3 text-left text-sm transition-colors min-h-[4.5rem]",
                    enrollMethod === "webcam"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-muted/50",
                    !webcamSupported && "opacity-50 cursor-not-allowed",
                  )}
                >
                  <Camera className="h-4 w-4" />
                  <span className="font-medium">Webcam</span>
                  <span className="text-[11px] opacity-80">PC / laptop camera</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEnrollMethod("mobile")}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-md border p-3 text-left text-sm transition-colors min-h-[4.5rem]",
                    enrollMethod === "mobile"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-muted/50",
                  )}
                >
                  <Smartphone className="h-4 w-4" />
                  <span className="font-medium">Mobile camera</span>
                  <span className="text-[11px] opacity-80">Phone camera or gallery</span>
                </button>
              </div>
            </div>

            {enrollMethod === "webcam" && (
              <div className="space-y-3">
                <video
                  ref={enrollVideoRef}
                  className="w-full rounded-md bg-black aspect-[4/3] sm:aspect-video object-cover"
                  muted
                  playsInline
                  autoPlay
                  onLoadedData={() => {
                    if (enrollVideoRef.current?.videoWidth) setEnrollCamReady(true);
                  }}
                />
                <div className="flex flex-col sm:flex-row gap-2">
                  {!enrollCamOn ? (
                    <Button
                      size="sm"
                      className="w-full sm:w-auto"
                      disabled={!canWrite || !selected || !webcamSupported}
                      onClick={() =>
                        void startWebcam(
                          enrollVideoRef.current,
                          enrollStreamRef,
                          setEnrollCamOn,
                          setEnrollCamReady,
                        )
                      }
                    >
                      Start webcam
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={stopEnrollCam}>
                      Stop webcam
                    </Button>
                  )}
                  {canWrite && (
                    <Button
                      size="sm"
                      className="w-full sm:w-auto"
                      disabled={!selected || !enrollCamReady || captureMut.isPending}
                      onClick={() => captureMut.mutate()}
                    >
                      {captureMut.isPending ? "Capturing…" : imageCount >= 5 ? "Add another photo" : "Capture face"}
                    </Button>
                  )}
                </div>
                {enrollCamOn && !enrollCamReady && (
                  <p className="text-xs text-amber-600">Waiting for camera preview…</p>
                )}
                {!webcamSupported && (
                  <p className="text-xs text-amber-600">
                    Webcam needs HTTPS. Open {typeof window !== "undefined" ? window.location.origin : "this site"} or
                    switch to Mobile camera.
                  </p>
                )}
              </div>
            )}

            {enrollMethod === "mobile" && (
              <div className="space-y-3">
                <div className="rounded-md border border-dashed p-4 sm:p-6 text-center space-y-2 bg-muted/20">
                  <Smartphone className="h-8 w-8 mx-auto text-muted-foreground" />
                  <p className="text-sm font-medium">Take or choose face photos</p>
                  <p className="text-xs text-muted-foreground">
                    On a phone, “Take photo” opens the camera. You can also pick existing photos.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  {canWrite && (
                    <>
                      <Button
                        size="sm"
                        className="w-full sm:w-auto"
                        disabled={!selected || uploadBusy}
                        onClick={() => mobileFileRef.current?.click()}
                      >
                        {uploadBusy ? "Uploading…" : "Take photo"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full sm:w-auto"
                        disabled={!selected || uploadBusy}
                        onClick={() => galleryFileRef.current?.click()}
                      >
                        Choose from gallery
                      </Button>
                    </>
                  )}
                </div>
                <input
                  ref={mobileFileRef}
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="hidden"
                  onChange={(e) => {
                    void onEnrollFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <input
                  ref={galleryFileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void onEnrollFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Capture at least 5 clear face images. You can add more anytime to improve recognition, or remove
              blurry ones.
              {imageCount > 0 && imageCount < 5 ? ` (${5 - imageCount} more needed)` : ""}
              {isTrained ? " Ready for CCTV / live match." : ""}
            </p>
          </Card>
        </div>
      )}

      {tab === "monitor" && (
        <Card className="p-3 sm:p-4 space-y-3 w-full">
          <p className="text-sm text-muted-foreground">
            Start the webcam. A recognized face is marked automatically when confidence is at least 75%. The phone says the student’s name and “is present.” Keep the volume up.
          </p>
          <video
            ref={monitorVideoRef}
            className="w-full rounded-md bg-black aspect-[4/3] sm:aspect-video object-cover"
            muted
            playsInline
            autoPlay
            onLoadedData={() => {
              if (monitorVideoRef.current?.videoWidth) setMonitorCamReady(true);
            }}
          />
          <div className="flex flex-col sm:flex-row flex-wrap gap-2">
            {!monitorCamOn ? (
              <Button
                size="sm"
                className="w-full sm:w-auto"
                disabled={!canWrite || !webcamSupported}
                onClick={() => {
                  primeAttendanceVoice();
                  void startWebcam(
                    monitorVideoRef.current,
                    monitorStreamRef,
                    setMonitorCamOn,
                    setMonitorCamReady,
                  );
                }}
              >
                Start webcam
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={stopMonitorCam}>
                Stop webcam
              </Button>
            )}
          </div>
          {monitorCamOn && monitorHits.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2" aria-live="polite">
              {monitorHits.map((hit) => {
                const tone = MONITOR_TONE[hit.tone];
                return (
                  <div
                    key={hit.key}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border-2 px-4 py-3 shadow-md animate-in fade-in zoom-in-95",
                      tone.card
                    )}
                  >
                    <tone.Icon className="h-10 w-10 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xl sm:text-2xl font-bold leading-tight">{hit.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-sm font-semibold capitalize",
                            tone.badge
                          )}
                        >
                          {hit.tone === "error" ? hit.label : `Attendance ${hit.label}`}
                        </span>
                        {hit.pct ? (
                          <span className="text-xs font-medium opacity-80">{hit.pct} match</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
          {monitorCamOn && monitorWatch ? (
            <p className="text-sm font-medium text-muted-foreground">{monitorWatch}</p>
          ) : null}
        </Card>
      )}

      {tab === "cameras" && (
        <div className="grid lg:grid-cols-[300px_1fr] gap-4">
          <Card className="p-3 sm:p-4 space-y-3 order-2 lg:order-1">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">Connected cameras</p>
                <p className="text-xs text-muted-foreground">
                  {camerasData?.overview
                    ? `${camerasData.overview.running}/${camerasData.overview.total} running`
                    : "—"}
                </p>
              </div>
              <Button size="sm" variant="outline" disabled={camerasFetching} onClick={() => refetchCameras()}>
                Refresh
              </Button>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              {canWrite && (
                <>
                  <Button
                    size="sm"
                    className="w-full sm:w-auto"
                    disabled={camActionBusy}
                    onClick={() => void runCameraAction("start_all")}
                  >
                    Start all
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full sm:w-auto"
                    disabled={camActionBusy}
                    onClick={() => void runCameraAction("stop_all")}
                  >
                    Stop all
                  </Button>
                </>
              )}
            </div>
            <div className="space-y-2 max-h-[min(40vh,320px)] lg:max-h-[520px] overflow-y-auto">
              {cameras.map((cam: AiCamera) => {
                const selected = selectedCameraId === cam._id;
                const running = Boolean(cam.runtime?.running);
                const connected = Boolean(cam.runtime?.connected);
                return (
                  <button
                    key={cam._id}
                    type="button"
                    onClick={() => setSelectedCameraId(cam._id)}
                    className={cn(
                      "w-full text-left rounded-md border p-3 space-y-1 transition-colors",
                      selected ? "border-primary bg-primary/5" : "hover:bg-muted/40",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm">{cam.name}</span>
                      <span
                        className={cn(
                          "text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded",
                          running && connected
                            ? "bg-emerald-100 text-emerald-800"
                            : running
                              ? "bg-amber-100 text-amber-800"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {running && connected ? "Live" : running ? "Starting" : "Stopped"}
                      </span>
                    </div>
                    {cam.location ? (
                      <p className="text-xs text-muted-foreground">{cam.location}</p>
                    ) : null}
                    {cam.rtspHost ? (
                      <p className="text-[10px] text-muted-foreground truncate font-mono">{cam.rtspHost}</p>
                    ) : null}
                    {cam.runtime?.lastError ? (
                      <p className="text-[11px] text-destructive line-clamp-2">{cam.runtime.lastError}</p>
                    ) : null}
                    <div className="flex gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                      {canWrite && (
                        !running ? (
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            disabled={camActionBusy}
                            onClick={() => void runCameraAction("start", cam._id)}
                          >
                            Start
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={camActionBusy}
                            onClick={() => void runCameraAction("stop", cam._id)}
                          >
                            Stop
                          </Button>
                        )
                      )}
                    </div>
                  </button>
                );
              })}
              {!cameras.length && (
                <p className="text-sm text-muted-foreground p-2">
                  No cameras yet. Set <code className="text-[11px]">AI_CAMERA_RTSP_URL</code> in backend/.env
                  and restart.
                </p>
              )}
            </div>
          </Card>

          <Card className="p-3 sm:p-4 space-y-3 order-1 lg:order-2">
            <div className="flex items-start gap-2 text-sm">
              <ScanFace className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              <div>
                <p className="font-medium">
                  {cameras.find((c) => c._id === selectedCameraId)?.name || "Live stream"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Live gate attendance preview. Face enrollment uses Webcam / Mobile camera only.
                </p>
              </div>
            </div>

            <div className="relative w-full rounded-md bg-black aspect-video overflow-hidden">
              {liveFrame ? (
                <img src={liveFrame} alt="CCTV live" className="h-full w-full object-contain" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70 px-4 text-center">
                  {selectedCameraId
                    ? liveMeta.lastError || "Waiting for camera stream… Start the camera if it is stopped."
                    : "Select a camera"}
                </div>
              )}
            </div>

            {cctvUnknown ? (
              <div
                className="flex items-center gap-3 rounded-xl border-2 border-red-700 bg-red-600 px-4 py-3 text-white shadow-md"
                role="status"
              >
                <AlertTriangle className="h-10 w-10 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xl font-bold leading-tight sm:text-2xl">
                    {cctvUnknown.count === 1
                      ? "Face not recognised"
                      : `${cctvUnknown.count} faces not recognised`}
                  </p>
                  <span className="mt-1 inline-flex rounded-full bg-white/20 px-2.5 py-0.5 text-sm font-semibold">
                    Attendance not marked
                  </span>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>
                Status:{" "}
                <strong className="text-foreground">
                  {liveMeta.connected ? "Connected" : liveFrame ? "Frame ready" : "Offline"}
                </strong>
              </span>
              {liveMeta.lastMatch?.name ? (
                <span>
                  Last match:{" "}
                  <strong className="text-foreground">
                    {liveMeta.lastMatch.name}
                    {liveMeta.lastMatch.confidence != null
                      ? ` (${Math.round(liveMeta.lastMatch.confidence * 100)}%)`
                      : ""}
                    {liveMeta.lastMatch.attendance ? ` · ${liveMeta.lastMatch.attendance}` : ""}
                  </strong>
                </span>
              ) : null}
            </div>
            {liveMeta.lastError ? (
              <p className="text-xs text-destructive">{liveMeta.lastError}</p>
            ) : null}
          </Card>
        </div>
      )}
    </div>
  );
}
