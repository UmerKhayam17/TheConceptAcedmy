import { formatCnicInput, formatMobileInput } from "@/lib/pkFieldFormat";
import type { AcademicRecord, AcademyStudent } from "@/lib/studentManagementApi";
import { resolveClassId, resolveSubjectIds } from "./studentDisplayUtils";

export type AcademicRow = {
  institutionName: string;
  className: string;
  totalMarks: string;
  obtainedMarks: string;
  percentage: string;
  year: string;
};

export const emptyAcademicRow = (): AcademicRow => ({
  institutionName: "",
  className: "",
  totalMarks: "",
  obtainedMarks: "",
  percentage: "",
  year: "",
});

export type FeeReliefType = "" | "concession" | "exemption";

/**
 * FeeReliefType plus "legacy": a monthly discount saved before relief types existed
 * (no category, no reason). Its PKR amount is kept as is and it is never sent back as a type.
 */
export type FeeReliefKind = FeeReliefType | "legacy";

/** Discount as a rounded % of the monthly fee (display only, never saved). */
export function indicativePercent(amount: number, monthlyFee: number): number {
  const fee = Number(monthlyFee) || 0;
  if (!fee || !(amount > 0)) return 0;
  return Math.round((amount / fee) * 100);
}

/** Suggested exemption reasons (registration form + Student Fee modal); custom text is also allowed. */
export const EXEMPTION_REMARKS = [
  "Full Fee Waiver",
  "Financial Hardship",
  "Orphan",
  "Staff Child",
  "Sibling",
  "Merit / Position Holder",
  "Management Approval",
  "Principal Approval",
];

/** Active relief; a monthly discount with no type and no category is a legacy discount. */
export function studentFeeRelief(student: AcademyStudent): FeeReliefKind {
  if (student.feeReliefType) return student.feeReliefType;
  if (student.concessionCategory) return "concession";
  if (Number(student.monthlyFeeDiscount) > 0) return "legacy";
  return "";
}

/**
 * Readable tuition relief for display, e.g. "Concession: Sibling (20%)" / "Exemption: Orphan".
 * `categoryNames` maps concession keys to names; falls back to the key.
 */
export function feeReliefSummary(
  student: AcademyStudent,
  categoryNames: Record<string, string> = {},
): { type: FeeReliefKind; typeLabel: string; detail: string; amount: number } {
  const type = studentFeeRelief(student);
  const monthly = Number(student.monthlyFee) || 0;
  const disc = Number(student.monthlyFeeDiscount) || 0;
  const amount = type ? (monthly ? Math.min(disc, monthly) : disc) : 0;
  let detail = "";
  if (type === "concession") {
    const key = student.concessionCategory || "";
    const name = key ? categoryNames[key] || key : "";
    const pct = Number(student.concessionPercent) || 0;
    detail = name ? `${name}${pct ? ` (${pct}%)` : ""}` : pct ? `${pct}%` : "No category (old discount)";
  } else if (type === "exemption") {
    detail = student.exemptionRemarks || "";
  } else if (type === "legacy") {
    const pct = indicativePercent(amount, monthly);
    detail = pct ? `\u2248${pct}% of current fee (indicative)` : "";
  }
  const typeLabel =
    type === "concession"
      ? "Concession"
      : type === "exemption"
        ? "Exemption"
        : type === "legacy"
          ? "Legacy discount"
          : "";
  return { type, typeLabel, detail, amount };
}

export const defaultRegisterForm = () => ({
  studentName: "",
  fatherName: "",
  dateOfBirth: "",
  nationality: "Pakistan",
  guardianName: "",
  guardianRelation: "",
  fatherGuardianCnic: "",
  guardianOccupation: "",
  guardianWorkAddress: "",
  guardianEmail: "",
  parentPassword: "Concept@1234",
  studentEmail: "",
  postalAddress: "",
  contactPhoneRes: "",
  mobileNo: "",
  permanentAddress: "",
  currentSchoolCollege: "",
  academicHistory: [emptyAcademicRow()],
  gender: "male",
  classId: "",
  sectionId: "",
  disciplineId: "",
  isFullPackage: false,
  selectedSubjects: [] as string[],
  discountAmount: "",
  monthlyFeeDiscount: "",
  admissionFeeDiscount: "",
  /** What parent pays for monthly tuition (discount = list − this). */
  monthlyPayable: "",
  /** What parent pays for admission (discount = list − this). */
  admissionPayable: "",
  /** Tuition relief: a concession (category %) OR an exemption (amount + reason) — never both. */
  feeReliefType: "" as FeeReliefKind,
  /** PKR / month off tuition for the chosen relief (becomes monthlyFeeDiscount). */
  reliefAmount: "0",
  concessionCategory: "",
  concessionPercent: "0",
  exemptionRemarks: "",
  /** True once staff touch the relief fields — only then are they sent (keeps old discounts as-is). */
  reliefDirty: false,
  defaultChargeIds: [] as string[],
  status: "active" as "active" | "inactive" | "suspended" | "pending_fee",
});

