import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import type { Role } from "@/lib/auth";
import type { ModuleActionCaps } from "@/lib/permissions";
import { classTestSeriesHref, testExamsHref } from "@/lib/testExamsMenus";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import CreatedByLine from "@/components/modules/CreatedByLine";
import { matchesPanelSearch } from "@/lib/panelSearch";
import TestPaperCapture from "@/components/modules/exams/TestPaperCapture";
import {
  ASSESSMENT_TYPE_LABELS,
  fetchClassTestEntry,
  formatClassTestSchedule,
  saveClassTestMarks,
  uploadClassTestPaper,
  type AcademyClassTest,
  type AssessmentType,
  type ClassTestEntryRow,
} from "@/lib/studentManagementApi";

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

  const [search, setSearch] = useState("");
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

  const rowsFiltered = useMemo(() => {
    if (!search.trim()) return rows;
    return rows.filter((row) =>
      matchesPanelSearch(
        search,
        row.student.studentName,
        row.student.studentId,
        row.student.fatherName,
        row.student.rollNumber,
        row.student.phone,
        row.student.sectionName,
        row.student.guardianName
      )
    );
  }, [rows, search]);

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
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const handleSave = () => {
    if (!test) return;
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

  if (isLoading) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">Loading test and students…</div>
    );
  }

  if (isError || !test) {
    return (
      <div className="py-12 space-y-4 text-center">
        <p className="text-destructive text-sm">{(error as Error)?.message || "Test not found"}</p>
        <Button variant="outline" asChild>
          <Link to={listHref}>Back to tests</Link>
        </Button>
      </div>
    );
  }

  const sectionLabel = sectionNameOf(test);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b pb-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" asChild>
              <Link to={seriesHref ?? listHref}>
                <ArrowLeft className="h-4 w-4" /> {seriesHref ? "Back to schedule" : "Back to tests"}
              </Link>
            </Button>
            {seriesHref && (
              <Button variant="outline" size="sm" asChild>
                <Link to={listHref}>All tests</Link>
              </Button>
            )}
          </div>
          <h2 className="font-display text-xl font-semibold text-primary">
            {test.seriesLabel || test.title}
          </h2>
          <p className="text-sm text-muted-foreground">
            {classNameOf(test)}
            {sectionLabel ? ` · ${sectionLabel}` : ""} · {subjectNameOf(test)} ·{" "}
            {ASSESSMENT_TYPE_LABELS[test.assessmentType as AssessmentType]} ·{" "}
            {formatClassTestSchedule(test)} · Total {test.totalMarks} marks
          </p>
          <CreatedByLine createdBy={test.createdBy} label="Test created by" />
          {test.teacherId && typeof test.teacherId === "object" && (
            <CreatedByLine createdBy={test.teacherId} label="Assigned teacher" />
          )}
          {test.occurrenceIndex && test.occurrenceCount && test.occurrenceCount > 1 && (
            <Badge variant="secondary" className="text-xs">
              {test.recurrence === "weekly"
                ? "Weekly"
                : test.recurrence === "daily"
                  ? "Daily"
                  : test.recurrence === "monthly"
                    ? "Monthly"
                    : "Series"}{" "}
              · part {test.occurrenceIndex} of {test.occurrenceCount}
            </Badge>
          )}
          {seriesHref && series.length > 1 && (
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" asChild>
              <Link to={seriesHref}>View full schedule ({series.length} dates)</Link>
            </Button>
          )}
        </div>
        {canEnter && (
          <Button variant="hero" className="shrink-0" onClick={handleSave} disabled={saveMut.isPending}>
            <Save className="h-4 w-4 mr-1" />
            Save marks
          </Button>
        )}
      </div>

      <PanelSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search name, ID, father, roll, phone…"
        className="max-w-md"
      />

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-8 text-sm text-center text-muted-foreground">
            No students enrolled in this test&apos;s subject.
          </p>
        ) : rowsFiltered.length === 0 ? (
          <p className="p-8 text-sm text-center text-muted-foreground">No students match your search.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">#</th>
                  <th className="text-left p-3 font-medium min-w-[140px]">Student</th>
                  <th className="text-left p-3 font-medium min-w-[120px]">Father name</th>
                  <th className="text-left p-3 font-medium min-w-[130px]">Roll number</th>
                  <th className="text-left p-3 font-medium">Section</th>
                  <th className="text-left p-3 font-medium min-w-[110px]">Phone</th>
                  <th className="text-center p-3 font-medium w-36">Obtained</th>
                  <th className="text-center p-3 font-medium w-[100px]">Test paper</th>
                  <th className="text-left p-3 font-medium min-w-[140px]">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {rowsFiltered.map((row, idx) => {
                  const sid = row.student._id;
                  const cell = marks[sid] || { obtained: "", remarks: "" };
                  const pct =
                    cell.obtained !== ""
                      ? Math.round((Number(cell.obtained) / totalMarks) * 100)
                      : null;
                  return (
                    <tr key={sid} className="border-b hover:bg-muted/20">
                      <td className="p-3 text-muted-foreground">{idx + 1}</td>
                      <td className="p-3 font-medium whitespace-nowrap">{row.student.studentName}</td>
                      <td className="p-3 text-muted-foreground whitespace-nowrap">
                        {row.student.fatherName || "—"}
                      </td>
                      <td className="p-3 font-mono text-xs whitespace-nowrap">
                        {row.student.rollNumber || "—"}
                      </td>
                      <td className="p-3 text-muted-foreground">{row.student.sectionName || "—"}</td>
                      <td className="p-3 text-muted-foreground whitespace-nowrap">
                        {row.student.phone || "—"}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1">
                          <Input
                            className="h-9 w-20 text-center"
                            type="number"
                            min={0}
                            max={totalMarks}
                            value={cell.obtained}
                            disabled={!canEnter}
                            onChange={(e) =>
                              setMarks((m) => ({
                                ...m,
                                [sid]: { ...cell, obtained: e.target.value },
                              }))
                            }
                          />
                          <span className="text-xs text-muted-foreground">/ {totalMarks}</span>
                          {pct != null && !Number.isNaN(pct) && (
                            <span className="text-xs font-medium text-primary w-10">{pct}%</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <TestPaperCapture
                          value={cell.testPaperImage}
                          disabled={!canEnter}
                          uploading={cell.uploadingPaper}
                          onPick={(file) => handleTestPaperUpload(sid, file)}
                        />
                      </td>
                      <td className="p-3">
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
