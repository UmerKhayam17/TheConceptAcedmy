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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { ModuleActionCaps } from "@/lib/permissions";
import { fetchAcademyClasses, fetchFeeStructureByClass, registerProvisionalStudent } from "@/lib/studentManagementApi";
import { formatMobileInput, isValidMobile, mobileValidationMessage } from "@/lib/pkFieldFormat";
import { formatDate, formatPkr } from "./studentDisplayUtils";

const emptyForm = {
  studentName: "",
  fatherName: "",
  phone: "",
  dateOfBirth: "",
  classId: "",
  discipline: "",
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
  const classDisciplines = selectedClass?.disciplines ?? [];

  useEffect(() => {
    if (!open) {
      setForm(emptyForm);
      setPhoneTouched(false);
    }
  }, [open]);

  const saveMut = useMutation({
    mutationFn: () =>
      registerProvisionalStudent({
        studentName: form.studentName.trim(),
        fatherName: form.fatherName.trim(),
        phone: form.phone.trim(),
        dateOfBirth: form.dateOfBirth,
        classId: form.classId,
        discipline: form.discipline || undefined,
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

  const phoneError = phoneTouched ? mobileValidationMessage(form.phone) : null;

  const canSubmit =
    (caps.canCreate || caps.canEdit)
    && form.studentName.trim()
    && form.fatherName.trim()
    && isValidMobile(form.phone)
    && form.dateOfBirth
    && form.classId
    && (classDisciplines.length === 0 || Boolean(form.discipline));

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
            <Label htmlFor="intake-student-name">Student name</Label>
            <Input
              id="intake-student-name"
              placeholder="Enter student's full name"
              value={form.studentName}
              onChange={(e) => setForm((f) => ({ ...f, studentName: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="intake-father-name">Father name</Label>
            <Input
              id="intake-father-name"
              placeholder="Enter father's full name"
              value={form.fatherName}
              onChange={(e) => setForm((f) => ({ ...f, fatherName: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="intake-phone">Phone number</Label>
            <Input
              id="intake-phone"
              type="tel"
              inputMode="numeric"
              placeholder="03XX-XXXXXXX"
              maxLength={12}
              className={phoneError ? "border-destructive" : undefined}
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: formatMobileInput(e.target.value) }))}
              onBlur={() => setPhoneTouched(true)}
            />
            {phoneError && <p className="text-xs text-destructive">{phoneError}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="intake-dob">Date of birth</Label>
            <Input
              id="intake-dob"
              type="date"
              value={form.dateOfBirth}
              onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="intake-class">Class</Label>
            <select
              id="intake-class"
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm font-sans"
              value={form.classId}
              onChange={(e) => setForm((f) => ({ ...f, classId: e.target.value, discipline: "" }))}
            >
              <option value="">Choose class…</option>
              {classes.map((c) => (
                <option key={c._id} value={c._id}>{c.className}</option>
              ))}
            </select>
          </div>

          {classDisciplines.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="intake-discipline">Discipline</Label>
              <select
                id="intake-discipline"
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm font-sans"
                value={form.discipline}
                onChange={(e) => setForm((f) => ({ ...f, discipline: e.target.value }))}
              >
                <option value="">Choose discipline…</option>
                {classDisciplines.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          )}

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
            disabled={!canSubmit || saveMut.isPending}
            onClick={() => {
              setPhoneTouched(true);
              const err = mobileValidationMessage(form.phone);
              if (err) {
                toast({ title: "Invalid phone number", description: err, variant: "destructive" });
                return;
              }
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
