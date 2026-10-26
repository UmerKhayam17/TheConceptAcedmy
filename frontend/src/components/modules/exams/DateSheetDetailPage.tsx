import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  CalendarCheck2,
  CalendarDays,
  ClipboardList,
  Layers,
  Loader2,
  Printer,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SyllabusText } from "@/components/ui/syllabus-text";
import {
  fetchSessions,
  fetchAssessmentDateSheet,
  printAssessmentDateSheetPdf,
} from "@/lib/configApi";
import type { Role } from "@/lib/auth";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import FilterToolbar, { FilterToolbarActions } from "@/components/modules/FilterToolbar";
import PanelStatCard from "@/components/modules/PanelStatCard";
import { matchesPanelSearch } from "@/lib/panelSearch";
import { useToast } from "@/hooks/use-toast";
import {
  dateSheetPrintParams,
  findDateSheetBatchByPaperId,
  formatDateSheetDate,
} from "./dateSheetBatch";

export default function DateSheetDetailPage({
  paperId,
  role: _role,
}: {
  paperId: string;
  role: Role;
}) {
  const { toast } = useToast();
  const [printing, setPrinting] = useState(false);
  const [search, setSearch] = useState("");

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

  const syllabusCount = useMemo(() => {
    if (!batch) return 0;
    return batch.papers.filter((p) => String(p.syllabus || "").trim()).length;
  }, [batch]);

  const avgMarks = useMemo(() => {
    if (!batch?.papers.length) return 0;
    return Math.round((batch.totalMarks / batch.papers.length) * 10) / 10;
  }, [batch]);

  const filteredPapers = useMemo(() => {
    if (!batch) return [];
    if (!search.trim()) return batch.papers;
    return batch.papers.filter((r) =>
      matchesPanelSearch(search, [
        r.subjectName,
        r.className,
        r.sectionName,
        r.syllabus,
        r.assessmentTypeLabel,
        formatDateSheetDate(r.examDate),
      ])
    );
  }, [batch, search]);

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

  const headingTitle = batch
    ? `${batch.testNumber}${batch.typeLabel ? ` — ${batch.typeLabel}` : ""}`
    : isLoading
      ? "Date Sheet"
      : "Date sheet not found";

  const dateRange =
    batch?.dateFrom
      ? batch.dateTo &&
        formatDateSheetDate(batch.dateFrom) !== formatDateSheetDate(batch.dateTo)
        ? `${formatDateSheetDate(batch.dateFrom)} – ${formatDateSheetDate(batch.dateTo)}`
        : formatDateSheetDate(batch.dateFrom)
      : "";

  const headingMeta = batch
    ? [
        `Class ${batch.className}`,
        `Section ${batch.sectionName}`,
        batch.disciplineName ? `Discipline ${batch.disciplineName}` : "",
        dateRange,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Published subject schedule for this assessment.";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
              <CalendarDays className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {batch ? (
                  <Badge variant="secondary" className="text-[10px] capitalize">
                    {batch.category === "exam" ? "Term exam" : "Class test"}
                  </Badge>
                ) : null}
              </div>
              <h2 className="mt-0.5 text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight truncate">
                {headingTitle}
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500 line-clamp-2 max-w-2xl">
                {headingMeta}
              </p>
            </div>
          </div>
          <div className="shrink-0 rounded-lg bg-primary/10 px-3 py-2 max-w-[14rem]">
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

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <PanelStatCard
          label="Papers"
          value={isLoading ? "…" : batch?.papers.length ?? 0}
          hint="Scheduled subjects"
          icon={CalendarCheck2}
          iconWrapClass="bg-[#dbeafe]"
          iconClass="text-[#2563eb]"
        />
        <PanelStatCard
          label="Total marks"
          value={isLoading ? "…" : batch?.totalMarks ?? 0}
          hint="Across all subjects"
          icon={Layers}
          iconWrapClass="bg-[#ede9fe]"
          iconClass="text-[#7c3aed]"
        />
        <PanelStatCard
          label="Avg marks"
          value={isLoading ? "…" : avgMarks}
          hint="Per subject paper"
          icon={BookOpen}
          iconWrapClass="bg-[#d1fae5]"
          iconClass="text-[#059669]"
        />
        <PanelStatCard
          label="With syllabus"
          value={isLoading ? "…" : syllabusCount}
          hint={
            batch?.papers.length
              ? `${batch.papers.length - syllabusCount} still empty`
              : "Syllabus entered"
          }
          icon={ClipboardList}
          iconWrapClass="bg-[#ffedd5]"
          iconClass="text-[#ea580c]"
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
        <FilterToolbar>
          <PanelSearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search subject, syllabus…"
            className="min-w-[12rem] flex-1 max-w-md"
          />
          <FilterToolbarActions>
          <Button
            size="sm"
            variant="outline"
            className="h-10 gap-1.5"
            disabled={!batch || printing}
            onClick={() => void printBatch()}
          >
            {printing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Printer className="h-3.5 w-3.5" />
            )}
            Print
          </Button>
          </FilterToolbarActions>
        </FilterToolbar>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-[#1a2b4b]">Subject schedule</p>
            <p className="text-xs text-slate-500">
              {isLoading
                ? "Loading date sheet…"
                : batch
                  ? `${filteredPapers.length} subject${filteredPapers.length === 1 ? "" : "s"}${
                      search.trim() ? " matching search" : " on this assessment"
                    }.`
                  : "Assessment not found."}
            </p>
          </div>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
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

        {batch && filteredPapers.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground">
            {search.trim()
              ? "No subjects match your search."
              : "No subjects scheduled for this assessment."}
          </p>
        )}

        {batch && filteredPapers.length > 0 && (
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
                {filteredPapers.map((r, idx) => (
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
                        <span className="inline-flex gap-1.5 items-start">
                          <BookOpen className="h-3.5 w-3.5 mt-1 shrink-0" />
                          <SyllabusText
                            text={r.syllabus}
                            className="block whitespace-pre-wrap"
                            empty={null}
                          />
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
