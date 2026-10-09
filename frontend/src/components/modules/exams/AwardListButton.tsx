import { useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { previewAwardListPdf } from "@/lib/studentManagementApi";
import { previewExamAwardListPdf } from "@/lib/examApi";
import { cn } from "@/lib/utils";

/** Opens blank award list PDF (for teachers before marks are entered). */
export default function AwardListButton({
  testId,
  examId,
  subjectId,
  size = "sm",
  variant = "outline",
  className,
  label = "Award list",
}: {
  testId?: string;
  examId?: string;
  /** When set with examId, prints one subject sheet; omit for all exam date-sheet subjects. */
  subjectId?: string;
  size?: "sm" | "default" | "lg" | "icon";
  variant?: "outline" | "ghost" | "secondary" | "default";
  className?: string;
  label?: string;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const canOpen = Boolean(testId || examId);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canOpen || loading) return;
    setLoading(true);
    try {
      if (testId) {
        await previewAwardListPdf(testId);
      } else if (examId) {
        await previewExamAwardListPdf(examId, subjectId);
      }
    } catch (err) {
      toast({
        title: "Award list failed",
        description: err instanceof Error ? err.message : "Could not open PDF",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={cn(
        "inline-flex items-center gap-1.5",
        size === "sm" && "h-8 px-3",
        className
      )}
      onClick={handleClick}
      disabled={loading || !canOpen}
    >
      <Eye className="h-3.5 w-3.5 shrink-0" />
      {loading ? "Opening…" : label}
    </Button>
  );
}
