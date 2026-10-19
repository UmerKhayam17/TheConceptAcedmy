import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  ExternalLink,
  GraduationCap,
  KeyRound,
  Link2,
  Loader2,
  Lock,
  Mail,
  Pencil,
  Phone,
  Plus,
  Shield,
  Unlink,
  User,
  UserCog,
  UserX,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import PanelStatCard from "@/components/modules/PanelStatCard";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { resolveUploadUrl } from "@/lib/api";
import type { ModuleActionCaps } from "@/lib/permissions";
import {
  assignParentStudents,
  bulkUsersAction,
  fetchModuleRegistry,
  fetchParentStudents,
  fetchUsersByScope,
  normalizeModulePermissions,
  roleDisplayLabel,
  type LinkedStudentSummary,
  type ModuleRegistryEntry,
  type PermissionDefinition,
  type RoleOption,
  type StaffUser,
} from "@/lib/staffApi";
import { userEditHref, usersListHref, type UserFormScope } from "@/lib/userFormRoutes";
import { academyStudentRoutes } from "@/lib/studentManagementMenus";
import { fetchSessions, isSessionWritable } from "@/lib/configApi";
import {
  fetchAcademyClasses,
  fetchAcademyStudents,
  fetchSectionsByClass,
  getAcademyStudent,
  type AcademyStudent,
  type AcademyStudentStatus,
} from "@/lib/studentManagementApi";
import {
  classLabel,
  formatDate,
  formatPkr,
} from "@/components/modules/student-management/studentDisplayUtils";
import { cn } from "@/lib/utils";
import StaffDetailPage from "@/components/modules/staff/StaffDetailPage";

/** Default parent portal password (same as list / provision). Hashed in DB — not recoverable. */
const DEFAULT_PARENT_PASSWORD = "Concept@1234";

function roleNameOf(user?: StaffUser | null) {
  const r = user?.role;
  if (r && typeof r === "object" && "name" in r) return String((r as RoleOption).name);
  return typeof r === "string" ? r : "";
}

function fmtDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

function fmtDateTime(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Stable display code for parent accounts (no dedicated Parent ID field yet). */
function parentDisplayId(userId: string) {
  const tail = userId.replace(/[^a-f0-9]/gi, "").slice(-4).toUpperCase() || "0000";
  return `PNT-${tail}`;
}

function moduleLabel(key: string, registry: ModuleRegistryEntry[]) {
  const found = registry.find((m) => m.key === key);
  if (found?.name) return found.name;
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-primary border-b pb-1.5 mb-3">{children}</h3>;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1 min-w-0">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium break-words">{value ?? "—"}</p>
    </div>
  );
}

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex text-xs font-semibold rounded-full px-2 py-0.5",
        active ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground",
      )}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function studentRef(s: AcademyStudent) {
  if (s.status === "pending_fee") {
    return s.rollNumber ?? s.registrationNumber ?? "Pending";
  }
  return s.rollNumber ?? s.studentId ?? "—";
}

function sectionNameOf(s: AcademyStudent): string {
  if (!s.sectionId) return "";
  if (typeof s.sectionId === "object") return s.sectionId.sectionName || "";
  return "";
}

function sectionBadgeClass(name: string) {
  const letter = name.trim().charAt(0).toUpperCase();
  if (letter === "A") return "bg-sky-100 text-sky-800 border-sky-200";
  if (letter === "B") return "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200";
  if (letter === "C") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (letter === "D") return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function statusLabel(status?: string) {
  if (status === "pending_fee") return "Pending fee";
  return status?.replace(/_/g, " ") || "—";
}

function statusBadgeClass(status?: string) {
  if (status === "active") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "pending_fee") return "bg-amber-50 text-amber-800 border-amber-200";
  if (status === "suspended") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

function statusDotClass(status?: string) {
  if (status === "active") return "bg-emerald-500";
  if (status === "pending_fee") return "bg-amber-500";
  if (status === "suspended") return "bg-rose-500";
  return "bg-slate-400";
}

function StudentAvatar({ student }: { student: AcademyStudent }) {
  const src = student.photoImage ? resolveUploadUrl(student.photoImage) : null;
  const initial = (student.studentName || "?").trim().charAt(0).toUpperCase() || "?";
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="h-8 w-8 rounded-md object-cover shrink-0 border border-border"
      />
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
      {initial}
    </span>
  );
}

