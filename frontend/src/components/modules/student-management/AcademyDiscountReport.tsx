import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  fetchAcademyClasses,
  fetchConcessionCategories,
  fetchDiscountReport,
  type DiscountReliefFilter,
  type DiscountReportRow,
} from "@/lib/studentManagementApi";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import ClassProgramSelect from "@/components/modules/ClassProgramSelect";
import { formatDate, formatPkr } from "./studentDisplayUtils";
import { DEFAULT_PAGE_SIZE } from "./PageSizeSelect";
import ListPagination from "./ListPagination";

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
  const [reliefType, setReliefType] = useState<DiscountReliefFilter>("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const { data: classes = [] } = useQuery({
    queryKey: ["academy-classes-discount-report"],
    queryFn: fetchAcademyClasses,
    retry: false,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["concession-categories"],
    queryFn: fetchConcessionCategories,
    retry: false,
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ["academy-discount-report", page, pageSize, classId, search, reliefType, category],
    queryFn: () =>
      fetchDiscountReport({
        page,
        limit: pageSize,
        classId: classId || undefined,
        search: search.trim() || undefined,
        reliefType: reliefType || undefined,
        concessionCategory: reliefType === "concession" && category ? category : undefined,
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
        <div className="w-full min-w-0 space-y-1 sm:w-auto sm:min-w-[16.5rem]">
          <ClassProgramSelect
            id="discount-class-filter"
            className="w-full"
            value={classId}
            onChange={(v) => {
              setClassId(v);
              setPage(1);
            }}
            classes={classes}
            allowAll
          />
        </div>
        <div className="w-full sm:w-auto space-y-1">
          <Label htmlFor="discount-relief-filter" className="sr-only">
            Relief type
          </Label>
          <select
            id="discount-relief-filter"
            className="h-10 w-full sm:w-44 rounded-md border border-input bg-background px-3 text-sm"
            value={reliefType}
            onChange={(e) => {
              setReliefType(e.target.value as DiscountReliefFilter);
              setCategory("");
              setPage(1);
            }}
          >
            <option value="">All relief types</option>
            <option value="concession">Concession</option>
            <option value="exemption">Exemption</option>
            <option value="legacy">Legacy discount</option>
            <option value="none">No tuition relief</option>
          </select>
        </div>
        {reliefType === "concession" ? (
          <div className="w-full sm:w-auto space-y-1">
            <Label htmlFor="discount-category-filter" className="sr-only">
              Concession category
            </Label>
            <select
              id="discount-category-filter"
              className="h-10 w-full sm:w-52 rounded-md border border-input bg-background px-3 text-sm"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c._id} value={c.key}>
                  {c.name} ({Number(c.discountPercent) || 0}%){c.isActive ? "" : " — inactive"}
                </option>
              ))}
            </select>
          </div>
        ) : null}
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <Card className="p-3">
              <span className="text-muted-foreground">Concessions</span>
              <p className="font-semibold">
                {summary.concessionCount ?? 0} students · {formatPkr(summary.totalConcessionAmount ?? 0)} / month
              </p>
            </Card>
            <Card className="p-3">
              <span className="text-muted-foreground">Exemptions</span>
              <p className="font-semibold">
                {summary.exemptionCount ?? 0} students · {formatPkr(summary.totalExemptionAmount ?? 0)} / month
              </p>
            </Card>
            <Card className="p-3">
              <span className="text-muted-foreground">Legacy discounts (no category)</span>
              <p className="font-semibold">
                {summary.legacyReliefCount ?? 0} students · {formatPkr(summary.totalLegacyReliefAmount ?? 0)} / month
              </p>
            </Card>
          </div>
        </>
      ) : null}

      {(summary?.byCategory?.length ?? 0) > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Concessions by category</h3>
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  <th className="p-3 font-medium">Category</th>
                  <th className="p-3 font-medium">Students</th>
                  <th className="p-3 font-medium">Tuition relief / month</th>
                </tr>
              </thead>
              <tbody>
                {summary!.byCategory!.map((row) => (
                  <tr key={row.concessionCategory || "none"} className="border-b last:border-0">
                    <td className="p-3 font-medium">{row.name}</td>
                    <td className="p-3">{row.studentCount}</td>
                    <td className="p-3">{formatPkr(row.monthlyAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
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
                    <th className="p-3 font-medium">Relief</th>
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
                      <td className="p-3">
                        {row.reliefTypeLabel ? (
                          <>
                            <div className="font-medium">{row.reliefTypeLabel}</div>
                            <div className="text-xs text-muted-foreground">
                              {row.feeReliefType === "exemption"
                                ? row.exemptionRemarks || "—"
                                : row.feeReliefType === "legacy"
                                  ? row.indicativePercent
                                    ? `≈${row.indicativePercent}% (indicative)`
                                    : "Old discount"
                                  : row.concessionCategoryName
                                  ? `${row.concessionCategoryName}${row.concessionPercent ? ` (${row.concessionPercent}%)` : ""}`
                                  : "No category"}
                            </div>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
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
              <ListPagination
                attached={false}
                page={page}
                totalPages={pagination.pages}
                total={pagination.total}
                pageSize={pageSize}
                onPageSizeChange={(n) => {
                  setPageSize(n);
                  setPage(1);
                }}
                onPageChange={setPage}
                noun="students"
              />
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
