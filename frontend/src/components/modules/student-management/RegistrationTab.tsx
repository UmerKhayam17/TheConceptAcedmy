import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowUpDown,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Download,
  Eye,
  FileDown,
  FileSpreadsheet,
  FileText,
  Filter,
  Home,
  Hourglass,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  User,
  UserCheck,
  Users,
} from "lucide-react";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { moduleHref } from "@/lib/panelMenus";
import type { ModuleActionCaps } from "@/lib/permissions";
import {
  academyStudentRoutes,
  type AcademyStudentRoutes,
} from "@/lib/studentManagementMenus";
import {
  deleteAcademyStudent,
  exportStudents,
  fetchAcademyClasses,
  fetchAcademyStudents,
  type AcademyStudent,
  type AcademyStudentStatus,
  type StudentExportFormat,
} from "@/lib/studentManagementApi";
import { useSessionScope } from "@/components/modules/timetable/SessionBar";
import { classLabel } from "./studentDisplayUtils";
import ProvisionalIntakeDialog from "./ProvisionalIntakeDialog";
import BulkStudentImportDialog from "./BulkStudentImportDialog";

const AVATAR_TONES = [
  "bg-indigo-600",
  "bg-emerald-600",
  "bg-violet-600",
  "bg-orange-500",
  "bg-teal-600",
  "bg-fuchsia-600",
  "bg-rose-500",
  "bg-sky-600",
];

const selectClass =
  "h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-600 shadow-none";
const quietBtn =
  "h-9 gap-2 rounded-lg border border-slate-200 bg-white text-slate-700 shadow-none hover:bg-slate-50";

function studentRef(s: AcademyStudent) {
  if (s.status === "pending_fee") {
    return s.rollNumber ?? s.registrationNumber ?? "Pending";
  }
  return s.rollNumber ?? s.studentId ?? "—";
}

function statusLabel(status: AcademyStudentStatus) {
  if (status === "pending_fee") return "Pending Fee";
  if (status === "active") return "Active";
  if (status === "inactive") return "Inactive";
  return "Suspended";
}

function nameInitials(name: string) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "";
  const b = (parts.length > 1 ? parts[parts.length - 1]?.[0] : parts[0]?.[1]) ?? "";
  return (a + b).toUpperCase() || "?";
}

