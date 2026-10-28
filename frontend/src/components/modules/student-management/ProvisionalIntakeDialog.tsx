import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DateDmYInput } from "@/components/ui/date-dmy-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { ModuleActionCaps } from "@/lib/permissions";
import { fetchAcademyClasses, fetchFeeStructureByClass, registerProvisionalStudent } from "@/lib/studentManagementApi";
import { formatMobileInput, isValidMobile, mobileValidationMessage } from "@/lib/pkFieldFormat";
import ClassProgramSelect from "@/components/modules/ClassProgramSelect";
import { cn, localYmd } from "@/lib/utils";
import { formatDate, formatPkr } from "./studentDisplayUtils";

const emptyForm = {
  studentName: "",
  fatherName: "",
  phone: "",
  dateOfBirth: "",
  gender: "",
  classId: "",
  description: "",
};

export default function ProvisionalIntakeDialog({
  open,
  onOpenChange,
  caps,
  sessionId = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caps: ModuleActionCaps;
  sessionId?: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [showSubmitErrors, setShowSubmitErrors] = useState(false);

  const { data: classes = [] } = useQuery({
    queryKey: ["academy-classes", sessionId],
    queryFn: () => fetchAcademyClasses({ status: "active", sessionId: sessionId || undefined }),
    enabled: open && Boolean(sessionId),
  });

  const { data: feeStructure, isLoading: feeLoading } = useQuery({
    queryKey: ["academy-fee-structure", form.classId],
    queryFn: () => fetchFeeStructureByClass(form.classId),
    enabled: open && Boolean(form.classId),
  });

  const selectedClass = classes.find((c) => c._id === form.classId);

  useEffect(() => {
    if (!open) {
      setForm(emptyForm);
      setPhoneTouched(false);
      setShowSubmitErrors(false);
    }
  }, [open]);

  const saveMut = useMutation({
    mutationFn: () =>
      registerProvisionalStudent({
        studentName: form.studentName.trim(),
        fatherName: form.fatherName.trim(),
        phone: form.phone.trim(),
        dateOfBirth: form.dateOfBirth,
        gender: form.gender,
        classId: form.classId,
        description: form.description.trim() || undefined,
      }),
    onSuccess: (student) => {
      qc.invalidateQueries({ queryKey: ["academy-students"] });
      toast({
        title: "Admission intake saved",
        description: `Temp roll ${student.rollNumber ?? "—"} · Created ${formatDate(student.createdAt)}. Send family to accounts.`,
      });
      onOpenChange(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const submitBlockers = (() => {
    const missing: { message: string; fieldId: string }[] = [];
    if (!(caps.canCreate || caps.canEdit)) {
      missing.push({ message: "You do not have permission to save intake", fieldId: "intake-student-name" });
    }
    if (!form.studentName.trim()) {
      missing.push({ message: "Student name is required", fieldId: "intake-student-name" });
    }
    if (!form.fatherName.trim()) {
      missing.push({ message: "Father name is required", fieldId: "intake-father-name" });
    }
    if (!isValidMobile(form.phone)) {
      missing.push({
        message: mobileValidationMessage(form.phone) || "Mobile number is required",
        fieldId: "intake-phone",
      });
    }
    if (!form.dateOfBirth) {
      missing.push({ message: "Date of birth is required", fieldId: "intake-dob" });
    }
    if (!form.gender) {
      missing.push({ message: "Gender is required", fieldId: "intake-gender" });
    }
    if (!form.classId) {
      missing.push({ message: "Class is required", fieldId: "intake-class" });
    }
    return missing;
  })();

  const canSubmit = submitBlockers.length === 0;

  const fieldErrors = (() => {
    if (!showSubmitErrors) return {} as Record<string, string>;
    const map: Record<string, string> = {};
    for (const b of submitBlockers) map[b.fieldId] = b.message;
    return map;
  })();

  const fieldErr = (fieldId: string) => fieldErrors[fieldId] ?? null;

  const phoneError =
    fieldErr("intake-phone")
    ?? (phoneTouched ? mobileValidationMessage(form.phone) : null);

  const scrollToField = (fieldId: string) => {
    const el = document.getElementById(fieldId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => el.focus?.(), 280);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) setForm(emptyForm);
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md cms-portal font-sans"
        onClose={() => handleOpenChange(false)}
      >
        <DialogHeader>
          <DialogTitle>Admission intake</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label
              htmlFor="intake-student-name"
              className={cn(fieldErr("intake-student-name") && "text-destructive")}
            >
              Student name
            </Label>
            <Input
              id="intake-student-name"
              placeholder="Enter student's full name"
              className={cn(fieldErr("intake-student-name") && "border-destructive")}
              value={form.studentName}
              onChange={(e) => setForm((f) => ({ ...f, studentName: e.target.value }))}
            />
            {fieldErr("intake-student-name") ? (
              <p className="text-xs text-destructive">{fieldErr("intake-student-name")}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="intake-father-name"
              className={cn(fieldErr("intake-father-name") && "text-destructive")}
            >
              Father name
            </Label>
            <Input
              id="intake-father-name"
              placeholder="Enter father's full name"
              className={cn(fieldErr("intake-father-name") && "border-destructive")}
              value={form.fatherName}
              onChange={(e) => setForm((f) => ({ ...f, fatherName: e.target.value }))}
            />
            {fieldErr("intake-father-name") ? (
              <p className="text-xs text-destructive">{fieldErr("intake-father-name")}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="intake-phone" className={cn(phoneError && "text-destructive")}>
              Phone number
            </Label>
            <Input
              id="intake-phone"
              type="tel"
              inputMode="numeric"
              placeholder="03XX-XXXXXXX"
              maxLength={12}
              className={cn(phoneError && "border-destructive")}
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: formatMobileInput(e.target.value) }))}
              onBlur={() => setPhoneTouched(true)}
            />
            {phoneError ? <p className="text-xs text-destructive">{phoneError}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="intake-dob"
              className={cn(fieldErr("intake-dob") && "text-destructive")}
            >
              Date of birth
            </Label>
            <DateDmYInput
              id="intake-dob"
              value={form.dateOfBirth}
              onChange={(iso) => setForm((f) => ({ ...f, dateOfBirth: iso }))}
              maxIso={localYmd()}
              className={cn(fieldErr("intake-dob") && "[&_input]:border-destructive")}
            />
            {fieldErr("intake-dob") ? (
              <p className="text-xs text-destructive">{fieldErr("intake-dob")}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Format: dd/mm/yyyy</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="intake-gender"
              className={cn(fieldErr("intake-gender") && "text-destructive")}
            >
              Gender
            </Label>
            <select
              id="intake-gender"
              className={cn(
                "w-full h-10 rounded-md border border-input bg-background px-3 text-sm font-sans",
                fieldErr("intake-gender") && "border-destructive",
              )}
              value={form.gender}
              onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
            >
              <option value="">Select gender…</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
            {fieldErr("intake-gender") ? (
              <p className="text-xs text-destructive">{fieldErr("intake-gender")}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="intake-class"
              className={cn(fieldErr("intake-class") && "text-destructive")}
            >
              Class
            </Label>
            <ClassProgramSelect
              id="intake-class"
              label={false}
              className="w-full"
              selectClassName={cn(fieldErr("intake-class") && "border-destructive")}
              value={form.classId}
              onChange={(v) => setForm((f) => ({ ...f, classId: v }))}
              classes={classes}
              emptyLabel="Choose class…"
            />
            {fieldErr("intake-class") ? (
              <p className="text-xs text-destructive">{fieldErr("intake-class")}</p>
            ) : null}
          </div>

          {form.classId && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <p className="text-xs font-semibold text-primary uppercase tracking-wide">
                Fee structure{selectedClass ? ` · ${selectedClass.className}` : ""}
              </p>
              {feeLoading && (
                <p className="text-sm text-muted-foreground">Loading fees…</p>
              )}
              {!feeLoading && !feeStructure && (
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  No fee structure configured for this class yet. Set it up under Fees structure before activation.
                </p>
              )}
              {!feeLoading && feeStructure && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Per subject (monthly)</p>
                    <p className="font-semibold">{formatPkr(feeStructure.perSubjectFee)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">All subjects (monthly)</p>
                    <p className="font-semibold">{formatPkr(feeStructure.fullPackageFee)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Admission fee</p>
                    <p className="font-semibold">{formatPkr(feeStructure.admissionFee)}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="intake-description">Description</Label>
            <Textarea
              id="intake-description"
              rows={3}
              placeholder="Optional notes for accounts (e.g. sibling discount, special requests)"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="gap-2"
            disabled={saveMut.isPending}
            onClick={() => {
              setPhoneTouched(true);
              if (!canSubmit) {
                setShowSubmitErrors(true);
                const first = submitBlockers[0];
                toast({
                  title: "Missing required fields",
                  description: first?.message
                    ?? submitBlockers.map((b) => b.message).join("; "),
                  variant: "destructive",
                });
                if (first) scrollToField(first.fieldId);
                return;
              }
              setShowSubmitErrors(false);
              saveMut.mutate();
            }}
          >
            <Plus className="h-4 w-4" /> Save intake
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
