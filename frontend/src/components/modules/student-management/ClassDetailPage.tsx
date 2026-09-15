import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  BookOpen,
  ClipboardList,
  GraduationCap,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import type { ModuleActionCaps } from "@/lib/permissions";
import {
  ASSESSMENT_TYPE_LABELS,
  createAcademySubject,
  createFeeStructure,
  deleteAcademyClass,
  deleteAcademySubject,
  deleteClassTest,
  deleteFeeStructure,
  fetchSubjectChoiceGroups,
  formatClassTestSchedule,
  getAcademyClassRecord,
  updateAcademyClass,
  updateAcademySubject,
  updateFeeStructure,
  type AcademyClassTest,
  type AcademyFeeStructure,
  type AcademySubject,
  type AcademyTimetableSlot,
} from "@/lib/studentManagementApi";
import {
  academyClassRoutes,
  studentDetailHref,
} from "@/lib/studentManagementMenus";
import {
  classTestMarksHref,
  classTestSeriesHref,
} from "@/lib/testExamsMenus";
import { formatDate, formatPkr } from "./studentDisplayUtils";
import { ClassDisciplinesEditor } from "./ClassDisciplinesEditor";
import {
  generateSubjectCode,
  subjectCodePlaceholder,
} from "@/components/modules/student-management/subjectCodeUtils";
import {
  buildEnrollmentPayload,
  choiceGroupValid,
  defaultSubjectEnrollmentForm,
  enrollmentFromSubject,
  GroupSubjectRowsEditor,
  isEditNewChoiceGroup,
  SubjectEnrollmentConfig,
  type SubjectEnrollmentForm,
} from "@/components/modules/student-management/SubjectEnrollmentFields";
import {
  emptyGroupSubjectRow,
  parseGroupSubjectCount,
  resizeSiblingSubjectRows,
  siblingSubjectRowsValid,
  type GroupSubjectRow,
} from "@/components/modules/student-management/groupSubjectFormUtils";
import CreatedByLine from "@/components/modules/CreatedByLine";

const RECORD_KEY = (classId: string) => ["academy-class-record", classId] as const;

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-accent/15 text-accent",
    inactive: "bg-muted text-muted-foreground",
    open: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    closed: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`inline-flex text-xs font-semibold rounded-full px-2 py-0.5 capitalize ${colors[status] || "bg-muted text-muted-foreground"
        }`}
    >
      {status}
    </span>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-1">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-xl font-semibold text-primary">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function subjectLabel(subjectId: AcademyClassTest["subjectId"] | AcademyTimetableSlot["subjectId"]) {
  if (typeof subjectId === "object" && subjectId && "subjectName" in subjectId) {
    return subjectId.subjectName;
  }
  return "—";
}

