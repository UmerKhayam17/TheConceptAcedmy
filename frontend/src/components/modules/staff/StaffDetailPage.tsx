import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  KeyRound,
  Receipt,
  User,
  Wallet,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PanelStatCard from "@/components/modules/PanelStatCard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { resolveUploadUrl } from "@/lib/api";
import { fetchSessions } from "@/lib/configApi";
import {
  exportStaffReport,
  fetchModuleRegistry,
  fetchStaffUsers,
  normalizeModulePermissions,
  roleDisplayLabel,
  type ModuleRegistryEntry,
  type PermissionDefinition,
  type RoleOption,
  type StaffReportFormat,
  type StaffUser,
} from "@/lib/staffApi";
import {
  fetchAcademySalaries,
  fetchAcademySalarySummary,
  type AcademySalaryRecord,
} from "@/lib/studentManagementApi";
import { fetchStaffAttendanceHistory, type StaffAttendanceRecord } from "@/lib/aiAttendanceApi";
import { fetchMyTeacherSchedule, type ScheduleSlot } from "@/lib/timetableApi";
import { formatPkr, MONTH_NAMES } from "@/components/modules/student-management/studentDisplayUtils";
import { DAY_LABELS, DAY_ORDER, subjectColor } from "@/components/modules/timetable/constants";
import type { Weekday } from "@/lib/configApi";
import { moduleHref } from "@/lib/panelMenus";
import type { ModuleActionCaps } from "@/lib/permissions";
import { cn } from "@/lib/utils";

function roleNameOf(user?: StaffUser | null) {
  const r = user?.role;
  if (r && typeof r === "object" && "name" in r) return String((r as RoleOption).name);
  return typeof r === "string" ? r : "";
}

