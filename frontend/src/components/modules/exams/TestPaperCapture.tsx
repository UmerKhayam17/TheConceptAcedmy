import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Camera, ImagePlus, Loader2 } from "lucide-react";
import { resolveUploadUrl } from "@/lib/studentManagementApi";

export default function TestPaperCapture({
  value,
  disabled,
  uploading,
  onPick,
}: {
  value?: string;
  disabled?: boolean;
  uploading?: boolean;
  onPick: (file: File) => void;
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
    <div className="flex flex-col items-center justify-center gap-1 w-full min-w-[56px]">
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

      {src ? (
        <button
          type="button"
          className="h-14 w-14 shrink-0 rounded-md border overflow-hidden bg-muted hover:ring-2 ring-primary/40 mx-auto"
          onClick={() => setPreviewOpen(true)}
          title="View test paper"
        >
          <img src={src} alt="Test paper" className="h-full w-full object-cover" />
        </button>
      ) : (
        <div className="h-14 w-14 shrink-0 rounded-md border border-dashed bg-muted/50 flex items-center justify-center text-muted-foreground mx-auto">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        </div>
      )}

      {!disabled && (
        <div className="flex gap-0.5 justify-center">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7"
            title="Upload image"
            disabled={uploading}
            onClick={() => galleryRef.current?.click()}
          >
            <ImagePlus className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7"
            title="Take photo"
            disabled={uploading}
            onClick={() => cameraRef.current?.click()}
          >
            <Camera className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Test paper</DialogTitle>
          </DialogHeader>
          {src ? (
            <img src={src} alt="Test paper full view" className="w-full max-h-[70vh] object-contain rounded-md" />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
