import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Award,
  CheckCircle2,
  ClipboardList,
  Eye,
  FileBadge,
  Loader2,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import type { ModuleActionCaps } from "@/lib/permissions";
import { fetchSessions } from "@/lib/configApi";
import ClassProgramSelect from "@/components/modules/ClassProgramSelect";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import PanelStatCard from "@/components/modules/PanelStatCard";
import {
  reportCardExamHref,
  reportCardTestHref,
} from "@/lib/testExamsMenus";
import {
  assessmentTypeLabel,
  fetchAcademyClasses,
  fetchClassTestEntry,
  fetchClassTests,
  fetchSectionsByClass,
  formatClassTestSchedule,
  type AcademyClassTest,
  type ClassTestEntryRow,
} from "@/lib/studentManagementApi";
import {
  fetchExamResults,
  fetchExams,
  type Exam,
} from "@/lib/examApi";
import { matchesPanelSearch } from "@/lib/panelSearch";
import { cn } from "@/lib/utils";

type ReportKind = "all" | "test" | "exam";

const filterSelectClass =
  "h-10 rounded-md border border-input bg-background px-3 text-sm w-[10rem] shrink-0";

function idOf(ref: string | { _id: string } | undefined | null): string {
  if (!ref) return "";
  return typeof ref === "object" ? String(ref._id) : String(ref);
}

function testSubjectName(test: AcademyClassTest) {
  const s = test.subjectId;
  return typeof s === "object" && s ? s.subjectName || s.subjectCode || "—" : "—";
}

function testSectionId(test: AcademyClassTest) {
  return idOf(test.sectionId);
}

function testClassName(test: AcademyClassTest) {
  const c = test.classId;
  return typeof c === "object" && c ? c.className || "—" : "—";
}

function testSectionName(test: AcademyClassTest) {
  const s = test.sectionId;
  return typeof s === "object" && s && "sectionName" in s
    ? String((s as { sectionName?: string }).sectionName || "—")
    : "—";
}

const tableHeadClass = "p-3 font-medium text-slate-600 text-left";
const tableCellClass = "p-3 border-t border-slate-100";

