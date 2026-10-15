import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  CalendarCheck2,
  CalendarDays,
  Eye,
  GraduationCap,
  Layers,
  Loader2,
  Printer,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  fetchSessions,
  fetchAssessmentDateSheet,
  printAssessmentDateSheetPdf,
  type DateSheetRow,
} from "@/lib/configApi";
import {
  fetchAcademyClasses,
  fetchSectionsByClass,
} from "@/lib/studentManagementApi";
import ClassProgramSelect from "@/components/modules/ClassProgramSelect";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import PanelStatCard from "@/components/modules/PanelStatCard";
import { matchesPanelSearch } from "@/lib/panelSearch";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { dateSheetBatchHref } from "@/lib/testExamsMenus";
import {
  buildDateSheetBatches,
  dateSheetBatchKey,
  dateSheetPrintParams,
  formatDateSheetDate,
  type DateSheetBatch,
} from "./dateSheetBatch";

type CategoryFilter = "" | "test" | "exam";

const filterSelectClass =
  "h-10 rounded-md border border-input bg-background px-3 text-sm w-[10rem] shrink-0";

export default function DateSheetPanel() {
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const role = user?.role;
  const [printingKey, setPrintingKey] = useState<string | null>(null);

  const { data: sessions = [] } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: () => fetchSessions(),
  });

  const effectiveSessionId = useMemo(() => {
    const active = sessions.find((s) => s.isActive);
    return active?._id || sessions[0]?._id || "";
  }, [sessions]);

  const [classFilter, setClassFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setSectionFilter("");
  }, [classFilter]);

  const { data: classes = [] } = useQuery({
    queryKey: ["academy-classes", effectiveSessionId],
    queryFn: () => fetchAcademyClasses({ sessionId: effectiveSessionId, status: "active" }),
    enabled: Boolean(effectiveSessionId),
  });

  const { data: sections = [] } = useQuery({
    queryKey: ["academy-sections", classFilter, "date-sheet"],
    queryFn: () => fetchSectionsByClass(classFilter, { status: "active" }),
    enabled: Boolean(classFilter),
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["assessment-date-sheet", effectiveSessionId, classFilter, sectionFilter],
    queryFn: () =>
      fetchAssessmentDateSheet(effectiveSessionId, {
        classId: classFilter || undefined,
        sectionId: sectionFilter || undefined,
      }),
    enabled: Boolean(effectiveSessionId),
    retry: false,
  });

  const rows = useMemo(() => {
    let list = data?.rows || [];
    if (categoryFilter) {
      list = list.filter((r) => r.category === categoryFilter);
    }
    if (!search.trim()) return list;
    return list.filter((r: DateSheetRow) =>
      matchesPanelSearch(search, [
        r.testName,
        r.subjectName,
        r.className,
        r.sectionName,
        r.disciplineName,
        r.syllabus,
        r.assessmentTypeLabel,
      ])
    );
  }, [data, search, categoryFilter]);

  const batches = useMemo(() => buildDateSheetBatches(rows), [rows]);

  const printBatch = async (batch: DateSheetBatch) => {
    if (!effectiveSessionId) return;
    setPrintingKey(batch.key);
    try {
      const { params } = dateSheetPrintParams(effectiveSessionId, batch);
      await printAssessmentDateSheetPdf(effectiveSessionId, params);
    } catch (err) {
      toast({
        title: "Print failed",
        description: err instanceof Error ? err.message : "Could not open date sheet PDF",
        variant: "destructive",
      });
    } finally {
      setPrintingKey(null);
    }
  };

  const allRows = data?.rows || [];
  const classCount = useMemo(() => {
    const set = new Set(allRows.map((r) => r.className).filter(Boolean));
    return set.size;
  }, [allRows]);
  const subjectCount = useMemo(() => {
    const set = new Set(allRows.map((r) => r.subjectId || r.subjectName).filter(Boolean));
    return set.size;
  }, [allRows]);
  const assessmentCount = useMemo(() => {
    const set = new Set(allRows.map((r) => dateSheetBatchKey(r)));
    return set.size;
  }, [allRows]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
              <CalendarDays className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight">
                Date Sheet
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500 max-w-md">
                Published tests and exams are stacked by test number. Open one to view its subject
                schedule.
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
          value={isLoading ? "…" : allRows.length}
          hint={classFilter ? "Selected class" : "All classes"}
          icon={CalendarCheck2}
          iconWrapClass="bg-[#dbeafe]"
          iconClass="text-[#2563eb]"
        />
        <PanelStatCard
          label="Assessments"
          value={isLoading ? "…" : assessmentCount}
          hint="Tests & exams"
          icon={Layers}
          iconWrapClass="bg-[#ede9fe]"
          iconClass="text-[#7c3aed]"
        />
        <PanelStatCard
          label="Classes"
          value={isLoading ? "…" : classCount}
          hint="On this date sheet"
          icon={GraduationCap}
          iconWrapClass="bg-[#d1fae5]"
          iconClass="text-[#059669]"
        />
        <PanelStatCard
          label="Subjects"
          value={isLoading ? "…" : subjectCount}
          hint="Scheduled papers"
          icon={BookOpen}
          iconWrapClass="bg-[#ffedd5]"
          iconClass="text-[#ea580c]"
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <ClassProgramSelect
            className="w-[16.5rem] shrink-0"
            label={false}
            value={classFilter}
            onChange={setClassFilter}
            classes={classes}
            allowAll
            selectClassName="rounded-md border-input h-10"
          />
          <select
            className={filterSelectClass}
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
            aria-label="Section filter"
            disabled={!classFilter || sections.length === 0}
          >
            <option value="">All Sections</option>
            {sections.map((sec) => (
              <option key={sec._id} value={sec._id}>
                {sec.sectionName}
              </option>
            ))}
          </select>
          <select
            className={filterSelectClass}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
            aria-label="Type filter"
          >
            <option value="">All types</option>
            <option value="test">Class tests</option>
            <option value="exam">Term exams</option>
          </select>
          <PanelSearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search subject, test, syllabus…"
            className="min-w-[12rem] flex-1 max-w-md"
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {isLoading && <p className="p-6 text-sm text-muted-foreground">Loading date sheet…</p>}
        {isError && (
          <p className="p-6 text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "No published date sheet for this session."}
          </p>
        )}

        {!isLoading && !isError && data && (
          <>
            <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap gap-2 items-center bg-slate-50/80">
              <span className="font-semibold text-sm text-[#1a2b4b]">{data.session?.name}</span>
              {data.publishedAt && (
                <Badge variant="secondary" className="text-[10px]">
                  Published {formatDateSheetDate(data.publishedAt)}
                </Badge>
              )}
              <span className="text-xs text-slate-500">
                {batches.length} assessment{batches.length === 1 ? "" : "s"} · {rows.length} paper
                {rows.length === 1 ? "" : "s"}
              </span>
            </div>
            {batches.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                No papers match your filters.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="text-left bg-slate-50 border-b border-slate-200">
                      <th className="p-3 font-medium text-slate-600">Test</th>
                      <th className="p-3 font-medium text-slate-600">Class</th>
                      <th className="p-3 font-medium text-slate-600">Section</th>
                      <th className="p-3 font-medium text-slate-600">Type</th>
                      <th className="p-3 font-medium text-slate-600">Subjects</th>
                      <th className="p-3 font-medium text-slate-600">Dates</th>
                      <th className="p-3 font-medium text-slate-600">Marks</th>
                      <th className="p-3 font-medium text-slate-600 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((batch) => {
                      const href = role ? dateSheetBatchHref(role, batch.routeId) : "#";
                      const dateRange =
                        batch.dateFrom &&
                          batch.dateTo &&
                          formatDateSheetDate(batch.dateFrom) !== formatDateSheetDate(batch.dateTo)
                          ? `${formatDateSheetDate(batch.dateFrom)} – ${formatDateSheetDate(batch.dateTo)}`
                          : formatDateSheetDate(batch.dateFrom);
                      const subtitle =
                        batch.title && batch.title !== batch.testNumber
                          ? batch.title.replace(/^test\s*\d+\s*[—\-:]?\s*/i, "").trim() ||
                          batch.typeLabel
                          : batch.typeLabel;
                      return (
                        <tr
                          key={batch.key}
                          className="border-t border-slate-100 hover:bg-slate-50/80 cursor-pointer"
                          onClick={() => {
                            if (href !== "#") navigate(href);
                          }}
                        >
                          <td className="p-3">
                            <p className="font-semibold text-[#1a2b4b] whitespace-nowrap">
                              {batch.testNumber}
                            </p>
                            {subtitle ? (
                              <p className="text-xs text-slate-500 truncate max-w-[12rem]">
                                {subtitle}
                              </p>
                            ) : null}
                          </td>
                          <td className="p-3 whitespace-nowrap font-medium">{batch.className}</td>
                          <td className="p-3 whitespace-nowrap text-muted-foreground">
                            {batch.sectionName}
                          </td>
                          <td className="p-3 whitespace-nowrap text-muted-foreground">
                            {batch.typeLabel || "—"}
                          </td>
                          <td className="p-3">
                            <span className="font-medium tabular-nums">
                              {batch.subjectNames.length}
                            </span>
                            <span className="ml-1 text-xs text-slate-400">
                              {batch.subjectNames.length === 1 ? "subject" : "subjects"}
                            </span>
                          </td>
                          <td className="p-3 whitespace-nowrap text-muted-foreground text-xs">
                            {dateRange || "—"}
                          </td>
                          <td className="p-3 tabular-nums whitespace-nowrap">{batch.totalMarks}</td>
                          <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="inline-flex items-center justify-end gap-0.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-primary"
                                aria-label="View date sheet"
                                title="View"
                                asChild
                              >
                                <Link to={href}>
                                  <Eye className="h-4 w-4" />
                                </Link>
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                aria-label="Print date sheet"
                                title="Print"
                                disabled={printingKey === batch.key}
                                onClick={() => void printBatch(batch)}
                              >
                                {printingKey === batch.key ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Printer className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
