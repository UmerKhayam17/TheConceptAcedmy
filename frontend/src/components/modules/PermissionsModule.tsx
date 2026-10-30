import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Pencil } from "lucide-react";
import { ModuleActionCaps, PermLevel } from "@/lib/permissions";
import { useToast } from "@/hooks/use-toast";
import {
  fetchAllUsers,
  fetchModuleRegistry,
  fetchPermissionCatalog,
  normalizeModulePermissions,
  displayEmail,
  patchUserPermissionIds,
  updateStaffUser,
  type PermissionDefinition,
  type RoleOption,
  type UserWithAccess,
} from "@/lib/staffApi";
import { useStaffRealtime } from "@/hooks/useStaffSocket";
import ModuleAccessMatrix from "@/components/modules/ModuleAccessMatrix";
import { useAuth } from "@/hooks/useAuth";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import { matchesPanelSearch } from "@/lib/panelSearch";

const ALL_USERS_QUERY = ["allUsers"] as const;
const PERM_CATALOG_QUERY = ["permissionCatalog"] as const;
const REGISTRY_QUERY = ["moduleRegistry"] as const;

function roleLabel(u: UserWithAccess): string {
  const r = u.role;
  if (r && typeof r === "object" && "name" in r) return String((r as RoleOption).name || "").toLowerCase();
  return "—";
}

function apiPermissionSummary(u: UserWithAccess): string {
  const list = u.permissions?.map((p) => p.name).filter(Boolean) ?? [];
  if (list.length === 0) return "—";
  if (list.length <= 4) return list.join(", ");
  return `${list.slice(0, 4).join(", ")} +${list.length - 4} more`;
}

function moduleSummary(u: UserWithAccess): string {
  const n = u.modulePermissions ? Object.keys(u.modulePermissions).length : 0;
  return n ? `${n} module(s)` : "—";
}

function groupCatalogByModule(rows: PermissionDefinition[]): Record<string, PermissionDefinition[]> {
  return rows.reduce<Record<string, PermissionDefinition[]>>((acc, p) => {
    const m = p.module || "other";
    if (!acc[m]) acc[m] = [];
    acc[m].push(p);
    return acc;
  }, {});
}

