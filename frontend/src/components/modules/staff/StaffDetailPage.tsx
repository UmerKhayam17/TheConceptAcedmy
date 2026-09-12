import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  KeyRound,
  Receipt,
  User,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

function StatCard({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-display text-xl font-bold ${tone || "text-primary"}`}>{value}</div>
    </Card>
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

export default function StaffDetailPage({ staffId }: { staffId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const role = user?.role || "admin";
  const backHref = moduleHref(role, "staff-management");
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [sessionId, setSessionId] = useState("");
  const [exporting, setExporting] = useState<StaffReportFormat | null>(null);

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

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <Button variant="ghost" size="sm" className="mt-1" asChild>
            <Link to={backHref} aria-label="Back to staff list">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="h-14 w-14 rounded-full bg-muted overflow-hidden border border-border shrink-0">
            {imgSrc ? <img src={imgSrc} alt="" className="h-full w-full object-cover" /> : <User className="h-7 w-7 m-3.5 text-muted-foreground" />}
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-xl font-bold text-primary truncate">{staff.name}</h2>
            <p className="text-sm text-muted-foreground">
              {roleLabel}
              {staff.email ? ` · ${staff.email}` : ""}
              {staff.phone ? ` · ${staff.phone}` : ""}
            </p>
            <p className="text-xs mt-1">
              Monthly salary <span className="font-semibold text-primary">{formatPkr(staff.salary)}</span>
              {" · "}
              {staff.isActive ? "Active" : "Inactive"}
            </p>
          </div>
        </div>
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
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Paid" value={formatPkr(salarySummary?.totalPaid)} tone="text-accent" />
        <StatCard label="Pending" value={formatPkr(salarySummary?.totalPending)} tone="text-destructive" />
        <StatCard label="Vouchers" value={salarySummary?.recordsCount ?? salaries.length} />
        <StatCard label="Present (month)" value={attCounts.present} />
      </div>

      <Tabs defaultValue="permissions">
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
