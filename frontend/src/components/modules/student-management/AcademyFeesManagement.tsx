import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  CalendarX,
  Banknote,
  Undo2,
  Calculator,
  CalendarDays,
  CalendarRange,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  CreditCard,
  Globe,
  GraduationCap,
  Hash,
  Info,
  Landmark,
  Plus,
  PlusCircle,
  Settings2,
  ShieldCheck,
  User,
  Download,
  Eye,
  FileText,
  ImageIcon,
  Loader2,
  MoreHorizontal,
  Pencil,
  Printer,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateRangePickerField } from "@/components/ui/date-range-picker";
import { localTodayYmd } from "@/lib/localDate";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DefaulterListDownload } from "./DefaulterListDownload";
import { deliverReportBlob, openReportPreviewTab } from "@/lib/reportDownload";
import { FeeMetricCards } from "./FeeMetricCards";
import { ClassProgramOptions } from "@/components/modules/ClassProgramSelect";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { ModuleActionCaps } from "@/lib/permissions";
import {
  fetchAcademyClasses,
  fetchAcademyFeeSummary,
  fetchAcademyFees,
  fetchAcademyStudents,
  fetchSectionsByClass,
  fetchAcademySectionsBySession,
  fetchStudentFeeHistory,
  exportFeeDefaultersMonthWise,
  exportPaidFeesReport,
  exportClassAccountsReport,
  type DefaulterReportFormat,
  type PaidFeeExportParams,
  applyFeeCharges,
  fetchAdditionalCharges,
  generateMonthlyFees,
  payAcademyFees,
  printFeeChallan,
  printFeeReceipt,
  refundAcademyFeePayment,
  resyncSeparateFeeCharges,
  reverseAcademyFeePayment,
  transferAcademyFeePayment,
  unwaiveAcademyFee,
  updateAcademyFee,
  waiveAcademyFee,
  type AcademyFeeRecord,
  type AcademyStudent,
  type FeeReceiptSize,
} from "@/lib/studentManagementApi";
import type { FeeAdjustmentKind } from "@/lib/studentManagementApi";
import {
  applicableChargesForFees,
  chargeIdsOnFee,
  feeAmountWithCharges,
  feePreviewLines,
} from "@/lib/additionalCharges";
import { resolveUploadUrl } from "@/lib/api";
import { academyStudentRoutes, type AcademyStudentRoutes } from "@/lib/studentManagementMenus";
import { useSessionScope } from "@/components/modules/timetable/SessionBar";
import { formatDate, formatPkr, MONTH_NAMES } from "./studentDisplayUtils";
import { FreeStudentBadge, isFreeFeeStudent } from "./FeeModeSelector";
import { DEFAULT_PAGE_SIZE } from "./PageSizeSelect";
import ListPagination from "./ListPagination";
import { cn } from "@/lib/utils";
import {
  AssignSectionDialog,
  EnrollmentVoucherWizard,
} from "./EnrollmentVoucherWizard";
import { AdditionalChargesChecklist } from "./AdditionalChargesChecklist";
import {
  ChallanPrintDialog,
  type ChallanPrintRequest,
} from "./ChallanPrintDialog";

/** Stable empty lists — `useQuery` defaults like `= []` create new arrays each render and retrigger effects. */
const EMPTY_ADDITIONAL_CHARGES: Awaited<ReturnType<typeof fetchAdditionalCharges>> = [];
const EMPTY_PARENT_STUDENTS: AcademyStudent[] = [];
const EMPTY_FEE_RECORDS: AcademyFeeRecord[] = [];

function todayInputValue() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

const feeFilterSelectClass =
  "h-9 w-full cursor-pointer appearance-none rounded-md border border-border bg-background py-1.5 text-sm text-foreground shadow-none outline-none transition-colors hover:border-primary/30 focus:border-primary focus:ring-2 focus:ring-primary/10";

function FeeFilterField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <label className="sr-only">{label}</label>
      {children}
    </div>
  );
}

function FeeFilterSelect({
  value,
  onChange,
  children,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative min-w-0 overflow-hidden", className)}>
      <select
        className={cn(feeFilterSelectClass, "max-w-full truncate pl-3 pr-8")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

function studentFromRecord(rec: AcademyFeeRecord) {
  const s = rec.studentId;
  if (typeof s === "object" && s) return s;
  return null;
}

function studentName(rec: AcademyFeeRecord) {
  return studentFromRecord(rec)?.studentName ?? "—";
}

function fatherName(rec: AcademyFeeRecord) {
  return studentFromRecord(rec)?.fatherName?.trim() || "—";
}

function studentCode(rec: AcademyFeeRecord) {
  return studentFromRecord(rec)?.studentId ?? "";
}

function studentMongoId(rec: AcademyFeeRecord) {
  const s = studentFromRecord(rec);
  return s?._id ?? "";
}

function classNameFromRecord(rec: AcademyFeeRecord) {
  const s = studentFromRecord(rec);
  const c = s?.classId;
  if (typeof c === "object" && c && "className" in c) return c.className;
  return "—";
}

function periodLabel(r: AcademyFeeRecord) {
  if (r.feeType === "admission") return "Admission";
  return `${MONTH_NAMES[(r.month || 1) - 1]} ${r.year}`;
}

function feeTypeLabel(feeType: AcademyFeeRecord["feeType"]) {
  if (feeType === "admission") return "Admission";
  if (feeType === "stationery") return "Stationery";
  return "Monthly";
}

function isUnpaid(status: string) {
  return status === "pending" || status === "overdue";
}

/** Manual gap-month waive. Must not match the automatic "student marked inactive" note, or a later return would bill it again. */
const ABSENCE_WAIVER_NOTE = "Waived: month not attended";

/** Staff waive (can be undone). System waives (student left, duplicates) cannot. */
function isManualWaiver(r: AcademyFeeRecord) {
  if (r.status !== "waived") return false;
  return Boolean(r.waiver?.at) || String(r.notes || "").includes(ABSENCE_WAIVER_NOTE);
}

function waiverByName(r: AcademyFeeRecord) {
  const by = r.waiver?.by;
  if (!by) return "";
  return typeof by === "string" ? "" : by.name || by.email || "";
}

function isPdfSlip(path: string) {
  return /\.pdf$/i.test(path.split("?")[0] || "");
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type SlipPreviewState = { src: string; isPdf: boolean };

type AdjKindChoice = FeeAdjustmentKind | "none";

const FEE_ADJUSTMENT_OPTIONS: { value: FeeAdjustmentKind; label: string }[] = [
  { value: "discount", label: "Discount / Concession" },
  { value: "partial_month", label: "Partial month (e.g. 15 days)" },
  { value: "late_fine", label: "Late fine (adds to fee)" },
  { value: "other", label: "Other reduction" },
];

type AdjInput = { kind: AdjKindChoice; amount: string; reason: string };
const EMPTY_ADJ: AdjInput = { kind: "none", amount: "", reason: "" };

/** Type / amount / reason inputs for one fee adjustment. */
function AdjFields({
  idPrefix,
  value,
  onChange,
  feeHint,
}: {
  idPrefix: string;
  value: AdjInput;
  onChange: (patch: Partial<AdjInput>) => void;
  /** Current fee, shown as the placeholder of "Fee to pay". */
  feeHint?: number;
}) {
  const off = value.kind === "none";
  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,1.4fr)]">
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor={`${idPrefix}-kind`}>Adjustment type</Label>
        <select
          id={`${idPrefix}-kind`}
          className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm"
          value={value.kind}
          onChange={(e) => onChange({ kind: e.target.value as AdjKindChoice })}
        >
          <option value="none">No adjustment</option>
          {FEE_ADJUSTMENT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor={`${idPrefix}-amount`}>
          Fee to pay (Rs.){!off && <span className="text-destructive"> *</span>}
        </Label>
        <Input
          id={`${idPrefix}-amount`}
          type="number"
          min={0}
          disabled={off}
          className="font-semibold tabular-nums"
          value={value.amount}
          onChange={(e) => onChange({ amount: e.target.value })}
          placeholder={feeHint !== undefined ? String(feeHint) : "Amount parent pays"}
        />
      </div>
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor={`${idPrefix}-reason`}>
          Reason{!off && <span className="text-destructive"> *</span>}
        </Label>
        <Input
          id={`${idPrefix}-reason`}
          disabled={off}
          value={value.reason}
          maxLength={300}
          onChange={(e) => onChange({ reason: e.target.value })}
          placeholder="e.g. Parent requested fee concession"
        />
      </div>
    </div>
  );
}

/** One-click preset that takes half the tuition off a month (15-day fee). */
function HalfMonthButton({
  toPay,
  applied,
  large,
  onClick,
}: {
  /** Fee the parent pays for a half month. */
  toPay: number;
  applied: boolean;
  large?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={applied}
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-lg border-2 font-semibold shadow-sm transition-all",
        large ? "w-full justify-between px-4 py-2.5 text-sm sm:w-auto" : "px-3 py-1.5 text-xs",
        applied
          ? "border-primary bg-primary text-primary-foreground"
          : "border-primary bg-background text-primary hover:bg-primary/5"
      )}
    >
      <span className="flex items-center gap-2">
        {applied ? (
          <CheckCircle2 className={large ? "h-5 w-5" : "h-4 w-4"} />
        ) : (
          <CalendarRange className={large ? "h-5 w-5" : "h-4 w-4"} />
        )}
        {applied ? "Half month applied" : "Half month (15 days)"}
      </span>
      <span
        className={cn(
          "rounded-md px-2 py-0.5 tabular-nums",
          applied ? "bg-primary-foreground/15 text-primary-foreground" : "bg-primary/10 text-primary"
        )}
      >
        Pay {formatPkr(toPay)}
      </span>
    </button>
  );
}

function formatSignedPkr(n: number) {
  if (!n) return formatPkr(0);
  return `${n < 0 ? "−" : "+"} ${formatPkr(Math.abs(n))}`;
}

const PAYMENT_METHOD_OPTIONS = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "bank_transfer", label: "Bank Transfer", icon: Landmark },
  { value: "online", label: "Online", icon: Globe },
  { value: "other", label: "Other", icon: MoreHorizontal },
] as const;

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter((p) => p && p !== "—");
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

function PaySection({
  icon: Icon,
  title,
  action,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm">
      <header className="flex items-center gap-2 border-b px-4 py-2.5 text-sm font-semibold text-foreground">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="font-semibold">{title}</h3>
        {action && <div className="ml-auto">{action}</div>}
      </header>
      {children}
    </section>
  );
}

