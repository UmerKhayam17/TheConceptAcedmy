import { useEffect, useMemo, useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  Filter,
  Minus,
  MoreVertical,
  RotateCcw,
  Save,
  Search,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import type { Role } from "@/lib/auth";
import type { ModuleActionCaps } from "@/lib/permissions";
import { classTestSeriesHref, testExamsHref } from "@/lib/testExamsMenus";
import { createdByLabel } from "@/lib/createdBy";
import { matchesPanelSearch } from "@/lib/panelSearch";
import AwardListButton from "@/components/modules/exams/AwardListButton";
import TestPaperCapture from "@/components/modules/exams/TestPaperCapture";
import PageSizeSelect, {
  DEFAULT_PAGE_SIZE,
} from "@/components/modules/student-management/PageSizeSelect";
import { formatDate } from "@/components/modules/student-management/studentDisplayUtils";
import {
  ASSESSMENT_TYPE_LABELS,
  fetchClassTestEntry,
  saveClassTestMarks,
  uploadClassTestPaper,
  type AcademyClassTest,
  type AssessmentType,
  type ClassTestEntryRow,
} from "@/lib/studentManagementApi";
import { clampMarksInput, validateObtainedVsTotal } from "@/lib/marksValidation";
import { cn } from "@/lib/utils";

function classNameOf(test: AcademyClassTest) {
  const c = test.classId;
  return typeof c === "object" && c ? c.className : "—";
}

function subjectNameOf(test: AcademyClassTest) {
  const s = test.subjectId;
  return typeof s === "object" && s ? s.subjectName : "—";
}

function sectionNameOf(test: AcademyClassTest) {
  const s = test.sectionId;
  return typeof s === "object" && s ? s.sectionName : "";
}

function disciplineNameOf(test: AcademyClassTest) {
  const d = test.disciplineId;
  return typeof d === "object" && d ? d.name : "";
}

function scheduleParts(test: AcademyClassTest) {
  const date = formatDate(test.examDate);
  const time = test.testTime?.trim() || "";
  return { date, time, label: time ? `${date} at ${time}` : date };
}

function typeLabel(test: AcademyClassTest) {
  return ASSESSMENT_TYPE_LABELS[test.assessmentType as AssessmentType] || test.assessmentType;
}

function sectionBadgeClass(name: string) {
  const letter = name.trim().charAt(0).toUpperCase();
  if (letter === "A") return "bg-sky-100 text-sky-800 border-sky-200";
  if (letter === "B") return "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200";
  if (letter === "C") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (letter === "D") return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function initialOf(name?: string) {
  const ch = (name || "?").trim().charAt(0).toUpperCase();
  return ch || "?";
}

function pageWindow(current: number, totalPages: number, max = 5): number[] {
  if (totalPages <= max) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const half = Math.floor(max / 2);
  let start = Math.max(1, current - half);
  let end = start + max - 1;
  if (end > totalPages) {
    end = totalPages;
    start = Math.max(1, end - max + 1);
  }
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function SquareCheckbox({
  checked,
  indeterminate = false,
  onChange,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  "aria-label": string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={ariaLabel}
      onClick={onChange}
      className={cn(
        "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border border-slate-300 bg-white transition-colors",
        "hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        (checked || indeterminate) && "border-primary bg-primary text-primary-foreground",
      )}
    >
      {indeterminate ? (
        <Minus className="h-3 w-3" strokeWidth={3} />
      ) : checked ? (
        <Check className="h-3 w-3" strokeWidth={3} />
      ) : null}
    </button>
  );
}

function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  iconBg,
  iconColor,
}: {
  title: string;
  value: string;
  description: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <div className="relative flex min-h-[118px] flex-col overflow-hidden rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
      <div className="flex items-start gap-2.5">
        <div
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
          style={{ backgroundColor: iconBg }}
        >
          <Icon className="h-5 w-5" style={{ color: iconColor }} strokeWidth={2} />
        </div>
        <p className="truncate pt-0.5 text-[12px] font-semibold text-slate-500">{title}</p>
      </div>
      <div className="mt-auto min-w-0 pt-3">
        <div className="truncate text-[24px] font-bold leading-none tracking-tight text-[#10244A]">
          {value}
        </div>
        <p className="mt-2 text-[11px] font-medium text-slate-400">{description}</p>
      </div>
    </div>
  );
}

const selectClass =
  "h-10 rounded-md border border-input bg-background px-3 text-sm min-w-[9rem] shrink-0";

export default function ClassTestMarksPage({
  testId,
  role,
  caps,
}: {
  testId: string;
  role: Role;
  caps: ModuleActionCaps;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const canEnter = caps.canEdit || caps.canCreate;
  const listHref = testExamsHref(role, "enter-tests");

  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [sectionDraft, setSectionDraft] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [marks, setMarks] = useState<
    Record<
      string,
      {
        obtained: string;
        remarks: string;
        assessmentId?: string;
        testPaperImage?: string;
        uploadingPaper?: boolean;
      }
    >
  >({});

  const { data: entry, isLoading, isError, error } = useQuery({
    queryKey: ["class-test-entry", testId],
    queryFn: () => fetchClassTestEntry(testId),
  });

  const rows = entry?.students ?? [];
  const test = entry?.test;
  const series = entry?.series ?? [];
  const totalMarks = test?.totalMarks ?? 20;
  const seriesHref =
    test?.seriesId && test.recurrence && test.recurrence !== "once"
      ? classTestSeriesHref(role, test.seriesId)
      : null;

  const sectionOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      const s = (r.student.sectionName || "").trim();
      if (s) set.add(s);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const rowsFiltered = useMemo(() => {
    let list = rows;
    if (sectionFilter) {
      list = list.filter(
        (row) => (row.student.sectionName || "").trim() === sectionFilter,
      );
    }
    if (search.trim()) {
      list = list.filter((row) =>
        matchesPanelSearch(
          search,
          row.student.studentName,
          row.student.studentId,
          row.student.fatherName,
          row.student.rollNumber,
          row.student.phone,
          row.student.sectionName,
          row.student.guardianName,
        ),
      );
    }
    return list;
  }, [rows, search, sectionFilter]);

  const totalFiltered = rowsFiltered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return rowsFiltered.slice(start, start + pageSize);
  }, [rowsFiltered, safePage, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [search, sectionFilter, pageSize]);

  useEffect(() => {
    setSelectedIds([]);
  }, [safePage, pageSize, search, sectionFilter, testId]);

  useEffect(() => {
    if (!rows.length) return;
    const draft: Record<
      string,
      { obtained: string; remarks: string; assessmentId?: string; testPaperImage?: string }
    > = {};
    rows.forEach((row: ClassTestEntryRow) => {
      const sid = row.student._id;
      draft[sid] = {
        obtained: row.assessment != null ? String(row.assessment.obtainedMarks) : "",
        remarks: row.assessment?.remarks || "",
        assessmentId: row.assessment?._id,
        testPaperImage: row.assessment?.testPaperImage,
      };
    });
    setMarks(draft);
  }, [entry]);

  const marksEnteredCount = useMemo(
    () => rows.filter((r) => (marks[r.student._id]?.obtained ?? "") !== "").length,
    [rows, marks],
  );
  const marksPct =
    rows.length > 0 ? Math.round((marksEnteredCount / rows.length) * 100) : 0;

  const handleTestPaperUpload = async (studentId: string, file: File) => {
    setMarks((m) => ({
      ...m,
      [studentId]: { ...(m[studentId] || { obtained: "", remarks: "" }), uploadingPaper: true },
    }));
    try {
      const { testPaperImage } = await uploadClassTestPaper(testId, studentId, file);
      setMarks((m) => ({
        ...m,
        [studentId]: {
          ...(m[studentId] || { obtained: "", remarks: "" }),
          testPaperImage,
          uploadingPaper: false,
        },
      }));
      toast({
        title: "Test paper uploaded",
        description: "Image saved. Enter marks and click Save marks when ready.",
      });
    } catch (e) {
      setMarks((m) => ({
        ...m,
        [studentId]: { ...(m[studentId] || { obtained: "", remarks: "" }), uploadingPaper: false },
      }));
      toast({
        title: "Upload failed",
        description: e instanceof Error ? e.message : "Could not upload image",
        variant: "destructive",
      });
    }
  };

  const saveMut = useMutation({
    mutationFn: (entries: Parameters<typeof saveClassTestMarks>[1]) =>
      saveClassTestMarks(testId, entries),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["class-test-entry", testId] });
      qc.invalidateQueries({ queryKey: ["class-tests"] });
      toast({ title: `Saved ${data.savedCount} mark(s)` });
    },
    onError: (e: Error) =>
      toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const handleSave = () => {
    if (!test) return;
    for (const row of rows) {
      const cell = marks[row.student._id];
      if (!cell || cell.obtained === "") continue;
      const err = validateObtainedVsTotal(Number(cell.obtained), totalMarks);
      if (err) {
        toast({
          title: "Invalid marks",
          description: `${row.student.studentName}: ${err}`,
          variant: "destructive",
        });
        return;
      }
    }
    const entries = rows
      .map((row) => {
        const cell = marks[row.student._id];
        if (!cell || cell.obtained === "") return null;
        return {
          studentId: row.student._id,
          assessmentId: cell.assessmentId,
          obtainedMarks: Number(cell.obtained),
          remarks: cell.remarks,
          testPaperImage: cell.testPaperImage,
        };
      })
      .filter(Boolean) as Parameters<typeof saveClassTestMarks>[1];

    saveMut.mutate(entries);
  };

  const applyFilters = () => {
    setSearch(searchDraft.trim());
    setSectionFilter(sectionDraft);
    setPage(1);
  };

  const resetFilters = () => {
    setSearchDraft("");
    setSearch("");
    setSectionDraft("");
    setSectionFilter("");
    setPage(1);
  };

  const pageIds = pageRows.map((r) => r.student._id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
  const somePageSelected = pageIds.some((id) => selectedIds.includes(id));

  const toggleSelectAllPage = () => {
    if (allPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  if (isLoading) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        Loading test and students…
      </div>
    );
  }

  if (isError || !test) {
    return (
      <div className="py-12 space-y-4 text-center">
        <p className="text-destructive text-sm">
          {(error as Error)?.message || "Test not found"}
        </p>
        <Button variant="outline" asChild>
          <Link to={listHref}>Back to tests</Link>
        </Button>
      </div>
    );
  }

  const sectionLabel = sectionNameOf(test);
  const disciplineLabel = disciplineNameOf(test);
  const schedule = scheduleParts(test);
  const assessmentLabel = typeLabel(test);
  const createdBy = createdByLabel(test.createdBy);
  const teacherName =
    test.teacherId && typeof test.teacherId === "object"
      ? createdByLabel(test.teacherId)
      : "—";

  const showingFrom = totalFiltered > 0 ? (safePage - 1) * pageSize + 1 : 0;
  const showingTo = Math.min(safePage * pageSize, totalFiltered);
  const pages = pageWindow(safePage, totalPages);

  const metaBits = [
    classNameOf(test),
    sectionLabel || null,
    disciplineLabel || null,
    subjectNameOf(test),
    assessmentLabel,
    schedule.label,
    `Total ${test.totalMarks} marks`,
  ].filter(Boolean);

  return (
    <div className="space-y-5">
      <Card className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#3b82f6]">
              <ClipboardList className="h-5 w-5 text-white" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-slate-400">
                <Link to={listHref} className="hover:text-[#2563eb]">
                  Exams
                </Link>
                <span className="mx-1 text-slate-300">›</span>
                <Link to={seriesHref ?? listHref} className="hover:text-[#2563eb]">
                  {seriesHref ? "Schedule" : "Test Scheduling"}
                </Link>
                <span className="mx-1 text-slate-300">›</span>
                Marks entry
              </p>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight">
                {test.seriesLabel || test.title}
              </h1>
              <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500 max-w-3xl truncate">
                {metaBits.join(" · ")}
                {createdBy !== "—" ? ` · Created by ${createdBy}` : ""}
                {teacherName !== "—" ? ` · Teacher ${teacherName}` : ""}
              </p>
            </div>
          </div>
          <div className="shrink-0 rounded-lg bg-[#e8f2ff] px-3 py-2 max-w-[15rem]">
            <p className="text-xs sm:text-sm italic leading-snug text-[#1a2b4b]/80">
              <span className="mr-1 text-[#3b82f6] not-italic font-serif text-base leading-none">
                &ldquo;
              </span>
              A great school builds great futures.
              <span className="ml-0.5 text-[#3b82f6] not-italic font-serif text-base leading-none">
                &rdquo;
              </span>
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          title="Total Students"
          value={String(rows.length)}
          description="Students registered for this test"
          icon={Users}
          iconBg="#DBEAFE"
          iconColor="#2563EB"
        />
        <MetricCard
          title="Marks Entered"
          value={`${marksEnteredCount} / ${rows.length}`}
          description={`${marksPct}% completed`}
          icon={CheckCircle2}
          iconBg="#D1FAE5"
          iconColor="#059669"
        />
        <MetricCard
          title="Total Marks"
          value={String(totalMarks)}
          description="Per student"
          icon={FileText}
          iconBg="#EDE9FE"
          iconColor="#7C3AED"
        />
        <MetricCard
          title="Test Date & Time"
          value={schedule.time ? `${schedule.date} • ${schedule.time}` : schedule.date}
          description={assessmentLabel}
          icon={Calendar}
          iconBg="#FCE7F3"
          iconColor="#DB2777"
        />
      </div>

      <Card className="p-3 sm:p-4 shadow-sm border-border/80">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[14rem] flex-1 max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilters();
              }}
              placeholder="Search name, ID, father, roll, phone..."
              className="h-10 pl-9"
            />
          </div>
          <select
            className={selectClass}
            value={sectionDraft}
            onChange={(e) => setSectionDraft(e.target.value)}
            aria-label="Section filter"
          >
            <option value="">All Sections</option>
            {sectionOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap items-center gap-2 shrink-0 ml-auto">
            <Button variant="outline" className="gap-2 h-10" onClick={applyFilters}>
              <Filter className="h-4 w-4" />
              Filter
            </Button>
            <Button variant="outline" className="gap-2 h-10" onClick={resetFilters}>
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
            <AwardListButton
              testId={testId}
              size="default"
              label="Award list"
              className="h-10"
            />
            {canEnter && (
              <Button
                className="h-10 gap-2"
                onClick={handleSave}
                disabled={saveMut.isPending}
              >
                <Save className="h-4 w-4" />
                {saveMut.isPending ? "Saving…" : "Save marks"}
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden shadow-sm border-border/80">
        {rows.length === 0 ? (
          <p className="p-10 text-sm text-center text-muted-foreground">
            No students enrolled in this test&apos;s subject.
          </p>
        ) : totalFiltered === 0 ? (
          <p className="p-10 text-sm text-center text-muted-foreground">
            No students match your search.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    <th className="w-10 p-3 text-center">
                      <SquareCheckbox
                        checked={allPageSelected}
                        indeterminate={!allPageSelected && somePageSelected}
                        onChange={toggleSelectAllPage}
                        aria-label="Select all on this page"
                      />
                    </th>
                    <th className="text-left p-3 font-medium w-10">#</th>
                    <th className="text-left p-3 font-medium min-w-[160px]">Student</th>
                    <th className="text-left p-3 font-medium min-w-[120px]">Father name</th>
                    <th className="text-left p-3 font-medium min-w-[110px]">Phone</th>
                    <th className="text-left p-3 font-medium min-w-[110px]">Roll number</th>
                    <th className="text-left p-3 font-medium">Section</th>
                    <th className="text-center p-3 font-medium w-[9.5rem]">Obtained</th>
                    <th className="text-center p-3 font-medium w-[7rem]">Test paper</th>
                    <th className="text-left p-3 font-medium min-w-[140px]">Remarks</th>
                    <th className="text-right p-3 font-medium w-12">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row, idx) => {
                    const sid = row.student._id;
                    const cell = marks[sid] || { obtained: "", remarks: "" };
                    const isSelected = selectedIds.includes(sid);
                    const name = row.student.studentName;
                    const roll = row.student.rollNumber || "—";
                    return (
                      <tr
                        key={sid}
                        className={cn(
                          "border-b last:border-0 hover:bg-muted/20",
                          isSelected && "bg-muted/40",
                        )}
                      >
                        <td className="w-10 p-3 text-center">
                          <SquareCheckbox
                            checked={isSelected}
                            onChange={() => toggleSelectOne(sid)}
                            aria-label={`Select ${name}`}
                          />
                        </td>
                        <td className="p-3 text-muted-foreground tabular-nums">
                          {(safePage - 1) * pageSize + idx + 1}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#dbeafe] text-sm font-semibold text-[#2563eb]">
                              {initialOf(name)}
                            </span>
                            <div className="min-w-0">
                              <div className="font-semibold text-[#1a2b4b] truncate">{name}</div>
                              <div className="text-xs text-muted-foreground">Roll No: {roll}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-muted-foreground whitespace-nowrap">
                          {row.student.fatherName || "—"}
                        </td>
                        <td className="p-3 text-muted-foreground whitespace-nowrap">
                          {row.student.phone || "—"}
                        </td>
                        <td className="p-3 font-mono text-xs whitespace-nowrap">{roll}</td>
                        <td className="p-3">
                          {row.student.sectionName ? (
                            <span
                              className={cn(
                                "inline-flex min-w-[1.75rem] items-center justify-center rounded-md border px-2 py-0.5 text-xs font-semibold",
                                sectionBadgeClass(row.student.sectionName),
                              )}
                            >
                              {row.student.sectionName}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3 align-middle">
                          <div className="mx-auto flex h-9 w-fit items-center gap-2">
                            <label className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 transition-colors focus-within:border-[#2563eb]/40 focus-within:ring-2 focus-within:ring-[#2563eb]/15">
                              <input
                                className="h-8 w-11 border-0 bg-transparent p-0 text-center text-sm tabular-nums outline-none [appearance:textfield] placeholder:text-muted-foreground/50 disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                type="number"
                                min={0}
                                max={totalMarks}
                                step="any"
                                inputMode="decimal"
                                placeholder="—"
                                value={cell.obtained}
                                disabled={!canEnter}
                                aria-label={`Obtained marks out of ${totalMarks}`}
                                onChange={(e) =>
                                  setMarks((m) => ({
                                    ...m,
                                    [sid]: {
                                      ...cell,
                                      obtained: clampMarksInput(e.target.value, totalMarks),
                                    },
                                  }))
                                }
                              />
                              <span className="select-none text-xs tabular-nums text-muted-foreground">
                                / {totalMarks}
                              </span>
                            </label>
                          </div>
                        </td>
                        <td className="p-3 align-middle">
                          <TestPaperCapture
                            value={cell.testPaperImage}
                            disabled={!canEnter}
                            uploading={cell.uploadingPaper}
                            onPick={(file) => handleTestPaperUpload(sid, file)}
                            onClear={
                              canEnter
                                ? () =>
                                    setMarks((m) => ({
                                      ...m,
                                      [sid]: { ...cell, testPaperImage: undefined },
                                    }))
                                : undefined
                            }
                          />
                        </td>
                        <td className="p-3 align-middle">
                          <Input
                            className="h-9"
                            placeholder="Optional"
                            value={cell.remarks}
                            disabled={!canEnter}
                            onChange={(e) =>
                              setMarks((m) => ({
                                ...m,
                                [sid]: { ...cell, remarks: e.target.value },
                              }))
                            }
                          />
                        </td>
                        <td className="p-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground"
                                aria-label="Row actions"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {canEnter ? (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setMarks((m) => ({
                                      ...m,
                                      [sid]: { ...cell, obtained: "", remarks: "" },
                                    }));
                                  }}
                                >
                                  Clear marks
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem disabled>No actions</DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-t bg-muted/10">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-muted-foreground">
                  Showing{" "}
                  <span className="font-medium text-foreground">{showingFrom}</span>
                  {" to "}
                  <span className="font-medium text-foreground">{showingTo}</span>
                  {" of "}
                  <span className="font-medium text-foreground">{totalFiltered}</span>
                  {" students"}
                </p>
                <PageSizeSelect
                  value={pageSize}
                  onChange={(n) => {
                    setPageSize(n);
                    setPage(1);
                  }}
                />
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {pages.map((n) => (
                    <Button
                      key={n}
                      variant={n === safePage ? "default" : "outline"}
                      size="icon"
                      className="h-8 w-8 text-sm"
                      onClick={() => setPage(n)}
                      aria-label={`Page ${n}`}
                      aria-current={n === safePage ? "page" : undefined}
                    >
                      {n}
                    </Button>
                  ))}
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
