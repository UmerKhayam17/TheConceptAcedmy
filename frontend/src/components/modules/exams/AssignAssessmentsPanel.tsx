import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Eye,
  FileStack,
  Loader2,
  Pencil,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SyllabusText } from "@/components/ui/syllabus-text";
import PanelStatCard from "@/components/modules/PanelStatCard";
import { cn, localYmd } from "@/lib/utils";
import { containsUrduScript } from "@/lib/urduText";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { ModuleActionCaps } from "@/lib/permissions";
import { ASSESSMENT_TYPE_LABELS, type AssessmentType } from "@/lib/assessmentTaxonomy";
import { systemConfigHref } from "@/lib/systemConfigMenus";
import { classTestMarksHref, classTestSeriesHref } from "@/lib/testExamsMenus";
import { useAuth } from "@/hooks/useAuth";
import {
  createAssessmentAssignment,
  deleteAssessmentAssignment,
  fetchAssessmentAssignments,
  fetchAssessmentPlan,
  fetchSessions,
  fetchTeacherTestScope,
  publishAssessmentAssignment,
  updateAssessmentAssignment,
  upsertAssessmentAssignmentPapers,
  type AssessmentAssignment,
  type AssessmentPlanItem,
  type AssessmentPlanPaper,
  type TeacherTestScopeAssignment,
} from "@/lib/configApi";
import {
  deleteClassTest,
  fetchAcademyClasses,
  fetchClassTests,
  fetchDisciplinesByClass,
  fetchSectionsByClass,
  fetchSubjectsByClass,
  formatClassTestSchedule,
  type AcademyClassTest,
  type AcademyClass,
  type AcademyDiscipline,
  type AcademySection,
  type AcademySubject,
} from "@/lib/studentManagementApi";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import AwardListButton from "@/components/modules/exams/AwardListButton";
import MarksReportButton from "@/components/modules/exams/MarksReportButton";
import { matchesPanelSearch } from "@/lib/panelSearch";

/** First published class-test id on an assignment (for marks report). */
function firstClassTestIdOf(a: AssessmentAssignment): string | undefined {
  for (const p of a.papers || []) {
    if (p.classTestId) return String(p.classTestId);
  }
  return undefined;
}

function idOf(ref: string | { _id: string } | undefined | null): string {
  if (!ref) return "";
  return typeof ref === "object" ? ref._id : ref;
}

function classNameOf(a: AssessmentAssignment) {
  const c = a.classId;
  return typeof c === "object" && c ? c.className || "—" : "—";
}

function sectionNameOf(a: AssessmentAssignment) {
  const s = a.sectionId;
  return typeof s === "object" && s ? s.sectionName || "" : "";
}

function disciplineNameOf(a: AssessmentAssignment) {
  const d = a.disciplineId;
  return typeof d === "object" && d ? d.name || "" : "";
}

function paperDate(p: AssessmentPlanPaper) {
  if (!p.examDate) return "";
  try {
    return localYmd(p.examDate);
  } catch {
    return "";
  }
}

function paperLabel(p: AssessmentPlanPaper) {
  const s = p.subjectId;
  if (typeof s === "object" && s && "subjectName" in s && s.subjectName) return s.subjectName;
  return "Subject";
}

function testClassName(test: AcademyClassTest) {
  const c = test.classId;
  return typeof c === "object" && c ? c.className || "—" : "—";
}

function testSubjectName(test: AcademyClassTest) {
  const s = test.subjectId;
  return typeof s === "object" && s ? s.subjectName || "—" : "—";
}

function isReady(a: AssessmentAssignment, subjectFilter?: Set<string>) {
  return (a.papers || []).some((p) => {
    if (subjectFilter && subjectFilter.size && !subjectFilter.has(idOf(p.subjectId))) return false;
    return Boolean(p.totalMarks && p.examDate);
  });
}

function subjectIdsForScope(
  scopeRows: TeacherTestScopeAssignment[],
  classId: string,
  sectionId?: string,
) {
  const set = new Set<string>();
  for (const row of scopeRows) {
    if (row.classId !== classId) continue;
    if (sectionId && row.sectionId !== sectionId) continue;
    set.add(row.subjectId);
  }
  return set;
}

function uniqueClassOptions(scopeRows: TeacherTestScopeAssignment[]) {
  const map = new Map<string, string>();
  for (const r of scopeRows) map.set(r.classId, r.className || r.classId);
  return [...map.entries()].map(([id, name]) => ({ _id: id, className: name }));
}

function sectionOptionsForClass(scopeRows: TeacherTestScopeAssignment[], classId: string) {
  const map = new Map<string, string>();
  for (const r of scopeRows) {
    if (r.classId !== classId) continue;
    map.set(r.sectionId, r.sectionName || r.sectionId);
  }
  return [...map.entries()].map(([id, name]) => ({ _id: id, sectionName: name }));
}

/**
 * Assessments → Assign
 * Pick a catalog test/exam and assign it to any number of classes/sections
 * with subject marks, dates, and syllabus.
 * Teachers are gated by Teacher Subject Assignment (class + section + subject).
 */
