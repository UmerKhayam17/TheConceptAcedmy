import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronDown,
  Download,
  Eye,
  FileText,
  ImageIcon,
  Loader2,
  Pencil,
  Printer,
  Receipt,
  Search,
  Upload,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DefaulterListDownload } from "./DefaulterListDownload";
import { FeeMetricCards } from "./FeeMetricCards";
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
  type DefaulterReportFormat,
  applyFeeCharges,
  fetchAdditionalCharges,
  generateMonthlyFees,
  payAcademyFees,
  printFeeChallan,
  printFeeReceipt,
  updateAcademyFee,
  type AcademyFeeRecord,
  type FeeReceiptSize,
} from "@/lib/studentManagementApi";
import {
  applicableChargesForFees,
  feeAmountWithCharges,
} from "@/lib/additionalCharges";
import { resolveUploadUrl } from "@/lib/api";
import { academyStudentRoutes, type AcademyStudentRoutes } from "@/lib/studentManagementMenus";
import { useSessionScope } from "@/components/modules/timetable/SessionBar";
import { formatPkr, MONTH_NAMES } from "./studentDisplayUtils";
import PageSizeSelect, { DEFAULT_PAGE_SIZE } from "./PageSizeSelect";
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

function todayInputValue() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

const feeFilterLabelClass =
  "mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground";
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
      <label className={feeFilterLabelClass}>{label}</label>
      {children}
    </div>
  );
}

