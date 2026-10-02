import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { ModuleActionCaps } from "@/lib/permissions";
import { studentManagementHref } from "@/lib/studentManagementMenus";
import {
  createAcademySubject,
  createBulkChoiceSubjects,
  createStandardSubjects,
  deleteAcademySubject,
  fetchAcademyClasses,
  fetchSubjectChoiceGroups,
  fetchSubjectsByClass,
  updateAcademySubject,
  type AcademySubject,
} from "@/lib/studentManagementApi";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import { matchesPanelSearch } from "@/lib/panelSearch";
import {
  generateSubjectCode,
  subjectCodePlaceholder,
} from "@/components/modules/student-management/subjectCodeUtils";
import {
  emptyGroupSubjectRow,
  groupSubjectRowsValid,
  parseGroupSubjectCount,
  resizeGroupSubjectRows,
  resizeSiblingSubjectRows,
  siblingSubjectRowsValid,
  type GroupSubjectRow,
} from "@/components/modules/student-management/groupSubjectFormUtils";
import {
  buildEnrollmentPayload,
  choiceGroupValid,
  defaultSubjectEnrollmentForm,
  enrollmentFromSubject,
  GroupSubjectRowsEditor,
  isBulkGroupCreate,
  isEditNewChoiceGroup,
  SubjectEnrollmentConfig,
  type SubjectEnrollmentForm,
} from "@/components/modules/student-management/SubjectEnrollmentFields";
import { useSessionScope } from "@/components/modules/timetable/SessionBar";
import { sessionLabelFromAcademyClass } from "./studentDisplayUtils";

