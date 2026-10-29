import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  CalendarCheck,
  Calculator,
  Coins,
  Info,
  Printer,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import FilterToolbar, { FilterToolbarActions } from "@/components/modules/FilterToolbar";
import { cn } from "@/lib/utils";
import { resolveUploadUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { deliverReportBlob, openReportPreviewTab, safeReportFileToken } from "@/lib/reportDownload";
import {
  exportAcademySalarySlip,
  fetchAcademySalary,
  type AcademySalaryBreakdownLine,
  type AcademySalaryRecord,
} from "@/lib/studentManagementApi";
import { MONTH_NAMES } from "./studentDisplayUtils";

function formatRs(n?: number) {
  if (n == null || Number.isNaN(n)) return "Rs —";
  return `Rs ${Number(n).toLocaleString()}`;
}

function initialOf(name?: string) {
  const ch = (name || "?").trim().charAt(0).toUpperCase();
  return ch || "?";
}

function staffFromRecord(rec: AcademySalaryRecord) {
  const s = rec.staffId;
  if (typeof s === "object" && s) return s;
  return null;
}

function classTabKey(line: AcademySalaryBreakdownLine) {
  const cls = String(line.className || "").trim() || "Class";
  const sec = String(line.sectionName || "").trim();
  return sec ? `${cls}||${sec}` : cls;
}

function classTabLabel(line: AcademySalaryBreakdownLine) {
  const cls = String(line.className || "").trim() || "Class";
  const sec = String(line.sectionName || "").trim();
  return sec ? `${cls} ${sec}` : cls;
}

function enrolmentBadgeClass(line: {
  isFullPackage?: boolean;
  subjectCount?: number;
  mode?: string;
}) {
  if (line.mode === "full_share" || line.isFullPackage) {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }
  if ((line.subjectCount ?? 0) <= 1) {
    return "bg-sky-50 text-sky-700 ring-sky-200";
  }
  return "bg-violet-50 text-violet-700 ring-violet-200";
}

function DetailAvatar({ name, profileImage }: { name: string; profileImage?: string }) {
  const src = profileImage ? resolveUploadUrl(profileImage) : null;
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="h-10 w-10 rounded-lg object-cover shrink-0"
      />
    );
  }
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-base font-bold text-primary-foreground">
      {initialOf(name)}
    </span>
  );
}

