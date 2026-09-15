import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  Calendar,
  CircleCheck,
  GraduationCap,
  Globe,
  Heart,
  Home,
  IdCard,
  Mail,
  MapPin,
  Phone,
  Plus,
  School,
  Smartphone,
  Tag,
  Trash2,
  KeyRound,
  Eye,
  EyeOff,
  ImageIcon,
  User,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  cnicValidationMessage,
  formatCnicInput,
  formatLandlineInput,
  formatMobileInput,
  isValidCnic,
  isValidLandline,
  isValidMobile,
  landlineValidationMessage,
  mobileValidationMessage,
} from "@/lib/pkFieldFormat";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { ModuleActionCaps } from "@/lib/permissions";
import {
  academyStudentRoutes,
  type AcademyStudentRoutes,
} from "@/lib/studentManagementMenus";
import {
  fetchAcademyClasses,
  fetchEnrollmentSubjects,
  fetchSectionsByClass,
  getAcademyStudent,
  previewFees,
  registerAcademyStudent,
  activateAcademyStudent,
  registerDirectAcademyStudent,
  resolveUploadUrl,
  updateAcademyStudent,
  uploadAcademyStudentPhoto,
  type AcademyStudentActivateResult,
  type AcademyStudent,
  type EnrollmentSubjectLayout,
  type FeePreview,
} from "@/lib/studentManagementApi";
import {
  buildStudentPayload,
  defaultRegisterForm,
  emptyAcademicRow,
  mapStudentToForm,
  type AcademicRow,
} from "./registerStudentForm";
import { formatDate } from "./studentDisplayUtils";

function deriveChoiceSelections(
  layout: EnrollmentSubjectLayout,
  selectedSubjects: string[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const group of layout.choiceGroups) {
    const pick = group.subjects.find((s) => selectedSubjects.includes(s._id));
    if (pick) map[group._id] = pick._id;
  }
  return map;
}

function SectionTitle({
  children,
  description,
}: {
  children: React.ReactNode;
  description?: string;
}) {
  return (
    <div className="space-y-1 border-b border-border/60 pb-3">
      <h3 className="text-sm font-semibold tracking-tight text-primary">{children}</h3>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
    </div>
  );
}

