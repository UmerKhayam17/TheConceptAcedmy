import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  GraduationCap,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  User,
  UserCheck,
  UserRound,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type { ModuleActionCaps } from "@/lib/permissions";
import {
  type AcademyAssessmentRecord,
  type AcademyAttendanceRecord,
  type AcademyStudent,
  type AcademyStudentRecord,
  type AcademySubject,
  type AcademyTimetableSlot,
  getAcademyStudentRecord,
  fetchAcademyStudents,
  fetchStudentMonthAttendance,
  createAssessment,
  updateAssessment,
  deleteAssessment,
  ASSESSMENT_TYPE_LABELS,
  resolveUploadUrl,
} from "@/lib/studentManagementApi";
import { fetchStudentExamResults, type ExamResult } from "@/lib/examApi";
import AssessmentFormDialog from "@/components/modules/exams/AssessmentFormDialog";
import TestPaperCapture from "@/components/modules/exams/TestPaperCapture";
import AcademyFeesManagement from "@/components/modules/student-management/AcademyFeesManagement";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import PanelStatCard from "@/components/modules/PanelStatCard";
import { matchesPanelSearch } from "@/lib/panelSearch";
import { getAccessToken } from "@/lib/auth";
import { createdByLabel } from "@/lib/createdBy";
import CreatedByLine from "@/components/modules/CreatedByLine";
import { getApiRoot } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  academyStudentRoutes,
  type AcademyStudentRoutes,
} from "@/lib/studentManagementMenus";
import {
  classLabel,
  examPercentage,
  formatDate,
  formatPkr,
  subjectCode,
  subjectName,
  WEEKDAY_NAMES,
} from "./studentDisplayUtils";
import { FreeStudentBadge, isFullFeeWaiver } from "./FeeModeSelector";

const FULL_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const CAL_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ymdLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function attendanceDayTone(status?: string) {
  switch (status) {
    case "present":
      return "bg-emerald-500 text-white";
    case "late":
      return "bg-amber-500 text-white";
    case "absent":
      return "bg-rose-500 text-white";
    case "leave":
      return "bg-sky-500 text-white";
    default:
      return "bg-slate-100 text-slate-500";
  }
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-primary border-b pb-1.5 mb-3">{children}</h3>;
}

function QuickStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 min-w-[7rem]">
      <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
      <span className="text-sm font-semibold text-primary tabular-nums">{value}</span>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium break-words">{value ?? "—"}</p>
    </div>
  );
}

function EmptyBlock({ message }: { message: string }) {
  return (
    <p className="text-sm text-muted-foreground py-5 text-center border rounded-md bg-muted/20">
      {message}
    </p>
  );
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-md border bg-card p-3 space-y-0.5">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-lg font-semibold text-primary leading-tight">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: React.ReactNode[][];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto border rounded-md">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 border-b">
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                className={`p-3 font-medium ${h === "Media" ? "text-center" : "text-left"}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="border-b last:border-0">
              {cells.map((cell, j) => (
                <td
                  key={j}
                  className={`p-3 ${headers[j] === "Media" ? "text-center align-middle" : ""}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label = status === "pending_fee" ? "Pending fee" : status;
  const colors: Record<string, string> = {
    active: "bg-accent/15 text-accent",
    pending_fee: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
    present: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    absent: "bg-destructive/15 text-destructive",
    overdue: "bg-destructive/15 text-destructive",
    pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    late: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    leave: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
    waived: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`inline-flex text-xs font-semibold rounded-full px-2 py-0.5 capitalize ${colors[status] || "bg-muted text-muted-foreground"
        }`}
    >
      {label}
    </span>
  );
}

