import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { UserRound } from "lucide-react";
import ParentEmptyMessage from "@/components/modules/parent/ParentEmptyMessage";
import ParentMobilePageHeader from "@/components/modules/parent/ParentMobilePageHeader";
import { ParentOptionField } from "@/components/modules/parent/ParentOptionSheet";
import { useAuth } from "@/hooks/useAuth";
import { recordDayYmd, schoolDayYmd } from "@/lib/localDate";
import {
  fetchAcademyStudents,
  fetchStudentMonthAttendance,
  resolveUploadUrl,
  type AcademyAttendanceRecord,
  type AcademyStudent,
} from "@/lib/studentManagementApi";
import { classLabel } from "@/components/modules/student-management/studentDisplayUtils";
import { cn, formatClockTime } from "@/lib/utils";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const STATUSES = [
  { value: "all", label: "All" },
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "leave", label: "Leave" },
  { value: "late", label: "Late" },
];

type PhoneTab = "today" | "history";

function refName(ref: unknown, key: string) {
  if (!ref || typeof ref !== "object") return "";
  const value = (ref as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function classSectionLine(student: AcademyStudent) {
  const rawClass = classLabel(student.classId);
  const className = rawClass && rawClass !== "—"
    ? (/^class\b/i.test(rawClass) ? rawClass : `Class ${rawClass}`)
    : "";
  const rawSection = refName(student.sectionId, "sectionName");
  const section = rawSection
    ? (/^section\b/i.test(rawSection) ? rawSection : `Section ${rawSection}`)
    : "";
  return [className, section].filter(Boolean).join(" · ");
}

function markerName(record?: AcademyAttendanceRecord | null) {
  const markedBy = record?.markedBy;
  if (!markedBy || typeof markedBy === "string") return "";
  return markedBy.name || "";
}

function sourceLabel(source?: string) {
  if (!source) return "";
  if (source === "manual") return "ERP";
  if (source === "ai") return "AI";
  if (source === "auto") return "Auto";
  return source.toUpperCase();
}

function statusLabel(status: string) {
  if (status === "present") return "Present";
  if (status === "absent") return "Absent";
  if (status === "late") return "Late";
  if (status === "leave") return "Leave";
  return status;
}

function statusTone(status: string) {
  if (status === "present") return "bg-[#E5F8EC] text-[#16A34A]";
  if (status === "absent") return "bg-[#FDECEC] text-[#EF4444]";
  if (status === "late") return "bg-[#FFF4D6] text-[#D97706]";
  if (status === "leave") return "bg-[#FFF1E6] text-[#F97316]";
  return "bg-[#F1F5F9] text-[#64748B]";
}

function statusMark(status?: string) {
  if (status === "present") return { mark: "P", label: "Present", wrap: "bg-[#DCFCE7] text-[#16A34A]", text: "text-[#14532D]" };
  if (status === "absent") return { mark: "A", label: "Absent", wrap: "bg-[#FEE2E2] text-[#EF4444]", text: "text-[#7F1D1D]" };
  if (status === "late") return { mark: "L", label: "Late", wrap: "bg-[#FEF3C7] text-[#D97706]", text: "text-[#78350F]" };
  if (status === "leave") return { mark: "L", label: "Leave", wrap: "bg-[#FFEDD5] text-[#F97316]", text: "text-[#9A3412]" };
  return { mark: "bar", label: "Not Marked", wrap: "bg-[#F1F3F5] text-[#9AA3AE]", text: "text-[#3E4C5C]" };
}

function weekdayName(ymd: string) {
  return new Date(`${ymd}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
}

function schoolDaysThrough(year: number, month: number, throughDay: number) {
  const last = Math.min(throughDay, new Date(year, month, 0).getDate());
  let count = 0;
  for (let day = 1; day <= last; day += 1) {
    const dow = new Date(year, month - 1, day).getDay();
    if (dow !== 0 && dow !== 6) count += 1;
  }
  return count;
}

function monthOptions() {
  const now = new Date();
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    return { key: `${year}-${month}`, month, year, label: `${MONTHS[date.getMonth()]} ${year}` };
  });
}

function DetailRow({ label, value, pill, strong }: { label: string; value: string; pill?: boolean; strong?: boolean }) {
  const empty = !value || value === "—" || value === "-";
  return (
    <div className="flex items-start justify-between gap-6 border-t border-[#F0F3F6] py-[13px]">
      <span className="shrink-0 text-[14px] text-[#A3ADB8]">{label}</span>
      {pill && !empty ? (
        <span className="rounded-md bg-[#F1F5F9] px-2 py-0.5 text-xs font-semibold text-[#64748B]">{value}</span>
      ) : (
        <span
          className={cn(
            "max-w-[68%] text-right text-[14px] leading-5",
            empty ? "font-medium text-[#C5CED6]" : strong ? "font-bold text-[#111827]" : "font-semibold text-[#1F2937]",
          )}
        >
          {empty ? "-" : value}
        </span>
      )}
    </div>
  );
}

export default function ParentMobileAttendance() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const todayYmd = schoolDayYmd(new Date());
  const [todayYear, todayMonth, todayDay] = todayYmd.split("-").map(Number);
  const options = useMemo(() => monthOptions(), []);
  const [tab, setTab] = useState<PhoneTab>("today");
  const [draftKey, setDraftKey] = useState(`${todayYear}-${todayMonth}`);
  const [draftStatus, setDraftStatus] = useState("all");
  const [appliedKey, setAppliedKey] = useState(`${todayYear}-${todayMonth}`);
  const [appliedStatus, setAppliedStatus] = useState("all");
  const [selectedStudentId, setSelectedStudentId] = useState(() => {
    try {
      return localStorage.getItem("parent_selected_student_id") || "";
    } catch {
      return "";
    }
  });

  const { data: children = [], isLoading: childrenLoading } = useQuery({
    queryKey: ["parent-children-attendance", user?.id],
    queryFn: async () => {
      const { students } = await fetchAcademyStudents({ limit: 100 });
      return students as AcademyStudent[];
    },
    enabled: Boolean(user),
  });

  useEffect(() => {
    if (!children.length) return;
    if (!selectedStudentId || !children.some((child) => child._id === selectedStudentId)) {
      setSelectedStudentId(children[0]._id);
    }
  }, [children, selectedStudentId]);

  useEffect(() => {
    try {
      if (selectedStudentId) localStorage.setItem("parent_selected_student_id", selectedStudentId);
    } catch {
      /* ignore */
    }
  }, [selectedStudentId]);

  const selected = children.find((child) => child._id === selectedStudentId) || null;
  const applied = options.find((option) => option.key === appliedKey) || options[0];

  const { data: monthData, isLoading: monthLoading } = useQuery({
    queryKey: ["parent-attendance-month", selectedStudentId, todayMonth, todayYear],
    queryFn: () => fetchStudentMonthAttendance({ studentId: selectedStudentId, month: todayMonth, year: todayYear }),
    enabled: Boolean(selectedStudentId && todayMonth && todayYear),
  });

  const historyIsCurrent = applied.month === todayMonth && applied.year === todayYear;
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["parent-attendance-month", selectedStudentId, applied.month, applied.year],
    queryFn: () => fetchStudentMonthAttendance({
      studentId: selectedStudentId,
      month: applied.month,
      year: applied.year,
    }),
    enabled: Boolean(selectedStudentId) && !historyIsCurrent,
  });

  const currentRecords = monthData?.records || [];
  const historyRecords = (historyIsCurrent ? monthData?.records : historyData?.records) || [];
  const todayRecord = currentRecords.find((record) => recordDayYmd(record) === todayYmd) || null;
  const summary = monthData?.summary;
  const shortLeave = currentRecords.filter(
    (record) => record.status === "leave" && /short/i.test(record.notes || ""),
  ).length;
  const schoolDays = todayYear && todayMonth ? schoolDaysThrough(todayYear, todayMonth, todayDay || 1) : 0;
  const classLine = selected ? classSectionLine(selected) : "";
  const photo = selected?.photoImage ? resolveUploadUrl(selected.photoImage) : "";
  const mark = statusMark(todayRecord?.status);
  const filteredHistory = historyRecords
    .filter((record) => appliedStatus === "all" || record.status === appliedStatus)
    .slice()
    .sort((a, b) => recordDayYmd(b).localeCompare(recordDayYmd(a)));

  const stats = [
    { label: "PRESENT", value: summary?.present ?? 0, bg: "bg-[#E6F6EB]", color: "text-[#1F9D4A]" },
    { label: "ABSENT", value: summary?.absent ?? 0, bg: "bg-[#FDECEC]", color: "text-[#F04444]" },
    { label: "LEAVE", value: Math.max(0, (summary?.leave ?? 0) - shortLeave), bg: "bg-[#FFF1E4]", color: "text-[#F08A1E]" },
    { label: "LATE", value: summary?.late ?? 0, bg: "bg-[#FFF6DC]", color: "text-[#F0A020]" },
    { label: "SHORT LEAVE", value: shortLeave, bg: "bg-[#FFF8E4]", color: "text-[#F0A020]" },
    { label: "SCHOOL DAYS", value: schoolDays, bg: "bg-[#E7F2FC]", color: "text-[#2F6FE4]" },
  ];

  return (
    <div className="min-h-full bg-white pb-8">
      <ParentMobilePageHeader title="Attendance" onBack={() => navigate("/panel/parent")} />

      <div className="mx-4 flex items-center gap-3 rounded-[18px] bg-[#FEF6DC] px-3.5 py-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-white text-[#D97706]">
          {photo ? (
            <img src={photo} alt="" className="h-full w-full object-cover" />
          ) : (
            <UserRound className="h-5 w-5" strokeWidth={1.75} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          {children.length > 1 ? (
            <ParentOptionField
              sheetTitle="Child"
              value={selectedStudentId}
              onChange={setSelectedStudentId}
              options={children.map((child) => ({ value: child._id, label: child.studentName }))}
              valueClassName="text-[18px] font-extrabold text-[#78350F]"
            />
          ) : (
            <p className="truncate text-[18px] font-extrabold text-[#78350F]">
              {childrenLoading ? "Loading…" : selected?.studentName || "No child linked"}
            </p>
          )}
          <p className="mt-0.5 truncate text-[16px] font-bold text-[#92400E]">{classLine || "—"}</p>
        </div>
      </div>

      <div className="mt-3.5 grid grid-cols-2 border-b border-[#EEF2F6] bg-white">
        {([
          ["today", "Today's Attendance"],
          ["history", "History"],
        ] as const).map(([key, label]) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "relative py-3.5 text-[15px]",
                active ? "font-semibold text-[#0867cc]" : "font-medium text-[#A8B3C0]",
              )}
            >
              {label}
              {active ? <span className="absolute inset-x-7 bottom-0 h-[3px] rounded-full bg-[#0867cc]" /> : null}
            </button>
          );
        })}
      </div>

      {tab === "today" ? (
        <div className="space-y-5 px-4 pt-4">
          <section className="overflow-hidden rounded-[22px] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <div className="bg-[#0867cc] py-3.5 text-center text-[15px] font-semibold text-white">Attendance Status</div>
            <div className="px-4 pb-1 pt-6">
              <div className="mb-5 flex items-center justify-center gap-3">
                <span className={cn("grid h-[58px] w-[58px] place-items-center rounded-full", mark.wrap)}>
                  {mark.mark === "bar" ? (
                    <span className="block h-[3px] w-5 rounded-full bg-[#9AA3AE]" />
                  ) : (
                    <span className="text-xl font-bold">{mark.mark}</span>
                  )}
                </span>
                <span className={cn("text-[22px] font-extrabold tracking-tight", mark.text)}>
                  {monthLoading ? "…" : mark.label}
                </span>
              </div>
              <DetailRow label="Marked By" value={markerName(todayRecord)} />
              <DetailRow label="Marked At" value={todayRecord ? formatClockTime(todayRecord.updatedAt || todayRecord.createdAt) : ""} />
              <DetailRow label="Date" value={todayYmd} strong />
              <DetailRow label="Source" value={sourceLabel(todayRecord?.source)} />
              <DetailRow
                label="Student"
                strong
                value={selected ? `${selected.studentName}${classLine ? ` — ${classLine}` : ""}` : ""}
              />
            </div>
          </section>

          <section>
            <p className="mb-2.5 text-[11px] font-semibold tracking-[0.12em] text-[#A8B3C0]">
              THIS MONTH — {MONTHS[(todayMonth || 1) - 1]?.toUpperCase()} {todayYear}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {stats.map((stat) => (
                <div key={stat.label} className={cn("rounded-[18px] px-4 py-3.5", stat.bg)}>
                  <p className={cn("text-[11px] font-bold tracking-[0.04em]", stat.color)}>{stat.label}</p>
                  <p className={cn("mt-1.5 text-[30px] font-extrabold leading-none", stat.color)}>
                    {monthLoading ? "…" : stat.value}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <div className="space-y-3 px-4 pt-4">
          <section className="rounded-[20px] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
            <div className="grid grid-cols-2 gap-3">
              <ParentOptionField
                label="MONTH"
                sheetTitle="Month"
                value={draftKey}
                onChange={setDraftKey}
                options={options.map((option) => ({ value: option.key, label: option.label }))}
              />
              <ParentOptionField
                label="STATUS"
                sheetTitle="Status"
                value={draftStatus}
                onChange={setDraftStatus}
                options={STATUSES}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setAppliedKey(draftKey);
                setAppliedStatus(draftStatus);
              }}
              className="mt-4 h-11 w-full rounded-xl bg-[#0870da] text-sm font-semibold text-white"
            >
              View History
            </button>
          </section>

          {historyLoading || (historyIsCurrent && monthLoading) ? (
            <div className="h-28 animate-pulse rounded-[20px] bg-white/70" />
          ) : null}
          {!historyLoading && filteredHistory.length === 0 ? (
            <ParentEmptyMessage className="min-h-[40vh]">No attendance for this month.</ParentEmptyMessage>
          ) : null}
          {filteredHistory.map((record) => {
            const ymd = recordDayYmd(record);
            return (
              <article key={record._id} className="rounded-[20px] bg-white px-4 py-3.5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <p className="min-w-0 text-[15px]">
                    <span className="font-bold text-[#0870da]">{weekdayName(ymd)}</span>
                    <span className="font-medium text-[#64748B]"> · {ymd}</span>
                  </p>
                  <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", statusTone(record.status))}>
                    {statusLabel(record.status)}
                  </span>
                </div>
                <DetailRow label="Marked By" value={markerName(record) || "—"} />
                <DetailRow label="Marked At" value={formatClockTime(record.updatedAt || record.createdAt)} />
                <DetailRow label="Source" value={sourceLabel(record.source) || "—"} pill />
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