function normalizeTestLabel(value: string | undefined | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[#.]/g, " ")
    .replace(/\s+/g, " ");
}

/** Same batch key as backend — groups peer subjects (Test No. 1 Chemistry + Biology). */
function testBatchKey(test: AcademyClassTest) {
  const title = normalizeTestLabel(test.title);
  const series = normalizeTestLabel(test.seriesLabel);
  const numbered =
    title.match(/\btest\s*(?:no|number)?\s*(\d+)\b/) ||
    series.match(/\btest\s*(?:no|number)?\s*(\d+)\b/);
  if (numbered) return `test-no-${numbered[1]}`;
  if (series && test.occurrenceIndex != null) {
    return `${series}::occ-${test.occurrenceIndex}`;
  }
  return title || series || test._id;
}

function testBatchGroupKey(test: AcademyClassTest) {
  return [
    idOf(test.classId),
    idOf(test.sectionId) || "all",
    idOf(test.disciplineId) || "all",
    testBatchKey(test),
  ].join("|");
}

type PublishedTestRow = {
  test: AcademyClassTest;
  studentCount: number;
  entry: { students?: ClassTestEntryRow[] };
};

type PublishedTestBatch = {
  key: string;
  primaryTest: AcademyClassTest;
  tests: AcademyClassTest[];
  subjectNames: string[];
  studentCount: number;
  /** Prefer the earliest exam date among peers for display. */
  examDate: string | undefined;
};

function classNameOfExam(exam: Exam) {
  const c = exam.academyClass;
  return typeof c === "object" && c ? c.className || "—" : "—";
}

export default function ReportCardPanel({ caps: _caps }: { caps: ModuleActionCaps }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const role = user?.role;
  const isParent = user?.role === "parent";

  const { data: sessions = [] } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: () => fetchSessions(),
  });
  const activeSessionId = useMemo(
    () => sessions.find((s) => s.isActive)?._id || sessions[0]?._id || "",
    [sessions]
  );

  const [kind, setKind] = useState<ReportKind>("all");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [search, setSearch] = useState("");

  const effectiveSessionId = activeSessionId;
  const showTests = kind === "all" || kind === "test";
  const showExams = kind === "all" || kind === "exam";

  useEffect(() => {
    setClassId("");
    setSectionId("");
  }, [effectiveSessionId]);

  useEffect(() => {
    setSectionId("");
  }, [classId]);

  const { data: classes = [] } = useQuery({
    queryKey: ["academy-classes", effectiveSessionId, "report-card"],
    queryFn: () => fetchAcademyClasses({ sessionId: effectiveSessionId, status: "active" }),
    enabled: Boolean(effectiveSessionId) && !isParent,
  });

  const { data: sections = [] } = useQuery({
    queryKey: ["academy-sections", classId, "report-card"],
    queryFn: () => fetchSectionsByClass(classId, { status: "active" }),
    enabled: Boolean(classId) && !isParent,
  });

  /** Published class tests with recorded marks (session-wide by default). */
  const publishedTestsQ = useQuery({
    queryKey: ["report-card-published-tests", classId || "all", sectionId || "all", effectiveSessionId],
    queryFn: async () => {
      let tests = await fetchClassTests(classId || undefined, undefined, effectiveSessionId);
      if (classId) {
        tests = tests.filter((t) => idOf(t.classId) === classId);
      }
      if (sectionId) {
        tests = tests.filter((t) => !testSectionId(t) || testSectionId(t) === sectionId);
      }
      const rows = await Promise.all(
        tests.map(async (test) => {
          try {
            const entry = await fetchClassTestEntry(test._id);
            const withMarks = (entry.students || []).filter((row) => row.assessment);
            if (!withMarks.length) return null;
            return { test, studentCount: withMarks.length, entry };
          } catch {
            return null;
          }
        })
      );
      return rows
        .filter((r): r is NonNullable<typeof r> => Boolean(r))
        .sort(
          (a, b) =>
            new Date(b.test.examDate || 0).getTime() - new Date(a.test.examDate || 0).getTime()
        );
    },
    enabled: showTests && Boolean(effectiveSessionId) && !isParent,
  });

  /** Term exams with at least one published result (all classes by default). */
  const publishedExamsQ = useQuery({
    queryKey: [
      "report-card-published-exams",
      classId || "all",
      effectiveSessionId,
      classes.map((c) => c._id).join(","),
    ],
    queryFn: async () => {
      let exams = await fetchExams(classId || undefined);
      if (classId) {
        exams = exams.filter((e) => idOf(e.academyClass) === classId);
      } else if (classes.length) {
        const classIds = new Set(classes.map((c) => String(c._id)));
        exams = exams.filter((e) => classIds.has(idOf(e.academyClass)));
      }
      const rows = await Promise.all(
        exams.map(async (exam) => {
          try {
            const results = await fetchExamResults(exam._id);
            const published = (results || []).filter((r) => r.isPublished);
            if (!published.length) return null;
            return { exam, results: published, studentCount: published.length };
          } catch {
            return null;
          }
        })
      );
      return rows
        .filter((r): r is NonNullable<typeof r> => Boolean(r))
        .sort(
          (a, b) =>
            new Date(b.exam.startDate || 0).getTime() - new Date(a.exam.startDate || 0).getTime()
        );
    },
    enabled: showExams && Boolean(effectiveSessionId) && !isParent,
  });

  /** Group peer subject tests into one list row (e.g. Test 1 · Chemistry, Biology). */
  const publishedTestBatches = useMemo((): PublishedTestBatch[] => {
    const rows = (publishedTestsQ.data || []) as PublishedTestRow[];
    const map = new Map<string, PublishedTestRow[]>();
    rows.forEach((row) => {
      const key = testBatchGroupKey(row.test);
      const list = map.get(key) || [];
      list.push(row);
      map.set(key, list);
    });
    return [...map.entries()]
      .map(([key, group]) => {
        const sorted = [...group].sort((a, b) =>
          testSubjectName(a.test).localeCompare(testSubjectName(b.test))
        );
        const byDate = [...group].sort(
          (a, b) =>
            new Date(a.test.examDate || 0).getTime() - new Date(b.test.examDate || 0).getTime()
        );
        const primary = byDate[0]?.test || sorted[0].test;
        const studentIds = new Set<string>();
        group.forEach((g) => {
          (g.entry?.students || []).forEach((s) => {
            if (s.assessment) studentIds.add(String(s.student._id));
          });
        });
        return {
          key,
          primaryTest: primary,
          tests: sorted.map((g) => g.test),
          subjectNames: sorted.map((g) => testSubjectName(g.test)).filter((n) => n && n !== "—"),
          studentCount: studentIds.size || Math.max(...group.map((g) => g.studentCount), 0),
          examDate: primary.examDate,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.examDate || 0).getTime() - new Date(a.examDate || 0).getTime()
      );
  }, [publishedTestsQ.data]);

  const filteredTestBatches = useMemo(() => {
    if (!search.trim()) return publishedTestBatches;
    return publishedTestBatches.filter((batch) => {
      const test = batch.primaryTest;
      return matchesPanelSearch(search, [
        test.title,
        test.occurrenceIndex != null ? `Test ${test.occurrenceIndex}` : "",
        testClassName(test),
        testSectionName(test),
        assessmentTypeLabel(test.assessmentType) || test.assessmentType,
        batch.subjectNames.join(" "),
        formatClassTestSchedule(test),
      ]);
    });
  }, [publishedTestBatches, search]);

  const filteredExams = useMemo(() => {
    const list = publishedExamsQ.data || [];
    if (!search.trim()) return list;
    return list.filter(({ exam }) =>
      matchesPanelSearch(search, [
        exam.title,
        classNameOfExam(exam),
        exam.type,
        exam.sessionLabel,
      ])
    );
  }, [publishedExamsQ.data, search]);

  const listLoading =
    (showTests && publishedTestsQ.isLoading) || (showExams && publishedExamsQ.isLoading);

  const publishedTestCount = publishedTestBatches.length;
  const publishedExamCount = (publishedExamsQ.data || []).length;
  const visibleTestCount = filteredTestBatches.length;
  const visibleExamCount = filteredExams.length;
  const reportStudentsReady = useMemo(() => {
    const testStudentsCount = publishedTestBatches.reduce((sum, b) => sum + b.studentCount, 0);
    const examStudentsCount = (publishedExamsQ.data || []).reduce(
      (sum, r) => sum + (r.studentCount || 0),
      0
    );
    return testStudentsCount + examStudentsCount;
  }, [publishedTestBatches, publishedExamsQ.data]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
              <FileBadge className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight">
                Report Card
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500 max-w-md">
                All published tests and exams are listed by default. Pick one to print report cards.
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

      {isParent ? (
        <Card className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-muted-foreground shadow-sm">
          Report cards for parents are available from your child&apos;s results once the academy
          publishes them.
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
            <PanelStatCard
              label="Published Tests"
              value={listLoading && showTests ? "…" : publishedTestCount}
              hint={classId ? "Selected class" : "All classes"}
              icon={ClipboardList}
              iconWrapClass="bg-[#dbeafe]"
              iconClass="text-[#2563eb]"
            />
            <PanelStatCard
              label="Published Exams"
              value={listLoading && showExams ? "…" : publishedExamCount}
              hint={classId ? "Selected class" : "All classes"}
              icon={Award}
              iconWrapClass="bg-[#ede9fe]"
              iconClass="text-[#7c3aed]"
            />
            <PanelStatCard
              label="Ready to Print"
              value={listLoading ? "…" : publishedTestCount + publishedExamCount}
              hint="Assessments with results"
              icon={CheckCircle2}
              iconWrapClass="bg-[#d1fae5]"
              iconClass="text-[#059669]"
            />
            <PanelStatCard
              label="Student Cards"
              value={listLoading ? "…" : reportStudentsReady}
              hint="Across listed assessments"
              icon={Users}
              iconWrapClass="bg-[#ffedd5]"
              iconClass="text-[#ea580c]"
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <ClassProgramSelect
                className="w-[16.5rem] shrink-0"
                label={false}
                value={classId}
                onChange={setClassId}
                classes={classes}
                allowAll
                selectClassName="rounded-md border-input h-10"
              />
              <select
                className={filterSelectClass}
                value={sectionId}
                disabled={!classId || sections.length === 0}
                onChange={(e) => setSectionId(e.target.value)}
                aria-label="Section filter"
              >
                <option value="">All Sections</option>
                {sections.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.sectionName}
                  </option>
                ))}
              </select>
              <select
                className={filterSelectClass}
                value={kind}
                onChange={(e) => setKind(e.target.value as ReportKind)}
                aria-label="Type filter"
              >
                <option value="all">All types</option>
                <option value="test">Class tests</option>
                <option value="exam">Term exams</option>
              </select>
              <PanelSearchBar
                value={search}
                onChange={setSearch}
                placeholder="Search test, exam, class…"
                className="min-w-[12rem] flex-1 max-w-md"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-[#1a2b4b]">
                  {kind === "all"
                    ? "Published tests & exams"
                    : kind === "test"
                      ? "Published class tests"
                      : "Published term exams"}
                </p>
                <p className="text-xs text-slate-500">
                  {listLoading
                    ? "Loading published assessments…"
                    : `${showTests ? `${publishedTestCount} test${publishedTestCount === 1 ? "" : "s"}` : ""}${showTests && showExams ? " · " : ""
                    }${showExams ? `${publishedExamCount} exam${publishedExamCount === 1 ? "" : "s"}` : ""}${classId ? " for selected class" : " across all classes"
                    }. Open one to view and print report cards.`}
                </p>
              </div>
              {listLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>

            {showTests && !listLoading && visibleTestCount === 0 && kind === "test" && (
              <p className="p-6 text-sm text-muted-foreground">
                {search.trim()
                  ? "No class tests match your search."
                  : `No class tests with recorded marks${classId ? " for this class" : ""}${sectionId ? " / section" : ""
                  }.`}
              </p>
            )}

            {showExams && !listLoading && visibleExamCount === 0 && kind === "exam" && (
              <p className="p-6 text-sm text-muted-foreground">
                {search.trim()
                  ? "No term exams match your search."
                  : `No term exams with published results${classId ? " for this class" : ""}.`}
              </p>
            )}

            {kind === "all" &&
              !listLoading &&
              visibleTestCount === 0 &&
              visibleExamCount === 0 && (
                <p className="p-6 text-sm text-muted-foreground">
                  {search.trim()
                    ? "No published tests or exams match your search."
                    : `No published tests or exams with results yet${classId ? " for this class" : ""
                    }.`}
                </p>
              )}

            {showTests && visibleTestCount > 0 && (
              <div>
                {kind === "all" && (
                  <p className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
                    Class tests
                  </p>
                )}
                <div className="overflow-x-auto max-h-[22rem]">
                  <table className="w-full text-sm min-w-[780px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className={tableHeadClass}>Test</th>
                        <th className={tableHeadClass}>Class</th>
                        <th className={tableHeadClass}>Section</th>
                        <th className={tableHeadClass}>Type</th>
                        <th className={tableHeadClass}>Subjects</th>
                        <th className={tableHeadClass}>Date</th>
                        <th className={tableHeadClass}>Students</th>
                        <th className={cn(tableHeadClass, "text-right")}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTestBatches.map((batch) => {
                        const test = batch.primaryTest;
                        const href = role ? reportCardTestHref(role, test._id) : "#";
                        return (
                          <tr
                            key={batch.key}
                            className="hover:bg-slate-50/80 cursor-pointer"
                            onClick={() => {
                              if (href !== "#") navigate(href);
                            }}
                          >
                            <td className={tableCellClass}>
                              <p className="font-semibold text-[#1a2b4b] whitespace-nowrap">
                                {test.occurrenceIndex != null
                                  ? `Test ${test.occurrenceIndex}`
                                  : test.title}
                              </p>
                              {test.title && test.occurrenceIndex != null ? (
                                <p className="text-xs text-slate-500 truncate max-w-[14rem]">
                                  {test.title}
                                </p>
                              ) : null}
                            </td>
                            <td className={cn(tableCellClass, "whitespace-nowrap font-medium")}>
                              {testClassName(test)}
                            </td>
                            <td
                              className={cn(
                                tableCellClass,
                                "whitespace-nowrap text-muted-foreground"
                              )}
                            >
                              {testSectionName(test)}
                            </td>
                            <td
                              className={cn(
                                tableCellClass,
                                "whitespace-nowrap text-muted-foreground"
                              )}
                            >
                              {assessmentTypeLabel(test.assessmentType) ||
                                test.assessmentType ||
                                "—"}
                            </td>
                            <td className={cn(tableCellClass, "max-w-[14rem]")}>
                              <span className="line-clamp-2">
                                {batch.subjectNames.join(", ") || testSubjectName(test)}
                              </span>
                            </td>
                            <td
                              className={cn(
                                tableCellClass,
                                "whitespace-nowrap text-xs text-muted-foreground"
                              )}
                            >
                              {formatClassTestSchedule(test) || "—"}
                            </td>
                            <td className={tableCellClass}>
                              <Badge variant="secondary" className="text-[10px]">
                                {batch.studentCount} student
                                {batch.studentCount === 1 ? "" : "s"}
                              </Badge>
                            </td>
                            <td
                              className={cn(tableCellClass, "text-right")}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-primary"
                                aria-label="View report cards"
                                title="View"
                                asChild
                              >
                                <Link to={href}>
                                  <Eye className="h-4 w-4" />
                                </Link>
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {showExams && visibleExamCount > 0 && (
              <div>
                {kind === "all" && (
                  <p className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
                    Term exams
                  </p>
                )}
                <div className="overflow-x-auto max-h-[22rem]">
                  <table className="w-full text-sm min-w-[720px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className={tableHeadClass}>Exam</th>
                        <th className={tableHeadClass}>Class</th>
                        <th className={tableHeadClass}>Type</th>
                        <th className={tableHeadClass}>Session</th>
                        <th className={tableHeadClass}>Date</th>
                        <th className={tableHeadClass}>Published</th>
                        <th className={cn(tableHeadClass, "text-right")}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredExams.map(({ exam, studentCount }) => {
                        const href = role ? reportCardExamHref(role, exam._id) : "#";
                        return (
                          <tr
                            key={exam._id}
                            className="hover:bg-slate-50/80 cursor-pointer"
                            onClick={() => {
                              if (href !== "#") navigate(href);
                            }}
                          >
                            <td className={tableCellClass}>
                              <p className="font-semibold text-[#1a2b4b] truncate max-w-[16rem]">
                                {exam.title}
                              </p>
                            </td>
                            <td className={cn(tableCellClass, "whitespace-nowrap font-medium")}>
                              {classNameOfExam(exam)}
                            </td>
                            <td
                              className={cn(
                                tableCellClass,
                                "whitespace-nowrap text-muted-foreground"
                              )}
                            >
                              {exam.type || "—"}
                            </td>
                            <td
                              className={cn(
                                tableCellClass,
                                "whitespace-nowrap text-muted-foreground"
                              )}
                            >
                              {exam.sessionLabel || "—"}
                            </td>
                            <td
                              className={cn(
                                tableCellClass,
                                "whitespace-nowrap text-xs text-muted-foreground"
                              )}
                            >
                              {exam.startDate
                                ? new Date(exam.startDate).toLocaleDateString()
                                : "—"}
                            </td>
                            <td className={tableCellClass}>
                              <Badge variant="secondary" className="text-[10px]">
                                {studentCount} published
                              </Badge>
                            </td>
                            <td
                              className={cn(tableCellClass, "text-right")}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-primary"
                                aria-label="View report cards"
                                title="View"
                                asChild
                              >
                                <Link to={href}>
                                  <Eye className="h-4 w-4" />
                                </Link>
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
