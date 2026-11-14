import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  Receipt,
  UserRound,
  // Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { downloadBlobFile } from "@/lib/downloadFile";
import {
  fetchFeeChallanPdf,
  fetchFeeReceiptPdf,
  resolveUploadUrl,
  type AcademyFeeRecord,
  type AcademyStudent,
  type AcademyStudentRecord,
} from "@/lib/studentManagementApi";
import { classLabel, MONTH_NAMES } from "@/components/modules/student-management/studentDisplayUtils";
import { cn } from "@/lib/utils";

type FeeFilter = "all" | "due" | "paid";

function refName(ref: unknown, key: string) {
  if (!ref || typeof ref !== "object") return "";
  const value = (ref as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function classSectionLine(student: AcademyStudent) {
  const rawClass = classLabel(student.classId);
  const className =
    rawClass && rawClass !== "—"
      ? /^class\b/i.test(rawClass)
        ? rawClass
        : `Class ${rawClass}`
      : "";
  const rawSection = refName(student.sectionId, "sectionName") || refName(student.sectionId, "name");
  const section = rawSection
    ? /^section\b/i.test(rawSection)
      ? rawSection
      : `Section ${rawSection}`
    : "";
  return [className, section].filter(Boolean).join(" · ");
}

function formatMoney(amount: number) {
  return `Rs ${Math.round(amount || 0).toLocaleString("en-PK")}`;
}

function formatDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const ymd = String(value).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      const local = new Date(`${ymd}T12:00:00`);
      if (!Number.isNaN(local.getTime())) {
        return local.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      }
    }
    return value;
  }
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function periodLabel(fee: AcademyFeeRecord) {
  const month = MONTH_NAMES[(fee.month || 1) - 1] || String(fee.month);
  return `${month} ${fee.year}`;
}

function feeTypeLabel(type: AcademyFeeRecord["feeType"]) {
  if (type === "admission") return "Admission";
  if (type === "stationery") return "Stationery";
  return "Monthly";
}

function isDue(fee: AcademyFeeRecord) {
  return fee.status === "pending" || fee.status === "overdue";
}

function isPaid(fee: AcademyFeeRecord) {
  return fee.status === "paid";
}

function statusTone(status: AcademyFeeRecord["status"]) {
  if (status === "paid") return "bg-[#E6F6EB] text-[#1F9D4A]";
  if (status === "overdue") return "bg-[#FDECEC] text-[#E11D48]";
  if (status === "waived") return "bg-[#F1F5F9] text-[#64748B]";
  return "bg-[#FFF1E4] text-[#EA580C]";
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#EEF2F6] py-3.5 last:border-b-0">
      <p className="text-[13px] font-medium text-[#94A3B8]">{label}</p>
      <p className="max-w-[62%] text-right text-[15px] font-bold text-[#102A43]">{value}</p>
    </div>
  );
}

function ScreenHeader({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <header className="relative flex items-center px-4 pb-2 pt-[max(0.7rem,env(safe-area-inset-top))]">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="grid h-9 w-9 place-items-center rounded-full bg-[#D6F4F8] text-[#1F2937]"
      >
        <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={2.25} />
      </button>
      <h1 className="absolute left-1/2 max-w-[70%] -translate-x-1/2 truncate text-center text-[22px] font-extrabold tracking-tight text-[#111827]">
        {title}
      </h1>
    </header>
  );
}

