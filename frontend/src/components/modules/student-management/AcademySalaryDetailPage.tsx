import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  Calculator,
  Coins,
  Info,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { resolveUploadUrl } from "@/lib/api";
import {
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
        className="h-14 w-14 rounded-full object-cover shrink-0 ring-2 ring-white shadow-sm"
      />
    );
  }
  return (
    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-100 to-blue-200 text-lg font-bold text-[#1d4ed8] ring-2 ring-white shadow-sm">
      {initialOf(name)}
    </span>
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
                    {st.registrationNumber ? (
                      <div className="text-[11px] text-muted-foreground">
                        {st.registrationNumber}
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

export default function AcademySalaryDetailPage({
  salaryId,
  onBack,
}: {
  salaryId: string;
  onBack: () => void;
}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["academy-salary-detail", salaryId],
    queryFn: () => fetchAcademySalary(salaryId),
  });

  const [selectedClassKey, setSelectedClassKey] = useState<string>("");

  const staff = data ? staffFromRecord(data) : null;
  const name = staff?.name ?? "—";
  const role = staff?.role && typeof staff.role === "object" ? staff.role.name : "—";
  const breakdown = data?.calculationBreakdown || [];
  const pct = data?.detailMeta?.teacherPercentage ?? data?.salaryPercentage ?? 0;
  const period = data ? `${MONTH_NAMES[(data.month || 1) - 1]} ${data.year}` : "—";
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
    <div className="min-h-full bg-[#f4f7fb] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to salaries
        </Button>

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
            {/* Header */}
            <div className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/60 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div className="flex min-w-0 items-center gap-4">
                <DetailAvatar name={name} profileImage={staff?.profileImage} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="truncate text-xl font-bold tracking-tight text-[#0f1f3d] sm:text-2xl">
                      {name}
                    </h1>
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
                  <p className="mt-1.5 text-sm text-slate-500">
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

              <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 px-5 py-4 ring-1 ring-emerald-100 sm:min-w-[13rem]">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600">
                  <Wallet className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700/70">
                    Voucher amount
                  </p>
                  <p className="text-2xl font-bold tabular-nums text-emerald-600">
                    {formatRs(data.amount)}
                  </p>
                </div>
              </div>
            </div>

            {data.detailMeta && data.detailMeta.amountMatchesLive === false ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Live recalculation is {formatRs(data.detailMeta.liveAmount)} — fees may have changed
                since this voucher was saved. Use Recalc % from fees on unpaid vouchers to refresh.
              </div>
            ) : null}

            {/* How calculated */}
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

            {breakdown.length === 0 ? (
              <Card className="rounded-2xl border-0 p-10 text-center text-sm text-muted-foreground shadow-sm">
                {data.payType === "percentage"
                  ? "No tuition pool lines yet — assign teaching or wait for enrolled students with monthly fees."
                  : "Fixed salary vouchers do not use tuition pools."}
              </Card>
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
          </>
        )}
      </div>
    </div>
  );
}