function ProfileTab({ student, hideSensitive = false }: { student: AcademyStudent; hideSensitive?: boolean }) {
  const subtotal = (student.monthlyFee || 0) + (student.admissionFee || 0);
  const photoSrc = student.photoImage ? resolveUploadUrl(student.photoImage) : null;

  return (
    <div className="space-y-4">
      {photoSrc ? (
        <div className="flex items-center gap-4 rounded-lg border p-4">
          <img
            src={photoSrc}
            alt={`${student.studentName} photo`}
            className="h-24 w-24 rounded-full object-cover border"
          />
          <div>
            <p className="font-medium">{student.studentName}</p>
            <p className="text-sm text-muted-foreground">{student.studentId}</p>
          </div>
        </div>
      ) : null}

      <section className="rounded-lg border p-4 space-y-3">
        <SectionTitle>Student information</SectionTitle>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
          <DetailRow label="Student name" value={student.studentName} />
          <DetailRow label="Father's name" value={student.fatherName} />
          <DetailRow label="Date of birth" value={formatDate(student.dateOfBirth)} />
          <DetailRow label="Admission date" value={formatDate(student.createdAt)} />
          {student.status === "active" && (
            <DetailRow label="Activated" value={formatDate(student.activatedAt)} />
          )}
          <DetailRow label="Nationality" value={student.nationality} />
          <DetailRow label="Gender" value={student.gender} />
          <DetailRow label="Student email" value={student.studentEmail} />
        </div>
      </section>

      <section className="rounded-lg border p-4 space-y-3">
        <SectionTitle>Guardian information</SectionTitle>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
          <DetailRow label="Guardian name" value={student.guardianName} />
          <DetailRow label="Relation" value={student.guardianRelation} />
          <DetailRow label="CNIC" value={student.fatherGuardianCnic} />
          <DetailRow label="Occupation" value={student.guardianOccupation} />
          <DetailRow label="Work address" value={student.guardianWorkAddress} />
          {!hideSensitive && (
            <DetailRow label="Parent portal email" value={student.guardianEmail} />
          )}
        </div>
      </section>

      <section className="rounded-lg border p-4 space-y-3">
        <SectionTitle>Contact & address</SectionTitle>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
          {!hideSensitive && <DetailRow label="Mobile" value={student.phone} />}
          {!hideSensitive && <DetailRow label="Residence phone" value={student.contactPhoneRes} />}
          <DetailRow label="Postal address" value={student.postalAddress || student.address} />
          <DetailRow label="Permanent address" value={student.permanentAddress} />
        </div>
      </section>

      <section className="rounded-lg border p-4 space-y-3">
        <SectionTitle>Previous school / college</SectionTitle>
        <DetailRow label="School / college" value={student.currentSchoolCollege} />
      </section>

      {student.academicHistory && student.academicHistory.length > 0 && (
        <section className="rounded-lg border p-4 space-y-3">
          <SectionTitle>Academic history (prior institutions)</SectionTitle>
          <DataTable
            headers={["Institution", "Class", "Total", "Obtained", "%", "Year"]}
            rows={student.academicHistory.map((row) => [
              row.institutionName || "—",
              row.className || "—",
              row.totalMarks ?? "—",
              row.obtainedMarks ?? "—",
              row.percentage != null ? `${row.percentage}%` : "—",
              row.year || "—",
            ])}
          />
        </section>
      )}

      {!hideSensitive && (
        <section className="rounded-lg border p-4 space-y-3">
          <SectionTitle>
            <span className="inline-flex flex-wrap items-center gap-2">
              Fee structure at registration
              {isFullFeeWaiver(student) && <FreeStudentBadge />}
            </span>
          </SectionTitle>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
            <DetailRow label="Class" value={classLabel(student.classId)} />
            {student.disciplineId && (
              <DetailRow
                label="Discipline"
                value={
                  typeof student.disciplineId === "object"
                    ? student.disciplineId.name
                    : String(student.disciplineId)
                }
              />
            )}
            <DetailRow label="Monthly fee" value={formatPkr(student.monthlyFee)} />
            <DetailRow label="Admission fee" value={formatPkr(student.admissionFee)} />
            <DetailRow
              label="Monthly total payable"
              value={formatPkr(
                Math.max(0, (student.monthlyFee || 0) - (student.monthlyFeeDiscount || 0)),
              )}
            />
            <DetailRow
              label="Admission total payable"
              value={formatPkr(
                Math.max(0, (student.admissionFee || 0) - (student.admissionFeeDiscount || 0)),
              )}
            />
            <DetailRow label="Monthly fee discount" value={formatPkr(student.monthlyFeeDiscount)} />
            <DetailRow label="Admission fee discount" value={formatPkr(student.admissionFeeDiscount)} />
            {(student.defaultChargeIds?.length ?? 0) > 0 && (
              <DetailRow
                label="Default additional charges"
                value={`${student.defaultChargeIds!.length} selected`}
              />
            )}
            {(student.discountAmount ?? 0) > 0 &&
              !(student.monthlyFeeDiscount || student.admissionFeeDiscount) ? (
              <DetailRow label="Combined discount (legacy)" value={formatPkr(student.discountAmount)} />
            ) : (
              <DetailRow label="Total discount" value={formatPkr(student.discountAmount)} />
            )}
            <DetailRow label="Subtotal" value={formatPkr(subtotal)} />
            <DetailRow label="First month challan (monthly + admission − discounts)" value={formatPkr(student.totalFee)} />
            <DetailRow
              label="Later months (monthly − discount)"
              value={formatPkr(
                Math.max(0, (student.monthlyFee || 0) - (student.monthlyFeeDiscount || 0)),
              )}
            />
          </div>
        </section>
      )}

      {hideSensitive && (
        <section className="rounded-lg border p-4 space-y-3">
          <SectionTitle>Class</SectionTitle>
          <DetailRow label="Class" value={classLabel(student.classId)} />
          {student.disciplineId && (
            <DetailRow
              label="Discipline"
              value={
                typeof student.disciplineId === "object"
                  ? student.disciplineId.name
                  : String(student.disciplineId)
              }
            />
          )}
        </section>
      )}
    </div>
  );
}

