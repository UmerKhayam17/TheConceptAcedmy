import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
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
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { resolveUploadUrl } from "@/lib/api";
import type { ModuleActionCaps } from "@/lib/permissions";
import {
  assignParentStudents,
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
import {
  userEditHref,
  usersListHref,
  type UserFormScope,
} from "@/lib/userFormRoutes";
import { academyStudentRoutes } from "@/lib/studentManagementMenus";
import { fetchSessions, isSessionWritable } from "@/lib/configApi";
import {
  fetchAcademyClasses,
  fetchAcademyStudents,
  fetchSectionsByClass,
} from "@/lib/studentManagementApi";
import { classLabel } from "@/components/modules/student-management/studentDisplayUtils";
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

function moduleLabel(key: string, registry: ModuleRegistryEntry[]) {
  const found = registry.find((m) => m.key === key);
  if (found?.name) return found.name;
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        active
          ? "bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-400/30"
          : "bg-white/10 text-white/80 ring-1 ring-white/20",
      )}
    >
      <span
        className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-emerald-300" : "bg-white/50")}
      />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function SoftStatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        active
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15"
          : "bg-slate-100 text-slate-600 ring-1 ring-slate-500/10",
      )}
    >
      <span
        className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-emerald-500" : "bg-slate-400")}
      />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  icon: typeof Users;
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-lg font-semibold text-[#1a2b4b] tabular-nums truncate">{value}</p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1a2b4b]/[0.06] text-[#1a2b4b]">
          <Icon className="h-4 w-4" strokeWidth={2.25} />
        </span>
      </div>
    </div>
  );
}

function InfoField({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon?: typeof Mail }) {
  return (
    <div className="flex gap-3 min-w-0">
      {Icon ? (
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
          <Icon className="h-3.5 w-3.5" />
        </span>
      ) : null}
      <div className="min-w-0 space-y-0.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="text-sm font-medium text-slate-800 break-words">{value ?? "—"}</p>
      </div>
    </div>
  );
}

