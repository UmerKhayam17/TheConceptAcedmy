import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Link2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ModuleActionCaps } from "@/lib/permissions";
import { subjectTheme } from "@/lib/subjectTheme";
import { cn } from "@/lib/utils";
import {
  applySubjectSalaryWeights,
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
import ClassProgramSelect from "@/components/modules/ClassProgramSelect";
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

const PAGE_SIZE = 10;

function ShareBar({ percent, color }: { percent: number; color: string }) {
  const w = Math.min(100, Math.max(0, percent));
  if (!(w > 0)) {
    return <span className="text-sm text-slate-400">—</span>;
  }
  return (
    <div className="min-w-[5.5rem]">
      <div className="text-sm font-semibold text-slate-700 tabular-nums">{w}%</div>
      <div className="mt-1.5 h-1.5 w-full max-w-[5.5rem] rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-[width]"
          style={{ width: `${w}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const active = status === "active";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        active ? "bg-emerald-50 text-emerald-700" : "bg-violet-50 text-violet-700",
      )}
    >
      <span
        className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-emerald-500" : "bg-violet-500")}
      />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

export default function SubjectsTab({ caps, sessionId }: { caps: ModuleActionCaps; sessionId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [classId, setClassId] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive">("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<AcademySubject | null>(null);
  const [form, setForm] = useState({
    subjectName: "",
    subjectCode: "",
    status: "active" as "active" | "inactive",
    tuitionSharePercent: "",
  });
  const [enrollmentForm, setEnrollmentForm] = useState<SubjectEnrollmentForm>(defaultSubjectEnrollmentForm);
  const [groupSubjectRows, setGroupSubjectRows] = useState<GroupSubjectRow[]>([
    emptyGroupSubjectRow(),
    emptyGroupSubjectRow(),
  ]);
  const [siblingSubjectRows, setSiblingSubjectRows] = useState<GroupSubjectRow[]>([emptyGroupSubjectRow()]);
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
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

  useEffect(() => {
    setPage(1);
  }, [classId, search, statusFilter]);

  const classIdsKey = classes.map((c) => c._id).join(",");

  const { data: subjects = [], isLoading: subjectsLoading } = useQuery({
    queryKey: ["academy-subjects", classId || "all", sessionId, classIdsKey],
    queryFn: async () => {
      if (classId) return fetchSubjectsByClass(classId);
      if (!classes.length) return [] as AcademySubject[];
      const batches = await Promise.all(classes.map((c) => fetchSubjectsByClass(c._id)));
      return batches.flat();
    },
    enabled: hasScope && (Boolean(classId) || classes.length > 0 || !classesLoading),
  });

  const classNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of classes) map.set(c._id, c.className);
    return map;
  }, [classes]);

  const subjectClassId = (s: AcademySubject) =>
    typeof s.classId === "string" ? s.classId : String((s.classId as { _id?: string })?._id || "");

  const { data: choiceGroups = [] } = useQuery({
    queryKey: ["choice-groups", classId || edit?.classId],
    queryFn: () => fetchSubjectChoiceGroups(classId || subjectClassId(edit!)),
    enabled: Boolean(classId || edit?._id),
  });

  const showClassCol = !classId;

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
    let list = subjects;
    if (statusFilter) {
      list = list.filter((s) => s.status === statusFilter);
    }
    if (!search.trim()) return list;
    return list.filter((s) =>
      matchesPanelSearch(
        search,
        s.subjectName,
        s.subjectCode,
        s.status,
        s.enrollmentType === "choice" ? s.choiceGroupName : "standard",
        classNameById.get(subjectClassId(s)),
      ),
    );
  }, [subjects, search, statusFilter, classNameById]);

  const totalPages = Math.max(1, Math.ceil(subjectsFiltered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageSlice = subjectsFiltered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const showingFrom = subjectsFiltered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(safePage * PAGE_SIZE, subjectsFiltered.length);

  const resetDialog = () => {
    setForm({
      subjectName: "",
      subjectCode: "",
      status: "active",
      tuitionSharePercent: "",
    });
    setEnrollmentForm(defaultSubjectEnrollmentForm());
    setGroupSubjectRows([emptyGroupSubjectRow(), emptyGroupSubjectRow()]);
    setSiblingSubjectRows([emptyGroupSubjectRow()]);
    setCodeManuallyEdited(false);
  };

  const openCreate = () => {
    if (!classId) {
      toast({
        title: "Select a class first",
        description: "Choose a specific class from the filter before adding a subject.",
        variant: "destructive",
      });
      return;
    }
    setEdit(null);
    resetDialog();
    setOpen(true);
  };

  const openEditSubject = (s: AcademySubject) => {
    setEdit(s);
    setCodeManuallyEdited(true);
    setForm({
      subjectName: s.subjectName,
      subjectCode: s.subjectCode,
      status: s.status,
      tuitionSharePercent:
        s.tuitionSharePercent != null && s.tuitionSharePercent !== undefined
          ? String(s.tuitionSharePercent)
          : "",
    });
    setEnrollmentForm(enrollmentFromSubject(s, choiceGroups));
    setSiblingSubjectRows([emptyGroupSubjectRow()]);
    setOpen(true);
  };

  const salaryWeightFields = () => {
    const shareRaw = form.tuitionSharePercent.trim();
    const out: { tuitionSharePercent?: number } = {};
    if (shareRaw !== "") {
      const n = Number(shareRaw);
      if (!Number.isNaN(n)) out.tuitionSharePercent = Math.min(100, Math.max(0, n));
    }
    return out;
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
      const weights = salaryWeightFields();
      const body = {
        subjectName: form.subjectName,
        subjectCode: form.subjectCode,
        status: form.status,
        ...enrollment,
        ...weights,
      };
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
              ...weights,
            });
          }
        }
        return updated;
      }
      return createAcademySubject({ ...body, classId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academy-subjects"] });
      qc.invalidateQueries({ queryKey: ["choice-groups"] });
      qc.invalidateQueries({ queryKey: ["enrollment-subjects"] });
      qc.invalidateQueries({ queryKey: ["academy-classes"] });
      qc.invalidateQueries({ queryKey: ["academy-salaries"] });
      qc.invalidateQueries({ queryKey: ["academy-salaries-summary"] });
      setOpen(false);
      toast({
        title: bulkGroupCreate
          ? "Choice group created"
          : editNewChoiceGroup
            ? "Choice group saved"
            : edit
              ? "Subject updated"
              : "Subject added",
        description: edit
          ? "Unpaid percentage salaries were recalculated if weightage changed."
          : undefined,
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
      qc.invalidateQueries({ queryKey: ["academy-subjects"] });
      qc.invalidateQueries({ queryKey: ["choice-groups"] });
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

  const weightsMut = useMutation({
    mutationFn: () => {
      if (!classId) throw new Error("Select a class first");
      if (!writable) throw new Error("Switch to the active academic session to make changes.");
      return applySubjectSalaryWeights(classId);
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["academy-subjects"] });
      qc.invalidateQueries({ queryKey: ["academy-salaries"] });
      qc.invalidateQueries({ queryKey: ["academy-salaries-summary"] });
      const salaryCount = Number(data.salariesRecalculated || 0);
      toast({
        title: "Subject share applied",
        description: `Updated subject share on ${data.updated} subject${
          data.updated === 1 ? "" : "s"
        }${
          salaryCount > 0
            ? ` · recalculated ${salaryCount} unpaid percentage salary voucher${
                salaryCount === 1 ? "" : "s"
              }`
            : ""
        }.`,
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteAcademySubject(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academy-subjects"] });
      qc.invalidateQueries({ queryKey: ["choice-groups"] });
      qc.invalidateQueries({ queryKey: ["academy-classes"] });
      toast({ title: "Subject deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const hasActions = writable && (caps.canEdit || caps.canDelete);
  const colCount = (showClassCol ? 1 : 0) + (hasActions ? 7 : 6);
  const filterSelectClass =
    "h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-none shrink-0";

  const requireClassForAction = (action: string) => {
    if (classId) return true;
    toast({
      title: "Select a class first",
      description: `Choose a specific class to ${action}.`,
      variant: "destructive",
    });
    return false;
  };

  const canSave = bulkGroupCreate
    ? choiceGroupValid(enrollmentForm) && groupSubjectRowsValid(groupSubjectRows)
    : editNewChoiceGroup
      ? Boolean(form.subjectName.trim() && form.subjectCode.trim()) &&
        choiceGroupValid(enrollmentForm) &&
        siblingSubjectRowsValid(siblingSubjectRows)
      : form.subjectName.trim() && form.subjectCode.trim() && choiceGroupValid(enrollmentForm);

  return (
    <div className="min-h-full bg-slate-50 px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      {/* Top banner — matches Assign Subject Teachers */}
      <div className="flex flex-col gap-4 rounded-xl bg-[#F0F7FF] px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            <BookOpen className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">Subjects</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-500 max-w-2xl">
              Manage and organize all subjects, their codes and details for the academic session.
              Set subject share on each subject for percentage teacher salaries.
            </p>
          </div>
        </div>
        <p className="shrink-0 text-sm italic text-blue-600 sm:max-w-[15rem] sm:pt-1 sm:text-right">
          Education is the key to a better tomorrow.
        </p>
      </div>

      {/* Filter / action bar — matches registration filter row */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <ClassProgramSelect
            id="subject-class-select"
            className="w-[16.5rem] shrink-0 min-w-0"
            label={false}
            value={classId}
            onChange={setClassId}
            classes={classes}
            allowAll
            allLabel="All classes (School + College)"
            disabled={classesLoading || !hasScope}
            selectClassName={filterSelectClass}
            optionSuffix={
              isAll
                ? (c) =>
                    sessionLabelFromAcademyClass(classes.find((x) => x._id === c._id) as never) ||
                    undefined
                : undefined
            }
          />
          <select
            className={cn(filterSelectClass, "w-[10rem]")}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | "active" | "inactive")}
            aria-label="Status filter"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <div className="relative min-w-[14rem] flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="subjects-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search subjects..."
              className="h-10 pl-9 rounded-md border-slate-200 bg-white shadow-none"
            />
          </div>

          {writable && (caps.canCreate || caps.canEdit) ? (
            <div className="flex flex-wrap items-center gap-2 shrink-0 ml-auto">
              {caps.canCreate ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 gap-2 rounded-md border-slate-800 text-slate-800 hover:bg-slate-50"
                  disabled={defaultsMut.isPending}
                  onClick={() => {
                    if (!requireClassForAction("auto-initialize subjects")) return;
                    defaultsMut.mutate();
                  }}
                >
                  <Sparkles className="h-4 w-4" />
                  {defaultsMut.isPending ? "Initializing…" : "Auto initialize"}
                </Button>
              ) : null}
              {caps.canEdit && subjects.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 gap-2 rounded-md border-slate-800 text-slate-800 hover:bg-slate-50"
                  disabled={weightsMut.isPending}
                  onClick={() => {
                    if (!requireClassForAction("apply subject share")) return;
                    if (
                      confirm(
                        "Apply default subject share to all subjects in this class?\n\n9th–10th: languages 10%, sciences 15%\n11th–12th: languages 13.333%, sciences 20%\n\nTeacher % is set on each staff profile, not on subjects.",
                      )
                    ) {
                      weightsMut.mutate();
                    }
                  }}
                >
                  <Link2 className="h-4 w-4" />
                  {weightsMut.isPending ? "Applying…" : "Apply subject share"}
                </Button>
              ) : null}
              {caps.canCreate ? (
                <Button
                  className="h-10 gap-2 rounded-md bg-slate-900 text-white hover:bg-slate-800"
                  onClick={openCreate}
                >
                  <Plus className="h-4 w-4" /> Add Subject
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-[#F8FBFE]">
                      <th className="text-left px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[#1A3A5C]">
                        {"#"}
                      </th>
                      <th className="text-left px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[#1A3A5C]">
                        Subject
                      </th>
                      {showClassCol ? (
                        <th className="text-left px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[#1A3A5C]">
                          Class
                        </th>
                      ) : null}
                      <th className="text-left px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[#1A3A5C]">
                        Code
                      </th>
                      <th className="text-left px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[#1A3A5C]">
                        Enrollment
                      </th>
                      <th className="text-left px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[#1A3A5C] whitespace-nowrap">
                        Subject share
                      </th>
                      <th className="text-left px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[#1A3A5C]">
                        Status
                      </th>
                      {hasActions && (
                        <th className="text-right px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-[#1A3A5C]">
                          Actions
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {subjectsLoading && (
                      <tr>
                        <td colSpan={colCount} className="px-4 py-12 text-center text-slate-400">
                          Loading…
                        </td>
                      </tr>
                    )}
                    {!subjectsLoading && subjects.length === 0 && (
                      <tr>
                        <td colSpan={colCount} className="px-4 py-12 text-center text-slate-400">
                          No subjects yet.
                          {caps.canCreate && writable ? (
                            <>
                              {" "}
                              Select a class, then use{" "}
                              <span className="font-medium text-slate-600">Auto initialize</span> or
                              add subjects one by one.
                            </>
                          ) : null}
                        </td>
                      </tr>
                    )}
                    {!subjectsLoading && subjects.length > 0 && subjectsFiltered.length === 0 && (
                      <tr>
                        <td colSpan={colCount} className="px-4 py-12 text-center text-slate-400">
                          No subjects match your filters.
                        </td>
                      </tr>
                    )}
                    {pageSlice.map((s, i) => {
                      const isChoice = s.enrollmentType === "choice" && s.choiceGroupName;
                      const theme = subjectTheme(s._id, s.subjectName);
                      const Icon = theme.Icon;
                      const share = Number(s.tuitionSharePercent) || 0;
                      const rowNum = (safePage - 1) * PAGE_SIZE + i + 1;
                      return (
                        <tr
                          key={s._id}
                          className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors"
                        >
                          <td className="px-4 py-3.5 text-slate-400 tabular-nums">{rowNum}</td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={cn(
                                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                                  theme.iconBox,
                                  theme.icon,
                                )}
                              >
                                <Icon className="h-[18px] w-[18px]" />
                              </span>
                              <span className="font-semibold text-[#1A3A5C] truncate">
                                {s.subjectName}
                              </span>
                            </div>
                          </td>
                          {showClassCol ? (
                            <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap">
                              {classNameById.get(subjectClassId(s)) || "—"}
                            </td>
                          ) : null}
                          <td className="px-4 py-3.5 text-slate-500 font-medium">{s.subjectCode}</td>
                          <td className="px-4 py-3.5 text-slate-500">
                            {isChoice ? (
                              <span>
                                Choice: {s.choiceGroupName}
                                {s.pickCount && s.pickCount > 1 ? ` (pick ${s.pickCount})` : ""}
                              </span>
                            ) : (
                              <span>Standard</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <ShareBar percent={share} color={theme.accentHex} />
                          </td>
                          <td className="px-4 py-3.5">
                            <StatusPill status={s.status} />
                          </td>
                          {hasActions && (
                            <td className="px-4 py-3.5">
                              <div className="flex items-center justify-end gap-1.5">
                                {caps.canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => openEditSubject(s)}
                                    className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E8F1FF] text-[#2B6CB0] hover:bg-[#D6E8F8] transition-colors"
                                    aria-label="Edit subject"
                                  >
                                    <Pencil className="h-[14px] w-[14px]" />
                                  </button>
                                )}
                                {caps.canDelete && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (confirm("Delete subject?")) delMut.mutate(s._id);
                                    }}
                                    className="flex h-8 w-8 items-center justify-center rounded-full bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                                    aria-label="Delete subject"
                                  >
                                    <Trash2 className="h-[14px] w-[14px]" />
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3.5 border-t border-slate-100 bg-slate-50">
                <p className="text-sm text-slate-500">
                  {subjectsFiltered.length === 0
                    ? "Showing 0 subjects"
                    : `Showing ${showingFrom} to ${showingTo} of ${subjectsFiltered.length} subjects`}
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 disabled:opacity-40 hover:bg-slate-50"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-[#2B6CB0] px-2.5 text-sm font-semibold text-white">
                    {safePage}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 disabled:opacity-40 hover:bg-slate-50"
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {edit ? "Edit Subject" : bulkGroupCreate ? "New choice group" : "New Subject"}
            </DialogTitle>
            {(selectedClass || edit) && (
              <p className="text-sm text-muted-foreground">
                Class:{" "}
                <span className="font-medium text-foreground">
                  {selectedClass?.className ||
                    (edit ? classNameById.get(subjectClassId(edit)) : undefined) ||
                    "—"}
                </span>
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
                    placeholder={
                      selectedClass ? subjectCodePlaceholder(selectedClass.className) : "e.g. MATH-09"
                    }
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
                <div>
                  <Label htmlFor="subject-share">Subject share %</Label>
                  <Input
                    id="subject-share"
                    type="number"
                    min={0}
                    max={100}
                    step="0.001"
                    value={form.tuitionSharePercent}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, tuitionSharePercent: e.target.value }))
                    }
                    placeholder="e.g. 15"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Portion of student tuition in this subject’s pool. Teacher % is set on the staff
                    profile.
                  </p>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
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
