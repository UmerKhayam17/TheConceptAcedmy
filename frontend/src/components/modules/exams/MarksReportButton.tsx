import { useState } from "react";
import { ChevronDown, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  previewClassTestMarksReportPdf,
  type ClassTestMarksReportView,
} from "@/lib/studentManagementApi";
import {
  previewExamMarksReportPdf,
  type ExamMarksReportView,
} from "@/lib/examApi";
import { cn } from "@/lib/utils";

type ExamSubjectOption = { id: string; name: string };

/**
 * Print filled marks reports:
 * - Class tests: test-wise / subject-wise / student-wise
 * - Exams: exam-wise / subject-wise / student-wise
 */
export default function MarksReportButton({
  testId,
  examId,
  subjects,
  studentIds,
  size = "default",
  variant = "outline",
  className,
  label = "Print report",
}: {
  testId?: string;
  examId?: string;
  /** Exam date-sheet subjects for subject-wise menu items. */
  subjects?: ExamSubjectOption[];
  /** Optional subset for student-wise (e.g. selected rows on marks page). */
  studentIds?: string[];
  size?: "sm" | "default" | "lg" | "icon";
  variant?: "outline" | "ghost" | "secondary" | "default";
  className?: string;
  label?: string;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);
  const canOpen = Boolean(testId || examId);

  const run = async (key: string, action: () => Promise<void>) => {
    if (!canOpen || loading) return;
    setLoading(key);
    try {
      await action();
    } catch (err) {
      toast({
        title: "Report failed",
        description: err instanceof Error ? err.message : "Could not open PDF",
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  const openTest = (view: ClassTestMarksReportView) =>
    run(view, () =>
      previewClassTestMarksReportPdf(testId!, {
        view,
        studentIds: view === "student" && studentIds?.length ? studentIds : undefined,
      })
    );

  const openExam = (view: ExamMarksReportView, subjectId?: string) =>
    run(`${view}:${subjectId || "all"}`, () =>
      previewExamMarksReportPdf(examId!, {
        view,
        subjectId,
        studentId:
          view === "student" && studentIds?.length === 1 ? studentIds[0] : undefined,
      })
    );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size={size}
          variant={variant}
          className={cn(
            "inline-flex items-center gap-1.5",
            size === "sm" && "h-8 px-3",
            className
          )}
          disabled={!canOpen || Boolean(loading)}
        >
          <Printer className="h-3.5 w-3.5 shrink-0" />
          {loading ? "Opening…" : label}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Marks reports</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {testId && (
          <>
            <DropdownMenuItem onSelect={() => openTest("test")}>
              Test-wise report
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openTest("subject")}>
              Subject-wise report
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openTest("student")}>
              Student-wise report
              {studentIds?.length ? ` (${studentIds.length})` : ""}
            </DropdownMenuItem>
          </>
        )}
        {examId && (
          <>
            <DropdownMenuItem onSelect={() => openExam("exam")}>
              Exam-wise report
            </DropdownMenuItem>
            {subjects && subjects.length > 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Subject-wise
                </DropdownMenuLabel>
                {subjects.map((s) => (
                  <DropdownMenuItem key={s.id} onSelect={() => openExam("subject", s.id)}>
                    {s.name}
                  </DropdownMenuItem>
                ))}
              </>
            ) : (
              <DropdownMenuItem
                onSelect={() => openExam("subject")}
                disabled
              >
                Subject-wise (add date sheet)
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => openExam("student")}>
              Student-wise report
              {studentIds?.length === 1 ? " (selected)" : " (all)"}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
