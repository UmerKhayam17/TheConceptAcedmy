import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import {
  assignSectionAfterPayment,
  fetchAcademyStudents,
  fetchEnrollmentSubjects,
  fetchSectionsByClass,
  getAcademyStudent,
  prepareEnrollmentVoucher,
  payAcademyFees,
  previewFees,
  printFeeChallan,
  type AcademyFeeRecord,
  type AcademyStudent,
  type FeePreview,
} from "@/lib/studentManagementApi";
import { formatPkr } from "./studentDisplayUtils";
import { cn } from "@/lib/utils";

type Step = "student" | "subjects" | "voucher" | "pay" | "section";

function studentLabel(s: AcademyStudent) {
  const className =
    typeof s.classId === "object" && s.classId?.className ? s.classId.className : "";
  const ref = s.registrationNumber || s.studentId || s.rollNumber || "";
  return [s.studentName, className, ref].filter(Boolean).join(" · ");
}

function classIdOf(s: AcademyStudent | null | undefined) {
  if (!s?.classId) return "";
  return typeof s.classId === "object" ? s.classId._id : String(s.classId);
}

export function EnrollmentVoucherWizard({
  open,
  onOpenChange,
  initialStudentId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefill a provisional student (e.g. from registration activate). */
  initialStudentId?: string | null;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("student");
  const [studentId, setStudentId] = useState(initialStudentId || "");
  const [search, setSearch] = useState("");
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [isFullPackage, setIsFullPackage] = useState(false);
  const [monthlyDiscount, setMonthlyDiscount] = useState("0");
  const [admissionDiscount, setAdmissionDiscount] = useState("0");
  const [voucher, setVoucher] = useState<AcademyFeeRecord | null>(null);
  const [fees, setFees] = useState<FeePreview | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [gender, setGender] = useState("");

  useEffect(() => {
    if (!open) return;
    setStep(initialStudentId ? "subjects" : "student");
    setStudentId(initialStudentId || "");
    setSearch("");
    setSelectedSubjects([]);
    setIsFullPackage(false);
    setMonthlyDiscount("0");
    setAdmissionDiscount("0");
    setVoucher(null);
    setFees(null);
    setPaymentMethod("cash");
    setPaymentNotes("");
    setSectionId("");
    setGender("");
  }, [open, initialStudentId]);

  const { data: pendingPage, isLoading: studentsLoading } = useQuery({
    queryKey: ["enrollment-voucher-pending-students", search],
    queryFn: () =>
      fetchAcademyStudents({ status: "pending_fee", search: search || undefined, limit: 50, page: 1 }),
    enabled: open && step === "student",
  });

  const { data: student, isLoading: studentLoading } = useQuery({
    queryKey: ["enrollment-voucher-student", studentId],
    queryFn: () => getAcademyStudent(studentId),
    enabled: open && Boolean(studentId) && step !== "student",
  });

  const classId = classIdOf(student);

  useEffect(() => {
    if (student?.gender) setGender(student.gender);
  }, [student?.gender]);

  const { data: layout, isLoading: layoutLoading } = useQuery({
    queryKey: ["enrollment-subjects", classId, "no-section"],
    queryFn: () => fetchEnrollmentSubjects(classId),
    enabled: open && Boolean(classId) && (step === "subjects" || step === "voucher"),
  });

  const { data: preview } = useQuery({
    queryKey: [
      "enrollment-fee-preview",
      classId,
      selectedSubjects.join(","),
      isFullPackage,
      monthlyDiscount,
      admissionDiscount,
    ],
    queryFn: () =>
      previewFees({
        classId,
        selectedSubjects,
        isFullPackage,
        monthlyFeeDiscount: Number(monthlyDiscount) || 0,
        admissionFeeDiscount: Number(admissionDiscount) || 0,
      }),
    enabled:
      open &&
      Boolean(classId) &&
      step === "subjects" &&
      (isFullPackage || selectedSubjects.length > 0),
  });

  const { data: sections = [], isLoading: sectionsLoading } = useQuery({
    queryKey: ["enrollment-sections", classId],
    queryFn: () => fetchSectionsByClass(classId, { status: "active" }),
    enabled: open && Boolean(classId) && step === "section",
  });

  const coreSubjects = layout?.coreSubjects || [];
  const choiceGroups = layout?.choiceGroups || [];

  const toggleSubject = (id: string, opts?: { keepFullPackage?: boolean }) => {
    if (!opts?.keepFullPackage) setIsFullPackage(false);
    setSelectedSubjects((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const generateMut = useMutation({
    mutationFn: () =>
      prepareEnrollmentVoucher(studentId, {
        classId,
        selectedSubjects,
        isFullPackage,
        monthlyFeeDiscount: Number(monthlyDiscount) || 0,
        admissionFeeDiscount: Number(admissionDiscount) || 0,
        gender: gender || undefined,
      }),
    onSuccess: (result) => {
      setVoucher(result.voucher);
      setFees(result.fees);
      setStep("voucher");
      qc.invalidateQueries({ queryKey: ["academy-fees"] });
      qc.invalidateQueries({ queryKey: ["academy-students"] });
      toast({
        title: "Unpaid voucher generated",
        description: result.voucher
          ? `Challan ${result.voucher.receiptNumber || result.voucher._id} · ${formatPkr(result.voucher.amount)}`
          : "Enrollment fee locked for this student.",
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const payMut = useMutation({
    mutationFn: () => {
      if (!voucher?._id) throw new Error("No voucher to pay");
      return payAcademyFees({
        feeRecordIds: [voucher._id],
        paymentMethod,
        notes: paymentNotes.trim() || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academy-fees"] });
      qc.invalidateQueries({ queryKey: ["academy-fee-history"] });
      setStep("section");
      toast({ title: "Payment recorded", description: "Assign a section to activate the student." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const assignMut = useMutation({
    mutationFn: () =>
      assignSectionAfterPayment(studentId, {
        sectionId,
        classId,
        gender: gender || undefined,
        phone: student?.phone,
      }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["academy-students"] });
      qc.invalidateQueries({ queryKey: ["academy-fees"] });
      toast({
        title: "Student activated",
        description: `${result.student.studentName} · ${result.credentials.studentId}`,
      });
      onOpenChange(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const printMut = useMutation({
    mutationFn: () => printFeeChallan(studentId, "a4"),
    onError: (e: Error) =>
      toast({ title: "Could not print", description: e.message, variant: "destructive" }),
  });

  const canGenerate =
    Boolean(studentId && classId) &&
    (isFullPackage || selectedSubjects.length > 0) &&
    !generateMut.isPending;

  const stepTitle = useMemo(() => {
    switch (step) {
      case "student":
        return "Select student";
      case "subjects":
        return "Select subjects";
      case "voucher":
        return "Unpaid voucher";
      case "pay":
        return "Record payment";
      case "section":
        return "Assign section";
      default:
        return "Enrollment voucher";
    }
  }, [step]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{stepTitle}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Generate unpaid voucher first, mark paid, then assign section.
          </p>
        </DialogHeader>

        {step === "student" ? (
          <div className="space-y-3">
            <div>
              <Label>Search pending-fee students</Label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, registration no…"
                className="mt-1"
              />
            </div>
            <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
              {studentsLoading ? (
                <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : (pendingPage?.students || []).length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">No pending-fee students found.</div>
              ) : (
                (pendingPage?.students || []).map((s) => (
                  <button
                    key={s._id}
                    type="button"
                    className={cn(
                      "w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50",
                      studentId === s._id && "bg-blue-50",
                    )}
                    onClick={() => {
                      setStudentId(s._id);
                      setStep("subjects");
                    }}
                  >
                    {studentLabel(s)}
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}

        {step === "subjects" ? (
          <div className="space-y-3">
            {studentLoading ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading student…
              </div>
            ) : student ? (
              <p className="text-sm font-medium text-[#0B2347]">{studentLabel(student)}</p>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Gender</Label>
                <select
                  className="mt-1 h-9 w-full rounded-md border px-2 text-sm"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                >
                  <option value="">Select…</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            {layoutLoading ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading subjects…
              </div>
            ) : (
              <>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={isFullPackage}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setIsFullPackage(checked);
                      if (checked && layout) {
                        setSelectedSubjects(layout.coreSubjects.map((s) => s._id));
                      }
                    }}
                  />
                  Full package
                </label>

                <div className="space-y-1.5 max-h-48 overflow-y-auto rounded-md border p-2">
                  {coreSubjects.map((s) => (
                    <label key={s._id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={isFullPackage || selectedSubjects.includes(s._id)}
                        disabled={isFullPackage}
                        onChange={() => toggleSubject(s._id)}
                      />
                      {s.subjectName}
                    </label>
                  ))}
                  {choiceGroups.map((g) => (
                    <div key={g._id} className="pt-2 border-t">
                      <p className="text-xs font-semibold text-slate-500 mb-1">
                        {g.groupName} (pick {g.pickCount})
                      </p>
                      {g.subjects.map((s) => (
                        <label key={s._id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={selectedSubjects.includes(s._id)}
                            onChange={() => toggleSubject(s._id, { keepFullPackage: isFullPackage })}
                          />
                          {s.subjectName}
                        </label>
                      ))}
                    </div>
                  ))}
                  {!coreSubjects.length && !choiceGroups.length ? (
                    <p className="text-xs text-muted-foreground">No subjects configured for this class.</p>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Monthly discount</Label>
                    <Input
                      type="number"
                      min={0}
                      value={monthlyDiscount}
                      onChange={(e) => setMonthlyDiscount(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Admission discount</Label>
                    <Input
                      type="number"
                      min={0}
                      value={admissionDiscount}
                      onChange={(e) => setAdmissionDiscount(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>

                {preview ? (
                  <div className="rounded-md bg-slate-50 px-3 py-2 text-sm space-y-0.5">
                    <div className="flex justify-between">
                      <span>Monthly</span>
                      <span>{formatPkr(preview.monthlyFee)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Admission</span>
                      <span>{formatPkr(preview.admissionFee)}</span>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <span>First voucher</span>
                      <span>{formatPkr((preview.monthlyFee || 0) + (preview.admissionFee || 0))}</span>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {step === "voucher" ? (
          <div className="space-y-3 text-sm">
            {student ? <p className="font-medium">{studentLabel(student)}</p> : null}
            <div className="rounded-md border bg-amber-50 border-amber-100 px-3 py-3 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Unpaid</p>
              <p className="text-lg font-bold text-[#0B2347]">
                {formatPkr(voucher?.amount ?? fees?.totalFee ?? 0)}
              </p>
              {voucher?.receiptNumber ? (
                <p className="text-xs text-slate-500">Receipt {voucher.receiptNumber}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!studentId || printMut.isPending}
                onClick={() => printMut.mutate()}
              >
                {printMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Print challan
              </Button>
              <Button type="button" onClick={() => setStep("pay")} disabled={!voucher}>
                Mark as paid
              </Button>
            </div>
          </div>
        ) : null}

        {step === "pay" ? (
          <div className="space-y-3">
            <div>
              <Label>Payment method</Label>
              <select
                className="mt-1 h-9 w-full rounded-md border px-2 text-sm"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="online">Online</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <Label>Notes</Label>
              <Input
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                className="mt-1"
                placeholder="Optional"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Amount: <span className="font-semibold text-foreground">{formatPkr(voucher?.amount || 0)}</span>
            </p>
          </div>
        ) : null}

        {step === "section" ? (
          <div className="space-y-3">
            {student ? <p className="text-sm font-medium">{studentLabel(student)}</p> : null}
            <div>
              <Label>Gender</Label>
              <select
                className="mt-1 h-9 w-full rounded-md border px-2 text-sm"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
              >
                <option value="">Select…</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <Label>Section</Label>
              {sectionsLoading ? (
                <div className="mt-2 text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading sections…
                </div>
              ) : (
                <select
                  className="mt-1 h-9 w-full rounded-md border px-2 text-sm"
                  value={sectionId}
                  onChange={(e) => setSectionId(e.target.value)}
                >
                  <option value="">Select section…</option>
                  {sections.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.sectionName}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          {step !== "student" && step !== "section" ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (step === "subjects") setStep(initialStudentId ? "subjects" : "student");
                else if (step === "voucher") setStep("subjects");
                else if (step === "pay") setStep("voucher");
              }}
            >
              Back
            </Button>
          ) : null}

          {step === "subjects" ? (
            <Button type="button" disabled={!canGenerate} onClick={() => generateMut.mutate()}>
              {generateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Generate unpaid voucher
            </Button>
          ) : null}

          {step === "pay" ? (
            <Button type="button" disabled={payMut.isPending || !voucher} onClick={() => payMut.mutate()}>
              {payMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Confirm payment
            </Button>
          ) : null}

          {step === "section" ? (
            <Button
              type="button"
              disabled={!sectionId || !gender || assignMut.isPending}
              onClick={() => assignMut.mutate()}
            >
              {assignMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Assign section &amp; activate
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Standalone section assignment after an enrollment voucher was paid outside the wizard. */
export function AssignSectionDialog({
  open,
  onOpenChange,
  studentId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string | null;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [sectionId, setSectionId] = useState("");
  const [gender, setGender] = useState("");

  const { data: student } = useQuery({
    queryKey: ["assign-section-student", studentId],
    queryFn: () => getAcademyStudent(studentId!),
    enabled: open && Boolean(studentId),
  });

  const classId = classIdOf(student);

  useEffect(() => {
    if (!open) return;
    setSectionId("");
    setGender(student?.gender || "");
  }, [open, student?.gender]);

  const { data: sections = [], isLoading } = useQuery({
    queryKey: ["assign-section-list", classId],
    queryFn: () => fetchSectionsByClass(classId, { status: "active" }),
    enabled: open && Boolean(classId),
  });

  const mut = useMutation({
    mutationFn: () =>
      assignSectionAfterPayment(studentId!, {
        sectionId,
        classId,
        gender: gender || undefined,
        phone: student?.phone,
      }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["academy-students"] });
      qc.invalidateQueries({ queryKey: ["academy-fees"] });
      toast({
        title: "Student activated",
        description: `${result.student.studentName} · ${result.credentials.studentId}`,
      });
      onOpenChange(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open && Boolean(studentId)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign section</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Enrollment fee is paid. Choose a section to activate the student.
          </p>
        </DialogHeader>
        {student ? <p className="text-sm font-medium">{studentLabel(student)}</p> : null}
        <div className="space-y-3">
          <div>
            <Label>Gender</Label>
            <select
              className="mt-1 h-9 w-full rounded-md border px-2 text-sm"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
            >
              <option value="">Select…</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <Label>Section</Label>
            {isLoading ? (
              <div className="mt-2 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (
              <select
                className="mt-1 h-9 w-full rounded-md border px-2 text-sm"
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
              >
                <option value="">Select section…</option>
                {sections.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.sectionName}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            disabled={!sectionId || !gender || mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Assign section &amp; activate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