export default function ClassDetailPage({
  caps,
  classId,
}: {
  caps: ModuleActionCaps;
  classId: string;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const role = user?.role ?? "admin";
  const routes = academyClassRoutes(role);

  const { data: record, isLoading, isError, error } = useQuery({
    queryKey: RECORD_KEY(classId),
    queryFn: () => getAcademyClassRecord(classId),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: RECORD_KEY(classId) });

  // Class edit
  const [classOpen, setClassOpen] = useState(false);
  const [classForm, setClassForm] = useState({
    className: "",
    status: "active" as "active" | "inactive",
    disciplines: [] as string[],
  });

  // Subject dialog
  const [subjectOpen, setSubjectOpen] = useState(false);
  const [editSubject, setEditSubject] = useState<AcademySubject | null>(null);
  const [subjectForm, setSubjectForm] = useState({
    subjectName: "",
    subjectCode: "",
    status: "active" as "active" | "inactive",
  });
  const [subjectCodeManuallyEdited, setSubjectCodeManuallyEdited] = useState(false);
  const [subjectEnrollmentForm, setSubjectEnrollmentForm] = useState<SubjectEnrollmentForm>(
    defaultSubjectEnrollmentForm,
  );
  const [siblingSubjectRows, setSiblingSubjectRows] = useState<GroupSubjectRow[]>([emptyGroupSubjectRow()]);

  const { data: choiceGroups = [] } = useQuery({
    queryKey: ["choice-groups", classId],
    queryFn: () => fetchSubjectChoiceGroups(classId),
  });

  const editNewChoiceGroup = isEditNewChoiceGroup(subjectEnrollmentForm, Boolean(editSubject));

  useEffect(() => {
    if (!editNewChoiceGroup) return;
    const count = parseGroupSubjectCount(subjectEnrollmentForm.groupSubjectCount);
    setSiblingSubjectRows((prev) => resizeSiblingSubjectRows(count, prev));
  }, [editNewChoiceGroup, subjectEnrollmentForm.groupSubjectCount]);

  // Fee dialog
  const [feeOpen, setFeeOpen] = useState(false);
  const [editFee, setEditFee] = useState<AcademyFeeStructure | null>(null);
  const [feeForm, setFeeForm] = useState({
    perSubjectFee: "",
    fullPackageFee: "",
    admissionFee: "",
    status: "active",
  });

  // Timetable dialog
  const [tab, setTab] = useState("overview");

  const classMut = useMutation({
    mutationFn: () => updateAcademyClass(classId, classForm),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["academy-classes"] });
      setClassOpen(false);
      toast({ title: "Class updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteClassMut = useMutation({
    mutationFn: () => deleteAcademyClass(classId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academy-classes"] });
      toast({ title: "Class deleted" });
      navigate(routes.list);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const subjectMut = useMutation({
    mutationFn: async () => {
      const enrollment = buildEnrollmentPayload(subjectEnrollmentForm);
      const body = { ...subjectForm, ...enrollment };
      if (editSubject) {
        const updated = await updateAcademySubject(editSubject._id, body);
        if (editNewChoiceGroup) {
          for (const row of siblingSubjectRows) {
            await createAcademySubject({
              classId,
              subjectName: row.subjectName.trim(),
              subjectCode: row.subjectCode.trim().toUpperCase(),
              status: subjectForm.status,
              ...enrollment,
            });
          }
        }
        return updated;
      }
      return createAcademySubject({ ...body, classId });
    },
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["academy-classes"] });
      qc.invalidateQueries({ queryKey: ["choice-groups", classId] });
      qc.invalidateQueries({ queryKey: ["enrollment-subjects"] });
      setSubjectOpen(false);
      toast({
        title: editNewChoiceGroup
          ? "Choice group saved"
          : editSubject
            ? "Subject updated"
            : "Subject added",
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteSubjectMut = useMutation({
    mutationFn: (id: string) => deleteAcademySubject(id),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["academy-classes"] });
      qc.invalidateQueries({ queryKey: ["choice-groups", classId] });
      toast({ title: "Subject removed" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const feeMut = useMutation({
    mutationFn: async () => {
      const body = {
        perSubjectFee: Number(feeForm.perSubjectFee),
        fullPackageFee: Number(feeForm.fullPackageFee),
        admissionFee: Number(feeForm.admissionFee),
        status: feeForm.status,
      };
      if (editFee) return updateFeeStructure(editFee._id, body);
      return createFeeStructure({ ...body, classId });
    },
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["academy-fee-structures"] });
      setFeeOpen(false);
      toast({ title: editFee ? "Fee structure updated" : "Fee structure created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteFeeMut = useMutation({
    mutationFn: (id: string) => deleteFeeStructure(id),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["academy-fee-structures"] });
      toast({ title: "Fee structure deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });


  const deleteTestMut = useMutation({
    mutationFn: ({ testId, series }: { testId: string; series?: boolean }) =>
      deleteClassTest(testId, series ? { deleteSeries: true } : undefined),
    onSuccess: () => {
      invalidate();
      toast({ title: "Test removed" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const activeSubjects = useMemo(
    () => (record?.subjects ?? []).filter((s) => s.status === "active"),
    [record?.subjects]
  );

  if (isLoading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-12 text-center text-muted-foreground">
        Loading class…
      </div>
    );
  }

  if (isError || !record) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-12 space-y-4">
        <p className="text-destructive">{error instanceof Error ? error.message : "Class not found"}</p>
        <Button variant="outline" asChild>
          <Link to={routes.list}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to classes
          </Link>
        </Button>
      </div>
    );
  }

  const { class: cls, stats, feeStructure, feeStructureHistory } = record;

  const openClassEdit = () => {
    setClassForm({ className: cls.className, status: cls.status, disciplines: cls.disciplines ?? [] });
    setClassOpen(true);
  };

  const openSubjectCreate = () => {
    setEditSubject(null);
    setSubjectCodeManuallyEdited(false);
    setSubjectForm({ subjectName: "", subjectCode: "", status: "active" });
    setSubjectEnrollmentForm(defaultSubjectEnrollmentForm());
    setSiblingSubjectRows([emptyGroupSubjectRow()]);
    setSubjectOpen(true);
  };

  const openSubjectEdit = (s: AcademySubject) => {
    setEditSubject(s);
    setSubjectCodeManuallyEdited(true);
    setSubjectForm({
      subjectName: s.subjectName,
      subjectCode: s.subjectCode,
      status: s.status,
    });
    setSubjectEnrollmentForm(enrollmentFromSubject(s, choiceGroups));
    setSiblingSubjectRows([emptyGroupSubjectRow()]);
    setSubjectOpen(true);
  };

  const openFeeCreate = () => {
    setEditFee(null);
    setFeeForm({
      perSubjectFee: feeStructure ? String(feeStructure.perSubjectFee) : "",
      fullPackageFee: feeStructure ? String(feeStructure.fullPackageFee) : "",
      admissionFee: feeStructure ? String(feeStructure.admissionFee) : "",
      status: "active",
    });
    setFeeOpen(true);
  };

  const openFeeEdit = (row: AcademyFeeStructure) => {
    setEditFee(row);
    setFeeForm({
      perSubjectFee: String(row.perSubjectFee),
      fullPackageFee: String(row.fullPackageFee),
      admissionFee: String(row.admissionFee),
      status: row.status,
    });
    setFeeOpen(true);
  };


  const testHref = (test: AcademyClassTest) => {
    if (test.seriesId && test.occurrenceCount && test.occurrenceCount > 1) {
      return classTestSeriesHref(role, test.seriesId);
    }
    return classTestMarksHref(role, test._id);
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Button variant="ghost" size="sm" className="-ml-2 gap-2" asChild>
            <Link to={routes.list}>
              <ArrowLeft className="h-4 w-4" /> Classes
            </Link>
          </Button>
          <div className="flex items-center gap-3 flex-wrap">
            <GraduationCap className="h-8 w-8 text-primary shrink-0" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{cls.className}</h1>
              {cls.disciplines?.length ? (
                <p className="text-sm text-muted-foreground">{cls.disciplines.join(" · ")}</p>
              ) : null}
              <CreatedByLine createdBy={cls.createdBy} />
            </div>
            <StatusBadge status={cls.status} />
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {caps.canEdit && (
            <Button variant="outline" size="sm" className="gap-2" onClick={openClassEdit}>
              <Pencil className="h-4 w-4" /> Edit class
            </Button>
          )}
          {caps.canDelete && (
            <Button
              variant="destructive"
              size="sm"
              className="gap-2"
              disabled={deleteClassMut.isPending}
              onClick={() => {
                if (
                  confirm(
                    `Delete class "${cls.className}"? Remove all subjects and students first.`
                  )
                ) {
                  deleteClassMut.mutate();
                }
              }}
            >
              <Trash2 className="h-4 w-4" /> Delete class
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryCard label="Subjects" value={stats.subjectCount} />
        <SummaryCard label="Students" value={stats.studentCount} hint={`${stats.activeStudentCount} active`} />
        <SummaryCard label="Class tests" value={stats.classTestCount} />
        <SummaryCard label="Fee records" value={stats.feeRecordsCount} />
        <SummaryCard label="Fees paid" value={formatPkr(stats.totalFeesPaid)} />
        <SummaryCard label="Fees pending" value={formatPkr(stats.totalFeesPending)} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="subjects" className="gap-1">
            <BookOpen className="h-3.5 w-3.5" /> Subjects
          </TabsTrigger>
          <TabsTrigger value="fees" className="gap-1">
            <Wallet className="h-3.5 w-3.5" /> Fee structure
          </TabsTrigger>
          <TabsTrigger value="students" className="gap-1">
            <Users className="h-3.5 w-3.5" /> Students
          </TabsTrigger>
          <TabsTrigger value="tests" className="gap-1">
            <ClipboardList className="h-3.5 w-3.5" /> Tests
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          <section className="rounded-lg border p-4 space-y-4">
            <h3 className="text-sm font-semibold text-primary border-b pb-2">Class details</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground uppercase">Name</p>
                <p className="font-medium">{cls.className}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Status</p>
                <StatusBadge status={cls.status} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Disciplines</p>
                <p className="font-medium">{cls.disciplines?.length ? cls.disciplines.join(", ") : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Total subjects (counter)</p>
                <p className="font-medium">{cls.totalSubjects}</p>
              </div>
              {cls.createdAt && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Created</p>
                  <p className="font-medium">{formatDate(cls.createdAt)}</p>
                </div>
              )}
            </div>
          </section>

          {feeStructure && (
            <section className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
                  <Receipt className="h-4 w-4" /> Active fee structure
                </h3>
                {caps.canEdit && (
                  <Button variant="outline" size="sm" onClick={() => openFeeEdit(feeStructure)}>
                    Edit
                  </Button>
                )}
              </div>
              <div className="grid sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Per subject</p>
                  <p className="font-medium">{formatPkr(feeStructure.perSubjectFee)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Full package</p>
                  <p className="font-medium">{formatPkr(feeStructure.fullPackageFee)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Admission</p>
                  <p className="font-medium">{formatPkr(feeStructure.admissionFee)}</p>
                </div>
              </div>
            </section>
          )}
        </TabsContent>

        <TabsContent value="subjects" className="mt-6 space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">{record.subjects.length} subject(s)</p>
            {caps.canCreate && (
              <Button size="sm" className="gap-2" onClick={openSubjectCreate}>
                <Plus className="h-4 w-4" /> Add subject
              </Button>
            )}
          </div>
          <div className="overflow-x-auto border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium">Subject</th>
                  <th className="text-left p-3 font-medium">Code</th>
                  <th className="text-left p-3 font-medium">Enrollment</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  {(caps.canEdit || caps.canDelete) && (
                    <th className="text-right p-3 font-medium">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {record.subjects.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      No subjects yet
                    </td>
                  </tr>
                )}
                {record.subjects.map((s) => (
                  <tr key={s._id} className="border-b last:border-0">
                    <td className="p-3 font-medium">{s.subjectName}</td>
                    <td className="p-3">{s.subjectCode}</td>
                    <td className="p-3 text-muted-foreground">
                      {s.enrollmentType === "choice" && s.choiceGroupName
                        ? `Choice: ${s.choiceGroupName}${s.pickCount && s.pickCount > 1 ? ` (pick ${s.pickCount})` : ""
                        }`
                        : "Standard"}
                    </td>
                    <td className="p-3">
                      <StatusBadge status={s.status} />
                    </td>
                    {(caps.canEdit || caps.canDelete) && (
                      <td className="p-3 text-right space-x-1">
                        {caps.canEdit && (
                          <Button variant="ghost" size="icon" onClick={() => openSubjectEdit(s)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {caps.canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm(`Remove subject "${s.subjectName}"?`)) {
                                deleteSubjectMut.mutate(s._id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="fees" className="mt-6 space-y-4">
          <div className="flex justify-between items-center">
            {caps.canCreate && (
              <Button size="sm" className="gap-2" onClick={openFeeCreate}>
                <Plus className="h-4 w-4" /> New structure
              </Button>
            )}
          </div>
          <div className="overflow-x-auto border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium">Per subject</th>
                  <th className="text-left p-3 font-medium">Full package</th>
                  <th className="text-left p-3 font-medium">Admission</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  {(caps.canEdit || caps.canDelete) && (
                    <th className="text-right p-3 font-medium">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {feeStructureHistory.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      No fee structure defined
                    </td>
                  </tr>
                )}
                {feeStructureHistory.map((row) => (
                  <tr key={row._id} className="border-b last:border-0">
                    <td className="p-3">{formatPkr(row.perSubjectFee)}</td>
                    <td className="p-3">{formatPkr(row.fullPackageFee)}</td>
                    <td className="p-3">{formatPkr(row.admissionFee)}</td>
                    <td className="p-3">
                      <StatusBadge status={row.status} />
                    </td>
                    {(caps.canEdit || caps.canDelete) && (
                      <td className="p-3 text-right space-x-1">
                        {caps.canEdit && (
                          <Button variant="ghost" size="icon" onClick={() => openFeeEdit(row)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {caps.canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm("Delete this fee structure version?")) {
                                deleteFeeMut.mutate(row._id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="students" className="mt-6">
          <div className="overflow-x-auto border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium">ID</th>
                  <th className="text-left p-3 font-medium">Name</th>
                  <th className="text-left p-3 font-medium">Father</th>
                  <th className="text-left p-3 font-medium">Package</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-right p-3 font-medium">Profile</th>
                </tr>
              </thead>
              <tbody>
                {record.students.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      No students in this class
                    </td>
                  </tr>
                )}
                {record.students.map((s) => (
                  <tr key={s._id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="p-3 font-mono text-xs">{s.studentId}</td>
                    <td className="p-3 font-medium">{s.studentName}</td>
                    <td className="p-3">{s.fatherName ?? "—"}</td>
                    <td className="p-3">{s.isFullPackage ? "Full" : "Per subject"}</td>
                    <td className="p-3">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="p-3 text-right">
                      <Button variant="link" size="sm" asChild>
                        <Link to={studentDetailHref(role, s._id)}>View</Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="tests" className="mt-6 space-y-4">
          <div className="overflow-x-auto border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium">Title</th>
                  <th className="text-left p-3 font-medium">Subject</th>
                  <th className="text-left p-3 font-medium">Schedule</th>
                  <th className="text-left p-3 font-medium">Type</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-right p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {record.classTests.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      No class tests yet
                    </td>
                  </tr>
                )}
                {record.classTests.map((t) => (
                  <tr key={t._id} className="border-b last:border-0">
                    <td className="p-3 font-medium">
                      {t.seriesLabel || t.title}
                      {t.occurrenceCount && t.occurrenceCount > 1 && (
                        <span className="text-xs text-muted-foreground ml-1">
                          ({t.occurrenceIndex}/{t.occurrenceCount})
                        </span>
                      )}
                    </td>
                    <td className="p-3">{subjectLabel(t.subjectId)}</td>
                    <td className="p-3">{formatClassTestSchedule(t)}</td>
                    <td className="p-3">
                      {ASSESSMENT_TYPE_LABELS[t.assessmentType] ?? t.assessmentType}
                    </td>
                    <td className="p-3">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="p-3 text-right space-x-1">
                      <Button variant="link" size="sm" asChild>
                        <Link to={testHref(t)}>Open</Link>
                      </Button>
                      {caps.canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            const series =
                              t.seriesId && t.occurrenceCount && t.occurrenceCount > 1;
                            const msg = series
                              ? "Delete entire test series?"
                              : "Delete this test?";
                            if (confirm(msg)) {
                              deleteTestMut.mutate({
                                testId: t._id,
                                series: Boolean(series),
                              });
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

      </Tabs>

      <Dialog open={classOpen} onOpenChange={setClassOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit class</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Class name</Label>
              <Input
                value={classForm.className}
                onChange={(e) => setClassForm((f) => ({ ...f, className: e.target.value }))}
              />
            </div>
            <ClassDisciplinesEditor
              value={classForm.disciplines}
              onChange={(disciplines) => setClassForm((f) => ({ ...f, disciplines }))}
            />
            <div>
              <Label>Status</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={classForm.status}
                onChange={(e) =>
                  setClassForm((f) => ({
                    ...f,
                    status: e.target.value as "active" | "inactive",
                  }))
                }
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClassOpen(false)}>
              Cancel
            </Button>
            <Button disabled={classMut.isPending} onClick={() => classMut.mutate()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={subjectOpen} onOpenChange={setSubjectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editSubject ? "Edit subject" : "Add subject"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <SubjectEnrollmentConfig
              value={subjectEnrollmentForm}
              onChange={setSubjectEnrollmentForm}
              choiceGroups={choiceGroups}
              currentSubjectId={editSubject?._id}
              isEdit={Boolean(editSubject)}
            />
            <div>
              <Label>{editNewChoiceGroup ? "Subject 1 — name" : "Subject name"}</Label>
              <Input
                value={subjectForm.subjectName}
                onChange={(e) => {
                  const subjectName = e.target.value;
                  setSubjectForm((f) => {
                    const next = { ...f, subjectName };
                    if (!editSubject && !subjectCodeManuallyEdited) {
                      next.subjectCode = generateSubjectCode(subjectName, cls.className);
                    }
                    return next;
                  });
                }}
                placeholder="e.g. Mathematics"
              />
            </div>
            <div>
              <Label>{editNewChoiceGroup ? "Subject 1 — code" : "Code"}</Label>
              <Input
                value={subjectForm.subjectCode}
                onChange={(e) => {
                  setSubjectCodeManuallyEdited(true);
                  setSubjectForm((f) => ({ ...f, subjectCode: e.target.value.toUpperCase() }));
                }}
                placeholder={subjectCodePlaceholder(cls.className)}
              />
            </div>
            {editNewChoiceGroup && (
              <GroupSubjectRowsEditor
                rows={siblingSubjectRows}
                onChange={setSiblingSubjectRows}
                className={cls.className}
                startIndex={2}
                title="Other subjects in this group"
              />
            )}
            <div>
              <Label>Status</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={subjectForm.status}
                onChange={(e) =>
                  setSubjectForm((f) => ({
                    ...f,
                    status: e.target.value as "active" | "inactive",
                  }))
                }
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubjectOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                !subjectForm.subjectName.trim() ||
                !subjectForm.subjectCode.trim() ||
                !choiceGroupValid(subjectEnrollmentForm) ||
                (editNewChoiceGroup && !siblingSubjectRowsValid(siblingSubjectRows)) ||
                subjectMut.isPending
              }
              onClick={() => subjectMut.mutate()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={feeOpen} onOpenChange={setFeeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editFee ? "Edit fee structure" : "New fee structure"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Per subject fee (₨)</Label>
              <Input
                type="number"
                min={0}
                value={feeForm.perSubjectFee}
                onChange={(e) => setFeeForm((f) => ({ ...f, perSubjectFee: e.target.value }))}
              />
            </div>
            <div>
              <Label>Full package fee (₨)</Label>
              <Input
                type="number"
                min={0}
                value={feeForm.fullPackageFee}
                onChange={(e) => setFeeForm((f) => ({ ...f, fullPackageFee: e.target.value }))}
              />
            </div>
            <div>
              <Label>Admission fee (₨)</Label>
              <Input
                type="number"
                min={0}
                value={feeForm.admissionFee}
                onChange={(e) => setFeeForm((f) => ({ ...f, admissionFee: e.target.value }))}
              />
            </div>
            {editFee && (
              <div>
                <Label>Status</Label>
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={feeForm.status}
                  onChange={(e) => setFeeForm((f) => ({ ...f, status: e.target.value }))}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeeOpen(false)}>
              Cancel
            </Button>
            <Button disabled={feeMut.isPending} onClick={() => feeMut.mutate()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
