import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import { resolveUploadUrl } from "@/lib/studentManagementApi";
import { cn } from "@/lib/utils";

function CaptureIconButton({
  title,
  disabled,
  onClick,
  children,
}: {
  title: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground",
        "transition-colors hover:bg-muted hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        "disabled:pointer-events-none disabled:opacity-40",
      )}
    >
      {children}
    </button>
  );
}

export default function TestPaperCapture({
  value,
  disabled,
  uploading,
  onPick,
  onClear,
}: {
  value?: string;
  disabled?: boolean;
  uploading?: boolean;
  onPick: (file: File) => void;
  onClear?: () => void;
}) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const src = value ? resolveUploadUrl(value) : "";

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onPick(file);
  };

  return (
    <div className="flex items-center justify-center gap-0.5">
      <input
        ref={galleryRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="sr-only"
        disabled={disabled || uploading}
        onChange={handleFile}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        disabled={disabled || uploading}
        onChange={handleFile}
      />

      {uploading ? (
        <div className="flex h-8 w-8 items-center justify-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : src ? (
        <>
          <button
            type="button"
            title="View test paper"
            onClick={() => setPreviewOpen(true)}
            className={cn(
              "h-8 w-8 shrink-0 overflow-hidden rounded-md border border-border bg-muted",
              "transition hover:opacity-90",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            )}
          >
            <img src={src} alt="Test paper" className="h-full w-full object-cover" />
          </button>
          {!disabled && (
            <>
              <CaptureIconButton
                title="Replace from gallery"
                onClick={() => galleryRef.current?.click()}
              >
                <ImagePlus className="h-3.5 w-3.5" />
              </CaptureIconButton>
              <CaptureIconButton title="Replace with photo" onClick={() => cameraRef.current?.click()}>
                <Camera className="h-3.5 w-3.5" />
              </CaptureIconButton>
              {onClear ? (
                <CaptureIconButton title="Remove test paper" onClick={onClear}>
                  <X className="h-3.5 w-3.5" />
                </CaptureIconButton>
              ) : null}
            </>
          )}
        </>
      ) : disabled ? (
        <span className="text-xs text-muted-foreground">—</span>
      ) : (
        <div className="inline-flex items-center rounded-md border border-border/70 bg-background p-0.5">
          <CaptureIconButton title="Upload from gallery" onClick={() => galleryRef.current?.click()}>
            <ImagePlus className="h-3.5 w-3.5" />
          </CaptureIconButton>
          <span className="h-4 w-px bg-border/80" aria-hidden />
          <CaptureIconButton title="Take photo" onClick={() => cameraRef.current?.click()}>
            <Camera className="h-3.5 w-3.5" />
          </CaptureIconButton>
        </div>
      )}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Test paper</DialogTitle>
          </DialogHeader>
          {src ? (
            <img
              src={src}
              alt="Test paper full view"
              className="max-h-[70vh] w-full rounded-md object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
