import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
  Percent,
  Plus,
  Pencil,
  UserCog,
  UserX,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Trash2,
  Users,
  UserRound,
} from "lucide-react";
import { ModuleActionCaps, PermLevel } from "@/lib/permissions";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import PanelStatCard from "@/components/modules/PanelStatCard";
import { tableColumns, type UserFieldKey } from "@/lib/userSchemaFields";
import {
  fetchAllUsers,
  fetchStaffUsers,
  updateStaffUser,
  deleteStaffUser,
  type RoleOption,
  type LinkedStudentSummary,
  type StaffUser,
} from "@/lib/staffApi";
import { useStaffRealtime } from "@/hooks/useStaffSocket";
import PanelToolbar from "@/components/modules/PanelToolbar";
import { usePanelListSearch } from "@/hooks/usePanelListSearch";
import {
  provisionParentPortals,
  type ParentPortalProvisionResult,
} from "@/lib/studentManagementApi";
import { resolveUploadUrl } from "@/lib/api";
import { ScrollArea } from "@/components/ui/scroll-area";
import { userCreateHref, userEditHref } from "@/lib/userFormRoutes";

function formatTableCell(user: StaffUser, key: UserFieldKey): React.ReactNode {
  if (key === "role") {
    const r = user.role;
    if (r && typeof r === "object" && "name" in r) {
      return <span className="capitalize">{(r as RoleOption).name}</span>;
    }
    return "—";
  }
  if (key === "isActive") {
    return (
      <span
        className={`text-xs font-semibold rounded-full px-2 py-0.5 ${
          user.isActive ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground"
        }`}
      >
        {user.isActive ? "Active" : "Inactive"}
      </span>
    );
  }
  if (key === "payType") {
    return user.payType === "percentage" ? "Percentage" : "Fixed";
  }
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

function roleNameOf(user: StaffUser): string {
  const r = user.role;
  if (r && typeof r === "object" && "name" in r) return String((r as RoleOption).name).toLowerCase();
  if (typeof r === "string") return r.toLowerCase();
  return "";
}

function isParentUser(user: StaffUser): boolean {
  return roleNameOf(user) === "parent";
}

function LinkedStudentsCell({ user }: { user: StaffUser }) {
  if (!isParentUser(user)) return <span className="text-muted-foreground">—</span>;
  const students = user.linkedStudents ?? [];
  if (students.length === 0) {
    return <span className="text-xs text-muted-foreground">No children linked</span>;
  }
  return (
    <div className="flex flex-col gap-1.5 max-w-xs">
      {students.map((s: LinkedStudentSummary) => {
        const classSection = [s.className, s.sectionName].filter(Boolean).join(" · ");
        return (
          <div key={s._id} className="text-xs leading-snug">
            <span className="font-medium text-foreground">{s.studentName}</span>
            {s.studentId ? (
              <span className="text-muted-foreground"> ({s.studentId})</span>
            ) : null}
            {classSection ? (
              <div className="text-muted-foreground">{classSection}</div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

const STAFF_QUERY = ["users-module-list"] as const;

const UsersModule = ({
  perm: _perm,
  caps,
  scope = "all",
}: {
  perm: PermLevel;
  caps: ModuleActionCaps;
  scope?: "all" | "staff";
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
    queryFn: async () =>
      scope === "staff"
        ? await fetchStaffUsers()
        : ((await fetchAllUsers()) as StaffUser[]),
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

  const { search, setSearch, filtered: staffFiltered } = usePanelListSearch(staff, (u) => [
    u.name,
    u.email,
    u.phone,
    typeof u.role === "object" && u.role
      ? (u.role as RoleOption).name
      : typeof u.role === "string"
        ? u.role
        : "",
    u.isActive ? "active" : "inactive",
    ...(u.linkedStudents ?? []).flatMap((s) => [
      s.studentName,
      s.studentId,
      s.className ?? "",
      s.sectionName ?? "",
    ]),
  ]);

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => {
      if (!caps.canEdit) throw new Error("Not allowed.");
      return updateStaffUser(id, { isActive: false });
    },
    onSuccess: () => {
      toast({ title: "Staff member deactivated" });
      void qc.invalidateQueries({ queryKey: STAFF_QUERY });
    },
    onError: (e: Error) => {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    },
  });

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

  const cols = tableColumns();
  const showLinkedStudents = scope === "all";
  const showParentPasswordCol = scope === "all";
  const showActions = scope === "staff" || caps.canEdit || caps.canDelete;
  const tableColSpan =
    cols.length + 2 + (showLinkedStudents ? 1 : 0) + (showParentPasswordCol ? 1 : 0) + (showActions ? 1 : 0);

  const isStaffScope = scope === "staff";
  const stats = useMemo(() => {
    const total = staff.length;
    const active = staff.filter((u) => u.isActive).length;
    const activePct = total ? Math.round((active / total) * 100) : 0;
    const teachers = staff.filter((u) => roleNameOf(u) === "teacher").length;
    const percentage = staff.filter((u) => u.payType === "percentage").length;
    const parents = staff.filter((u) => isParentUser(u)).length;
    const staffCount = staff.filter((u) => {
      const n = roleNameOf(u);
      return n === "teacher" || n === "accountant";
    }).length;
    return { total, active, activePct, teachers, percentage, parents, staffCount };
  }, [staff]);

  const pageTitle = isStaffScope ? "Staff" : "Users";
  const pageHint = isStaffScope
    ? "Manage teachers, accountants, pay type, and module access."
    : "Manage portal users, roles, parent accounts, and access.";
  const HeaderIcon = isStaffScope ? UserCog : Users;

  const goCreate = () => {
    if (!caps.canCreate || !role) return;
    navigate(userCreateHref(role, scope));
  };

  const goEdit = (u: StaffUser) => {
    if (!caps.canEdit || !role) return;
    navigate(userEditHref(role, u._id, scope));
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
        ) : (
          <>
            <PanelStatCard
              label="Total Users"
              value={staffLoading ? "…" : stats.total}
              hint="All portal accounts"
              icon={Users}
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
              label="Parents"
              value={staffLoading ? "…" : stats.parents}
              hint="Parent portals"
              icon={UserRound}
              iconWrapClass="bg-[#ede9fe]"
              iconClass="text-[#7c3aed]"
            />
            <PanelStatCard
              label="Staff"
              value={staffLoading ? "…" : stats.staffCount}
              hint="Teachers & accountants"
              icon={UserCog}
              iconWrapClass="bg-[#ffedd5]"
              iconClass="text-[#ea580c]"
            />
          </>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
        <PanelToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search name, email, phone, role…"
        >
          {caps.canCreate && scope !== "staff" && (
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
              <Plus className="h-4 w-4" /> {scope === "staff" ? "Add staff" : "Add user"}
            </Button>
          )}
        </PanelToolbar>
      </div>

      <Card className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="text-left font-medium px-4 py-3 w-14">Photo</th>
                {cols.map((c) => (
                  <th key={c.key} className="text-left font-medium px-4 py-3">
                    {c.label}
                  </th>
                ))}
                {showLinkedStudents && (
                  <th className="text-left font-medium px-4 py-3 min-w-[10rem]">Linked students</th>
                )}
                {showParentPasswordCol && (
                  <th className="text-left font-medium px-4 py-3 min-w-[8rem]">Password</th>
                )}
                <th className="text-left font-medium px-4 py-3">Modules</th>
                {showActions && <th className="px-4 py-3 w-28" />}
              </tr>
            </thead>
            <tbody>
              {staffLoading ? (
                <tr>
                  <td colSpan={tableColSpan} className="px-4 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : staff.length === 0 ? (
                <tr>
                  <td colSpan={tableColSpan} className="px-4 py-8 text-center text-muted-foreground">
                    {scope === "staff"
                      ? "No teachers or accountants yet."
                      : "No users found yet."}
                  </td>
                </tr>
              ) : staffFiltered.length === 0 ? (
                <tr>
                  <td colSpan={tableColSpan} className="px-4 py-8 text-center text-muted-foreground">
                    No staff match your search.
                  </td>
                </tr>
              ) : (
                staffFiltered.map((u) => {
                  const imgSrc = u.profileImage ? resolveUploadUrl(u.profileImage) : undefined;
                  return (
                    <tr key={u._id} className="border-t border-border hover:bg-secondary/30">
                      <td className="px-4 py-2">
                        <div className="h-10 w-10 rounded-full bg-muted overflow-hidden border border-border">
                          {imgSrc ? (
                            <img src={imgSrc} alt="" className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                      </td>
                      {cols.map((c) => (
                        <td key={c.key} className="px-4 py-3">
                          {formatTableCell(u, c.key)}
                        </td>
                      ))}
                      {showLinkedStudents && (
                        <td className="px-4 py-3 align-top">
                          <LinkedStudentsCell user={u} />
                        </td>
                      )}
                      {showParentPasswordCol && (
                        <td className="px-4 py-3 align-top">
                          {isParentUser(u) ? (
                            <span className="font-mono text-xs tracking-wide">Concept@1234</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3 text-muted-foreground">
                        {(() => {
                          const mods =
                            u.modulePermissions && typeof u.modulePermissions === "object"
                              ? Object.keys(u.modulePermissions)
                              : [];
                          if (!mods || mods.length === 0) return "—";
                          const show = mods.slice(0, 3);
                          return (
                            <div className="flex flex-wrap items-center gap-2">
                              {show.map((m) => (
                                <span
                                  key={m}
                                  className="text-xs bg-muted/20 rounded-full px-2 py-0.5 capitalize"
                                >
                                  {m}
                                </span>
                              ))}
                              {mods.length > 3 ? (
                                <span className="text-xs text-muted-foreground">
                                  +{mods.length - 3}
                                </span>
                              ) : null}
                            </div>
                          );
                        })()}
                      </td>
                      {showActions && (
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex justify-end gap-0.5">
                            {scope === "staff" && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-muted-foreground hover:text-primary"
                                asChild
                                aria-label="View staff"
                              >
                                <Link to={u._id}>
                                  <Eye className="h-4 w-4" />
                                </Link>
                              </Button>
                            )}
                            {caps.canEdit && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-sky-600 hover:text-sky-700"
                                onClick={() => goEdit(u)}
                                aria-label="Edit"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            {caps.canEdit && u.isActive ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => {
                                  if (window.confirm(`Deactivate ${u.name}?`)) {
                                    deactivateMutation.mutate(u._id);
                                  }
                                }}
                                aria-label="Deactivate"
                                title="Deactivate"
                              >
                                <UserX className="h-4 w-4 text-destructive" />
                              </Button>
                            ) : null}
                            {caps.canDelete && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
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
                                title="Delete user"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
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
    </div>
  );
};

export default UsersModule;
