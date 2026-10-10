import { parseJson, resolveUploadUrl } from "@/lib/api";

export { resolveUploadUrl };
import { authedFetch } from "@/lib/auth";
import type { CreatedByUser } from "@/lib/createdBy";
import type { AssessmentType } from "./assessmentTaxonomy";

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface AcademyClass {
  _id: string;
  sessionId?: string | { _id: string; name?: string; status?: string };
  className: string;
  totalSubjects: number;
  status: "active" | "inactive";
  createdAt?: string;
  createdBy?: CreatedByUser | string;
}

export interface AcademySubject {
  _id: string;
  subjectName: string;
  subjectCode: string;
  classId: string;
  status: "active" | "inactive";
  /** required = core; choice = elective sharing choiceGroupName with siblings */
  enrollmentType?: "required" | "choice";
  choiceGroupName?: string;
  pickCount?: number;
  createdBy?: CreatedByUser | string;
}

/** Virtual group derived from subjects that share choiceGroupName (not a DB collection). */
export interface AcademySubjectChoiceGroup {
  _id: string;
  classId?: string;
  groupName: string;
  subjectIds: AcademySubject[] | string[];
  pickCount: number;
  status?: "active" | "inactive";
}

export interface EnrollmentSubjectLayout {
  hasChoiceGroups: boolean;
  coreSubjects: AcademySubject[];
  choiceGroups: {
    _id: string;
    groupName: string;
    pickCount: number;
    subjects: AcademySubject[];
  }[];
  disciplineId?: string | null;
  sharedSubjects?: AcademySubject[];
  streamSubjects?: AcademySubject[];
}

export interface AcademyDiscipline {
  _id: string;
  name: string;
  code: string;
  classId: string | { _id: string; className?: string };
  subjectIds: AcademySubject[] | string[];
  status: "active" | "inactive";
  createdAt?: string;
  createdBy?: CreatedByUser | string;
}

export interface AcademyDisciplinesListMeta {
  requiresDiscipline: boolean;
  suggestsDisciplines: boolean;
}

export interface AcademySection {
  _id: string;
  sectionName: string;
  classId: string | AcademyClass;
  useClassSubjects: boolean;
  subjectIds: AcademySubject[] | string[];
  status: "active" | "inactive";
  createdBy?: CreatedByUser | string;
}

export interface AcademyFeeStructure {
  _id: string;
  classId: string | AcademyClass;
  perSubjectFee: number;
  fullPackageFee: number;
  admissionFee: number;
  status: string;
  effectiveDate?: string;
  createdBy?: CreatedByUser | string;
}

export interface AcademicRecord {
  institutionName?: string;
  className?: string;
  totalMarks?: number;
  obtainedMarks?: number;
  percentage?: number;
  year?: string;
}

export type AcademyStudentStatus = "pending_fee" | "active" | "inactive" | "suspended";

export interface AcademyStudentProvisionalBody {
  studentName: string;
  fatherName: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  classId: string;
  description?: string;
}

export interface AcademyStudentRegisterBody {
  studentName: string;
  fatherName: string;
  dateOfBirth: string;
  nationality?: string;
  guardianName?: string;
  guardianRelation?: string;
  fatherGuardianCnic?: string;
  guardianOccupation?: string;
  guardianWorkAddress?: string;
  guardianEmail?: string;
  parentPassword?: string;
  studentEmail?: string;
  postalAddress?: string;
  contactPhoneRes?: string;
  phone?: string;
  mobileNo?: string;
  permanentAddress?: string;
  currentSchoolCollege?: string;
  academicHistory?: AcademicRecord[];
  gender: string;
  classId: string;
  sectionId: string;
  disciplineId?: string;
  selectedSubjects: string[];
  isFullPackage: boolean;
  discountAmount?: number;
  monthlyFeeDiscount?: number;
  admissionFeeDiscount?: number;
}

export interface AcademyStudentActivateBody extends AcademyStudentRegisterBody {
  parentPassword?: string;
  studentPassword?: string;
  paymentMethod?: "cash" | "bank_transfer" | "online" | "other";
  receiptNumber?: string;
  paymentDate?: string;
}

export type AcademyStudentDirectRegisterBody = AcademyStudentActivateBody & {
  studentName: string;
  fatherName: string;
  dateOfBirth: string;
  classId: string;
  sectionId: string;
};

export interface AcademyStudentActivateResult {
  student: AcademyStudent;
  credentials: {
    studentId: string;
    rollNumber: string;
    parentEmail: string;
    parentPassword: string;
    /** @deprecated student portal removed */
    studentEmail?: string;
    studentPassword?: string;
  };
}

export interface AcademyStudent {
  _id: string;
  studentId?: string;
  registrationNumber?: string;
  rollNumber?: string;
  studentName: string;
  photoImage?: string;
  fatherName: string;
  dateOfBirth?: string;
  nationality?: string;
  guardianName?: string;
  guardianRelation?: string;
  fatherGuardianCnic?: string;
  guardianOccupation?: string;
  guardianWorkAddress?: string;
  guardianEmail?: string;
  studentEmail?: string;
  postalAddress?: string;
  contactPhoneRes?: string;
  phone?: string;
  intakeNotes?: string;
  permanentAddress?: string;
  currentSchoolCollege?: string;
  academicHistory?: AcademicRecord[];
  gender?: "male" | "female" | "other";
  address?: string;
  classId: string | AcademyClass;
  sectionId?: string | AcademySection;
  disciplineId?: string | AcademyDiscipline | null;
  selectedSubjects: AcademySubject[] | string[];
  isFullPackage: boolean;
  monthlyFee: number;
  admissionFee: number;
  monthlyFeeDiscount?: number;
  admissionFeeDiscount?: number;
  discountAmount?: number;
  totalFee: number;
  status: AcademyStudentStatus;
  createdAt?: string;
  activatedAt?: string;
  createdBy?: CreatedByUser | string;
}

export interface FeePreview {
  monthlyFee: number;
  admissionFee: number;
  subtotal?: number;
  monthlyFeeDiscount?: number;
  admissionFeeDiscount?: number;
  discountAmount?: number;
  totalFee: number;
  perSubjectFee?: number;
  fullPackageFee?: number;
}

export interface AcademyFeeRecord {
  _id: string;
  studentId: AcademyStudent | string;
  month: number;
  year: number;
  amount: number;
  feeType: "admission" | "monthly" | "stationery";
  status: "pending" | "paid" | "overdue" | "waived";
  dueDate?: string;
  receiptNumber?: string;
  paidAt?: string;
  paymentMethod?: string;
  paymentSlip?: string;
  paymentSlipNumber?: string;
  notes?: string;
  components?: {
    name: string;
    amount: number;
    kind?: "tuition" | "admission" | "charge";
    chargeId?: string;
  }[];
  /** Unpaid monthly vouchers for this student, across every month. */
  unpaidMonthCount?: number;
  unpaidFrom?: string;
  unpaidTo?: string;
}

export interface AcademyTimetableSlot {
  _id: string;
  classId: string;
  subjectId: AcademySubject | string;
  dayOfWeek: number;
  dayName?: string;
  startTime: string;
  endTime: string;
  room?: string;
}

export interface AcademyAttendanceRecord {
  _id: string;
  studentId: string;
  date: string;
  status: "present" | "absent" | "late" | "leave";
  source?: "manual" | "ai";
  checkIn?: string;
  checkOut?: string;
  confidence?: number;
  subjectId?: AcademySubject | string;
  notes?: string;
  createdAt?: string;
}