function EnrollmentTab({ record }: { record: AcademyStudentRecord }) {
  const { enrollment, student } = record;
  const subjects = enrollment.subjects as AcademySubject[];

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="Enrolled subjects" value={enrollment.subjectCount} />
        <SummaryCard label="Class total subjects" value={enrollment.classSubjectsTotal} />
        <SummaryCard
          label="Package"
          value={enrollment.isFullPackage ? "Full package" : "Selected subjects"}
        />
        <SummaryCard label="Class" value={classLabel(student.classId)} />
        {student.disciplineId && (
          <SummaryCard
            label="Discipline"
            value={
              typeof student.disciplineId === "object"
                ? student.disciplineId.name
                : String(student.disciplineId)
            }
          />
        )}
      </div>

      {subjects.length === 0 ? (
        <EmptyBlock message="No subjects enrolled for this student." />
      ) : (
        <DataTable
          headers={["#", "Subject", "Code", "Status"]}
          rows={subjects.map((s, i) => [
            i + 1,
            s.subjectName || "—",
            s.subjectCode || "—",
            <StatusBadge key="st" status={s.status || "active"} />,
          ])}
        />
      )}
    </div>
  );
}

function TimetableTab({ slots }: { slots: AcademyTimetableSlot[] }) {
  if (slots.length === 0) {
    return (
      <EmptyBlock message="No timetable slots for this student's class and subjects yet. Add class timetable entries from class setup when available." />
    );
  }

  const byDay = WEEKDAY_NAMES.map((day, dayIndex) => ({
    day,
    slots: slots.filter((s) => s.dayOfWeek === dayIndex),
  })).filter((g) => g.slots.length > 0);

  return (
    <div className="space-y-4">
      {byDay.map(({ day, slots: daySlots }) => (
        <div key={day} className="space-y-2">
          <h4 className="text-sm font-semibold text-primary">{day}</h4>
          <DataTable
            headers={["Time", "Subject", "Code", "Room"]}
            rows={daySlots.map((s) => [
              `${s.startTime} – ${s.endTime}`,
              subjectName(s.subjectId as AcademySubject),
              subjectCode(s.subjectId as AcademySubject) || "—",
              s.room || "—",
            ])}
          />
        </div>
      ))}
    </div>
  );
}