function FeeFilterSelect({
  value,
  onChange,
  children,
  leadingIcon,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  leadingIcon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      {leadingIcon ? (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {leadingIcon}
        </span>
      ) : null}
      <select
        className={cn(
          feeFilterSelectClass,
          leadingIcon ? "pl-8 pr-8" : "pl-3 pr-8",
        )}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
  const [month, setMonth] = useState(() => (paidOnlyView ? "" : String(now.getMonth() + 1)));
  const [year, setYear] = useState(() => (paidOnlyView ? "" : String(now.getFullYear())));
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
  const [feeTypeFilter, setFeeTypeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [search, setSearch] = useState("");
  const [payRecord, setPayRecord] = useState<AcademyFeeRecord | null>(null);
  const [payModalMode, setPayModalMode] = useState<"pay" | "edit">("pay");
  const [selectedFeeIds, setSelectedFeeIds] = useState<string[]>([]);
  const [selectedChargeIds, setSelectedChargeIds] = useState<string[]>([]);
  const [amountOverrides, setAmountOverrides] = useState<Record<string, string>>({});
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayInputValue);
  const [paymentSlipNumber, setPaymentSlipNumber] = useState("");
  const [paymentSlip, setPaymentSlip] = useState<File | null>(null);
  const [slipInputKey, setSlipInputKey] = useState(0);
  const [slipPreview, setSlipPreview] = useState<SlipPreviewState | null>(null);
  const [challanPrint, setChallanPrint] = useState<ChallanPrintRequest | null>(null);
  const [exportingMonthWise, setExportingMonthWise] = useState<DefaulterReportFormat | null>(null);
  const [exportingPaidReport, setExportingPaidReport] = useState<DefaulterReportFormat | null>(null);
  const [enrollmentWizardOpen, setEnrollmentWizardOpen] = useState(false);
  const [assignSectionStudentId, setAssignSectionStudentId] = useState<string | null>(null);

  const childScoped = Boolean(studentId) || isParent;
  const effectiveStudentId = studentId || (isParent ? selectedParentStudentId || undefined : undefined);
  /** Parents see this child's fee history (paid emphasized); staff keep status filters. */
  const effectiveStatusFilter = isParent ? "" : statusFilter;

  const filterParams = useMemo(
    () => ({
      month: effectiveStudentId ? undefined : month ? Number(month) : undefined,
      year: effectiveStudentId ? undefined : year ? Number(year) : undefined,
      classId: effectiveStudentId || isParent ? undefined : classFilter || undefined,
      sectionId: effectiveStudentId || isParent ? undefined : sectionFilter || undefined,
      studentId: effectiveStudentId,
      sessionId: effectiveStudentId || isParent ? undefined : apiSessionId,
    }),
    [month, year, classFilter, sectionFilter, effectiveStudentId, isParent, apiSessionId]
  );

  useEffect(() => {
    if (lockedStatus) setStatusFilter(lockedStatus);
  }, [lockedStatus]);

  useEffect(() => {
    setPage(1);
    setClassFilter("");
    setSectionFilter("");
  }, [month, year, statusFilter, feeTypeFilter, effectiveStudentId, sessionId]);

  useEffect(() => {
    setSectionFilter("");
    setPage(1);
  }, [classFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, sectionFilter]);

  useEffect(() => {
    if (!isParent) return;
    try {
      localStorage.setItem("parent_selected_student_id", selectedParentStudentId || "");
    } catch {
      // ignore storage failures
    }
  }, [isParent, selectedParentStudentId]);

  const { data: parentStudents = [] } = useQuery({
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

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["academy-fees", page, pageSize, search, effectiveStatusFilter, feeTypeFilter, filterParams],
    queryFn: () =>
      fetchAcademyFees({
        page,
        limit: pageSize,
        search: search.trim() || undefined,
        status: effectiveStatusFilter || undefined,
        feeType: feeTypeFilter || undefined,
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

  const payStudentId = payRecord ? studentMongoId(payRecord) : "";
  const { data: payHistory, isLoading: payHistoryLoading } = useQuery({
    queryKey: ["academy-fee-history", payStudentId],
    queryFn: () => fetchStudentFeeHistory(payStudentId),
    enabled: Boolean(payStudentId),
  });

  const { data: allCharges = [] } = useQuery({
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
    if (!payRecord || !payHistory) return;
    // Paid edit uses the voucher itself — don't replace with unpaid months.
    if (payModalMode === "edit" && payRecord.status === "paid") {
      setSelectedFeeIds([payRecord._id]);
      setSelectedChargeIds([]);
      setAmountOverrides({ [payRecord._id]: String(payRecord.amount ?? "") });
      return;
    }
    // Default to the clicked voucher only — user can check more months if needed.
    const clickedUnpaid = unpaidForPay.some((r) => r._id === payRecord._id);
    setSelectedFeeIds(
      clickedUnpaid
        ? [payRecord._id]
        : unpaidForPay[0]
          ? [unpaidForPay[0]._id]
          : [payRecord._id]
    );
    // Default: no additional charges.
    setSelectedChargeIds([]);
    const amounts: Record<string, string> = {};
    for (const fee of unpaidForPay) {
      amounts[fee._id] = String(
        feeAmountWithCharges(fee, payHistory.student, allCharges, [])
      );
    }
    setAmountOverrides(amounts);
  }, [payRecord, payHistory, unpaidForPay, payModalMode, allCharges]);

  useEffect(() => {
    if (!payRecord || payModalMode === "edit" || !payHistory) return;
    setAmountOverrides((prev) => {
      const next = { ...prev };
      for (const fee of unpaidForPay) {
        next[fee._id] = String(
          feeAmountWithCharges(fee, payHistory.student, allCharges, selectedChargeIds)
        );
      }
      return next;
    });
  }, [selectedChargeIds, payRecord, payModalMode, payHistory, unpaidForPay, allCharges]);

  const feeAmount = (fee: AcademyFeeRecord) => {
    const raw = amountOverrides[fee._id];
    if (raw === undefined || raw === "") return Number(fee.amount) || 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : Number(fee.amount) || 0;
  };

  const selectedUnpaid = unpaidForPay.filter((r) => selectedFeeIds.includes(r._id));
  const selectedTotal = selectedUnpaid.reduce((sum, r) => sum + feeAmount(r), 0);

  const editingPaid = payModalMode === "edit" && payRecord?.status === "paid";

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

      if (payModalMode === "edit") {
        for (const fee of selectedUnpaid) {
          const nextAmount = feeAmount(fee);
          if (nextAmount < 0) throw new Error("Amount cannot be negative");
          if (nextAmount !== Number(fee.amount)) {
            await updateAcademyFee(fee._id, { amount: nextAmount, notes: paymentNotes.trim() });
          }
        }
      } else {
        const chargeableIds = selectedUnpaid
          .filter((f) => f.feeType === "monthly" || f.feeType === "admission")
          .map((f) => f._id);
        if (chargeableIds.length) {
          await applyFeeCharges({
            feeRecordIds: chargeableIds,
            chargeIds: selectedChargeIds,
          });
        }
      }
      return payAcademyFees({
        feeRecordIds: selectedFeeIds,
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
        title: wasEdit ? "Fee updated" : "Payment recorded",
        description: `${result.paid} month${result.paid === 1 ? "" : "s"} · ${formatPkr(result.total)}`,
      });
      if (result.needsSectionAssignment && result.studentId) {
        setAssignSectionStudentId(result.studentId);
      }
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
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

  const paidExportParams = useMemo(
    () => ({
      month: month ? Number(month) : undefined,
      year: year ? Number(year) : undefined,
      classId: classFilter || undefined,
      feeType: feeTypeFilter || undefined,
      search: search.trim() || undefined,
      sessionId: apiSessionId,
    }),
    [month, year, classFilter, feeTypeFilter, search, apiSessionId]
  );

  const downloadPaidReport = async (format: DefaulterReportFormat) => {
    setExportingPaidReport(format);
    try {
      const blob = await exportPaidFeesReport(paidExportParams, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = format === "pdf" ? "paid-fees.pdf" : "paid-fees.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: format === "pdf" ? "PDF downloaded" : "Excel downloaded" });
    } catch (e) {
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setExportingPaidReport(null);
    }
  };

  const downloadMonthWise = async (format: DefaulterReportFormat) => {
    setExportingMonthWise(format);
    try {
      const blob = await exportFeeDefaultersMonthWise(
        {
          year: Number(year) || undefined,
          classId: !isParent && classFilter ? classFilter : undefined,
          sessionId: !isParent ? apiSessionId : undefined,
        },
        format
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = format === "pdf" ? "fee-defaulters.pdf" : "fee-defaulters.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: format === "pdf" ? "PDF downloaded" : "Excel downloaded" });
    } catch (e) {
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
      {isParent ? (
        <FeeMetricCards summary={summary} loading={summaryLoading} compact />
      ) : (
        <FeeMetricCards summary={summary} loading={summaryLoading} />
      )}

      {showFilters && !studentId && (
        <div className="rounded-xl border border-border bg-card px-3.5 py-3 shadow-sm">
          <div
            className={cn(
              "grid items-end gap-2.5",
              isParent
                ? "grid-cols-1 sm:grid-cols-[220px_minmax(0,1fr)]"
                : "grid-cols-2 md:grid-cols-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.7fr)_minmax(0,1.15fr)_minmax(0,0.85fr)_minmax(0,1fr)_minmax(200px,1.5fr)]",
            )}
          >
            {isParent && (
              <FeeFilterField label="Child">
                <FeeFilterSelect
                  value={selectedParentStudentId}
                  onChange={setSelectedParentStudentId}
                >
                  <option value="">Select child…</option>
                  {parentStudents.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.studentName} ({s.studentId})
                    </option>
                  ))}
                </FeeFilterSelect>
              </FeeFilterField>
            )}
            {!isParent && (
              <>
                <FeeFilterField label="Month">
                  <FeeFilterSelect
                    value={month}
                    onChange={setMonth}
                    leadingIcon={<CalendarDays className="h-3.5 w-3.5" />}
                  >
                    {paidOnlyView ? <option value="">All months</option> : null}
                    {MONTH_NAMES.map((name, idx) => (
                      <option key={name} value={String(idx + 1)}>
                        {name} {year || now.getFullYear()}
                      </option>
                    ))}
                  </FeeFilterSelect>
                </FeeFilterField>
                <FeeFilterField label="Year">
                  <FeeFilterSelect value={year} onChange={setYear}>
                    {paidOnlyView ? <option value="">All years</option> : null}
                    {Array.from({ length: 6 }, (_, i) => {
                      const y = String(Number(now.getFullYear()) - 2 + i);
                      return (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      );
                    })}
                  </FeeFilterSelect>
                </FeeFilterField>
                <FeeFilterField label="Class">
                  <FeeFilterSelect value={classFilter} onChange={setClassFilter}>
                    <option value="">All classes</option>
                    {classes.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.className}
                      </option>
                    ))}
                  </FeeFilterSelect>
                </FeeFilterField>
                <FeeFilterField label="Section">
                  <FeeFilterSelect value={sectionFilter} onChange={setSectionFilter}>
                    <option value="">All sections</option>
                    {sections.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.sectionName}
                        {"className" in s && s.className && !classFilter ? ` · ${s.className}` : ""}
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
                <FeeFilterField label="Type">
                  <FeeFilterSelect value={feeTypeFilter} onChange={setFeeTypeFilter}>
                    <option value="">All types</option>
                    <option value="monthly">Monthly</option>
                    <option value="admission">Admission</option>
                    <option value="stationery">Stationery</option>
                  </FeeFilterSelect>
                </FeeFilterField>
              </>
            )}

            <div className={cn("relative min-w-0", !isParent && "col-span-2 md:col-span-1")}>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 rounded-md border-border bg-background pl-8 pr-8 text-sm text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-primary/15"
                placeholder={isParent ? "Search receipt or period…" : "Search student, class, receipt"}
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

          {!isParent &&
            ((showBulkActions &&
              (canGenerate || caps.canView || caps.canEdit || caps.canCreate)) ||
              (paidOnlyView && caps.canView)) && (
            <div className="mt-3 grid grid-cols-1 gap-2 border-t border-border pt-3 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
              {paidOnlyView && caps.canView && (
                <div className="w-full sm:w-auto">
                  <DefaulterListDownload
                    variant="default"
                    className="h-10 w-full justify-between rounded-md px-3 text-sm font-medium sm:h-9 sm:w-auto sm:justify-center sm:whitespace-nowrap"
                    label="Download paid report"
                    exporting={exportingPaidReport}
                    onDownload={(format) => void downloadPaidReport(format)}
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
                  className="h-10 w-full justify-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 sm:h-9 sm:w-auto sm:whitespace-nowrap"
                  disabled={genMut.isPending}
                  onClick={() => genMut.mutate()}
                >
                  <Download className="h-4 w-4 shrink-0" />
                  {genMut.isPending ? "Generating…" : "Generate Report"}
                </Button>
              )}
              {showBulkActions && !studentId && caps.canView && (
                <div className="w-full sm:w-auto">
                  <DefaulterListDownload
                    className="h-10 w-full justify-between rounded-md border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-muted hover:text-foreground sm:h-9 sm:w-auto sm:justify-center sm:whitespace-nowrap"
                    label="Download Defaulter List"
                    exporting={exportingMonthWise}
                    onDownload={(format) => void downloadMonthWise(format)}
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
                <th className="text-left p-2.5 font-medium">Status</th>
                {showPaidPaymentCols && (
                  <th className="text-left p-2.5 font-semibold whitespace-nowrap text-foreground">Slip number</th>
                )}
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
                    <td className="p-2.5">
                      <StatusPill status={r.status} />
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
                      <div className="inline-flex flex-nowrap items-center justify-end gap-1.5">
                        {payable && canPay && (
                          <Button
                            size="sm"
                            variant="hero"
                            className="shrink-0"
                            disabled={payMut.isPending}
                            onClick={() => openPayModal(r, "pay")}
                          >
                            Record payment
                          </Button>
                        )}
                        {canEditFee && (payable || r.status === "paid") && (
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-8 w-8 shrink-0"
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
                                  variant="outline"
                                  className="h-8 w-8 shrink-0"
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
                                  variant="outline"
                                  className="h-8 w-8 shrink-0"
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
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pagination && (
          <div className="flex justify-center items-center gap-3 p-3 border-t flex-wrap">
            <PageSizeSelect
              value={pageSize}
              onChange={(n) => {
                setPageSize(n);
                setPage(1);
              }}
            />
            {pagination.pages > 1 && (
              <>
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Prev
                </Button>
                <span className="text-sm self-center">
                  Page {page} / {pagination.pages}
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
            )}
          </div>
        )}
      </Card>

      <Dialog
        open={Boolean(payRecord)}
        onOpenChange={(o) => {
          if (!o) {
            setPayRecord(null);
            setSelectedFeeIds([]);
            setSelectedChargeIds([]);
            setAmountOverrides({});
            setPayModalMode("pay");
          }
        }}
      >
        <DialogContent className="min-w-0 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{payModalMode === "edit" ? "Edit fee payment" : "Record payment"}</DialogTitle>
          </DialogHeader>
          {payRecord && (
            <div className="min-w-0 max-w-full space-y-3 text-sm">
              <p>
                <span className="text-muted-foreground">Student:</span>{" "}
                <span className="font-medium">{studentName(payRecord)}</span>
              </p>
              {!editingPaid && payModalMode === "pay" && (
                <div className="rounded-md border">
                  <div className="px-3 py-2 border-b text-xs font-medium text-muted-foreground">
                    Additional charges (optional)
                  </div>
                  <AdditionalChargesChecklist
                    charges={payApplicableCharges}
                    selectedIds={selectedChargeIds}
                    onChange={setSelectedChargeIds}
                  />
                </div>
              )}
              <div className="rounded-md border">
                <div className="px-3 py-2 border-b text-xs font-medium text-muted-foreground">
                  {editingPaid
                    ? "Paid fee"
                    : payModalMode === "edit"
                      ? "Fee months (edit amount & select)"
                      : "Unpaid months"}
                </div>
                {editingPaid && payRecord ? (
                  <div className="flex items-center gap-3 px-3 py-2">
                    <span className="flex-1 min-w-0">
                      <span className="font-medium">{periodLabel(payRecord)}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {feeTypeLabel(payRecord.feeType)} · paid
                      </span>
                    </span>
                    <Input
                      type="number"
                      min={0}
                      className="h-8 w-28 text-right tabular-nums"
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
                      <p className="px-3 py-4 text-muted-foreground">Loading remaining fees…</p>
                    )}
                    {!payHistoryLoading && unpaidForPay.length === 0 && (
                      <p className="px-3 py-4 text-muted-foreground">No unpaid months left.</p>
                    )}
                    {!payHistoryLoading && unpaidForPay.length > 0 && (
                      <ul className="max-h-52 overflow-y-auto divide-y">
                        {unpaidForPay.map((fee) => {
                          const checked = selectedFeeIds.includes(fee._id);
                          return (
                            <li key={fee._id}>
                              <label className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 shrink-0"
                                  checked={checked}
                                  onChange={() =>
                                    setSelectedFeeIds((current) =>
                                      checked
                                        ? current.filter((id) => id !== fee._id)
                                        : [...current, fee._id]
                                    )
                                  }
                                />
                                <span className="flex-1 min-w-0">
                                  <span className="font-medium">{periodLabel(fee)}</span>
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    {feeTypeLabel(fee.feeType)} · {fee.status}
                                  </span>
                                </span>
                                {payModalMode === "edit" ? (
                                  <Input
                                    type="number"
                                    min={0}
                                    className="h-8 w-28 text-right tabular-nums"
                                    value={amountOverrides[fee._id] ?? String(fee.amount ?? "")}
                                    onClick={(e) => e.preventDefault()}
                                    onChange={(e) =>
                                      setAmountOverrides((prev) => ({
                                        ...prev,
                                        [fee._id]: e.target.value,
                                      }))
                                    }
                                  />
                                ) : (
                                  <span className="font-semibold tabular-nums">
                                    {formatPkr(feeAmount(fee))}
                                  </span>
                                )}
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </>
                )}
                <div className="flex items-center justify-between px-3 py-2 border-t bg-muted/30">
                  <span className="text-muted-foreground">
                    {editingPaid
                      ? "1 item"
                      : `${selectedUnpaid.length} item${selectedUnpaid.length === 1 ? "" : "s"} selected`}
                  </span>
                  <span className="font-semibold">
                    {formatPkr(
                      editingPaid && payRecord
                        ? Number(amountOverrides[payRecord._id] ?? payRecord.amount) || 0
                        : selectedTotal
                    )}
                  </span>
                </div>
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="payment-date">Payment date</Label>
                  <Input
                    id="payment-date"
                    type="date"
                    className="min-w-0 w-full"
                    value={paymentDate}
                    max={todayInputValue()}
                    onChange={(e) => setPaymentDate(e.target.value)}
                  />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label>Payment method</Label>
                  <select
                    className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  >
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank transfer</option>
                    <option value="online">Online</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="payment-slip-number">Payment slip number</Label>
                  <Input
                    id="payment-slip-number"
                    value={paymentSlipNumber}
                    onChange={(e) => setPaymentSlipNumber(e.target.value)}
                    placeholder="Bank / cash slip number"
                    maxLength={100}
                  />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label>Notes (optional)</Label>
                  <Input
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    placeholder="Reference or remarks"
                  />
                </div>
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
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayRecord(null)}>
              Cancel
            </Button>
            <Button
              variant="hero"
              disabled={
                payMut.isPending ||
                !paymentDate ||
                (editingPaid
                  ? amountOverrides[payRecord?._id || ""] === ""
                  : selectedFeeIds.length === 0)
              }
              onClick={() => payMut.mutate()}
            >
              {payMut.isPending
                ? "Saving…"
                : payModalMode === "edit"
                  ? "Save changes"
                  : "Confirm payment"}
            </Button>
          </DialogFooter>
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
    </div>
  );
}