function LinkStudentDialog({
  open,
  onOpenChange,
  parentUserId,
  alreadyLinkedIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentUserId: string;
  alreadyLinkedIds: string[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [sessionId, setSessionId] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setClassId("");
      setSectionId("");
      setSearch("");
      setDebounced("");
      setSelectedId(null);
      return;
    }
    const t = window.setTimeout(() => setDebounced(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search, open]);

  const { data: sessions = [] } = useQuery({
    queryKey: ["parent-link-sessions"],
    queryFn: () => fetchSessions(),
    enabled: open,
  });

  useEffect(() => {
    if (!open || sessionId || !sessions.length) return;
    const active =
      sessions.find((s) => s.isActive && isSessionWritable(s)) ||
      sessions.find((s) => isSessionWritable(s)) ||
      sessions[0];
    if (active) setSessionId(active._id);
  }, [open, sessions, sessionId]);

  const { data: classes = [], isLoading: classesLoading } = useQuery({
    queryKey: ["parent-link-classes", sessionId],
    queryFn: () => fetchAcademyClasses({ status: "active", sessionId }),
    enabled: open && Boolean(sessionId),
  });

  const { data: sections = [], isLoading: sectionsLoading } = useQuery({
    queryKey: ["parent-link-sections", classId],
    queryFn: () => fetchSectionsByClass(classId, { status: "active" }),
    enabled: open && Boolean(classId),
  });

  const { data: searchResult, isFetching } = useQuery({
    queryKey: ["parent-link-student-search", sessionId, classId, sectionId, debounced],
    queryFn: () =>
      fetchAcademyStudents({
        search: debounced || undefined,
        status: "active",
        sessionId: sessionId || undefined,
        classId: classId || undefined,
        sectionId: sectionId || undefined,
        limit: 50,
        page: 1,
      }),
    enabled: open && Boolean(sessionId),
  });

  const linkedSet = useMemo(() => new Set(alreadyLinkedIds), [alreadyLinkedIds]);
  const candidates = (searchResult?.students ?? []).filter((s) => !linkedSet.has(s._id));
  const selectClass =
    "w-full h-10 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50";

  const linkMutation = useMutation({
    mutationFn: async (studentId: string) => {
      const next = [...new Set([...alreadyLinkedIds, studentId])];
      await assignParentStudents(parentUserId, next);
    },
    onSuccess: () => {
      toast({ title: "Student linked" });
      void qc.invalidateQueries({ queryKey: ["parent-students", parentUserId] });
      void qc.invalidateQueries({ queryKey: ["users-module-list", "parents"] });
      onOpenChange(false);
    },
    onError: (e: Error) => {
      toast({ title: "Link failed", description: e.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            Link another student
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Class
              </label>
              <select
                className={selectClass}
                value={classId}
                disabled={classesLoading || !sessionId}
                onChange={(e) => {
                  setClassId(e.target.value);
                  setSectionId("");
                  setSelectedId(null);
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
            <div className="space-y-1">
              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Section
              </label>
              <select
                className={selectClass}
                value={sectionId}
                disabled={!classId || sectionsLoading}
                onChange={(e) => {
                  setSectionId(e.target.value);
                  setSelectedId(null);
                }}
              >
                <option value="">{classId ? "All sections" : "Select class first"}</option>
                {sections.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.sectionName}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Input
            placeholder="Search by name, student ID, or roll…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className="rounded-lg border border-slate-200 max-h-64 overflow-y-auto">
            {isFetching ? (
              <p className="p-4 text-sm text-slate-500 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching…
              </p>
            ) : candidates.length === 0 ? (
              <p className="p-4 text-sm text-slate-500 text-center">
                {classId || sectionId || debounced
                  ? "No matching active students (or already linked)."
                  : "No available students to link."}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {candidates.map((s) => {
                  const selected = selectedId === s._id;
                  return (
                    <li key={s._id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(s._id)}
                        className={cn(
                          "w-full text-left px-3 py-2.5 transition-colors",
                          selected ? "bg-sky-50" : "hover:bg-slate-50",
                        )}
                      >
                        <div className="text-sm font-medium text-slate-800">{s.studentName}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {s.studentId || "—"}
                          {s.rollNumber ? ` · Roll ${s.rollNumber}` : ""}
                          {" · "}
                          {classLabel(s.classId)}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!selectedId || linkMutation.isPending}
            className="gap-1.5"
            onClick={() => {
              if (selectedId) linkMutation.mutate(selectedId);
            }}
          >
            {linkMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Link student
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ParentLinkedStudentsPanel({
  summaries,
  listLoading,
  studentDetailHref,
  canEdit,
  parentUserId,
}: {
  summaries: LinkedStudentSummary[];
  listLoading: boolean;
  studentDetailHref?: (id: string) => string;
  canEdit?: boolean;
  parentUserId: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  const ids = summaries.map((s) => s._id);

  const detailQueries = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["academy-student", id],
      queryFn: () => getAcademyStudent(id),
      enabled: Boolean(id),
    })),
  });

  const studentsLoading = listLoading || detailQueries.some((q) => q.isLoading);
  const students = detailQueries
    .map((q) => q.data ?? null)
    .filter((s): s is AcademyStudent => Boolean(s));

  const unlinkMutation = useMutation({
    mutationFn: async (studentId: string) => {
      const next = ids.filter((id) => id !== studentId);
      await assignParentStudents(parentUserId, next);
    },
    onSuccess: () => {
      toast({ title: "Student unlinked" });
      void qc.invalidateQueries({ queryKey: ["parent-students", parentUserId] });
      void qc.invalidateQueries({ queryKey: ["users-module-list", "parents"] });
    },
    onError: (e: Error) => {
      toast({ title: "Unlink failed", description: e.message, variant: "destructive" });
    },
    onSettled: () => setUnlinkingId(null),
  });

  if (studentsLoading) {
    return (
      <p className="text-sm text-muted-foreground py-5 text-center border rounded-md bg-muted/20">
        Loading students…
      </p>
    );
  }

  if (summaries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-5 text-center border rounded-md bg-muted/20">
        No students linked to this parent.
        {canEdit ? " Use “Link student” to add one." : ""}
      </p>
    );
  }

  if (students.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-5 text-center border rounded-md bg-muted/20">
        Could not load student details.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto border rounded-md">
      <table className="w-full min-w-[56rem] text-sm">
        <thead className="bg-muted/50 border-b">
          <tr>
            <th className="p-3 text-left font-medium whitespace-nowrap">ID</th>
            <th className="p-3 text-left font-medium whitespace-nowrap">Student</th>
            <th className="p-3 text-left font-medium whitespace-nowrap">Father</th>
            <th className="p-3 text-left font-medium whitespace-nowrap">Phone</th>
            <th className="p-3 text-left font-medium whitespace-nowrap">Class</th>
            <th className="p-3 text-left font-medium whitespace-nowrap">Section</th>
            <th className="p-3 text-left font-medium whitespace-nowrap">Registered</th>
            <th className="p-3 text-left font-medium whitespace-nowrap">Monthly</th>
            <th className="p-3 text-left font-medium whitespace-nowrap">Payable</th>
            <th className="p-3 text-left font-medium whitespace-nowrap">Status</th>
            <th className="p-3 text-right font-medium whitespace-nowrap">Actions</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s) => {
            const isPending = s.status === "pending_fee";
            const sectionName = sectionNameOf(s);
            const payable = Math.max(
              0,
              (Number(s.monthlyFee) || 0) - (Number(s.monthlyFeeDiscount) || 0),
            );
            return (
              <tr key={s._id} className="border-b last:border-0 hover:bg-muted/20">
                <td className="p-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                  {studentRef(s)}
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <StudentAvatar student={s} />
                    {studentDetailHref ? (
                      <Link
                        to={studentDetailHref(s._id)}
                        className="font-medium text-foreground truncate hover:text-primary hover:underline"
                      >
                        {s.studentName}
                      </Link>
                    ) : (
                      <span className="font-medium text-foreground truncate">{s.studentName}</span>
                    )}
                  </div>
                </td>
                <td className="p-3 text-muted-foreground whitespace-nowrap">
                  {s.fatherName || "—"}
                </td>
                <td className="p-3 text-muted-foreground whitespace-nowrap">{s.phone || "—"}</td>
                <td className="p-3 whitespace-nowrap">{classLabel(s.classId)}</td>
                <td className="p-3">
                  {sectionName ? (
                    <span
                      className={cn(
                        "inline-flex min-w-[1.75rem] items-center justify-center rounded-md border px-2 py-0.5 text-xs font-semibold",
                        sectionBadgeClass(sectionName),
                      )}
                    >
                      {sectionName}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="p-3 text-muted-foreground whitespace-nowrap">
                  {formatDate(s.createdAt)}
                </td>
                <td className="p-3 whitespace-nowrap">
                  {isPending ? "—" : formatPkr(s.monthlyFee)}
                </td>
                <td className="p-3 whitespace-nowrap font-medium text-[#1a2b4b]">
                  {isPending ? "—" : formatPkr(payable)}
                </td>
                <td className="p-3">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize",
                      statusBadgeClass(s.status as AcademyStudentStatus),
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        statusDotClass(s.status as AcademyStudentStatus),
                      )}
                    />
                    {statusLabel(s.status)}
                  </span>
                </td>
                <td className="p-3">
                  <div className="flex justify-end gap-1">
                    {studentDetailHref && (
                      <Button variant="ghost" size="sm" className="h-8 gap-1" asChild>
                        <Link to={studentDetailHref(s._id)}>
                          Open
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    )}
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 text-destructive"
                        disabled={unlinkingId === s._id && unlinkMutation.isPending}
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Unlink ${s.studentName} from this parent? They can be linked again later.`,
                            )
                          ) {
                            return;
                          }
                          setUnlinkingId(s._id);
                          unlinkMutation.mutate(s._id);
                        }}
                      >
                        {unlinkingId === s._id && unlinkMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Unlink className="h-3.5 w-3.5" />
                        )}
                        Unlink
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PermissionsPanel({
  user,
  registry,
}: {
  user: StaffUser;
  registry: ModuleRegistryEntry[];
}) {
  const modulePerms = normalizeModulePermissions(user.modulePermissions);
  const moduleRows = Object.entries(modulePerms)
    .filter(([, actions]) => actions.length > 0)
    .sort(([a], [b]) => moduleLabel(a, registry).localeCompare(moduleLabel(b, registry)));

  const apiPerms = (user.permissions || []).filter((p) => p && (p.name || p.module));
  const apiByModule = new Map<string, PermissionDefinition[]>();
  apiPerms.forEach((p) => {
    const key = p.module || "other";
    const list = apiByModule.get(key) || [];
    list.push(p);
    apiByModule.set(key, list);
  });

  if (moduleRows.length === 0 && apiPerms.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-5 text-center border rounded-md bg-muted/20">
        No module or API permissions assigned to this account.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border p-4 space-y-3">
        <SectionTitle>
          <span className="inline-flex items-center gap-2">
            Module access
            <span className="text-xs font-normal text-muted-foreground tabular-nums">
              {moduleRows.length}
            </span>
          </span>
        </SectionTitle>
        {moduleRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No module permissions granted.</p>
        ) : (
          <div className="divide-y rounded-md border overflow-hidden">
            {moduleRows.map(([key, actions]) => (
              <div
                key={key}
                className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 bg-card"
              >
                <div className="sm:w-56 shrink-0 min-w-0">
                  <div className="text-sm font-medium text-primary truncate">
                    {moduleLabel(key, registry)}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">{key}</div>
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
      </section>

      {apiPerms.length > 0 && (
        <section className="rounded-lg border p-4 space-y-3">
          <SectionTitle>API permissions</SectionTitle>
          <div className="divide-y rounded-md border overflow-hidden">
            {[...apiByModule.entries()].map(([mod, perms]) => (
              <div key={mod} className="px-4 py-3 space-y-2 bg-card">
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
        </section>
      )}
    </div>
  );
}

const SCOPE_META: Record<
  UserFormScope,
  { title: string; listLabel: string; Icon: typeof Users }
> = {
  parents: { title: "Parent", listLabel: "Parents", Icon: Users },
  staff: { title: "Staff", listLabel: "Staff", Icon: UserCog },
  admins: { title: "Admin", listLabel: "Admins", Icon: Shield },
};

export default function UserDetailPage({
  userId,
  scope,
  caps,
}: {
  userId: string;
  scope: UserFormScope;
  caps: ModuleActionCaps;
}) {
  const { user: session } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const role = session?.role;
  const meta = SCOPE_META[scope];
  const listHref = role ? usersListHref(role, scope) : "#";
  const editHref = role ? userEditHref(role, userId, scope) : "#";
  const studentRoutes = role ? academyStudentRoutes(role, "registration") : null;
  const [showPassword, setShowPassword] = useState(false);
  const [linkStudentOpen, setLinkStudentOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const resetMutation = useMutation({
    mutationFn: () => bulkUsersAction("resetPassword", [userId], DEFAULT_PARENT_PASSWORD),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["users-module-list", scope] });
      setResetOpen(true);
      setShowResetPassword(false);
      toast({ title: "Password reset", description: "Parent can sign in with the new password." });
    },
    onError: (e: Error) => {
      toast({ title: "Reset failed", description: e.message, variant: "destructive" });
    },
  });

  const allowedTabs =
    scope === "parents"
      ? (["overview", "students", "access"] as const)
      : (["overview", "access"] as const);
  const tabFromUrl = searchParams.get("tab") || "";
  const activeTab = (allowedTabs as readonly string[]).includes(tabFromUrl)
    ? tabFromUrl
    : "overview";

  const setActiveTab = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users-module-list", scope],
    queryFn: () => fetchUsersByScope(scope),
  });
  const account = users.find((u) => u._id === userId);

  const { data: modules = [] } = useQuery({
    queryKey: ["moduleRegistry"],
    queryFn: fetchModuleRegistry,
  });

  const { data: linkedStudents = [], isLoading: studentsLoading } = useQuery({
    queryKey: ["parent-students", userId],
    queryFn: () => fetchParentStudents(userId),
    enabled: scope === "parents" && Boolean(userId),
  });

  if (scope === "staff") {
    return <StaffDetailPage staffId={userId} caps={caps} />;
  }

  if (isLoading) {
    return (
      <div className="w-full px-4 sm:px-6 lg:px-8 py-12 text-center text-muted-foreground">
        Loading account…
      </div>
    );
  }

  if (!account) {
    return (
      <div className="w-full px-4 sm:px-6 lg:px-8 py-12 space-y-4 text-center">
        <p className="text-sm text-muted-foreground">{meta.title} not found.</p>
        <Button variant="outline" asChild>
          <Link to={listHref}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to {meta.listLabel.toLowerCase()}
          </Link>
        </Button>
      </div>
    );
  }

  const imgSrc = account.profileImage ? resolveUploadUrl(account.profileImage) : undefined;
  const roleLabel = roleDisplayLabel(roleNameOf(account));
  const students = account.linkedStudents?.length ? account.linkedStudents : linkedStudents;
  const moduleCount = Object.values(normalizeModulePermissions(account.modulePermissions)).filter(
    (a) => a.length > 0,
  ).length;
  const HeaderIcon = meta.Icon;
  const pageHint = [
    roleLabel,
    account.email,
    account.isActive ? "Active" : "Inactive",
  ]
    .filter(Boolean)
    .join(" · ");

  const isParentScope = scope === "parents";

  if (isParentScope) {
    return (
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1a2b4b]">
              Parent Account Details
            </h1>
            <p className="mt-1 text-sm text-slate-500 max-w-xl">
              View and manage parent information, account status and module permissions.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              variant="outline"
              className="h-10 gap-2 border-primary/40 text-primary hover:bg-primary/5"
              asChild
            >
              <Link to={listHref}>
                <ArrowLeft className="h-4 w-4" />
                Back to Parents
              </Link>
            </Button>
            {caps.canEdit && (
              <Button className="h-10 gap-2" asChild>
                <Link to={editHref}>
                  <Pencil className="h-4 w-4" />
                  Edit Parent
                </Link>
              </Button>
            )}
            {caps.canEdit && (
              <Button
                variant="outline"
                className="h-10 gap-2 border-rose-300 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                disabled={resetMutation.isPending}
                onClick={() => {
                  if (
                    !window.confirm(
                      `Reset password for ${account.name} to ${DEFAULT_PARENT_PASSWORD}?`,
                    )
                  ) {
                    return;
                  }
                  resetMutation.mutate();
                }}
              >
                {resetMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Lock className="h-4 w-4" />
                )}
                Reset Password
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
          <div className="xl:col-span-7 rounded-2xl border-0 bg-white p-5 sm:p-6 shadow-sm ring-1 ring-black/[0.04]">
            <div className="flex flex-col sm:flex-row gap-5 sm:items-start">
              <div className="h-24 w-24 sm:h-28 sm:w-28 shrink-0 rounded-full overflow-hidden bg-slate-100 ring-4 ring-slate-50 flex items-center justify-center">
                {imgSrc ? (
                  <img src={imgSrc} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Users className="h-10 w-10 text-slate-400" />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1a2b4b] truncate">
                    {account.name}
                  </h2>
                  <span
                    className={cn(
                      "inline-flex text-xs font-semibold rounded-full px-2.5 py-0.5",
                      account.isActive
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-600",
                    )}
                  >
                    {account.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-4">
                  <div className="space-y-4">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <User className="h-4 w-4 mt-0.5 shrink-0 text-slate-400" />
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500">Parent ID</p>
                        <p className="text-sm font-semibold text-[#1a2b4b] tabular-nums">
                          {parentDisplayId(account._id)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5 min-w-0">
                      <Calendar className="h-4 w-4 mt-0.5 shrink-0 text-slate-400" />
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500">Joined on</p>
                        <p className="text-sm font-semibold text-[#1a2b4b]">
                          {fmtDate(account.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Mail className="h-4 w-4 mt-0.5 shrink-0 text-slate-400" />
                    <div className="min-w-0">
                      <p className="text-xs text-slate-500">Email</p>
                      <p className="text-sm font-medium text-primary break-all">
                        {account.email || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Phone className="h-4 w-4 mt-0.5 shrink-0 text-slate-400" />
                    <div className="min-w-0">
                      <p className="text-xs text-slate-500">Phone</p>
                      <p className="text-sm font-semibold text-[#1a2b4b]">
                        {account.phone || "—"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="xl:col-span-5 grid grid-cols-2 gap-3 sm:gap-4">
            <PanelStatCard
              label="Account Status"
              value={account.isActive ? "Active" : "Inactive"}
              hint={account.isActive ? "Can access the portal" : "Login disabled"}
              icon={account.isActive ? CheckCircle2 : UserX}
              iconWrapClass={account.isActive ? "bg-[#d1fae5]" : "bg-[#fee2e2]"}
              iconClass={account.isActive ? "text-[#059669]" : "text-[#dc2626]"}
            />
            <PanelStatCard
              label="Role"
              value="Parent"
              hint="Parent account"
              icon={User}
              iconWrapClass="bg-[#ede9fe]"
              iconClass="text-[#7c3aed]"
            />
            <button
              type="button"
              className="text-left rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              onClick={() => setActiveTab("students")}
            >
              <PanelStatCard
                label="Linked Students"
                value={studentsLoading ? "…" : students.length}
                hint="View linked children"
                hintClass="text-primary"
                icon={Users}
                iconWrapClass="bg-[#dbeafe]"
                iconClass="text-[#2563eb]"
              />
            </button>
            <PanelStatCard
              label="Last Login"
              value={account.lastLogin ? fmtDateTime(account.lastLogin) : "Never"}
              valueClass="text-base sm:text-lg leading-snug"
              hint={account.lastLogin ? "Most recent sign-in" : "Has not signed in yet"}
              icon={Clock}
              iconWrapClass="bg-[#ffedd5]"
              iconClass="text-[#ea580c]"
            />
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full flex flex-wrap h-auto gap-0.5 p-0.5 bg-muted/40">
            <TabsTrigger value="overview" className="gap-1.5">
              <User className="h-3.5 w-3.5" /> Overview
            </TabsTrigger>
            <TabsTrigger value="students" className="gap-1.5">
              <GraduationCap className="h-3.5 w-3.5" /> Students ({students.length})
            </TabsTrigger>
            <TabsTrigger value="access" className="gap-1.5">
              <KeyRound className="h-3.5 w-3.5" /> Access
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-3 focus-visible:outline-none space-y-4">
            <section className="rounded-2xl border-0 bg-white p-4 sm:p-5 shadow-sm ring-1 ring-black/[0.04] space-y-3">
              <SectionTitle>Portal credentials</SectionTitle>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
                <DetailRow
                  label="Portal password"
                  value={
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="inline-flex items-center gap-1.5 text-sm font-medium hover:text-primary"
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <EyeOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <Eye className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span>{showPassword ? DEFAULT_PARENT_PASSWORD : "••••••••"}</span>
                    </button>
                  }
                />
                <DetailRow label="Created" value={fmtDateTime(account.createdAt)} />
                <DetailRow label="Updated" value={fmtDateTime(account.updatedAt)} />
              </div>
            </section>
          </TabsContent>

          <TabsContent value="students" className="mt-3 focus-visible:outline-none space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-primary">
                Linked students
                <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">
                  ({students.length})
                </span>
              </h3>
              {caps.canEdit && (
                <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setLinkStudentOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  Link student
                </Button>
              )}
            </div>
            <ParentLinkedStudentsPanel
              summaries={students}
              listLoading={studentsLoading}
              parentUserId={userId}
              canEdit={caps.canEdit}
              studentDetailHref={studentRoutes ? (id) => studentRoutes.detail(id) : undefined}
            />
            <LinkStudentDialog
              open={linkStudentOpen}
              onOpenChange={setLinkStudentOpen}
              parentUserId={userId}
              alreadyLinkedIds={students.map((s) => s._id)}
            />
          </TabsContent>

          <TabsContent value="access" className="mt-3 focus-visible:outline-none">
            <PermissionsPanel user={account} registry={modules} />
          </TabsContent>
        </Tabs>

        <Dialog open={resetOpen} onOpenChange={setResetOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Password reset</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Password for <span className="font-medium text-foreground">{account.name}</span> was
                reset. Share this once with the parent:
              </p>
              <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                <p className="font-mono text-sm flex-1">
                  {showResetPassword ? DEFAULT_PARENT_PASSWORD : "••••••••"}
                </p>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => setShowResetPassword((v) => !v)}
                >
                  {showResetPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setResetOpen(false)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary overflow-hidden">
              {imgSrc ? (
                <img src={imgSrc} alt="" className="h-full w-full object-cover" />
              ) : (
                <HeaderIcon className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
              )}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight truncate">
                  {account.name}
                </h2>
                <ActiveBadge active={account.isActive} />
              </div>
              <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500 max-w-xl truncate">
                {pageHint}
              </p>
            </div>
          </div>
          <div className="shrink-0 rounded-lg bg-primary/10 px-3 py-2 max-w-[14rem]">
            <p className="text-xs sm:text-sm italic leading-snug text-[#1a2b4b]/80">
              <span className="mr-1 text-primary not-italic font-serif text-base leading-none">
                &ldquo;
              </span>
              Education is the key to a better tomorrow.
              <span className="ml-0.5 text-primary not-italic font-serif text-base leading-none">
                &rdquo;
              </span>
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <PanelStatCard
          label="Status"
          value={account.isActive ? "Active" : "Inactive"}
          hint={account.isActive ? "Portal can sign in" : "Login disabled"}
          icon={account.isActive ? CheckCircle2 : UserX}
          iconWrapClass={account.isActive ? "bg-[#d1fae5]" : "bg-[#fee2e2]"}
          iconClass={account.isActive ? "text-[#059669]" : "text-[#dc2626]"}
        />
        <PanelStatCard
          label="Role"
          value={roleLabel}
          hint={`${meta.title} account`}
          icon={Shield}
          iconWrapClass="bg-[#dbeafe]"
          iconClass="text-[#2563eb]"
        />
        <PanelStatCard
          label="Modules"
          value={moduleCount}
          hint="With access granted"
          icon={KeyRound}
          iconWrapClass="bg-[#ede9fe]"
          iconClass="text-[#7c3aed]"
        />
        <PanelStatCard
          label="Last login"
          value={account.lastLogin ? fmtDate(account.lastLogin) : "—"}
          hint={account.lastLogin ? "Most recent sign-in" : "Never signed in"}
          icon={Clock}
          iconWrapClass="bg-[#ffedd5]"
          iconClass="text-[#ea580c]"
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full flex flex-wrap h-auto gap-0.5 p-0.5 bg-muted/40">
          <TabsTrigger value="overview" className="gap-1.5">
            <User className="h-3.5 w-3.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="access" className="gap-1.5">
            <KeyRound className="h-3.5 w-3.5" /> Access
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-3 focus-visible:outline-none space-y-4">
          {imgSrc ? (
            <div className="flex items-center gap-4 rounded-lg border p-4">
              <img
                src={imgSrc}
                alt={account.name}
                className="h-24 w-24 rounded-full object-cover border"
              />
              <div>
                <p className="font-medium">{account.name}</p>
                <p className="text-sm text-muted-foreground">{roleLabel}</p>
              </div>
            </div>
          ) : null}

          <section className="rounded-lg border p-4 space-y-3">
            <SectionTitle>Contact</SectionTitle>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
              <DetailRow label="Full name" value={account.name} />
              <DetailRow label="Email" value={account.email || "—"} />
              <DetailRow label="Phone" value={account.phone || "—"} />
            </div>
          </section>

          <section className="rounded-lg border p-4 space-y-3">
            <SectionTitle>Account</SectionTitle>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
              <DetailRow label="Role" value={roleLabel} />
              <DetailRow label="Status" value={<ActiveBadge active={account.isActive} />} />
              <DetailRow label="Last login" value={fmtDateTime(account.lastLogin)} />
              <DetailRow label="Created" value={fmtDateTime(account.createdAt)} />
              <DetailRow label="Updated" value={fmtDateTime(account.updatedAt)} />
            </div>
          </section>
        </TabsContent>

        <TabsContent value="access" className="mt-3 focus-visible:outline-none">
          <PermissionsPanel user={account} registry={modules} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
