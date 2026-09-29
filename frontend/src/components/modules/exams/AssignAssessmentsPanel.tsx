import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Loader2,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import type { ModuleActionCaps } from "@/lib/permissions";
import { ASSESSMENT_TYPE_LABELS, type AssessmentType } from "@/lib/assessmentTaxonomy";
import { systemConfigHref } from "@/lib/systemConfigMenus";
import { useAuth } from "@/hooks/useAuth";
import {
  createAssessmentAssignment,
  deleteAssessmentAssignment,
  fetchAssessmentAssignments,
  fetchAssessmentPlan,
  fetchSessions,
  publishAssessmentAssignment,
  updateAssessmentAssignment,
  upsertAssessmentAssignmentPapers,
  type AssessmentAssignment,
  type AssessmentPlanItem,
  type AssessmentPlanPaper,
} from "@/lib/configApi";
import {
  fetchAcademyClasses,
  fetchSectionsByClass,
  fetchSubjectsByClass,
  type AcademyClass,
  type AcademySection,
  type AcademySubject,
} from "@/lib/studentManagementApi";
import PanelToolbar from "@/components/modules/PanelToolbar";
import { matchesPanelSearch } from "@/lib/panelSearch";

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

function paperDate(p: AssessmentPlanPaper) {
  if (!p.examDate) return "";
  try {
    return new Date(p.examDate).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function isReady(a: AssessmentAssignment) {
  return (a.papers || []).some((p) => p.totalMarks && p.examDate);
}

/**
 * Assessments → Assign
 * Pick a catalog test/exam and assign it to any number of classes/sections
 * with subject marks, dates, and syllabus.
 */
export default function AssignAssessmentsPanel({ caps }: { caps: ModuleActionCaps }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const role = user?.role ?? "admin";
  const canManage = caps.canCreate || caps.canEdit;

  const { data: sessions = [] } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: () => fetchSessions(),
  });
  const activeId = useMemo(() => sessions.find((s) => s.isActive)?._id || sessions[0]?._id || "", [sessions]);
  const [sessionId, setSessionId] = useState("");
  const effectiveSessionId = sessionId || activeId;

  const [branch, setBranch] = useState<"test" | "exam">("test");
  const [search, setSearch] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [configAssignment, setConfigAssignment] = useState<AssessmentAssignment | null>(null);

  const { data: planData } = useQuery({
    queryKey: ["assessment-plan", effectiveSessionId],
    queryFn: () => fetchAssessmentPlan(effectiveSessionId),
    enabled: Boolean(effectiveSessionId),
  });

  const { data: assignData, isLoading } = useQuery({
    queryKey: ["assessment-assignments", effectiveSessionId, branch],
    queryFn: () => fetchAssessmentAssignments(effectiveSessionId, { category: branch }),
    enabled: Boolean(effectiveSessionId),
  });

  const catalogItems = (planData?.plan.items || []).filter((i) => i.category === branch);
  const assignments = assignData?.assignments || [];

  const filtered = useMemo(() => {
    return assignments.filter((a) =>
      matchesPanelSearch(search, [
        a.name,
        classNameOf(a),
        sectionNameOf(a),
        ASSESSMENT_TYPE_LABELS[a.assessmentType as AssessmentType],
      ]),
    );
  }, [assignments, search]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["assessment-assignments", effectiveSessionId] });
    qc.invalidateQueries({ queryKey: ["assessment-plan", effectiveSessionId] });
    qc.invalidateQueries({ queryKey: ["class-tests"] });
    qc.invalidateQueries({ queryKey: ["exams"] });
  };

  if (!effectiveSessionId) {
    return (
      <p className="text-sm text-muted-foreground py-8">No academic session found.</p>
    );
  }

  const catalogReady = planData?.plan.status === "ready";

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-primary">Assign tests &amp; exams</h2>
        <p className="text-sm text-muted-foreground">
          Assign the same catalog test (e.g. TEST NO.1) to multiple classes/sections. Set marks,
          date, and syllabus per subject, then publish.
        </p>
      </div>

      {!catalogReady && (
        <Card className="p-5 space-y-3 border-dashed">
          <p className="text-sm text-muted-foreground">
            No assessment catalog for this session yet. Create tests &amp; exams in System Config
            first.
          </p>
          <Button variant="outline" asChild>
            <Link to={systemConfigHref(role, "assessments")}>Open Assessment Plan</Link>
          </Button>
        </Card>
      )}

      {catalogReady && (
        <>
          <PanelToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Search test, class…">
            <Select
              value={effectiveSessionId}
              onValueChange={setSessionId}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Session" />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s._id} value={s._id}>
                    {s.name}
                    {s.isActive ? " (active)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canManage && (
              <Button variant="hero" onClick={() => setAssignOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Assign to class
              </Button>
            )}
          </PanelToolbar>

          <Tabs value={branch} onValueChange={(v) => setBranch(v as "test" | "exam")}>
            <TabsList>
              <TabsTrigger value="test">Tests</TabsTrigger>
              <TabsTrigger value="exam">Exams</TabsTrigger>
            </TabsList>
            <TabsContent value={branch} className="mt-4">
              <Card className="overflow-hidden">
                {isLoading && <p className="p-6 text-sm text-muted-foreground">Loading…</p>}
                {!isLoading && filtered.length === 0 && (
                  <p className="p-8 text-center text-sm text-muted-foreground">
                    No {branch === "test" ? "test" : "exam"} assignments yet. Assign a catalog item
                    to a class — the same test can be used for many classes.
                  </p>
                )}
                <ul className="divide-y">
                  {filtered.map((a) => (
                    <li
                      key={a._id}
                      className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3"
                    >
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-sm">{a.name}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {ASSESSMENT_TYPE_LABELS[a.assessmentType as AssessmentType] ||
                              a.assessmentType}
                          </Badge>
                          <Badge
                            variant={a.status === "published" ? "default" : "secondary"}
                            className="text-[10px]"
                          >
                            {a.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {classNameOf(a)}
                          {sectionNameOf(a) ? ` · Sec ${sectionNameOf(a)}` : ""}
                          {a.papers?.length ? ` · ${a.papers.length} subject(s)` : " · syllabus not set"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConfigAssignment(a)}
                        >
                          <BookOpen className="h-3.5 w-3.5 mr-1" />
                          {a.status === "published" ? "View" : "Syllabus & marks"}
                        </Button>
                        {canManage && a.status === "draft" && isReady(a) && (
                          <PublishButton
                            sessionId={effectiveSessionId}
                            assignmentId={a._id}
                            onDone={invalidate}
                          />
                        )}
                        {canManage && a.status === "draft" && (
                          <DeleteButton
                            sessionId={effectiveSessionId}
                            assignmentId={a._id}
                            onDone={invalidate}
                          />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      <AssignDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        sessionId={effectiveSessionId}
        catalogItems={catalogItems}
        branch={branch}
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
    <Button size="sm" onClick={() => mut.mutate()} disabled={mut.isPending}>
      {mut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
      Publish
    </Button>
  );
}

function DeleteButton({
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
    mutationFn: () => deleteAssessmentAssignment(sessionId, assignmentId),
    onSuccess: () => {
      onDone();
      toast({ title: "Assignment removed" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  return (
    <Button size="sm" variant="ghost" onClick={() => mut.mutate()} disabled={mut.isPending}>
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}

function AssignDialog({
  open,
  onOpenChange,
  sessionId,
  catalogItems,
  branch,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sessionId: string;
  catalogItems: AssessmentPlanItem[];
  branch: "test" | "exam";
  onCreated: (a: AssessmentAssignment) => void;
}) {
  const { toast } = useToast();
  const [planItemId, setPlanItemId] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");

  useEffect(() => {
    if (open) {
      setPlanItemId("");
      setClassId("");
      setSectionId("");
    }
  }, [open, branch]);

  const { data: classes = [] } = useQuery({
    queryKey: ["academy-classes", sessionId],
    queryFn: () => fetchAcademyClasses({ sessionId, status: "active" }),
    enabled: open && Boolean(sessionId),
  });

  const { data: sections = [] } = useQuery({
    queryKey: ["academy-sections", classId],
    queryFn: () => fetchSectionsByClass(classId, { status: "active" }),
    enabled: Boolean(classId),
  });

  const mut = useMutation({
    mutationFn: () =>
      createAssessmentAssignment(sessionId, {
        planItemId,
        classId,
        sectionId: sectionId || undefined,
      }),
    onSuccess: (res) => onCreated(res.assignment),
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign {branch === "test" ? "test" : "exam"} to class</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="space-y-1">
            <Label>Catalog {branch === "test" ? "test" : "exam"}</Label>
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
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_">Select class</SelectItem>
                {(classes as AcademyClass[]).map((c) => (
                  <SelectItem key={c._id} value={c._id}>
                    {c.className}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Section (optional)</Label>
            <Select
              value={sectionId || "_"}
              onValueChange={(v) => setSectionId(v === "_" ? "" : v)}
              disabled={!classId}
            >
              <SelectTrigger>
                <SelectValue placeholder="All sections" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_">All sections</SelectItem>
                {(sections as AcademySection[]).map((s) => (
                  <SelectItem key={s._id} value={s._id}>
                    {s.sectionName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            You can assign the same test to another class again after this.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!planItemId || !classId || mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Assign
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
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sessionId: string;
  assignment: AssessmentAssignment | null;
  canManage: boolean;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const published = assignment?.status === "published";
  const classId = idOf(assignment?.classId);
  const [sectionId, setSectionId] = useState("");
  const [paperRows, setPaperRows] = useState<
    Record<string, { totalMarks: string; examDate: string; syllabus: string }>
  >({});

  useEffect(() => {
    if (!assignment) return;
    setSectionId(idOf(assignment.sectionId));
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

  const { data: sections = [] } = useQuery({
    queryKey: ["academy-sections", classId],
    queryFn: () => fetchSectionsByClass(classId, { status: "active" }),
    enabled: Boolean(classId),
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ["academy-subjects", classId],
    queryFn: () => fetchSubjectsByClass(classId),
    enabled: Boolean(classId),
  });

  useEffect(() => {
    if (!subjects.length) return;
    setPaperRows((prev) => {
      const next = { ...prev };
      for (const s of subjects as AcademySubject[]) {
        if (!next[s._id]) next[s._id] = { totalMarks: "", examDate: "", syllabus: "" };
      }
      return next;
    });
  }, [subjects]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!assignment) return;
      if (!published && sectionId !== idOf(assignment.sectionId)) {
        await updateAssessmentAssignment(sessionId, assignment._id, {
          sectionId: sectionId || null,
        });
      }
      const papers = (subjects as AcademySubject[]).map((s) => {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {assignment.name} — {classNameOf(assignment)}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-1 max-w-xs">
            <Label>Section</Label>
            <Select
              value={sectionId || "_"}
              onValueChange={(v) => setSectionId(v === "_" ? "" : v)}
              disabled={published || !canManage}
            >
              <SelectTrigger>
                <SelectValue placeholder="All sections" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_">All sections</SelectItem>
                {(sections as AcademySection[]).map((s) => (
                  <SelectItem key={s._id} value={s._id}>
                    {s.sectionName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!(subjects as AcademySubject[]).length ? (
            <p className="text-sm text-muted-foreground">No subjects on this class yet.</p>
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
                  {(subjects as AcademySubject[]).map((s) => {
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
                            disabled={published || !canManage}
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
                            disabled={published || !canManage}
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
                            className="min-h-[2.5rem] text-sm"
                            rows={1}
                            value={row.syllabus}
                            disabled={published || !canManage}
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
            Leave a subject blank to skip. Filled rows need both marks and date.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {!published && canManage && (
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              {saveMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save syllabus
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