export function mapStudentToForm(student: AcademyStudent) {
  const history =
    student.academicHistory?.length
      ? student.academicHistory.map((r) => ({
          institutionName: r.institutionName || "",
          className: r.className || "",
          totalMarks: r.totalMarks != null ? String(r.totalMarks) : "",
          obtainedMarks: r.obtainedMarks != null ? String(r.obtainedMarks) : "",
          percentage: r.percentage != null ? String(r.percentage) : "",
          year: r.year || "",
        }))
      : [emptyAcademicRow()];

  return {
    studentName: student.studentName || "",
    fatherName: student.fatherName || "",
    dateOfBirth: student.dateOfBirth ? student.dateOfBirth.slice(0, 10) : "",
    nationality: student.nationality || "Pakistan",
    guardianName: student.guardianName || "",
    guardianRelation: student.guardianRelation || "",
    fatherGuardianCnic: formatCnicInput(student.fatherGuardianCnic || ""),
    guardianOccupation: student.guardianOccupation || "",
    guardianWorkAddress: student.guardianWorkAddress || "",
    guardianEmail: student.guardianEmail || "",
    parentPassword: "Concept@1234",
    studentEmail: student.studentEmail || "",
    postalAddress: student.postalAddress || student.address || "",
    contactPhoneRes: formatMobileInput(student.contactPhoneRes || ""),
    mobileNo: formatMobileInput(student.phone || ""),
    permanentAddress: student.permanentAddress || "",
    currentSchoolCollege: student.currentSchoolCollege || "",
    academicHistory: history,
    gender: student.gender || "male",
    classId: resolveClassId(student.classId),
    sectionId: typeof student.sectionId === "object" && student.sectionId ? student.sectionId._id : String(student.sectionId || ""),
    disciplineId:
      typeof student.disciplineId === "object" && student.disciplineId
        ? student.disciplineId._id
        : String(student.disciplineId || ""),
    isFullPackage: student.isFullPackage ?? false,
    selectedSubjects: resolveSubjectIds(student.selectedSubjects),
    discountAmount: String(student.discountAmount ?? 0),
    monthlyFeeDiscount: String(student.monthlyFeeDiscount ?? 0),
    admissionFeeDiscount: String(student.admissionFeeDiscount ?? 0),
    monthlyPayable: String(
      Math.max(0, (Number(student.monthlyFee) || 0) - (Number(student.monthlyFeeDiscount) || 0)),
    ),
    admissionPayable: String(
      Math.max(0, (Number(student.admissionFee) || 0) - (Number(student.admissionFeeDiscount) || 0)),
    ),
    feeReliefType: studentFeeRelief(student),
    reliefAmount: String(studentFeeRelief(student) ? student.monthlyFeeDiscount ?? 0 : 0),
    concessionCategory: student.concessionCategory || "",
    concessionPercent: String(student.concessionPercent ?? 0),
    exemptionRemarks: student.exemptionRemarks || "",
    reliefDirty: false,
    defaultChargeIds: (student.defaultChargeIds || []).map((id) =>
      typeof id === "object" && id && "_id" in id ? String((id as { _id: string })._id) : String(id),
    ),
    status: (student.status as "active" | "inactive" | "suspended" | "pending_fee") || "active",
  };
}

export function buildStudentPayload(form: ReturnType<typeof defaultRegisterForm>) {
  return {
    studentName: form.studentName.trim(),
    fatherName: form.fatherName.trim(),
    dateOfBirth: form.dateOfBirth,
    nationality: form.nationality.trim() || "Pakistan",
    guardianName: form.guardianName.trim(),
    guardianRelation: form.guardianRelation.trim(),
    fatherGuardianCnic: form.fatherGuardianCnic.trim(),
    guardianOccupation: form.guardianOccupation.trim(),
    guardianWorkAddress: form.guardianWorkAddress.trim(),
    guardianEmail: form.guardianEmail.trim(),
    ...(form.parentPassword.trim() ? { parentPassword: form.parentPassword.trim() } : {}),
    studentEmail: form.studentEmail.trim(),
    postalAddress: form.postalAddress.trim(),
    contactPhoneRes: form.contactPhoneRes.trim(),
    mobileNo: form.mobileNo.trim(),
    permanentAddress: form.permanentAddress.trim(),
    currentSchoolCollege: form.currentSchoolCollege.trim(),
    academicHistory: toAcademicPayload(form.academicHistory),
    gender: form.gender,
    classId: form.classId,
    sectionId: form.sectionId,
    ...(form.disciplineId ? { disciplineId: form.disciplineId } : {}),
    selectedSubjects: form.selectedSubjects,
    isFullPackage: form.isFullPackage,
    monthlyFeeDiscount: Number(form.monthlyFeeDiscount) || 0,
    admissionFeeDiscount: Number(form.admissionFeeDiscount) || 0,
    // A legacy discount is never sent as a relief type — only its amount (monthlyFeeDiscount).
    ...(form.reliefDirty && form.feeReliefType !== "legacy"
      ? {
          feeReliefType: form.feeReliefType,
          concessionCategory: form.feeReliefType === "concession" ? form.concessionCategory : "",
          concessionPercent: form.feeReliefType === "concession" ? Number(form.concessionPercent) || 0 : 0,
          exemptionRemarks: form.feeReliefType === "exemption" ? form.exemptionRemarks.trim() : "",
        }
      : {}),
    defaultChargeIds: form.defaultChargeIds,
    status: form.status,
  };
}

export function toAcademicPayload(rows: AcademicRow[]): AcademicRecord[] {
  return rows
    .filter((r) => r.institutionName.trim() || r.className.trim() || r.year.trim())
    .map((r) => ({
      institutionName: r.institutionName.trim(),
      className: r.className.trim(),
      totalMarks: r.totalMarks ? Number(r.totalMarks) : undefined,
      obtainedMarks: r.obtainedMarks ? Number(r.obtainedMarks) : undefined,
      percentage: r.percentage ? Number(r.percentage) : undefined,
      year: r.year.trim(),
    }));
}