export interface AcademyAssessmentRecord {
  _id: string;
  studentId: string;
  classTestId?:
  | string
  | {
    _id: string;
    title?: string;
    seriesLabel?: string;
    createdBy?: CreatedByUser | string;
    teacherId?: CreatedByUser | string;
  };
  subjectId?: AcademySubject | string;
  title: string;
  assessmentType: string;
  examDate: string;
  totalMarks: number;
  obtainedMarks: number;
  remarks?: string;
  testPaperImage?: string;
  createdBy?: CreatedByUser | string;
  recordedBy?: CreatedByUser | string;
}

export interface AcademyStudentRecord {
  student: AcademyStudent;
  enrollment: {
    isFullPackage: boolean;
    subjectCount: number;
    classSubjectsTotal: number;
    subjects: AcademySubject[];
  };
  timetable: AcademyTimetableSlot[];
  attendance: {
    summary: {
      present: number;
      absent: number;
      late: number;
      leave: number;
      total: number;
      attendanceRate: number | null;
    };
    records: AcademyAttendanceRecord[];
  };
  fees: {
    summary: {
      recordsCount: number;
      totalPaid: number;
      totalPending: number;
      byStatus: Record<string, number>;
    };
    records: AcademyFeeRecord[];
  };
  assessments: {
    summary: {
      count: number;
      averagePercentage: number | null;
      highestPercentage: number | null;
      lowestPercentage: number | null;
    };
    records: AcademyAssessmentRecord[];
  };
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authedFetch(`/student-management${path}`, init);
  const body = await parseJson<{ success?: boolean; data?: T; message?: string; pagination?: Pagination }>(res);
  if (!res.ok) throw new Error(body.message || `Request failed (${res.status})`);
  return body.data as T;
}

// Classes
export const fetchAcademyClasses = (params?: { search?: string; status?: string; sessionId?: string }) => {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  if (params?.status) q.set("status", params.status);
  if (params?.sessionId) q.set("sessionId", params.sessionId);
  const qs = q.toString();
  return api<AcademyClass[]>(`/classes${qs ? `?${qs}` : ""}`);
};

export const createAcademyClass = (body: {
  sessionId: string;
  className: string;
  totalSubjects?: number;
  status?: string;
}) =>
  api<AcademyClass>("/classes", { method: "POST", body: JSON.stringify(body) });

