import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Coins, Info } from "lucide-react";
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

function enrolmentBadgeClass(line: { isFullPackage?: boolean; subjectCount?: number; mode?: string }) {
  if (line.mode === "full_share" || line.isFullPackage) {
    return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  }
  if ((line.subjectCount ?? 0) <= 1) {
    return "bg-sky-50 text-sky-800 ring-sky-200";
  }
  return "bg-violet-50 text-violet-800 ring-violet-200";
}

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
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 bg-slate-50/80 px-3 py-2">
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
      <table className="w-full min-w-[42rem] text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="px-3 py-2 font-medium">Student</th>
            <th className="px-3 py-2 font-medium text-right">Tuition</th>
            <th className="px-3 py-2 font-medium">Enrolment</th>
            <th className="px-3 py-2 font-medium">How it&apos;s counted</th>
            <th className="px-3 py-2 font-medium text-right">
              Goes to {line.subjectName || "subject"}
            </th>
          </tr>
        </thead>
        <tbody>
          {students.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                No students in this pool.
              </td>
            </tr>
          ) : (
            students.map((st, idx) => (
              <tr
                key={st.studentId || `${st.studentName}-${idx}`}
                className="border-b border-slate-100 last:border-0"
              >
                <td className="px-3 py-2.5">
                  <div className="font-medium text-[#1a2b4b]">{st.studentName || "—"}</div>
                  {st.registrationNumber ? (
                    <div className="text-[10px] text-muted-foreground">{st.registrationNumber}</div>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                  {formatRs(st.tuition)}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
                      enrolmentBadgeClass(st),
                    )}
                  >
                    {st.enrolment || "—"}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-slate-600">{st.howCounted || "—"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-[#1a2b4b]">
                  {formatRs(st.contribution)}
                </td>
              </tr>
            ))
          )}
          {students.length > 0 ? (
            <tr className="bg-slate-50/90">
              <td colSpan={4} className="px-3 py-2.5 text-right text-xs font-semibold text-slate-600">
                Total pool
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-sm font-bold text-[#16A66A]">
                {formatRs(poolTotal || line.pool)}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 text-[11px] text-slate-600">
        <span>
          Teacher {line.teacherCutPercent ?? "—"}% of pool {formatRs(line.pool)}
        </span>
        <span className="font-semibold text-[#16A66A]">
          Salary from this class: {formatRs(line.salary)}
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

  return (
    <div className="min-h-full space-y-4 bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 border-slate-300 bg-white text-slate-800 hover:bg-slate-50 hover:text-slate-900"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to salaries
        </Button>
      </div>

      {isLoading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Loading salary detail…</Card>
      ) : isError || !data ? (
        <Card className="p-8 text-center text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load salary detail."}
        </Card>
      ) : (
        <>
          <div className="rounded-xl border-0 bg-white px-4 py-4 shadow-sm ring-1 ring-black/[0.04] sm:px-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary">
                  <Coins className="h-6 w-6 text-primary-foreground" strokeWidth={2.25} />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl font-bold tracking-tight text-[#1a2b4b]">{name}</h1>
                    <span className="inline-flex items-center rounded-full bg-[#dbeafe] px-2.5 py-0.5 text-xs font-semibold capitalize text-[#1d4ed8]">
                      {role}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize",
                        data.status === "paid" && "bg-emerald-50 text-emerald-700",
                        data.status === "pending" && "bg-orange-50 text-orange-700",
                        data.status === "cancelled" && "bg-muted text-muted-foreground",
                      )}
                    >
                      {data.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {data.voucherNumber || "—"} · {period}
                    {data.payType === "percentage" || data.calculationSource === "tuition_pool"
                      ? ` · Teacher percentage ${pct}%`
                      : " · Fixed pay"}
                  </p>
                  {staff?.profileImage ? (
                    <img
                      src={resolveUploadUrl(staff.profileImage) || undefined}
                      alt=""
                      className="mt-2 h-10 w-10 rounded-full object-cover ring-1 ring-slate-200"
                    />
                  ) : null}
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 px-4 py-3 text-right ring-1 ring-slate-200/80">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Voucher amount
                </p>
                <p className="text-2xl font-bold tabular-nums text-[#16A66A]">
                  {formatRs(data.amount)}
                </p>
                {data.detailMeta && data.detailMeta.amountMatchesLive === false ? (
                  <p className="mt-1 text-[11px] text-amber-700">
                    Live recalculation is {formatRs(data.detailMeta.liveAmount)} — fees may have
                    changed since this voucher was saved. Use Recalc % from fees on unpaid
                    vouchers to refresh.
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <Card className="border-sky-100 bg-sky-50/60 p-4 shadow-sm">
            <div className="flex gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
              <div className="space-y-2 text-sm text-sky-950">
                <p className="font-semibold">How this salary is calculated</p>
                <p className="text-sky-900/90">
                  {data.detailMeta?.formula ||
                    "Salary = teacher% × sum of subject pools from monthly tuition."}
                </p>
                <ul className="list-disc space-y-1 pl-4 text-xs text-sky-900/80">
                  <li>
                    <span className="font-medium">Full package</span> students: subject share % of
                    their monthly tuition (e.g. Biology 15% of Rs 8,500 = Rs 1,275).
                  </li>
                  <li>
                    <span className="font-medium">One subject only</span>: whole monthly tuition
                    goes to that subject (tuition ÷ 1).
                  </li>
                  <li>
                    <span className="font-medium">Part-time · multiple subjects</span>: tuition
                    split equally (tuition ÷ number of enrolled subjects).
                  </li>
                  <li>Admission fee is never included — monthly tuition only.</li>
                </ul>
              </div>
            </div>
          </Card>

          {breakdown.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              {data.payType === "percentage"
                ? "No tuition pool lines yet — assign teaching or wait for enrolled students with monthly fees."
                : "Fixed salary vouchers do not use tuition pools."}
            </Card>
          ) : (
            <Card className="overflow-hidden shadow-sm">
              <div className="border-b border-slate-200 bg-white px-4 pt-3 sm:px-5">
                <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                      Classes
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Select a class to see its student-by-student calculation
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {classTabs.length} class{classTabs.length === 1 ? "" : "es"}
                  </p>
                </div>
                <div
                  className="-mx-1 flex gap-1 overflow-x-auto pb-0"
                  role="tablist"
                  aria-label="Classes"
                >
                  {classTabs.map((tab) => {
                    const selected = tab.key === (activeTab?.key || "");
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => setSelectedClassKey(tab.key)}
                        className={cn(
                          "relative shrink-0 rounded-t-md px-3.5 py-2.5 text-sm font-semibold transition-colors",
                          selected
                            ? "bg-slate-50 text-[#1a2b4b]"
                            : "text-slate-500 hover:bg-slate-50/80 hover:text-slate-800",
                        )}
                      >
                        <span className="block whitespace-nowrap">{tab.label}</span>
                        <span
                          className={cn(
                            "mt-0.5 block text-[10px] font-medium tabular-nums",
                            selected ? "text-[#16A66A]" : "text-slate-400",
                          )}
                        >
                          {formatRs(tab.salary)}
                        </span>
                        {selected ? (
                          <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4 bg-slate-50/60 p-4 sm:p-5" role="tabpanel">
                {activeTab ? (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-bold text-[#1a2b4b]">
                          {activeTab.label}
                          {activeLines.length === 1 && activeLines[0].subjectName
                            ? ` · ${activeLines[0].subjectName}`
                            : ""}
                        </h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {activeStudents} student{activeStudents === 1 ? "" : "s"}
                          {" · "}
                          Pool {formatRs(activePool)}
                          {" · "}
                          Teacher {pct}%
                        </p>
                      </div>
                      <div className="rounded-lg bg-white px-3 py-2 text-right ring-1 ring-slate-200/80">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                          Salary from this class
                        </p>
                        <p className="text-lg font-bold tabular-nums text-[#16A66A]">
                          {formatRs(activeSalary)}
                        </p>
                      </div>
                    </div>

                    {activeLines.map((line, idx) => (
                      <StudentPoolTable
                        key={`${line.subjectId || "s"}-${idx}`}
                        line={line}
                        subjectLabel={line.subjectName || "Subject"}
                      />
                    ))}
                  </>
                ) : null}
              </div>
            </Card>
          )}

          {breakdown.length > 0 ? (
            <Card className="flex flex-wrap items-center justify-between gap-3 p-4 shadow-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Sum of all classes
                </p>
                <p className="text-sm text-muted-foreground">
                  Teacher {pct}% applied on each pool, then added together
                </p>
              </div>
              <p className="text-xl font-bold tabular-nums text-[#16A66A]">
                {formatRs(breakdown.reduce((s, line) => s + (Number(line.salary) || 0), 0))}
              </p>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