export default function SubjectsTab({ caps, sessionId }: { caps: ModuleActionCaps; sessionId: string }) {
  const { toast } = useToast();
  const { user: session } = useAuth();
  const qc = useQueryClient();
  const [classId, setClassId] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<AcademySubject | null>(null);
  const [form, setForm] = useState({ subjectName: "", subjectCode: "", status: "active" as "active" | "inactive" });
  const [enrollmentForm, setEnrollmentForm] = useState<SubjectEnrollmentForm>(defaultSubjectEnrollmentForm);
  const [groupSubjectRows, setGroupSubjectRows] = useState<GroupSubjectRow[]>([
    emptyGroupSubjectRow(),
    emptyGroupSubjectRow(),
  ]);
  const [siblingSubjectRows, setSiblingSubjectRows] = useState<GroupSubjectRow[]>([emptyGroupSubjectRow()]);
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);
  const [search, setSearch] = useState("");
  const { apiSessionId, writable, hasScope, isAll } = useSessionScope(sessionId);

  const { data: classes = [], isLoading: classesLoading } = useQuery({
    queryKey: ["academy-classes", sessionId],
    queryFn: () => fetchAcademyClasses({ sessionId: apiSessionId }),
    enabled: hasScope,
  });

  const selectedClass = classes.find((c) => c._id === classId);

  useEffect(() => {
    setClassId("");
  }, [sessionId]);

  const { data: subjects = [], isLoading: subjectsLoading } = useQuery({
    queryKey: ["academy-subjects", classId],
    queryFn: () => fetchSubjectsByClass(classId),
    enabled: Boolean(classId),
  });

  const { data: choiceGroups = [] } = useQuery({
    queryKey: ["choice-groups", classId],
    queryFn: () => fetchSubjectChoiceGroups(classId),
    enabled: Boolean(classId),
  });

  const bulkGroupCreate = isBulkGroupCreate(enrollmentForm, Boolean(edit));
  const editNewChoiceGroup = isEditNewChoiceGroup(enrollmentForm, Boolean(edit));

  useEffect(() => {
    if (!bulkGroupCreate) return;
    const count = parseGroupSubjectCount(enrollmentForm.groupSubjectCount);
    setGroupSubjectRows((prev) => resizeGroupSubjectRows(count, prev));
  }, [bulkGroupCreate, enrollmentForm.groupSubjectCount]);

  useEffect(() => {
    if (!editNewChoiceGroup) return;
    const count = parseGroupSubjectCount(enrollmentForm.groupSubjectCount);
    setSiblingSubjectRows((prev) => resizeSiblingSubjectRows(count, prev));
  }, [editNewChoiceGroup, enrollmentForm.groupSubjectCount]);

  const subjectsFiltered = useMemo(() => {
    if (!search.trim()) return subjects;
    return subjects.filter((s) =>
      matchesPanelSearch(
        search,
        s.subjectName,
        s.subjectCode,
        s.status,
        s.enrollmentType === "choice" ? s.choiceGroupName : "standard",
      ),
    );
  }, [subjects, search]);

  const resetDialog = () => {
    setForm({ subjectName: "", subjectCode: "", status: "active" });
    setEnrollmentForm(defaultSubjectEnrollmentForm());
    setGroupSubjectRows([emptyGroupSubjectRow(), emptyGroupSubjectRow()]);
    setSiblingSubjectRows([emptyGroupSubjectRow()]);
    setCodeManuallyEdited(false);
  };

  const openCreate = () => {
    if (!classId) {
      toast({ title: "Select a class first", description: "Choose a class before adding a subject.", variant: "destructive" });
      return;
    }
    setEdit(null);
    resetDialog();
    setOpen(true);
  };

  const openEditSubject = (s: AcademySubject) => {
    setEdit(s);
    setCodeManuallyEdited(true);
    setForm({ subjectName: s.subjectName, subjectCode: s.subjectCode, status: s.status });
    setEnrollmentForm(enrollmentFromSubject(s, choiceGroups));
    setSiblingSubjectRows([emptyGroupSubjectRow()]);
    setOpen(true);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (bulkGroupCreate) {
        return createBulkChoiceSubjects(classId, {
          groupName: enrollmentForm.choiceGroupName.trim(),
          subjects: groupSubjectRows.map((r) => ({
            subjectName: r.subjectName.trim(),
            subjectCode: r.subjectCode.trim().toUpperCase(),
          })),
          pickCount: Math.max(1, Number(enrollmentForm.pickCount) || 1),
        });
      }
      const enrollment = buildEnrollmentPayload(enrollmentForm);
      const body = { ...form, ...enrollment };
      if (edit) {
        const updated = await updateAcademySubject(edit._id, body);
        if (editNewChoiceGroup) {
          for (const row of siblingSubjectRows) {
            await createAcademySubject({
              classId,
              subjectName: row.subjectName.trim(),
              subjectCode: row.subjectCode.trim().toUpperCase(),
              status: form.status,
              ...enrollment,
            });
          }
        }
        return updated;
      }
      return createAcademySubject({ ...body, classId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academy-subjects", classId] });
      qc.invalidateQueries({ queryKey: ["choice-groups", classId] });
      qc.invalidateQueries({ queryKey: ["enrollment-subjects"] });
      qc.invalidateQueries({ queryKey: ["academy-classes"] });
      setOpen(false);
      toast({
        title: bulkGroupCreate
          ? "Choice group created"
          : editNewChoiceGroup
            ? "Choice group saved"
            : edit
              ? "Subject updated"
              : "Subject added",
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const defaultsMut = useMutation({
    mutationFn: () => {
      if (!classId) throw new Error("Select a class first");
      if (!writable) throw new Error("Switch to the active academic session to make changes.");
      return createStandardSubjects(classId);
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["academy-subjects", classId] });
      qc.invalidateQueries({ queryKey: ["choice-groups", classId] });
      qc.invalidateQueries({ queryKey: ["enrollment-subjects"] });
      qc.invalidateQueries({ queryKey: ["academy-classes"] });
      toast({
        title: "Subjects initialized",
        description:
          data.created > 0
            ? `Added ${data.created} subject${data.created === 1 ? "" : "s"}${
                data.skipped ? ` · ${data.skipped} already present` : ""
              }.`
            : data.skipped
              ? `All ${data.skipped} standard subjects already exist.`
              : "No subjects were added.",
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteAcademySubject(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academy-subjects", classId] });
      qc.invalidateQueries({ queryKey: ["choice-groups", classId] });
      qc.invalidateQueries({ queryKey: ["academy-classes"] });
      toast({ title: "Subject deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const classesHref = session?.role ? studentManagementHref(session.role, "classes") : "#";
  const hasActions = writable && (caps.canEdit || caps.canDelete);

  const canSave = bulkGroupCreate
    ? choiceGroupValid(enrollmentForm) && groupSubjectRowsValid(groupSubjectRows)
    : editNewChoiceGroup
      ? Boolean(form.subjectName.trim() && form.subjectCode.trim()) &&
        choiceGroupValid(enrollmentForm) &&
        siblingSubjectRowsValid(siblingSubjectRows)
      : form.subjectName.trim() && form.subjectCode.trim() && choiceGroupValid(enrollmentForm);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div className="max-w-sm space-y-1">
        <Label htmlFor="subject-class-select">Select class</Label>
        <select
          id="subject-class-select"
          className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          disabled={classesLoading || !hasScope}
        >
          <option value="">Choose class…</option>
          {classes.map((c) => (
            <option key={c._id} value={c._id}>
              {c.className}
              {isAll && sessionLabelFromAcademyClass(c) ? ` (${sessionLabelFromAcademyClass(c)})` : ""}
            </option>
          ))}
        </select>
      </div>

      <Card className="overflow-hidden">
        {classId && selectedClass && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-b bg-muted/30">
            <p className="text-sm">
              Subjects for <span className="font-semibold">{selectedClass.className}</span>
              {sessionLabelFromAcademyClass(selectedClass) ? (
                <span className="text-muted-foreground"> · {sessionLabelFromAcademyClass(selectedClass)}</span>
              ) : null}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <PanelSearchBar value={search} onChange={setSearch} placeholder="Search subjects…" className="max-w-xs" />
              {caps.canCreate && writable && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2 shrink-0"
                    disabled={!classId || defaultsMut.isPending}
                    onClick={() => defaultsMut.mutate()}
                  >
                    <Sparkles className="h-4 w-4" />
                    {defaultsMut.isPending ? "Initializing…" : "Auto initialize"}
                  </Button>
                  <Button className="gap-2 shrink-0" onClick={openCreate}>
                    <Plus className="h-4 w-4" /> Add Subject
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {!classId ? (
          <div className="min-h-[8rem]" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left p-3">Subject</th>
                  <th className="text-left p-3">Code</th>
                  <th className="text-left p-3">Enrollment</th>
                  <th className="text-left p-3">Status</th>
                  {hasActions && <th className="text-right p-3">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {subjectsLoading && (
                  <tr><td colSpan={hasActions ? 5 : 4} className="p-8 text-center text-muted-foreground">Loading…</td></tr>
                )}
                {!subjectsLoading && subjects.length === 0 && (
                  <tr>
                    <td colSpan={hasActions ? 5 : 4} className="p-8 text-center text-muted-foreground">
                      No subjects for this class yet.
                      {caps.canCreate && writable ? (
                        <>
                          {" "}
                          Use <span className="font-medium text-foreground">Auto initialize</span> for the
                          standard list, or add subjects one by one.
                        </>
                      ) : null}
                    </td>
                  </tr>
                )}
                {subjectsFiltered.length === 0 && !subjectsLoading && subjects.length > 0 && (
                  <tr>
                    <td colSpan={hasActions ? 5 : 4} className="p-8 text-center text-muted-foreground">
                      No subjects match your search.
                    </td>
                  </tr>
                )}
                {subjectsFiltered.map((s) => {
                  const isChoice = s.enrollmentType === "choice" && s.choiceGroupName;
                  return (
                    <tr key={s._id} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-medium">{s.subjectName}</td>
                      <td className="p-3">{s.subjectCode}</td>
                      <td className="p-3 text-muted-foreground">
                        {isChoice ? (
                          <span>
                            Choice: {s.choiceGroupName}
                            {s.pickCount && s.pickCount > 1 ? ` (pick ${s.pickCount})` : ""}
                          </span>
                        ) : (
                          <span>Standard</span>
                        )}
                      </td>
                      <td className="p-3">{s.status}</td>
                      {hasActions && (
                        <td className="p-3 text-right">
                          {caps.canEdit && (
                            <Button variant="ghost" size="icon" onClick={() => openEditSubject(s)} aria-label="Edit subject">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {caps.canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => { if (confirm("Delete subject?")) delMut.mutate(s._id); }}
                              aria-label="Delete subject"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{edit ? "Edit Subject" : bulkGroupCreate ? "New choice group" : "New Subject"}</DialogTitle>
            {selectedClass && (
              <p className="text-sm text-muted-foreground">
                Class: <span className="font-medium text-foreground">{selectedClass.className}</span>
              </p>
            )}
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!edit && (
              <SubjectEnrollmentConfig
                value={enrollmentForm}
                onChange={setEnrollmentForm}
                choiceGroups={choiceGroups}
                isEdit={Boolean(edit)}
              />
            )}

            {bulkGroupCreate && selectedClass && (
              <GroupSubjectRowsEditor
                rows={groupSubjectRows}
                onChange={setGroupSubjectRows}
                className={selectedClass.className}
              />
            )}

            {!bulkGroupCreate && (
              <>
                {edit && (
                  <SubjectEnrollmentConfig
                    value={enrollmentForm}
                    onChange={setEnrollmentForm}
                    choiceGroups={choiceGroups}
                    currentSubjectId={edit._id}
                    isEdit
                  />
                )}
                <div>
                  <Label htmlFor="subject-name">
                    {editNewChoiceGroup ? "Subject 1 — name" : "Subject name"}
                  </Label>
                  <Input
                    id="subject-name"
                    value={form.subjectName}
                    onChange={(e) => {
                      const subjectName = e.target.value;
                      setForm((f) => {
                        const next = { ...f, subjectName };
                        if (!edit && !codeManuallyEdited && selectedClass) {
                          next.subjectCode = generateSubjectCode(subjectName, selectedClass.className);
                        }
                        return next;
                      });
                    }}
                    placeholder="e.g. Mathematics"
                  />
                </div>
                <div>
                  <Label htmlFor="subject-code">
                    {editNewChoiceGroup ? "Subject 1 — code" : "Subject code"}
                  </Label>
                  <Input
                    id="subject-code"
                    value={form.subjectCode}
                    onChange={(e) => {
                      setCodeManuallyEdited(true);
                      setForm((f) => ({ ...f, subjectCode: e.target.value.toUpperCase() }));
                    }}
                    placeholder={selectedClass ? subjectCodePlaceholder(selectedClass.className) : "e.g. MATH-09"}
                  />
                </div>
                {editNewChoiceGroup && selectedClass && (
                  <GroupSubjectRowsEditor
                    rows={siblingSubjectRows}
                    onChange={setSiblingSubjectRows}
                    className={selectedClass.className}
                    startIndex={2}
                    title="Other subjects in this group"
                  />
                )}
                <div>
                  <Label htmlFor="subject-status">Status</Label>
                  <select
                    id="subject-status"
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={form.status}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, status: e.target.value as "active" | "inactive" }))
                    }
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={saveMut.isPending || !canSave} onClick={() => saveMut.mutate()}>
              {saveMut.isPending
                ? "Saving…"
                : bulkGroupCreate
                  ? "Create group"
                  : edit
                    ? "Save changes"
                    : "Add subject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
