import { getApiRoot, parseJson, resolveUploadUrl } from "@/lib/api";

export { resolveUploadUrl };
import { authedFetch } from "@/lib/auth";
import type { CreatedByUser } from "@/lib/createdBy";

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
    studentEmail: string;
    studentPassword: string;
    parentEmail?: string;
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
  feeType: "admission" | "monthly";
  status: "pending" | "paid" | "overdue" | "waived";
  dueDate?: string;
  receiptNumber?: string;
  paidAt?: string;
  paymentMethod?: string;
  notes?: string;
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
  subjectId?: AcademySubject | string;
  title: string;
  assessmentType: string;
  examDate: string;
  totalMarks: number;
  obtainedMarks: number;
  remarks?: string;
  testPaperImage?: string;
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

export const fetchEnrollmentSubjects = (classId: string, sectionId?: string) => {
  const q = sectionId ? `?sectionId=${sectionId}` : "";
  return api<EnrollmentSubjectLayout>(`/classes/${classId}/enrollment-subjects${q}`);
};

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

export const exportStudentsCsv = async (params?: {
  search?: string;
  classId?: string;
  status?: string;
  sessionId?: string;
}) => {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  if (params?.classId) q.set("classId", params.classId);
  if (params?.status) q.set("status", params.status);
  if (params?.sessionId) q.set("sessionId", params.sessionId);
  const res = await authedFetch(`/student-management/students/export?${q}`, { method: "GET" });
  if (!res.ok) throw new Error("Export failed");
  return res.blob();
};

export interface AcademyFeeSummary {
  recordsCount: number;
  totalPaid: number;
  totalPending: number;
  totalAmount: number;
  byStatus: { pending: number; paid: number; overdue: number; waived: number };
  activeStudents: number;
}

// Fees
export const fetchAcademyFees = async (params?: {
  page?: number;
  limit?: number;
  status?: string;
  feeType?: string;
  classId?: string;
  studentId?: string;
  month?: number;
  year?: number;
  sessionId?: string;
}) => {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.status) q.set("status", params.status);
  if (params?.feeType) q.set("feeType", params.feeType);
  if (params?.classId) q.set("classId", params.classId);
  if (params?.studentId) q.set("studentId", params.studentId);
  if (params?.month) q.set("month", String(params.month));
  if (params?.year) q.set("year", String(params.year));
  if (params?.sessionId) q.set("sessionId", params.sessionId);
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
  studentId?: string;
  sessionId?: string;
}) => {
  const q = new URLSearchParams();
  if (params?.month) q.set("month", String(params.month));
  if (params?.year) q.set("year", String(params.year));
  if (params?.classId) q.set("classId", params.classId);
  if (params?.studentId) q.set("studentId", params.studentId);
  if (params?.sessionId) q.set("sessionId", params.sessionId);
  const qs = q.toString();
  return api<AcademyFeeSummary>(`/fees/summary${qs ? `?${qs}` : ""}`);
};

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
  api<{ created: number; skipped: number }>("/fees/generate", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const payAcademyFee = (id: string, body?: { paymentMethod?: string; notes?: string }) =>
  api<AcademyFeeRecord>(`/fees/${id}/pay`, { method: "PATCH", body: JSON.stringify(body || {}) });

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
  student: {
    _id: string;
    studentId: string;
    studentName: string;
    fatherName: string;
    phone: string;
    classId?: string;
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
}) => {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.status) q.set("status", params.status);
  if (params?.month) q.set("month", String(params.month));
  if (params?.year) q.set("year", String(params.year));
  if (params?.roleName) q.set("roleName", params.roleName);
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
}) => {
  const q = new URLSearchParams();
  if (params?.month) q.set("month", String(params.month));
  if (params?.year) q.set("year", String(params.year));
  if (params?.roleName) q.set("roleName", params.roleName);
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
}) => {
  const q = new URLSearchParams({ date: params.date });
  if (params.classId) q.set("classId", params.classId);
  if (params.sectionId) q.set("sectionId", params.sectionId);
  if (params.sessionId) q.set("sessionId", params.sessionId);
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

// Assessments (ongoing tests — single subject per row)
export type AssessmentType =
  | "quiz"
  | "weekly"
  | "monthly"
  | "midterm"
  | "final"
  | "assignment"
  | "practice"
  | "other";

export const ASSESSMENT_TYPE_LABELS: Record<AssessmentType, string> = {
  quiz: "Quiz",
  weekly: "Weekly test",
  monthly: "Monthly test",
  midterm: "Midterm",
  final: "Final",
  assignment: "Assignment",
  practice: "Practice test",
  other: "Other",
};

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
    studentId: string;
    studentName: string;
    fatherName?: string;
  };
  assessment: AcademyAssessmentRecord | null;
}

export type ClassTestRecurrence = "once" | "daily" | "weekly" | "monthly";

export interface AcademyClassTest {
  _id: string;
  classId: string | AcademyClass;
  subjectId: string | AcademySubject;
  title: string;
  seriesLabel?: string;
  assessmentType: AssessmentType;
  examDate: string;
  testTime?: string;
  totalMarks: number;
  status: "open" | "closed";
  recurrence?: ClassTestRecurrence;
  seriesId?: string;
  occurrenceIndex?: number;
  occurrenceCount?: number;
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

export function fetchClassTests(classId?: string, seriesId?: string) {
  const params = new URLSearchParams();
  if (classId) params.set("classId", classId);
  if (seriesId) params.set("seriesId", seriesId);
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
