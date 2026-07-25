import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Smartphone, ScanFace } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { ModuleActionCaps } from "@/lib/permissions";
import {
  captureAiFace,
  fetchAiCameras,
  fetchAiCameraSnapshot,
  fetchAiPeople,
  fetchEnrollmentStatus,
  identifyAiFace,
  syncAiRoster,
  aiCameraAction,
  type AiPerson,
  type AiCamera,
} from "@/lib/aiAttendanceApi";
import { cn } from "@/lib/utils";

type Tab = "enrolled" | "enrollment" | "monitor" | "cameras";
/** Enrollment only — CCTV is for live attendance, not face registration. */
type EnrollMethod = "webcam" | "mobile";

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

export default function AiAttendanceModule({ caps }: { caps: ModuleActionCaps }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("enrolled");
  const [selected, setSelected] = useState<AiPerson | null>(null);
  const [search, setSearch] = useState("");
  const [enrollMethod, setEnrollMethod] = useState<EnrollMethod>(
    webcamSupported ? "webcam" : "mobile",
  );

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
  const identifyFileRef = useRef<HTMLInputElement>(null);
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
  }>({});
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
    if (tab !== "cameras" || !cameras.length || camActionBusy) return;
    const anyRunning = cameras.some((c) => c.runtime?.running);
    if (anyRunning) return;
    let cancelled = false;
    (async () => {
      try {
        await aiCameraAction("start_all");
        if (!cancelled) await refetchCameras();
      } catch {
        /* start errors show via snapshot lastError */
      }
    })();
    return () => {
      cancelled = true;
    };
    // intentionally only when entering cameras tab / camera list first loads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, cameras.length]);

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

  const filteredPeople = useMemo(() => {
    const all = [...(people?.students || []), ...(people?.staff || [])];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.label.toLowerCase().includes(q) ||
        p.aiEmployeeId.toLowerCase().includes(q),
    );
  }, [people, search]);

  const startWebcam = async (
    videoEl: HTMLVideoElement | null,
    streamRef: React.MutableRefObject<MediaStream | null>,
    setOn: (v: boolean) => void,
    setReady: (v: boolean) => void,
  ) => {
    if (!webcamSupported) {
      toast({
        title: "Webcam needs HTTPS",
        description: "Open https://192.168.88.41:8080 and accept the certificate, or use Mobile Camera.",
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

  const captureMut = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Select a person first");
      const image = grabFromVideo(enrollVideoRef.current);
      if (!image) throw new Error("Wait for the webcam preview to appear, then try again");
      return captureAiFace(selected.aiEmployeeId, image);
    },
    onSuccess: (data) => {
      refetchEnroll();
      const enrolled = Boolean((data as { is_enrolled?: boolean }).is_enrolled);
      toast({
        title: enrolled ? "Face enrolled" : "Face captured",
        description: String((data as { message?: string }).message || ""),
      });
    },
    onError: (e: Error) => toast({ title: "Capture failed", description: e.message, variant: "destructive" }),
  });

  const identifyMut = useMutation({
    mutationFn: async () => {
      const image = grabFromVideo(monitorVideoRef.current);
      if (!image) throw new Error("Wait for the webcam preview to appear, then try again");
      return identifyAiFace(image, true);
    },
    onSuccess: (data) => {
      toast({
        title: "Identified",
        description: String((data as { message?: string }).message || JSON.stringify(data)),
      });
    },
    onError: (e: Error) => toast({ title: "Identify failed", description: e.message, variant: "destructive" }),
  });

  const onEnrollFiles = async (files: FileList | null) => {
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
    refetchEnroll();
    if (ok) {
      toast({
        title: enrolled ? "Face enrolled" : `Captured ${ok} photo${ok > 1 ? "s" : ""}`,
        description: lastMsg || undefined,
      });
    }
    if (failMsg) toast({ title: "Some photos failed", description: failMsg, variant: "destructive" });
  };

  const onIdentifyFile = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploadBusy(true);
    try {
      const image = await fileToJpegBase64(files[0]);
      const data = await identifyAiFace(image, true);
      toast({
        title: "Identified",
        description: String((data as { message?: string }).message || JSON.stringify(data)),
      });
    } catch (e) {
      toast({
        title: "Identify failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setUploadBusy(false);
    }
  };

  const imageCount = Number((enrollStatus as { total_images?: number } | undefined)?.total_images ?? 0);
  const isTrained = Boolean((enrollStatus as { is_trained?: boolean } | undefined)?.is_trained);

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
        p.label.toLowerCase().includes(q) ||
        p.aiEmployeeId.toLowerCase().includes(q),
    );
  }, [enrolledPeople, search]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "enrolled", label: "Enrolled" },
    { id: "enrollment", label: "Enrollment" },
    { id: "monitor", label: "Live Monitor" },
    { id: "cameras", label: "AI CCTV" },
  ];

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-primary">AI Attendance</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Enroll faces with webcam or phone camera. CCTV is used only for live attendance.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Button
            key={t.id}
            size="sm"
            variant={tab === t.id ? "default" : "outline"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {tab === "enrolled" && (
        <Card className="p-4 space-y-3 max-w-2xl">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <Label>Enrolled for attendance</Label>
              <p className="text-xs text-muted-foreground mt-1">
                People with a trained face embedding (5+ captured images). Only these are
                recognized for attendance.
              </p>
            </div>
            <span className="text-sm font-medium">{enrolledPeople.length} enrolled</span>
          </div>

          <Input
            placeholder="Search enrolled people…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="max-h-[480px] overflow-y-auto space-y-1">
            {enrolledFiltered.map((p) => (
              <div
                key={`${p.kind}-${p.id}`}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.kind} · {p.label} · {p.aiEmployeeId}
                  </div>
                </div>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => {
                    setSelected(p);
                    setTab("enrollment");
                  }}
                >
                  Manage
                </button>
              </div>
            ))}
            {!enrolledFiltered.length && (
              <p className="text-sm text-muted-foreground p-2">
                No one is enrolled yet. Go to the Enrollment tab to capture faces.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              disabled={!caps.canEdit || rosterMut.isPending}
              onClick={() => rosterMut.mutate()}
            >
              {rosterMut.isPending ? "Linking IDs…" : "Link student/staff IDs"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => qc.invalidateQueries({ queryKey: ["ai-attendance-people"] })}
            >
              Refresh
            </Button>
          </div>
        </Card>
      )}

      {tab === "enrollment" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="p-4 space-y-3">
            <Label>Students & staff</Label>
            <Input
              placeholder="Search student / staff…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="max-h-[480px] overflow-y-auto space-y-1">
              {filteredPeople.map((p) => (
                <button
                  key={`${p.kind}-${p.id}`}
                  type="button"
                  className={cn(
                    "w-full text-left rounded-md px-3 py-2 text-sm border",
                    selected?.id === p.id && selected.kind === p.kind
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:bg-muted/50",
                  )}
                  onClick={() => setSelected(p)}
                >
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs opacity-80">
                    {p.kind} · {p.label} · {p.aiEmployeeId}
                  </div>
                </button>
              ))}
              {!filteredPeople.length && (
                <p className="text-sm text-muted-foreground p-2">No people — sync roster first.</p>
              )}
            </div>
          </Card>

          <Card className="p-4 space-y-4">
            <div>
              <p className="text-sm font-medium">
                {selected ? `Enroll: ${selected.name}` : "Select a student or staff member"}
              </p>
              {selected && (
                <p className="text-xs text-muted-foreground mt-1">
                  Images: {imageCount}/5 · {isTrained ? "Enrolled (embedding ready)" : "Not enrolled yet"}
                </p>
              )}
            </div>

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
                    "flex flex-col items-start gap-1 rounded-md border p-3 text-left text-sm transition-colors",
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
                    "flex flex-col items-start gap-1 rounded-md border p-3 text-left text-sm transition-colors",
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
                  className="w-full rounded-md bg-black aspect-video object-cover"
                  muted
                  playsInline
                  autoPlay
                  onLoadedData={() => {
                    if (enrollVideoRef.current?.videoWidth) setEnrollCamReady(true);
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  {!enrollCamOn ? (
                    <Button
                      size="sm"
                      disabled={!selected || !webcamSupported}
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
                    <Button size="sm" variant="outline" onClick={stopEnrollCam}>
                      Stop webcam
                    </Button>
                  )}
                  <Button
                    size="sm"
                    disabled={!selected || !enrollCamReady || captureMut.isPending}
                    onClick={() => captureMut.mutate()}
                  >
                    {captureMut.isPending ? "Capturing…" : "Capture face"}
                  </Button>
                </div>
                {enrollCamOn && !enrollCamReady && (
                  <p className="text-xs text-amber-600">Waiting for camera preview…</p>
                )}
                {!webcamSupported && (
                  <p className="text-xs text-amber-600">
                    Webcam needs HTTPS. Open https://{typeof window !== "undefined" ? window.location.host : "…"} or
                    switch to Mobile camera.
                  </p>
                )}
              </div>
            )}

            {enrollMethod === "mobile" && (
              <div className="space-y-3">
                <div className="rounded-md border border-dashed p-6 text-center space-y-2 bg-muted/20">
                  <Smartphone className="h-8 w-8 mx-auto text-muted-foreground" />
                  <p className="text-sm font-medium">Take or choose face photos</p>
                  <p className="text-xs text-muted-foreground">
                    On a phone, “Take photo” opens the camera. You can also pick existing photos.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={!selected || uploadBusy}
                    onClick={() => mobileFileRef.current?.click()}
                  >
                    {uploadBusy ? "Uploading…" : "Take photo"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!selected || uploadBusy}
                    onClick={() => galleryFileRef.current?.click()}
                  >
                    Choose from gallery
                  </Button>
                </div>
                {/* capture=user → phone front camera */}
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
                {/* no capture → gallery / file picker */}
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
              Capture 5 clear face images. When the 5th succeeds, embedding is applied automatically and the
              person is enrolled for recognition.
              {imageCount > 0 && imageCount < 5 ? ` (${5 - imageCount} more needed)` : ""}
              {isTrained ? " Ready for CCTV / live match." : ""}
            </p>
          </Card>
        </div>
      )}

      {tab === "monitor" && (
        <Card className="p-4 space-y-3 max-w-xl">
          <p className="text-sm text-muted-foreground">
            Quick identify with webcam or a photo (marks attendance when matched).
          </p>
          <video
            ref={monitorVideoRef}
            className="w-full rounded-md bg-black aspect-video object-cover"
            muted
            playsInline
            autoPlay
            onLoadedData={() => {
              if (monitorVideoRef.current?.videoWidth) setMonitorCamReady(true);
            }}
          />
          <div className="flex flex-wrap gap-2">
            {!monitorCamOn ? (
              <Button
                size="sm"
                disabled={!webcamSupported}
                onClick={() =>
                  void startWebcam(
                    monitorVideoRef.current,
                    monitorStreamRef,
                    setMonitorCamOn,
                    setMonitorCamReady,
                  )
                }
              >
                Start webcam
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={stopMonitorCam}>
                Stop webcam
              </Button>
            )}
            <Button
              size="sm"
              disabled={!monitorCamReady || identifyMut.isPending}
              onClick={() => identifyMut.mutate()}
            >
              {identifyMut.isPending ? "Recognizing…" : "Identify & mark"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={uploadBusy}
              onClick={() => identifyFileRef.current?.click()}
            >
              Upload photo
            </Button>
          </div>
          <input
            ref={identifyFileRef}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={(e) => {
              void onIdentifyFile(e.target.files);
              e.target.value = "";
            }}
          />
        </Card>
      )}

      {tab === "cameras" && (
        <div className="grid lg:grid-cols-[320px_1fr] gap-4">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
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
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={camActionBusy} onClick={() => void runCameraAction("start_all")}>
                Start all
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={camActionBusy}
                onClick={() => void runCameraAction("stop_all")}
              >
                Stop all
              </Button>
            </div>
            <div className="space-y-2 max-h-[520px] overflow-y-auto">
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
                      {!running ? (
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

          <Card className="p-4 space-y-3">
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