const PermissionsModule = ({ perm: _perm, caps }: { perm: PermLevel; caps: ModuleActionCaps }) => {
  const canEditMatrix = caps.canEdit;
  const { toast } = useToast();
  const { user: session } = useAuth();
  const qc = useQueryClient();
  useStaffRealtime(canEditMatrix);

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ALL_USERS_QUERY,
    queryFn: fetchAllUsers,
  });

  const { data: catalog = [] } = useQuery({
    queryKey: PERM_CATALOG_QUERY,
    queryFn: fetchPermissionCatalog,
  });

  const { data: modules = [] } = useQuery({
    queryKey: REGISTRY_QUERY,
    queryFn: fetchModuleRegistry,
  });

  const catalogByModule = useMemo(() => groupCatalogByModule(catalog), [catalog]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UserWithAccess | null>(null);
  const [apiPermIds, setApiPermIds] = useState<Set<string>>(() => new Set());
  const [modulePerms, setModulePerms] = useState<Record<string, string[]>>({});
  const [search, setSearch] = useState("");

  const usersFiltered = useMemo(() => {
    if (!search.trim()) return users;
    return users.filter((u) =>
      matchesPanelSearch(search, u.name, u.email, roleLabel(u), apiPermissionSummary(u), moduleSummary(u))
    );
  }, [users, search]);

  const openEdit = (u: UserWithAccess) => {
    if (!canEditMatrix) return;
    setEditing(u);
    const ids = new Set<string>();
    (u.permissions ?? []).forEach((p) => {
      if (p?._id) ids.add(String(p._id));
    });
    setApiPermIds(ids);
    setModulePerms(normalizeModulePermissions(u.modulePermissions));
    setOpen(true);
  };

  const clearDialog = () => {
    setEditing(null);
    setApiPermIds(new Set());
    setModulePerms({});
  };

  const toggleApiPerm = (id: string, checked: boolean) => {
    setApiPermIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!canEditMatrix) throw new Error("Not allowed.");
      if (!editing) throw new Error("No user selected");
      const id = editing._id;
      const ids = [...apiPermIds];

      let apiOk = false;
      try {
        await patchUserPermissionIds(id, ids);
        apiOk = true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "API permissions update failed";
        toast({
          title: "API permissions",
          description: `${msg} (module access may still save if you have staff access.)`,
          variant: "destructive",
        });
      }

      await updateStaffUser(id, { modulePermissions: { ...modulePerms } });

      return { apiOk };
    },
    onSuccess: ({ apiOk }) => {
      toast({
        title: "Saved",
        description: apiOk
          ? "API and module permissions were updated."
          : "Module permissions were updated.",
      });
      void qc.invalidateQueries({ queryKey: ALL_USERS_QUERY });
      setOpen(false);
      clearDialog();
    },
    onError: (e: Error) => {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    },
  });

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <PanelSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search name, email, role, permissions…"
        className="max-w-md"
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3">Name</th>
                <th className="text-left font-medium px-4 py-3">Email</th>
                <th className="text-left font-medium px-4 py-3">Role</th>
                <th className="text-left font-medium px-4 py-3 min-w-[200px]">API permissions</th>
                <th className="text-left font-medium px-4 py-3">Modules</th>
                {canEditMatrix ? <th className="text-right font-medium px-4 py-3 w-24">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {usersLoading ? (
                <tr>
                  <td colSpan={canEditMatrix ? 6 : 5} className="px-4 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : usersFiltered.length === 0 ? (
                <tr>
                  <td colSpan={canEditMatrix ? 6 : 5} className="px-4 py-8 text-center text-muted-foreground">
                    {users.length === 0 ? "No users found." : "No users match your search."}
                  </td>
                </tr>
              ) : (
                usersFiltered.map((u) => (
                  <tr key={u._id} className="border-t border-border hover:bg-secondary/30">
                    <td className="px-4 py-3 font-medium text-primary">{u.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{displayEmail(u.email)}</td>
                    <td className="px-4 py-3 capitalize">{roleLabel(u)}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs leading-snug max-w-md">
                      {apiPermissionSummary(u)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{moduleSummary(u)}</td>
                    {canEditMatrix ? (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Edit permissions"
                          onClick={() => openEdit(u)}
                          aria-label="Edit permissions"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) clearDialog();
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit permissions</DialogTitle>
            {editing ? (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{editing.name}</span>
                {" · "}
                {displayEmail(editing.email)}
                {" · "}
                <span className="capitalize">{roleLabel(editing)}</span>
              </p>
            ) : null}
          </DialogHeader>

          {editing ? (
            <div className="space-y-6 py-2">
              {catalog.length > 0 ? (
                <div>
                  <Label className="text-sm font-semibold text-primary">API permissions</Label>
                  <ScrollArea className="h-[min(220px,35vh)] rounded-md border border-border p-3 mt-2">
                    <div className="space-y-4 pr-2">
                      {Object.entries(catalogByModule).map(([mod, rows]) => (
                        <div key={mod}>
                          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                            {mod}
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {rows.map((p) => (
                              <label key={p._id} className="flex items-start gap-2 text-sm cursor-pointer">
                                <Checkbox
                                  className="mt-0.5"
                                  checked={apiPermIds.has(String(p._id))}
                                  onCheckedChange={(v) => toggleApiPerm(String(p._id), v === true)}
                                />
                                <span>
                                  <span className="font-mono text-xs text-primary">{p.name}</span>
                                  {p.description ? (
                                    <span className="block text-[11px] text-muted-foreground">{p.description}</span>
                                  ) : null}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Could not load API permission catalog.</p>
              )}

              {modules.length > 0 ? (
                <ModuleAccessMatrix
                  modules={modules}
                  value={modulePerms}
                  onChange={setModulePerms}
                />
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="hero"
              disabled={!editing || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PermissionsModule;
