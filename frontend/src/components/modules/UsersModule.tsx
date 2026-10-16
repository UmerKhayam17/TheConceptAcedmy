import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Percent,
  Plus,
  Pencil,
  Shield,
  UserCheck,
  UserCog,
  UserX,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Trash2,
  Users,
  UserRound,
  X,
} from "lucide-react";
import { ModuleActionCaps, PermLevel } from "@/lib/permissions";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import PanelStatCard from "@/components/modules/PanelStatCard";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import { tableColumns, type UserFieldKey } from "@/lib/userSchemaFields";
import {
  fetchUsersByScope,
  deleteStaffUser,
  updateStaffUser,
  bulkUsersAction,
  roleDisplayLabel,
  type BulkUserAction,
  type BulkUsersResult,
  type RoleOption,
  type LinkedStudentSummary,
  type StaffUser,
} from "@/lib/staffApi";
import { useStaffRealtime } from "@/hooks/useStaffSocket";
import { usePanelListSearch } from "@/hooks/usePanelListSearch";
import {
  fetchAcademyClasses,
  fetchAcademySectionsBySession,
  provisionParentPortals,
  type AcademyClass,
  type AcademySectionWithClass,
  type ParentPortalProvisionResult,
} from "@/lib/studentManagementApi";
import { resolveUploadUrl } from "@/lib/api";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SquareCheckbox } from "@/components/ui/square-checkbox";
import PageSizeSelect from "@/components/modules/student-management/PageSizeSelect";
import ClassProgramSelect from "@/components/modules/ClassProgramSelect";
import {
  userCreateHref,
  userDetailHref,
  userEditHref,
  type UserFormScope,
} from "@/lib/userFormRoutes";
import { cn } from "@/lib/utils";

function pageWindow(current: number, totalPages: number, max = 5): number[] {
  if (totalPages <= max) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const half = Math.floor(max / 2);
  let start = Math.max(1, current - half);
  let end = start + max - 1;
  if (end > totalPages) {
    end = totalPages;
    start = Math.max(1, end - max + 1);
  }
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

const filterSelectClass =
  "h-10 rounded-md border border-input bg-background px-3 text-sm shrink-0";

const DEFAULT_PARENT_PASSWORD = "Concept@1234";

const AVATAR_TONES = [
  "bg-[#EEF5FF] text-[#1769E0]",
  "bg-[#FFF4E6] text-[#C27803]",
  "bg-[#F3EEFF] text-[#7C3AED]",
  "bg-[#ECFDF5] text-[#059669]",
  "bg-[#FFE8EE] text-[#E11D48]",
];

function roleNameOf(user: StaffUser): string {
  const r = user.role;
  if (r && typeof r === "object" && "name" in r) return String((r as RoleOption).name).toLowerCase();
  if (typeof r === "string") return r.toLowerCase();
  return "";
}

function humanizeModuleKey(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()).trim();
}

function isParentUser(user: StaffUser): boolean {
  return roleNameOf(user) === "parent";
}

function initialOf(name: string): string {
  const t = String(name || "").trim();
  return t ? t.charAt(0).toUpperCase() : "?";
}

function avatarTone(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h + name.charCodeAt(i) * (i + 1)) % AVATAR_TONES.length;
  return AVATAR_TONES[h] || AVATAR_TONES[0];
}

function UserAvatar({ user }: { user: StaffUser }) {
  const imgSrc = user.profileImage ? resolveUploadUrl(user.profileImage) : null;
  if (imgSrc) {
    return (
      <img
        src={imgSrc}
        alt=""
        className="h-8 w-8 shrink-0 rounded-md border border-border object-cover"
      />
    );
  }
  return (
    <span
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-semibold",
        avatarTone(user.name || ""),
      )}
    >
      {initialOf(user.name)}
    </span>
  );
}

function NameCell({ user }: { user: StaffUser }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <UserAvatar user={user} />
      <span className="truncate font-medium text-foreground">{user.name}</span>
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        active
          ? "border-emerald-200/80 bg-emerald-500/10 text-emerald-700"
          : "border-border bg-muted text-muted-foreground",
      )}
    >
      <span
        className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-emerald-600" : "bg-muted-foreground")}
        aria-hidden
      />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function ModulesCell({ user }: { user: StaffUser }) {
  const mods =
    user.modulePermissions && typeof user.modulePermissions === "object"
      ? Object.keys(user.modulePermissions)
      : [];
  if (!mods.length) return <span className="text-muted-foreground">—</span>;
  const show = mods.slice(0, 2);
  const more = mods.length - show.length;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {show.map((m) => (
        <span
          key={m}
          className="inline-flex rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium capitalize text-foreground"
        >
          {humanizeModuleKey(m).split(" ")[0]}
        </span>
      ))}
      {more > 0 ? (
        <span className="text-xs text-muted-foreground">+{more}</span>
      ) : null}
    </div>
  );
}

