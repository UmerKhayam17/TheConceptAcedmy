import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgePercent, HandCoins, Printer, ReceiptText, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import type { ModuleActionCaps } from "@/lib/permissions";
import {
  type AcademyFeeRecord,
  type AcademyStudent,
  fetchConcessionCategories,
  getAcademyStudentRecord,
  printFeeChallan,
  updateAcademyStudent,
  printFeeReceipt,
} from "@/lib/studentManagementApi";
import type { AcademyStudentRoutes } from "@/lib/studentManagementMenus";
import { cn } from "@/lib/utils";
import { isFreeFeeStudent } from "./FeeModeSelector";
import { ExemptionRemarksInput } from "./ExemptionRemarksInput";
import { indicativePercent, studentFeeRelief, type FeeReliefKind } from "./registerStudentForm";
import { classLabel, formatDate, MONTH_NAMES } from "./studentDisplayUtils";

const num = (n?: number) => (Number(n) || 0).toLocaleString("en-PK");

type ChallanType = "" | AcademyFeeRecord["feeType"];

const CHALLAN_TYPES: { value: ChallanType; label: string }[] = [
  { value: "", label: "All" },
  { value: "monthly", label: "Tuition (Monthly)" },
  { value: "admission", label: "Admission" },
  { value: "stationery", label: "Stationery" },
];

function monthLabel(r: AcademyFeeRecord) {
  return `${MONTH_NAMES[(r.month || 1) - 1] ?? r.month} ${r.year}`;
}