export default function AssignAssessmentsPanel({
  caps,
  category,
  onEnterExam,
}: {
  caps: ModuleActionCaps;
  category: "test" | "exam";
  onEnterExam?: (examId: string, subjectId?: string) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role ?? "admin";
  const isTeacher = role === "teacher";
  const canManage = caps.canCreate || caps.canEdit;
  const canEnterMarks = caps.canEdit || caps.canCreate;
  const canDelete = caps.canDelete;

  const { data: sessions = [] } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: () => fetchSessions(),
  });
  const activeId = useMemo(() => sessions.find((s) => s.isActive)?._id || sessions[0]?._id || "", [sessions]);
  const [sessionId, setSessionId] = useState("");
  const effectiveSessionId = sessionId || activeId;

  const branch = category;
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [configAssignment, setConfigAssignment] = useState<AssessmentAssignment | null>(null);
  const [subjectsAssignment, setSubjectsAssignment] = useState<AssessmentAssignment | null>(null);

  const { data: planData, isLoading: planLoading } = useQuery({
    queryKey: ["assessment-plan", effectiveSessionId],
    queryFn: () => fetchAssessmentPlan(effectiveSessionId),
    enabled: Boolean(effectiveSessionId),
  });

  const { data: assignData, isLoading } = useQuery({
    queryKey: ["assessment-assignments", effectiveSessionId, branch],
    queryFn: () => fetchAssessmentAssignments(effectiveSessionId, { category: branch }),
    enabled: Boolean(effectiveSessionId),
  });

  const { data: teacherScope } = useQuery({
    queryKey: ["teacher-test-scope", effectiveSessionId],
    queryFn: () => fetchTeacherTestScope(effectiveSessionId),
    enabled: Boolean(effectiveSessionId) && isTeacher && branch === "test",
  });
  const scopeRows = teacherScope?.assignments || [];

  const { data: classes = [] } = useQuery({
    queryKey: ["academy-classes", effectiveSessionId, "assign-filter"],
    queryFn: () => fetchAcademyClasses({ sessionId: effectiveSessionId, status: "active" }),
    enabled: Boolean(effectiveSessionId) && !isTeacher,
  });

  const filterClasses = isTeacher
    ? uniqueClassOptions(scopeRows)
    : (classes as AcademyClass[]).map((c) => ({ _id: c._id, className: c.className }));

  const catalogItems = (planData?.plan.items || []).filter((i) => i.category === branch);
  const assignments = assignData?.assignments || [];
  const { data: classTests = [] } = useQuery({
    queryKey: ["class-tests", classFilter, effectiveSessionId, "marks-list"],
    queryFn: () => fetchClassTests(classFilter || undefined, undefined, effectiveSessionId),
    enabled: branch === "test",
  });

  const linkedTestIds = useMemo(() => {
    const ids = new Set<string>();
    for (const a of assignments) {
      for (const p of a.papers || []) {
        if (p.classTestId) ids.add(String(p.classTestId));
      }
    }
    return ids;
  }, [assignments]);

  const otherTests = useMemo(() => {
    if (branch !== "test") return [];
    return classTests.filter((t) => {
      if (linkedTestIds.has(t._id)) return false;
      if (statusFilter === "draft") return false;
      return matchesPanelSearch(search, [
        t.title,
        t.seriesLabel,
        testClassName(t),
        testSubjectName(t),
        ASSESSMENT_TYPE_LABELS[t.assessmentType as AssessmentType],
      ]);
    });
  }, [branch, classTests, linkedTestIds, search, statusFilter]);

  const draftCount = assignments.filter((a) => a.status === "draft").length;
  const publishedCount = assignments.filter((a) => a.status === "published").length;

  const filtered = useMemo(() => {
    return assignments.filter((a) => {
      if (classFilter && idOf(a.classId) !== classFilter) return false;
      if (statusFilter && a.status !== statusFilter) return false;
      return matchesPanelSearch(search, [
        a.name,
        classNameOf(a),
        sectionNameOf(a),
        disciplineNameOf(a),
        ASSESSMENT_TYPE_LABELS[a.assessmentType as AssessmentType],
      ]);
    });
  }, [assignments, search, classFilter, statusFilter]);

  const papersForTeacher = (a: AssessmentAssignment) => {
    if (!isTeacher) return a.papers || [];
    const allowed = subjectIdsForScope(scopeRows, idOf(a.classId), idOf(a.sectionId) || undefined);
    return (a.papers || []).filter((p) => allowed.has(idOf(p.subjectId)));
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["assessment-assignments", effectiveSessionId] });
    qc.invalidateQueries({ queryKey: ["assessment-plan", effectiveSessionId] });
    qc.invalidateQueries({ queryKey: ["class-tests"] });
    qc.invalidateQueries({ queryKey: ["exams"] });
    qc.invalidateQueries({ queryKey: ["teacher-test-scope", effectiveSessionId] });
  };

  if (!effectiveSessionId) {
    return (
      <p className="text-sm text-muted-foreground py-8">No academic session found.</p>
    );
  }

  const catalogReady = planData?.plan.status === "ready";

  const noun = branch === "test" ? "test" : "exam";

  if (isTeacher && branch === "test" && teacherScope && scopeRows.length === 0) {
    return (
      <Card className="p-6 space-y-2">
        <p className="text-sm font-medium">No teaching assignments</p>
        <p className="text-sm text-muted-foreground">
          You are not assigned to any subject/class yet. Ask an admin to add your Teacher Subject Assignment
          in Academic Setup.
        </p>
      </Card>
    );
  }
  const HeaderIcon = branch === "test" ? ClipboardList : Award;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
              <HeaderIcon className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight">
                {branch === "test" ? "Tests" : "Exams"}
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500 max-w-md">
                {branch === "test"
                  ? "Create and manage class tests — publish papers, enter marks, and print reports."
                  : "Create and manage term exams — date sheet, marks entry, and publish results."}
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
          label={branch === "test" ? "Total Tests" : "Total Exams"}
          value={isLoading ? "…" : assignments.length}
          hint="This session"
          icon={branch === "test" ? ClipboardList : Award}
          iconWrapClass="bg-[#dbeafe]"
          iconClass="text-[#2563eb]"
        />
        <PanelStatCard
          label="Draft"
          value={isLoading ? "…" : draftCount}
          hint="Not published yet"
          icon={Pencil}
          iconWrapClass="bg-[#ffedd5]"
          iconClass="text-[#ea580c]"
        />
        <PanelStatCard
          label="Published"
          value={isLoading ? "…" : publishedCount}
          hint={
            isLoading || !assignments.length
              ? undefined
              : `${Math.round((publishedCount / Math.max(assignments.length, 1)) * 100)}%`
          }
          icon={CheckCircle2}
          iconWrapClass="bg-[#d1fae5]"
          iconClass="text-[#059669]"
        />
        <PanelStatCard
          label="Catalog"
          value={isLoading ? "…" : catalogItems.length}
          hint="Available types"
          icon={FileStack}
          iconWrapClass="bg-[#ede9fe]"
          iconClass="text-[#7c3aed]"
        />
      </div>

      {!planLoading && !catalogReady && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-5 space-y-3 shadow-sm">
          <p className="text-sm text-muted-foreground">
            No {noun}s in the catalog for this session yet.
            {isTeacher
              ? " Ask an admin to add them in Assessment Catalog first."
              : " Add them in Assessment Catalog first."}
          </p>
          {!isTeacher && (
            <Button variant="outline" size="sm" asChild>
              <Link to={systemConfigHref(role, branch === "exam" ? "exam-catalog" : "test-catalog")}>
                Open {noun} catalog
              </Link>
            </Button>
          )}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 min-w-0 flex-1">
            <div className="min-w-0">
              <Label className="mb-1 block text-xs text-slate-500">Search</Label>
              <PanelSearchBar
                value={search}
                onChange={setSearch}
                placeholder={`Search ${noun}, class…`}
                className="max-w-none w-full min-w-0"
                inputClassName="h-10"
              />
            </div>
            <div className="min-w-0">
              <Label className="mb-1 block text-xs text-slate-500">Session</Label>
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={effectiveSessionId}
                onChange={(e) => {
                  setSessionId(e.target.value);
                  setClassFilter("");
                }}
              >
                {sessions.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                    {s.isActive ? " (active)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <Label className="mb-1 block text-xs text-slate-500">Class</Label>
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
              >
                <option value="">All classes (School + College)</option>
                {filterClasses.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.className}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <Label className="mb-1 block text-xs text-slate-500">Status</Label>
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All</option>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>
          </div>
          {canManage && branch === "test" && isTeacher && (
            <Button size="sm" className="h-10 w-full gap-2 xl:w-auto" onClick={() => setAssignOpen(true)} disabled={!catalogReady || !scopeRows.length}>
              <Plus className="h-4 w-4" />
              Create {noun}
            </Button>
          )}
          {canManage && !(branch === "test" && isTeacher) && (
            <Button size="sm" className="h-10 w-full gap-2 xl:w-auto" onClick={() => setAssignOpen(true)} disabled={!catalogReady}>
              <Plus className="h-4 w-4" />
              Create {noun}
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left p-2.5 font-medium">Name</th>
                <th className="text-left p-2.5 font-medium">Type</th>
                <th className="text-left p-2.5 font-medium">Class</th>
                <th className="text-left p-2.5 font-medium hidden md:table-cell">Section</th>
                <th className="text-left p-2.5 font-medium hidden lg:table-cell">Discipline</th>
                <th className="text-left p-2.5 font-medium">Subjects</th>
                <th className="text-left p-2.5 font-medium">Status</th>
                <th className="text-right p-2.5 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                    </span>
                  </td>
                </tr>
              )}
              {!isLoading && assignments.length === 0 && otherTests.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    No {noun}s yet. Create one from the catalog, then set the date, marks, and syllabus.
                  </td>
                </tr>
              )}
              {!isLoading && (assignments.length > 0 || otherTests.length > 0) && filtered.length === 0 && otherTests.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    Nothing matches these filters.
                  </td>
                </tr>
              )}
              {filtered.map((a) => {
                const visiblePapers = papersForTeacher(a);
                const teacherSubjectSet = isTeacher
                  ? subjectIdsForScope(scopeRows, idOf(a.classId), idOf(a.sectionId) || undefined)
                  : undefined;
                return (
                <tr
                  key={a._id}
                  className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                  onClick={() => setSubjectsAssignment(a)}
                >
                  <td className="p-2.5 font-medium text-primary">{a.name}</td>
                  <td className="p-2.5 text-muted-foreground">
                    {ASSESSMENT_TYPE_LABELS[a.assessmentType as AssessmentType] || a.assessmentType}
                  </td>
                  <td className="p-2.5">{classNameOf(a)}</td>
                  <td className="p-2.5 hidden md:table-cell">{sectionNameOf(a) || "All"}</td>
                  <td className="p-2.5 hidden lg:table-cell">{disciplineNameOf(a) || "All"}</td>
                  <td className="p-2.5 text-muted-foreground">
                    {visiblePapers.length
                      ? visiblePapers.map((p) => paperLabel(p)).join(", ")
                      : "—"}
                  </td>
                  <td className="p-2.5">
                    <Badge variant={a.status === "published" ? "default" : "secondary"} className="text-[10px] capitalize">
                      {a.status}
                    </Badge>
                  </td>
                  <td
                    className="p-2.5 text-right whitespace-nowrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex justify-end gap-0.5">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        title="View assessment"
                        aria-label="View assessment"
                        onClick={() => setSubjectsAssignment(a)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {canManage && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-sky-600 hover:text-sky-700"
                          title="Edit"
                          aria-label="Edit"
                          onClick={() => setConfigAssignment(a)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {canManage && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-violet-600 hover:text-violet-700"
                          title="Syllabus"
                          aria-label="Syllabus"
                          onClick={() => setConfigAssignment(a)}
                        >
                          <BookOpen className="h-4 w-4" />
                        </Button>
                      )}
                      {a.status === "published" && a.category === "exam" && a.examId && (
                        <MarksReportButton
                          examId={String(a.examId)}
                          iconOnly
                          title="Print exam marks report"
                        />
                      )}
                      {a.status === "published" &&
                        a.category !== "exam" &&
                        firstClassTestIdOf(a) && (
                          <MarksReportButton
                            testId={firstClassTestIdOf(a)}
                            iconOnly
                            title="Print test marks report"
                          />
                        )}
                      {caps.canCreate && a.status === "draft" && isReady(a, teacherSubjectSet) && (
                        <PublishButton sessionId={effectiveSessionId} assignmentId={a._id} onDone={invalidate} />
                      )}
                      {canDelete && (
                        <DeleteButton
                          sessionId={effectiveSessionId}
                          assignmentId={a._id}
                          published={a.status === "published"}
                          onDone={invalidate}
                        />
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
              {otherTests.map((t) => (
                <tr
                  key={t._id}
                  className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                  onClick={() => {
                    if (t.seriesId && t.recurrence && t.recurrence !== "once") {
                      navigate(classTestSeriesHref(role, t.seriesId));
                    } else {
                      navigate(classTestMarksHref(role, t._id));
                    }
                  }}
                >
                  <td className="p-2.5 font-medium">{t.seriesLabel || t.title}</td>
                  <td className="p-2.5 text-muted-foreground">
                    {ASSESSMENT_TYPE_LABELS[t.assessmentType as AssessmentType] || t.assessmentType}
                  </td>
                  <td className="p-2.5">{testClassName(t)}</td>
                  <td className="p-2.5 hidden md:table-cell">—</td>
                  <td className="p-2.5 hidden lg:table-cell">
                    {typeof t.disciplineId === "object" && t.disciplineId
                      ? t.disciplineId.name
                      : "All"}
                  </td>
                  <td className="p-2.5 text-primary">{testSubjectName(t)}</td>
                  <td className="p-2.5">
                    <Badge variant="default" className="text-[10px]">Published</Badge>
                  </td>
                  <td
                    className="p-2.5 text-right space-x-1 whitespace-nowrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-muted-foreground text-xs mr-1">
                      {formatClassTestSchedule(t)} · {t.totalMarks} marks
                    </span>
                    <MarksReportButton
                      testId={t._id}
                      iconOnly
                      title="Print test marks report"
                    />
                    <AwardListButton testId={t._id} />
                    {canDelete && (
                      <DeleteClassTestButton test={t} onDone={invalidate} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <TestSubjectsDialog
        assignment={subjectsAssignment}
        subjectFilter={
          subjectsAssignment && isTeacher
            ? subjectIdsForScope(
                scopeRows,
                idOf(subjectsAssignment.classId),
                idOf(subjectsAssignment.sectionId) || undefined,
              )
            : undefined
        }
        canEnterMarks={canEnterMarks}
        onOpenChange={(open) => {
          if (!open) setSubjectsAssignment(null);
        }}
        onEnterMarks={(testId) => navigate(classTestMarksHref(role, testId))}
        onEnterExam={(examId, subjectId) => {
          setSubjectsAssignment(null);
          onEnterExam?.(examId, subjectId);
        }}
      />

      <AssignDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        sessionId={effectiveSessionId}
        catalogItems={catalogItems}
        branch={branch}
        isTeacher={isTeacher}
        scopeRows={scopeRows}
        onCreated={(a) => {
          invalidate();
          setAssignOpen(false);
          setConfigAssignment(a);
        }}
      />

      <ConfigureAssignmentDialog
        open={Boolean(configAssignment)}
        onOpenChange={(o) => {
          if (!o) setConfigAssignment(null);
        }}
        sessionId={effectiveSessionId}
        assignment={configAssignment}
        canManage={canManage}
        isTeacher={isTeacher}
        scopeRows={scopeRows}
        onSaved={() => {
          invalidate();
          setConfigAssignment(null);
        }}
      />
    </div>
  );
}

function PublishButton({
  sessionId,
  assignmentId,
  onDone,
}: {
  sessionId: string;
  assignmentId: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const mut = useMutation({
    mutationFn: () => publishAssessmentAssignment(sessionId, assignmentId),
    onSuccess: (res) => {
      onDone();
      toast({
        title: "Published",
        description: `${res.published.testsCreated} test paper(s), ${res.published.examsCreated} exam(s). Parents notified.`,
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="h-8 w-8 text-emerald-600 hover:text-emerald-700"
      title="Publish"
      aria-label="Publish"
      onClick={() => mut.mutate()}
      disabled={mut.isPending}
    >
      {mut.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Send className="h-4 w-4" />
      )}
    </Button>
  );
}

function DeleteButton({
  sessionId,
  assignmentId,
  published,
  onDone,
}: {
  sessionId: string;
  assignmentId: string;
  published?: boolean;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const mut = useMutation({
    mutationFn: () => deleteAssessmentAssignment(sessionId, assignmentId),
    onSuccess: () => {
      onDone();
      toast({ title: "Assignment removed" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="h-8 w-8"
      disabled={mut.isPending}
      title={published ? "Delete assessment" : "Delete draft"}
      aria-label={published ? "Delete assessment" : "Delete draft"}
      onClick={() => {
        const msg = published
          ? "Delete this published test and its papers/marks?"
          : "Delete this draft assignment?";
        if (!confirm(msg)) return;
        mut.mutate();
      }}
    >
      {mut.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin text-destructive" />
      ) : (
        <Trash2 className="h-4 w-4 text-destructive" />
      )}
    </Button>
  );
}

function DeleteClassTestButton({
  test,
  onDone,
}: {
  test: AcademyClassTest;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const mut = useMutation({
    mutationFn: (deleteSeries: boolean) =>
      deleteClassTest(test._id, deleteSeries ? { deleteSeries: true } : undefined),
    onSuccess: () => {
      onDone();
      toast({ title: "Test removed" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="h-8 w-8"
      title="Delete test"
      aria-label="Delete test"
      disabled={mut.isPending}
      onClick={() => {
        const series = Boolean(test.seriesId && test.occurrenceCount && test.occurrenceCount > 1);
        const msg = series ? "Delete entire test series?" : "Delete this test and its marks?";
        if (!confirm(msg)) return;
        mut.mutate(series);
      }}
    >
      {mut.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin text-destructive" />
      ) : (
        <Trash2 className="h-4 w-4 text-destructive" />
      )}
    </Button>
  );
}

function formatPaperDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function TestSubjectsDialog({
  assignment,
  subjectFilter,
  canEnterMarks = false,
  onOpenChange,
  onEnterMarks,
  onEnterExam,
}: {
  assignment: AssessmentAssignment | null;
  subjectFilter?: Set<string>;
  canEnterMarks?: boolean;
  onOpenChange: (open: boolean) => void;
  onEnterMarks: (testId: string) => void;
  onEnterExam: (examId: string, subjectId?: string) => void;
}) {
  const papers = (assignment?.papers || []).filter((p) =>
    subjectFilter && subjectFilter.size ? subjectFilter.has(idOf(p.subjectId)) : true,
  );
  const examId =
    assignment?.category === "exam" && assignment.examId
      ? String(assignment.examId)
      : "";
  return (
    <Dialog open={Boolean(assignment)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {assignment?.name}
            {assignment ? ` — ${classNameOf(assignment)}` : ""}
            {assignment && sectionNameOf(assignment) ? ` · ${sectionNameOf(assignment)}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {assignment
              ? `${ASSESSMENT_TYPE_LABELS[assignment.assessmentType as AssessmentType] || assignment.assessmentType} — subjects in your teaching scope.`
              : ""}
          </p>
          {canEnterMarks && examId ? (
            <Button
              size="sm"
              variant="outline"
              className="h-8 shrink-0"
              onClick={() => onEnterExam(examId)}
            >
              Enter all marks
            </Button>
          ) : null}
        </div>
        {!papers.length ? (
          <p className="text-sm text-muted-foreground py-4">
            No subjects yet. Open syllabus to set the date, marks, and syllabus for each subject.
          </p>
        ) : (
          <div className="border rounded-md overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2.5 font-medium">Subject</th>
                  <th className="text-left p-2.5 font-medium">Date</th>
                  <th className="text-left p-2.5 font-medium">Marks</th>
                  <th className="text-left p-2.5 font-medium">Syllabus</th>
                  <th className="text-right p-2.5 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {papers.map((p) => (
                  <tr key={p._id || paperLabel(p)} className="border-t">
                    <td className="p-2.5 font-medium">{paperLabel(p)}</td>
                    <td className="p-2.5 whitespace-nowrap">{formatPaperDate(p.examDate)}</td>
                    <td className="p-2.5">{p.totalMarks ?? "—"}</td>
                    <td className="p-2.5 text-muted-foreground max-w-[240px]">
                      <SyllabusText text={p.syllabus} className="block whitespace-pre-wrap" />
                    </td>
                    <td className="p-2.5 text-right whitespace-nowrap">
                      {assignment?.category === "exam" && assignment.examId ? (
                        <div className="inline-flex items-center gap-1.5">
                          <MarksReportButton
                            examId={String(assignment.examId)}
                            subjectId={idOf(p.subjectId)}
                            reportView="subject"
                            iconOnly
                            title={`Print ${paperLabel(p)} report`}
                          />
                          <AwardListButton
                            examId={String(assignment.examId)}
                            subjectId={idOf(p.subjectId)}
                          />
                          {canEnterMarks ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-3"
                              onClick={() =>
                                onEnterExam(
                                  String(assignment.examId),
                                  idOf(p.subjectId) || undefined,
                                )
                              }
                            >
                              Enter marks
                            </Button>
                          ) : null}
                        </div>
                      ) : p.classTestId ? (
                        <div className="inline-flex items-center gap-1.5">
                          <MarksReportButton
                            testId={String(p.classTestId)}
                            reportView="subject"
                            iconOnly
                            title={`Print ${paperLabel(p)} report`}
                          />
                          <AwardListButton testId={String(p.classTestId)} />
                          {canEnterMarks ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-3"
                              onClick={() => onEnterMarks(String(p.classTestId))}
                            >
                              Enter marks
                            </Button>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not published</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AssignDialog({
  open,
  onOpenChange,
  sessionId,
  catalogItems,
  branch,
  isTeacher,
  scopeRows,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sessionId: string;
  catalogItems: AssessmentPlanItem[];
  branch: "test" | "exam";
  isTeacher: boolean;
  scopeRows: TeacherTestScopeAssignment[];
  onCreated: (a: AssessmentAssignment) => void;
}) {
  const { toast } = useToast();
  const [planItemId, setPlanItemId] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [disciplineId, setDisciplineId] = useState("");

  useEffect(() => {
    if (open) {
      setPlanItemId("");
      setClassId("");
      setSectionId("");
      setDisciplineId("");
    }
  }, [open, branch]);

  const { data: allClasses = [] } = useQuery({
    queryKey: ["academy-classes", sessionId],
    queryFn: () => fetchAcademyClasses({ sessionId, status: "active" }),
    enabled: open && Boolean(sessionId) && !isTeacher,
  });

  const { data: allSections = [] } = useQuery({
    queryKey: ["academy-sections", classId],
    queryFn: () => fetchSectionsByClass(classId, { status: "active" }),
    enabled: Boolean(classId) && !isTeacher,
  });

  const { data: disciplines = [] } = useQuery({
    queryKey: ["academy-disciplines", classId, "active"],
    queryFn: () => fetchDisciplinesByClass(classId, { status: "active" }),
    enabled: Boolean(classId),
  });

  const classes = isTeacher ? uniqueClassOptions(scopeRows) : (allClasses as AcademyClass[]);
  const sections = isTeacher
    ? sectionOptionsForClass(scopeRows, classId)
    : (allSections as AcademySection[]);
  const hasDisciplines = (disciplines as AcademyDiscipline[]).length > 0;

  const subjectHint = useMemo(() => {
    if (!isTeacher || !classId || !sectionId) return "";
    const names = scopeRows
      .filter((r) => r.classId === classId && r.sectionId === sectionId)
      .map((r) => r.subjectName);
    return names.length ? `Your subjects: ${names.join(", ")}` : "";
  }, [isTeacher, classId, sectionId, scopeRows]);

  const mut = useMutation({
    mutationFn: () =>
      createAssessmentAssignment(sessionId, {
        planItemId,
        classId,
        sectionId: sectionId || undefined,
        disciplineId: disciplineId || undefined,
      }),
    onSuccess: (res) => onCreated(res.assignment),
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const canContinue = Boolean(planItemId && classId && (!isTeacher || sectionId));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create {branch === "test" ? "test" : "exam"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="space-y-1">
            <Label>{branch === "test" ? "Test" : "Exam"} from catalog</Label>
            <Select value={planItemId || "_"} onValueChange={(v) => setPlanItemId(v === "_" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_">Select…</SelectItem>
                {catalogItems.map((i) => (
                  <SelectItem key={i._id} value={i._id}>
                    {i.name} ({ASSESSMENT_TYPE_LABELS[i.assessmentType as AssessmentType] || i.assessmentType})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Class</Label>
            <Select
              value={classId || "_"}
              onValueChange={(v) => {
                setClassId(v === "_" ? "" : v);
                setSectionId("");
                setDisciplineId("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_">Select class</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c._id} value={c._id}>
                    {"className" in c ? c.className : (c as AcademyClass).className}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{isTeacher ? "Section" : "Section (optional)"}</Label>
            <Select
              value={sectionId || "_"}
              onValueChange={(v) => setSectionId(v === "_" ? "" : v)}
              disabled={!classId}
            >
              <SelectTrigger>
                <SelectValue placeholder={isTeacher ? "Select section" : "All sections"} />
              </SelectTrigger>
              <SelectContent>
                {!isTeacher && <SelectItem value="_">All sections</SelectItem>}
                {isTeacher && <SelectItem value="_">Select section</SelectItem>}
                {sections.map((s) => (
                  <SelectItem key={s._id} value={s._id}>
                    {"sectionName" in s ? s.sectionName : (s as AcademySection).sectionName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {hasDisciplines && (
            <div className="space-y-1">
              <Label>Discipline (optional)</Label>
              <Select
                value={disciplineId || "_"}
                onValueChange={(v) => setDisciplineId(v === "_" ? "" : v)}
                disabled={!classId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All disciplines" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_">All disciplines</SelectItem>
                  {(disciplines as AcademyDiscipline[]).map((d) => (
                    <SelectItem key={d._id} value={d._id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Pick a stream for stream subjects (e.g. Biology). Leave as All for shared subjects.
              </p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {isTeacher
              ? `Choose a catalog test and one of your assigned class/sections. ${subjectHint}`
              : `Choose a catalog ${branch === "test" ? "test" : "exam"}. Date, marks, and syllabus come next. The same catalog item can be used for another class.`}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canContinue || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfigureAssignmentDialog({
  open,
  onOpenChange,
  sessionId,
  assignment,
  canManage,
  isTeacher,
  scopeRows,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sessionId: string;
  assignment: AssessmentAssignment | null;
  canManage: boolean;
  isTeacher: boolean;
  scopeRows: TeacherTestScopeAssignment[];
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const published = assignment?.status === "published";
  const classId = idOf(assignment?.classId);
  const [sectionId, setSectionId] = useState("");
  const [disciplineId, setDisciplineId] = useState("");
  const [paperRows, setPaperRows] = useState<
    Record<string, { totalMarks: string; examDate: string; syllabus: string }>
  >({});

  useEffect(() => {
    if (!assignment) return;
    setSectionId(idOf(assignment.sectionId));
    setDisciplineId(idOf(assignment.disciplineId));
    const map: Record<string, { totalMarks: string; examDate: string; syllabus: string }> = {};
    for (const p of assignment.papers || []) {
      map[idOf(p.subjectId)] = {
        totalMarks: p.totalMarks != null ? String(p.totalMarks) : "",
        examDate: paperDate(p),
        syllabus: p.syllabus || "",
      };
    }
    setPaperRows(map);
  }, [assignment]);

  const { data: allSections = [] } = useQuery({
    queryKey: ["academy-sections", classId],
    queryFn: () => fetchSectionsByClass(classId, { status: "active" }),
    enabled: Boolean(classId) && !isTeacher,
  });

  const { data: disciplines = [] } = useQuery({
    queryKey: ["academy-disciplines", classId, "active"],
    queryFn: () => fetchDisciplinesByClass(classId, { status: "active" }),
    enabled: Boolean(classId),
  });

  const { data: allSubjects = [] } = useQuery({
    queryKey: ["academy-subjects", classId, sectionId || "", disciplineId || ""],
    queryFn: () =>
      fetchSubjectsByClass(classId, {
        status: "active",
        sectionId: sectionId || undefined,
        disciplineId: disciplineId || undefined,
      }),
    enabled: Boolean(classId),
  });

  const sections = isTeacher
    ? sectionOptionsForClass(scopeRows, classId)
    : (allSections as AcademySection[]);
  const hasDisciplines = (disciplines as AcademyDiscipline[]).length > 0;

  const allowedSubjectIds = useMemo(() => {
    if (!isTeacher) return null;
    return subjectIdsForScope(scopeRows, classId, sectionId || undefined);
  }, [isTeacher, scopeRows, classId, sectionId]);

  const subjects = useMemo(() => {
    const list = allSubjects as AcademySubject[];
    if (!allowedSubjectIds) return list;
    return list.filter((s) => allowedSubjectIds.has(s._id));
  }, [allSubjects, allowedSubjectIds]);

  useEffect(() => {
    if (!subjects.length) return;
    setPaperRows((prev) => {
      const next = { ...prev };
      for (const s of subjects) {
        if (!next[s._id]) next[s._id] = { totalMarks: "", examDate: "", syllabus: "" };
      }
      return next;
    });
  }, [subjects]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!assignment) return;
      if (!published) {
        const sectionChanged = sectionId !== idOf(assignment.sectionId);
        const disciplineChanged = disciplineId !== idOf(assignment.disciplineId);
        if (sectionChanged || disciplineChanged) {
          if (isTeacher && !sectionId) throw new Error("Section is required");
          await updateAssessmentAssignment(sessionId, assignment._id, {
            ...(sectionChanged ? { sectionId: sectionId || null } : {}),
            ...(disciplineChanged && !isTeacher
              ? { disciplineId: disciplineId || null }
              : {}),
          });
        }
      }
      const papers = subjects.map((s) => {
        const row = paperRows[s._id] || { totalMarks: "", examDate: "", syllabus: "" };
        return {
          subjectId: s._id,
          totalMarks: row.totalMarks,
          examDate: row.examDate,
          syllabus: row.syllabus,
        };
      });
      return upsertAssessmentAssignmentPapers(sessionId, assignment._id, papers);
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Syllabus, marks, and dates updated." });
      onSaved();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (!assignment) return null;

  const canEditPapers = canManage;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {assignment.name} — {classNameOf(assignment)}
            {published ? (
              <span className="block text-sm font-normal text-muted-foreground mt-1">
                Fill missed subjects or update dates and syllabus, then save.
              </span>
            ) : null}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Section</Label>
              <Select
                value={sectionId || "_"}
                onValueChange={(v) => setSectionId(v === "_" ? "" : v)}
                disabled={published || !canManage || isTeacher}
              >
                <SelectTrigger>
                  <SelectValue placeholder={isTeacher ? "Section" : "All sections"} />
                </SelectTrigger>
                <SelectContent>
                  {!isTeacher && <SelectItem value="_">All sections</SelectItem>}
                  {sections.map((s) => (
                    <SelectItem key={s._id} value={s._id}>
                      {"sectionName" in s ? s.sectionName : (s as AcademySection).sectionName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {hasDisciplines && (
              <div className="space-y-1">
                <Label>Discipline</Label>
                <Select
                  value={disciplineId || "_"}
                  onValueChange={(v) => setDisciplineId(v === "_" ? "" : v)}
                  disabled={published || !canManage || isTeacher}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All disciplines" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_">All disciplines</SelectItem>
                    {(disciplines as AcademyDiscipline[]).map((d) => (
                      <SelectItem key={d._id} value={d._id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {!subjects.length ? (
            <p className="text-sm text-muted-foreground">
              {isTeacher
                ? "No subjects assigned to you for this class/section."
                : disciplineId
                  ? "No subjects for this section/discipline combination."
                  : "No subjects on this class yet."}
            </p>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-left">
                    <th className="p-2 font-medium">Subject</th>
                    <th className="p-2 font-medium w-28">Total marks</th>
                    <th className="p-2 font-medium w-36">Test date</th>
                    <th className="p-2 font-medium">Syllabus</th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((s) => {
                    const row = paperRows[s._id] || { totalMarks: "", examDate: "", syllabus: "" };
                    return (
                      <tr key={s._id} className="border-t">
                        <td className="p-2 font-medium whitespace-nowrap">{s.subjectName}</td>
                        <td className="p-2">
                          <Input
                            type="number"
                            min={1}
                            className="h-8"
                            value={row.totalMarks}
                            disabled={!canEditPapers}
                            onChange={(e) =>
                              setPaperRows((prev) => ({
                                ...prev,
                                [s._id]: { ...row, totalMarks: e.target.value },
                              }))
                            }
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="date"
                            className="h-8"
                            value={row.examDate}
                            disabled={!canEditPapers}
                            onChange={(e) =>
                              setPaperRows((prev) => ({
                                ...prev,
                                [s._id]: { ...row, examDate: e.target.value },
                              }))
                            }
                          />
                        </td>
                        <td className="p-2">
                          <Textarea
                            className={cn(
                              "min-h-[2.5rem] text-sm",
                              containsUrduScript(row.syllabus) && "font-urdu text-right"
                            )}
                            dir={containsUrduScript(row.syllabus) ? "rtl" : "auto"}
                            lang={containsUrduScript(row.syllabus) ? "ur" : undefined}
                            rows={1}
                            value={row.syllabus}
                            disabled={!canEditPapers}
                            placeholder="Syllabus / chapters"
                            onChange={(e) =>
                              setPaperRows((prev) => ({
                                ...prev,
                                [s._id]: { ...row, syllabus: e.target.value },
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
          <p className="text-xs text-muted-foreground">
            {isTeacher
              ? "Only your assigned subjects are shown. Leave blank to skip. Filled rows need both marks and date."
              : published
                ? "Add missed subjects anytime. Filled rows need both marks and date. Saving creates live tests for new subjects."
                : "Leave a subject blank to skip. Filled rows need both marks and date."}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {canEditPapers && (
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              {saveMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {published ? "Save changes" : "Save syllabus"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