function StudentStatusPill({ status }: { status?: string }) {
  const label = status === "pending_fee" ? "Pending fee" : status?.replace(/_/g, " ") || "—";
  const colors: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
    pending_fee: "bg-amber-50 text-amber-800 ring-amber-600/15",
    inactive: "bg-slate-100 text-slate-600 ring-slate-500/10",
    suspended: "bg-rose-50 text-rose-700 ring-rose-600/15",
  };
  return (
    <span
      className={cn(
        "inline-flex capitalize text-[11px] font-semibold rounded-full px-2.5 py-0.5 ring-1",
        colors[status || ""] || "bg-slate-100 text-slate-600 ring-slate-500/10",
      )}
    >
      {label}
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

  if (listLoading) {
    return (
      <div className="rounded-xl border border-slate-200/80 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
        Loading students…
      </div>
    );
  }

  if (summaries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-12 text-center">
        <GraduationCap className="h-8 w-8 mx-auto text-slate-300 mb-2" />
        <p className="text-sm text-slate-500">No students linked to this parent.</p>
        {canEdit && (
          <p className="text-xs text-slate-400 mt-1">Use “Link student” above to add one.</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-500 bg-slate-50/70">
              <th className="px-5 py-2.5 font-medium">Student</th>
              <th className="px-4 py-2.5 font-medium">ID</th>
              <th className="px-4 py-2.5 font-medium">Class</th>
              <th className="px-4 py-2.5 font-medium">Section</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-5 py-2.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((s) => (
              <tr
                key={s._id}
                className="border-b border-slate-50 last:border-0 hover:bg-slate-50/80 transition-colors"
              >
                <td className="px-5 py-3.5">
                  {studentDetailHref ? (
                    <Link
                      to={studentDetailHref(s._id)}
                      className="font-medium text-[#1a2b4b] hover:text-sky-700 hover:underline"
                    >
                      {s.studentName}
                    </Link>
                  ) : (
                    <span className="font-medium text-slate-800">{s.studentName}</span>
                  )}
                </td>
                <td className="px-4 py-3.5 text-slate-600">{s.studentId || "—"}</td>
                <td className="px-4 py-3.5 text-slate-600">{s.className || "—"}</td>
                <td className="px-4 py-3.5 text-slate-600">{s.sectionName || "—"}</td>
                <td className="px-4 py-3.5">
                  <StudentStatusPill status={s.status} />
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex justify-end gap-1.5">
                    {studentDetailHref && (
                      <Button variant="outline" size="sm" className="h-8 gap-1" asChild>
                        <Link to={studentDetailHref(s._id)}>
                          Open
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    )}
                    {canEdit && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 text-destructive border-destructive/30 hover:bg-destructive/5"
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
            ))}
          </tbody>
        </table>
      </div>
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
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-10 text-center text-sm text-slate-500">
        No module or API permissions assigned to this account.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-[#1a2b4b]" />
          <h3 className="text-sm font-semibold text-[#1a2b4b]">Module access</h3>
          <span className="ml-auto text-xs text-slate-500 tabular-nums">{moduleRows.length}</span>
        </div>
        {moduleRows.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">No module permissions granted.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {moduleRows.map(([key, actions]) => (
              <div
                key={key}
                className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
              >
                <div className="sm:w-56 shrink-0 min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">
                    {moduleLabel(key, registry)}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono truncate">{key}</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {actions.map((action) => (
                    <span
                      key={action}
                      className="text-[11px] font-semibold rounded-md px-2 py-0.5 bg-[#1a2b4b]/[0.06] text-[#1a2b4b] capitalize"
                    >
                      {action}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {apiPerms.length > 0 && (
        <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-[#1a2b4b]">API permissions</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {[...apiByModule.entries()].map(([mod, perms]) => (
              <div key={mod} className="px-5 py-3.5 space-y-2">
                <div className="text-sm font-medium text-slate-800 capitalize">{mod}</div>
                <div className="flex flex-wrap gap-1.5">
                  {perms.map((p) => (
                    <span
                      key={p._id || p.name}
                      className="text-[11px] rounded-md px-2 py-0.5 bg-slate-100 text-slate-700"
                      title={p.description || p.name}
                    >
                      {p.name || `${p.module}:${p.action}`}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const SCOPE_META: Record<
  UserFormScope,
  { title: string; listLabel: string; Icon: typeof Users; accent: string }
> = {
  parents: {
    title: "Parent",
    listLabel: "Parents",
    Icon: Users,
    accent: "from-[#1a2b4b] via-[#243b66] to-[#2d4a7a]",
  },
  staff: {
    title: "Staff",
    listLabel: "Staff",
    Icon: UserCog,
    accent: "from-[#1a2b4b] via-[#243b66] to-[#2d4a7a]",
  },
  admins: {
    title: "Admin",
    listLabel: "Admins",
    Icon: Shield,
    accent: "from-[#1a2b4b] via-[#243b66] to-[#2d4a7a]",
  },
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
  const role = session?.role;
  const meta = SCOPE_META[scope];
  const listHref = role ? usersListHref(role, scope) : "#";
  const editHref = role ? userEditHref(role, userId, scope) : "#";
  const studentRoutes = role ? academyStudentRoutes(role, "registration") : null;
  const [showPassword, setShowPassword] = useState(false);
  const [linkStudentOpen, setLinkStudentOpen] = useState(false);

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
      <div className="px-4 sm:px-6 lg:px-8 py-10">
        <div className="h-40 rounded-2xl bg-slate-100 animate-pulse" />
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="px-6 py-10 space-y-3">
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
  const HeaderIcon = meta.Icon;
  const students = account.linkedStudents?.length ? account.linkedStudents : linkedStudents;
  const moduleCount = Object.values(normalizeModulePermissions(account.modulePermissions)).filter(
    (a) => a.length > 0,
  ).length;
  const initials = account.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-5 w-full">
      {/* Hero */}
      <div className="overflow-hidden rounded-2xl shadow-sm ring-1 ring-black/[0.04]">
        <div className={cn("relative bg-gradient-to-br px-5 py-6 sm:px-7 sm:py-7 text-white", meta.accent)}>
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 20%, white 0%, transparent 45%), radial-gradient(circle at 80% 0%, white 0%, transparent 35%)",
            }}
          />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                className="mt-1 shrink-0 h-9 w-9 text-white/90 hover:bg-white/10 hover:text-white"
                asChild
              >
                <Link to={listHref} aria-label={`Back to ${meta.listLabel}`}>
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>

              <div className="relative shrink-0">
                <div className="h-[4.5rem] w-[4.5rem] sm:h-20 sm:w-20 rounded-2xl overflow-hidden border-2 border-white/25 bg-white/10 shadow-lg backdrop-blur-sm">
                  {imgSrc ? (
                    <img src={imgSrc} alt="" className="h-full w-full object-cover" />
                  ) : initials ? (
                    <div className="flex h-full w-full items-center justify-center text-xl font-semibold tracking-wide text-white">
                      {initials}
                    </div>
                  ) : (
                    <User className="h-9 w-9 m-[1.35rem] text-white/70" />
                  )}
                </div>
                <span className="absolute -bottom-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[#1a2b4b] shadow-md">
                  <HeaderIcon className="h-3.5 w-3.5" strokeWidth={2.25} />
                </span>
              </div>

              <div className="min-w-0 pt-0.5">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/55">
                  {meta.title} profile
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2.5">
                  <h1 className="text-2xl font-bold tracking-tight truncate">{account.name}</h1>
                  <StatusBadge active={account.isActive} />
                </div>
                <p className="mt-1 text-sm text-white/70">{roleLabel}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-white/80">
                  {account.email && (
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      <Mail className="h-3.5 w-3.5 shrink-0 text-white/50" />
                      <span className="truncate">{account.email}</span>
                    </span>
                  )}
                  {account.phone && (
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 shrink-0 text-white/50" />
                      {account.phone}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {caps.canEdit && role && (
              <Button
                size="sm"
                className="shrink-0 gap-1.5 bg-white text-[#1a2b4b] hover:bg-white/90 shadow-sm"
                asChild
              >
                <Link to={editHref}>
                  <Pencil className="h-3.5 w-3.5" />
                  Edit {meta.title.toLowerCase()}
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Status" value={<SoftStatusBadge active={account.isActive} />} icon={Shield} />
        <StatTile label="Role" value={roleLabel} icon={HeaderIcon} />
        {scope === "parents" ? (
          <StatTile
            label="Linked students"
            value={studentsLoading ? "…" : students.length}
            icon={GraduationCap}
          />
        ) : (
          <StatTile label="Modules" value={moduleCount} icon={KeyRound} />
        )}
        <StatTile label="Last login" value={fmtDate(account.lastLogin)} icon={Clock} />
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="h-auto flex flex-wrap gap-1 bg-slate-100/80 p-1 rounded-xl">
          <TabsTrigger value="overview" className="rounded-lg data-[state=active]:shadow-sm gap-1.5">
            <User className="h-3.5 w-3.5" />
            Overview
          </TabsTrigger>
          {scope === "parents" && (
            <TabsTrigger value="students" className="rounded-lg data-[state=active]:shadow-sm gap-1.5">
              <GraduationCap className="h-3.5 w-3.5" />
              Students
              <span className="ml-0.5 text-[10px] font-semibold tabular-nums text-slate-500">
                {students.length}
              </span>
            </TabsTrigger>
          )}
          <TabsTrigger value="access" className="rounded-lg data-[state=active]:shadow-sm gap-1.5">
            <KeyRound className="h-3.5 w-3.5" />
            Access
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0 space-y-5">
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm space-y-5">
              <h3 className="text-sm font-semibold text-[#1a2b4b]">Contact</h3>
              <div className="space-y-4">
                <InfoField label="Full name" value={account.name} icon={User} />
                <InfoField label="Email" value={account.email || "—"} icon={Mail} />
                <InfoField label="Phone" value={account.phone || "—"} icon={Phone} />
                {scope === "parents" && (
                  <InfoField
                    label="Portal password"
                    icon={Lock}
                    value={
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="inline-flex items-center gap-1.5 font-mono text-sm font-medium text-slate-800 hover:text-[#1a2b4b]"
                        title={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? (
                          <EyeOff className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        ) : (
                          <Eye className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        )}
                        <span>{showPassword ? DEFAULT_PARENT_PASSWORD : "••••••••"}</span>
                      </button>
                    }
                  />
                )}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm space-y-5">
              <h3 className="text-sm font-semibold text-[#1a2b4b]">Account</h3>
              <div className="space-y-4">
                <InfoField label="Role" value={roleLabel} icon={Shield} />
                <InfoField
                  label="Status"
                  value={<SoftStatusBadge active={account.isActive} />}
                  icon={Shield}
                />
                <InfoField label="Last login" value={fmtDateTime(account.lastLogin)} icon={Clock} />
                <InfoField label="Created" value={fmtDateTime(account.createdAt)} icon={Calendar} />
                <InfoField label="Updated" value={fmtDateTime(account.updatedAt)} icon={Calendar} />
              </div>
            </div>
          </div>
        </TabsContent>

        {scope === "parents" && (
          <TabsContent value="students" className="mt-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-[#1a2b4b]" />
                <h3 className="text-sm font-semibold text-[#1a2b4b]">Linked students</h3>
                <span className="text-xs font-medium text-slate-500 tabular-nums">
                  {students.length} student{students.length === 1 ? "" : "s"}
                </span>
              </div>
              {caps.canEdit && (
                <Button
                  size="sm"
                  className="gap-1.5 shrink-0"
                  onClick={() => setLinkStudentOpen(true)}
                >
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
        )}

        <TabsContent value="access" className="mt-0">
          <PermissionsPanel user={account} registry={modules} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