function fmtTime(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function fmtDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    present: "bg-accent/15 text-accent",
    late: "bg-primary/15 text-primary",
    absent: "bg-destructive/15 text-destructive",
    leave: "bg-primary/15 text-primary",
    half_day: "bg-primary/15 text-primary",
    cancelled: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`text-xs font-semibold rounded-full px-2 py-0.5 capitalize ${colors[status] || "bg-muted text-muted-foreground"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function moduleLabel(key: string, registry: ModuleRegistryEntry[]) {
  const found = registry.find((m) => m.key === key);
  if (found?.name) return found.name;
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
}

function StaffPermissionsPanel({
  staff,
  registry,
}: {
  staff: StaffUser;
  registry: ModuleRegistryEntry[];
}) {
  const modulePerms = normalizeModulePermissions(staff.modulePermissions);
  const moduleRows = Object.entries(modulePerms)
    .filter(([, actions]) => actions.length > 0)
    .sort(([a], [b]) => moduleLabel(a, registry).localeCompare(moduleLabel(b, registry)));

  const apiPerms = (staff.permissions || []).filter((p) => p && (p.name || p.module));
  const apiByModule = new Map<string, PermissionDefinition[]>();
  apiPerms.forEach((p) => {
    const key = p.module || "other";
    const list = apiByModule.get(key) || [];
    list.push(p);
    apiByModule.set(key, list);
  });

  if (moduleRows.length === 0 && apiPerms.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        No module or API permissions assigned to this staff member.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b font-semibold text-primary">Module access</div>
        {moduleRows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No module permissions granted.</p>
        ) : (
          <div className="divide-y">
            {moduleRows.map(([key, actions]) => (
              <div key={key} className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-2">
                <div className="sm:w-56 shrink-0">
                  <div className="text-sm font-medium text-primary">{moduleLabel(key, registry)}</div>
                  <div className="text-[11px] text-muted-foreground font-mono">{key}</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {actions.map((action) => (
                    <span
                      key={action}
                      className="text-xs font-semibold rounded-full px-2 py-0.5 bg-primary/10 text-primary capitalize"
                    >
                      {action}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b font-semibold text-primary">API permissions</div>
        {apiPerms.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No API permission records on this account.</p>
        ) : (
          <div className="divide-y">
            {[...apiByModule.entries()].map(([mod, perms]) => (
              <div key={mod} className="px-4 py-3 space-y-2">
                <div className="text-sm font-medium text-primary capitalize">{mod}</div>
                <div className="flex flex-wrap gap-1.5">
                  {perms.map((p) => (
                    <span
                      key={p._id || p.name}
                      className="text-xs rounded-full px-2 py-0.5 bg-muted text-foreground"
                      title={p.description || p.name}
                    >
                      {p.name || `${p.module}:${p.action}`}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export default function StaffDetailPage({
  staffId,
  caps,
}: {
  staffId: string;
  caps?: ModuleActionCaps;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const role = user?.role || "admin";
  const backHref = moduleHref(role, "staff-management");
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [sessionId, setSessionId] = useState("");
  const [exporting, setExporting] = useState<StaffReportFormat | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const staffTabs = ["permissions", "payroll", "attendance", "timetable", "report"] as const;
  const tabFromUrl = searchParams.get("tab") || "";
  const activeTab = (staffTabs as readonly string[]).includes(tabFromUrl)
    ? tabFromUrl
    : "permissions";

  const setActiveTab = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next === "permissions") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  const { data: staffList = [], isLoading: staffLoading } = useQuery({
    queryKey: ["users-module-list", "staff"],
    queryFn: fetchStaffUsers,
  });
  const staff = staffList.find((s) => s._id === staffId);

  const { data: modules = [] } = useQuery({
    queryKey: ["moduleRegistry"],
    queryFn: fetchModuleRegistry,
  });

  const { data: salarySummary } = useQuery({
    queryKey: ["staff-salary-summary", staffId],
    queryFn: () => fetchAcademySalarySummary({ staffId }),
    enabled: Boolean(staffId),
  });

  const { data: salaryData, isLoading: salaryLoading } = useQuery({
    queryKey: ["staff-salaries", staffId],
    queryFn: () => fetchAcademySalaries({ staffId, page: 1, limit: 100 }),
    enabled: Boolean(staffId),
  });

  const { data: attendance = [], isLoading: attLoading } = useQuery({
    queryKey: ["staff-attendance-history", staffId, month, year],
    queryFn: () => fetchStaffAttendanceHistory(staffId, month, year),
    enabled: Boolean(staffId),
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: () => fetchSessions(),
  });

  const activeSessionId = sessionId || sessions.find((s) => s.isActive)?._id || sessions[0]?._id || "";

  const { data: schedule, isLoading: scheduleLoading } = useQuery({
    queryKey: ["staff-teacher-schedule", activeSessionId, staffId],
    queryFn: () => fetchMyTeacherSchedule(activeSessionId, staffId),
    enabled: Boolean(activeSessionId && staffId),
    retry: false,
  });

  const salaries = salaryData?.records ?? [];
  const slots = schedule?.slots ?? [];
  const attCounts = useMemo(() => {
    const counts = { present: 0, late: 0, absent: 0, half_day: 0, leave: 0 };
    attendance.forEach((r) => {
      if (r.status in counts) (counts as Record<string, number>)[r.status] += 1;
    });
    return counts;
  }, [attendance]);

  const days = useMemo(() => {
    const unique = [...new Set(slots.map((s) => s.day))] as Weekday[];
    return unique.sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
  }, [slots]);

  const byDay = (day: Weekday) =>
    slots.filter((s) => s.day === day).sort((a, b) => a.periodId.localeCompare(b.periodId));

  const handleExport = async (format: StaffReportFormat) => {
    setExporting(format);
    try {
      const blob = await exportStaffReport(staffId, {
        format,
        month,
        year,
        sessionId: activeSessionId || undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = format === "pdf" ? `staff-report.pdf` : `staff-report.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: format === "pdf" ? "PDF downloaded" : "Excel downloaded" });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  if (staffLoading) {
    return <p className="px-6 py-10 text-sm text-muted-foreground">Loading staff…</p>;
  }
  if (!staff) {
    return (
      <div className="px-6 py-10 space-y-3">
        <p className="text-sm text-muted-foreground">Staff member not found.</p>
        <Button variant="outline" asChild>
          <Link to={backHref}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to staff
          </Link>
        </Button>
      </div>
    );
  }

  const imgSrc = staff.profileImage ? resolveUploadUrl(staff.profileImage) : undefined;
  const roleLabel = roleDisplayLabel(roleNameOf(staff));

  const pageHint = [
    roleLabel,
    staff.email,
    staff.isActive ? "Active" : "Inactive",
    staff.payType === "percentage"
      ? `Percentage (${Number(staff.salaryPercentage ?? 0)}%)`
      : `Salary ${formatPkr(staff.salary)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary overflow-hidden">
              {imgSrc ? (
                <img src={imgSrc} alt="" className="h-full w-full object-cover" />
              ) : (
                <User className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
              )}
            </span>
            <div className="min-w-0">
              <Link
                to={backHref}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Staff
              </Link>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight truncate">
                  {staff.name}
                </h2>
                <span
                  className={cn(
                    "inline-flex text-xs font-semibold rounded-full px-2 py-0.5",
                    staff.isActive ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground",
                  )}
                >
                  {staff.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500 max-w-xl truncate">
                {pageHint}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1" disabled={!!exporting}>
                  <Download className="h-4 w-4" />
                  {exporting ? "Exporting…" : "Complete report"}
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="gap-2" onClick={() => void handleExport("xlsx")}>
                  <FileSpreadsheet className="h-4 w-4" /> Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2" onClick={() => void handleExport("pdf")}>
                  <FileText className="h-4 w-4" /> PDF report
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="rounded-lg bg-primary/10 px-3 py-2 max-w-[14rem]">
              <p className="text-xs sm:text-sm italic leading-snug text-[#1a2b4b]/80">
                <span className="mr-1 text-primary not-italic font-serif text-base leading-none">
                  &ldquo;
                </span>
                Teachers plant seeds that grow forever.
                <span className="ml-0.5 text-primary not-italic font-serif text-base leading-none">
                  &rdquo;
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PanelStatCard
          label="Paid"
          value={formatPkr(salarySummary?.totalPaid)}
          hint="Salary paid"
          icon={Wallet}
          iconWrapClass="bg-[#d1fae5]"
          iconClass="text-[#059669]"
        />
        <PanelStatCard
          label="Pending"
          value={formatPkr(salarySummary?.totalPending)}
          hint="Awaiting payment"
          icon={Receipt}
          iconWrapClass="bg-[#fee2e2]"
          iconClass="text-[#dc2626]"
        />
        <PanelStatCard
          label="Vouchers"
          value={salarySummary?.recordsCount ?? salaries.length}
          hint="Salary records"
          icon={FileText}
          iconWrapClass="bg-[#dbeafe]"
          iconClass="text-[#2563eb]"
        />
        <PanelStatCard
          label="Present (month)"
          value={attCounts.present}
          hint={`${MONTH_NAMES[month - 1]} ${year}`}
          icon={CheckCircle2}
          iconWrapClass="bg-[#ede9fe]"
          iconClass="text-[#7c3aed]"
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="permissions" className="gap-1">
            <KeyRound className="h-3.5 w-3.5" /> Permissions
          </TabsTrigger>
          <TabsTrigger value="payroll" className="gap-1">
            <Receipt className="h-3.5 w-3.5" /> Payroll
          </TabsTrigger>
          <TabsTrigger value="attendance" className="gap-1">
            <Clock className="h-3.5 w-3.5" /> Attendance
          </TabsTrigger>
          <TabsTrigger value="timetable" className="gap-1">
            <Calendar className="h-3.5 w-3.5" /> Timetable
          </TabsTrigger>
          <TabsTrigger value="report" className="gap-1">
            <FileText className="h-3.5 w-3.5" /> Report
          </TabsTrigger>
        </TabsList>

        <TabsContent value="permissions" className="mt-4">
          <StaffPermissionsPanel staff={staff} registry={modules} />
        </TabsContent>

        <TabsContent value="payroll" className="mt-4 space-y-3">
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b font-semibold text-primary">Salary vouchers</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3">Period</th>
                    <th className="text-left p-3">Voucher</th>
                    <th className="text-left p-3">Amount</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3">Paid on</th>
                    <th className="text-left p-3">Method</th>
                  </tr>
                </thead>
                <tbody>
                  {salaryLoading && (
                    <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Loading payroll…</td></tr>
                  )}
                  {!salaryLoading && salaries.length === 0 && (
                    <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No salary vouchers yet.</td></tr>
                  )}
                  {salaries.map((r: AcademySalaryRecord) => (
                    <tr key={r._id} className="border-t">
                      <td className="p-3">{MONTH_NAMES[(r.month || 1) - 1]} {r.year}</td>
                      <td className="p-3 font-mono text-xs">{r.voucherNumber || "—"}</td>
                      <td className="p-3">{formatPkr(r.amount)}</td>
                      <td className="p-3"><StatusPill status={r.status} /></td>
                      <td className="p-3 text-muted-foreground">{fmtDate(r.paidAt)}</td>
                      <td className="p-3 capitalize">{r.paymentMethod?.replace("_", " ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="attendance" className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Month</label>
              <select className="h-9 rounded-md border bg-background px-2 text-sm" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {MONTH_NAMES.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Year</label>
              <input
                type="number"
                className="h-9 w-24 rounded-md border bg-background px-2 text-sm"
                value={year}
                onChange={(e) => setYear(Number(e.target.value) || now.getFullYear())}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(attCounts).map(([k, v]) => (
              <span key={k} className="rounded-full bg-muted px-2.5 py-1 capitalize">{k.replace("_", " ")}: {v}</span>
            ))}
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3">Date</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3">Check-in</th>
                    <th className="text-left p-3">Check-out</th>
                    <th className="text-left p-3">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {attLoading && (
                    <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Loading attendance…</td></tr>
                  )}
                  {!attLoading && attendance.length === 0 && (
                    <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No attendance for this month.</td></tr>
                  )}
                  {attendance.map((r: StaffAttendanceRecord) => (
                    <tr key={r._id} className="border-t">
                      <td className="p-3">{fmtDate(r.date)}</td>
                      <td className="p-3"><StatusPill status={r.status} /></td>
                      <td className="p-3">{fmtTime(r.checkIn)}</td>
                      <td className="p-3">{fmtTime(r.checkOut)}</td>
                      <td className="p-3 uppercase text-xs">{r.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="timetable" className="mt-4 space-y-3">
          {sessions.length > 0 && (
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Session</label>
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm min-w-[12rem]"
                value={activeSessionId}
                onChange={(e) => setSessionId(e.target.value)}
              >
                {sessions.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}{s.isActive ? " (active)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          {scheduleLoading ? (
            <p className="text-sm text-muted-foreground">Loading timetable…</p>
          ) : slots.length === 0 ? (
            <p className="text-sm text-muted-foreground">No published classes for this teacher in the selected session.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {days.map((day) => (
                <Card key={day} className="p-4">
                  <h3 className="font-semibold text-primary mb-3">{DAY_LABELS[day]}</h3>
                  <ul className="space-y-2">
                    {byDay(day).map((s: ScheduleSlot) => (
                      <li key={s._id} className={`rounded-md border p-2 text-sm ${subjectColor(s.subject?._id)}`}>
                        <div className="font-semibold">{s.subject?.name}</div>
                        <div className="text-xs opacity-80">
                          {s.class?.name ? `${s.class.name} ` : ""}
                          {s.section?.name || ""}
                          {s.room?.name ? ` · ${s.room.name}` : ""}
                        </div>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="report" className="mt-4 space-y-4">
          <Card className="p-4 space-y-2">
            <h3 className="font-semibold text-primary">Complete staff report</h3>
            <p className="text-sm text-muted-foreground">
              Combines payroll (paid vs pending), {MONTH_NAMES[month - 1]} {year} attendance, and the published timetable.
              Download Excel or PDF from the button above.
            </p>
            <ul className="text-sm space-y-1">
              <li>Paid: <strong>{formatPkr(salarySummary?.totalPaid)}</strong></li>
              <li>Pending: <strong>{formatPkr(salarySummary?.totalPending)}</strong></li>
              <li>Attendance this month: present {attCounts.present}, late {attCounts.late}, absent {attCounts.absent}, leave {attCounts.leave}</li>
              <li>Timetable slots: {slots.length}</li>
            </ul>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