function fullMonthLabel(r: AcademyFeeRecord) {
  return new Date(r.year, (r.month || 1) - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}

function challanNo(r: AcademyFeeRecord) {
  return r.paymentSlipNumber || r.receiptNumber || r._id.slice(-8).toUpperCase();
}

function InfoPill({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 text-center min-w-0">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <span className="max-w-full truncate rounded-full bg-primary/15 px-3 py-1 text-sm font-medium text-primary">
        {value || "—"}
      </span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-muted-foreground font-medium">{label}</span>
      {children}
    </label>
  );
}

const selectCls =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-70";

const theadCls = "bg-muted/60 text-muted-foreground";

type FeeHeadRow = { head: string; amount: number; remarks: string; payable: number };

/**
 * Which tuition relief is active. A monthly discount given before relief types existed
 * (no category, no reason) is a legacy discount — kept as is until staff convert it.
 */
function activeRelief(student: AcademyStudent): FeeReliefKind {
  return studentFeeRelief(student);
}

/** The whole monthly tuition discount is the active concession / exemption. */
function tuitionSplit(student: AcademyStudent) {
  const monthly = Number(student.monthlyFee) || 0;
  const relief = activeRelief(student);
  const reliefAmt = relief ? Math.min(Number(student.monthlyFeeDiscount) || 0, monthly) : 0;
  return { monthly, base: 0, reliefAmt, relief, agreed: monthly };
}

/** Break a challan into fee heads (actual vs payable, with concession / exemption remarks). */
function feeHeadsFor(record: AcademyFeeRecord | undefined, student: AcademyStudent): FeeHeadRow[] {
  const { monthly, base, reliefAmt, relief } = tuitionSplit(student);
  const admission = Number(student.admissionFee) || 0;
  const aDisc = Math.min(Number(student.admissionFeeDiscount) || 0, admission);
  const reliefLabel =
    relief === "exemption" ? "Exemption" : relief === "legacy" ? "Legacy discount" : "Concession";
  const remark = (d: number, label: string) => (d > 0 ? `${label} ${num(d)}` : "");
  /** Describe a tuition discount of `d`: registration discount first, then the relief. */
  const tuitionRemark = (d: number) => {
    const r = Math.min(reliefAmt, d);
    return [remark(d - r, "Discount"), remark(r, reliefLabel)].filter(Boolean).join(" · ");
  };

  if (!record) {
    const mDisc = base + reliefAmt;
    return [
      { head: "Admission Fee", amount: admission, remarks: remark(aDisc, "Discount"), payable: admission - aDisc },
      { head: "Tuition Fee", amount: monthly, remarks: tuitionRemark(mDisc), payable: monthly - mDisc },
    ];
  }

  const fullyExempt = record.status === "waived" || isFreeFeeStudent(record, null);
  const comps = record.components?.length
    ? record.components
    : [
        {
          name: record.feeType === "admission" ? "Admission Fee" : record.feeType === "stationery" ? "Stationery" : "Tuition Fee",
          amount: record.amount,
          kind: record.feeType === "admission" ? "admission" : record.feeType === "monthly" ? "tuition" : "charge",
        } as NonNullable<AcademyFeeRecord["components"]>[number],
      ];

  return comps.map((c) => {
    const payable = Number(c.amount) || 0;
    const parts: string[] = [];
    let actual = payable;
    if (c.kind === "tuition" && monthly > payable) {
      actual = monthly;
      parts.push(tuitionRemark(monthly - payable));
    } else if (c.kind === "admission" && admission > payable) {
      actual = admission;
      parts.push(remark(admission - payable, "Discount"));
    }
    if (fullyExempt && payable === 0 && parts.length === 0) parts.push("Waived");
    return { head: c.name, amount: actual, remarks: parts.join(" · "), payable };
  });
}

function FeeHeadTable({ rows }: { rows: FeeHeadRow[] }) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const payable = rows.reduce((s, r) => s + r.payable, 0);
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className={theadCls}>
          <tr>
            <th className="p-3 text-center font-medium">Fee Head</th>
            <th className="p-3 text-center font-medium">Fee Amount</th>
            <th className="p-3 text-center font-medium">Remarks</th>
            <th className="p-3 text-center font-medium">Payable Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.head}-${i}`} className="border-t">
              <td className="p-3 text-center">{r.head}</td>
              <td className="p-3 text-center tabular-nums">{num(r.amount)}</td>
              <td className="p-3 text-center text-muted-foreground">{r.remarks || ""}</td>
              <td className="p-3 text-center tabular-nums">{num(r.payable)}</td>
            </tr>
          ))}
          <tr className="border-t font-semibold">
            <td className="p-3 text-center">Total Amount</td>
            <td className="p-3 text-center tabular-nums">{num(total)}</td>
            <td className="p-3" />
            <td className="p-3 text-center tabular-nums">{num(payable)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const STATUS_TONE: Record<AcademyFeeRecord["status"], string> = {
  paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  overdue: "bg-red-500/15 text-red-700 dark:text-red-300",
  waived: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
};

function StudentChallanTab({ student, records }: { student: AcademyStudent; records: AcademyFeeRecord[] }) {
  const { toast } = useToast();
  const [challanType, setChallanType] = useState<ChallanType>("");
  const [selectedId, setSelectedId] = useState<string>("");

  const filtered = useMemo(
    () =>
      records
        .filter((r) => !challanType || r.feeType === challanType)
        .sort((a, b) => a.year - b.year || a.month - b.month),
    [records, challanType],
  );

  useEffect(() => {
    if (filtered.some((r) => r._id === selectedId)) return;
    const firstUnpaid = filtered.find((r) => r.status === "pending" || r.status === "overdue");
    setSelectedId((firstUnpaid ?? filtered[filtered.length - 1])?._id ?? "");
  }, [filtered, selectedId]);

  const selected = filtered.find((r) => r._id === selectedId);

  const printMut = useMutation({
    mutationFn: (r: AcademyFeeRecord) =>
      r.status === "paid"
        ? printFeeReceipt(r._id, "a4")
        : printFeeChallan(
            student._id,
            "a4",
            undefined,
            (r.components || []).map((c) => c.chargeId).filter(Boolean) as string[],
          ),
    onError: (e: Error) =>
      toast({ title: "Could not print", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Class">
          <select className={selectCls} disabled value="cls">
            <option value="cls">{classLabel(student.classId)}</option>
          </select>
        </Field>
        <Field label="Challan Type">
          <select
            className={selectCls}
            value={challanType}
            onChange={(e) => setChallanType(e.target.value as ChallanType)}
          >
            {CHALLAN_TYPES.map((t) => (
              <option key={t.value || "all"} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Month">
          <select
            className={selectCls}
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            disabled={filtered.length === 0}
          >
            {filtered.length === 0 && <option value="">—</option>}
            {filtered.map((r) => (
              <option key={r._id} value={r._id}>
                {fullMonthLabel(r)}
                {!challanType ? ` (${r.feeType === "monthly" ? "Tuition" : r.feeType === "admission" ? "Admission" : "Stationery"})` : ""}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <FeeHeadTable rows={feeHeadsFor(selected, student)} />

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className={theadCls}>
            <tr>
              <th className="p-3 text-center font-medium">Challan No.</th>
              <th className="p-3 text-center font-medium">Month</th>
              <th className="p-3 text-center font-medium">Due Date</th>
              <th className="p-3 text-center font-medium">Challan Amount</th>
              <th className="p-3 text-center font-medium">Status</th>
              <th className="p-3 text-center font-medium">Paid Date</th>
              <th className="p-3 text-center font-medium">Print Challan</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr className="border-t">
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  No challans generated yet.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr
                  key={r._id}
                  onClick={() => setSelectedId(r._id)}
                  className={cn(
                    "border-t cursor-pointer hover:bg-muted/40",
                    r._id === selectedId && "bg-primary/5",
                  )}
                >
                  <td className="p-3 text-center font-mono text-xs">{challanNo(r)}</td>
                  <td className="p-3 text-center whitespace-nowrap">{monthLabel(r)}</td>
                  <td className="p-3 text-center whitespace-nowrap">{formatDate(r.dueDate)}</td>
                  <td className="p-3 text-center tabular-nums">{num(r.amount)}</td>
                  <td className="p-3 text-center">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium capitalize", STATUS_TONE[r.status])}>
                      {r.status}
                    </span>
                  </td>
                  <td className="p-3 text-center whitespace-nowrap">{r.paidAt ? formatDate(r.paidAt) : "—"}</td>
                  <td className="p-3 text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-primary"
                      aria-label={r.status === "paid" ? "Print receipt" : "Print challan"}
                      title={r.status === "paid" ? "Print receipt" : "Print challan"}
                      disabled={printMut.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        printMut.mutate(r);
                      }}
                    >
                      <Printer className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Save a tuition relief (concession / exemption) and refresh everything that shows fees. */
function useSaveRelief(student: AcademyStudent, label: "Concession" | "Exemption" | "Legacy discount") {
  const { toast } = useToast();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => updateAcademyStudent(student._id, body),
    onSuccess: (_d, body) => {
      qc.invalidateQueries({ queryKey: ["academy-student-record", student._id] });
      qc.invalidateQueries({ queryKey: ["academy-students"] });
      qc.invalidateQueries({ queryKey: ["academy-fees"] });
      qc.invalidateQueries({ queryKey: ["academy-fee-history"] });
      qc.invalidateQueries({ queryKey: ["concession-categories"] });
      toast({
        title: body.feeReliefType ? `${label} applied` : `${label} removed`,
        description: "Unpaid tuition challans were updated; new months follow the same amount.",
      });
    },
    onError: (e: Error) =>
      toast({ title: `Could not save ${label.toLowerCase()}`, description: e.message, variant: "destructive" }),
  });
}

function ConcessionTab({ student, canEdit }: { student: AcademyStudent; canEdit: boolean }) {
  // Concession is a category % of the monthly tuition; admission fee is never touched.
  const { monthly, agreed, relief, reliefAmt } = tuitionSplit(student);
  const curAmt = relief === "concession" ? reliefAmt : 0;

  const { data: categories = [], isLoading: catsLoading } = useQuery({
    queryKey: ["concession-categories"],
    queryFn: fetchConcessionCategories,
  });
  const activeCats = categories.filter((c) => c.isActive);

  const [categoryKey, setCategoryKey] = useState(relief === "concession" ? student.concessionCategory || "" : "");
  const [amountInput, setAmountInput] = useState(String(curAmt));

  const category = categories.find((c) => c.key === categoryKey);
  const percent = Number(category?.discountPercent) || 0;
  const amount = Math.min(Math.max(0, Math.round(Number(amountInput) || 0)), agreed);
  const changed = amount !== curAmt || categoryKey !== (relief === "concession" ? student.concessionCategory || "" : "");

  const saveMut = useSaveRelief(student, "Concession");
  const apply = () =>
    saveMut.mutate({
      feeReliefType: "concession",
      concessionCategory: categoryKey,
      concessionPercent: percent,
      monthlyFeeDiscount: amount,
    });
  const remove = () => saveMut.mutate({ feeReliefType: "", monthlyFeeDiscount: 0 });

  const currentCat = categories.find((c) => c.key === student.concessionCategory);
  const pct = (d: number, b: number) => (b && d ? `${Math.round((d / b) * 100)}%` : "0%");

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {curAmt > 0
          ? `Current concession: PKR ${num(curAmt)} / month${currentCat ? ` — ${currentCat.name}` : " (given at registration, no category)"}${
              student.concessionPercent ? ` (${student.concessionPercent}%)` : ""
            }`
          : "No concession has been granted to this student."}
        <span className="block text-xs">
          Concession is taken off the monthly tuition. A student can have a concession or an exemption, not both.
        </span>
      </p>

      {relief === "exemption" && <ReliefLockedNotice student={student} other="exemption" />}
      {relief === "legacy" && <LegacyDiscountNotice student={student} canEdit={canEdit} convertTo="concession" />}

      {canEdit && relief !== "exemption" && (
        <div className="rounded-md border p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Concession Category">
              <select
                className={selectCls}
                value={categoryKey}
                disabled={catsLoading}
                onChange={(e) => {
                  const key = e.target.value;
                  setCategoryKey(key);
                  const p = Number(categories.find((c) => c.key === key)?.discountPercent) || 0;
                  setAmountInput(String(key ? Math.round((agreed * p) / 100) : 0));
                }}
              >
                <option value="">{catsLoading ? "Loading…" : "— Select category —"}</option>
                {activeCats.map((c) => (
                  <option key={c._id} value={c.key}>
                    {c.name} ({Number(c.discountPercent) || 0}%)
                  </option>
                ))}
                {categoryKey && !activeCats.some((c) => c.key === categoryKey) && (
                  <option value={categoryKey}>{currentCat?.name || categoryKey} (inactive)</option>
                )}
              </select>
            </Field>
            <Field label="Concession Amount (PKR / month)">
              <input
                type="number"
                min={0}
                max={agreed}
                className={selectCls}
                value={amountInput}
                disabled={!categoryKey}
                onChange={(e) => setAmountInput(e.target.value)}
              />
            </Field>
            <Field label="Tuition Payable (PKR / month)">
              <input className={selectCls} disabled value={num(agreed - amount)} />
            </Field>
          </div>
          {category?.description && <p className="text-xs text-muted-foreground">{category.description}</p>}
          {!catsLoading && activeCats.length === 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              No active concession categories. Add them in System Config → Concession Discount Categories.
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {curAmt > 0 && (
              <Button variant="outline" size="sm" disabled={saveMut.isPending} onClick={remove}>
                Remove concession
              </Button>
            )}
            <Button
              size="sm"
              className="gap-2"
              disabled={!categoryKey || amount <= 0 || !changed || saveMut.isPending}
              onClick={apply}
            >
              <BadgePercent className="h-4 w-4" />
              {saveMut.isPending ? "Saving…" : "Apply concession"}
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className={theadCls}>
            <tr>
              <th className="p-3 text-center font-medium">Fee Head</th>
              <th className="p-3 text-center font-medium">Fee Amount</th>
              <th className="p-3 text-center font-medium">Concession</th>
              <th className="p-3 text-center font-medium">Concession %</th>
              <th className="p-3 text-center font-medium">Payable Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t">
              <td className="p-3 text-center">Tuition Fee (monthly)</td>
              <td className="p-3 text-center tabular-nums">{num(monthly)}</td>
              <td className="p-3 text-center tabular-nums text-sky-700 dark:text-sky-300">
                {num(relief === "exemption" ? 0 : amount)}
              </td>
              <td className="p-3 text-center">{pct(relief === "exemption" ? 0 : amount, agreed)}</td>
              <td className="p-3 text-center tabular-nums font-semibold">
                {num(agreed - (relief === "exemption" || (relief === "legacy" && !categoryKey) ? reliefAmt : amount))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Old discount with no category / reason: kept as is; can be converted or removed. */
function LegacyDiscountNotice({
  student,
  canEdit,
  convertTo,
}: {
  student: AcademyStudent;
  canEdit: boolean;
  convertTo: "concession" | "exemption";
}) {
  const { monthly, reliefAmt } = tuitionSplit(student);
  const pct = indicativePercent(reliefAmt, monthly);
  const removeMut = useSaveRelief(student, "Legacy discount");
  return (
    <div className="rounded-md border border-sky-500/40 bg-sky-500/5 p-4 text-sm space-y-2">
      <p className="font-medium text-sky-900 dark:text-sky-200">
        Legacy discount: PKR {num(reliefAmt)} / month{pct ? ` (≈${pct}% of current fee, indicative)` : ""}
      </p>
      <p className="text-muted-foreground">
        Given before concession categories existed. The fixed amount is kept as is.{" "}
        {convertTo === "concession"
          ? "Choose a category below to convert it into a concession."
          : "Enter an amount and reason below to convert it into an exemption."}
      </p>
      {canEdit && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={removeMut.isPending}
          onClick={() => removeMut.mutate({ feeReliefType: "", monthlyFeeDiscount: 0 })}
        >
          Remove legacy discount
        </Button>
      )}
    </div>
  );
}

/** Shown when the other kind of tuition relief is already active (only one at a time). */
function ReliefLockedNotice({ student, other }: { student: AcademyStudent; other: "concession" | "exemption" }) {
  const { reliefAmt } = tuitionSplit(student);
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-4 text-sm space-y-1">
      <p className="font-medium text-amber-800 dark:text-amber-200">
        {other === "exemption" ? "A tuition exemption is already applied" : "A tuition concession is already applied"}
        {reliefAmt > 0 ? ` — PKR ${num(reliefAmt)} / month` : ""}
        {other === "exemption" && student.exemptionRemarks ? ` (${student.exemptionRemarks})` : ""}.
      </p>
      <p className="text-muted-foreground">
        Only one can be active at a time. Remove it from the{" "}
        <span className="font-medium">{other === "exemption" ? "Apply Exemption" : "Grant Concession"}</span> tab first.
      </p>
    </div>
  );
}

function ExemptionTab({ student, canEdit }: { student: AcademyStudent; canEdit: boolean }) {
  // Exemption is a fixed PKR off the monthly tuition, every month.
  const { monthly, agreed, relief, reliefAmt } = tuitionSplit(student);
  const curAmt = relief === "exemption" ? reliefAmt : 0;
  const curRemarks = relief === "exemption" ? student.exemptionRemarks || "" : "";

  // Converting a legacy discount starts from its amount; staff only need to add the reason.
  const [amountInput, setAmountInput] = useState(String(relief === "legacy" ? reliefAmt : curAmt));
  const [remarks, setRemarks] = useState(curRemarks);

  const amount = Math.min(Math.max(0, Math.round(Number(amountInput) || 0)), agreed);
  const trimmedRemarks = remarks.trim();
  const changed = amount !== curAmt || trimmedRemarks !== curRemarks;

  const saveMut = useSaveRelief(student, "Exemption");
  const apply = () =>
    saveMut.mutate({ feeReliefType: "exemption", exemptionRemarks: trimmedRemarks, monthlyFeeDiscount: amount });
  const remove = () => saveMut.mutate({ feeReliefType: "", monthlyFeeDiscount: 0 });

  const shownAmt = relief === "concession" ? 0 : amount;
  const previewRows: FeeHeadRow[] = [
    {
      head: "Tuition Fee (monthly)",
      amount: monthly,
      remarks: [
        shownAmt > 0 ? `Exemption ${num(shownAmt)}${remarks ? ` — ${remarks}` : ""}` : "",
        relief === "concession" && reliefAmt > 0 ? `Concession ${num(reliefAmt)}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
      payable: agreed - (relief === "concession" ? reliefAmt : amount),
    },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {curAmt > 0
          ? `Current exemption: PKR ${num(curAmt)} / month${curRemarks ? ` — ${curRemarks}` : ""}`
          : "No exemption has been applied to this student."}
        <span className="block text-xs">
          Exemption is taken off the monthly tuition. A student can have a concession or an exemption, not both.
        </span>
      </p>

      {relief === "concession" && <ReliefLockedNotice student={student} other="concession" />}
      {relief === "legacy" && <LegacyDiscountNotice student={student} canEdit={canEdit} convertTo="exemption" />}

      {canEdit && relief !== "concession" && (
        <div className="rounded-md border p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <Field label="Class">
              <select className={selectCls} disabled value="cls">
                <option value="cls">{classLabel(student.classId)}</option>
              </select>
            </Field>
            <Field label="Fee Head">
              <select className={selectCls} disabled value="tuition">
                <option value="tuition">Tuition Fee (every month)</option>
              </select>
            </Field>
            <Field label="Exemption Amount (PKR / month)">
              <input
                type="number"
                min={0}
                max={agreed}
                className={selectCls}
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Exemption Remarks">
                <ExemptionRemarksInput className={selectCls} value={remarks} onChange={setRemarks} />
              </Field>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {amount > 0 && !trimmedRemarks && (
              <span className="mr-auto text-xs text-muted-foreground">Enter or choose exemption remarks to continue.</span>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={agreed === 0}
              onClick={() => setAmountInput(String(agreed))}
            >
              Exempt full tuition
            </Button>
            {curAmt > 0 && (
              <Button type="button" variant="outline" size="sm" disabled={saveMut.isPending} onClick={remove}>
                Remove exemption
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              className="gap-2"
              disabled={amount <= 0 || !trimmedRemarks || !changed || saveMut.isPending}
              onClick={apply}
            >
              <ShieldCheck className="h-4 w-4" />
              {saveMut.isPending ? "Saving…" : "Apply Exemption"}
            </Button>
          </div>
        </div>
      )}

      <FeeHeadTable rows={previewRows} />
    </div>
  );
}

const tabTriggerCls =
  "rounded-none border-b-2 border-transparent bg-transparent px-1 pb-2 pt-1 text-sm font-medium text-muted-foreground shadow-none gap-1.5 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none";

export default function StudentFeeDetailsDialog({
  open,
  onOpenChange,
  studentId,
  caps,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string | null;
  caps: ModuleActionCaps;
  routes?: AcademyStudentRoutes;
}) {
  const { data: record, isLoading, isError, error } = useQuery({
    queryKey: ["academy-student-record", studentId],
    queryFn: () => getAcademyStudentRecord(studentId as string),
    enabled: open && !!studentId,
  });

  const student = record?.student;
  /** Re-seed the relief forms whenever the saved relief changes. */
  const reliefKey = student
    ? `${student._id}-${student.feeReliefType ?? ""}-${student.monthlyFeeDiscount ?? 0}-${student.concessionCategory ?? ""}`
    : "none";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] sm:w-[95vw] sm:max-w-[1400px] max-h-[94dvh] overflow-y-auto p-0 sm:p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b bg-gradient-to-r from-primary/5 via-transparent to-transparent text-left">
          <DialogTitle className="flex items-center gap-2 text-xl font-display">
            <HandCoins className="h-5 w-5 text-violet-600 dark:text-violet-400" /> Student Fee
          </DialogTitle>
          <DialogDescription>Fee details</DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5">
          {isLoading || !studentId ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading fee details…</p>
          ) : isError || !record || !student ? (
            <p className="py-10 text-center text-sm text-destructive">
              {(error as Error)?.message || "Could not load fee details"}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <InfoPill label="Reference No." value={student.registrationNumber || student.studentId} />
                <InfoPill label="Roll No." value={student.rollNumber} />
                <InfoPill label="Name" value={student.studentName?.toUpperCase()} />
                <InfoPill label="Program" value={classLabel(student.classId)} />
              </div>

              <Tabs defaultValue="challan" className="w-full">
                <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b bg-transparent p-0 overflow-x-auto">
                  <TabsTrigger value="challan" className={tabTriggerCls}>
                    <ReceiptText className="h-3.5 w-3.5" /> Student Challan
                  </TabsTrigger>
                  <TabsTrigger value="concession" className={tabTriggerCls}>
                    <BadgePercent className="h-3.5 w-3.5" /> Grant Concession
                  </TabsTrigger>
                  <TabsTrigger value="exemption" className={tabTriggerCls}>
                    <ShieldCheck className="h-3.5 w-3.5" /> Apply Exemption
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="challan" className="mt-4 focus-visible:outline-none">
                  <StudentChallanTab student={student} records={record.fees.records} />
                </TabsContent>
                <TabsContent value="concession" className="mt-4 focus-visible:outline-none">
                  <ConcessionTab key={reliefKey} student={student} canEdit={caps.canEdit} />
                </TabsContent>
                <TabsContent value="exemption" className="mt-4 focus-visible:outline-none">
                  <ExemptionTab key={reliefKey} student={student} canEdit={caps.canEdit} />
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>

        <div className="flex justify-end border-t px-6 py-3">
          <Button variant="outline" className="gap-2" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" /> Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