function AttendanceTab({ studentId }: { studentId: string }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const yearOptions = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["student-attendance-month", studentId, month, year],
    queryFn: () => fetchStudentMonthAttendance({ studentId, month, year }),
    enabled: Boolean(studentId),
  });

  const byDay = useMemo(() => {
    const map = new Map<string, AcademyAttendanceRecord>();
    (data?.records || []).forEach((r) => {
      const key = typeof r.date === "string" ? r.date.slice(0, 10) : ymdLocal(new Date(r.date));
      map.set(key, r);
    });
    return map;
  }, [data?.records]);

  const daysInMonth = data?.daysInMonth || new Date(year, month, 0).getDate();
  const firstDow = new Date(year, month - 1, 1).getDay();
  const summary = data?.summary;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <PanelStatCard
          label="Present"
          value={isLoading ? "…" : summary?.present ?? 0}
          hint={FULL_MONTH_NAMES[month - 1]}
          icon={CheckCircle2}
          iconWrapClass="bg-[#d1fae5]"
          iconClass="text-[#059669]"
        />
        <PanelStatCard
          label="Absent"
          value={isLoading ? "…" : summary?.absent ?? 0}
          hint="Marked days"
          icon={XCircle}
          iconWrapClass="bg-[#ffe4e6]"
          iconClass="text-[#e11d48]"
        />
        <PanelStatCard
          label="Late / Leave"
          value={isLoading ? "…" : `${summary?.late ?? 0} / ${summary?.leave ?? 0}`}
          hint="This month"
          icon={CalendarDays}
          iconWrapClass="bg-[#fef3c7]"
          iconClass="text-[#d97706]"
        />
        <PanelStatCard
          label="Attendance rate"
          value={
            isLoading
              ? "…"
              : summary?.attendanceRate != null
                ? `${summary.attendanceRate}%`
                : "—"
          }
          hint="Present + late"
          icon={UserRound}
          iconWrapClass="bg-[#dbeafe]"
          iconClass="text-[#2563eb]"
        />
      </div>

      <Card className="p-3 sm:p-4 shadow-sm border-border/80">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[10rem]">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Month</Label>
            <select
              className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {FULL_MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[6rem]">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Year</Label>
            <select
              className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="rounded-2xl border p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="font-display text-base font-semibold text-[#1a2b4b]">
              {FULL_MONTH_NAMES[month - 1]} {year}
            </h3>
            <div className="flex flex-wrap gap-2 text-[10px] font-medium uppercase tracking-wide">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Present
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-500" /> Late
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-rose-500" /> Absent
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-sky-500" /> Leave
              </span>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
            {CAL_WEEKDAYS.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {Array.from({ length: firstDow }).map((_, i) => (
              <div key={`b-${i}`} className="aspect-square" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const rec = byDay.get(key);
              const isToday = key === ymdLocal(new Date());
              return (
                <div
                  key={key}
                  title={rec ? `${key}: ${rec.status}` : key}
                  className={cn(
                    "flex aspect-square flex-col items-center justify-center rounded-lg text-xs font-semibold tabular-nums",
                    attendanceDayTone(rec?.status),
                    isToday && !rec && "ring-2 ring-primary/40",
                    isToday && rec && "ring-2 ring-offset-1 ring-primary/50",
                  )}
                >
                  {day}
                </div>
              );
            })}
          </div>
          {isLoading && <p className="mt-3 text-xs text-muted-foreground">Loading month…</p>}
          {isError && (
            <p className="mt-3 text-xs text-destructive">
              {(error as Error)?.message || "Failed to load attendance"}
            </p>
          )}
        </Card>

        <Card className="rounded-2xl border p-4 shadow-sm sm:p-5">
          <h3 className="font-display text-base font-semibold text-[#1a2b4b]">Daily log</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            All marked days in {FULL_MONTH_NAMES[month - 1]} {year}
          </p>
          <div className="mt-4 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
            {!isLoading && (data?.records || []).length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No attendance marked for this month yet.
              </p>
            )}
            {(data?.records || []).map((r) => {
              const day =
                typeof r.date === "string" ? r.date.slice(0, 10) : ymdLocal(new Date(r.date));
              return (
                <div
                  key={r._id || day}
                  className="flex items-center justify-between gap-3 rounded-xl border bg-slate-50/70 px-3 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium text-[#1a2b4b]">
                      {new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{day}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

function TestsTab({
  record,
  studentId,
  classId,
  caps,
}: {
  record: AcademyStudentRecord;
  studentId: string;
  classId: string;
  caps: ModuleActionCaps;
}) {
  const qc = useQueryClient();
  const { summary, records } = record.assessments;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AcademyAssessmentRecord | null>(null);

  const canManageTests = caps.canEdit || caps.canCreate;
  const [search, setSearch] = useState("");
  const recordsFiltered = useMemo(() => {
    if (!search.trim()) return records;
    return records.filter((r) => {
      const classTest =
        r.classTestId && typeof r.classTestId === "object" ? r.classTestId : null;
      return matchesPanelSearch(
        search,
        r.title,
        r.assessmentType,
        r.examDate,
        r.remarks,
        r.subjectId ? subjectName(r.subjectId as AcademySubject) : "",
        r.obtainedMarks,
        r.totalMarks,
        createdByLabel(classTest?.createdBy || classTest?.teacherId || r.createdBy),
        createdByLabel(r.recordedBy || r.createdBy)
      );
    });
  }, [records, search]);

  const { data: termResults = [] } = useQuery({
    queryKey: ["student-exam-results", studentId],
    queryFn: () => fetchStudentExamResults(studentId),
  });

  const saveMut = useMutation({
    mutationFn: (body: Parameters<typeof createAssessment>[1]) =>
      editing
        ? updateAssessment(editing._id, body)
        : createAssessment(studentId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academy-student-record", studentId] });
      setDialogOpen(false);
      setEditing(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: deleteAssessment,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["academy-student-record", studentId] }),
  });

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>Ongoing tests (this student)</SectionTitle>
          {canManageTests && (
            <Button
              size="sm"
              variant="hero"
              className="gap-1"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Add test
            </Button>
          )}
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <SummaryCard label="Tests / reports" value={summary.count} />
          <SummaryCard
            label="Average score"
            value={summary.averagePercentage != null ? `${summary.averagePercentage}%` : "—"}
          />
          <SummaryCard
            label="Highest"
            value={summary.highestPercentage != null ? `${summary.highestPercentage}%` : "—"}
          />
          <SummaryCard
            label="Lowest"
            value={summary.lowestPercentage != null ? `${summary.lowestPercentage}%` : "—"}
          />
        </div>

        {records.length > 0 && (
          <PanelSearchBar value={search} onChange={setSearch} placeholder="Search tests…" className="max-w-md mb-4" />
        )}
        {records.length === 0 ? (
          <EmptyBlock message="No tests recorded yet. Add quiz, weekly, or monthly tests per subject." />
        ) : recordsFiltered.length === 0 ? (
          <EmptyBlock message="No tests match your search." />
        ) : (
          <DataTable
            headers={[
              "Date",
              "Title",
              "Type",
              "Subject",
              "Obtained",
              "Total",
              "%",
              "Media",
              "Test created by",
              "Marks by",
              "Remarks",
              "",
            ]}
            rows={recordsFiltered.map((r: AcademyAssessmentRecord) => {
              const classTest =
                r.classTestId && typeof r.classTestId === "object" ? r.classTestId : null;
              const testCreatedBy =
                classTest?.createdBy || classTest?.teacherId || r.createdBy;
              const marksBy = r.recordedBy || r.createdBy;
              return [
                formatDate(r.examDate),
                r.title,
                ASSESSMENT_TYPE_LABELS[r.assessmentType as keyof typeof ASSESSMENT_TYPE_LABELS] ||
                r.assessmentType,
                r.subjectId ? subjectName(r.subjectId as AcademySubject) : "—",
                r.obtainedMarks,
                r.totalMarks,
                examPercentage(r.obtainedMarks, r.totalMarks),
                r.testPaperImage ? (
                  <TestPaperCapture
                    value={r.testPaperImage}
                    disabled
                    onPick={() => undefined}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">No image</span>
                ),
                createdByLabel(testCreatedBy),
                createdByLabel(marksBy),
                r.remarks || "—",
                canManageTests ? (
                  <span className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditing(r);
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => {
                        if (window.confirm("Delete this test?")) deleteMut.mutate(r._id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                ) : (
                  "—"
                ),
              ];
            })}
          />
        )}
      </div>

      <div>
        <SectionTitle>Term exam results (published)</SectionTitle>
        {termResults.length === 0 ? (
          <EmptyBlock message="No published term exam results yet." />
        ) : (
          <div className="space-y-3">
            {termResults.map((r: ExamResult) => {
              const examTitle =
                typeof r.exam === "object" && r.exam ? r.exam.title : "Exam";
              return (
                <div
                  key={r._id}
                  className="border rounded-lg p-4 flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <p className="font-medium">{examTitle}</p>
                    <p className="text-sm text-muted-foreground">
                      {Math.round(r.percentage)}% · Grade {r.grade}
                      {r.position != null ? ` · Position #${r.position}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const token = getAccessToken();
                      const preview = window.open("about:blank", "_blank");
                      try {
                        const res = await fetch(`${getApiRoot()}/results/${r._id}/pdf`, {
                          headers: token ? { Authorization: `Bearer ${token}` } : {},
                          credentials: "include",
                        });
                        if (!res.ok) {
                          preview?.close();
                          return;
                        }
                        const blob = await res.blob();
                        const url = URL.createObjectURL(blob);
                        if (preview && !preview.closed) {
                          preview.location.replace(url);
                          preview.focus();
                        } else {
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `result-card-${r._id}.pdf`;
                          a.click();
                        }
                        window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
                      } catch {
                        preview?.close();
                      }
                    }}
                  >
                    Result card
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AssessmentFormDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setEditing(null);
        }}
        classId={classId}
        initial={editing}
        loading={saveMut.isPending}
        onSubmit={(body) => saveMut.mutate(body)}
      />
    </div>
  );
}

export default function StudentDetailPage({
  caps,
  studentId,
  routes: routesProp,
}: {
  caps: ModuleActionCaps;
  studentId: string;
  routes?: AcademyStudentRoutes;
}) {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const routes =
    routesProp ?? (user?.role ? academyStudentRoutes(user.role, "registration") : null);
  const editHref = routes ? routes.edit(studentId) : "#";
  const activateHref = routes ? routes.activate(studentId) : "#";

  const { data: parentSiblings = [] } = useQuery({
    queryKey: ["parent-children-list", user?.id],
    queryFn: async () => {
      const { students } = await fetchAcademyStudents({ limit: 100 });
      return students;
    },
    enabled: user?.role === "parent",
  });

  const listHref =
    user?.role === "parent" && parentSiblings.length <= 1
      ? `/panel/parent`
      : routes?.list ?? "..";
  const listBackLabel =
    user?.role === "parent"
      ? parentSiblings.length <= 1
        ? "Back to dashboard"
        : "Back to My Children"
      : routes?.list.includes("/students")
        ? "Back to student records"
        : "Back to registration";

  const { data: record, isLoading, isError, error } = useQuery({
    queryKey: ["academy-student-record", studentId],
    queryFn: () => getAcademyStudentRecord(studentId),
  });

  const isPendingStudent = record?.student.status === "pending_fee";
  const isTeacherUser = user?.role === "teacher";
  const studentTabs = isPendingStudent
    ? (["profile"] as const)
    : isTeacherUser
      ? (["profile", "enrollment", "timetable", "attendance", "tests"] as const)
      : (["profile", "enrollment", "timetable", "attendance", "fees", "tests"] as const);
  const tabFromUrl = searchParams.get("tab") || "";
  const activeTab = (studentTabs as readonly string[]).includes(tabFromUrl)
    ? tabFromUrl
    : "profile";
  const setActiveTab = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next === "profile") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  if (isLoading) {
    return (
      <div className="w-full px-4 sm:px-6 lg:px-8 py-12 text-center text-muted-foreground">
        Loading student record…
      </div>
    );
  }

  if (isError || !record) {
    return (
      <div className="w-full px-4 sm:px-6 lg:px-8 py-12 space-y-4 text-center">
        <p className="text-destructive">{(error as Error)?.message || "Student not found"}</p>
        <Button variant="outline" asChild>
          <Link to={listHref}>Back to list</Link>
        </Button>
      </div>
    );
  }

  const { student, enrollment, attendance, fees, assessments } = record;
  const isPending = student.status === "pending_fee";
  const isParent = user?.role === "parent";
  const isTeacher = user?.role === "teacher";
  const hideSensitive = isTeacher;

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b pb-3">
        <div className="min-w-0 space-y-1">
          <Button variant="ghost" size="sm" className="gap-1.5 -ml-2 h-8 px-2" asChild>
            <Link to={listHref}>
              <ArrowLeft className="h-4 w-4" /> {listBackLabel}
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="font-display text-lg sm:text-xl font-semibold text-primary">
              {student.studentName}
            </h2>
            <StatusBadge status={student.status} />
          </div>
          <p className="text-xs text-muted-foreground font-mono">
            {isPending
              ? [student.rollNumber, student.registrationNumber].filter(Boolean).join(" · ") || "Pending admission"
              : [student.rollNumber, student.studentId].filter(Boolean).join(" · ")}
          </p>
          {!hideSensitive && student.phone && (
            <p className="text-xs text-muted-foreground">{student.phone}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Created {formatDate(student.createdAt)}
            {!isPending && student.activatedAt ? ` · Activated ${formatDate(student.activatedAt)}` : null}
          </p>
          <p className="text-xs text-muted-foreground">{classLabel(student.classId)}</p>
          <CreatedByLine createdBy={student.createdBy} className="text-xs" />
        </div>
        {caps.canEdit && (
          isPending ? (
            <Button size="sm" className="gap-2 shrink-0" asChild>
              <Link to={activateHref}>
                <UserCheck className="h-4 w-4" /> Complete & activate
              </Link>
            </Button>
          ) : (
            <Button size="sm" className="gap-2 shrink-0" asChild>
              <Link to={editHref}>
                <Pencil className="h-4 w-4" /> Edit
              </Link>
            </Button>
          )
        )}
      </div>

      {isPending ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-muted-foreground">
          Admission intake only. Send the family to accounts to record the fee and complete enrollment
          (section, subjects, roll number, and portal logins).
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border bg-muted/25 px-4 py-2.5">
          <QuickStat label="Subjects" value={enrollment.subjectCount} />
          <QuickStat
            label="Attendance"
            value={
              attendance.summary.attendanceRate != null
                ? `${attendance.summary.attendanceRate}%`
                : "—"
            }
          />
          {!hideSensitive && !isParent && (
            <>
              <QuickStat label="Fees" value={fees.summary.recordsCount} />
              <QuickStat label="Paid" value={formatPkr(fees.summary.totalPaid)} />
            </>
          )}
          <QuickStat label="Tests" value={assessments.summary.count} />
          <QuickStat
            label="Avg %"
            value={
              assessments.summary.averagePercentage != null
                ? `${assessments.summary.averagePercentage}%`
                : "—"
            }
          />
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full flex flex-wrap h-auto gap-0.5 p-0.5 bg-muted/40">
          <TabsTrigger value="profile" className="gap-1.5">
            <User className="h-3.5 w-3.5" /> Profile
          </TabsTrigger>
          {!isPending && (
            <>
              <TabsTrigger value="enrollment" className="gap-1.5">
                <BookOpen className="h-3.5 w-3.5" /> Enrollment ({enrollment.subjectCount})
              </TabsTrigger>
              <TabsTrigger value="timetable" className="gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> Timetable
              </TabsTrigger>
              <TabsTrigger value="attendance" className="gap-1.5">
                <ClipboardList className="h-3.5 w-3.5" /> Attendance
              </TabsTrigger>
              {!hideSensitive && !isParent && (
                <TabsTrigger value="fees" className="gap-1.5">
                  <Receipt className="h-3.5 w-3.5" /> Fees
                </TabsTrigger>
              )}
              <TabsTrigger value="tests" className="gap-1.5">
                <GraduationCap className="h-3.5 w-3.5" /> Test reports
              </TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="profile" className="mt-3 focus-visible:outline-none">
          <ProfileTab student={student} hideSensitive={hideSensitive} />
        </TabsContent>
        {!isPending && (
          <>
            <TabsContent value="enrollment" className="mt-3 focus-visible:outline-none">
              <EnrollmentTab record={record} />
            </TabsContent>
            <TabsContent value="timetable" className="mt-3 focus-visible:outline-none">
              <TimetableTab slots={record.timetable} />
            </TabsContent>
            <TabsContent value="attendance" className="mt-3 focus-visible:outline-none">
              <AttendanceTab studentId={studentId} />
            </TabsContent>
            {!hideSensitive && !isParent && (
              <TabsContent value="fees" className="mt-3 focus-visible:outline-none">
                <AcademyFeesManagement
                  caps={caps}
                  studentId={studentId}
                  routes={routes ?? undefined}
                  showGenerate={false}
                  showFilters={false}
                />
              </TabsContent>
            )}
            <TabsContent value="tests" className="mt-3 focus-visible:outline-none">
              <TestsTab
                record={record}
                studentId={studentId}
                classId={
                  typeof student.classId === "object" && student.classId
                    ? student.classId._id
                    : String(student.classId)
                }
                caps={caps}
              />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
