import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type AcademyAssessmentRecord,
  type AssessmentType,
  ASSESSMENT_TYPE_LABELS,
  TEST_TYPE_KEYS,
  fetchSubjectsByClass,
} from "@/lib/studentManagementApi";
import { clampMarksInput, validateObtainedVsTotal } from "@/lib/marksValidation";
import { useToast } from "@/hooks/use-toast";

const TYPES = TEST_TYPE_KEYS;

export default function AssessmentFormDialog({
  open,
  onOpenChange,
  classId,
  initial,
  onSubmit,
  loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  classId: string;
  initial?: AcademyAssessmentRecord | null;
  onSubmit: (body: {
    subjectId?: string;
    title: string;
    assessmentType: AssessmentType;
    examDate: string;
    totalMarks: number;
    obtainedMarks: number;
    remarks?: string;
  }) => void;
  loading?: boolean;
}) {
  const { toast } = useToast();
  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [assessmentType, setAssessmentType] = useState<AssessmentType>("weekly");
  const [examDate, setExamDate] = useState(new Date().toISOString().slice(0, 10));
  const [obtained, setObtained] = useState("");
  const [total, setTotal] = useState("20");
  const [remarks, setRemarks] = useState("");
  const [marksError, setMarksError] = useState<string | null>(null);

  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects", classId],
    queryFn: () => fetchSubjectsByClass(classId, { status: "active" }),
    enabled: open && !!classId,
  });

  useEffect(() => {
    if (!open) return;
    setMarksError(null);
    if (initial) {
      const sid =
        typeof initial.subjectId === "object"
          ? initial.subjectId?._id
          : initial.subjectId || "";
      setSubjectId(sid || "");
      setTitle(initial.title || "");
      setAssessmentType((initial.assessmentType as AssessmentType) || "weekly");
      setExamDate(initial.examDate ? initial.examDate.slice(0, 10) : "");
      setObtained(String(initial.obtainedMarks ?? ""));
      setTotal(String(initial.totalMarks ?? ""));
      setRemarks(initial.remarks || "");
    } else {
      setSubjectId("");
      setTitle("");
      setAssessmentType("weekly");
      setExamDate(new Date().toISOString().slice(0, 10));
      setObtained("");
      setTotal("20");
      setRemarks("");
    }
  }, [open, initial]);

  const syncMarksError = (nextObtained: string, nextTotal: string) => {
    if (nextObtained.trim() === "" || nextTotal.trim() === "") {
      setMarksError(null);
      return;
    }
    setMarksError(validateObtainedVsTotal(Number(nextObtained), Number(nextTotal)));
  };

  const handleSave = () => {
    if (!title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    const t = Number(total);
    const o = Number(obtained);
    const err = validateObtainedVsTotal(o, t);
    if (err) {
      setMarksError(err);
      toast({ title: "Invalid marks", description: err, variant: "destructive" });
      return;
    }
    onSubmit({
      subjectId: subjectId || undefined,
      title: title.trim(),
      assessmentType,
      examDate,
      totalMarks: t,
      obtainedMarks: o,
      remarks: remarks.trim() || undefined,
    });
  };

  const totalNum = Number(total);
  const maxObtained = Number.isFinite(totalNum) && totalNum > 0 ? totalNum : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit test" : "Add test / assessment"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="space-y-1">
            <Label>Subject</Label>
            <Select value={subjectId || "_none"} onValueChange={(v) => setSubjectId(v === "_none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select subject" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— General —</SelectItem>
                {subjects.map((s) => (
                  <SelectItem key={s._id} value={s._id}>
                    {s.subjectName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Chapter 3 quiz" />
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={assessmentType} onValueChange={(v) => setAssessmentType(v as AssessmentType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {ASSESSMENT_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Date</Label>
            <Input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Obtained</Label>
              <Input
                type="number"
                min={0}
                max={maxObtained}
                step="any"
                value={obtained}
                onChange={(e) => {
                  const next = maxObtained != null
                    ? clampMarksInput(e.target.value, maxObtained)
                    : e.target.value;
                  setObtained(next);
                  syncMarksError(next, total);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label>Total</Label>
              <Input
                type="number"
                min={1}
                step="any"
                value={total}
                onChange={(e) => {
                  const nextTotal = e.target.value;
                  setTotal(nextTotal);
                  const max = Number(nextTotal);
                  if (Number.isFinite(max) && max >= 0 && obtained !== "") {
                    const clamped = clampMarksInput(obtained, max);
                    setObtained(clamped);
                    syncMarksError(clamped, nextTotal);
                  } else {
                    syncMarksError(obtained, nextTotal);
                  }
                }}
              />
            </div>
          </div>
          {marksError ? <p className="text-xs text-destructive">{marksError}</p> : null}
          <div className="space-y-1">
            <Label>Remarks</Label>
            <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="hero" onClick={handleSave} disabled={loading || Boolean(marksError)}>
            {loading ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
