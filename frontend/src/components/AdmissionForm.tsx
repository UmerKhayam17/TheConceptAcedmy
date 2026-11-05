import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";

const schema = z.object({
  studentName: z.string().trim().min(2, "Student name is required").max(100),
  fatherName: z.string().trim().min(2, "Father's name is required").max(100),
  program: z.string().trim().min(2, "Please select a program/class").max(100),
  phone: z
    .string()
    .trim()
    .min(7, "Enter a valid phone number")
    .max(20)
    .regex(/^[0-9+\-\s()]+$/, "Phone may contain only numbers and + - ( )"),
  email: z.string().trim().email("Enter a valid email").max(255),
  message: z.string().trim().max(1000).optional().or(z.literal("")),
});

type FormState = z.infer<typeof schema>;
type Errors = Partial<Record<keyof FormState, string>>;

const initial: FormState = {
  studentName: "",
  fatherName: "",
  program: "",
  phone: "",
  email: "",
  message: "",
};

const AdmissionForm = () => {
  const [data, setData] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  const update = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setData((d) => ({ ...d, [k]: e.target.value }));
    if (errors[k]) setErrors((er) => ({ ...er, [k]: undefined }));
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = schema.safeParse(data);
    if (!result.success) {
      const errs: Errors = {};
      result.error.issues.forEach((i) => {
        const k = i.path[0] as keyof FormState;
        errs[k] = i.message;
      });
      setErrors(errs);
      toast({ title: "Please fix the highlighted fields", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      setData(initial);
      toast({
        title: "Application received",
        description: "Thank you! Our admissions team will reach out within 24 hours.",
      });
    }, 800);
  };

  const field = (k: keyof FormState) =>
    errors[k] ? "border-destructive focus-visible:ring-destructive" : "";

  return (
    <form onSubmit={onSubmit} className="grid gap-5 md:grid-cols-2" noValidate>
      <div>
        <Label htmlFor="studentName">Student Name *</Label>
        <Input id="studentName" value={data.studentName} onChange={update("studentName")} className={field("studentName")} maxLength={100} />
        {errors.studentName && <p className="text-xs text-destructive mt-1">{errors.studentName}</p>}
      </div>
      <div>
        <Label htmlFor="fatherName">Father's Name *</Label>
        <Input id="fatherName" value={data.fatherName} onChange={update("fatherName")} className={field("fatherName")} maxLength={100} />
        {errors.fatherName && <p className="text-xs text-destructive mt-1">{errors.fatherName}</p>}
      </div>
      <div>
        <Label htmlFor="program">Program / Class *</Label>
        <select
          id="program"
          value={data.program}
          onChange={update("program")}
          className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${field("program")}`}
        >
          <option value="">Select A Program…</option>
          <optgroup label="School">
            <option>Pre-Nursery To Class 5</option>
            <option>Class 6 To 8</option>
            <option>Matric (9–10)</option>
          </optgroup>
          <optgroup label="College">
            <option>FSc Pre-Medical</option>
            <option>FSc Pre-Engineering</option>
            <option>ICS / I.Com / FA</option>
          </optgroup>
          <optgroup label="Academy">
            <option>MDCAT Preparation</option>
            <option>ECAT Preparation</option>
            <option>O / A Levels Coaching</option>
            <option>CSS / PMS Foundation</option>
          </optgroup>
        </select>
        {errors.program && <p className="text-xs text-destructive mt-1">{errors.program}</p>}
      </div>
      <div>
        <Label htmlFor="phone">Phone Number *</Label>
        <Input id="phone" type="tel" value={data.phone} onChange={update("phone")} className={field("phone")} maxLength={20} placeholder="03xx-xxxxxxx" />
        {errors.phone && <p className="text-xs text-destructive mt-1">{errors.phone}</p>}
      </div>
      <div className="md:col-span-2">
        <Label htmlFor="email">Email Address *</Label>
        <Input id="email" type="email" value={data.email} onChange={update("email")} className={field("email")} maxLength={255} />
        {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
      </div>
      <div className="md:col-span-2">
        <Label htmlFor="message">Message (optional)</Label>
        <Textarea id="message" rows={4} value={data.message} onChange={update("message")} className={field("message")} maxLength={1000} placeholder="Tell us anything we should know about the applicant…" />
        {errors.message && <p className="text-xs text-destructive mt-1">{errors.message}</p>}
      </div>
      <div className="md:col-span-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-2">
        <p className="text-xs text-muted-foreground">By submitting, you agree to be contacted by our admissions team.</p>
        <Button type="submit" variant="hero" size="lg" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit Application"}
        </Button>
      </div>
    </form>
  );
};

export default AdmissionForm;