function PasswordCell({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex items-center gap-1.5 text-left font-mono text-xs tracking-wide text-muted-foreground hover:text-foreground"
      title={visible ? "Hide password" : "Show password"}
    >
      {visible ? <EyeOff className="h-3.5 w-3.5 shrink-0" /> : <Eye className="h-3.5 w-3.5 shrink-0" />}
      <span>{visible ? DEFAULT_PARENT_PASSWORD : "••••••••"}</span>
    </button>
  );
}

function sectionBadgeClass(name: string) {
  const letter = name.trim().charAt(0).toUpperCase();
  if (letter === "A") return "bg-sky-100 text-sky-800 border-sky-200";
  if (letter === "B") return "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200";
  if (letter === "C") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (letter === "D") return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function LinkedStudentsCell({ user }: { user: StaffUser }) {
  if (!isParentUser(user)) return <span className="text-muted-foreground">—</span>;
  const students = user.linkedStudents ?? [];
  if (students.length === 0) {
    return <span className="text-xs text-muted-foreground">No children linked</span>;
  }
  return (
    <div className="flex min-w-[8rem] flex-col gap-1">
      {students.map((s: LinkedStudentSummary) => (
        <div key={s._id} className="text-xs leading-snug">
          <span className="font-medium text-foreground">{s.studentName}</span>
          {s.studentId ? <span className="text-muted-foreground"> ({s.studentId})</span> : null}
        </div>
      ))}
    </div>
  );
}

function ParentClassesCell({ user }: { user: StaffUser }) {
  const classes = [
    ...new Set(
      (user.linkedStudents ?? [])
        .map((s) => String(s.className || "").trim())
        .filter(Boolean),
    ),
  ];
  if (!classes.length) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col gap-1">
      {classes.map((c) => (
        <span key={c} className="whitespace-nowrap text-foreground">
          {c}
        </span>
      ))}
    </div>
  );
}

function ParentSectionsCell({ user }: { user: StaffUser }) {
  const sections = [
    ...new Set(
      (user.linkedStudents ?? [])
        .map((s) => String(s.sectionName || "").trim())
        .filter(Boolean),
    ),
  ];
  if (!sections.length) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {sections.map((sec) => (
        <span
          key={sec}
          className={cn(
            "inline-flex min-w-[1.75rem] items-center justify-center rounded-md border px-2 py-0.5 text-xs font-semibold",
            sectionBadgeClass(sec),
          )}
        >
          {sec}
        </span>
      ))}
    </div>
  );
}

function PayTypeBadge({ user }: { user: StaffUser }) {
  const pct = user.payType === "percentage";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        pct
          ? "border-orange-200 bg-orange-100 text-orange-800"
          : "border-sky-200 bg-sky-100 text-sky-800",
      )}
    >
      {pct ? "Percentage" : "Fixed"}
    </span>
  );
}

function formatTableCell(user: StaffUser, key: UserFieldKey): React.ReactNode {
  if (key === "name") return <NameCell user={user} />;
  if (key === "email") {
    return (
      <span className="block max-w-[14rem] truncate text-muted-foreground" title={user.email}>
        {user.email}
      </span>
    );
  }
  if (key === "phone") {
    return <span className="whitespace-nowrap text-muted-foreground">{user.phone || "—"}</span>;
  }
  if (key === "role") {
    const name = roleNameOf(user);
    return (
      <span className="whitespace-nowrap text-foreground">
        {name ? roleDisplayLabel(name) : "—"}
      </span>
    );
  }
  if (key === "isActive") return <StatusBadge active={Boolean(user.isActive)} />;
  if (key === "payType") return <PayTypeBadge user={user} />;
  if (key === "salary") {
    const n = Number(user.salary ?? 0);
    return `₨ ${n.toLocaleString()}`;
  }
  if (key === "salaryPercentage") {
    return `${Number(user.salaryPercentage ?? 0)}%`;
  }
  const v = user[key as keyof StaffUser];
  if (v === undefined || v === null) return "—";
  return String(v);
}

const STAFF_QUERY = ["users-module-list"] as const;