export const updateAcademyClass = (id: string, body: Partial<AcademyClass>) =>
  api<AcademyClass>(`/classes/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const deleteAcademyClass = (id: string) =>
  api<{ deleted: boolean }>(`/classes/${id}`, { method: "DELETE" });

export interface AcademyClassRecordStudent {
  _id: string;
  studentId: string;
  studentName: string;
  fatherName?: string;
  status: string;
  isFullPackage?: boolean;
  gender?: string;
  phone?: string;
}

export interface AcademyClassRecord {
  class: AcademyClass & { createdAt?: string; createdBy?: { name?: string; email?: string } };
  subjects: AcademySubject[];
  feeStructure: AcademyFeeStructure | null;
  feeStructureHistory: AcademyFeeStructure[];
  students: AcademyClassRecordStudent[];
  classTests: AcademyClassTest[];
  timetable: (AcademyTimetableSlot & { dayName?: string })[];
  stats: {
    subjectCount: number;
    studentCount: number;
    activeStudentCount: number;
    classTestCount: number;
    feeRecordsCount: number;
    totalFeesPaid: number;
    totalFeesPending: number;
  };
}

export const getAcademyClassRecord = (classId: string) =>
  api<AcademyClassRecord>(`/classes/${classId}/record`);

// Subjects
export const fetchSubjectsByClass = (classId: string, params?: { status?: string; sectionId?: string }) => {
  const qp = new URLSearchParams();
  if (params?.status) qp.set("status", params.status);
  if (params?.sectionId) qp.set("sectionId", params.sectionId);
  const q = qp.toString();
  return api<AcademySubject[]>(`/classes/${classId}/subjects${q ? `?${q}` : ""}`);
};

export const fetchEnrollmentSubjects = (
  classId: string,
  sectionId?: string,
  disciplineId?: string,
) => {
  const qp = new URLSearchParams();
  if (sectionId) qp.set("sectionId", sectionId);
  if (disciplineId) qp.set("disciplineId", disciplineId);
  const q = qp.toString();
  return api<EnrollmentSubjectLayout>(`/classes/${classId}/enrollment-subjects${q ? `?${q}` : ""}`);
};

/** Streams across a session, or one class when classId is set. */
export async function fetchAcademyDisciplines(params?: {
  sessionId?: string;
  classId?: string;
  status?: string;
}): Promise<{ data: AcademyDiscipline[]; meta: AcademyDisciplinesListMeta | null }> {
  const qp = new URLSearchParams();
  if (params?.sessionId) qp.set("sessionId", params.sessionId);
  if (params?.classId) qp.set("classId", params.classId);
  if (params?.status) qp.set("status", params.status);
  const q = qp.toString();
  const res = await authedFetch(`/student-management/disciplines${q ? `?${q}` : ""}`);
  const json = await parseJson<{
    success: boolean;
    data: AcademyDiscipline[];
    meta?: AcademyDisciplinesListMeta | null;
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(json.message || `Request failed (${res.status})`);
  return { data: json.data || [], meta: json.meta ?? null };
}

/** Streams for a class (Medical / Engineering / ICS). Empty for 9th/10th until configured. */
export const fetchDisciplinesByClass = (classId: string, params?: { status?: string }) => {
  const q = params?.status ? `?status=${params.status}` : "";
  return api<AcademyDiscipline[]>(`/classes/${classId}/disciplines${q}`);
};

/** Full response with requiresDiscipline / suggestsDisciplines meta. */
export async function fetchDisciplinesByClassWithMeta(
  classId: string,
  params?: { status?: string },
): Promise<{ data: AcademyDiscipline[]; meta: AcademyDisciplinesListMeta }> {
  const q = params?.status ? `?status=${params.status}` : "";
  const res = await authedFetch(`/student-management/classes/${classId}/disciplines${q}`);
  const json = await parseJson<{
    success: boolean;
    data: AcademyDiscipline[];
    meta?: AcademyDisciplinesListMeta;
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(json.message || `Request failed (${res.status})`);
  return {
    data: json.data || [],
    meta: json.meta || { requiresDiscipline: false, suggestsDisciplines: false },
  };
}

export const createAcademyDiscipline = (body: {
  name: string;
  code?: string;
  classId: string;
  subjectIds?: string[];
  status?: "active" | "inactive";
}) => api<AcademyDiscipline>("/disciplines", { method: "POST", body: JSON.stringify(body) });

export const createStandardDisciplines = (classId: string) =>
  api<{
    created: number;
    skipped: number;
    linked?: { code: string; count: number }[];
    suggestsDisciplines: boolean;
    disciplines: AcademyDiscipline[];
  }>(`/classes/${classId}/disciplines/defaults`, { method: "POST" });

export const updateAcademyDiscipline = (
  id: string,
  body: Partial<Pick<AcademyDiscipline, "name" | "code" | "status">> & { subjectIds?: string[] },
) => api<AcademyDiscipline>(`/disciplines/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const deleteAcademyDiscipline = (id: string) =>
  api<{ deleted: boolean }>(`/disciplines/${id}`, { method: "DELETE" });

/** Derived choice groups from subjects (same choiceGroupName within a class). */
export const fetchSubjectChoiceGroups = (classId: string) =>
  api<AcademySubjectChoiceGroup[]>(`/classes/${classId}/choice-groups`);

/** Create several choice subjects at once under one group name. */
export const createBulkChoiceSubjects = (
  classId: string,
  body: {
    groupName: string;
    subjects: { subjectName: string; subjectCode: string }[];
    pickCount?: number;
  },
) =>
  api<{ groupName: string; pickCount: number; subjects: AcademySubject[] }>(
    `/classes/${classId}/subjects/bulk-choice`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );

export const fetchSectionsByClass = (classId: string, params?: { status?: string }) => {
  const q = params?.status ? `?status=${params.status}` : "";
  return api<AcademySection[]>(`/classes/${classId}/sections${q}`);
};

export interface AcademySectionWithClass extends AcademySection {
  className?: string | null;
  sessionName?: string | null;
  sessionId?: string | { _id: string; name?: string } | null;
}

export const fetchAcademySectionsBySession = (
  sessionId?: string,
  params?: { status?: string }
) => {
  const q = new URLSearchParams();
  if (sessionId) q.set("sessionId", sessionId);
  if (params?.status) q.set("status", params.status);
  const qs = q.toString();
  return api<AcademySectionWithClass[]>(`/sections${qs ? `?${qs}` : ""}`);
};

export const createAcademySection = (body: {
  sectionName: string;
  classId: string;
  useClassSubjects?: boolean;
  subjectIds?: string[];
  status?: string;
}) => api<AcademySection>("/sections", { method: "POST", body: JSON.stringify(body) });

export const updateAcademySection = (id: string, body: Partial<AcademySection> & { subjectIds?: string[] }) =>
  api<AcademySection>(`/sections/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const deleteAcademySection = (id: string) =>
  api<{ deleted: boolean }>(`/sections/${id}`, { method: "DELETE" });

export const createAcademySubject = (body: {
  subjectName: string;
  classId: string;
  subjectCode: string;
  status?: string;
  enrollmentType?: "required" | "choice";
  choiceGroupName?: string;
  pickCount?: number;
}) => api<AcademySubject>("/subjects", { method: "POST", body: JSON.stringify(body) });

/** Create standard core subjects for a class (English, Maths, Sciences, …). Idempotent. */
export const createStandardSubjects = (classId: string) =>
  api<{
    created: number;
    skipped: number;
    subjects: AcademySubject[];
  }>(`/classes/${classId}/subjects/defaults`, { method: "POST" });

export const updateAcademySubject = (
  id: string,
  body: Partial<AcademySubject> & {
    enrollmentType?: "required" | "choice";
    choiceGroupName?: string;
    pickCount?: number;
  },
) => api<AcademySubject>(`/subjects/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const deleteAcademySubject = (id: string) =>
  api<{ deleted: boolean }>(`/subjects/${id}`, { method: "DELETE" });

// Fee structure
export const fetchAllFeeStructures = (params?: { status?: string; classId?: string }) => {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.classId) q.set("classId", params.classId);
  const qs = q.toString();
  return api<AcademyFeeStructure[]>(`/fee-structures${qs ? `?${qs}` : ""}`);
};

export const fetchFeeStructureByClass = (classId: string) =>
  api<AcademyFeeStructure | null>(`/fee-structures/class/${classId}`);

export const createFeeStructure = (body: {
  classId: string;
  perSubjectFee: number;
  fullPackageFee: number;
  admissionFee: number;
}) => api<AcademyFeeStructure>("/fee-structures", { method: "POST", body: JSON.stringify(body) });

export const updateFeeStructure = (id: string, body: Partial<AcademyFeeStructure>) =>
  api<AcademyFeeStructure>(`/fee-structures/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const deleteFeeStructure = (id: string) =>
  api<{ deleted: boolean }>(`/fee-structures/${id}`, { method: "DELETE" });

export interface AdditionalChargeRef {
  _id: string;
  className?: string;
  sectionName?: string;
  studentName?: string;
  studentId?: string;
}

export interface AdditionalCharge {
  _id: string;
  name: string;
  amount: number;
  frequency: "every_month" | "selected_months";
  months: number[];
  applicability: "all" | "class" | "students";
  classIds: AdditionalChargeRef[] | string[];
  sectionIds: AdditionalChargeRef[] | string[];
  studentIds: AdditionalChargeRef[] | string[];
  status: "active" | "inactive";
}

export const fetchAdditionalCharges = () => api<AdditionalCharge[]>("/additional-charges");

export const createAdditionalCharge = (body: {
  name: string;
  amount: number;
  frequency: "every_month" | "selected_months";
  months?: number[];
  applicability: "all" | "class" | "students";
  classIds?: string[];
  sectionIds?: string[];
  studentIds?: string[];
  status?: "active" | "inactive";
}) => api<AdditionalCharge>("/additional-charges", { method: "POST", body: JSON.stringify(body) });

export const updateAdditionalCharge = (id: string, body: Partial<{
  name: string;
  amount: number;
  frequency: "every_month" | "selected_months";
  months: number[];
  applicability: "all" | "class" | "students";
  classIds: string[];
  sectionIds: string[];
  studentIds: string[];
  status: "active" | "inactive";
}>) => api<AdditionalCharge>(`/additional-charges/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const deleteAdditionalCharge = (id: string) =>
  api<{ deleted: boolean }>(`/additional-charges/${id}`, { method: "DELETE" });

export const previewFees = (body: {
  classId: string;
  selectedSubjects: string[];
  isFullPackage: boolean;
  discountAmount?: number;
  monthlyFeeDiscount?: number;
  admissionFeeDiscount?: number;
}) =>
  api<FeePreview>("/fee-structures/preview", { method: "POST", body: JSON.stringify(body) });

// Students
export const fetchAcademyStudents = async (params?: {
  page?: number;
  limit?: number;
  search?: string;
  classId?: string;
  sectionId?: string;
  status?: string;
  sessionId?: string;
}) => {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.search) q.set("search", params.search);
  if (params?.classId) q.set("classId", params.classId);
  if (params?.sectionId) q.set("sectionId", params.sectionId);
  if (params?.status) q.set("status", params.status);
  if (params?.sessionId) q.set("sessionId", params.sessionId);
  const res = await authedFetch(`/student-management/students?${q}`);
  const body = await parseJson<{
    success?: boolean;
    data?: AcademyStudent[];
    pagination?: Pagination;
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(body.message || "Failed to load students");
  return { students: body.data || [], pagination: body.pagination };
};

export const registerAcademyStudent = (body: AcademyStudentRegisterBody) =>
  api<AcademyStudent>("/students", { method: "POST", body: JSON.stringify(body) });

export const registerProvisionalStudent = (body: AcademyStudentProvisionalBody) =>
  api<AcademyStudent>("/students/provisional", { method: "POST", body: JSON.stringify(body) });

export async function registerDirectAcademyStudent(body: AcademyStudentDirectRegisterBody) {
  const res = await authedFetch("/student-management/students/direct", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = await parseJson<{
    success?: boolean;
    data?: AcademyStudent;
    credentials?: AcademyStudentActivateResult["credentials"];
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(parsed.message || `Registration failed (${res.status})`);
  return { student: parsed.data!, credentials: parsed.credentials! };
}

export async function activateAcademyStudent(id: string, body: AcademyStudentActivateBody) {
  const res = await authedFetch(`/student-management/students/${id}/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = await parseJson<{
    success?: boolean;
    data?: AcademyStudent;
    credentials?: AcademyStudentActivateResult["credentials"];
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(parsed.message || `Activation failed (${res.status})`);
  return { student: parsed.data!, credentials: parsed.credentials! };
}

export type EnrollmentVoucherBody = {
  classId?: string;
  disciplineId?: string;
  selectedSubjects: string[];
  isFullPackage: boolean;
  discountAmount?: number;
  monthlyFeeDiscount?: number;
  admissionFeeDiscount?: number;
  studentName?: string;
  fatherName?: string;
  phone?: string;
  gender?: string;
  paymentDate?: string;
};

export type EnrollmentVoucherResult = {
  student: AcademyStudent;
  voucher: AcademyFeeRecord | null;
  fees: FeePreview;
};

export async function prepareEnrollmentVoucher(id: string, body: EnrollmentVoucherBody) {
  const res = await authedFetch(`/student-management/students/${id}/enrollment-voucher`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = await parseJson<{
    success?: boolean;
    data?: AcademyStudent;
    voucher?: AcademyFeeRecord | null;
    fees?: FeePreview;
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(parsed.message || `Could not generate voucher (${res.status})`);
  return {
    student: parsed.data!,
    voucher: parsed.voucher ?? null,
    fees: parsed.fees!,
  } satisfies EnrollmentVoucherResult;
}

export type AssignSectionBody = {
  sectionId: string;
  classId?: string;
  studentName?: string;
  fatherName?: string;
  phone?: string;
  gender?: string;
  guardianName?: string;
};

export async function assignSectionAfterPayment(id: string, body: AssignSectionBody) {
  const res = await authedFetch(`/student-management/students/${id}/assign-section`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = await parseJson<{
    success?: boolean;
    data?: AcademyStudent;
    credentials?: AcademyStudentActivateResult["credentials"];
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(parsed.message || `Section assignment failed (${res.status})`);
  return { student: parsed.data!, credentials: parsed.credentials! };
}

export type ParentPortalProvisionRow = {
  studentMongoId: string;
  studentId: string;
  studentName: string;
  parentEmail: string;
  parentPassword: string;
  created: boolean;
};

export type ParentPortalProvisionResult = {
  total: number;
  createdCount: number;
  updatedCount: number;
  defaultPassword: string;
  rows: ParentPortalProvisionRow[];
};

export async function provisionParentPortals(): Promise<ParentPortalProvisionResult> {
  const res = await authedFetch(`/student-management/students/provision-parent-portals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const parsed = await parseJson<{
    success?: boolean;
    data?: ParentPortalProvisionResult;
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(parsed.message || `Provision failed (${res.status})`);
  if (!parsed.data) throw new Error("Invalid provision response");
  return parsed.data;
}

export const updateAcademyStudent = (id: string, body: Record<string, unknown>) =>
  api<AcademyStudent>(`/students/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export async function uploadAcademyStudentPhoto(studentId: string, file: File): Promise<AcademyStudent> {
  const fd = new FormData();
  fd.append("photo", file);
  const res = await authedFetch(`/student-management/students/${studentId}/photo`, {
    method: "POST",
    body: fd,
  });
  const body = await parseJson<{ success?: boolean; data?: AcademyStudent; message?: string }>(res);
  if (!res.ok) throw new Error(body.message || "Photo upload failed");
  if (!body.data) throw new Error("Invalid photo upload response");
  return body.data;
}

export const getAcademyStudent = (id: string) => api<AcademyStudent>(`/students/${id}`);

export const getAcademyStudentRecord = (id: string) =>
  api<AcademyStudentRecord>(`/students/${id}/record`);

export const deleteAcademyStudent = (id: string) =>
  api<{ deleted: boolean; studentId?: string }>(`/students/${id}`, { method: "DELETE" });

export type StudentExportFormat = "xlsx" | "pdf" | "csv";

export const exportStudents = async (
  params?: {
    search?: string;
    classId?: string;
    status?: string;
    sessionId?: string;
  },
  format: StudentExportFormat = "xlsx",
) => {
  const q = new URLSearchParams();
  q.set("format", format);
  if (params?.search) q.set("search", params.search);
  if (params?.classId) q.set("classId", params.classId);
  if (params?.status) q.set("status", params.status);
  if (params?.sessionId) q.set("sessionId", params.sessionId);
  const res = await authedFetch(`/student-management/students/export?${q}`, { method: "GET" });
  if (!res.ok) throw new Error("Export failed");
  return res.blob();
};

/** @deprecated Use exportStudents(params, "csv") */
export const exportStudentsCsv = (params?: {
  search?: string;
  classId?: string;
  status?: string;
  sessionId?: string;
}) => exportStudents(params, "csv");

export interface AcademyFeeSummary {
  recordsCount: number;
  totalPaid: number;
  totalPending: number;
  totalAmount: number;
  byStatus: { pending: number; paid: number; overdue: number; waived: number };
  activeStudents: number;
  previous?: {
    month: number;
    year: number;
    totalPaid: number;
    totalPending: number;
    recordsCount: number;
  } | null;
  trends?: {
    paid: number[];
    pending: number[];
    records: number[];
  };
  oldestPending?: {
    month: number | null;
    year: number | null;
    feeType: string;
    ageMonths: number | null;
  } | null;
}

// Fees
export const fetchAcademyFees = async (params?: {
  page?: number;
  limit?: number;
  status?: string;
  feeType?: string;
  classId?: string;
  sectionId?: string;
  studentId?: string;
  month?: number;
  year?: number;
  sessionId?: string;
  search?: string;
}) => {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.status) q.set("status", params.status);
  if (params?.feeType) q.set("feeType", params.feeType);
  if (params?.classId) q.set("classId", params.classId);
  if (params?.sectionId) q.set("sectionId", params.sectionId);
  if (params?.studentId) q.set("studentId", params.studentId);
  if (params?.month) q.set("month", String(params.month));
  if (params?.year) q.set("year", String(params.year));
  if (params?.sessionId) q.set("sessionId", params.sessionId);
  if (params?.search) q.set("search", params.search);
  const res = await authedFetch(`/student-management/fees?${q}`);
  const body = await parseJson<{
    success?: boolean;
    data?: AcademyFeeRecord[];
    pagination?: Pagination;
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(body.message || "Failed to load fees");
  return { records: body.data || [], pagination: body.pagination };
};

export const fetchAcademyFeeSummary = (params?: {
  month?: number;
  year?: number;
  classId?: string;
  sectionId?: string;
  studentId?: string;
  sessionId?: string;
}) => {
  const q = new URLSearchParams();
  if (params?.month) q.set("month", String(params.month));
  if (params?.year) q.set("year", String(params.year));
  if (params?.classId) q.set("classId", params.classId);
  if (params?.sectionId) q.set("sectionId", params.sectionId);
  if (params?.studentId) q.set("studentId", params.studentId);
  if (params?.sessionId) q.set("sessionId", params.sessionId);
  const qs = q.toString();
  return api<AcademyFeeSummary>(`/fees/summary${qs ? `?${qs}` : ""}`);
};

export type DashboardOverview = {
  generatedAt: string;
  today: string;
  period: { month: number; year: number };
  kpis: {
    activeStudents: number;
    inactiveStudents: number;
    pendingAdmissions: number;
    teacherCount: number;
    accountantCount: number;
    staffCount: number;
    classCount: number;
    sectionCount: number;
    subjectCount: number;
    feesCollectedAll: number;
    feesOutstandingAll: number;
    feesCollectedMonth: number;
    feesOutstandingMonth: number;
    feeVouchersMonth: number;
    expensesMonth: number;
    salaryPendingMonth: number;
    salaryPaidMonth: number;
    netCashMonth: number;
    defaulterCount: number;
    defaulterOutstanding: number;
    presentToday: number;
    lateToday: number;
    absentToday: number;
    leaveToday: number;
    unmarkedToday: number;
    staffPresentToday: number;
    staffAbsentToday: number;
    upcomingExamsCount: number;
    attendanceRateToday: number | null;
  };
  charts: {
    monthlyTrends: {
      label: string;
      month: number;
      year: number;
      feesCollected: number;
      feesPending: number;
      expenses: number;
      salaryPaid: number;
      salaryPending: number;
      attendancePresent: number;
      attendanceAbsent: number;
      attendanceLate: number;
      attendanceLeave: number;
      enrollments: number;
    }[];
    feeStatusMonth: { name: string; value: number; count: number }[];
    attendanceToday: { name: string; value: number }[];
    expensesByCategory: { category: string; total: number; count: number }[];
    studentsByClass: { classId: string | null; className: string; count: number }[];
    genderDistribution: { name: string; value: number }[];
    feesByClass?: {
      classId: string | null;
      className: string;
      assessed: number;
      collected: number;
      outstanding: number;
      pct: number;
    }[];
    paymentMethods?: { key: string; name: string; amount: number; count: number }[];
    revenueByFeeType?: {
      label: string;
      month: number;
      year: number;
      monthly: number;
      admission: number;
      stationery: number;
    }[];
    agingBuckets?: { label: string; amount: number; students: number }[];
    studentPaymentStatus?: { name: string; students: number; pct: number }[];
  };
  widgets: {
    upcomingExams: {
      id: string;
      title: string;
      type?: string;
      status: string;
      startDate: string;
      endDate?: string;
      className: string;
    }[];
    upcomingBirthdays: {
      id: string;
      name: string;
      studentId: string;
      className: string;
      dateOfBirth: string;
      nextBirthday: string;
      daysUntil: number;
      isToday: boolean;
    }[];
    recentAdmissions: {
      id: string;
      name: string;
      studentId: string;
      status: string;
      className: string;
      at: string;
    }[];
    recentPayments: {
      id: string;
      amount: number;
      paidAt: string;
      feeType: string;
      month: number;
      year: number;
      voucherNumber: string;
      paymentMethod?: string;
      studentName: string;
      studentId: string;
    }[];
    recentExpenses?: {
      id: string;
      title: string;
      amount: number;
      expenseDate: string;
      category: string;
      paymentMethod: string;
      vendor: string;
      status: string;
    }[];
    recentSalaries?: {
      id: string;
      amount: number;
      month: number;
      year: number;
      status: string;
      paymentMethod: string;
      paidAt: string | null;
      staffName: string;
    }[];
    recentAnnouncements: {
      id: string;
      title: string;
      at: string;
      audience: string;
    }[];
  };
};

export const fetchDashboardOverview = (months = 6) =>
  api<DashboardOverview>(`/dashboard/overview?months=${months}`);

export interface DiscountReportStaffSummary {
  staffId: string | null;
  staffName: string;
  staffEmail: string;
  studentCount: number;
  monthlyDiscount: number;
  admissionDiscount: number;
  legacyDiscount: number;
  totalDiscount: number;
}

export interface DiscountReportSummary {
  studentCount: number;
  totalMonthlyDiscount: number;
  totalAdmissionDiscount: number;
  totalLegacyDiscount: number;
  totalDiscount: number;
  monthlyOnlyCount: number;
  admissionOnlyCount: number;
  bothCount: number;
  legacyCount: number;
  byStaff: DiscountReportStaffSummary[];
}

export interface DiscountReportRow {
  _id: string;
  studentId: string;
  studentName: string;
  fatherName: string;
  className: string;
  classId?: string;
  monthlyFeeDiscount: number;
  admissionFeeDiscount: number;
  discountAmount: number;
  totalDiscount: number;
  discountType: "monthly_only" | "admission_only" | "both" | "legacy_combined" | "none";
  enrolledAt?: string;
  grantedBy?: { _id: string; name: string; email: string } | null;
}

export const fetchDiscountReport = async (params?: {
  page?: number;
  limit?: number;
  classId?: string;
  search?: string;
  from?: string;
  to?: string;
}) => {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.classId) q.set("classId", params.classId);
  if (params?.search) q.set("search", params.search);
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  const res = await authedFetch(`/student-management/students/discount-report?${q}`);
  const body = await parseJson<{
    success?: boolean;
    data?: DiscountReportRow[];
    summary?: DiscountReportSummary;
    pagination?: Pagination;
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(body.message || "Failed to load discount report");
  return {
    items: body.data || [],
    summary: body.summary,
    pagination: body.pagination,
  };
};

export const generateMonthlyFees = (body: { month: number; year: number; classId?: string }) =>
  api<{ created: number; skipped: number; repaired?: number }>("/fees/generate", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const addStationeryCharge = (body: {
  studentId: string;
  amount: number;
  month?: number;
  year?: number;
  notes?: string;
}) =>
  api<AcademyFeeRecord>("/fees/stationery", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const payAcademyFee = (
  id: string,
  body?: { paymentMethod?: string; paymentSlipNumber?: string; notes?: string; paidAt?: string }
) => api<AcademyFeeRecord>(`/fees/${id}/pay`, { method: "PATCH", body: JSON.stringify(body || {}) });

export async function updateAcademyFee(
  id: string,
  body: {
    amount?: number;
    notes?: string;
    dueDate?: string | null;
    status?: "pending" | "overdue" | "waived";
    paymentMethod?: string;
    paymentSlipNumber?: string;
    paidAt?: string;
    slip?: File | null;
  }
) {
  const fd = new FormData();
  if (body.amount !== undefined) fd.append("amount", String(body.amount));
  if (body.notes !== undefined) fd.append("notes", body.notes);
  if (body.dueDate !== undefined) fd.append("dueDate", body.dueDate ?? "");
  if (body.status !== undefined) fd.append("status", body.status);
  if (body.paymentMethod !== undefined) fd.append("paymentMethod", body.paymentMethod);
  if (body.paymentSlipNumber !== undefined) fd.append("paymentSlipNumber", body.paymentSlipNumber);
  if (body.paidAt !== undefined) fd.append("paidAt", body.paidAt);
  if (body.slip) fd.append("slip", body.slip);
  const res = await authedFetch(`/student-management/fees/${id}`, {
    method: "PATCH",
    body: fd,
  });
  const parsed = await parseJson<{
    success?: boolean;
    data?: AcademyFeeRecord;
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(parsed.message || `Update failed (${res.status})`);
  if (!parsed.data) throw new Error("Update failed");
  return parsed.data;
}

export async function payAcademyFees(body: {
  feeRecordIds: string[];
  paymentMethod?: string;
  paymentSlipNumber?: string;
  notes?: string;
  paidAt?: string;
  slip?: File | null;
}) {
  const fd = new FormData();
  fd.append("feeRecordIds", JSON.stringify(body.feeRecordIds));
  if (body.paymentMethod) fd.append("paymentMethod", body.paymentMethod);
  if (body.paymentSlipNumber !== undefined) fd.append("paymentSlipNumber", body.paymentSlipNumber);
  if (body.notes) fd.append("notes", body.notes);
  if (body.paidAt) fd.append("paidAt", body.paidAt);
  if (body.slip) fd.append("slip", body.slip);
  const res = await authedFetch(`/student-management/fees/pay`, {
    method: "POST",
    body: fd,
  });
  const parsed = await parseJson<{
    success?: boolean;
    data?: { paid: number; total: number; records?: AcademyFeeRecord[] };
    needsSectionAssignment?: boolean;
    studentId?: string;
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(parsed.message || `Payment failed (${res.status})`);
  return {
    paid: parsed.data?.paid ?? 0,
    total: parsed.data?.total ?? 0,
    records: parsed.data?.records,
    needsSectionAssignment: Boolean(parsed.needsSectionAssignment),
    studentId: parsed.studentId ? String(parsed.studentId) : undefined,
  };
}

export type FeeReceiptSize = "a4" | "thermal";

export const fetchFeeReceiptPdf = async (id: string, size: FeeReceiptSize = "a4") => {
  const q = new URLSearchParams({ size });
  const res = await authedFetch(`/student-management/fees/${id}/receipt?${q}`);
  if (!res.ok) {
    const body = await parseJson<{ message?: string }>(res);
    throw new Error(body.message || "Failed to load receipt");
  }
  return res.blob();
};

async function openPdfForPrint(load: () => Promise<Blob>, downloadName: string) {
  const preview = window.open("about:blank", "_blank");
  try {
    const blob = await load();
    const url = URL.createObjectURL(blob);
    if (preview && !preview.closed) {
      preview.location.replace(url);
      window.setTimeout(() => {
        try {
          preview.focus();
          preview.print();
        } catch {
          /* browser PDF viewer */
        }
      }, 800);
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  } catch (err) {
    preview?.close();
    throw err;
  }
}

export function printFeeReceipt(id: string, size: FeeReceiptSize = "a4") {
  return openPdfForPrint(
    () => fetchFeeReceiptPdf(id, size),
    size === "thermal" ? "fee-receipt-thermal.pdf" : "fee-receipt-a4.pdf"
  );
}

export const fetchFeeChallanPdf = async (
  studentId: string,
  size: FeeReceiptSize = "a4",
  months?: number,
  chargeIds?: string[]
) => {
  const q = new URLSearchParams({ size });
  if (months) q.set("months", String(months));
  // Always send chargeIds so the server applies the opt-in selection (empty = none).
  q.set("chargeIds", (chargeIds || []).join(","));
  const res = await authedFetch(`/student-management/fees/challan/${studentId}?${q}`);
  if (!res.ok) {
    const body = await parseJson<{ message?: string }>(res);
    throw new Error(body.message || "Failed to load challan");
  }
  return res.blob();
};

export function printFeeChallan(
  studentId: string,
  size: FeeReceiptSize = "a4",
  months?: number,
  chargeIds?: string[]
) {
  const label = months ? `${months}m` : "unpaid";
  return openPdfForPrint(
    () => fetchFeeChallanPdf(studentId, size, months, chargeIds),
    size === "thermal" ? `fee-challan-${label}-thermal.pdf` : `fee-challan-${label}-a4.pdf`
  );
}

export const applyFeeCharges = (body: { feeRecordIds: string[]; chargeIds: string[] }) =>
  api<AcademyFeeRecord[]>("/fees/apply-charges", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const fetchStudentFeeHistory = (studentId: string) =>
  api<{ student: AcademyStudent; records: AcademyFeeRecord[] }>(`/fees/student/${studentId}`);

export interface FeeDefaulter {
  studentId: string;
  totalDue: number;
  unpaidCount: number;
  overdueCount: number;
  pendingCount: number;
  oldestDueDate?: string;
  daysOverdue: number;
  className?: string | null;
  sectionName?: string | null;
  student: {
    _id: string;
    studentId: string;
    registrationNumber?: string;
    rollNumber?: string;
    studentName: string;
    fatherName: string;
    phone: string;
    classId?: string;
    sectionId?: string;
  };
}

export interface FeeDefaultersSummary {
  defaulterCount: number;
  totalOutstanding: number;
  totalUnpaidVouchers: number;
  overdueVouchers: number;
}

export const fetchFeeDefaulters = async (params?: {
  page?: number;
  limit?: number;
  classId?: string;
  month?: number;
  year?: number;
  search?: string;
  sessionId?: string;
}) => {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.classId) q.set("classId", params.classId);
  if (params?.month) q.set("month", String(params.month));
  if (params?.year) q.set("year", String(params.year));
  if (params?.search) q.set("search", params.search);
  if (params?.sessionId) q.set("sessionId", params.sessionId);
  const res = await authedFetch(`/student-management/fees/defaulters?${q}`);
  const body = await parseJson<{
    success?: boolean;
    data?: FeeDefaulter[];
    pagination?: Pagination;
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(body.message || "Failed to load fee defaulters");
  return { defaulters: body.data || [], pagination: body.pagination };
};

export const fetchFeeDefaultersSummary = (params?: {
  classId?: string;
  month?: number;
  year?: number;
  sessionId?: string;
}) => {
  const q = new URLSearchParams();
  if (params?.classId) q.set("classId", params.classId);
  if (params?.month) q.set("month", String(params.month));
  if (params?.year) q.set("year", String(params.year));
  if (params?.sessionId) q.set("sessionId", params.sessionId);
  const qs = q.toString();
  return api<FeeDefaultersSummary>(`/fees/defaulters/summary${qs ? `?${qs}` : ""}`);
};

export const exportFeeDefaultersCsv = async (params?: {
  classId?: string;
  month?: number;
  year?: number;
  search?: string;
  sessionId?: string;
}) => {
  const q = new URLSearchParams();
  if (params?.classId) q.set("classId", params.classId);
  if (params?.month) q.set("month", String(params.month));
  if (params?.year) q.set("year", String(params.year));
  if (params?.search) q.set("search", params.search);
  if (params?.sessionId) q.set("sessionId", params.sessionId);
  const res = await authedFetch(`/student-management/fees/defaulters/export?${q}`, { method: "GET" });
  if (!res.ok) throw new Error("Export failed");
  return res.blob();
};

export type DefaulterReportFormat = "xlsx" | "pdf";

export const exportFeeDefaultersMonthWise = async (
  params?: {
    classId?: string;
    month?: number;
    year?: number;
    search?: string;
    sessionId?: string;
  },
  format: DefaulterReportFormat = "xlsx"
) => {
  const q = new URLSearchParams();
  q.set("format", format);
  if (params?.classId) q.set("classId", params.classId);
  if (params?.month) q.set("month", String(params.month));
  if (params?.year) q.set("year", String(params.year));
  if (params?.search) q.set("search", params.search);
  if (params?.sessionId) q.set("sessionId", params.sessionId);
  const res = await authedFetch(`/student-management/fees/defaulters/export-month-wise?${q}`, { method: "GET" });
  if (!res.ok) throw new Error("Export failed");
  return res.blob();
};

export type PaidFeeExportParams = {
  classId?: string;
  month?: number;
  year?: number;
  search?: string;
  sessionId?: string;
  feeType?: "admission" | "monthly" | "stationery";
};

export const exportPaidFeesCsv = async (params?: PaidFeeExportParams) => {
  const q = new URLSearchParams();
  if (params?.classId) q.set("classId", params.classId);
  if (params?.month) q.set("month", String(params.month));
  if (params?.year) q.set("year", String(params.year));
  if (params?.search) q.set("search", params.search);
  if (params?.sessionId) q.set("sessionId", params.sessionId);
  if (params?.feeType) q.set("feeType", params.feeType);
  const res = await authedFetch(`/student-management/fees/paid/export?${q}`, { method: "GET" });
  if (!res.ok) throw new Error("Export failed");
  return res.blob();
};

export const exportPaidFeesReport = async (
  params?: PaidFeeExportParams,
  format: DefaulterReportFormat = "xlsx"
) => {
  const q = new URLSearchParams();
  q.set("format", format);
  if (params?.classId) q.set("classId", params.classId);
  if (params?.month) q.set("month", String(params.month));
  if (params?.year) q.set("year", String(params.year));
  if (params?.search) q.set("search", params.search);
  if (params?.sessionId) q.set("sessionId", params.sessionId);
  if (params?.feeType) q.set("feeType", params.feeType);
  const res = await authedFetch(`/student-management/fees/paid/export-report?${q}`, { method: "GET" });
  if (!res.ok) throw new Error("Export failed");
  return res.blob();
};

// Teacher / staff salary
export interface AcademySalaryRecord {
  _id: string;
  staffId: {
    _id: string;
    name: string;
    email?: string;
    phone?: string;
    salary?: number;
    role?: { name: string };
  } | string;
  month: number;
  year: number;
  amount: number;
  status: "pending" | "paid" | "cancelled";
  dueDate?: string;
  paidAt?: string;
  voucherNumber?: string;
  paymentMethod?: string;
  notes?: string;
}

export interface AcademySalarySummary {
  recordsCount: number;
  totalPaid: number;
  totalPending: number;
  byStatus: { pending: number; paid: number; cancelled: number };
  activeStaff: number;
}

export const fetchAcademySalaries = async (params?: {
  page?: number;
  limit?: number;
  status?: string;
  month?: number;
  year?: number;
  roleName?: string;
  staffId?: string;
  search?: string;
}) => {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.status) q.set("status", params.status);
  if (params?.month) q.set("month", String(params.month));
  if (params?.year) q.set("year", String(params.year));
  if (params?.roleName) q.set("roleName", params.roleName);
  if (params?.staffId) q.set("staffId", params.staffId);
  if (params?.search) q.set("search", params.search);
  const res = await authedFetch(`/student-management/salaries?${q}`);
  const body = await parseJson<{
    success?: boolean;
    data?: AcademySalaryRecord[];
    pagination?: Pagination;
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(body.message || "Failed to load salaries");
  return { records: body.data || [], pagination: body.pagination };
};

export const fetchAcademySalarySummary = (params?: {
  month?: number;
  year?: number;
  roleName?: string;
  staffId?: string;
}) => {
  const q = new URLSearchParams();
  if (params?.month) q.set("month", String(params.month));
  if (params?.year) q.set("year", String(params.year));
  if (params?.roleName) q.set("roleName", params.roleName);
  if (params?.staffId) q.set("staffId", params.staffId);
  const qs = q.toString();
  return api<AcademySalarySummary>(`/salaries/summary${qs ? `?${qs}` : ""}`);
};

export const generateMonthlySalaries = (body: {
  month: number;
  year: number;
  roleName?: "teacher" | "accountant";
}) =>
  api<{ created: number; skipped: number }>("/salaries/generate", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const payAcademySalary = (id: string, body?: { paymentMethod?: string; notes?: string }) =>
  api<AcademySalaryRecord>(`/salaries/${id}/pay`, { method: "PATCH", body: JSON.stringify(body || {}) });

// Academy expenses
export type ExpenseCategory =
  | "rent"
  | "utilities"
  | "supplies"
  | "maintenance"
  | "marketing"
  | "transport"
  | "staff_other"
  | "other";

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  rent: "Rent",
  utilities: "Utilities",
  supplies: "Supplies",
  maintenance: "Maintenance",
  marketing: "Marketing",
  transport: "Transport",
  staff_other: "Staff (other)",
  other: "Other",
};

export interface AcademyExpense {
  _id: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  expenseDate: string;
  vendor?: string;
  description?: string;
  paymentMethod?: string;
  referenceNumber?: string;
  status: "paid" | "planned";
}

export interface AcademyExpenseSummary {
  recordsCount: number;
  totalAmount: number;
  paidAmount: number;
  plannedAmount: number;
  byCategory: Record<string, number>;
}

export const fetchAcademyExpenses = async (params?: {
  page?: number;
  limit?: number;
  category?: string;
  status?: string;
  month?: number;
  year?: number;
  search?: string;
}) => {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.category) q.set("category", params.category);
  if (params?.status) q.set("status", params.status);
  if (params?.month) q.set("month", String(params.month));
  if (params?.year) q.set("year", String(params.year));
  if (params?.search) q.set("search", params.search);
  const res = await authedFetch(`/student-management/expenses?${q}`);
  const body = await parseJson<{
    success?: boolean;
    data?: AcademyExpense[];
    pagination?: Pagination;
    message?: string;
  }>(res);
  if (!res.ok) throw new Error(body.message || "Failed to load expenses");
  return { records: body.data || [], pagination: body.pagination };
};

export const fetchAcademyExpenseSummary = (params?: {
  month?: number;
  year?: number;
  category?: string;
}) => {
  const q = new URLSearchParams();
  if (params?.month) q.set("month", String(params.month));
  if (params?.year) q.set("year", String(params.year));
  if (params?.category) q.set("category", params.category);
  const qs = q.toString();
  return api<AcademyExpenseSummary>(`/expenses/summary${qs ? `?${qs}` : ""}`);
};

export const createAcademyExpense = (body: {
  title: string;
  category: ExpenseCategory;
  amount: number;
  expenseDate: string;
  vendor?: string;
  description?: string;
  paymentMethod?: string;
  referenceNumber?: string;
  status?: "paid" | "planned";
}) =>
  api<AcademyExpense>("/expenses", { method: "POST", body: JSON.stringify(body) });

export const updateAcademyExpense = (id: string, body: Partial<AcademyExpense>) =>
  api<AcademyExpense>(`/expenses/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const deleteAcademyExpense = (id: string) =>
  api<{ deleted: boolean }>(`/expenses/${id}`, { method: "DELETE" });

// Academy attendance
export interface AcademyAttendanceDay {
  date: string;
  students: AcademyStudent[];
  records: AcademyAttendanceRecord[];
  summary: {
    present: number;
    absent: number;
    leave: number;
    late: number;
    unmarked: number;
  };
}

export interface AcademyAttendanceMonthSummary {
  total: number;
  present: number;
  absent: number;
  late: number;
  leave: number;
}

export const fetchAcademyAttendanceDay = (params: {
  date: string;
  classId?: string;
  sectionId?: string;
  sessionId?: string;
  studentId?: string;
}) => {
  const q = new URLSearchParams({ date: params.date });
  if (params.classId) q.set("classId", params.classId);
  if (params.sectionId) q.set("sectionId", params.sectionId);
  if (params.sessionId) q.set("sessionId", params.sessionId);
  if (params.studentId) q.set("studentId", params.studentId);
  return api<AcademyAttendanceDay>(`/attendance?${q}`);
};

export const markAcademyAttendance = (body: {
  date: string;
  entries: { studentId: string; status: "present" | "absent" | "late" | "leave" }[];
}) =>
  api<AcademyAttendanceRecord[]>("/attendance/mark", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const fetchAcademyAttendanceSummary = (params: { month: number; year: number }) => {
  const q = new URLSearchParams({
    month: String(params.month),
    year: String(params.year),
  });
  return api<AcademyAttendanceMonthSummary>(`/attendance/summary?${q}`);
};

export type AttendanceExportFormat = "xlsx" | "pdf";

export const exportAcademyAttendance = async (
  params: {
    date: string;
    classId?: string;
    sectionId?: string;
    sessionId?: string;
    studentId?: string;
  },
  format: AttendanceExportFormat = "xlsx",
) => {
  const q = new URLSearchParams({ date: params.date, format });
  if (params.classId) q.set("classId", params.classId);
  if (params.sectionId) q.set("sectionId", params.sectionId);
  if (params.sessionId) q.set("sessionId", params.sessionId);
  if (params.studentId) q.set("studentId", params.studentId);
  const res = await authedFetch(`/student-management/attendance/export?${q}`, { method: "GET" });
  if (!res.ok) throw new Error("Export failed");
  return res.blob();
};

// Assessments (umbrella: Tests + Exams — see assessmentTaxonomy.ts)
export type {
  AssessmentType,
  AssessmentCategory,
  CanonicalAssessmentType,
} from "./assessmentTaxonomy";
export {
  ASSESSMENT_CATEGORIES,
  ASSESSMENT_TYPES,
  ASSESSMENT_TYPE_KEYS,
  ASSESSMENT_TYPE_LABELS,
  TEST_TYPE_KEYS,
  EXAM_TYPE_KEYS,
  EXAM_TYPE_LABELS,
  assessmentTypeLabel,
  assessmentCategoryOf,
  isTestType,
  isExamType,
  typesForCategory,
} from "./assessmentTaxonomy";

export const fetchStudentAssessments = (studentId: string) =>
  api<AcademyAssessmentRecord[]>(`/students/${studentId}/assessments`);

export const createAssessment = (
  studentId: string,
  body: {
    subjectId?: string;
    title: string;
    assessmentType: AssessmentType;
    examDate: string;
    totalMarks: number;
    obtainedMarks: number;
    remarks?: string;
  }
) =>
  api<AcademyAssessmentRecord>(`/students/${studentId}/assessments`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateAssessment = (
  id: string,
  body: Partial<{
    subjectId: string;
    title: string;
    assessmentType: AssessmentType;
    examDate: string;
    totalMarks: number;
    obtainedMarks: number;
    remarks: string;
  }>
) =>
  api<AcademyAssessmentRecord>(`/assessments/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const deleteAssessment = (id: string) =>
  api<{ ok: boolean }>(`/assessments/${id}`, { method: "DELETE" });

export interface ClassTestEntryRow {
  student: {
    _id: string;
    studentId?: string;
    studentName: string;
    fatherName?: string;
    rollNumber?: string;
    phone?: string;
    guardianName?: string;
    sectionName?: string;
  };
  assessment: AcademyAssessmentRecord | null;
}

export type ClassTestRecurrence = "once" | "daily" | "weekly" | "monthly";

export interface AcademyClassTest {
  _id: string;
  classId: string | AcademyClass;
  sectionId?: string | AcademySection;
  subjectId: string | AcademySubject;
  title: string;
  seriesLabel?: string;
  assessmentType: AssessmentType;
  examDate: string;
  testTime?: string;
  totalMarks: number;
  syllabus?: string;
  status: "open" | "closed";
  recurrence?: ClassTestRecurrence;
  seriesId?: string;
  occurrenceIndex?: number;
  occurrenceCount?: number;
  planId?: string;
  planItemId?: string;
  assignmentId?: string;
  teacherId?: CreatedByUser | string;
  createdAt?: string;
  createdBy?: CreatedByUser | string;
}

export interface CreateClassTestResponse {
  test: AcademyClassTest;
  tests: AcademyClassTest[];
  seriesId?: string;
  createdCount: number;
}

export interface ClassTestSeriesSibling {
  _id: string;
  title: string;
  examDate: string;
  testTime?: string;
  occurrenceIndex?: number;
  occurrenceCount?: number;
  status: "open" | "closed";
}

export interface ClassTestMarksEntry {
  test: AcademyClassTest;
  series?: ClassTestSeriesSibling[];
  students: ClassTestEntryRow[];
}

export function fetchClassTests(classId?: string, seriesId?: string, sessionId?: string) {
  const params = new URLSearchParams();
  if (classId) params.set("classId", classId);
  if (seriesId) params.set("seriesId", seriesId);
  if (sessionId) params.set("sessionId", sessionId);
  const q = params.toString() ? `?${params.toString()}` : "";
  return api<AcademyClassTest[]>(`/class-tests${q}`);
}

export function createClassTest(body: {
  classId: string;
  subjectId: string;
  title: string;
  assessmentType: AssessmentType;
  examDate: string;
  testTime?: string;
  totalMarks: number;
  recurrence?: ClassTestRecurrence;
  seriesCount?: number;
}) {
  return api<CreateClassTestResponse>("/class-tests", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Format date + optional HH:mm for list/detail. */
export function formatClassTestSchedule(test: Pick<AcademyClassTest, "examDate" | "testTime">) {
  const d = new Date(test.examDate);
  const date = d.toLocaleDateString();
  const time = test.testTime?.trim();
  return time ? `${date} at ${time}` : date;
}

export function fetchClassTestEntry(testId: string) {
  return api<ClassTestMarksEntry>(`/class-tests/${testId}/entry`);
}

export async function fetchAwardListPdf(testId: string) {
  const res = await authedFetch(`/student-management/class-tests/${testId}/award-list.pdf`);
  if (!res.ok) {
    const body = await parseJson<{ message?: string }>(res);
    throw new Error(body.message || "Failed to load award list");
  }
  return res.blob();
}

/** Opens award list PDF in a new tab for preview (user can print from the browser). */
export async function previewAwardListPdf(testId: string) {
  const preview = window.open("about:blank", "_blank");
  try {
    const blob = await fetchAwardListPdf(testId);
    const url = URL.createObjectURL(blob);
    if (preview && !preview.closed) {
      preview.location.replace(url);
      preview.focus();
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.download = `award-list-${testId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  } catch (err) {
    preview?.close();
    throw err;
  }
}

export function saveClassTestMarks(
  testId: string,
  entries: {
    studentId: string;
    assessmentId?: string;
    obtainedMarks: number | string;
    remarks?: string;
    testPaperImage?: string;
  }[]
) {
  return api<{ savedCount: number }>(`/class-tests/${testId}/marks`, {
    method: "POST",
    body: JSON.stringify({ entries }),
  });
}

export async function uploadClassTestPaper(
  testId: string,
  studentId: string,
  file: File
): Promise<{ testPaperImage: string }> {
  const fd = new FormData();
  fd.append("testPaper", file);
  const res = await authedFetch(
    `/student-management/class-tests/${testId}/students/${studentId}/test-paper`,
    {
      method: "POST",
      body: fd,
    }
  );
  const body = await parseJson<{ success?: boolean; data?: { testPaperImage: string }; message?: string }>(res);
  if (!res.ok) throw new Error(body.message || "Upload failed");
  if (!body.data?.testPaperImage) throw new Error("Invalid upload response");
  return body.data;
}

export function deleteClassTest(testId: string, options?: { deleteSeries?: boolean }) {
  const q = options?.deleteSeries ? "?series=true" : "";
  return api<{ ok: boolean; deletedCount?: number }>(`/class-tests/${testId}${q}`, { method: "DELETE" });
}