function ActivateSummaryBanner({ student }: { student: AcademyStudent }) {
  const className =
    typeof student.classId === "object" && student.classId ? student.classId.className : undefined;

  return (
    <div className="rounded-xl border bg-gradient-to-br from-primary/8 via-background to-accent/10 p-4 sm:p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            Pending admission
          </p>
          <h3 className="text-lg font-semibold text-foreground truncate">{student.studentName}</h3>
          <p className="text-sm text-muted-foreground">{student.fatherName}</p>
          {student.phone ? (
            <p className="text-sm text-muted-foreground">{student.phone}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {student.rollNumber ? (
            <Badge variant="secondary" className="font-normal">
              Temp roll {student.rollNumber}
            </Badge>
          ) : null}
          {student.registrationNumber ? (
            <Badge variant="outline" className="font-normal">
              Ref {student.registrationNumber}
            </Badge>
          ) : null}
          {className ? (
            <Badge variant="outline" className="font-normal">
              {className}
            </Badge>
          ) : null}
          {student.createdAt ? (
            <Badge variant="outline" className="font-normal">
              Intake {formatDate(student.createdAt)}
            </Badge>
          ) : null}
        </div>
      </div>
      {student.intakeNotes?.trim() ? (
        <div className="mt-4 rounded-lg border bg-background/80 px-3 py-2.5 text-sm">
          <p className="text-xs font-medium text-muted-foreground mb-1">Intake notes</p>
          <p className="text-foreground">{student.intakeNotes.trim()}</p>
        </div>
      ) : null}
    </div>
  );
}

function sectionShellClass(isActivate: boolean, last = false) {
  return cn(
    "space-y-4",
    isActivate
      ? "rounded-xl border bg-card p-5 sm:p-6 shadow-sm"
      : cn("pb-10", !last && "border-b"),
  );
}

function FormField({
  label,
  required,
  className,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label>
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function IconInput({
  icon: Icon,
  className,
  ...props
}: React.ComponentProps<typeof Input> & { icon: LucideIcon }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input className={cn("pl-9", className)} {...props} />
    </div>
  );
}

function IconTextarea({
  icon: Icon,
  className,
  ...props
}: React.ComponentProps<typeof Textarea> & { icon: LucideIcon }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
      <Textarea className={cn("pl-9 min-h-[80px]", className)} {...props} />
    </div>
  );
}

function IconSelect({
  icon: Icon,
  className,
  children,
  ...props
}: React.ComponentProps<"select"> & { icon: LucideIcon }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <select
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm font-sans ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

export default function RegisterStudentPage({
  caps,
  studentId,
  routes: routesProp,
  sessionId = "",
  mode = "register",
  asDialog = false,
  open = true,
  onOpenChange,
}: {
  caps: ModuleActionCaps;
  studentId?: string;
  routes?: AcademyStudentRoutes;
  sessionId?: string;
  mode?: "register" | "activate" | "direct";
  asDialog?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const isActivate = mode === "activate";
  const isDirect = mode === "direct";
  const isAccountsEnrollment = isActivate || isDirect;
  const isEdit = Boolean(studentId) && !isActivate;
  const { toast } = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [form, setForm] = useState(defaultRegisterForm);
  const [feePreview, setFeePreview] = useState<FeePreview | null>(null);
  const [formReady, setFormReady] = useState(!studentId);
  const [showParentPassword, setShowParentPassword] = useState(false);
  const [choiceSelections, setChoiceSelections] = useState<Record<string, string>>({});
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<AcademyStudentActivateResult["credentials"] | null>(null);
  const [fieldTouched, setFieldTouched] = useState({
    fatherGuardianCnic: false,
    mobileNo: false,
    contactPhoneRes: false,
  });
  const autoPackageSectionRef = useRef<string | null>(null);

  const routes =
    routesProp ?? (user?.role ? academyStudentRoutes(user.role, "registration") : null);
  const listHref = routes?.list ?? "..";
  const detailHref = studentId && routes ? routes.detail(studentId) : listHref;
  const listBackLabel = routes?.list.includes("/students")
    ? "Back to student records"
    : "Back to registration";

  const { data: existingStudent, isLoading: loadingStudent } = useQuery({
    queryKey: ["academy-student", studentId],
    queryFn: () => getAcademyStudent(studentId!),
    enabled: Boolean(studentId),
  });

  useEffect(() => {
    if (isActivate && existingStudent && existingStudent.status !== "pending_fee" && !asDialog) {
      navigate(detailHref, { replace: true });
    }
  }, [isActivate, existingStudent, detailHref, navigate, asDialog]);

  useEffect(() => {
    if (isActivate && existingStudent && existingStudent.status !== "pending_fee" && asDialog) {
      onOpenChange?.(false);
    }
  }, [isActivate, existingStudent, asDialog, onOpenChange]);

  useEffect(() => {
    if (existingStudent) {
      setForm(mapStudentToForm(existingStudent));
      setPhotoFile(null);
      setPhotoPreview(
        existingStudent.photoImage ? resolveUploadUrl(existingStudent.photoImage) : null,
      );
      setFormReady(true);
    }
  }, [existingStudent]);

  useEffect(() => {
    return () => {
      if (photoPreview?.startsWith("blob:")) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  const onPickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (photoPreview?.startsWith("blob:")) URL.revokeObjectURL(photoPreview);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    e.target.value = "";
  };

  const clearPhoto = () => {
    if (photoPreview?.startsWith("blob:")) URL.revokeObjectURL(photoPreview);
    setPhotoFile(null);
    setPhotoPreview(
      existingStudent?.photoImage ? resolveUploadUrl(existingStudent.photoImage) : null,
    );
  };

  const { data: classes = [] } = useQuery({
    queryKey: ["academy-classes", sessionId],
    queryFn: () => fetchAcademyClasses({ status: "active", sessionId: sessionId || undefined }),
    enabled: isEdit || isActivate || isDirect || Boolean(sessionId),
  });

  const { data: enrollmentLayout, isLoading: enrollmentLoading } = useQuery({
    queryKey: ["enrollment-subjects", form.classId, form.sectionId],
    queryFn: () => fetchEnrollmentSubjects(form.classId, form.sectionId),
    enabled: Boolean(form.classId) && Boolean(form.sectionId),
  });

  const hasChoiceGroups = Boolean(enrollmentLayout?.hasChoiceGroups);

  useEffect(() => {
    if (!enrollmentLayout?.hasChoiceGroups || !formReady) return;
    if (Object.keys(choiceSelections).length > 0) return;
    const derived = deriveChoiceSelections(enrollmentLayout, form.selectedSubjects);
    if (Object.keys(derived).length > 0) setChoiceSelections(derived);
  }, [enrollmentLayout, formReady, form.selectedSubjects, choiceSelections]);

  useEffect(() => {
    if (!enrollmentLayout?.hasChoiceGroups || !form.isFullPackage) return;
    const coreIds = enrollmentLayout.coreSubjects.map((s) => s._id);
    const groupIds = enrollmentLayout.choiceGroups
      .map((g) => choiceSelections[g._id])
      .filter(Boolean);
    const next = [...coreIds, ...groupIds];
    setForm((f) => {
      const same =
        f.selectedSubjects.length === next.length &&
        next.every((id) => f.selectedSubjects.includes(id));
      return same ? f : { ...f, selectedSubjects: next };
    });
  }, [enrollmentLayout, form.isFullPackage, choiceSelections]);

  useEffect(() => {
    if (!isActivate || !form.sectionId || !enrollmentLayout) return;
    if (autoPackageSectionRef.current === form.sectionId) return;
    autoPackageSectionRef.current = form.sectionId;
    if (!enrollmentLayout.hasChoiceGroups && enrollmentLayout.coreSubjects.length > 0) {
      setForm((f) => ({
        ...f,
        isFullPackage: true,
        selectedSubjects: enrollmentLayout.coreSubjects.map((s) => s._id),
      }));
    } else if (enrollmentLayout.hasChoiceGroups) {
      setForm((f) => ({ ...f, isFullPackage: true }));
    }
  }, [isActivate, form.sectionId, enrollmentLayout]);

  const { data: sections = [], isLoading: sectionsLoading } = useQuery({
    queryKey: ["academy-sections", form.classId],
    queryFn: () => fetchSectionsByClass(form.classId, { status: "active" }),
    enabled: Boolean(form.classId),
  });

  useEffect(() => {
    if (!form.classId) {
      setFeePreview(null);
      return;
    }
    if (!form.isFullPackage && form.selectedSubjects.length === 0) {
      setFeePreview(null);
      return;
    }
    if (form.isFullPackage && hasChoiceGroups && enrollmentLayout) {
      const groupsReady = enrollmentLayout.choiceGroups.every((g) => {
        const groupIds = g.subjects.map((s) => s._id);
        return form.selectedSubjects.filter((id) => groupIds.includes(id)).length === g.pickCount;
      });
      if (!groupsReady) {
        setFeePreview(null);
        return;
      }
    }
    const t = setTimeout(() => {
      previewFees({
        classId: form.classId,
        selectedSubjects: form.selectedSubjects,
        isFullPackage: form.isFullPackage,
        monthlyFeeDiscount: Number(form.monthlyFeeDiscount) || 0,
        admissionFeeDiscount: Number(form.admissionFeeDiscount) || 0,
      })
        .then(setFeePreview)
        .catch(() => setFeePreview(null));
    }, 300);
    return () => clearTimeout(t);
  }, [
    form.classId,
    form.selectedSubjects,
    form.isFullPackage,
    form.monthlyFeeDiscount,
    form.admissionFeeDiscount,
    hasChoiceGroups,
    enrollmentLayout,
    choiceSelections,
  ]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const mobileErr = mobileValidationMessage(form.mobileNo);
      if (mobileErr) throw new Error(mobileErr);
      const cnicErr = cnicValidationMessage(form.fatherGuardianCnic);
      if (cnicErr) throw new Error(cnicErr);
      const landlineErr = landlineValidationMessage(form.contactPhoneRes);
      if (landlineErr) throw new Error(landlineErr);

      const body = buildStudentPayload(form);
      if (isActivate && studentId) {
        const result = await activateAcademyStudent(studentId, body);
        if (photoFile) {
          await uploadAcademyStudentPhoto(result.student._id, photoFile);
        }
        return result;
      }
      if (isDirect) {
        const result = await registerDirectAcademyStudent(body);
        if (photoFile) {
          await uploadAcademyStudentPhoto(result.student._id, photoFile);
        }
        return result;
      }
      const student =
        isEdit && studentId
          ? await updateAcademyStudent(studentId, body)
          : await registerAcademyStudent(body);
      if (photoFile) {
        await uploadAcademyStudentPhoto(student._id, photoFile);
      }
      return { student, credentials: null as AcademyStudentActivateResult["credentials"] | null };
    },
    onSuccess: ({ student, credentials: creds }) => {
      qc.invalidateQueries({ queryKey: ["academy-students"] });
      qc.invalidateQueries({ queryKey: ["academy-student", studentId] });
      qc.invalidateQueries({ queryKey: ["academy-student-record", studentId] });
      if (creds) {
        setCredentials(creds);
        toast({
          title: isDirect ? "Student registered" : "Student activated",
          description: `Roll ${creds.rollNumber} · ID ${creds.studentId}`,
        });
        return;
      }
      if (isEdit) {
        toast({ title: "Student updated" });
        if (asDialog) onOpenChange?.(false);
        else navigate(detailHref);
      } else {
        toast({ title: "Student registered", description: `ID: ${student.studentId}` });
        if (asDialog) onOpenChange?.(false);
        else navigate(listHref);
      }
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleSubject = (id: string) => {
    setForm((f) => ({
      ...f,
      isFullPackage: false,
      selectedSubjects: f.selectedSubjects.includes(id)
        ? f.selectedSubjects.filter((x) => x !== id)
        : [...f.selectedSubjects, id],
    }));
  };

  const toggleGroupChoice = (groupId: string, subjectId: string, checked: boolean) => {
    setChoiceSelections((prev) => {
      if (!checked) {
        if (prev[groupId] !== subjectId) return prev;
        const next = { ...prev };
        delete next[groupId];
        return next;
      }
      return { ...prev, [groupId]: subjectId };
    });

    setForm((f) => {
      const group = enrollmentLayout?.choiceGroups.find((g) => g._id === groupId);
      const groupSubjectIds = group?.subjects.map((s) => s._id) ?? [];
      let nextSubjects = f.selectedSubjects.filter((id) => !groupSubjectIds.includes(id));
      if (checked) nextSubjects = [...nextSubjects, subjectId];
      return { ...f, selectedSubjects: nextSubjects };
    });
  };

  const selectFullPackage = (checked: boolean) => {
    setForm((f) => ({
      ...f,
      isFullPackage: checked,
      selectedSubjects: checked && enrollmentLayout
        ? enrollmentLayout.coreSubjects.map((s) => s._id)
        : checked
          ? []
          : f.selectedSubjects,
    }));
    if (!checked) setChoiceSelections({});
  };

  const updateAcademic = (index: number, patch: Partial<AcademicRow>) => {
    setForm((f) => ({
      ...f,
      academicHistory: f.academicHistory.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
  };

  const subjectSelectionValid = (() => {
    if (form.isFullPackage) {
      if (!hasChoiceGroups) return true;
      return (
        enrollmentLayout?.choiceGroups.every((g) => {
          const groupIds = g.subjects.map((s) => s._id);
          const picks = form.selectedSubjects.filter((id) => groupIds.includes(id));
          return picks.length === g.pickCount;
        }) ?? false
      );
    }
    if (hasChoiceGroups) {
      return (
        form.selectedSubjects.length > 0 &&
        (enrollmentLayout?.choiceGroups.every((g) => {
          const groupIds = g.subjects.map((s) => s._id);
          const picks = form.selectedSubjects.filter((id) => groupIds.includes(id));
          return picks.length === 0 || picks.length === g.pickCount;
        }) ?? false)
      );
    }
    return form.selectedSubjects.length > 0;
  })();

  const submitBlockers = (() => {
    const missing: string[] = [];
    if (!form.studentName.trim()) missing.push("Student name");
    if (!form.fatherName.trim()) missing.push("Father's name");
    if (!form.dateOfBirth) missing.push("Date of birth");
    if (!form.gender) missing.push("Gender");
    if (!isValidMobile(form.mobileNo)) missing.push("Valid mobile number (03XX-XXXXXXX)");
    if (form.fatherGuardianCnic.trim() && !isValidCnic(form.fatherGuardianCnic)) {
      missing.push("Valid CNIC (13 digits)");
    }
    if (form.contactPhoneRes.trim() && !isValidLandline(form.contactPhoneRes)) {
      missing.push("Valid contact number (0XX-XXXXXXX)");
    }
    if (!form.classId) missing.push("Class");
    if (!form.sectionId) missing.push("Section");
    const enrollClass = classes.find((c) => c._id === form.classId);
    if ((enrollClass?.disciplines?.length ?? 0) > 0 && !form.discipline.trim()) {
      missing.push("Discipline");
    }
    if (!subjectSelectionValid) {
      if (form.isFullPackage && hasChoiceGroups) {
        missing.push("One elective per group (section 6)");
      } else {
        missing.push("Subjects or full package (section 6)");
      }
    }
    if (!isEdit && !isAccountsEnrollment) {
      if (!form.guardianEmail.trim()) missing.push("Guardian email (section 2)");
      if (form.parentPassword.trim().length < 8) {
        missing.push("Parent login password — min 8 characters (section 2)");
      }
    }
    return missing;
  })();

  const canSubmit =
    form.studentName.trim()
    && form.fatherName.trim()
    && form.dateOfBirth
    && form.gender
    && isValidMobile(form.mobileNo)
    && (!form.fatherGuardianCnic.trim() || isValidCnic(form.fatherGuardianCnic))
    && (!form.contactPhoneRes.trim() || isValidLandline(form.contactPhoneRes))
    && form.classId
    && form.sectionId
    && ((classes.find((c) => c._id === form.classId)?.disciplines?.length ?? 0) === 0 || Boolean(form.discipline.trim()))
    && subjectSelectionValid
    && (isEdit || isAccountsEnrollment
      ? true
      : Boolean(form.guardianEmail.trim()) && form.parentPassword.trim().length >= 8);

  const selectedClassName = classes.find((c) => c._id === form.classId)?.className;
  const classDisciplines = classes.find((c) => c._id === form.classId)?.disciplines ?? [];

  const cnicError = fieldTouched.fatherGuardianCnic ? cnicValidationMessage(form.fatherGuardianCnic) : null;
  const mobileError = fieldTouched.mobileNo ? mobileValidationMessage(form.mobileNo) : null;
  const contactError = fieldTouched.contactPhoneRes ? landlineValidationMessage(form.contactPhoneRes) : null;

  const handleClose = () => {
    if (asDialog) onOpenChange?.(false);
    else navigate(isEdit || isActivate ? detailHref : listHref);
  };

  if ((isEdit || isActivate) && (loadingStudent || !formReady)) {
    if (asDialog) {
      return (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="sm:max-w-lg">
            <p className="py-8 text-center text-muted-foreground">Loading student…</p>
          </DialogContent>
        </Dialog>
      );
    }
    return (
      <div className="w-full px-4 sm:px-6 lg:px-8 py-12 text-center text-muted-foreground">
        Loading student…
      </div>
    );
  }

  if (!isEdit && !isActivate && !isDirect && !sessionId && !asDialog) {
    return (
      <div className="w-full px-4 sm:px-6 lg:px-8 py-12 space-y-3 text-center">
        <Button variant="outline" asChild>
          <Link to={listHref}>{listBackLabel}</Link>
        </Button>
      </div>
    );
  }

  const formBody = (
    <div className={cn(asDialog ? "space-y-6" : "space-y-10")}>
      {!asDialog && (
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-6">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" className="gap-1.5 -ml-2 mb-2" asChild>
            <Link to={isEdit ? detailHref : listHref}>
              <ArrowLeft className="h-4 w-4" /> {isEdit ? "Back to student" : listBackLabel}
            </Link>
          </Button>
          <h2 className="font-display text-xl sm:text-2xl font-semibold text-primary">
            {isActivate
              ? "Complete admission & activate"
              : isDirect
                ? "Register student"
              : isEdit
                ? "Edit student"
                : "Register new student"}
          </h2>
          {isActivate && !existingStudent && (
            <p className="text-sm text-muted-foreground">
              Confirm student details, assign section and subjects, then activate.
            </p>
          )}
          {isDirect && (
            <p className="text-sm text-muted-foreground">
              Complete the student profile, assign section and subjects, then register.
            </p>
          )}
        </div>
      </div>
      )}

      {isActivate && existingStudent ? (
        <ActivateSummaryBanner student={existingStudent} />
      ) : null}

      <div className={cn((isActivate || isDirect) ? "space-y-6" : "space-y-10")}>
        <section className={sectionShellClass(isActivate || isDirect)}>
          <SectionTitle
            description={
              isActivate
                ? "Verify and complete the student profile before activation."
                : isDirect
                  ? "Enter the full student profile for walk-in registration."
                  : undefined
            }
          >
            1. Student information
          </SectionTitle>
          <div className="flex justify-center pb-2">
            <div className="flex flex-col items-center gap-2 shrink-0">
              <div className="h-28 w-28 rounded-full border-2 border-dashed border-border bg-muted flex items-center justify-center overflow-hidden">
                {photoPreview ? (
                  <img src={photoPreview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-10 w-10 text-muted-foreground" />
                )}
              </div>
              <input
                id="student-photo-input"
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="sr-only"
                onChange={onPickPhoto}
              />
              <Label htmlFor="student-photo-input" className="cursor-pointer text-xs text-accent hover:underline">
                {photoPreview ? "Change photo" : "Upload photo"}
              </Label>
              {photoFile ? (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-destructive"
                  onClick={clearPhoto}
                >
                  Remove selection
                </button>
              ) : null}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <FormField label="Student name" required>
              <IconInput
                icon={User}
                placeholder="e.g. Ali Ahmed Khan"
                value={form.studentName}
                onChange={(e) => setForm((f) => ({ ...f, studentName: e.target.value }))}
              />
            </FormField>
            <FormField label="Father's name" required>
              <IconInput
                icon={Users}
                placeholder="e.g. Muhammad Ahmed Khan"
                value={form.fatherName}
                onChange={(e) => setForm((f) => ({ ...f, fatherName: e.target.value }))}
              />
            </FormField>
            <FormField label="Date of birth" required>
              <IconInput
                icon={Calendar}
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
              />
            </FormField>
            <FormField label="Nationality">
              <IconInput
                icon={Globe}
                placeholder="Pakistan"
                value={form.nationality}
                onChange={(e) => setForm((f) => ({ ...f, nationality: e.target.value }))}
              />
            </FormField>
            <FormField label="Gender" required>
              <IconSelect
                icon={Users}
                value={form.gender}
                onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </IconSelect>
            </FormField>
            <FormField label="Student email">
              <IconInput
                icon={Mail}
                type="email"
                placeholder="student@email.com"
                value={form.studentEmail}
                onChange={(e) => setForm((f) => ({ ...f, studentEmail: e.target.value }))}
              />
            </FormField>
            {isEdit && (
              <FormField label="Status">
                <IconSelect
                  icon={User}
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as typeof f.status }))}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                </IconSelect>
              </FormField>
            )}
          </div>
        </section>

        <section className={sectionShellClass(isActivate || isDirect)}>
          <SectionTitle
            description={isAccountsEnrollment ? "Guardian contact details only — parent portal logins are created from Users." : undefined}
          >
            2. Guardian information
          </SectionTitle>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <FormField label="Guardian name">
              <IconInput
                icon={User}
                placeholder="Guardian full name"
                value={form.guardianName}
                onChange={(e) => setForm((f) => ({ ...f, guardianName: e.target.value }))}
              />
            </FormField>
            <FormField label="Relation with student">
              <IconInput
                icon={Heart}
                placeholder="e.g. Father, Uncle, Mother"
                value={form.guardianRelation}
                onChange={(e) => setForm((f) => ({ ...f, guardianRelation: e.target.value }))}
              />
            </FormField>
            <FormField
              label="Father / Guardian CNIC no."
              error={cnicError}
            >
              <IconInput
                icon={IdCard}
                type="tel"
                inputMode="numeric"
                placeholder="35201-1234567-1"
                maxLength={15}
                className={cn(cnicError && "border-destructive")}
                value={form.fatherGuardianCnic}
                onChange={(e) => setForm((f) => ({ ...f, fatherGuardianCnic: formatCnicInput(e.target.value) }))}
                onBlur={() => setFieldTouched((t) => ({ ...t, fatherGuardianCnic: true }))}
              />
            </FormField>
            <FormField label="Occupation">
              <IconInput
                icon={Briefcase}
                placeholder="e.g. Business, Teacher"
                value={form.guardianOccupation}
                onChange={(e) => setForm((f) => ({ ...f, guardianOccupation: e.target.value }))}
              />
            </FormField>
            <FormField label="Official / work address">
              <IconInput
                icon={Building2}
                placeholder="Office or workplace address"
                value={form.guardianWorkAddress}
                onChange={(e) => setForm((f) => ({ ...f, guardianWorkAddress: e.target.value }))}
              />
            </FormField>
            <FormField label="Guardian email" required={!isEdit && !isAccountsEnrollment}>
              <IconInput
                icon={Mail}
                type="email"
                placeholder="guardian@email.com"
                value={form.guardianEmail}
                onChange={(e) => setForm((f) => ({ ...f, guardianEmail: e.target.value }))}
              />
            </FormField>
            {!isEdit && !isAccountsEnrollment && (
            <FormField label="Parent login password" required>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type={showParentPassword ? "text" : "password"}
                  className="pl-9 pr-10"
                  placeholder="Minimum 8 characters"
                  value={form.parentPassword}
                  onChange={(e) => setForm((f) => ({ ...f, parentPassword: e.target.value }))}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
                  onClick={() => setShowParentPassword((p) => !p)}
                  aria-label={showParentPassword ? "Hide password" : "Show password"}
                >
                  {showParentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </FormField>
            )}
          </div>
        </section>

        <section className={sectionShellClass(isActivate || isDirect)}>
          <SectionTitle>3. Contact & address</SectionTitle>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <FormField label="Mobile no." required error={mobileError}>
              <IconInput
                icon={Smartphone}
                type="tel"
                inputMode="numeric"
                placeholder="03XX-XXXXXXX"
                maxLength={12}
                className={cn(mobileError && "border-destructive")}
                value={form.mobileNo}
                onChange={(e) => setForm((f) => ({ ...f, mobileNo: formatMobileInput(e.target.value) }))}
                onBlur={() => setFieldTouched((t) => ({ ...t, mobileNo: true }))}
              />
            </FormField>
            <FormField label="Contact no. (residence)" error={contactError}>
              <IconInput
                icon={Phone}
                type="tel"
                inputMode="numeric"
                placeholder="042-XXXXXXX"
                maxLength={11}
                className={cn(contactError && "border-destructive")}
                value={form.contactPhoneRes}
                onChange={(e) => setForm((f) => ({ ...f, contactPhoneRes: formatLandlineInput(e.target.value) }))}
                onBlur={() => setFieldTouched((t) => ({ ...t, contactPhoneRes: true }))}
              />
            </FormField>
            <FormField label="Postal address" className="sm:col-span-2 lg:col-span-3">
              <IconTextarea
                icon={MapPin}
                rows={2}
                placeholder="House no., street, area, city"
                value={form.postalAddress}
                onChange={(e) => setForm((f) => ({ ...f, postalAddress: e.target.value }))}
              />
            </FormField>
            <FormField label="Permanent address" className="sm:col-span-2 lg:col-span-3">
              <IconTextarea
                icon={Home}
                rows={2}
                placeholder="Permanent home address (if different)"
                value={form.permanentAddress}
                onChange={(e) => setForm((f) => ({ ...f, permanentAddress: e.target.value }))}
              />
            </FormField>
          </div>
        </section>

        <section className={sectionShellClass(isActivate || isDirect)}>
          <SectionTitle>4. Previous school / college</SectionTitle>
          <FormField label="Student current school / college">
            <IconInput
              icon={School}
              placeholder="Name of current or last attended school"
              value={form.currentSchoolCollege}
              onChange={(e) => setForm((f) => ({ ...f, currentSchoolCollege: e.target.value }))}
            />
          </FormField>
        </section>

        <section className={sectionShellClass(isActivate || isDirect)}>
          <div className="flex items-center justify-between gap-2">
            <SectionTitle>5. Academic history</SectionTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => setForm((f) => ({ ...f, academicHistory: [...f.academicHistory, emptyAcademicRow()] }))}
            >
              <Plus className="h-3.5 w-3.5" /> Add row
            </Button>
          </div>
          <div className="overflow-x-auto border rounded-md">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left p-2">Institution</th>
                  <th className="text-left p-2">Class</th>
                  <th className="text-left p-2">Total</th>
                  <th className="text-left p-2">Obtained</th>
                  <th className="text-left p-2">%</th>
                  <th className="text-left p-2">Year</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {form.academicHistory.map((row, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="p-1">
                      <Input className="h-8 text-xs" placeholder="School name" value={row.institutionName} onChange={(e) => updateAcademic(i, { institutionName: e.target.value })} />
                    </td>
                    <td className="p-1">
                      <Input className="h-8 text-xs" placeholder="Class" value={row.className} onChange={(e) => updateAcademic(i, { className: e.target.value })} />
                    </td>
                    <td className="p-1">
                      <Input className="h-8 text-xs" type="number" min={0} placeholder="Total" value={row.totalMarks} onChange={(e) => updateAcademic(i, { totalMarks: e.target.value })} />
                    </td>
                    <td className="p-1">
                      <Input className="h-8 text-xs" type="number" min={0} placeholder="Obtained" value={row.obtainedMarks} onChange={(e) => updateAcademic(i, { obtainedMarks: e.target.value })} />
                    </td>
                    <td className="p-1">
                      <Input className="h-8 text-xs" type="number" min={0} max={100} placeholder="%" value={row.percentage} onChange={(e) => updateAcademic(i, { percentage: e.target.value })} />
                    </td>
                    <td className="p-1">
                      <Input className="h-8 text-xs" placeholder="Year" value={row.year} onChange={(e) => updateAcademic(i, { year: e.target.value })} />
                    </td>
                    <td className="p-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setForm((f) => ({
                          ...f,
                          academicHistory: f.academicHistory.length > 1
                            ? f.academicHistory.filter((_, j) => j !== i)
                            : [emptyAcademicRow()],
                        }))}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={sectionShellClass(isActivate || isDirect, true)}>
          <SectionTitle
            description={
              isActivate
                ? "Assign section, subjects, and review fees before activation."
                : isDirect
                  ? "Assign section, subjects, and review fees before registering."
                  : undefined
            }
          >
            6. Class & subject selection
          </SectionTitle>
          <FormField label="Class" required>
            <IconSelect
              id="enroll-class"
              icon={GraduationCap}
              value={form.classId}
              onChange={(e) => {
                setForm((f) => ({
                  ...f,
                  classId: e.target.value,
                  sectionId: "",
                  discipline: "",
                  selectedSubjects: [],
                  isFullPackage: false,
                }));
                setChoiceSelections({});
              }}
            >
              <option value="">Choose class to enroll…</option>
              {classes.map((c) => (
                <option key={c._id} value={c._id}>{c.className}</option>
              ))}
            </IconSelect>
          </FormField>

          {classDisciplines.length > 0 && (
            <FormField label="Discipline" required>
              <IconSelect
                id="enroll-discipline"
                icon={GraduationCap}
                value={form.discipline}
                onChange={(e) => setForm((f) => ({ ...f, discipline: e.target.value }))}
              >
                <option value="">Choose discipline…</option>
                {classDisciplines.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </IconSelect>
            </FormField>
          )}

          <FormField label="Section" required>
            <IconSelect
              id="enroll-section"
              icon={GraduationCap}
              value={form.sectionId}
              onChange={(e) => {
                setForm((f) => ({
                  ...f,
                  sectionId: e.target.value,
                  selectedSubjects: [],
                  isFullPackage: false,
                }));
                setChoiceSelections({});
              }}
              disabled={!form.classId || sectionsLoading}
            >
              <option value="">{form.classId ? "Choose section…" : "Select class first…"}</option>
              {sections.map((s) => (
                <option key={s._id} value={s._id}>{s.sectionName}</option>
              ))}
            </IconSelect>
          </FormField>

          {form.classId && form.sectionId && (
            <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
              <p className="text-sm font-medium">
                Subjects for {selectedClassName}
              </p>

              <label className="flex items-start gap-3 rounded-md border bg-background p-3 cursor-pointer hover:bg-muted/30">
                <Checkbox
                  checked={form.isFullPackage}
                  onCheckedChange={(v) => selectFullPackage(Boolean(v))}
                  className="mt-0.5"
                />
                <div>
                  <span className="font-medium text-sm">Full package</span>
                </div>
              </label>

              {enrollmentLoading && (
                <p className="text-sm text-muted-foreground">Loading subjects…</p>
              )}

              {!enrollmentLoading && hasChoiceGroups && enrollmentLayout && (
                <>
                  {form.isFullPackage && enrollmentLayout.coreSubjects.length > 0 && (
                    <div className="space-y-2 rounded-md border bg-background p-3">
                      <p className="text-sm font-medium">Included in full package</p>
                      <div className="flex flex-wrap gap-2">
                        {enrollmentLayout.coreSubjects.map((s) => (
                          <span
                            key={s._id}
                            className="inline-flex items-center rounded-full border bg-muted/30 px-3 py-1 text-sm"
                          >
                            {s.subjectName}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {enrollmentLayout.choiceGroups.map((group) => (
                    <div key={group._id} className="space-y-2 rounded-md border bg-background p-3">
                      <p className="text-sm font-medium">{group.groupName}</p>
                      <div className="grid sm:grid-cols-2 gap-2">
                        {group.subjects.map((s) => {
                          const selected = choiceSelections[group._id] === s._id;
                          return (
                            <label
                              key={s._id}
                              className={`flex items-center gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                                selected ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                              }`}
                            >
                              <Checkbox
                                checked={selected}
                                onCheckedChange={(checked) =>
                                  toggleGroupChoice(group._id, s._id, checked === true)
                                }
                              />
                              <div>
                                <p className="font-medium text-sm">{s.subjectName}</p>
                                <p className="text-xs text-muted-foreground">{s.subjectCode}</p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {!subjectSelectionValid && (
                    <p className="text-sm text-destructive">
                      {form.isFullPackage
                        ? "Pick one subject from each group above."
                        : "Select at least one subject. From each group, you may enroll in only one subject."}
                    </p>
                  )}
                </>
              )}

              {!form.isFullPackage && (
                <div className="space-y-4">
                  {!enrollmentLoading && hasChoiceGroups && enrollmentLayout && (
                    <>
                      {enrollmentLayout.coreSubjects.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Subjects to enroll</p>
                          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {enrollmentLayout.coreSubjects.map((s) => {
                              const selected = form.selectedSubjects.includes(s._id);
                              return (
                                <label
                                  key={s._id}
                                  className={`flex items-center gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                                    selected ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                                  }`}
                                >
                                  <Checkbox
                                    checked={selected}
                                    onCheckedChange={() => toggleSubject(s._id)}
                                  />
                                  <div>
                                    <p className="font-medium text-sm">{s.subjectName}</p>
                                    <p className="text-xs text-muted-foreground">{s.subjectCode}</p>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {!enrollmentLoading && !hasChoiceGroups && (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Or select one or more subjects (checkboxes):
                      </p>
                      {(enrollmentLayout?.coreSubjects.length ?? 0) === 0 ? (
                        <p className="text-sm text-amber-700 dark:text-amber-400">
                          No subjects found for this class. Add subjects in the Subjects tab first.
                        </p>
                      ) : (
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                          {(enrollmentLayout?.coreSubjects ?? []).map((s) => {
                            const selected = form.selectedSubjects.includes(s._id);
                            return (
                              <label
                                key={s._id}
                                className={`flex items-center gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                                  selected ? "border-primary bg-primary/5" : "bg-background hover:bg-muted/40"
                                }`}
                              >
                                <Checkbox
                                  checked={selected}
                                  onCheckedChange={() => toggleSubject(s._id)}
                                />
                                <div className="min-w-0">
                                  <p className="font-medium text-sm truncate">{s.subjectName}</p>
                                  <p className="text-xs text-muted-foreground">{s.subjectCode}</p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                      {form.selectedSubjects.length > 0 && (
                        <p className="text-sm font-medium text-primary">
                          {form.selectedSubjects.length} subject{form.selectedSubjects.length > 1 ? "s" : ""} selected
                        </p>
                      )}
                      {!subjectSelectionValid && (enrollmentLayout?.coreSubjects.length ?? 0) > 0 && (
                        <p className="text-sm text-destructive">Select at least one subject or choose full package.</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <FormField label="Monthly fee discount (PKR)">
              <IconInput
                icon={Tag}
                type="number"
                min={0}
                step={1}
                placeholder="0"
                value={form.monthlyFeeDiscount}
                onChange={(e) => setForm((f) => ({ ...f, monthlyFeeDiscount: e.target.value }))}
              />
            </FormField>
            <FormField label="Admission fee discount (PKR)">
              <IconInput
                icon={Tag}
                type="number"
                min={0}
                step={1}
                placeholder="0"
                value={form.admissionFeeDiscount}
                onChange={(e) => setForm((f) => ({ ...f, admissionFeeDiscount: e.target.value }))}
              />
            </FormField>
          </div>

          {feePreview && (
            <div className="rounded-lg border border-accent/30 bg-accent/5 p-4 grid sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Monthly fee</span>
                <p className="font-bold text-lg">₨ {feePreview.monthlyFee.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Admission fee</span>
                <p className="font-bold text-lg">₨ {feePreview.admissionFee.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Subtotal</span>
                <p className="font-bold text-lg">
                  ₨ {(feePreview.subtotal ?? feePreview.monthlyFee + feePreview.admissionFee).toLocaleString()}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Monthly discount</span>
                <p className="font-bold text-lg text-destructive">
                  − ₨ {(feePreview.monthlyFeeDiscount ?? 0).toLocaleString()}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Admission discount</span>
                <p className="font-bold text-lg text-destructive">
                  − ₨ {(feePreview.admissionFeeDiscount ?? 0).toLocaleString()}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Total discount</span>
                <p className="font-bold text-lg text-destructive">
                  − ₨ {(feePreview.discountAmount ?? 0).toLocaleString()}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Total payable</span>
                <p className="font-bold text-lg text-accent">₨ {feePreview.totalFee.toLocaleString()}</p>
              </div>
            </div>
          )}
        </section>

        <div className={cn(
          "flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2",
          (isActivate || isDirect) && "rounded-xl border bg-muted/20 p-4 sm:p-5",
        )}>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            disabled={saveMut.isPending || !canSubmit}
            title={!canSubmit ? submitBlockers.join("; ") : undefined}
            className={cn((isActivate || isDirect) && "gap-2")}
            onClick={() => {
              setFieldTouched({
                fatherGuardianCnic: true,
                mobileNo: true,
                contactPhoneRes: true,
              });
              saveMut.mutate();
            }}
          >
            {saveMut.isPending
              ? "Saving…"
              : isActivate
                ? (
                  <>
                    <CircleCheck className="h-4 w-4" />
                    Activate student
                  </>
                )
                : isDirect
                  ? (
                    <>
                      <CircleCheck className="h-4 w-4" />
                      Register student
                    </>
                  )
                : isEdit
                  ? "Save changes"
                  : "Register & enroll"}
          </Button>
        </div>
      </div>
    </div>
  );

  const credentialsDialog = (
    <Dialog
      open={Boolean(credentials)}
      onOpenChange={(o) => {
        if (!o) {
          setCredentials(null);
          if (asDialog) onOpenChange?.(false);
          else navigate(detailHref);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CircleCheck className="h-5 w-5 text-primary" />
            {isDirect ? "Student registered" : "Student activated"}
          </DialogTitle>
        </DialogHeader>
        {credentials && (
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border bg-muted/30 p-4 grid sm:grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Student ID</p>
                <p className="font-medium">{credentials.studentId}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Roll number</p>
                <p className="font-medium">{credentials.rollNumber}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Student login</p>
                <p className="font-medium break-all">{credentials.studentEmail}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Student password</p>
                <p className="font-medium">{credentials.studentPassword}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Parent portal access can be set up separately from the Users module.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button
            onClick={() => {
              setCredentials(null);
              if (asDialog) onOpenChange?.(false);
              else navigate(detailHref);
            }}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (asDialog) {
    if (!open) return credentialsDialog;
    return (
      <>
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="sm:max-w-4xl">
            <DialogHeader className="space-y-2">
              <DialogTitle>Complete admission & activate</DialogTitle>
              <DialogDescription>
                Review intake details, complete the profile, assign section and subjects, then activate the student.
              </DialogDescription>
            </DialogHeader>
            {formBody}
          </DialogContent>
        </Dialog>
        {credentialsDialog}
      </>
    );
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-8">
      {formBody}
      {credentialsDialog}
    </div>
  );
}