function SummaryLine({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "good" | "bad";
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-2">
      <span className={cn("min-w-0", strong ? "font-semibold" : "text-muted-foreground")}>{label}</span>
      <span
        className={cn(
          "max-w-[60%] break-words text-right tabular-nums",
          strong ? "font-semibold" : "font-medium",
          tone === "good" && "text-emerald-600",
          tone === "bad" && "text-destructive"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function PayChip({
  icon: Icon,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/10 bg-primary/[0.06] px-3 py-1 font-medium text-primary">
      <Icon className="h-3.5 w-3.5" />
      {children}
    </span>
  );
}


function PaymentSlipThumb({ path, onOpen }: { path: string; onOpen: () => void }) {
  const src = resolveUploadUrl(path);
  if (isPdfSlip(path)) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="group inline-flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-border bg-muted/40 text-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5 sm:h-16 sm:w-[4.75rem]"
        title="View payment slip"
      >
        <FileText className="h-5 w-5 text-primary" />
        <span className="text-[10px] font-semibold tracking-wide">PDF</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative inline-flex h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/30 shadow-sm transition-colors hover:border-primary/40 sm:h-16 sm:w-[4.75rem]"
      title="View payment slip"
    >
      <img
        src={src}
        alt="Payment slip"
        className="h-full w-full object-cover"
        loading="lazy"
      />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/35">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-background/95 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
          <Eye className="h-3.5 w-3.5 text-foreground" />
        </span>
      </span>
    </button>
  );
}

function PaymentSlipUploadBox({
  file,
  existingPath,
  inputKey,
  onFileChange,
  onClear,
  onPreview,
  onTooLarge,
}: {
  file: File | null;
  existingPath?: string | null;
  inputKey: number;
  onFileChange: (file: File | null) => void;
  onClear: () => void;
  onPreview: (preview: SlipPreviewState) => void;
  onTooLarge: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const localPreviewUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file]
  );

  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  const takeFile = (next: File | null) => {
    if (!next) {
      onFileChange(null);
      return;
    }
    const okType =
      next.type.startsWith("image/") ||
      next.type === "application/pdf" ||
      /\.(jpe?g|png|webp|gif|pdf)$/i.test(next.name);
    if (!okType) {
      onFileChange(null);
      return;
    }
    if (next.size > 5 * 1024 * 1024) {
      onFileChange(null);
      onTooLarge();
      return;
    }
    onFileChange(next);
  };

  const showingLocal = Boolean(file && localPreviewUrl);
  const showingExisting = !showingLocal && Boolean(existingPath);
  const previewSrc = showingLocal
    ? localPreviewUrl!
    : showingExisting
      ? resolveUploadUrl(existingPath!)
      : null;
  const previewIsPdf = showingLocal
    ? isPdfFile(file!)
    : showingExisting
      ? isPdfSlip(existingPath!)
      : false;

  return (
    <div className="min-w-0 max-w-full space-y-1.5">
      <Label htmlFor="payment-slip">Payment slip</Label>
      <input
        ref={inputRef}
        id="payment-slip"
        key={inputKey}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.pdf"
        className="sr-only"
        onChange={(e) => {
          takeFile(e.target.files?.[0] || null);
          e.target.value = "";
        }}
      />

      {previewSrc ? (
        <div className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-muted/20">
          <div className="relative flex max-h-44 min-h-[8rem] min-w-0 items-center justify-center overflow-hidden bg-[linear-gradient(45deg,#f3f4f6_25%,transparent_25%),linear-gradient(-45deg,#f3f4f6_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f3f4f6_75%),linear-gradient(-45deg,transparent_75%,#f3f4f6_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0] dark:bg-none dark:bg-muted/40">
            {previewIsPdf ? (
              <button
                type="button"
                onClick={() => onPreview({ src: previewSrc, isPdf: true })}
                className="flex max-w-full flex-col items-center gap-2 px-4 py-8 text-foreground transition-opacity hover:opacity-80"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-background shadow-sm">
                  <FileText className="h-7 w-7 text-primary" />
                </span>
                <span className="text-sm font-medium">PDF slip ready</span>
                <span className="text-xs text-muted-foreground">Click to preview</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onPreview({ src: previewSrc, isPdf: false })}
                className="group relative flex max-h-44 w-full min-w-0 max-w-full items-center justify-center overflow-hidden p-3"
                title="Preview payment slip"
              >
                <img
                  src={previewSrc}
                  alt="Payment slip preview"
                  className="max-h-40 max-w-full h-auto w-auto object-contain"
                />
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/35 group-hover:opacity-100">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-background/95 px-3 py-1.5 text-xs font-medium shadow-sm">
                    <Eye className="h-3.5 w-3.5" />
                    Preview
                  </span>
                </span>
              </button>
            )}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 border-t border-border bg-background px-3 py-2.5 sm:gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
              {previewIsPdf ? (
                <FileText className="h-4 w-4 text-primary" />
              ) : (
                <ImageIcon className="h-4 w-4 text-primary" />
              )}
            </span>
            <div className="min-w-0 flex-1 basis-[8rem]">
              <p className="truncate text-sm font-medium" title={file?.name || undefined}>
                {file?.name || (showingExisting ? "Current payment slip" : "Payment slip")}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {file
                  ? `${formatFileSize(file.size)} · ready to upload`
                  : "Previously uploaded · click preview to view"}
              </p>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 px-0"
                onClick={() => onPreview({ src: previewSrc, isPdf: previewIsPdf })}
                title="Preview"
              >
                <Eye className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => inputRef.current?.click()}
              >
                Replace
              </Button>
              {file ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 px-0 text-destructive hover:text-destructive"
                  onClick={onClear}
                  title="Remove selected file"
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            takeFile(e.dataTransfer.files?.[0] || null);
          }}
          className={cn(
            "flex w-full min-w-0 max-w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors",
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border bg-muted/20 hover:border-primary/40 hover:bg-muted/35"
          )}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background shadow-sm">
            <Upload className="h-5 w-5 text-primary" />
          </span>
          <div className="min-w-0 max-w-full">
            <p className="text-sm font-medium">Drop slip here or click to upload</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Image or PDF · up to 5 MB · optional
            </p>
          </div>
        </button>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    overdue: "bg-destructive/15 text-destructive",
    waived: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`text-xs font-semibold rounded-full px-2 py-0.5 capitalize ${colors[status] || "bg-muted text-muted-foreground"
        }`}
    >
      {status}
    </span>
  );
}

