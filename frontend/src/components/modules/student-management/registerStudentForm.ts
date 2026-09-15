import { formatCnicInput, formatLandlineInput, formatMobileInput } from "@/lib/pkFieldFormat";
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
  parentPassword: "",
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
  discipline: "",
  isFullPackage: false,
  selectedSubjects: [] as string[],
  discountAmount: "",
  monthlyFeeDiscount: "",
  admissionFeeDiscount: "",
  status: "active" as const,
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
    parentPassword: "",
    studentEmail: student.studentEmail || "",
    postalAddress: student.postalAddress || student.address || "",
    contactPhoneRes: formatLandlineInput(student.contactPhoneRes || ""),
    mobileNo: formatMobileInput(student.phone || ""),
    permanentAddress: student.permanentAddress || "",
    currentSchoolCollege: student.currentSchoolCollege || "",
    academicHistory: history,
    gender: student.gender || "male",
    classId: resolveClassId(student.classId),
    sectionId: typeof student.sectionId === "object" && student.sectionId ? student.sectionId._id : String(student.sectionId || ""),
    discipline: student.discipline || "",
    isFullPackage: student.isFullPackage ?? false,
    selectedSubjects: resolveSubjectIds(student.selectedSubjects),
    discountAmount: String(student.discountAmount ?? 0),
    monthlyFeeDiscount: String(student.monthlyFeeDiscount ?? 0),
    admissionFeeDiscount: String(student.admissionFeeDiscount ?? 0),
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
    discipline: form.discipline.trim(),
    selectedSubjects: form.selectedSubjects,
    isFullPackage: form.isFullPackage,
    monthlyFeeDiscount: Number(form.monthlyFeeDiscount) || 0,
    admissionFeeDiscount: Number(form.admissionFeeDiscount) || 0,
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