function avatarTone(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

function formatDateDMY(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function formatPhone(phone?: string) {
  const raw = String(phone || "").trim();
  if (!raw) return "—";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("03")) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
  if (digits.length === 10 && digits.startsWith("3")) {
    return `0${digits.slice(0, 3)}-${digits.slice(3)}`;
  }
  return raw;
}

function pageItems(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const wanted = new Set<number>([1, total]);
  if (current <= 4) {
    for (let i = 1; i <= Math.min(5, total); i += 1) wanted.add(i);
  } else if (current >= total - 3) {
    for (let i = Math.max(1, total - 4); i <= total; i += 1) wanted.add(i);
  } else {
    wanted.add(current - 1);
    wanted.add(current);
    wanted.add(current + 1);
  }
  const nums = [...wanted].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  for (const n of nums) {
    const prev = out[out.length - 1];
    if (typeof prev === "number" && n - prev > 1) out.push("…");
    out.push(n);
  }
  return out;
}

export default function RegistrationTab({
  caps,
  routes: routesProp,
  sessionId = "",
  heading = "Students",
  registerLabel = "Admission Intake",
  emptyHint = "No students yet.",
  showHeading = true,
  sessionBar,
  enrollmentFlow = "intake",
}: {
  caps: ModuleActionCaps;
  routes?: AcademyStudentRoutes;
  sessionId?: string;
  heading?: string;
  registerLabel?: string;
  emptyHint?: string;
  showHeading?: boolean;
  sessionBar?: ReactNode;
  enrollmentFlow?: "intake" | "direct" | "both";
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | AcademyStudentStatus>("");
  const [feeFilter, setFeeFilter] = useState<"" | "pending" | "charged">("");
  const [disciplineFilter, setDisciplineFilter] = useState("");
  const [sort, setSort] = useState("-createdAt");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState<StudentExportFormat | null>(null);
  const intakeParamHandled = useRef(false);

  const routes =
    routesProp ?? (user?.role ? academyStudentRoutes(user.role, "registration") : null);
  const { apiSessionId, writable, hasScope } = useSessionScope(sessionId);
  const dashboardHref = user?.role ? moduleHref(user.role, "dashboard") : "/panel/admin";

  const showIntake = enrollmentFlow === "intake" || enrollmentFlow === "both";
  const showDirectRegister = enrollmentFlow === "direct" || enrollmentFlow === "both";

  useEffect(() => {
    if (!showIntake) return;
    if (intakeParamHandled.current) return;
    if (searchParams.get("intake") === "1") {
      intakeParamHandled.current = true;
      setIntakeOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, showIntake]);

  useEffect(() => {
    setClassFilter("");
    setDisciplineFilter("");
    setPage(1);
  }, [sessionId]);

  const { data: classes = [] } = useQuery({
    queryKey: ["academy-classes", sessionId],
    queryFn: () =>
      fetchAcademyClasses({
        status: "active",
        sessionId: apiSessionId,
      }),
    enabled: hasScope,
  });

  const disciplines = useMemo(
    () => [...new Set(classes.flatMap((c) => c.disciplines ?? []).map((d) => String(d).trim()).filter(Boolean))].sort(),
    [classes],
  );

  const canIntake = showIntake && writable && classes.length > 0 && (caps.canCreate || caps.canEdit);
  const canDirectRegister = showDirectRegister && writable && classes.length > 0 && caps.canEdit;
  const canImport = writable && classes.length > 0 && (caps.canCreate || caps.canEdit);
  const intakeBlockedReason = !hasScope
    ? "Select an academic session first"
    : !writable
      ? "Switch to the active session to register students"
      : classes.length === 0
        ? "Add at least one active class for this session"
        : showIntake && !caps.canCreate && !caps.canEdit
          ? "You do not have permission for admission intake"
          : null;
  const directBlockedReason = !hasScope
    ? "Select an academic session first"
    : !writable
      ? "Switch to the active session to register students"
      : classes.length === 0
        ? "Add at least one active class for this session"
        : !caps.canEdit
          ? "You do not have permission to register students"
          : null;

  const { data: listData, isLoading } = useQuery({
    queryKey: ["academy-students", sessionId, page, pageSize, search, classFilter, statusFilter, feeFilter, disciplineFilter, sort],
    queryFn: () =>
      fetchAcademyStudents({
        page,
        limit: pageSize,
        search: search || undefined,
        classId: classFilter || undefined,
        status: statusFilter || undefined,
        fee: feeFilter || undefined,
        discipline: disciplineFilter || undefined,
        sort,
        sessionId: apiSessionId,
      }),
    enabled: hasScope,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteAcademyStudent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academy-students"] });
      toast({ title: "Student deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleExport = async (format: StudentExportFormat) => {
    setExporting(format);
    try {
      const blob = await exportStudents(
        {
          search: search || undefined,
          classId: classFilter || undefined,
          status: statusFilter || undefined,
          sessionId: apiSessionId,
        },
        format,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = format === "pdf" ? "academy-students.pdf" : "academy-students.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: format === "pdf" ? "PDF downloaded" : "Excel downloaded" });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  const handleDelete = (s: AcademyStudent) => {
    const label = studentRef(s);
    if (!confirm(`Delete "${s.studentName}" (${label})? This cannot be undone.`)) return;
    deleteMut.mutate(s._id);
  };

  const students = listData?.students ?? [];
  const pagination = listData?.pagination;
  const counts = listData?.counts;
  const totalEnrolled = pagination?.total ?? 0;
  const fromRow = totalEnrolled === 0 ? 0 : (page - 1) * (pagination?.limit ?? pageSize) + 1;
  const toRow = totalEnrolled === 0 ? 0 : fromRow + students.length - 1;

  useEffect(() => {
    setSelectedIds((ids) => ids.filter((id) => students.some((s) => s._id === id)));
  }, [students]);

  const pageIds = useMemo(() => students.map((s) => s._id), [students]);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
  const somePageSelected = pageIds.some((id) => selectedIds.includes(id));
  const selectedStudents = students.filter((s) => selectedIds.includes(s._id));
  const selectedPending = selectedStudents.filter((s) => s.status === "pending_fee");

  const toggleSelectAll = (checked: boolean) => {
    if (checked) setSelectedIds((ids) => [...new Set([...ids, ...pageIds])]);
    else setSelectedIds((ids) => ids.filter((id) => !pageIds.includes(id)));
  };

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((ids) => (checked ? [...ids, id] : ids.filter((x) => x !== id)));
  };

  const clearFilters = () => {
    setSearch("");
    setClassFilter("");
    setStatusFilter("");
    setFeeFilter("");
    setDisciplineFilter("");
    setPage(1);
  };

  const hasExtraFilters = Boolean(search.trim() || classFilter || statusFilter || feeFilter || disciplineFilter);
  const colSpan = 10;

  const toggleSort = (field: "studentName" | "createdAt") => {
    setSort((prev) => (prev === field ? `-${field}` : field));
    setPage(1);
  };

  const kpi = [
    {
      key: "total",
      label: "Total Students",
      value: counts?.total ?? (!statusFilter && !feeFilter ? totalEnrolled : null),
      icon: Users,
      iconClass: "bg-sky-100 text-sky-600",
      onClick: () => { setStatusFilter(""); setPage(1); },
    },
    {
      key: "active",
      label: "Active Students",
      value: counts?.active ?? null,
      icon: CheckCircle2,
      iconClass: "bg-emerald-100 text-emerald-600",
      onClick: () => { setStatusFilter(statusFilter === "active" ? "" : "active"); setPage(1); },
    },
    {
      key: "pending_fee",
      label: "Pending Fee",
      value: counts?.pending_fee ?? null,
      icon: Hourglass,
      iconClass: "bg-amber-100 text-amber-600",
      onClick: () => { setStatusFilter(statusFilter === "pending_fee" ? "" : "pending_fee"); setPage(1); },
    },
    {
      key: "inactive",
      label: "Inactive Students",
      value: counts?.inactive ?? null,
      icon: User,
      iconClass: "bg-rose-100 text-rose-500",
      onClick: () => { setStatusFilter(statusFilter === "inactive" ? "" : "inactive"); setPage(1); },
    },
  ];

  const goldAdd = showDirectRegister ? (
    canDirectRegister && routes ? (
      <Button variant="gold" size="sm" className="gap-2 h-10 rounded-lg px-4 shrink-0" asChild>
        <Link to={routes.register}>
          <Plus className="h-4 w-4" /> Add Student
        </Link>
      </Button>
    ) : (
      <Button variant="gold" size="sm" className="gap-2 h-10 rounded-lg px-4 shrink-0" disabled title={directBlockedReason ?? undefined}>
        <Plus className="h-4 w-4" /> Add Student
      </Button>
    )
  ) : showIntake ? (
    canIntake ? (
      <Button variant="gold" size="sm" className="gap-2 h-10 rounded-lg px-4 shrink-0" onClick={() => setIntakeOpen(true)}>
        <Plus className="h-4 w-4" /> Add Student
      </Button>
    ) : (
      <Button variant="gold" size="sm" className="gap-2 h-10 rounded-lg px-4 shrink-0" disabled title={intakeBlockedReason ?? undefined}>
        <Plus className="h-4 w-4" /> Add Student
      </Button>
    )
  ) : null;

  const navyAdd = showDirectRegister ? (
    canDirectRegister && routes ? (
      <Button size="sm" className="gap-2 h-9 rounded-lg px-4" asChild>
        <Link to={routes.register}>
          <Plus className="h-4 w-4" /> Add Student
        </Link>
      </Button>
    ) : (
      <Button size="sm" className="gap-2 h-9 rounded-lg px-4" disabled title={directBlockedReason ?? undefined}>
        <Plus className="h-4 w-4" /> Add Student
      </Button>
    )
  ) : null;

  const activateSelected = () => {
    const first = selectedPending[0];
    if (!first || !routes) return;
    if (selectedPending.length > 1) {
      toast({ title: "Activate one student at a time", description: `Opening ${first.studentName}.` });
    }
    navigate(routes.activate(first._id));
  };

  const deleteSelected = () => {
    if (!selectedStudents.length) return;
    if (!confirm(`Delete ${selectedStudents.length} selected student(s)? This cannot be undone.`)) return;
    selectedStudents.forEach((s) => deleteMut.mutate(s._id));
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 space-y-5 bg-slate-50/80 min-h-full">
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Home className="h-3.5 w-3.5" />
        <Link to={dashboardHref} className="hover:text-slate-600">Dashboard</Link>
        <span className="text-slate-300">›</span>
        <span className="text-slate-500">Students</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-[1.65rem] font-bold text-slate-900 tracking-tight leading-none">
            {showHeading ? heading : "Students"}
          </h2>
          <p className="text-sm text-slate-500 mt-2">
            Manage student enrollment, profiles, fees and academic records.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {sessionBar ? (
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-slate-500 text-right">Academic Session</p>
              {sessionBar}
            </div>
          ) : null}
          {goldAdd}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {kpi.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.key}
              type="button"
              onClick={card.onClick}
              className="flex items-center gap-3 text-left rounded-2xl border border-slate-100 bg-white px-4 py-3.5 shadow-sm hover:shadow-md transition"
            >
              <div className={cn("h-11 w-11 rounded-full grid place-items-center shrink-0", card.iconClass)}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-500">{card.label}</p>
                <p className="font-display text-[1.65rem] font-bold tabular-nums text-slate-900 leading-tight">
                  {card.value == null ? "—" : card.value.toLocaleString()}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {navyAdd}
        {showIntake && (
          canIntake ? (
            <Button size="sm" variant="secondary" className={quietBtn} onClick={() => setIntakeOpen(true)}>
              <ClipboardList className="h-4 w-4" /> {registerLabel}
            </Button>
          ) : (
            <Button size="sm" variant="secondary" className={quietBtn} disabled title={intakeBlockedReason ?? undefined}>
              <ClipboardList className="h-4 w-4" /> {registerLabel}
            </Button>
          )
        )}
        {canImport ? (
          <Button size="sm" variant="secondary" className={quietBtn} onClick={() => setImportOpen(true)}>
            <FileDown className="h-4 w-4" /> Import
          </Button>
        ) : (
          <Button size="sm" variant="secondary" className={quietBtn} disabled title={directBlockedReason ?? intakeBlockedReason ?? undefined}>
            <FileDown className="h-4 w-4" /> Import
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm" className={quietBtn} disabled={!!exporting}>
              <Download className="h-4 w-4" />
              {exporting ? "Exporting…" : "Export"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem className="gap-2" onClick={() => void handleExport("xlsx")}>
              <FileSpreadsheet className="h-4 w-4" />
              Excel (.xlsx)
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2" onClick={() => void handleExport("pdf")}>
              <FileText className="h-4 w-4" />
              PDF report
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <span className="inline-flex items-center gap-2 text-sm text-slate-500">
            <span className="h-4 w-4 rounded border border-slate-300 bg-white inline-block" />
            {selectedIds.length} selected
          </span>
          <Button
            size="sm"
            variant="secondary"
            className={cn(quietBtn, "text-slate-500")}
            disabled={!selectedPending.length || !writable || !caps.canEdit}
            onClick={activateSelected}
          >
            <UserCheck className="h-4 w-4" /> Activate
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="secondary" className={quietBtn} disabled={!selectedIds.length}>
                More
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {writable && caps.canDelete && (
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={deleteSelected}>
                  Delete selected
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setSelectedIds([])}>Clear selection</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <PanelSearchBar
          value={search}
          onChange={(v) => { setSearch(v); setPage(1); }}
          placeholder="Search by name, roll number, father name, phone..."
          className="w-full max-w-none flex-1"
          inputClassName="h-9 rounded-lg border-slate-200 bg-white"
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={selectClass}
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as "" | AcademyStudentStatus); setPage(1); }}
          >
            <option value="">All Statuses</option>
            <option value="pending_fee">Pending Fee</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </select>
          <select
            className={selectClass}
            value={classFilter}
            onChange={(e) => { setClassFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Classes</option>
            {classes.map((c) => (
              <option key={c._id} value={c._id}>{c.className}</option>
            ))}
          </select>
          <select
            className={selectClass}
            value={disciplineFilter}
            onChange={(e) => { setDisciplineFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Disciplines</option>
            {disciplines.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <select
            className={selectClass}
            value={feeFilter}
            onChange={(e) => { setFeeFilter(e.target.value as "" | "pending" | "charged"); setPage(1); }}
          >
            <option value="">Fee Status</option>
            <option value="pending">Pending</option>
            <option value="charged">Charged</option>
          </select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm" className={quietBtn}>
                <Filter className="h-4 w-4" /> More Filters
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={!hasExtraFilters} onClick={clearFilters}>
                Clear all filters
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-slate-500">
                <th className="p-3 w-10">
                  <Checkbox
                    checked={allPageSelected ? true : somePageSelected ? "indeterminate" : false}
                    onCheckedChange={(v) => toggleSelectAll(v === true)}
                    aria-label="Select all on this page"
                  />
                </th>
                <th className="text-left p-3 font-medium">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("studentName")}>
                    Student <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
                  </button>
                </th>
                <th className="text-left p-3 font-medium">Father / Guardian</th>
                <th className="text-left p-3 font-medium">Phone</th>
                <th className="text-left p-3 font-medium">Class</th>
                <th className="text-left p-3 font-medium">Discipline</th>
                <th className="text-left p-3 font-medium">Fee Status</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("createdAt")}>
                    Created <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
                  </button>
                </th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={colSpan} className="p-8 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {!isLoading && students.length === 0 && (
                <tr>
                  <td colSpan={colSpan} className="p-8 text-center text-muted-foreground">
                    {emptyHint}
                    {caps.canCreate && canIntake && (
                      <>
                        {" "}
                        <button
                          type="button"
                          className="text-primary underline-offset-2 hover:underline"
                          onClick={() => setIntakeOpen(true)}
                        >
                          {registerLabel}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              )}
              {students.map((s) => {
                const viewHref = routes ? routes.detail(s._id) : "#";
                const editHref = routes ? routes.edit(s._id) : "#";
                const activateHref = routes ? routes.activate(s._id) : "#";
                const isPending = s.status === "pending_fee";
                const hasActions = caps.canView || (writable && (caps.canEdit || caps.canDelete));
                return (
                  <tr key={s._id} className="border-b border-slate-100 hover:bg-slate-50/80">
                    <td className="p-3">
                      <Checkbox
                        checked={selectedIds.includes(s._id)}
                        onCheckedChange={(v) => toggleSelect(s._id, v === true)}
                        aria-label={`Select ${s.studentName}`}
                      />
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={cn("h-9 w-9 rounded-full text-white text-[11px] font-semibold grid place-items-center shrink-0", avatarTone(s.studentName))}>
                          {nameInitials(s.studentName)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 leading-tight truncate uppercase tracking-wide text-[13px]">
                            {s.studentName}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate">{studentRef(s)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-slate-600">{s.fatherName}</td>
                    <td className="p-3 text-slate-600">{formatPhone(s.phone)}</td>
                    <td className="p-3 text-slate-600">{classLabel(s.classId)}</td>
                    <td className="p-3 text-slate-400">{s.discipline || "—"}</td>
                    <td className="p-3">
                      {isPending ? (
                        <span className="text-sm font-medium text-amber-500">Pending</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full",
                            s.status === "active" && "bg-emerald-500",
                            s.status === "pending_fee" && "bg-amber-400",
                            s.status === "inactive" && "bg-rose-500",
                            s.status === "suspended" && "bg-slate-400",
                          )}
                        />
                        <span
                          className={cn(
                            s.status === "active" && "text-emerald-600",
                            s.status === "pending_fee" && "text-amber-500",
                            s.status === "inactive" && "text-rose-500",
                            s.status === "suspended" && "text-slate-500",
                          )}
                        >
                          {statusLabel(s.status)}
                        </span>
                      </span>
                    </td>
                    <td className="p-3 text-slate-500">{formatDateDMY(s.createdAt)}</td>
                    <td className="p-3 text-right">
                      {hasActions && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400" aria-label="Row actions">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {caps.canView && (
                              <DropdownMenuItem asChild>
                                <Link to={viewHref} className="gap-2">
                                  <Eye className="h-4 w-4" /> View
                                </Link>
                              </DropdownMenuItem>
                            )}
                            {isPending && writable && caps.canEdit && (
                              <DropdownMenuItem asChild>
                                <Link to={activateHref} className="gap-2">
                                  <UserCheck className="h-4 w-4" /> Activate
                                </Link>
                              </DropdownMenuItem>
                            )}
                            {writable && caps.canEdit && !isPending && (
                              <DropdownMenuItem asChild>
                                <Link to={editHref} className="gap-2">
                                  <Pencil className="h-4 w-4" /> Edit
                                </Link>
                              </DropdownMenuItem>
                            )}
                            {writable && caps.canDelete && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive gap-2"
                                  disabled={deleteMut.isPending}
                                  onClick={() => handleDelete(s)}
                                >
                                  <Trash2 className="h-4 w-4" /> Delete
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pagination && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 border-t border-slate-100">
            <p className="text-sm text-slate-400">
              Showing {fromRow.toLocaleString()} – {toRow.toLocaleString()} of {totalEnrolled.toLocaleString()} students
            </p>
            <div className="flex flex-wrap items-center gap-4 sm:ml-auto">
              <label className="flex items-center gap-2 text-sm text-slate-400">
                Rows per page:
                <select
                  className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700"
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                >
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </label>
              {pagination.pages > 1 && (
                <div className="flex items-center gap-1">
                  {pageItems(page, pagination.pages).map((item, idx) =>
                    item === "…" ? (
                      <span key={`e${idx}`} className="px-1 text-slate-400">…</span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        className={cn(
                          "h-8 min-w-8 px-2 rounded-md text-sm font-medium",
                          item === page
                            ? "bg-slate-900 text-white"
                            : "text-slate-500 hover:bg-slate-100",
                        )}
                        onClick={() => setPage(item)}
                      >
                        {item}
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showIntake && (
        <ProvisionalIntakeDialog
          open={intakeOpen}
          onOpenChange={setIntakeOpen}
          caps={caps}
          sessionId={writable ? sessionId : ""}
        />
      )}

      <BulkStudentImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        sessionId={writable ? sessionId : ""}
        onImported={() => {
          void qc.invalidateQueries({ queryKey: ["academy-students"] });
          void qc.invalidateQueries({ queryKey: ["academy-classes"] });
          void qc.invalidateQueries({ queryKey: ["academy-sections"] });
        }}
      />
    </div>
  );
}