export default function ParentMobileFees({
  onBack,
  student,
  record,
  loading,
}: {
  onBack: () => void;
  student?: AcademyStudent;
  record?: AcademyStudentRecord;
  loading: boolean;
}) {
  const [filter, setFilter] = useState<FeeFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const fees = record?.fees;
  const records = fees?.records || [];
  const selected = records.find((fee) => fee._id === selectedId) || null;
  const photo = student?.photoImage ? resolveUploadUrl(student.photoImage) : "";
  const classLine = student ? classSectionLine(student) : "";
  const studentId = student?._id || "";

  const filtered = useMemo(() => {
    const list =
      filter === "due" ? records.filter(isDue) : filter === "paid" ? records.filter(isPaid) : records;
    return [...list].sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });
  }, [records, filter]);

  const dueCount = records.filter(isDue).length;
  const paidCount = records.filter(isPaid).length;

  const runDownload = async (key: string, load: () => Promise<Blob>, fileName: string) => {
    setBusyKey(key);
    try {
      const blob = await load();
      await downloadBlobFile(blob, fileName);
      toast.success("PDF ready");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Download failed");
    } finally {
      setBusyKey(null);
    }
  };

  const downloadVoucher = (fee: AcademyFeeRecord) => {
    const kind = isDue(fee) ? "challan" : "receipt";
    const label = `${feeTypeLabel(fee.feeType)}-${periodLabel(fee)}`.replace(/\s+/g, "-");
    void runDownload(
      `voucher-${fee._id}`,
      () => fetchFeeReceiptPdf(fee._id, "a4"),
      `fee-${kind}-${label}.pdf`,
    );
  };

  const downloadUnpaidChallan = () => {
    if (!studentId || dueCount === 0) return;
    void runDownload("challan-all", () => fetchFeeChallanPdf(studentId, "a4"), `fee-challan-unpaid.pdf`);
  };

  if (selected) {
    const payable = isDue(selected);
    const paid = isPaid(selected);
    const remaining = Math.max(0, (selected.amount || 0) - (selected.paidAmount || 0));

    return (
      <div className="min-h-full bg-white pb-10">
        <ScreenHeader title="Voucher" onBack={() => setSelectedId(null)} />

        <div className="mx-4 mt-2 space-y-3.5">
          <section className="overflow-hidden rounded-[22px] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <div className="border-b border-[#EEF2F6] px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[#94A3B8]">
                    {feeTypeLabel(selected.feeType)}
                  </p>
                  <p className="mt-1 text-[20px] font-extrabold text-[#102A43]">{periodLabel(selected)}</p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1 text-[12px] font-bold capitalize",
                    statusTone(selected.status),
                  )}
                >
                  {selected.status}
                </span>
              </div>
              <p className="mt-3 text-[28px] font-extrabold tracking-tight text-[#102A43]">
                {formatMoney(selected.amount)}
              </p>
            </div>
            <div className="px-4">
              <DetailRow label="Due date" value={formatDate(selected.dueDate)} />
              {selected.receiptNumber ? (
                <DetailRow label="Receipt / challan" value={selected.receiptNumber} />
              ) : null}
              {paid && selected.paidAt ? (
                <DetailRow label="Paid on" value={formatDate(selected.paidAt)} />
              ) : null}
              {paid && selected.paymentMethod ? (
                <DetailRow label="Payment method" value={selected.paymentMethod} />
              ) : null}
              {payable && (selected.paidAmount || 0) > 0 ? (
                <>
                  <DetailRow label="Paid so far" value={formatMoney(selected.paidAmount || 0)} />
                  <DetailRow label="Remaining" value={formatMoney(remaining)} />
                </>
              ) : null}
              {selected.notes ? <DetailRow label="Notes" value={selected.notes} /> : null}
            </div>
          </section>

          {(selected.components || []).length > 0 ? (
            <section className="overflow-hidden rounded-[22px] bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
              <h2 className="text-[15px] font-extrabold text-[#102A43]">Breakdown</h2>
              <ul className="mt-1">
                {selected.components!.map((line, index) => (
                  <li
                    key={`${line.name}-${index}`}
                    className="flex items-center justify-between gap-3 border-b border-[#EEF2F6] py-3 last:border-b-0"
                  >
                    <p className="text-[14px] font-semibold text-[#334155]">{line.name}</p>
                    <p className="text-[15px] font-bold text-[#102A43]">{formatMoney(line.amount)}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {(selected.payments || []).length > 0 ? (
            <section className="overflow-hidden rounded-[22px] bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
              <h2 className="text-[15px] font-extrabold text-[#102A43]">Payment history</h2>
              <ul className="mt-1">
                {selected.payments!.map((payment, index) => (
                  <li
                    key={`${payment.receiptNumber || payment.paidAt || index}`}
                    className="border-b border-[#EEF2F6] py-3 last:border-b-0"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[15px] font-bold text-[#102A43]">{formatMoney(payment.amount)}</p>
                      <p className="text-[12px] font-semibold text-[#64748B]">{formatDate(payment.paidAt)}</p>
                    </div>
                    <p className="mt-0.5 text-[12px] font-medium text-[#94A3B8]">
                      {[payment.paymentMethod, payment.receiptNumber].filter(Boolean).join(" · ") || "Payment"}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              disabled={busyKey === `voucher-${selected._id}`}
              onClick={() => downloadVoucher(selected)}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-[#22C5D6] text-[15px] font-bold text-white disabled:opacity-60"
            >
              {busyKey === `voucher-${selected._id}` ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : paid ? (
                <Receipt className="h-4 w-4" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {paid ? "Download receipt" : "Download voucher"}
            </button>

            {/* Pay online — hidden until online payments are enabled.
            {payable ? (
              <button
                type="button"
                onClick={() =>
                  toast.message("Online payment is not available yet", {
                    description: "Please pay at the school office. You can download the voucher above.",
                  })
                }
                className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-white text-[15px] font-bold text-[#0F3A4A] shadow-[0_8px_24px_rgba(15,23,42,0.04)]"
              >
                <Wallet className="h-4 w-4" />
                Pay online
              </button>
            ) : null}
            */}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-white pb-10">
      <ScreenHeader title="Fee" onBack={onBack} />

      <div className="mx-4 mt-1 flex items-center gap-3 rounded-[18px] bg-[#E7F8F4] px-3.5 py-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-white text-[#8E99A8]">
          {photo ? (
            <img src={photo} alt="" className="h-full w-full object-cover" />
          ) : (
            <UserRound className="h-6 w-6" strokeWidth={1.75} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[18px] font-extrabold text-[#102A43]">
            {loading ? "Loading…" : student?.studentName || "No child linked"}
          </p>
          <p className="mt-0.5 truncate text-[16px] font-bold text-[#0F3A4A]">{classLine || "—"}</p>
        </div>
      </div>

      <div className="mt-3.5 grid grid-cols-3 border-b border-[#EEF2F6] bg-white">
        {(
          [
            ["all", "All", records.length],
            ["due", "Due", dueCount],
            ["paid", "Paid", paidCount],
          ] as const
        ).map(([key, label, count]) => {
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                "relative py-3.5 text-center text-[15px]",
                active ? "font-semibold text-[#22C5D6]" : "font-medium text-[#A8B3C0]",
              )}
            >
              {label}
              <span className={cn("ml-1", active ? "text-[#22C5D6]" : "text-[#C0C8D2]")}>
                ({count})
              </span>
              {active ? (
                <span className="absolute inset-x-6 bottom-0 h-[3px] rounded-full bg-[#22C5D6]" />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="space-y-3.5 px-4 pt-4">
        {loading ? <div className="h-24 animate-pulse rounded-[22px] bg-white/70" /> : null}

        {!loading ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[22px] bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#94A3B8]">Paid</p>
                <p className="mt-1.5 text-[22px] font-extrabold text-[#1F9D4A]">
                  {formatMoney(fees?.summary.totalPaid || 0)}
                </p>
              </div>
              <div className="rounded-[22px] bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#94A3B8]">Due</p>
                <p className="mt-1.5 text-[22px] font-extrabold text-[#EA580C]">
                  {formatMoney(fees?.summary.totalPending || 0)}
                </p>
              </div>
            </div>

            {dueCount > 0 ? (
              <button
                type="button"
                disabled={busyKey === "challan-all"}
                onClick={downloadUnpaidChallan}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-[#22C5D6] text-[15px] font-bold text-white disabled:opacity-60"
              >
                {busyKey === "challan-all" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                Download unpaid challan
              </button>
            ) : null}

            {filtered.length === 0 ? (
              <div className="rounded-[22px] bg-white px-4 py-12 text-center shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                <p className="text-[16px] font-bold text-[#102A43]">
                  {filter === "due"
                    ? "No dues"
                    : filter === "paid"
                      ? "No paid vouchers yet"
                      : "No fee vouchers yet"}
                </p>
                <p className="mt-1 text-[14px] font-medium text-[#94A3B8]">
                  {filter === "all"
                    ? "Invoices from the school will show up here."
                    : "Try another filter."}
                </p>
              </div>
            ) : (
              <ul className="overflow-hidden rounded-[22px] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                {filtered.map((fee, index) => (
                  <li key={fee._id} className={cn(index > 0 && "border-t border-[#EEF2F6]")}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(fee._id)}
                      className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-[#F8FAFC]"
                    >
                      <span
                        className={cn(
                          "grid h-11 w-11 shrink-0 place-items-center rounded-full",
                          isPaid(fee) ? "bg-[#E6F6EB] text-[#1F9D4A]" : "bg-[#FFF1E4] text-[#EA580C]",
                        )}
                      >
                        {isPaid(fee) ? (
                          <Receipt className="h-[18px] w-[18px]" strokeWidth={2} />
                        ) : (
                          <FileText className="h-[18px] w-[18px]" strokeWidth={2} />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-extrabold text-[#102A43]">
                          {feeTypeLabel(fee.feeType)} · {periodLabel(fee)}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[11px] font-bold capitalize",
                              statusTone(fee.status),
                            )}
                          >
                            {fee.status}
                          </span>
                          {fee.receiptNumber ? (
                            <span className="truncate text-[12px] font-semibold text-[#94A3B8]">
                              {fee.receiptNumber}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <span className="text-[15px] font-extrabold text-[#102A43]">
                          {formatMoney(fee.amount)}
                        </span>
                        <ChevronRight className="h-4 w-4 text-[#C0C8D2]" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