export default function AcademyFeesManagement({
  caps,
  studentId,
  routes: routesProp,
  showGenerate = true,
  showFilters = true,
  /** Hide enrollment / generate / defaulter download action row */
  showBulkActions = true,
  /** Lock status filter (e.g. "paid" for the Paid tab) */
  lockedStatus,
  sessionId = "",
  collectStudentId = null,
  onCollectHandled,
}: {
  caps: ModuleActionCaps;
  /** When set, only this student's fee history is shown */
  studentId?: string;
  routes?: AcademyStudentRoutes;
  showGenerate?: boolean;
  showFilters?: boolean;
  showBulkActions?: boolean;
  lockedStatus?: "" | "paid" | "pending" | "overdue" | "waived";
  /** Academic session scope from SessionBar (ignored for parents / student detail). */
  sessionId?: string;
  /** Open the Collect Student Fee window for this student (e.g. from the defaulter list). */
  collectStudentId?: string | null;
  /** Called once the request in `collectStudentId` has been handled. */
  onCollectHandled?: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isParent = user?.role === "parent";
  const routes =
    routesProp ?? (user?.role ? academyStudentRoutes(user.role, "records") : null);
  const { apiSessionId, writable, hasScope } = useSessionScope(sessionId || "");
  const scopeEnabled = isParent || Boolean(studentId) || hasScope;
  const paidOnlyView = lockedStatus === "paid";

  const now = new Date();
  /** Generate always bills the current month. */
  const month = String(now.getMonth() + 1);
  const year = String(now.getFullYear());
  /** From / To on both panels: the date the fee was paid (due date for unpaid). */
  const [rangeFrom, setRangeFrom] = useState(() => localTodayYmd().slice(0, 8) + "01");
  const [rangeTo, setRangeTo] = useState(() => {
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return `${localTodayYmd().slice(0, 8)}${String(last).padStart(2, "0")}`;
  });
  const [statusFilter, setStatusFilter] = useState(() =>
    lockedStatus || (user?.role === "parent" ? "paid" : "")
  );
  const [classFilter, setClassFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [selectedParentStudentId, setSelectedParentStudentId] = useState<string>(() => {
    try {
      return localStorage.getItem("parent_selected_student_id") || "";
    } catch {
      return "";
    }
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [search, setSearch] = useState("");
  const [payRecord, setPayRecord] = useState<AcademyFeeRecord | null>(null);
  const [waiveRecord, setWaiveRecord] = useState<AcademyFeeRecord | null>(null);
  const [waiveMode, setWaiveMode] = useState<"waive" | "unwaive">("waive");
  const [waiveReason, setWaiveReason] = useState("");
  const openWaive = (r: AcademyFeeRecord, mode: "waive" | "unwaive") => {
    setWaiveMode(mode);
    setWaiveReason("");
    setWaiveRecord(r);
  };  const [payModalMode, setPayModalMode] = useState<"pay" | "edit">("pay");
  const [selectedFeeIds, setSelectedFeeIds] = useState<string[]>([]);
  const [selectedChargeIds, setSelectedChargeIds] = useState<string[]>([]);
  const [amountOverrides, setAmountOverrides] = useState<Record<string, string>>({});
  /** Months whose amount the user typed. Charge changes must not overwrite those. */
  const amountTouchedRef = useRef<Set<string>>(new Set());
  /** Resets the pay form only when a different voucher or mode is opened. */
  const payFormKeyRef = useRef("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [adjKind, setAdjKind] = useState<AdjKindChoice>("none");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjReason, setAdjReason] = useState("");
  /** "same" = one adjustment on every selected month; "each" = own adjustment per month. */
  const [adjMode, setAdjMode] = useState<"same" | "each">("same");
  const [adjEach, setAdjEach] = useState<Record<string, AdjInput>>({});
  /** Cash received now; empty means the full amount due. */
  const [amountReceived, setAmountReceived] = useState("");
  /** Set when the dialog opens; shown in the footer as the transaction time. */
  const [payOpenedAt, setPayOpenedAt] = useState(() => new Date());
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayInputValue);
  const [paymentSlipNumber, setPaymentSlipNumber] = useState("");
  const [paymentSlip, setPaymentSlip] = useState<File | null>(null);
  const [slipInputKey, setSlipInputKey] = useState(0);
  const [slipPreview, setSlipPreview] = useState<SlipPreviewState | null>(null);
  const [challanPrint, setChallanPrint] = useState<ChallanPrintRequest | null>(null);
  const [exportingMonthWise, setExportingMonthWise] = useState<DefaulterReportFormat | null>(null);
  const [exportingPaidReport, setExportingPaidReport] = useState<DefaulterReportFormat | null>(null);
  const [exportingClassAccounts, setExportingClassAccounts] = useState<DefaulterReportFormat | null>(null);
  const [enrollmentWizardOpen, setEnrollmentWizardOpen] = useState(false);
  const [assignSectionStudentId, setAssignSectionStudentId] = useState<string | null>(null);
  const [correction, setCorrection] = useState<{
    record: AcademyFeeRecord;
    mode: "reverse" | "refund" | "transfer";
  } | null>(null);
  const [correctionReason, setCorrectionReason] = useState("");
  const [transferSearch, setTransferSearch] = useState("");
  const [transferStudent, setTransferStudent] = useState<AcademyStudent | null>(null);
  const [transferTargetFeeId, setTransferTargetFeeId] = useState("");

  const childScoped = Boolean(studentId) || isParent;
  const effectiveStudentId = studentId || (isParent ? selectedParentStudentId || undefined : undefined);
  /** Parents see this child's fee history (paid emphasized); staff keep status filters. */
  const effectiveStatusFilter = isParent ? "" : statusFilter;

  const filterParams = useMemo(
    () => ({
      classId: effectiveStudentId || isParent ? undefined : classFilter || undefined,
      sectionId: effectiveStudentId || isParent ? undefined : sectionFilter || undefined,
      studentId: effectiveStudentId,
      sessionId: effectiveStudentId || isParent ? undefined : apiSessionId,
      // Both panels: From / To is the payment date (see buildFeeQuery).
      dateFrom: !effectiveStudentId ? rangeFrom || undefined : undefined,
      dateTo: !effectiveStudentId ? rangeTo || undefined : undefined,
    }),
    [
      classFilter,
      sectionFilter,
      effectiveStudentId,
      isParent,
      apiSessionId,
      rangeFrom,
      rangeTo,
    ]
  );

  useEffect(() => {
    if (lockedStatus) setStatusFilter(lockedStatus);
  }, [lockedStatus]);

  useEffect(() => {
    setPage(1);
    setClassFilter("");
    setSectionFilter("");
  }, [statusFilter, effectiveStudentId, sessionId]);

  useEffect(() => {
    setSectionFilter("");
    setPage(1);
  }, [classFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, sectionFilter, rangeFrom, rangeTo]);

  useEffect(() => {
    if (!isParent) return;
    try {
      localStorage.setItem("parent_selected_student_id", selectedParentStudentId || "");
    } catch {
      // ignore storage failures
    }
  }, [isParent, selectedParentStudentId]);

  const { data: parentStudents = EMPTY_PARENT_STUDENTS } = useQuery({
    queryKey: ["parent-students-fees"],
    queryFn: async () => {
      const r = await fetchAcademyStudents({ page: 1, limit: 200, status: "active" });
      return r.students;
    },
    enabled: isParent && !studentId,
    retry: false,
  });

  useEffect(() => {
    if (!isParent || studentId) return;
    if (!parentStudents.length) {
      if (selectedParentStudentId) setSelectedParentStudentId("");
      return;
    }
    if (!selectedParentStudentId || !parentStudents.some((s) => s._id === selectedParentStudentId)) {
      setSelectedParentStudentId(parentStudents[0]._id);
    }
  }, [isParent, studentId, parentStudents, selectedParentStudentId]);

  const { data: classes = [] } = useQuery({
    queryKey: ["academy-classes", sessionId],
    queryFn: () => fetchAcademyClasses({ status: "active", sessionId: apiSessionId }),
    enabled: showFilters && !studentId && !isParent && hasScope,
  });

  const { data: sections = [] } = useQuery({
    queryKey: ["academy-fee-sections", sessionId, classFilter],
    queryFn: () =>
      classFilter
        ? fetchSectionsByClass(classFilter, { status: "active" })
        : fetchAcademySectionsBySession(apiSessionId, { status: "active" }),
    enabled: showFilters && !studentId && !isParent && hasScope,
  });

  // A section belongs to one class, so the Accounts Report only needs the section picked.
  const accountsClassId = useMemo(() => {
    if (classFilter) return classFilter;
    const sec = sections.find((s) => s._id === sectionFilter);
    const cid = sec?.classId;
    return cid ? (typeof cid === "object" ? cid._id : String(cid)) : "";
  }, [classFilter, sectionFilter, sections]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["academy-fees", page, pageSize, search, effectiveStatusFilter, filterParams],
    queryFn: () =>
      fetchAcademyFees({
        page,
        limit: pageSize,
        search: search.trim() || undefined,
        status: effectiveStatusFilter || undefined,
        ...filterParams,
      }),
    enabled: scopeEnabled && (!isParent || Boolean(effectiveStudentId)),
    retry: false,
  });

  const { data: summary, isLoading: summaryLoading, isError: summaryError, error: summaryErr } = useQuery({
    queryKey: ["academy-fees-summary", filterParams, effectiveStatusFilter],
    queryFn: () => fetchAcademyFeeSummary(filterParams),
    enabled: scopeEnabled && (!isParent || Boolean(effectiveStudentId)),
    retry: false,
  });

  const genMut = useMutation({
    mutationFn: () => {
      if (!writable) throw new Error("Switch to the active session to generate fees.");
      return generateMonthlyFees({
        month: Number(month),
        year: Number(year),
        classId: classFilter || undefined,
      });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["academy-fees"] });
      qc.invalidateQueries({ queryKey: ["academy-fees-summary"] });
      qc.invalidateQueries({ queryKey: ["academy-student-record"] });
      toast({
        title: "Monthly fees generated",
        description: [
          `${r.created} created`,
          `${r.skipped} skipped (already billed / admission month)`,
          r.repaired ? `${r.repaired} enrollment-month duplicates waived` : null,
        ]
          .filter(Boolean)
          .join(", "),
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resyncMut = useMutation({
    mutationFn: () => {
      if (!writable) throw new Error("Switch to the active session to resync charges.");
      return resyncSeparateFeeCharges({
        month: month ? Number(month) : undefined,
        year: year ? Number(year) : undefined,
        classId: classFilter || undefined,
        sessionId: apiSessionId || undefined,
        studentId: effectiveStudentId || undefined,
      });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["academy-fees"] });
      qc.invalidateQueries({ queryKey: ["academy-fees-summary"] });
      qc.invalidateQueries({ queryKey: ["academy-student-record"] });
      toast({
        title: "Separate charges resynced",
        description: [
          `${r.merged} merged into monthly challans`,
          `${r.waivedRecords} separate rows waived (kept, not deleted)`,
          r.createdMonthly ? `${r.createdMonthly} monthly challans created` : null,
          r.skipped ? `${r.skipped} skipped` : null,
          r.amountMerged ? `${formatPkr(r.amountMerged)} moved` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const payStudentId = payRecord ? studentMongoId(payRecord) : "";
  const { data: payHistory, isLoading: payHistoryLoading } = useQuery({
    queryKey: ["academy-fee-history", payStudentId],
    queryFn: () => fetchStudentFeeHistory(payStudentId),
    enabled: Boolean(payStudentId),
  });

  const { data: allCharges = EMPTY_ADDITIONAL_CHARGES, isFetched: chargesFetched } = useQuery({
    queryKey: ["additional-charges"],
    queryFn: fetchAdditionalCharges,
    enabled: Boolean(payRecord) && payModalMode !== "edit",
  });

  const unpaidForPay = useMemo(() => {
    return (payHistory?.records || [])
      .filter((r) => r.status === "pending" || r.status === "overdue")
      .sort((a, b) => a.year - b.year || a.month - b.month);
  }, [payHistory]);

  const payApplicableCharges = useMemo(
    () =>
      applicableChargesForFees(
        allCharges,
        payHistory?.student,
        unpaidForPay.filter((f) => f.feeType === "monthly" || f.feeType === "admission")
      ),
    [allCharges, payHistory?.student, unpaidForPay]
  );

  useEffect(() => {
    if (!payRecord) {
      payFormKeyRef.current = "";
      return;
    }
    if (!payHistory) return;
    // Wait for the charge catalog so the first amounts already include checked charges.
    if (payModalMode === "pay" && !chargesFetched) return;

    const formKey = `${payModalMode}:${payRecord._id}`;
    const isNewForm = payFormKeyRef.current !== formKey;
    if (isNewForm) {
      payFormKeyRef.current = formKey;
      amountTouchedRef.current = new Set();
      setAdjKind("none");
      setAdjAmount("");
      setAdjReason("");
      setAdjMode("same");
      setAdjEach({});
      setAmountReceived("");
      setPayOpenedAt(new Date());
    }

    // Paid edit uses the voucher itself — don't replace with unpaid months.
    if (payModalMode === "edit" && payRecord.status === "paid") {
      if (!isNewForm) return;
      setSelectedFeeIds([payRecord._id]);
      setSelectedChargeIds([]);
      setAmountOverrides({ [payRecord._id]: String(payRecord.amount ?? "") });
      return;
    }

    // Keep voucher as-is: only pre-check charges already on the challan. Do not auto-apply
    // registration defaults (that would rewrite previously correct voucher amounts).
    const fromFees = unpaidForPay.flatMap((fee) => chargeIdsOnFee(fee));
    const applicableIds = new Set(payApplicableCharges.map((c) => c._id));
    const initialCharges = [...new Set(fromFees)].filter((id) => applicableIds.has(id));

    if (isNewForm) {
      // Default to the clicked voucher only — user can check more months if needed.
      const clickedUnpaid = unpaidForPay.some((r) => r._id === payRecord._id);
      setSelectedFeeIds(
        clickedUnpaid
          ? [payRecord._id]
          : unpaidForPay[0]
            ? [unpaidForPay[0]._id]
            : [payRecord._id]
      );
      setSelectedChargeIds(initialCharges);
      const amounts: Record<string, string> = {};
      for (const fee of unpaidForPay) {
        amounts[fee._id] = String(
          feeAmountWithCharges(fee, payHistory.student, allCharges, initialCharges)
        );
      }
      setAmountOverrides(amounts);
      return;
    }

    // Edit mode keeps whatever was typed. Pay mode refills only rows not typed yet,
    // so checking a charge updates the fee until staff enter their own amount.
    if (payModalMode === "edit") return;
    setAmountOverrides((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const fee of unpaidForPay) {
        if (amountTouchedRef.current.has(fee._id)) continue;
        const value = String(
          feeAmountWithCharges(fee, payHistory.student, allCharges, selectedChargeIds)
        );
        if (next[fee._id] !== value) {
          next[fee._id] = value;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [
    payRecord,
    payHistory,
    unpaidForPay,
    payModalMode,
    allCharges,
    payApplicableCharges,
    chargesFetched,
    selectedChargeIds,
  ]);

  const parsedFeeAmount = (fee: AcademyFeeRecord) => {
    const raw = amountOverrides[fee._id];
    if (raw === undefined || raw.trim() === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const feeAmount = (fee: AcademyFeeRecord) => {
    const parsed = parsedFeeAmount(fee);
    if (parsed !== null) return parsed;
    if (amountOverrides[fee._id] === undefined) return Number(fee.amount) || 0;
    return 0;
  };

  const setFeeAmount = (feeId: string, value: string, markTouched: boolean) => {
    if (markTouched) amountTouchedRef.current.add(feeId);
    setAmountOverrides((prev) => ({ ...prev, [feeId]: value }));
  };

  const selectedUnpaid = unpaidForPay.filter((r) => selectedFeeIds.includes(r._id));
  const selectedTotal = selectedUnpaid.reduce((sum, r) => sum + feeAmount(r), 0);

  const editingPaid = payModalMode === "edit" && payRecord?.status === "paid";

  const payStudent = payHistory?.student ?? (payRecord ? studentFromRecord(payRecord) : null);
  const tuitionPart = (fee: AcademyFeeRecord) => {
    const comps = fee.components || [];
    if (!comps.length) return fee.feeType === "monthly" ? Number(fee.amount) || 0 : 0;
    return comps
      .filter((line) => line.kind === "tuition")
      .reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
  };
  const remainingUnpaid = unpaidForPay.filter((r) => !selectedFeeIds.includes(r._id));
  /** Installments already received on a voucher that is not fully paid. */
  const received = (fee: AcademyFeeRecord) => Number(fee.paidAmount) || 0;
  const remainingTotal = remainingUnpaid.reduce(
    (sum, r) => sum + Math.max(0, feeAmount(r) - received(r)),
    0
  );
  const originalTotal =
    editingPaid && payRecord
      ? Number(amountOverrides[payRecord._id] ?? payRecord.amount) || 0
      : selectedTotal;

  const adjEnabled = payModalMode === "pay" && !editingPaid;
  const adjPerMonth = adjMode === "each" && selectedUnpaid.length > 1;
  const adjInputFor = (fee: AcademyFeeRecord): AdjInput =>
    adjPerMonth
      ? adjEach[fee._id] ?? EMPTY_ADJ
      : { kind: adjKind, amount: adjAmount, reason: adjReason };
  const setAdjFor = (feeId: string, patch: Partial<AdjInput>) =>
    setAdjEach((prev) => ({ ...prev, [feeId]: { ...(prev[feeId] ?? EMPTY_ADJ), ...patch } }));
  /** Problem with one month's adjustment, or "" when it is fine (or not set). */
  const adjIssue = (fee: AcademyFeeRecord, input: AdjInput) => {
    if (input.kind === "none") return "";
    const forMonth = selectedUnpaid.length > 1 ? ` for ${periodLabel(fee)}` : "";
    const toPay = Number(input.amount);
    const fee0 = feeAmount(fee);
    if (input.amount.trim() === "") return `Enter the fee the parent will pay${forMonth}.`;
    if (!Number.isFinite(toPay) || toPay < 0) return `Fee to pay${forMonth} must be 0 or more.`;
    const diff = Math.round((toPay - fee0) * 100) / 100;
    if (Math.abs(diff) <= 0.009) {
      return `Fee to pay${forMonth} is the same as the fee (${formatPkr(fee0)}) — choose "No adjustment".`;
    }
    if (diff > 0 && input.kind !== "late_fine") {
      return `Fee to pay${forMonth} is more than the fee (${formatPkr(fee0)}). Choose "Late fine" to charge extra.`;
    }
    if (diff < 0 && input.kind === "late_fine") {
      return `A late fine must be more than the fee (${formatPkr(fee0)})${forMonth}.`;
    }
    if (toPay + 0.009 < received(fee)) {
      return `Fee to pay${forMonth} can't be less than ${formatPkr(received(fee))} already received.`;
    }
    if (input.reason.trim().length < 2) return `Enter a reason for the adjustment${forMonth}.`;
    return "";
  };
  const adjEntries = adjEnabled
    ? selectedUnpaid.flatMap((fee) => {
        const input = adjInputFor(fee);
        if (input.kind === "none" || adjIssue(fee, input)) return [];
        const delta = Math.round((Number(input.amount) - feeAmount(fee)) * 100) / 100;
        const kind = input.kind as FeeAdjustmentKind;
        return [
          {
            fee,
            kind,
            /** Size of the change (always positive), as the API expects. */
            amount: Math.abs(delta),
            delta,
            reason: input.reason.trim(),
          },
        ];
      })
    : [];
  const adjError = adjEnabled
    ? selectedUnpaid.map((fee) => adjIssue(fee, adjInputFor(fee))).find(Boolean) ?? ""
    : "";
  const adjByFee = new Map(adjEntries.map((entry) => [entry.fee._id, entry]));
  const adjActive = adjEntries.length > 0;
  /** Net change across every adjusted month (negative = reduction). */
  const adjDelta = adjEntries.reduce((sum, entry) => sum + entry.delta, 0);
  const finalTotal = Math.max(0, originalTotal + adjDelta);
  const receivedTotal = adjEnabled ? selectedUnpaid.reduce((sum, fee) => sum + received(fee), 0) : 0;
  /** Still owed on the selected months after adjustments and earlier installments. */
  const dueNow = Math.max(0, finalTotal - receivedTotal);
  const cashTyped = amountReceived.trim() !== "";
  const cashNum = cashTyped ? Number(amountReceived) : dueNow;
  let cashError = "";
  if (adjEnabled && cashTyped) {
    if (!Number.isFinite(cashNum) || cashNum <= 0) cashError = "Enter the amount received.";
    else if (cashNum > dueNow + 0.009) cashError = `Amount received can't be more than ${formatPkr(dueNow)}.`;
  }
  const cashNow = cashError ? 0 : Math.min(cashNum, dueNow);
  const balanceAfter = adjEnabled ? Math.max(0, dueNow - cashNow) : 0;
  const isPartialPayment = adjEnabled && !cashError && balanceAfter > 0.009;
  const canHalfMonth = (fee: AcademyFeeRecord) =>
    fee.feeType === "monthly" && tuitionPart(fee) > 0;
  const switchAdjMode = (mode: "same" | "each") => {
    if (mode === adjMode) return;
    if (mode === "each") {
      // Start every month from the shared values so nothing typed is lost.
      setAdjEach((prev) => {
        const next = { ...prev };
        for (const fee of selectedUnpaid) {
          if (!next[fee._id] || next[fee._id].kind === "none") {
            next[fee._id] = { kind: adjKind, amount: adjAmount, reason: adjReason };
          }
        }
        return next;
      });
    }
    setAdjMode(mode);
  };
  type SummaryRow = {
    fee: AcademyFeeRecord;
    /** Fee before any adjustment. */
    amount: number;
    lines: { key: string; name: string; amount: number; kind: string }[];
    /** True when lines are the real voucher breakdown (not a single fallback line). */
    detailed: boolean;
    adjustment: number;
    adjustmentLabel: string;
    adjustmentReason: string;
  };
  const adjLabel = (kind: string | undefined) =>
    FEE_ADJUSTMENT_OPTIONS.find((o) => o.value === kind)?.label ?? "Adjustment";
  const summaryRows: SummaryRow[] = !payRecord
    ? []
    : editingPaid
      ? [payRecord].map((fee) => {
          const paidNow = Number(amountOverrides[fee._id] ?? fee.amount) || 0;
          const prior = Number(fee.adjustment?.amount) || 0;
          return {
            fee,
            amount: paidNow - prior,
            lines: [
              {
                key: "voucher",
                name: prior ? "Original voucher" : "Paid amount",
                amount: paidNow - prior,
                kind: "voucher",
              },
            ],
            detailed: false,
            adjustment: prior,
            adjustmentLabel: adjLabel(fee.adjustment?.kind),
            adjustmentReason: fee.adjustment?.reason ?? "",
          };
        })
      : selectedUnpaid.map((fee) => {
          const amount = feeAmount(fee);
          const preview =
            payModalMode === "pay"
              ? feePreviewLines(fee, payHistory?.student, allCharges, selectedChargeIds)
              : [];
          const previewSum = preview.reduce((sum, line) => sum + line.amount, 0);
          const detailed = preview.length > 0 && Math.abs(previewSum - amount) <= 0.009;
          const entry = adjByFee.get(fee._id);
          return {
            fee,
            amount,
            lines: detailed
              ? preview
              : [{ key: "voucher", name: "Voucher amount", amount, kind: "voucher" }],
            detailed,
            adjustment: entry?.delta ?? 0,
            adjustmentLabel: adjLabel(entry?.kind),
            adjustmentReason: entry?.reason ?? "",
          };
        });
  /** Preset: take half the tuition off; admission and charges stay in full. */
  const halfMonthOff = (fee: AcademyFeeRecord) => Math.round(tuitionPart(fee) / 2);
  const halfMonthToPay = (fee: AcademyFeeRecord) => Math.max(0, feeAmount(fee) - halfMonthOff(fee));
  const isHalfMonthApplied = (fee: AcademyFeeRecord, input: AdjInput) =>
    input.kind === "partial_month" &&
    input.amount.trim() !== "" &&
    Number(input.amount) === halfMonthToPay(fee);
  const applyHalfMonth = (fee: AcademyFeeRecord) => {
    const amount = String(halfMonthToPay(fee));
    const reason = "Half month (15 days) fee";
    if (adjPerMonth) {
      setAdjFor(fee._id, {
        kind: "partial_month",
        amount,
        reason: adjEach[fee._id]?.reason?.trim() || reason,
      });
      return;
    }
    setAdjKind("partial_month");
    setAdjAmount(amount);
    if (!adjReason.trim()) setAdjReason(reason);
  };


  const payMut = useMutation({
    mutationFn: async () => {
      if (!payRecord) throw new Error("No fee selected");

      // Edit a paid voucher — update details only (do not re-pay).
      if (payModalMode === "edit" && payRecord.status === "paid") {
        const nextAmount = Number(amountOverrides[payRecord._id] ?? payRecord.amount);
        if (!Number.isFinite(nextAmount) || nextAmount < 0) {
          throw new Error("Amount cannot be negative");
        }
        const updated = await updateAcademyFee(payRecord._id, {
          amount: nextAmount,
          notes: paymentNotes.trim(),
          paymentMethod,
          paymentSlipNumber: paymentSlipNumber.trim(),
          paidAt: paymentDate,
          slip: paymentSlip,
        });
        return {
          paid: 1,
          total: Number(updated.amount) || nextAmount,
          needsSectionAssignment: false,
          studentId: undefined as string | undefined,
        };
      }

      const notes = paymentNotes.trim();
      if (payModalMode === "edit") {
        for (const fee of selectedUnpaid) {
          const nextAmount = parsedFeeAmount(fee);
          if (nextAmount === null) throw new Error("Enter a valid fee amount");
          if (nextAmount !== Number(fee.amount)) {
            await updateAcademyFee(fee._id, {
              amount: nextAmount,
              ...(notes ? { notes } : {}),
            });
          }
        }
      } else {
        const chargeableIds = selectedUnpaid
          .filter((f) => f.feeType === "monthly" || f.feeType === "admission")
          .map((f) => f._id);
        // Charges rebuild the voucher from the student profile. Write a typed
        // amount after that so a 15-day (or other) fee is what gets paid.
        const charged = chargeableIds.length
          ? await applyFeeCharges({
              feeRecordIds: chargeableIds,
              chargeIds: selectedChargeIds,
            })
          : [];
        const chargedAmount = new Map(
          (charged || []).map((row) => [String(row._id), Number(row.amount) || 0])
        );
        for (const fee of selectedUnpaid) {
          const nextAmount = parsedFeeAmount(fee);
          if (nextAmount === null) throw new Error("Enter a valid fee amount");
          // Compare with the voucher after charges, not the preview. Charges rebuild
          // the full monthly fee, so a typed (or on-screen) amount has to be saved after.
          const afterCharges = chargedAmount.get(String(fee._id));
          const serverAmount =
            afterCharges === undefined ? Number(fee.amount) || 0 : afterCharges;
          if (Math.abs(nextAmount - serverAmount) > 0.009) {
            await updateAcademyFee(fee._id, {
              amount: nextAmount,
              ...(notes ? { notes } : {}),
            });
          }
        }
      }
      if (adjError) throw new Error(adjError);
      if (cashError) throw new Error(cashError);
      return payAcademyFees({
        feeRecordIds: selectedFeeIds,
        amountReceived: cashTyped ? cashNum : undefined,
        adjustments: adjActive
          ? adjEntries.map((entry) => ({
              feeRecordId: entry.fee._id,
              kind: entry.kind,
              amount: entry.amount,
              reason: entry.reason,
            }))
          : undefined,
        paymentMethod,
        paymentSlipNumber: paymentSlipNumber.trim() || undefined,
        notes: paymentNotes.trim() || undefined,
        paidAt: paymentDate,
        slip: paymentSlip,
      });
    },
    onSuccess: (result) => {
      const wasEdit = payModalMode === "edit";
      qc.invalidateQueries({ queryKey: ["academy-fees"] });
      qc.invalidateQueries({ queryKey: ["academy-fees-summary"] });
      qc.invalidateQueries({ queryKey: ["academy-fee-history"] });
      qc.invalidateQueries({ queryKey: ["academy-student-record"] });
      qc.invalidateQueries({ queryKey: ["fee-defaulters"] });
      amountTouchedRef.current = new Set();
      setPayRecord(null);
      setSelectedFeeIds([]);
      setSelectedChargeIds([]);
      setAmountOverrides({});
      setPayModalMode("pay");
      setPaymentNotes("");
      setPaymentSlipNumber("");
      setPaymentDate(todayInputValue());
      setPaymentSlip(null);
      setSlipInputKey((key) => key + 1);
      toast({
        title: wasEdit
          ? "Fee updated"
          : "partial" in result && result.partial
            ? "Installment recorded"
            : "Payment recorded",
        description:
          "partial" in result && result.partial
            ? `${formatPkr(result.total)} received · ${formatPkr(result.balanceLeft ?? 0)} still due`
            : `${result.paid} month${result.paid === 1 ? "" : "s"} · ${formatPkr(result.total)}`,
      });
      if (result.needsSectionAssignment && result.studentId) {
        setAssignSectionStudentId(result.studentId);
      }
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const waiveMut = useMutation({
    mutationFn: async ({
      record,
      mode,
      reason,
    }: {
      record: AcademyFeeRecord;
      mode: "waive" | "unwaive";
      reason: string;
    }) =>
      mode === "waive" ? waiveAcademyFee(record._id, reason) : unwaiveAcademyFee(record._id, reason),
    onSuccess: (_updated, { record, mode }) => {
      qc.invalidateQueries({ queryKey: ["academy-fees"] });
      qc.invalidateQueries({ queryKey: ["academy-fees-summary"] });
      qc.invalidateQueries({ queryKey: ["academy-fee-history"] });
      qc.invalidateQueries({ queryKey: ["academy-student-record"] });
      qc.invalidateQueries({ queryKey: ["fee-defaulters"] });
      qc.invalidateQueries({ queryKey: ["fee-defaulters-summary"] });
      setWaiveRecord(null);
      setWaiveReason("");
      toast(
        mode === "waive"
          ? {
              title: "Month waived",
              description: `${periodLabel(record)} is no longer counted as a defaulter.`,
            }
          : {
              title: "Waive undone",
              description: `${periodLabel(record)} is unpaid again.`,
            }
      );
    },
    onError: (e: Error, { mode }) =>
      toast({
        title: mode === "waive" ? "Could not waive fee" : "Could not undo waive",
        description: e.message,

        variant: "destructive",
      }),
  });

  const printMut = useMutation({
    mutationFn: ({
      id,
      studentId: sid,
      size,
      months,
      chargeIds,
    }: {
      id?: string;
      studentId?: string;
      size: FeeReceiptSize;
      months?: number;
      chargeIds?: string[];
    }) =>
      sid
        ? printFeeChallan(sid, size, months, chargeIds)
        : printFeeReceipt(id!, size),
    onSuccess: () => {
      setChallanPrint(null);
      qc.invalidateQueries({ queryKey: ["academy-fees"] });
      qc.invalidateQueries({ queryKey: ["academy-fee-history"] });
    },
    onError: (e: Error) =>
      toast({ title: "Could not print", description: e.message, variant: "destructive" }),
  });

  const transferStudentsQ = useQuery({
    queryKey: ["academy-students", "fee-transfer", transferSearch, apiSessionId],
    queryFn: () =>
      fetchAcademyStudents({
        search: transferSearch.trim(),
        limit: 12,
        sessionId: apiSessionId || undefined,
      }),
    enabled:
      Boolean(correction) &&
      correction.mode === "transfer" &&
      transferSearch.trim().length >= 2 &&
      !transferStudent,
  });

  const transferHistoryQ = useQuery({
    queryKey: ["academy-fee-history", "transfer-target", transferStudent?._id],
    queryFn: () => fetchStudentFeeHistory(transferStudent!._id),
    enabled: Boolean(correction?.mode === "transfer" && transferStudent?._id),
  });

  const matchingTransferFees = useMemo(() => {
    if (!correction || !transferHistoryQ.data?.records) return EMPTY_FEE_RECORDS;
    const src = correction.record;
    return transferHistoryQ.data.records.filter(
      (f) =>
        f.feeType === src.feeType &&
        f.month === src.month &&
        f.year === src.year &&
        (f.status === "pending" || f.status === "overdue")
    );
  }, [correction, transferHistoryQ.data]);

  useEffect(() => {
    if (!correction || correction.mode !== "transfer") return;
    if (matchingTransferFees.length === 1) {
      setTransferTargetFeeId(matchingTransferFees[0]._id);
    } else if (
      transferTargetFeeId &&
      !matchingTransferFees.some((f) => f._id === transferTargetFeeId)
    ) {
      setTransferTargetFeeId("");
    }
  }, [correction, matchingTransferFees, transferTargetFeeId]);

  const invalidateFeeQueries = () => {
    qc.invalidateQueries({ queryKey: ["academy-fees"] });
    qc.invalidateQueries({ queryKey: ["academy-fees-summary"] });
    qc.invalidateQueries({ queryKey: ["academy-fee-history"] });
    qc.invalidateQueries({ queryKey: ["academy-student-record"] });
    qc.invalidateQueries({ queryKey: ["fee-defaulters"] });
  };

  const closeCorrection = () => {
    setCorrection(null);
    setCorrectionReason("");
    setTransferSearch("");
    setTransferStudent(null);
    setTransferTargetFeeId("");
  };

  const openCorrection = (
    record: AcademyFeeRecord,
    mode: "reverse" | "refund" | "transfer"
  ) => {
    if (!writable) {
      toast({
        title: "Read-only session",
        description: "Switch to the active session to update fees.",
        variant: "destructive",
      });
      return;
    }
    setCorrection({ record, mode });
    setCorrectionReason("");
    setTransferSearch("");
    setTransferStudent(null);
    setTransferTargetFeeId("");
  };

  const correctionMut = useMutation({
    mutationFn: async () => {
      if (!correction) throw new Error("Nothing selected");
      const reason = correctionReason.trim();
      if (reason.length < 3) throw new Error("Enter a reason (at least 3 characters)");
      const id = correction.record._id;
      if (correction.mode === "reverse") return reverseAcademyFeePayment(id, reason);
      if (correction.mode === "refund") return refundAcademyFeePayment(id, reason);
      if (!transferStudent?._id) throw new Error("Select the correct student");
      return transferAcademyFeePayment(id, {
        targetStudentId: transferStudent._id,
        targetFeeRecordId: transferTargetFeeId || undefined,
        reason,
      });
    },
    onSuccess: (result) => {
      const mode = correction?.mode;
      invalidateFeeQueries();
      closeCorrection();
      if (mode === "transfer" && result && "to" in result) {
        toast({
          title: "Payment transferred",
          description: `${studentName(result.from)} → ${studentName(result.to)} · ${formatPkr(result.to.amount)}`,
        });
        if (result.needsSectionAssignment && result.studentId) {
          setAssignSectionStudentId(result.studentId);
        }
        return;
      }
      toast({
        title: mode === "refund" ? "Payment refunded" : "Payment reversed",
        description:
          mode === "refund"
            ? "Fee marked unpaid and noted as refunded."
            : "Fee is unpaid again so you can correct it.",
      });
    },
    onError: (e: Error) =>
      toast({ title: "Could not update payment", description: e.message, variant: "destructive" }),
  });

  const openPayModal = (r: AcademyFeeRecord, mode: "pay" | "edit" = "pay") => {
    if (!writable) {
      toast({
        title: "Read-only session",
        description: "Switch to the active session to update fees.",
        variant: "destructive",
      });
      return;
    }
    setPayModalMode(mode);
    setPayRecord(r);
    setSelectedChargeIds([]);
    setPaymentMethod(r.paymentMethod || "cash");
    setPaymentNotes(r.notes || "");
    setPaymentSlipNumber(r.paymentSlipNumber || "");
    setPaymentDate(
      r.paidAt ? String(r.paidAt).slice(0, 10) : todayInputValue()
    );
    setPaymentSlip(null);
    setAmountOverrides(
      mode === "edit" && r.status === "paid" ? { [r._id]: String(r.amount ?? "") } : {}
    );
    setSelectedFeeIds(mode === "edit" && r.status === "paid" ? [r._id] : []);
    setSlipInputKey((key) => key + 1);
  };

  // Opened from another tab (defaulter list): load the student's fees, then open Collect Fee
  // on their oldest unpaid voucher. The window ticks every overdue month by default.
  const { data: collectHistory, isError: collectHistoryError } = useQuery({
    queryKey: ["academy-fee-history", collectStudentId],
    queryFn: () => fetchStudentFeeHistory(collectStudentId as string),
    enabled: Boolean(collectStudentId),
  });
  const collectHandledRef = useRef<string | null>(null);
  /** Latest openPayModal, so the effect below doesn't rerun on every render. */
  const openPayModalRef = useRef(openPayModal);
  useEffect(() => {
    openPayModalRef.current = openPayModal;
  });
  useEffect(() => {
    if (!collectStudentId) {
      collectHandledRef.current = null;
      return;
    }
    if (collectHandledRef.current === collectStudentId) return;
    if (collectHistoryError) {
      collectHandledRef.current = collectStudentId;
      toast({ title: "Could not load fees", description: "Try again from the fee list.", variant: "destructive" });
      onCollectHandled?.();
      return;
    }
    if (!collectHistory) return;
    collectHandledRef.current = collectStudentId;
    const unpaid = (collectHistory.records || [])
      .filter((r) => r.status === "pending" || r.status === "overdue")
      .sort((a, b) => a.year - b.year || a.month - b.month);
    const first = unpaid.find((r) => r.status === "overdue") ?? unpaid[0];
    if (!first) {
      toast({ title: "Nothing to collect", description: "This student has no unpaid fees." });
    } else {
      // History rows carry only the student id; attach the student so the window shows their name.
      openPayModalRef.current({ ...first, studentId: collectHistory.student });
    }
    onCollectHandled?.();
  }, [collectStudentId, collectHistory, collectHistoryError, onCollectHandled, toast]);

  const records = data?.records ?? [];
  const pagination = data?.pagination;

  const canPay = !isParent && (caps.canEdit || caps.canCreate);
  const canEditFee = !isParent && writable && (caps.canEdit || caps.canCreate);
  const canGenerate = showGenerate && !studentId && !isParent && writable && (caps.canCreate || caps.canEdit);
  /** Slip number / slip / payment date only when viewing paid fees. */
  const showPaidPaymentCols = isParent || effectiveStatusFilter === "paid";
  /** Pending months only for unpaid / mixed views — not when filtering to paid. */
  const showPendingMonthsCol = !isParent && effectiveStatusFilter !== "paid";
  const feeTableColSpan =
    6 + // receipt, period, type, amount, status, actions
    (childScoped ? 0 : 3) + // student, father, class
    (showPaidPaymentCols ? 3 : 0) +
    (showPendingMonthsCol ? 1 : 0);

  const paidExportParams = useMemo<PaidFeeExportParams>(
    () => ({
      classId: classFilter || undefined,
      search: search.trim() || undefined,
      sessionId: apiSessionId,
      dateFrom: rangeFrom,
      dateTo: rangeTo,
    }),
    [classFilter, search, apiSessionId, rangeFrom, rangeTo]
  );

  const downloadPaidReport = async (
    format: DefaulterReportFormat,
    variant: "details" | "summary" = "details"
  ) => {
    setExportingPaidReport(format);
    const preview = openReportPreviewTab(format);
    try {
      const blob = await exportPaidFeesReport(paidExportParams, format, variant);
      const MONTHS = [
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
      const period =
        rangeFrom && rangeTo
          ? rangeFrom === rangeTo
            ? rangeFrom
            : `${rangeFrom}_to_${rangeTo}`
          : month && year
            ? `${MONTHS[Number(month) - 1] || month}-${year}`
            : year
              ? String(year)
              : "All";
      const fileBase = variant === "summary" ? "Paid-Fee-Summary" : "Paid-Fees";
      const mode = deliverReportBlob(blob, `${fileBase}_${period}.${format}`, format, preview);
      toast({
        title: mode === "preview" ? "Report preview opened" : "Excel downloaded",
        description:
          mode === "preview" ? "Use Print or Download from the preview window." : undefined,
      });
    } catch (e) {
      preview?.close();
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setExportingPaidReport(null);
    }
  };

  const downloadClassAccounts = async (format: DefaulterReportFormat) => {
    if (!sectionFilter || !accountsClassId) {
      toast({
        title: "Select a section",
        description: "Choose a section in the filters to export its accounts report.",
        variant: "destructive",
      });
      return;
    }
    setExportingClassAccounts(format);
    const preview = openReportPreviewTab(format);
    try {
      const blob = await exportClassAccountsReport(
        { classId: accountsClassId, sectionId: sectionFilter, sessionId: apiSessionId },
        format
      );
      const mode = deliverReportBlob(blob, `Class-Accounts.${format}`, format, preview);
      toast({
        title: mode === "preview" ? "Report preview opened" : "Excel downloaded",
        description:
          mode === "preview" ? "Use Print or Download from the preview window." : undefined,
      });
    } catch (e) {
      preview?.close();
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setExportingClassAccounts(null);
    }
  };

  const downloadMonthWise = async (format: DefaulterReportFormat) => {
    setExportingMonthWise(format);
    const preview = openReportPreviewTab(format);
    try {
      const blob = await exportFeeDefaultersMonthWise(
        {
          periodFrom: rangeFrom || undefined,
          periodTo: rangeTo || undefined,
          classId: !isParent && classFilter ? classFilter : undefined,
          sessionId: !isParent ? apiSessionId : undefined,
        },
        format
      );
      const period = rangeFrom && rangeTo ? `${rangeFrom}_to_${rangeTo}` : "All";
      const mode = deliverReportBlob(
        blob,
        `Fee-Defaulters_${period}.${format}`,
        format,
        preview,
      );
      toast({
        title: mode === "preview" ? "Report preview opened" : "Excel downloaded",
        description:
          mode === "preview" ? "Use Print or Download from the preview window." : undefined,
      });
    } catch (e) {
      preview?.close();
      toast({
        title: "Download failed",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setExportingMonthWise(null);
    }
  };

  return (
    <div className="space-y-3">
      {(isError || summaryError) && (
        <Card className="p-3 border-destructive/40 bg-destructive/5 text-sm text-destructive">
          {(error as Error)?.message || (summaryErr as Error)?.message || "Could not load fee records."}
        </Card>
      )}
      {!isParent && !effectiveStudentId && (
        <p className="text-xs text-muted-foreground">
          {rangeFrom && rangeTo ? (
            <>
              Showing fees paid from{" "}
              <span className="font-semibold text-foreground">{formatDate(rangeFrom)}</span> to{" "}
              <span className="font-semibold text-foreground">{formatDate(rangeTo)}</span>
              {paidOnlyView ? "" : ". Unpaid vouchers due in this range are included"}
            </>
          ) : (
            "Showing all dates"
          )}
        </p>
      )}
      {isParent ? (
        <FeeMetricCards summary={summary} loading={summaryLoading} compact />
      ) : (
        <FeeMetricCards summary={summary} loading={summaryLoading} />
      )}

      {showFilters && !studentId && (
        <div className="rounded-xl border border-border bg-card px-3.5 py-3 shadow-sm">
          <div className="space-y-3">
            {isParent ? (
              <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
                <FeeFilterField label="Child">
                  <FeeFilterSelect
                    value={selectedParentStudentId}
                    onChange={setSelectedParentStudentId}
                  >
                    <option value="">Select Child…</option>
                    {parentStudents.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.studentName} ({s.studentId})
                      </option>
                    ))}
                  </FeeFilterSelect>
                </FeeFilterField>
                <div className="relative min-w-0">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-9 rounded-md border-border bg-background pl-8 pr-8 text-sm text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-primary/15"
                    placeholder="Search receipt or period…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Search fees"
                  />
                  {search ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0.5 top-0.5 h-8 w-8 text-muted-foreground"
                      onClick={() => setSearch("")}
                      aria-label="Clear search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <>
                <div
                  className={cn(
                    "grid items-end gap-3 grid-cols-1 min-[480px]:grid-cols-2",
                    lockedStatus
                      ? "xl:grid-cols-[minmax(18rem,1.15fr)_repeat(2,minmax(0,1fr))_minmax(0,1.3fr)]"
                      : "xl:grid-cols-[minmax(18rem,1.15fr)_repeat(3,minmax(0,1fr))_minmax(0,1.3fr)]",
                  )}
                >
                  <FeeFilterField label="Paid from / to">
                    <DateRangePickerField
                      from={rangeFrom}
                      to={rangeTo}
                      onChange={(nextFrom, nextTo) => {
                        setRangeFrom(nextFrom);
                        setRangeTo(nextTo);
                      }}
                      className="h-9"
                    />
                  </FeeFilterField>
                  <FeeFilterField label="Class">
                    <FeeFilterSelect value={classFilter} onChange={setClassFilter}>
                      <ClassProgramOptions
                        classes={classes}
                        allowAll
                        allLabel="All classes (School + College)"
                      />
                    </FeeFilterSelect>
                  </FeeFilterField>
                  <FeeFilterField label="Section">
                    <FeeFilterSelect value={sectionFilter} onChange={setSectionFilter}>
                      <option value="">All Sections</option>
                      {sections.map((s) => (
                        <option key={s._id} value={s._id}>
                          {s.sectionName}
                          {"className" in s && s.className && !classFilter
                            ? ` · ${s.className}`
                            : ""}
                        </option>
                      ))}
                    </FeeFilterSelect>
                  </FeeFilterField>
                  {!lockedStatus && (
                    <FeeFilterField label="Status">
                      <FeeFilterSelect value={statusFilter} onChange={setStatusFilter}>
                        <option value="">All</option>
                        <option value="pending">Pending</option>
                        <option value="paid">Paid</option>
                        <option value="overdue">Overdue</option>
                        <option value="waived">Waived</option>
                      </FeeFilterSelect>
                    </FeeFilterField>
                  )}
                  <div className="relative min-w-0 min-[480px]:col-span-2 lg:col-span-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="h-9 w-full rounded-md border-border bg-background pl-8 pr-8 text-sm text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-primary/15"
                      placeholder="Search student, class, receipt"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      aria-label="Search fees"
                    />
                    {search ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0.5 top-0.5 h-8 w-8 text-muted-foreground"
                        onClick={() => setSearch("")}
                        aria-label="Clear search"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              </>
            )}
          </div>

          {!isParent &&
            ((showBulkActions &&
              (canGenerate || caps.canView || caps.canEdit || caps.canCreate)) ||
              (paidOnlyView && caps.canView)) && (
              <div className="mt-3 grid grid-cols-1 gap-2 border-t border-border pt-3 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
                {paidOnlyView && caps.canView && (
                  <div className="w-full sm:w-auto">
                    <DefaulterListDownload
                      variant="default"
                      className="w-full justify-center sm:w-auto"
                      label="Paid report"
                      exporting={exportingPaidReport}
                      reportKinds={[
                        { id: "details", label: "Paid Fee Report" },
                        { id: "summary", label: "Fee Summary" },
                      ]}
                      onDownload={(format, reportKind) =>
                        void downloadPaidReport(
                          format,
                          reportKind === "summary" ? "summary" : "details"
                        )
                      }
                    />
                  </div>
                )}
                {showBulkActions && !studentId && (caps.canEdit || caps.canCreate) && writable && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-full justify-center gap-1.5 rounded-md border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-muted hover:text-foreground sm:h-9 sm:w-auto sm:whitespace-nowrap"
                    onClick={() => setEnrollmentWizardOpen(true)}
                  >
                    <Receipt className="h-4 w-4 shrink-0 text-primary" />
                    Enrollment voucher
                  </Button>
                )}
                {showBulkActions && canGenerate && (
                  <Button
                    className="h-10 w-full shrink-0 justify-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 sm:h-9 sm:w-auto sm:whitespace-nowrap"
                    disabled={genMut.isPending}
                    onClick={() => genMut.mutate()}
                  >
                    <Download className="h-4 w-4 shrink-0" />
                    {genMut.isPending ? "Generating…" : "Generate Report"}
                  </Button>
                )}
                {/* {showBulkActions && canGenerate && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-full justify-center gap-1.5 rounded-md border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-muted hover:text-foreground sm:h-9 sm:w-auto sm:whitespace-nowrap"
                  disabled={resyncMut.isPending}
                  title="Merge separate stationery challans into monthly fees without deleting them"
                  onClick={() => resyncMut.mutate()}
                >
                  <RefreshCw className={cn("h-4 w-4 shrink-0 text-primary", resyncMut.isPending && "animate-spin")} />
                  {resyncMut.isPending ? "Resyncing…" : "Resync charges"}
                </Button>
              )} */}
                {showBulkActions && !studentId && caps.canView && (
                  <div className="w-full sm:w-auto">
                    <DefaulterListDownload
                      className="w-full justify-center sm:w-auto"
                      label="Print / Export"
                      exporting={exportingMonthWise ?? exportingClassAccounts}
                      reportKinds={[
                        { id: "defaulters", label: "Defaulter List" },
                        {
                          id: "accounts",
                          label: "Accounts Report",
                          disabled: !sectionFilter || !accountsClassId,
                          hint: "Select a section first",
                        },
                      ]}
                      onDownload={(format, reportKind) =>
                        void (reportKind === "accounts"
                          ? downloadClassAccounts(format)
                          : downloadMonthWise(format))
                      }
                    />
                  </div>
                )}
              </div>
            )}
        </div>
      )}

      {(!showFilters || studentId) && (
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="h-10 rounded-xl border-slate-200 bg-white pl-9 pr-9 text-sm shadow-none"
            placeholder={
              isParent || studentId ? "Search receipt or period…" : "Search student, class, receipt..."
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0.5 top-0.5 h-9 w-9 text-slate-400"
              onClick={() => setSearch("")}
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      )}
      {isParent ? (
        <p className="text-xs text-muted-foreground">
          Showing fee records for your child only. School-wide collections are not available here.
        </p>
      ) : null}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left p-2.5 font-medium">Receipt</th>
                {!childScoped && <th className="text-left p-2.5 font-medium">Student</th>}
                {!childScoped && (
                  <th className="text-left p-2.5 font-medium hidden sm:table-cell">Father</th>
                )}
                {!childScoped && (
                  <th className="text-left p-2.5 font-medium hidden md:table-cell">Class</th>
                )}
                <th className="text-left p-2.5 font-medium">Period</th>
                <th className="text-left p-2.5 font-medium">Type</th>
                <th className="text-left p-2.5 font-medium">Amount</th>
                {showPaidPaymentCols && (
                  <th className="text-left p-2.5 font-semibold whitespace-nowrap text-foreground">
                    Payment slip no.
                  </th>
                )}
                <th className="text-left p-2.5 font-medium">Status</th>
                {showPaidPaymentCols && (
                  <th className="text-left p-2.5 font-medium whitespace-nowrap min-w-[4.5rem] sm:min-w-[5.5rem]">Slip</th>
                )}
                {showPaidPaymentCols && (
                  <th className="text-left p-2.5 font-medium whitespace-nowrap">Payment date</th>
                )}
                {showPendingMonthsCol && (
                  <th className="text-left p-2.5 font-medium">Pending months</th>
                )}
                <th className="text-right p-2.5 font-medium whitespace-nowrap min-w-[5.5rem]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={feeTableColSpan} className="p-6 text-center text-muted-foreground">
                    Loading fee records…
                  </td>
                </tr>
              )}
              {!isLoading && isParent && !effectiveStudentId && (
                <tr>
                  <td colSpan={feeTableColSpan} className="p-6 text-center text-muted-foreground">
                    Select a child to view paid fees.
                  </td>
                </tr>
              )}
              {!isLoading && (!isParent || effectiveStudentId) && records.length === 0 && (
                <tr>
                  <td colSpan={feeTableColSpan} className="p-6 text-center text-muted-foreground">
                    {isParent
                      ? "No fee records for this child yet."
                      : studentId
                        ? "No fee records for this student yet."
                        : paidOnlyView
                          ? "No paid fees for the selected filters."
                          : "No fee records for this period. Generate monthly fees or register students."}
                  </td>
                </tr>
              )}
              {records.map((r) => {
                const sid = studentMongoId(r);
                const detailHref = routes && sid && !isParent ? routes.detail(sid) : null;
                const payable = isUnpaid(r.status);
                const printing =
                  printMut.isPending &&
                  (printMut.variables?.id === r._id || printMut.variables?.studentId === sid);
                return (
                  <tr
                    key={r._id}
                    className={
                      payable && !isParent
                        ? "border-b last:border-0 bg-red-500/10 text-red-700 dark:text-red-300"
                        : "border-b last:border-0 hover:bg-muted/30"
                    }
                  >
                    <td className="p-2.5 font-mono text-xs">{r.receiptNumber || "—"}</td>
                    {!childScoped && (
                      <td className="p-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {detailHref ? (
                            <Link
                              to={detailHref}
                              className={`font-medium hover:underline ${payable ? "text-red-700 dark:text-red-300" : "text-primary"}`}
                            >
                              {studentName(r)}
                            </Link>
                          ) : (
                            <div className={`font-medium ${payable ? "text-red-700 dark:text-red-300" : ""}`}>
                              {studentName(r)}
                            </div>
                          )}
                          {isFreeFeeStudent(r, studentFromRecord(r)) && <FreeStudentBadge />}
                        </div>
                        <p className={`text-xs ${payable ? "text-red-700/80 dark:text-red-300/80" : "text-muted-foreground"}`}>
                          {studentCode(r)}
                        </p>
                      </td>
                    )}
                    {!childScoped && (
                      <td className="p-2.5 hidden sm:table-cell">{fatherName(r)}</td>
                    )}
                    {!childScoped && (
                      <td className="p-2.5 hidden md:table-cell">{classNameFromRecord(r)}</td>
                    )}
                    <td className="p-2.5">{periodLabel(r)}</td>
                    <td className="p-2.5">{feeTypeLabel(r.feeType)}</td>
                    <td className="p-2.5 align-top">
                      <div className="text-sm font-semibold tabular-nums">{formatPkr(r.amount)}</div>
                      {r.components && r.components.length > 0 && (
                        <ul className="mt-1.5 space-y-1 text-sm">
                          {r.components.map((line, index) => (
                            <li key={`${line.name}-${index}`} className="flex items-baseline justify-between gap-4">
                              <span>{line.name}</span>
                              <span className="font-medium tabular-nums">{formatPkr(line.amount)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    {showPaidPaymentCols && (
                      <td className="p-2.5 whitespace-nowrap">
                        {r.status === "paid" && r.paymentSlipNumber ? (
                          <span className="font-mono text-base font-bold tracking-wide text-primary sm:text-lg">
                            {r.paymentSlipNumber}
                          </span>
                        ) : r.status === "paid" ? (
                          <span className="text-muted-foreground">—</span>
                        ) : null}
                      </td>
                    )}
                    <td className="p-2.5">
                      <StatusPill status={r.status} />
                      {r.status === "waived" && r.waiver?.at && (
                        <p
                          className="mt-1 max-w-[14rem] truncate text-xs text-muted-foreground"
                          title={r.waiver.reason || undefined}
                        >
                          {waiverByName(r) ? `by ${waiverByName(r)}` : "Waived"} ·{" "}
                          {new Date(r.waiver.at).toLocaleDateString()}
                          {r.waiver.reason ? ` · ${r.waiver.reason}` : ""}
                        </p>
                      )}
                    </td>
                    {showPaidPaymentCols && (
                      <td className="p-2.5 align-middle">
                        {r.status === "paid" && r.paymentSlip ? (
                          <PaymentSlipThumb
                            path={r.paymentSlip}
                            onOpen={() =>
                              setSlipPreview({
                                src: resolveUploadUrl(r.paymentSlip!),
                                isPdf: isPdfSlip(r.paymentSlip!),
                              })
                            }
                          />
                        ) : r.status === "paid" ? (
                          <span className="text-muted-foreground">—</span>
                        ) : null}
                      </td>
                    )}
                    {showPaidPaymentCols && (
                      <td className="p-2.5 whitespace-nowrap text-muted-foreground">
                        {r.status === "paid" && r.paidAt
                          ? new Date(r.paidAt).toLocaleDateString()
                          : r.status === "paid"
                            ? "—"
                            : null}
                      </td>
                    )}
                    {showPendingMonthsCol && (
                      <td className="p-2.5">
                        {r.status === "paid" ? null : (r.unpaidMonthCount || 0) > 0 ? (
                          <div>
                            <p className="font-semibold">
                              {r.unpaidMonthCount} month{r.unpaidMonthCount === 1 ? "" : "s"}
                            </p>
                            {(r.unpaidMonthCount || 0) > 1 && r.unpaidFrom && r.unpaidTo && (
                              <p className="text-xs opacity-80">{r.unpaidFrom} – {r.unpaidTo}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    )}
                    <td className="p-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex flex-nowrap items-center justify-end gap-1">
                        {payable && canPay && (
                          <Button
                            size="sm"
                            variant="hero"
                            className="mr-1 shrink-0"
                            disabled={payMut.isPending}
                            onClick={() => openPayModal(r, "pay")}
                          >
                            Record payment
                          </Button>
                        )}
                        {canEditFee && (payable || r.status === "paid") && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-sky-600 hover:text-sky-700"
                            aria-label="Edit fee"
                            title="Edit fee"
                            onClick={() => openPayModal(r, "edit")}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {(payable || r.status === "paid") && (
                          payable && sid ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-primary"
                                  disabled={printing}
                                  aria-label="Print challan"
                                  title="Print challan"
                                >
                                  {printing ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Printer className="h-4 w-4" />
                                  )}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  className="gap-2"
                                  onClick={() => setChallanPrint({ studentId: sid, size: "a4" })}
                                >
                                  <FileText className="h-4 w-4" />
                                  A4
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="gap-2"
                                  onClick={() => setChallanPrint({ studentId: sid, size: "thermal" })}
                                >
                                  <Receipt className="h-4 w-4" />
                                  Thermal
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-primary"
                                  disabled={printing}
                                  aria-label="Print receipt"
                                  title="Print receipt"
                                >
                                  {printing ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Printer className="h-4 w-4" />
                                  )}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  className="gap-2"
                                  onClick={() => printMut.mutate({ id: r._id, size: "a4" })}
                                >
                                  <FileText className="h-4 w-4" />
                                  A4
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="gap-2"
                                  onClick={() => printMut.mutate({ id: r._id, size: "thermal" })}
                                >
                                  <Receipt className="h-4 w-4" />
                                  Thermal
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )
                        )}
                        {canEditFee && payable && r.feeType !== "admission" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-violet-600 hover:text-violet-700 hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-500/10"
                            aria-label="Waive month"
                            title="Waive month"
                            disabled={waiveMut.isPending}
                            onClick={() => openWaive(r, "waive")}
                          >
                            <CalendarX className="h-4 w-4" />
                          </Button>
                        )}
                        {canEditFee && isManualWaiver(r) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-500/10"
                            aria-label="Undo waive"
                            title="Undo waive"
                            disabled={waiveMut.isPending}
                            onClick={() => openWaive(r, "unwaive")}
                          >
                            <Undo2 className="h-4 w-4" />
                          </Button>
                        )}
                        {canEditFee && r.status === "paid" && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-primary"
                                aria-label="Payment corrections"
                                title="Payment corrections"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="gap-2"
                                onClick={() => openCorrection(r, "reverse")}
                              >
                                <RotateCcw className="h-4 w-4" />
                                Reverse payment
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="gap-2"
                                onClick={() => openCorrection(r, "refund")}
                              >
                                <Wallet className="h-4 w-4" />
                                Mark refunded
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="gap-2"
                                onClick={() => openCorrection(r, "transfer")}
                              >
                                <ArrowRightLeft className="h-4 w-4" />
                                Transfer to student
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pagination && (
          <ListPagination
            page={page}
            totalPages={pagination.pages}
            total={pagination.total}
            pageSize={pageSize}
            onPageSizeChange={(n) => {
              setPageSize(n);
              setPage(1);
            }}
            onPageChange={setPage}
            noun="fees"
          />
        )}
      </Card>

      <Dialog
        open={Boolean(payRecord)}
        onOpenChange={(o) => {
          if (!o) {
            amountTouchedRef.current = new Set();
            setPayRecord(null);
            setSelectedFeeIds([]);
            setSelectedChargeIds([]);
            setAmountOverrides({});
            setPayModalMode("pay");
          }
        }}
      >
        <DialogContent className="flex min-w-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1400px,calc(100vw-3rem))] sm:p-0 [&>button]:right-5 [&>button]:top-5 [&>button]:text-primary-foreground [&>button]:opacity-100 [&>button]:hover:text-primary-foreground">
          <DialogHeader className="shrink-0 bg-primary px-5 py-4 text-left text-primary-foreground sm:px-6">
            <div className="flex items-center gap-4">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-foreground/15">
                <Wallet className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-xl text-primary-foreground">
                  {payModalMode === "edit" ? "Edit Fee Payment" : "Collect Student Fee"}
                </DialogTitle>
                <DialogDescription className="mt-1 text-primary-foreground/80">
                  {payModalMode === "edit"
                    ? "Correct the amount or payment details of this fee"
                    : "Edit adjustment if required and collect payment"}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {payRecord && (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/30">
              <div className="grid min-w-0 gap-5 p-4 text-sm sm:p-6 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
                {/* ---------- Left column ---------- */}
                <div className="min-w-0 space-y-4">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-primary/20 bg-primary/10 text-lg font-semibold text-primary">
                      {payStudent?.photoImage ? (
                        <img
                          src={resolveUploadUrl(payStudent.photoImage)}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        initialsOf(studentName(payRecord))
                      )}
                    </div>
                    <div className="min-w-0 space-y-2">
                      <p className="truncate text-xl font-semibold text-primary">
                        {studentName(payRecord)}
                      </p>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {(payStudent?.rollNumber || studentCode(payRecord)) && (
                          <PayChip icon={Hash}>
                            Roll No: {payStudent?.rollNumber || studentCode(payRecord)}
                          </PayChip>
                        )}
                        {classNameFromRecord(payRecord) !== "—" && (
                          <PayChip icon={GraduationCap}>{classNameFromRecord(payRecord)}</PayChip>
                        )}
                        <PayChip icon={CalendarDays}>{periodLabel(payRecord)}</PayChip>
                      </div>
                    </div>
                  </div>

                  <PaySection
                    icon={Calculator}
                    title="Fee Breakdown"
                    action={
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                        {editingPaid
                          ? "Paid fee"
                          : payModalMode === "edit"
                            ? "Edit amount & select"
                            : "Original voucher"}
                      </span>
                    }
                  >
                    {editingPaid ? (
                      <div className="flex items-center gap-3 px-4 py-3">
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{periodLabel(payRecord)}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {feeTypeLabel(payRecord.feeType)} · paid
                          </span>
                          {payRecord.adjustment && (
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              Original {formatPkr(payRecord.originalAmount ?? 0)} · adjusted{" "}
                              {formatSignedPkr(payRecord.adjustment.amount)}
                              {payRecord.adjustment.reason ? ` — ${payRecord.adjustment.reason}` : ""}
                            </span>
                          )}
                        </span>
                        <Input
                          type="number"
                          min={0}
                          aria-label={`Amount for ${periodLabel(payRecord)}`}
                          className="h-9 w-32 text-right tabular-nums"
                          value={amountOverrides[payRecord._id] ?? String(payRecord.amount ?? "")}
                          onChange={(e) =>
                            setAmountOverrides((prev) => ({
                              ...prev,
                              [payRecord._id]: e.target.value,
                            }))
                          }
                        />
                      </div>
                    ) : (
                      <>
                        {payHistoryLoading && (
                          <p className="flex items-center gap-2 px-4 py-5 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading remaining fees…
                          </p>
                        )}
                        {!payHistoryLoading && unpaidForPay.length === 0 && (
                          <p className="px-4 py-5 text-muted-foreground">No unpaid months left.</p>
                        )}
                        {!payHistoryLoading && unpaidForPay.length > 0 && (
                          <ul className="max-h-72 divide-y overflow-y-auto">
                            {unpaidForPay.map((fee) => {
                              const checked = selectedFeeIds.includes(fee._id);
                              const lines =
                                payModalMode === "pay"
                                  ? feePreviewLines(fee, payHistory?.student, allCharges, selectedChargeIds)
                                  : [];
                              const previewTotal = lines.reduce((sum, line) => sum + line.amount, 0);
                              const typed = parsedFeeAmount(fee);
                              const showLines =
                                checked &&
                                lines.length > 0 &&
                                (typed === null || Math.abs(typed - previewTotal) <= 0.009);
                              return (
                                <li
                                  key={fee._id}
                                  className={cn(
                                    "px-4 py-2.5 transition-colors",
                                    checked ? "bg-primary/[0.04]" : "hover:bg-muted/40"
                                  )}
                                >
                                  <div className="flex items-center gap-3">
                                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                                      <input
                                        type="checkbox"
                                        className="h-4 w-4 shrink-0 accent-primary"
                                        checked={checked}
                                        onChange={() =>
                                          setSelectedFeeIds((current) =>
                                            checked
                                              ? current.filter((id) => id !== fee._id)
                                              : [...current, fee._id]
                                          )
                                        }
                                      />
                                      <span className="min-w-0 flex-1">
                                        <span className="font-medium">{periodLabel(fee)}</span>
                                        <span className="ml-2 text-xs text-muted-foreground">
                                          {feeTypeLabel(fee.feeType)} · {fee.status}
                                        </span>
                                        {received(fee) > 0 && (
                                          <span className="mt-0.5 block text-xs font-medium text-amber-700 dark:text-amber-300">
                                            Part-paid: {formatPkr(received(fee))} received ·{" "}
                                            {formatPkr(Math.max(0, feeAmount(fee) - received(fee)))} balance
                                          </span>
                                        )}
                                      </span>
                                    </label>
                                    {payModalMode === "edit" ? (
                                      <Input
                                        type="number"
                                        min={0}
                                        aria-label={`Amount for ${periodLabel(fee)}`}
                                        className="h-9 w-32 text-right font-medium tabular-nums"
                                        value={amountOverrides[fee._id] ?? String(fee.amount ?? "")}
                                        onChange={(e) => setFeeAmount(fee._id, e.target.value, false)}
                                      />
                                    ) : (
                                      <span
                                        className={cn(
                                          "font-semibold tabular-nums",
                                          !checked && "text-muted-foreground"
                                        )}
                                      >
                                        {formatPkr(feeAmount(fee))}
                                      </span>
                                    )}
                                  </div>
                                  {showLines && (
                                    <ul className="ml-7 mt-1.5 space-y-1 text-xs text-muted-foreground">
                                      {lines.map((line) => (
                                        <li key={line.key} className="flex items-baseline justify-between gap-3">
                                          <span className="flex items-center gap-1.5">
                                            {line.kind === "tuition" ? (
                                              <GraduationCap className="h-3.5 w-3.5 text-primary/70" />
                                            ) : line.kind === "admission" ? (
                                              <Receipt className="h-3.5 w-3.5 text-primary/70" />
                                            ) : (
                                              <Plus className="h-3.5 w-3.5 text-primary/70" />
                                            )}
                                            <span
                                              className={
                                                line.kind === "tuition" || line.kind === "admission"
                                                  ? "text-foreground/80"
                                                  : undefined
                                              }
                                            >
                                              {line.name}
                                            </span>
                                          </span>
                                          <span className="font-medium tabular-nums text-foreground/90">
                                            {formatPkr(line.amount)}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </>
                    )}
                    <div className="flex items-center justify-between gap-3 border-t bg-muted/40 px-4 py-3">
                      <span className="flex items-center gap-2 font-semibold text-primary">
                        <Calculator className="h-4 w-4" />
                        {editingPaid
                          ? "Paid amount"
                          : `Original Payable (${selectedUnpaid.length} item${selectedUnpaid.length === 1 ? "" : "s"})`}
                      </span>
                      <span className="text-lg font-bold tabular-nums text-primary">
                        {formatPkr(originalTotal)}
                      </span>
                    </div>
                  </PaySection>

                  {!editingPaid && payModalMode === "pay" && payApplicableCharges.length > 0 && (
                    <PaySection icon={PlusCircle} title="Additional Charges">
                      <AdditionalChargesChecklist
                        charges={payApplicableCharges}
                        selectedIds={selectedChargeIds}
                        onChange={setSelectedChargeIds}
                      />
                    </PaySection>
                  )}

                  {adjEnabled && selectedUnpaid.length > 0 && (
                    <section
                      className={cn(
                        "min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm",
                        adjActive ? "border-primary/50" : "border-border"
                      )}
                    >
                      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5 text-sm font-semibold text-foreground">
                        <span className="grid h-7 w-7 place-items-center rounded-md bg-primary/10 text-primary">
                          <Settings2 className="h-4 w-4" />
                        </span>
                        <h3 className="font-semibold">Fee Adjustment</h3>
                      </header>
                      <div className="space-y-3 p-4">
                        {selectedUnpaid.length > 1 && (
                          <div
                            role="radiogroup"
                            aria-label="How to adjust the selected months"
                            className="inline-flex flex-wrap rounded-lg border bg-muted/40 p-0.5 text-xs"
                          >
                            {(
                              [
                                ["same", "Same for all selected months"],
                                ["each", "Different for each month"],
                              ] as const
                            ).map(([value, label]) => (
                              <button
                                key={value}
                                type="button"
                                role="radio"
                                aria-checked={adjMode === value}
                                onClick={() => switchAdjMode(value)}
                                className={cn(
                                  "rounded-md px-3 py-1.5 font-medium transition-colors",
                                  adjMode === value
                                    ? "bg-background text-primary shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                                )}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        )}

                        {adjPerMonth ? (
                          <div className="divide-y rounded-lg border">
                            {selectedUnpaid.map((fee) => {
                              const input = adjEach[fee._id] ?? EMPTY_ADJ;
                              const issue = adjIssue(fee, input);
                              return (
                                <div key={fee._id} className="space-y-2 p-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-medium text-primary">
                                      {periodLabel(fee)}{" "}
                                      <span className="text-xs font-normal text-muted-foreground">
                                        ({formatPkr(feeAmount(fee))})
                                      </span>
                                    </span>
                                    {canHalfMonth(fee) && (
                                      <HalfMonthButton
                                        toPay={halfMonthToPay(fee)}
                                        applied={isHalfMonthApplied(fee, input)}
                                        onClick={() => applyHalfMonth(fee)}
                                      />
                                    )}
                                  </div>
                                  <AdjFields
                                    idPrefix={`adj-${fee._id}`}
                                    feeHint={feeAmount(fee)}
                                    value={input}
                                    onChange={(patch) => setAdjFor(fee._id, patch)}
                                  />
                                  {issue && <p className="text-xs text-destructive">{issue}</p>}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <>
                            {selectedUnpaid.length === 1 && canHalfMonth(selectedUnpaid[0]) && (
                              <div className="flex justify-end">
                                <HalfMonthButton
                                  large
                                  toPay={halfMonthToPay(selectedUnpaid[0])}
                                  applied={isHalfMonthApplied(selectedUnpaid[0], {
                                    kind: adjKind,
                                    amount: adjAmount,
                                    reason: adjReason,
                                  })}
                                  onClick={() => applyHalfMonth(selectedUnpaid[0])}
                                />
                              </div>
                            )}
                            <AdjFields
                              idPrefix="adj"
                              feeHint={selectedUnpaid.length === 1 ? feeAmount(selectedUnpaid[0]) : undefined}
                              value={{ kind: adjKind, amount: adjAmount, reason: adjReason }}
                              onChange={(patch) => {
                                if (patch.kind !== undefined) setAdjKind(patch.kind);
                                if (patch.amount !== undefined) setAdjAmount(patch.amount);
                                if (patch.reason !== undefined) setAdjReason(patch.reason);
                              }}
                            />
                            {selectedUnpaid.length > 1 && (
                              <p className="text-xs text-muted-foreground">
                                Need a half-month fee for one month? Switch to{" "}
                                <button
                                  type="button"
                                  className="font-semibold text-primary underline underline-offset-2"
                                  onClick={() => switchAdjMode("each")}
                                >
                                  Different for each month
                                </button>
                                .
                              </p>
                            )}
                            {selectedUnpaid.length > 1 && adjKind !== "none" && (
                              <p className="text-xs text-muted-foreground">
                                Each of the {selectedUnpaid.length} selected months will be charged this fee.
                              </p>
                            )}
                          </>
                        )}

                        {adjError && !adjPerMonth ? (
                          <p className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-destructive">
                            <Info className="h-4 w-4 shrink-0" />
                            {adjError}
                          </p>
                        ) : adjActive && !adjError ? (
                          <p className="flex items-center gap-2 rounded-lg bg-primary/[0.06] px-3 py-2 text-primary">
                            <Info className="h-4 w-4 shrink-0" />
                            <span>
                              {adjEntries.length === 1 ? (
                                <>
                                  This will {adjDelta < 0 ? "reduce" : "increase"} the{" "}
                                  {periodLabel(adjEntries[0].fee)} fee by{" "}
                                  <span className="font-semibold">{formatPkr(Math.abs(adjDelta))}</span>.
                                </>
                              ) : (
                                <>
                                  {adjEntries.length} months adjusted · net change{" "}
                                  <span className="font-semibold">{formatSignedPkr(adjDelta)}</span>.
                                </>
                              )}
                            </span>
                          </p>
                        ) : null}
                      </div>
                    </section>
                  )}

                  {!editingPaid && payModalMode === "pay" && (
                    <div className="rounded-xl border bg-card px-5 py-4 shadow-sm">
                      <p className="flex items-center gap-2 font-semibold">
                        <Banknote className="h-4 w-4 text-primary" />
                        Amount Due
                      </p>
                      <p className="mt-1 text-3xl font-bold tabular-nums text-primary">
                        {formatPkr(dueNow)}
                      </p>
                      {(adjActive || receivedTotal > 0) && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          (Original {formatPkr(originalTotal)}
                          {adjActive && (
                            <>
                              {" "}
                              {adjDelta < 0 ? "−" : "+"} Adjustment {formatPkr(Math.abs(adjDelta))}
                            </>
                          )}
                          {receivedTotal > 0 && <> − Already received {formatPkr(receivedTotal)}</>})
                        </p>
                      )}
                      {isPartialPayment && (
                        <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-1.5 text-sm font-medium text-amber-800 dark:text-amber-200">
                          Receiving {formatPkr(cashNow)} now · {formatPkr(balanceAfter)} stays due
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* ---------- Right column ---------- */}
                <div className="min-w-0 space-y-4">
                  <PaySection icon={FileText} title="Summary">
                    {/* 1. What is being paid: one line per month */}
                    <div className="max-h-[18rem] divide-y overflow-y-auto">
                      {summaryRows.length === 0 && (
                        <p className="px-4 py-3 text-muted-foreground">Select at least one month.</p>
                      )}
                      {summaryRows.map((row) => {
                        const monthTotal = row.amount + row.adjustment;
                        const breakdown = row.detailed
                          ? row.lines.map((line) => `${line.name} ${formatPkr(line.amount)}`).join(" · ")
                          : "";
                        return (
                          <div key={row.fee._id} className="px-4 py-2.5">
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="font-medium">{periodLabel(row.fee)}</span>
                              <span className="font-semibold tabular-nums">{formatPkr(monthTotal)}</span>
                            </div>
                            {breakdown && row.lines.length > 1 && (
                              <p className="mt-0.5 text-xs text-muted-foreground">{breakdown}</p>
                            )}
                            {row.adjustment !== 0 && (
                              <p
                                className={cn(
                                  "mt-0.5 text-xs",
                                  row.adjustment < 0
                                    ? "text-emerald-700 dark:text-emerald-300"
                                    : "text-destructive"
                                )}
                              >
                                {row.adjustmentLabel}: {formatPkr(row.amount)} → {formatPkr(monthTotal)}
                                {row.adjustmentReason ? ` (${row.adjustmentReason})` : ""}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* 2. The calculation, top to bottom */}
                    <div className="divide-y border-t bg-muted/20 text-sm">
                      <SummaryLine
                        label={`Total fee (${summaryRows.length} month${summaryRows.length === 1 ? "" : "s"})`}
                        value={formatPkr(originalTotal)}
                      />
                      {adjActive && (
                        <SummaryLine
                          label={adjDelta < 0 ? "Less: adjustment" : "Add: late fine"}
                          value={formatSignedPkr(adjDelta)}
                          tone={adjDelta < 0 ? "good" : "bad"}
                        />
                      )}
                      {receivedTotal > 0 && (
                        <SummaryLine
                          label="Less: already paid earlier"
                          value={`− ${formatPkr(receivedTotal)}`}
                          tone="good"
                        />
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-3 border-t bg-muted/40 px-4 py-3">
                      <span className="font-semibold">{editingPaid ? "Paid amount" : "Amount Due"}</span>
                      <span className="text-2xl font-bold tabular-nums text-primary">
                        {formatPkr(editingPaid ? originalTotal : dueNow)}
                      </span>
                    </div>

                    {/* 3. Only when the parent pays part of it */}
                    {isPartialPayment && (
                      <div className="divide-y border-t text-sm">
                        <SummaryLine label="Paying now" value={formatPkr(cashNow)} strong />
                        <SummaryLine label="Left to pay" value={formatPkr(balanceAfter)} tone="bad" strong />
                      </div>
                    )}

                    {/* 4. Other months not selected */}
                    {!editingPaid && !payHistoryLoading && remainingTotal > 0.009 && (
                      <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
                        Other unpaid months (not selected):{" "}
                        <span className="font-semibold text-foreground">{formatPkr(remainingTotal)}</span> (
                        {remainingUnpaid.length} month{remainingUnpaid.length === 1 ? "" : "s"})
                      </p>
                    )}
                  </PaySection>

                  <PaySection icon={CreditCard} title="Payment Details">
                    <div className="space-y-3.5 p-4">
                      <div className="space-y-1.5">
                        <Label>
                          Payment method <span className="text-destructive">*</span>
                        </Label>
                        <div className="grid grid-cols-2 gap-2">
                          {PAYMENT_METHOD_OPTIONS.map(({ value, label, icon: Icon }) => (
                            <button
                              key={value}
                              type="button"
                              aria-pressed={paymentMethod === value}
                              onClick={() => setPaymentMethod(value)}
                              className={cn(
                                "flex h-9 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-medium transition-colors",
                                paymentMethod === value
                                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                                  : "border-border bg-background hover:border-primary/40 hover:bg-primary/5"
                              )}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="min-w-0 space-y-1.5">
                          <Label htmlFor="payment-date">
                            Payment date <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            id="payment-date"
                            type="date"
                            className="w-full min-w-0"
                            value={paymentDate}
                            max={todayInputValue()}
                            onChange={(e) => setPaymentDate(e.target.value)}
                          />
                        </div>
                        <div className="min-w-0 space-y-1.5">
                          <Label htmlFor="payment-slip-number">Slip number</Label>
                          <Input
                            id="payment-slip-number"
                            value={paymentSlipNumber}
                            onChange={(e) => setPaymentSlipNumber(e.target.value)}
                            placeholder="Bank / cash slip"
                            maxLength={100}
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="payment-notes">Notes (optional)</Label>
                        <Input
                          id="payment-notes"
                          value={paymentNotes}
                          onChange={(e) => setPaymentNotes(e.target.value)}
                          placeholder="Reference or remarks"
                        />
                      </div>
                      <PaymentSlipUploadBox
                        file={paymentSlip}
                        existingPath={
                          payModalMode === "edit" && payRecord?.status === "paid"
                            ? payRecord.paymentSlip
                            : null
                        }
                        inputKey={slipInputKey}
                        onFileChange={setPaymentSlip}
                        onClear={() => {
                          setPaymentSlip(null);
                          setSlipInputKey((key) => key + 1);
                        }}
                        onPreview={setSlipPreview}
                        onTooLarge={() =>
                          toast({
                            title: "Slip is too large",
                            description: "Upload an image or PDF up to 5 MB.",
                            variant: "destructive",
                          })
                        }
                      />
                    </div>
                  </PaySection>
                </div>
              </div>
            </div>
          )}

          <div className="flex shrink-0 flex-col gap-3 border-t bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {payOpenedAt.toLocaleString(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
              {user?.name && (
                <span className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  By: {user.name}
                </span>
              )}
              {adjActive && (
                <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Adjustment is saved with your name and reason
                </span>
              )}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => setPayRecord(null)}>
                Cancel
              </Button>
              <Button
                className="gap-2"
                disabled={
                  payMut.isPending ||
                  !paymentDate ||
                  Boolean(adjError) ||
                  Boolean(cashError) ||
                  (editingPaid
                    ? parsedFeeAmount(payRecord!) === null
                    : selectedUnpaid.length === 0 ||
                      selectedUnpaid.some((fee) => parsedFeeAmount(fee) === null))
                }
                onClick={() => payMut.mutate()}
              >
                {payMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {payMut.isPending
                  ? "Saving…"
                  : payModalMode === "edit"
                    ? "Save changes"
                    : `Collect ${formatPkr(cashNow)}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(slipPreview)} onOpenChange={(open) => { if (!open) setSlipPreview(null); }}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Payment slip</DialogTitle>
          </DialogHeader>
          {slipPreview?.isPdf ? (
            <iframe
              src={slipPreview.src}
              title="Payment slip"
              className="h-[70vh] w-full rounded-md border bg-white"
            />
          ) : slipPreview ? (
            <img
              src={slipPreview.src}
              alt="Payment slip"
              className="max-h-[70vh] w-full rounded-md border bg-white object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <ChallanPrintDialog
        request={challanPrint}
        onClose={() => setChallanPrint(null)}
        confirming={printMut.isPending && Boolean(printMut.variables?.studentId)}
        onConfirm={(chargeIds) => {
          if (!challanPrint) return;
          printMut.mutate({ ...challanPrint, chargeIds });
        }}
      />

      <EnrollmentVoucherWizard
        open={enrollmentWizardOpen}
        onOpenChange={setEnrollmentWizardOpen}
      />
      <AssignSectionDialog
        open={Boolean(assignSectionStudentId)}
        onOpenChange={(open) => {
          if (!open) setAssignSectionStudentId(null);
        }}
        studentId={assignSectionStudentId}
      />

      <Dialog
        open={Boolean(waiveRecord)}
        onOpenChange={(open) => {
          if (!open && !waiveMut.isPending) setWaiveRecord(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{waiveMode === "waive" ? "Waive this month" : "Undo waive"}</DialogTitle>
            <DialogDescription>
              {!waiveRecord
                ? ""
                : waiveMode === "waive"
                  ? `${periodLabel(waiveRecord)} stays in the fee history and is not counted as a defaulter. Use this for a month the student was away. A month they attended and did not pay should stay unpaid.`
                  : `${periodLabel(waiveRecord)} will be unpaid again and count toward dues.`}
            </DialogDescription>
          </DialogHeader>
          {waiveMode === "unwaive" && waiveRecord?.waiver?.at && (
            <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              Waived{waiverByName(waiveRecord) ? ` by ${waiverByName(waiveRecord)}` : ""} on{" "}
              {new Date(waiveRecord.waiver.at).toLocaleDateString()}
              {waiveRecord.waiver.reason ? ` — “${waiveRecord.waiver.reason}”` : ""}
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="waive-reason">Reason</Label>
            <Input
              id="waive-reason"
              value={waiveReason}
              onChange={(e) => setWaiveReason(e.target.value)}
              placeholder={
                waiveMode === "waive" ? "e.g. Away in village for the whole month" : "e.g. Waived by mistake"
              }
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">Required, at least 3 characters.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={waiveMut.isPending} onClick={() => setWaiveRecord(null)}>
              Cancel
            </Button>
            <Button
              variant="hero"
              disabled={waiveMut.isPending || !waiveRecord || waiveReason.trim().length < 3}
              onClick={() =>
                waiveRecord &&
                waiveMut.mutate({ record: waiveRecord, mode: waiveMode, reason: waiveReason.trim() })
              }
            >
              {waiveMut.isPending ? "Saving…" : waiveMode === "waive" ? "Waive month" : "Undo waive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(correction)}
        onOpenChange={(open) => {
          if (!open && !correctionMut.isPending) closeCorrection();
        }}
      >
        <DialogContent className="min-w-0 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {correction?.mode === "refund"
                ? "Mark payment refunded"
                : correction?.mode === "transfer"
                  ? "Transfer payment to another student"
                  : "Reverse payment"}
            </DialogTitle>
            <DialogDescription>
              {correction?.mode === "refund"
                ? "Money returned to the payer. This fee becomes unpaid again and the refund is noted."
                : correction?.mode === "transfer"
                  ? "Moves this payment onto the correct student's matching unpaid voucher."
                  : "Undo a mistaken payment mark. The fee becomes unpaid again so you can fix it."}
            </DialogDescription>
          </DialogHeader>
          {correction && (
            <div className="min-w-0 space-y-3 text-sm">
              <div className="rounded-md border px-3 py-2 bg-muted/30">
                <p>
                  <span className="text-muted-foreground">Student:</span>{" "}
                  <span className="font-medium">{studentName(correction.record)}</span>
                  {studentCode(correction.record) ? (
                    <span className="text-muted-foreground"> · {studentCode(correction.record)}</span>
                  ) : null}
                </p>
                <p className="mt-1">
                  <span className="text-muted-foreground">Fee:</span>{" "}
                  <span className="font-medium">
                    {periodLabel(correction.record)} · {feeTypeLabel(correction.record.feeType)}
                  </span>
                  <span className="ml-2 font-semibold tabular-nums">
                    {formatPkr(correction.record.amount)}
                  </span>
                </p>
              </div>

              {correction.mode === "transfer" && (
                <div className="space-y-2">
                  <Label htmlFor="transfer-student-search">Correct student</Label>
                  {transferStudent ? (
                    <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{transferStudent.studentName}</p>
                        <p className="text-xs text-muted-foreground">
                          {transferStudent.studentId}
                          {transferStudent.fatherName ? ` · ${transferStudent.fatherName}` : ""}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={correctionMut.isPending}
                        onClick={() => {
                          setTransferStudent(null);
                          setTransferTargetFeeId("");
                          setTransferSearch("");
                        }}
                      >
                        Change
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Input
                        id="transfer-student-search"
                        value={transferSearch}
                        onChange={(e) => setTransferSearch(e.target.value)}
                        placeholder="Search by name or student ID"
                        autoComplete="off"
                      />
                      {transferSearch.trim().length >= 2 && (
                        <ul className="max-h-40 overflow-y-auto rounded-md border divide-y">
                          {transferStudentsQ.isLoading && (
                            <li className="px-3 py-2 text-muted-foreground">Searching…</li>
                          )}
                          {!transferStudentsQ.isLoading &&
                            (transferStudentsQ.data?.students || [])
                              .filter((s) => s._id !== studentMongoId(correction.record))
                              .map((s) => (
                                <li key={s._id}>
                                  <button
                                    type="button"
                                    className="w-full px-3 py-2 text-left hover:bg-muted/50"
                                    onClick={() => {
                                      setTransferStudent(s);
                                      setTransferSearch("");
                                      setTransferTargetFeeId("");
                                    }}
                                  >
                                    <span className="font-medium">{s.studentName}</span>
                                    <span className="ml-2 text-xs text-muted-foreground">
                                      {s.studentId}
                                      {s.fatherName ? ` · ${s.fatherName}` : ""}
                                    </span>
                                  </button>
                                </li>
                              ))}
                          {!transferStudentsQ.isLoading &&
                            (transferStudentsQ.data?.students || []).filter(
                              (s) => s._id !== studentMongoId(correction.record)
                            ).length === 0 && (
                              <li className="px-3 py-2 text-muted-foreground">No students found.</li>
                            )}
                        </ul>
                      )}
                    </div>
                  )}

                  {transferStudent && (
                    <div className="space-y-1.5">
                      <Label>Matching unpaid voucher</Label>
                      {transferHistoryQ.isLoading && (
                        <p className="text-muted-foreground">Loading fees…</p>
                      )}
                      {!transferHistoryQ.isLoading && matchingTransferFees.length === 0 && (
                        <p className="text-destructive text-xs">
                          No unpaid {feeTypeLabel(correction.record.feeType).toLowerCase()} voucher
                          for {periodLabel(correction.record)} on this student.
                        </p>
                      )}
                      {!transferHistoryQ.isLoading && matchingTransferFees.length > 0 && (
                        <select
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                          value={transferTargetFeeId}
                          onChange={(e) => setTransferTargetFeeId(e.target.value)}
                        >
                          {matchingTransferFees.length > 1 && (
                            <option value="">Select Voucher</option>
                          )}
                          {matchingTransferFees.map((f) => (
                            <option key={f._id} value={f._id}>
                              {periodLabel(f)} · {feeTypeLabel(f.feeType)} · {formatPkr(f.amount)} ·{" "}
                              {f.status}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="correction-reason">Reason</Label>
                <Input
                  id="correction-reason"
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder={
                    correction.mode === "transfer"
                      ? "e.g. Paid under sibling by mistake"
                      : correction.mode === "refund"
                        ? "e.g. Cash returned to parent"
                        : "e.g. Wrong month selected"
                  }
                  maxLength={500}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={correctionMut.isPending}
              onClick={closeCorrection}
            >
              Cancel
            </Button>
            <Button
              variant="hero"
              disabled={
                correctionMut.isPending ||
                correctionReason.trim().length < 3 ||
                (correction?.mode === "transfer" &&
                  (!transferStudent ||
                    matchingTransferFees.length === 0 ||
                    (matchingTransferFees.length > 1 && !transferTargetFeeId)))
              }
              onClick={() => correctionMut.mutate()}
            >
              {correctionMut.isPending
                ? "Saving…"
                : correction?.mode === "refund"
                  ? "Confirm refund"
                  : correction?.mode === "transfer"
                    ? "Transfer payment"
                    : "Reverse payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