const UsersModule = ({
  perm: _perm,
  caps,
  scope = "parents",
}: {
  perm: PermLevel;
  caps: ModuleActionCaps;
  scope?: UserFormScope;
}) => {
  const anyWrite = caps.canCreate || caps.canEdit || caps.canDelete;
  const { toast } = useToast();
  const { user: session } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const role = session?.role;
  useStaffRealtime(anyWrite);

  const { data: staff = [], isLoading: staffLoading } = useQuery<StaffUser[]>({
    queryKey: [...STAFF_QUERY, scope],
    queryFn: () => fetchUsersByScope(scope),
  });

  const [provisionOpen, setProvisionOpen] = useState(false);
  const [provisionResult, setProvisionResult] = useState<ParentPortalProvisionResult | null>(null);
  const [showProvisionPasswords, setShowProvisionPasswords] = useState(true);

  const provisionMutation = useMutation({
    mutationFn: async () => {
      if (!caps.canCreate) throw new Error("You do not have permission to create parent portals.");
      return provisionParentPortals();
    },
    onSuccess: (data) => {
      setProvisionResult(data);
      setProvisionOpen(true);
      setShowProvisionPasswords(true);
      void qc.invalidateQueries({ queryKey: STAFF_QUERY });
      toast({
        title: "Parent portals ready",
        description: `${data.createdCount} created, ${data.updatedCount} updated (${data.total} students).`,
      });
    },
    onError: (e: Error) => {
      toast({ title: "Provision failed", description: e.message, variant: "destructive" });
    },
  });

  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive">("");
  const [payTypeFilter, setPayTypeFilter] = useState<"" | "fixed" | "percentage">("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [page, setPage] = useState(1);
  /** Default 50 rows per page (same as student management). */
  const [pageSize, setPageSize] = useState(50);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [revealedPasswords, setRevealedPasswords] = useState<Set<string>>(() => new Set());
  const [bulkResetResult, setBulkResetResult] = useState<BulkUsersResult | null>(null);
  const [showBulkResetPassword, setShowBulkResetPassword] = useState(true);

  const isParentsScope = scope === "parents";

  const { data: academyClasses = [] } = useQuery<AcademyClass[]>({
    queryKey: ["academy-classes", "parents-filter"],
    queryFn: () => fetchAcademyClasses({ status: "active" }),
    enabled: isParentsScope,
  });

  const { data: academySections = [] } = useQuery<AcademySectionWithClass[]>({
    queryKey: ["academy-sections", "parents-filter", classFilter],
    queryFn: async () => {
      const all = await fetchAcademySectionsBySession(undefined, { status: "active" });
      if (!classFilter) return all;
      return all.filter((s) => {
        const cid = typeof s.classId === "object" ? s.classId?._id : s.classId;
        return String(cid) === classFilter;
      });
    },
    enabled: isParentsScope,
  });

  const { search, setSearch, filtered: searchFiltered } = usePanelListSearch(staff, (u) => [
    u.name,
    u.email,
    u.phone,
    typeof u.role === "object" && u.role
      ? (u.role as RoleOption).name
      : typeof u.role === "string"
        ? u.role
        : "",
    u.isActive ? "active" : "inactive",
    u.payType === "percentage" ? "percentage" : "fixed",
    ...(u.modulePermissions && typeof u.modulePermissions === "object"
      ? Object.keys(u.modulePermissions)
      : []),
    ...(u.linkedStudents ?? []).flatMap((s) => [
      s.studentName,
      s.studentId,
      s.className ?? "",
      s.sectionName ?? "",
    ]),
  ]);

  const roleOptions = useMemo(() => {
    const names = new Set<string>();
    for (const u of staff) {
      const n = roleNameOf(u);
      if (n) names.add(n);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [staff]);

  const moduleOptions = useMemo(() => {
    const keys = new Set<string>();
    for (const u of staff) {
      if (u.modulePermissions && typeof u.modulePermissions === "object") {
        Object.keys(u.modulePermissions).forEach((k) => keys.add(k));
      }
    }
    return Array.from(keys).sort((a, b) => a.localeCompare(b));
  }, [staff]);

  const staffFiltered = useMemo(() => {
    return searchFiltered.filter((u) => {
      if (roleFilter && roleNameOf(u) !== roleFilter) return false;
      if (statusFilter === "active" && !u.isActive) return false;
      if (statusFilter === "inactive" && u.isActive) return false;
      if (payTypeFilter) {
        const pay = u.payType === "percentage" ? "percentage" : "fixed";
        if (pay !== payTypeFilter) return false;
      }
      if (moduleFilter) {
        const mods =
          u.modulePermissions && typeof u.modulePermissions === "object"
            ? u.modulePermissions
            : null;
        if (!mods || !(moduleFilter in mods)) return false;
      }
      // Class/section filters are parents-only (linked students).
      if (isParentsScope && (classFilter || sectionFilter)) {
        const linked = u.linkedStudents ?? [];
        const match = linked.some((s) => {
          if (classFilter && String(s.classId || "") !== classFilter) return false;
          if (sectionFilter && String(s.sectionId || "") !== sectionFilter) return false;
          return true;
        });
        if (!match) return false;
      }
      return true;
    });
  }, [
    searchFiltered,
    isParentsScope,
    roleFilter,
    statusFilter,
    payTypeFilter,
    moduleFilter,
    classFilter,
    sectionFilter,
  ]);

  const filtersActive =
    Boolean(roleFilter) ||
    Boolean(statusFilter) ||
    Boolean(payTypeFilter) ||
    Boolean(moduleFilter) ||
    (isParentsScope && (Boolean(classFilter) || Boolean(sectionFilter))) ||
    Boolean(search.trim());

  const clearFilters = () => {
    setRoleFilter("");
    setStatusFilter("");
    setPayTypeFilter("");
    setModuleFilter("");
    setClassFilter("");
    setSectionFilter("");
    setSearch("");
    setPage(1);
  };

  // Switching Parents ↔ Staff ↔ Admins reuses this component — reset filters.
  useEffect(() => {
    setRoleFilter("");
    setStatusFilter("");
    setPayTypeFilter("");
    setModuleFilter("");
    setClassFilter("");
    setSectionFilter("");
    setSearch("");
    setPage(1);
    setSelectedIds(new Set());
    setRevealedPasswords(new Set());
  }, [scope, setSearch]);

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [
    roleFilter,
    statusFilter,
    payTypeFilter,
    moduleFilter,
    classFilter,
    sectionFilter,
    search,
    pageSize,
  ]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => {
      if (!caps.canDelete) throw new Error("Not allowed.");
      return deleteStaffUser(id);
    },
    onSuccess: () => {
      toast({ title: "User deleted" });
      void qc.invalidateQueries({ queryKey: STAFF_QUERY });
    },
    onError: (e: Error) => {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      if (!caps.canEdit) throw new Error("Not allowed.");
      return updateStaffUser(id, { isActive });
    },
    onSuccess: (_data, vars) => {
      toast({ title: vars.isActive ? "Account activated" : "Account deactivated" });
      void qc.invalidateQueries({ queryKey: STAFF_QUERY });
    },
    onError: (e: Error) => {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    },
  });

  const selectedCount = selectedIds.size;
  const selectedIdList = useMemo(() => Array.from(selectedIds), [selectedIds]);

  const bulkMutation = useMutation({
    mutationFn: async ({
      action,
      password,
    }: {
      action: BulkUserAction;
      password?: string;
    }) => {
      if (action === "delete" && !caps.canDelete) {
        throw new Error("You do not have permission to delete accounts.");
      }
      if (action !== "delete" && !caps.canEdit) {
        throw new Error("You do not have permission to update accounts.");
      }
      if (!selectedIdList.length) throw new Error("Select at least one account.");
      return bulkUsersAction(action, selectedIdList, password);
    },
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: STAFF_QUERY });
      setSelectedIds(new Set());
      const failHint =
        data.failed.length > 0
          ? ` · ${data.failed.length} skipped (${data.failed[0]?.reason || "error"})`
          : "";
      if (data.action === "resetPassword") {
        setBulkResetResult(data);
        setShowBulkResetPassword(true);
        toast({
          title: "Passwords reset",
          description: `${data.processed} account(s) updated${failHint}`,
        });
        return;
      }
      const titles: Record<Exclude<BulkUserAction, "resetPassword">, string> = {
        activate: "Accounts activated",
        deactivate: "Accounts deactivated",
        delete: "Accounts deleted",
      };
      toast({
        title: titles[data.action],
        description: `${data.processed} account(s)${failHint}`,
      });
    },
    onError: (e: Error) => {
      toast({ title: "Bulk action failed", description: e.message, variant: "destructive" });
    },
  });

  const runBulk = (action: BulkUserAction) => {
    const labels: Record<BulkUserAction, string> = {
      activate: `Activate ${selectedCount} selected account(s)?`,
      deactivate: `Deactivate ${selectedCount} selected account(s)?`,
      delete: `Permanently delete ${selectedCount} selected account(s)? This cannot be undone.`,
      resetPassword: `Reset password for ${selectedCount} selected account(s) to ${DEFAULT_PARENT_PASSWORD}?`,
    };
    if (!window.confirm(labels[action])) return;
    bulkMutation.mutate({
      action,
      password: action === "resetPassword" ? DEFAULT_PARENT_PASSWORD : undefined,
    });
  };

  const isStaffScope = scope === "staff";
  const isAdminsScope = scope === "admins";
  // Pay / salary columns only apply to teachers & accountants.
  const cols = tableColumns().filter((c) => {
    if (c.key === "payType" || c.key === "salary" || c.key === "salaryPercentage") {
      return isStaffScope;
    }
    return true;
  });
  const showLinkedStudents = isParentsScope;
  const showClassSectionCols = isParentsScope;
  const showParentPasswordCol = isParentsScope;
  const showPayTypeFilter = isStaffScope;
  const showRoleFilter = isStaffScope;
  const showActions = caps.canView || caps.canEdit || caps.canDelete;
  // checkbox + data cols + modules (+ linked/class/section/password/actions when shown)
  const tableColSpan =
    cols.length +
    2 +
    (showLinkedStudents ? 1 : 0) +
    (showClassSectionCols ? 2 : 0) +
    (showParentPasswordCol ? 1 : 0) +
    (showActions ? 1 : 0);

  const totalFiltered = staffFiltered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize) || 1);
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return staffFiltered.slice(start, start + pageSize);
  }, [staffFiltered, safePage, pageSize]);
  const pageIds = useMemo(() => pageRows.map((u) => u._id), [pageRows]);
  const allSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const someSelected = pageIds.some((id) => selectedIds.has(id));
  const showingFrom = totalFiltered > 0 ? (safePage - 1) * pageSize + 1 : 0;
  const showingTo = Math.min(safePage * pageSize, totalFiltered);
  const pages = pageWindow(safePage, totalPages);
  const entityPlural =
    isStaffScope ? "staff" : isAdminsScope ? "admins" : "parents";

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) pageIds.forEach((id) => next.add(id));
      else pageIds.forEach((id) => next.delete(id));
      return next;
    });
  };

  const toggleSelectOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const togglePassword = (id: string) => {
    setRevealedPasswords((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const stats = useMemo(() => {
    const total = staff.length;
    const active = staff.filter((u) => u.isActive).length;
    const activePct = total ? Math.round((active / total) * 100) : 0;
    const teachers = staff.filter((u) => roleNameOf(u) === "teacher").length;
    const percentage = staff.filter((u) => u.payType === "percentage").length;
    return { total, active, activePct, teachers, percentage };
  }, [staff]);

  const pageTitle = isStaffScope ? "Staff" : isAdminsScope ? "Admins" : "Parents";
  const pageHint = isStaffScope
    ? "Manage teachers, accountants, pay type, and module access."
    : isAdminsScope
      ? "Manage administration accounts and access."
      : "Manage parent portal accounts and linked students.";
  const HeaderIcon = isStaffScope ? UserCog : isAdminsScope ? Shield : Users;
  const entityLabel = isStaffScope ? "staff" : isAdminsScope ? "admins" : "parents";
  const addButtonLabel = isStaffScope ? "Add staff" : isAdminsScope ? "Add admin" : "Add parent";

  const goCreate = () => {
    if (!caps.canCreate || !role) return;
    navigate(userCreateHref(role, scope));
  };

  const goEdit = (u: StaffUser) => {
    if (!caps.canEdit || !role) return;
    navigate(userEditHref(role, u._id, scope));
  };

  const goView = (u: StaffUser) => {
    if (!role) return;
    navigate(userDetailHref(role, u._id, scope));
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
              <HeaderIcon className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight">
                {pageTitle}
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500 max-w-md">
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
        {isStaffScope ? (
          <>
            <PanelStatCard
              label="Total Staff"
              value={staffLoading ? "…" : stats.total}
              hint="Teachers & accountants"
              icon={UserCog}
              iconWrapClass="bg-[#dbeafe]"
              iconClass="text-[#2563eb]"
            />
            <PanelStatCard
              label="Active"
              value={staffLoading ? "…" : stats.active}
              hint={staffLoading ? undefined : `${stats.activePct}%`}
              icon={CheckCircle2}
              iconWrapClass="bg-[#d1fae5]"
              iconClass="text-[#059669]"
            />
            <PanelStatCard
              label="Teachers"
              value={staffLoading ? "…" : stats.teachers}
              hint="Teaching staff"
              icon={Users}
              iconWrapClass="bg-[#ede9fe]"
              iconClass="text-[#7c3aed]"
            />
            <PanelStatCard
              label="Percentage pay"
              value={staffLoading ? "…" : stats.percentage}
              hint="Tuition-share payroll"
              icon={Percent}
              iconWrapClass="bg-[#ffedd5]"
              iconClass="text-[#ea580c]"
            />
          </>
        ) : isAdminsScope ? (
          <>
            <PanelStatCard
              label="Total Admins"
              value={staffLoading ? "…" : stats.total}
              hint="Administration accounts"
              icon={Shield}
              iconWrapClass="bg-[#dbeafe]"
              iconClass="text-[#2563eb]"
            />
            <PanelStatCard
              label="Active"
              value={staffLoading ? "…" : stats.active}
              hint={staffLoading ? undefined : `${stats.activePct}%`}
              icon={CheckCircle2}
              iconWrapClass="bg-[#d1fae5]"
              iconClass="text-[#059669]"
            />
            <PanelStatCard
              label="Inactive"
              value={staffLoading ? "…" : stats.total - stats.active}
              hint="Disabled accounts"
              icon={UserX}
              iconWrapClass="bg-[#fee2e2]"
              iconClass="text-[#dc2626]"
            />
            <PanelStatCard
              label="Custom access"
              value={
                staffLoading
                  ? "…"
                  : staff.filter(
                      (u) =>
                        u.modulePermissions &&
                        typeof u.modulePermissions === "object" &&
                        Object.keys(u.modulePermissions).length > 0,
                    ).length
              }
              hint="Admins with module matrix set"
              icon={KeyRound}
              iconWrapClass="bg-[#ffedd5]"
              iconClass="text-[#ea580c]"
            />
          </>
        ) : (
          <>
            <PanelStatCard
              label="Total Parents"
              value={staffLoading ? "…" : stats.total}
              hint="Parent portal accounts"
              icon={UserRound}
              iconWrapClass="bg-[#dbeafe]"
              iconClass="text-[#2563eb]"
            />
            <PanelStatCard
              label="Active"
              value={staffLoading ? "…" : stats.active}
              hint={staffLoading ? undefined : `${stats.activePct}%`}
              icon={CheckCircle2}
              iconWrapClass="bg-[#d1fae5]"
              iconClass="text-[#059669]"
            />
            <PanelStatCard
              label="Inactive"
              value={staffLoading ? "…" : stats.total - stats.active}
              hint="Disabled portals"
              icon={UserX}
              iconWrapClass="bg-[#fee2e2]"
              iconClass="text-[#dc2626]"
            />
            <PanelStatCard
              label="With students"
              value={
                staffLoading
                  ? "…"
                  : staff.filter((u) => (u.linkedStudents?.length ?? 0) > 0).length
              }
              hint="Linked to at least one student"
              icon={Users}
              iconWrapClass="bg-[#ede9fe]"
              iconClass="text-[#7c3aed]"
            />
          </>
        )}
      </div>

      <Card className="p-3 sm:p-4 shadow-sm border-border/80">
        <div className="flex flex-wrap items-center gap-2">
          {isParentsScope ? (
            <>
              <ClassProgramSelect
                className="w-[16.5rem] shrink-0"
                label={false}
                value={classFilter}
                onChange={(v) => {
                  setClassFilter(v);
                  setSectionFilter("");
                  setPage(1);
                }}
                classes={academyClasses}
                allowAll
                selectClassName="rounded-md border-input h-10"
              />
              <select
                className="h-10 w-[10rem] shrink-0 rounded-md border border-input bg-background px-3 text-sm"
                value={sectionFilter}
                onChange={(e) => {
                  setSectionFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Section filter"
                disabled={academySections.length === 0}
              >
                <option value="">All Sections</option>
                {academySections.map((sec) => (
                  <option key={sec._id} value={sec._id}>
                    {sec.sectionName}
                    {!classFilter && sec.className ? ` · ${sec.className}` : ""}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          {showRoleFilter ? (
            <select
              className={`${filterSelectClass} w-[9.5rem]`}
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              aria-label="Role filter"
            >
              <option value="">All roles</option>
              {roleOptions.map((name) => (
                <option key={name} value={name}>
                  {roleDisplayLabel(name)}
                </option>
              ))}
            </select>
          ) : null}
          <select
            className={`${filterSelectClass} w-[10rem]`}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | "active" | "inactive")}
            aria-label="Status filter"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          {showPayTypeFilter ? (
            <select
              className={`${filterSelectClass} w-[10rem]`}
              value={payTypeFilter}
              onChange={(e) => setPayTypeFilter(e.target.value as "" | "fixed" | "percentage")}
              aria-label="Pay type filter"
            >
              <option value="">All pay types</option>
              <option value="fixed">Fixed</option>
              <option value="percentage">Percentage</option>
            </select>
          ) : null}
          <select
            className={`${filterSelectClass} w-[11rem]`}
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            aria-label="Module filter"
          >
            <option value="">All modules</option>
            {moduleOptions.map((key) => (
              <option key={key} value={key}>
                {humanizeModuleKey(key)}
              </option>
            ))}
          </select>
          <PanelSearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search name, email, phone…"
            className="min-w-[12rem] flex-1 max-w-md"
          />
          <div className="flex flex-wrap items-center gap-2 shrink-0 ml-auto">
            {filtersActive ? (
              <Button
                type="button"
                variant="ghost"
                className="h-10 gap-1.5 text-muted-foreground"
                onClick={clearFilters}
              >
                <X className="h-4 w-4" />
                Clear
              </Button>
            ) : null}
            {caps.canCreate && isParentsScope && (
              <Button
                variant="outline"
                className="h-10 gap-2"
                disabled={provisionMutation.isPending}
                onClick={() => {
                  if (
                    !window.confirm(
                      "Create or reset parent portal email and password (Concept@1234) for every active student?",
                    )
                  ) {
                    return;
                  }
                  provisionMutation.mutate();
                }}
              >
                {provisionMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                Create parent emails & passwords
              </Button>
            )}
            {caps.canCreate && (
              <Button className="h-10 gap-2" onClick={goCreate}>
                <Plus className="h-4 w-4" /> {addButtonLabel}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {selectedCount > 0 && (
        <Card className="border-border/80 p-3 shadow-sm sm:px-4 sm:py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-[#1a2b4b]">{selectedCount}</span>
              {" selected"}
              {bulkMutation.isPending ? (
                <span className="ml-2 inline-flex items-center gap-1.5 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Working…
                </span>
              ) : null}
            </p>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {caps.canEdit && (
                <>
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 gap-1.5"
                    disabled={bulkMutation.isPending}
                    onClick={() => runBulk("activate")}
                  >
                    <UserCheck className="h-4 w-4" />
                    Activate
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 border-border"
                    disabled={bulkMutation.isPending}
                    onClick={() => runBulk("deactivate")}
                  >
                    <UserX className="h-4 w-4" />
                    Deactivate
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 border-border"
                    disabled={bulkMutation.isPending}
                    onClick={() => runBulk("resetPassword")}
                  >
                    <KeyRound className="h-4 w-4" />
                    Reset password
                  </Button>
                </>
              )}
              {caps.canDelete && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
                  disabled={bulkMutation.isPending}
                  onClick={() => runBulk("delete")}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 gap-1.5 text-muted-foreground"
                disabled={bulkMutation.isPending}
                onClick={() => setSelectedIds(new Set())}
              >
                <X className="h-4 w-4" />
                Clear
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden border-border/80 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="w-10 p-3 text-center">
                  <SquareCheckbox
                    checked={allSelected}
                    indeterminate={!allSelected && someSelected}
                    onChange={() => toggleSelectAll(!allSelected)}
                    aria-label="Select all"
                  />
                </th>
                {cols.map((c) => (
                  <th key={c.key} className="p-3 text-left font-medium whitespace-nowrap">
                    {c.label}
                  </th>
                ))}
                {showLinkedStudents && (
                  <th className="min-w-[10rem] p-3 text-left font-medium whitespace-nowrap">
                    Linked students
                  </th>
                )}
                {showClassSectionCols && (
                  <>
                    <th className="p-3 text-left font-medium whitespace-nowrap">Class</th>
                    <th className="p-3 text-left font-medium whitespace-nowrap">Section</th>
                  </>
                )}
                {showParentPasswordCol && (
                  <th className="min-w-[8rem] p-3 text-left font-medium">Password</th>
                )}
                <th className="p-3 text-left font-medium">Modules</th>
                {showActions && <th className="p-3 text-right font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {staffLoading ? (
                <tr>
                  <td colSpan={tableColSpan} className="p-10 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : staff.length === 0 ? (
                <tr>
                  <td colSpan={tableColSpan} className="p-10 text-center text-muted-foreground">
                    {isStaffScope
                      ? "No teachers or accountants yet."
                      : isAdminsScope
                        ? "No admin accounts yet."
                        : "No parent accounts yet."}
                  </td>
                </tr>
              ) : staffFiltered.length === 0 ? (
                <tr>
                  <td colSpan={tableColSpan} className="p-10 text-center text-muted-foreground">
                    <div className="space-y-2">
                      <p>No {entityLabel} match your filters.</p>
                      {filtersActive ? (
                        <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                          Clear filters
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ) : (
                pageRows.map((u) => {
                  const canOpenDetail = caps.canView || caps.canEdit;
                  return (
                  <tr
                    key={u._id}
                    className={cn(
                      "border-b last:border-0 transition-colors",
                      canOpenDetail && "cursor-pointer hover:bg-sky-50/60",
                      !canOpenDetail && "hover:bg-muted/20",
                      selectedIds.has(u._id) && "bg-muted/50",
                    )}
                    onClick={() => {
                      if (canOpenDetail) goView(u);
                    }}
                    onKeyDown={(e) => {
                      if (!canOpenDetail) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        goView(u);
                      }
                    }}
                    tabIndex={canOpenDetail ? 0 : undefined}
                    role={canOpenDetail ? "link" : undefined}
                    aria-label={canOpenDetail ? `View ${u.name}` : undefined}
                  >
                    <td
                      className="w-10 p-3 text-center"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <SquareCheckbox
                        checked={selectedIds.has(u._id)}
                        onChange={() => toggleSelectOne(u._id, !selectedIds.has(u._id))}
                        aria-label={`Select ${u.name}`}
                      />
                    </td>
                    {cols.map((c) => (
                      <td key={c.key} className="p-3">
                        {formatTableCell(u, c.key)}
                      </td>
                    ))}
                    {showLinkedStudents && (
                      <td className="p-3">
                        <LinkedStudentsCell user={u} />
                      </td>
                    )}
                    {showClassSectionCols && (
                      <>
                        <td className="p-3 whitespace-nowrap">
                          <ParentClassesCell user={u} />
                        </td>
                        <td className="p-3">
                          <ParentSectionsCell user={u} />
                        </td>
                      </>
                    )}
                    {showParentPasswordCol && (
                      <td
                        className="p-3"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        {isParentUser(u) ? (
                          <PasswordCell
                            visible={revealedPasswords.has(u._id)}
                            onToggle={() => togglePassword(u._id)}
                          />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    )}
                    <td className="p-3">
                      <ModulesCell user={u} />
                    </td>
                    {showActions && (
                      <td
                        className="p-3"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <div className="flex justify-end gap-0.5">
                          {canOpenDetail && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-primary"
                              onClick={() => goView(u)}
                              aria-label="View"
                              title="View details"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                          {caps.canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-sky-600 hover:text-sky-700"
                              onClick={() => goEdit(u)}
                              aria-label="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {caps.canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(
                                "h-8 w-8",
                                u.isActive
                                  ? "text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                                  : "text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700",
                              )}
                              disabled={toggleActiveMutation.isPending}
                              title={u.isActive ? "Deactivate" : "Activate"}
                              aria-label={u.isActive ? "Deactivate" : "Activate"}
                              onClick={() => {
                                const next = !u.isActive;
                                if (
                                  !window.confirm(
                                    next
                                      ? `Activate ${u.name}?`
                                      : `Deactivate ${u.name}?`,
                                  )
                                ) {
                                  return;
                                }
                                toggleActiveMutation.mutate({ id: u._id, isActive: next });
                              }}
                            >
                              {u.isActive ? (
                                <UserX className="h-4 w-4" />
                              ) : (
                                <UserCheck className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                          {caps.canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:bg-destructive/5 hover:text-destructive"
                              disabled={deleteMutation.isPending}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Permanently delete ${u.name}? This cannot be undone.`,
                                  )
                                ) {
                                  deleteMutation.mutate(u._id);
                                }
                              }}
                              aria-label="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalFiltered > 0 && (
          <div className="flex flex-col gap-3 border-t bg-muted/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted-foreground">
                Showing{" "}
                <span className="font-medium text-foreground">{showingFrom}</span>
                {" to "}
                <span className="font-medium text-foreground">{showingTo}</span>
                {" of "}
                <span className="font-medium text-foreground">{totalFiltered}</span>
                {" "}
                {entityPlural}
              </p>
              <PageSizeSelect
                value={pageSize}
                onChange={(n) => {
                  setPageSize(n);
                  setPage(1);
                }}
              />
            </div>

            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {pages.map((n) => (
                  <Button
                    key={n}
                    variant={n === safePage ? "default" : "outline"}
                    size="icon"
                    className="h-8 w-8 text-sm"
                    onClick={() => setPage(n)}
                    aria-label={`Page ${n}`}
                    aria-current={n === safePage ? "page" : undefined}
                  >
                    {n}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      <Dialog
        open={provisionOpen}
        onOpenChange={(o) => {
          setProvisionOpen(o);
          if (!o) setProvisionResult(null);
        }}
      >
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Parent portal emails & passwords</DialogTitle>
          </DialogHeader>
          {provisionResult && (
            <div className="space-y-3 min-h-0 flex-1 flex flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <p className="text-muted-foreground">
                  {provisionResult.total} students · {provisionResult.createdCount} new ·{" "}
                  {provisionResult.updatedCount} updated · password{" "}
                  <span className="font-medium text-foreground font-mono">
                    {provisionResult.defaultPassword}
                  </span>
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowProvisionPasswords((p) => !p)}
                >
                  {showProvisionPasswords ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                  {showProvisionPasswords ? "Hide passwords" : "Show passwords"}
                </Button>
              </div>
              <ScrollArea className="h-[min(420px,50vh)] rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background border-b border-border">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">Student</th>
                      <th className="text-left font-medium px-3 py-2">Student ID</th>
                      <th className="text-left font-medium px-3 py-2">Email</th>
                      <th className="text-left font-medium px-3 py-2">Password</th>
                      <th className="text-left font-medium px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {provisionResult.rows.map((row) => (
                      <tr key={row.studentMongoId} className="border-t border-border">
                        <td className="px-3 py-2">{row.studentName}</td>
                        <td className="px-3 py-2 font-mono text-xs">{row.studentId}</td>
                        <td className="px-3 py-2 break-all text-xs">{row.parentEmail}</td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {showProvisionPasswords ? row.parentPassword : "••••••••"}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {row.created ? "Created" : "Updated"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </div>
          )}
          <DialogFooter>
            <Button type="button" onClick={() => setProvisionOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(bulkResetResult)}
        onOpenChange={(o) => {
          if (!o) setBulkResetResult(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Passwords reset</DialogTitle>
          </DialogHeader>
          {bulkResetResult && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Updated{" "}
                <span className="font-medium text-foreground">{bulkResetResult.processed}</span>{" "}
                account(s). Share this password once — it will not be shown again from the
                database.
              </p>
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                <span className="font-mono text-base font-semibold tracking-wide">
                  {showBulkResetPassword
                    ? bulkResetResult.password || DEFAULT_PARENT_PASSWORD
                    : "••••••••"}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowBulkResetPassword((p) => !p)}
                >
                  {showBulkResetPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {bulkResetResult.failed.length > 0 ? (
                <p className="text-xs text-amber-700">
                  {bulkResetResult.failed.length} skipped:{" "}
                  {bulkResetResult.failed
                    .slice(0, 3)
                    .map((f) => f.reason)
                    .join("; ")}
                  {bulkResetResult.failed.length > 3 ? "…" : ""}
                </p>
              ) : null}
            </div>
          )}
          <DialogFooter>
            <Button type="button" onClick={() => setBulkResetResult(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UsersModule;
