import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  fetchAcademyClasses,
  fetchDiscountReport,
  type DiscountReportRow,
} from "@/lib/studentManagementApi";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import { formatDate, formatPkr } from "./studentDisplayUtils";
import PageSizeSelect, { DEFAULT_PAGE_SIZE } from "./PageSizeSelect";

const DISCOUNT_TYPE_LABELS: Record<DiscountReportRow["discountType"], string> = {
  monthly_only: "Monthly fee only",
  admission_only: "Admission fee only",
  both: "Both fees",
  legacy_combined: "Legacy combined",
  none: "None",
};

export default function AcademyDiscountReport() {
  const [search, setSearch] = useState("");
  const [classId, setClassId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const { data: classes = [] } = useQuery({
    queryKey: ["academy-classes-discount-report"],
    queryFn: fetchAcademyClasses,
    retry: false,
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ["academy-discount-report", page, pageSize, classId, search],
    queryFn: () =>
      fetchDiscountReport({
        page,
        limit: pageSize,
        classId: classId || undefined,
        search: search.trim() || undefined,
      }),
    retry: false,
  });

  const summary = data?.summary;
  const items = data?.items ?? [];
  const pagination = data?.pagination;

  const staffRows = useMemo(() => summary?.byStaff ?? [], [summary?.byStaff]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-semibold">Fee discount report</h2>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <PanelSearchBar
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search student name, ID, phone…"
          className="max-w-md flex-1"
        />
        <div className="space-y-1 min-w-[180px]">
          <Label htmlFor="discount-class-filter" className="text-xs">
            Class
          </Label>
          <select
            id="discount-class-filter"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c._id} value={c._id}>
                {c.className}
              </option>
            ))}
          </select>
        </div>
      </div>

      {summary ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Students with discount</div>
              <div className="font-display text-2xl font-bold text-primary mt-1">{summary.studentCount}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Monthly fee discounts</div>
              <div className="font-display text-2xl font-bold text-primary mt-1">
                {formatPkr(summary.totalMonthlyDiscount)}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Admission fee discounts</div>
              <div className="font-display text-2xl font-bold text-primary mt-1">
                {formatPkr(summary.totalAdmissionDiscount)}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Total discounts</div>
              <div className="font-display text-2xl font-bold text-accent mt-1">
                {formatPkr(summary.totalDiscount)}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Card className="p-3">
              <span className="text-muted-foreground">Monthly only</span>
              <p className="font-semibold">{summary.monthlyOnlyCount}</p>
            </Card>
            <Card className="p-3">
              <span className="text-muted-foreground">Admission only</span>
              <p className="font-semibold">{summary.admissionOnlyCount}</p>
            </Card>
            <Card className="p-3">
              <span className="text-muted-foreground">Both fees</span>
              <p className="font-semibold">{summary.bothCount}</p>
            </Card>
            <Card className="p-3">
              <span className="text-muted-foreground">Legacy combined</span>
              <p className="font-semibold">{summary.legacyCount}</p>
            </Card>
          </div>
        </>
      ) : null}

      {staffRows.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Discounts by staff</h3>
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  <th className="p-3 font-medium">Staff</th>
                  <th className="p-3 font-medium">Students</th>
                  <th className="p-3 font-medium">Monthly</th>
                  <th className="p-3 font-medium">Admission</th>
                  <th className="p-3 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {staffRows.map((row) => (
                  <tr key={row.staffId ?? row.staffName} className="border-b last:border-0">
                    <td className="p-3">
                      <div className="font-medium">{row.staffName}</div>
                      {row.staffEmail ? (
                        <div className="text-xs text-muted-foreground">{row.staffEmail}</div>
                      ) : null}
                    </td>
                    <td className="p-3">{row.studentCount}</td>
                    <td className="p-3">{formatPkr(row.monthlyDiscount)}</td>
                    <td className="p-3">{formatPkr(row.admissionDiscount)}</td>
                    <td className="p-3 font-semibold">{formatPkr(row.totalDiscount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Student discount details</h3>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4">Loading discount report…</p>
        ) : isError ? (
          <p className="text-sm text-muted-foreground py-4">
            Discount report unavailable. You may need fee report permissions.
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No discounts recorded yet.</p>
        ) : (
          <>
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left">
                    <th className="p-3 font-medium">Student</th>
                    <th className="p-3 font-medium">Class</th>
                    <th className="p-3 font-medium">Type</th>
                    <th className="p-3 font-medium">Monthly</th>
                    <th className="p-3 font-medium">Admission</th>
                    <th className="p-3 font-medium">Total</th>
                    <th className="p-3 font-medium">Granted by</th>
                    <th className="p-3 font-medium">Enrolled</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row._id} className="border-b last:border-0">
                      <td className="p-3">
                        <div className="font-medium">{row.studentName}</div>
                        <div className="text-xs text-muted-foreground">{row.studentId}</div>
                      </td>
                      <td className="p-3">{row.className || "—"}</td>
                      <td className="p-3">{DISCOUNT_TYPE_LABELS[row.discountType]}</td>
                      <td className="p-3">{formatPkr(row.monthlyFeeDiscount)}</td>
                      <td className="p-3">{formatPkr(row.admissionFeeDiscount)}</td>
                      <td className="p-3 font-semibold">{formatPkr(row.totalDiscount)}</td>
                      <td className="p-3">{row.grantedBy?.name || "—"}</td>
                      <td className="p-3">{formatDate(row.enrolledAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pagination ? (
              <div className="flex items-center justify-end gap-3 pt-2 flex-wrap">
                <PageSizeSelect
                  value={pageSize}
                  onChange={(n) => {
                    setPageSize(n);
                    setPage(1);
                  }}
                />
                {pagination.pages > 1 ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {pagination.page} of {pagination.pages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= pagination.pages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