function FixedClassAllocationCard({ record }: { record: AcademySalaryRecord }) {
  const alloc = record.classAllocation;
  const lines = alloc?.lines || [];
  if (!lines.length) {
    return (
      <Card className="rounded-2xl border-0 p-10 text-center text-sm text-muted-foreground shadow-sm">
        No teaching assignments found — the full fixed salary of {formatRs(record.amount)} is paid as
        one amount.
      </Card>
    );
  }
  return (
    <div className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/60 sm:p-6">
      <div>
        <h2 className="text-lg font-bold text-[#0f1f3d]">Fixed salary by class</h2>
        <p className="text-sm text-slate-500">
          {alloc?.basis === "periods"
            ? "Split in proportion to class periods scheduled this month"
            : "Split equally across assigned classes (no timetable periods this month)"}
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs text-slate-500">
              <th className="px-3 py-2.5 font-medium">Class</th>
              <th className="px-3 py-2.5 font-medium">Subject</th>
              <th className="px-3 py-2.5 font-medium text-right">Students</th>
              <th className="px-3 py-2.5 font-medium text-right">Periods</th>
              <th className="px-3 py-2.5 font-medium text-right">Share</th>
              <th className="px-3 py-2.5 font-medium text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, idx) => (
              <tr key={`${l.subjectId || "s"}-${idx}`} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-3 font-medium text-[#1a2b4b]">
                  {[l.className, l.sectionName].filter(Boolean).join(" ") || "—"}
                </td>
                <td className="px-3 py-3 text-slate-600">{l.subjectName || "—"}</td>
                <td className="px-3 py-3 text-right tabular-nums">{l.studentCount}</td>
                <td className="px-3 py-3 text-right tabular-nums">{l.periods}</td>
                <td className="px-3 py-3 text-right tabular-nums">{l.sharePercent}%</td>
                <td className="px-3 py-3 text-right tabular-nums font-semibold text-emerald-600">
                  {formatRs(l.salary)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AttendanceCard({ record }: { record: AcademySalaryRecord }) {
  const cls = record.attendance?.classes;
  const daily = record.attendance?.daily;
  const s = cls?.summary;
  const hasClasses = Boolean(s && s.totalClasses > 0);
  const hasDaily = Boolean(daily && daily.totalDays > 0);
  const tiles = s
    ? [
        {
          label: cls?.attendanceType === "daily" ? "Working days" : "Classes",
          value: s.totalClasses,
          tone: "text-[#0f1f3d]",
        },
        { label: "Present", value: s.present, tone: "text-emerald-600" },
        { label: "Late", value: s.late, tone: "text-amber-600" },
        { label: "Absent", value: s.absent, tone: "text-red-600" },
        { label: "Leave", value: s.leave, tone: "text-slate-600" },
        { label: "Attendance", value: `${s.attendancePercent}%`, tone: "text-[#2563eb]" },
      ]
    : [];

  return (
    <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/60 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-[#2563eb]">
          <CalendarCheck className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-[#0f1f3d]">Attendance this month</h2>
          <p className="text-sm text-slate-500">
            {cls?.sessionName ? `Session ${cls.sessionName} · ` : ""}
            From the published timetable up to today; unmarked periods count as present
          </p>
        </div>
      </div>

      {!hasClasses && !hasDaily ? (
        <p className="text-sm text-muted-foreground">No attendance was recorded for this month.</p>
      ) : null}

      {hasClasses ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {tiles.map((t) => (
            <div
              key={t.label}
              className="rounded-xl bg-slate-50 px-3 py-2.5 text-center ring-1 ring-slate-200/70"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {t.label}
              </p>
              <p className={cn("text-lg font-bold tabular-nums", t.tone)}>{t.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {hasClasses && cls && cls.attendanceType !== "daily" && cls.byClass.length ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs text-slate-500">
                <th className="px-3 py-2.5 font-medium">Class</th>
                <th className="px-3 py-2.5 font-medium">Subject</th>
                <th className="px-3 py-2.5 font-medium text-right">Classes</th>
                <th className="px-3 py-2.5 font-medium text-right">Present</th>
                <th className="px-3 py-2.5 font-medium text-right">Late</th>
                <th className="px-3 py-2.5 font-medium text-right">Absent</th>
                <th className="px-3 py-2.5 font-medium text-right">Leave</th>
                <th className="px-3 py-2.5 font-medium text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {cls.byClass.map((r, idx) => (
                <tr
                  key={`${r.className}-${r.sectionName}-${r.subjectName}-${idx}`}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="px-3 py-2.5 font-medium text-[#1a2b4b]">
                    {[r.className, r.sectionName].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">{r.subjectName || "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.totalClasses}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600">{r.present}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-amber-600">{r.late}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-red-600">{r.absent}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.leave}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                    {r.attendancePercent}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {hasDaily && daily ? (
        <p className="text-sm text-slate-600">
          Daily check-in: {daily.totalDays} day{daily.totalDays === 1 ? "" : "s"} recorded ·{" "}
          {daily.present} present · {daily.late} late · {daily.half_day} half day · {daily.absent}{" "}
          absent · {daily.leave} leave
        </p>
      ) : null}
    </div>
  );
}

/** Compact table used from list expand + detail page. */
export function StudentPoolTable({
  line,
  subjectLabel,
}: {
  line: AcademySalaryBreakdownLine;
  subjectLabel: string;
}) {
  const students = line.students || [];
  const poolTotal = students.reduce((s, row) => s + (Number(row.contribution) || 0), 0);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50/90 px-4 py-3">
        <p className="text-sm font-semibold text-[#1a2b4b]">
          {subjectLabel}
          {line.className || line.sectionName
            ? `, ${[line.className, line.sectionName].filter(Boolean).join(" ")}`
            : ""}
        </p>
        <p className="text-[11px] text-muted-foreground">
          One line per student · how each fee feeds this subject pool
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/50 text-left text-xs text-slate-500">
              <th className="px-3 py-2.5 font-medium w-10">#</th>
              <th className="px-3 py-2.5 font-medium">Student</th>
              <th className="px-3 py-2.5 font-medium text-right">Tuition</th>
              <th className="px-3 py-2.5 font-medium">Enrolment</th>
              <th className="px-3 py-2.5 font-medium">How it&apos;s counted</th>
              <th className="px-3 py-2.5 font-medium text-right">
                Goes to {line.subjectName || "subject"}
              </th>
            </tr>
          </thead>
          <tbody>
            {students.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No students in this pool.
                </td>
              </tr>
            ) : (
              students.map((st, idx) => (
                <tr
                  key={st.studentId || `${st.studentName}-${idx}`}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="px-3 py-3 text-slate-400 tabular-nums">{idx + 1}</td>
                  <td className="px-3 py-3">
                    <div className="font-medium text-[#1a2b4b]">{st.studentName || "—"}</div>
                    {(st.rollNumber || st.registrationNumber) ? (
                      <div className="text-[11px] text-muted-foreground">
                        {st.rollNumber || st.registrationNumber}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                    {formatRs(st.tuition)}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                        enrolmentBadgeClass(st),
                      )}
                    >
                      {st.enrolment || "—"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-600">{st.howCounted || "—"}</td>
                  <td className="px-3 py-3 text-right tabular-nums font-semibold text-[#1a2b4b]">
                    {formatRs(st.contribution)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/80 px-4 py-3 text-xs text-slate-600">
        <span>
          Teacher {line.teacherCutPercent ?? "—"}% of pool {formatRs(line.pool)}
        </span>
        <span className="font-semibold text-[#2563eb]">
          Total pool: {formatRs(poolTotal || line.pool)}
        </span>
      </div>
    </div>
  );
}

export default function AcademySalaryDetailPage({ salaryId }: { salaryId: string }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["academy-salary-detail", salaryId],
    queryFn: () => fetchAcademySalary(salaryId),
  });

  const [selectedClassKey, setSelectedClassKey] = useState<string>("");
  const [exportingSlip, setExportingSlip] = useState(false);
  const { toast } = useToast();

  const staff = data ? staffFromRecord(data) : null;
  const name = staff?.name ?? "—";
  const role = staff?.role && typeof staff.role === "object" ? staff.role.name : "—";
  const breakdown = data?.calculationBreakdown || [];
  const pct = data?.detailMeta?.teacherPercentage ?? data?.salaryPercentage ?? 0;
  const period = data ? `${MONTH_NAMES[(data.month || 1) - 1]} ${data.year}` : "—";
  const isPercentage = data?.payType === "percentage" || data?.calculationSource === "tuition_pool";

  const handleSlipExport = async () => {
    if (!data) return;
    setExportingSlip(true);
    const preview = openReportPreviewTab("pdf");
    try {
      const blob = await exportAcademySalarySlip(data._id);
      const mode = deliverReportBlob(
        blob,
        `Salary-Slip_${safeReportFileToken(name, "staff")}_${period.replace(" ", "-")}.pdf`,
        "pdf",
        preview,
      );
      toast({
        title: mode === "preview" ? "Salary slip preview opened" : "Salary slip downloaded",
        description:
          mode === "preview" ? "Use Print or Download from the preview window." : undefined,
      });
    } catch (e) {
      preview?.close();
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : "Could not generate salary slip",
        variant: "destructive",
      });
    } finally {
      setExportingSlip(false);
    }
  };
  const allClassesTotal = breakdown.reduce((s, line) => s + (Number(line.salary) || 0), 0);

  const classTabs = useMemo(() => {
    const map = new Map<
      string,
      { key: string; label: string; lines: AcademySalaryBreakdownLine[]; salary: number }
    >();
    for (const line of breakdown) {
      const key = classTabKey(line);
      const existing = map.get(key);
      if (existing) {
        existing.lines.push(line);
        existing.salary += Number(line.salary) || 0;
      } else {
        map.set(key, {
          key,
          label: classTabLabel(line),
          lines: [line],
          salary: Number(line.salary) || 0,
        });
      }
    }
    return [...map.values()];
  }, [breakdown]);

  useEffect(() => {
    if (!classTabs.length) {
      setSelectedClassKey("");
      return;
    }
    setSelectedClassKey((prev) =>
      prev && classTabs.some((t) => t.key === prev) ? prev : classTabs[0].key,
    );
  }, [data?._id, classTabs]);

  const activeTab = classTabs.find((t) => t.key === selectedClassKey) || classTabs[0];
  const activeLines = activeTab?.lines || [];
  const activeSalary = activeLines.reduce((s, line) => s + (Number(line.salary) || 0), 0);
  const activePool = activeLines.reduce((s, line) => s + (Number(line.pool) || 0), 0);
  const activeStudents = activeLines.reduce(
    (s, line) => s + (line.studentCount ?? line.students?.length ?? 0),
    0,
  );
  const primarySubject =
    activeLines.length === 1
      ? activeLines[0].subjectName
      : activeLines.map((l) => l.subjectName).filter(Boolean).join(" · ");

  return (
    <div className="min-h-full px-4 py-6 sm:px-6 lg:px-8">
      <div className="w-full space-y-5">
        {isLoading ? (
          <Card className="rounded-2xl border-0 p-10 text-center text-sm text-muted-foreground shadow-sm">
            Loading salary detail…
          </Card>
        ) : isError || !data ? (
          <Card className="rounded-2xl border-0 p-10 text-center text-sm text-destructive shadow-sm">
            {error instanceof Error ? error.message : "Could not load salary detail."}
          </Card>
        ) : (
          <>
            {/* Compact theme header — matches Staff Salary / Subjects */}
            <div className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <DetailAvatar name={name} profileImage={staff?.profileImage} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight">
                        {name}
                      </h2>
                      <span className="inline-flex items-center rounded-full bg-[#dbeafe] px-2.5 py-0.5 text-xs font-semibold capitalize text-[#1d4ed8]">
                        {role}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize",
                          data.status === "paid" && "bg-emerald-50 text-emerald-700",
                          data.status === "pending" && "bg-orange-50 text-orange-600",
                          data.status === "cancelled" && "bg-slate-100 text-slate-500",
                        )}
                      >
                        {data.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500">
                      <span className="font-medium text-slate-600">{data.voucherNumber || "—"}</span>
                      <span className="mx-1.5 text-slate-300">·</span>
                      {period}
                      {data.payType === "percentage" || data.calculationSource === "tuition_pool" ? (
                        <>
                          <span className="mx-1.5 text-slate-300">·</span>
                          Teacher percentage {pct}%
                        </>
                      ) : (
                        <>
                          <span className="mx-1.5 text-slate-300">·</span>
                          Fixed pay
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2.5 rounded-lg bg-primary/10 px-3 py-2">
                  <Wallet className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#1a2b4b]/70">
                      Voucher amount
                    </p>
                    <p className="text-lg font-bold tabular-nums leading-tight text-emerald-600">
                      {formatRs(data.amount)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Action bar — same card + toolbar as the list page filter bar */}
            <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
              <FilterToolbar>
                <p className="text-sm text-slate-500">
                  Salary slip for <span className="font-medium text-slate-700">{period}</span>
                </p>
                <FilterToolbarActions>
                  <Button
                    type="button"
                    className="gap-2 h-10 shrink-0 rounded-md"
                    disabled={exportingSlip}
                    onClick={handleSlipExport}
                  >
                    <Printer className="h-4 w-4" />
                    {exportingSlip ? "Preparing PDF…" : "Salary Slip with Student Details (PDF)"}
                  </Button>
                </FilterToolbarActions>
              </FilterToolbar>
            </div>

            {data.detailMeta && data.detailMeta.amountMatchesLive === false ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Live recalculation is {formatRs(data.detailMeta.liveAmount)} — fees may have changed
                since this voucher was saved. Use Recalc % from fees on unpaid vouchers to refresh.
              </div>
            ) : null}

            {/* How calculated */}
            {isPercentage ? (
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-sky-50 via-blue-50 to-indigo-50 p-5 shadow-sm ring-1 ring-sky-100/80 sm:p-6">
              <div className="pointer-events-none absolute -right-6 -top-6 hidden h-36 w-36 opacity-[0.18] sm:block">
                <Calculator className="h-full w-full text-sky-700" strokeWidth={1} />
              </div>
              <div className="pointer-events-none absolute bottom-3 right-16 hidden opacity-[0.2] sm:block">
                <Coins className="h-14 w-14 text-amber-500" strokeWidth={1.25} />
              </div>
              <div className="relative flex gap-3 pr-0 sm:pr-28">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white shadow-sm">
                  <Info className="h-4 w-4" strokeWidth={2.5} />
                </span>
                <div className="min-w-0 space-y-2.5">
                  <h2 className="text-base font-bold text-[#0f2a4a]">How this salary is calculated</h2>
                  <p className="text-sm leading-relaxed text-sky-950/85">
                    {data.detailMeta?.formula ||
                      "Salary = teacher % × Σ (tuition × weight). Full package uses subject share %; part-time splits tuition equally across enrolled subjects. Admission fee is never included."}
                  </p>
                  <ul className="grid gap-1.5 text-sm text-sky-950/80 sm:grid-cols-1">
                    <li className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                      <span>
                        <span className="font-semibold text-sky-950">Full package</span> students:
                        subject share % of monthly tuition (e.g. Biology 15% of Rs 8,500 = Rs 1,275).
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                      <span>
                        <span className="font-semibold text-sky-950">One subject only</span>: whole
                        monthly tuition goes to that subject (tuition ÷ 1).
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                      <span>
                        <span className="font-semibold text-sky-950">Part-time · multiple subjects</span>
                        : tuition split equally (tuition ÷ number of enrolled subjects).
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                      <span>Admission fee is never included — monthly tuition only.</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
            ) : null}

            {breakdown.length === 0 ? (
              isPercentage ? (
                <Card className="rounded-2xl border-0 p-10 text-center text-sm text-muted-foreground shadow-sm">
                  No tuition pool lines yet — assign teaching or wait for enrolled students with monthly
                  fees.
                </Card>
              ) : (
                <FixedClassAllocationCard record={data} />
              )
            ) : (
              <>
                {/* Classes selector */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-[#0f1f3d]">Classes</h2>
                      <p className="text-sm text-slate-500">
                        Select a class to see its student-by-student calculation
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {classTabs.map((tab) => {
                        const selected = tab.key === (activeTab?.key || "");
                        return (
                          <button
                            key={`pill-${tab.key}`}
                            type="button"
                            onClick={() => setSelectedClassKey(tab.key)}
                            className={cn(
                              "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                              selected
                                ? "bg-[#2563eb] text-white shadow-sm"
                                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50",
                            )}
                          >
                            {tab.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {classTabs.map((tab) => {
                      const selected = tab.key === (activeTab?.key || "");
                      return (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setSelectedClassKey(tab.key)}
                          className={cn(
                            "flex items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm transition-all",
                            selected
                              ? "ring-2 ring-[#2563eb] shadow-md shadow-blue-500/10"
                              : "ring-1 ring-slate-200/80 hover:ring-slate-300",
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                              selected
                                ? "bg-[#2563eb] text-white"
                                : "bg-slate-100 text-slate-500",
                            )}
                          >
                            <Users className="h-5 w-5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-[#0f1f3d]">{tab.label}</p>
                            <p
                              className={cn(
                                "text-sm font-semibold tabular-nums",
                                selected ? "text-emerald-600" : "text-slate-500",
                              )}
                            >
                              {formatRs(tab.salary)}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Selected class calculation */}
                {activeTab ? (
                  <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/60 sm:p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-[#2563eb]">
                          <BookOpen className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <h3 className="text-lg font-bold text-[#0f1f3d]">
                            {activeTab.label}
                            {primarySubject ? ` · ${primarySubject}` : ""}
                          </h3>
                          <p className="mt-0.5 text-sm text-slate-500">
                            {activeStudents} student{activeStudents === 1 ? "" : "s"}
                            <span className="mx-1.5 text-slate-300">·</span>
                            Pool {formatRs(activePool)}
                            <span className="mx-1.5 text-slate-300">·</span>
                            Teacher {pct}%
                          </p>
                        </div>
                      </div>
                      <div className="rounded-xl bg-emerald-50 px-4 py-3 text-right ring-1 ring-emerald-100 sm:min-w-[11rem]">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700/70">
                          Salary from this class
                        </p>
                        <p className="text-xl font-bold tabular-nums text-emerald-600">
                          {formatRs(activeSalary)}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {activeLines.map((line, idx) => (
                        <StudentPoolTable
                          key={`${line.subjectId || "s"}-${idx}`}
                          line={line}
                          subjectLabel={line.subjectName || "Subject"}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}

            {/* Sum of all classes */}
            {breakdown.length > 0 ? (
              <div className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/60 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    <Wallet className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-bold text-[#0f1f3d]">Sum of all classes</p>
                    <p className="text-sm text-slate-500">
                      Teacher {pct}% applied on each pool, then added together
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-100">
                  <Coins className="h-4 w-4 text-emerald-600" />
                  <p className="text-xl font-bold tabular-nums text-emerald-600">
                    {formatRs(allClassesTotal)}
                  </p>
                </div>
              </div>
            ) : null}

            <AttendanceCard record={data} />
          </>
        )}
      </div>
    </div>
  );
}
