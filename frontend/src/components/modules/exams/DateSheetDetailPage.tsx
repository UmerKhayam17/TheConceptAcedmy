import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Loader2, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  fetchSessions,
  fetchAssessmentDateSheet,
  printAssessmentDateSheetPdf,
} from "@/lib/configApi";
import type { Role } from "@/lib/auth";
import { testExamsHref } from "@/lib/testExamsMenus";
import { useToast } from "@/hooks/use-toast";
import {
  dateSheetPrintParams,
  findDateSheetBatchByPaperId,
  formatDateSheetDate,
} from "./dateSheetBatch";

export default function DateSheetDetailPage({
  paperId,
  role,
}: {
  paperId: string;
  role: Role;
}) {
  const { toast } = useToast();
  const [printing, setPrinting] = useState(false);

  const { data: sessions = [] } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: () => fetchSessions(),
  });

  const sessionId = useMemo(() => {
    const active = sessions.find((s) => s.isActive);
    return active?._id || sessions[0]?._id || "";
  }, [sessions]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["assessment-date-sheet", sessionId, "detail"],
    queryFn: () => fetchAssessmentDateSheet(sessionId),
    enabled: Boolean(sessionId),
    retry: false,
  });

  const batch = useMemo(
    () => findDateSheetBatchByPaperId(data?.rows || [], paperId),
    [data?.rows, paperId]
  );

  const printBatch = async () => {
    if (!sessionId || !batch) return;
    setPrinting(true);
    try {
      const { params } = dateSheetPrintParams(sessionId, batch);
      await printAssessmentDateSheetPdf(sessionId, params);
    } catch (err) {
      toast({
        title: "Print failed",
        description: err instanceof Error ? err.message : "Could not open date sheet PDF",
        variant: "destructive",
      });
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <Link
              to={testExamsHref(role, "date-sheet")}
              className="text-xs text-primary hover:underline mb-0.5 inline-block"
            >
              ← Back to assessments
            </Link>
            {isLoading ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading date sheet…
              </p>
            ) : batch ? (
              <>
                <p className="text-sm font-semibold text-[#1a2b4b] truncate">
                  {batch.testNumber}
                  {batch.typeLabel ? ` — ${batch.typeLabel}` : ""}
                </p>
                <p className="text-xs text-slate-500">
                  {[
                    `Class ${batch.className}`,
                    `Section ${batch.sectionName}`,
                    batch.disciplineName ? `Discipline ${batch.disciplineName}` : "",
                    `${batch.papers.length} subject${batch.papers.length === 1 ? "" : "s"}`,
                    `${batch.totalMarks} total marks`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </>
            ) : (
              <p className="text-sm font-semibold text-[#1a2b4b]">Date sheet not found</p>
            )}
          </div>
          {batch && (
            <div className="flex items-center gap-1.5 shrink-0">
              <Badge variant="secondary" className="text-[10px] capitalize">
                {batch.category}
              </Badge>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                aria-label="Print date sheet"
                title="Print"
                disabled={printing}
                onClick={() => void printBatch()}
              >
                {printing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Printer className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}
        </div>

        {isError && (
          <p className="p-6 text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "No published date sheet for this session."}
          </p>
        )}

        {!isLoading && !isError && !batch && (
          <p className="p-6 text-sm text-muted-foreground">
            This assessment is not on the published date sheet, or it was removed.
          </p>
        )}

        {batch && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left bg-slate-50 border-b border-slate-200">
                  <th className="p-3 font-medium text-slate-600 w-10">#</th>
                  <th className="p-3 font-medium text-slate-600">Date</th>
                  <th className="p-3 font-medium text-slate-600">Class</th>
                  <th className="p-3 font-medium text-slate-600">Section</th>
                  <th className="p-3 font-medium text-slate-600">Subject</th>
                  <th className="p-3 font-medium text-slate-600">Marks</th>
                  <th className="p-3 font-medium text-slate-600">Syllabus</th>
                </tr>
              </thead>
              <tbody>
                {batch.papers.map((r, idx) => (
                  <tr
                    key={`${r.subjectId}-${r.examDate}-${idx}`}
                    className="border-t border-slate-100 align-top hover:bg-slate-50/60"
                  >
                    <td className="p-3 tabular-nums text-muted-foreground">{idx + 1}</td>
                    <td className="p-3 whitespace-nowrap">{formatDateSheetDate(r.examDate)}</td>
                    <td className="p-3 whitespace-nowrap font-medium">{r.className || "—"}</td>
                    <td className="p-3 whitespace-nowrap text-muted-foreground">
                      {r.sectionName || "—"}
                    </td>
                    <td className="p-3 font-medium text-[#1a2b4b]">{r.subjectName}</td>
                    <td className="p-3 tabular-nums">{r.totalMarks}</td>
                    <td className="p-3 text-muted-foreground max-w-xs">
                      {r.syllabus ? (
                        <span className="inline-flex gap-1">
                          <BookOpen className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          {r.syllabus}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
