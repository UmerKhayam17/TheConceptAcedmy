import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { moduleHref } from "@/lib/panelMenus";
import { Role } from "@/lib/auth";
import {
  applyBackendModulePermissions,
  resolveModuleCaps,
  type ModuleKey,
} from "@/lib/permissions";

const SettingsModule = () => {
  const { user } = useAuth();
  const { perms } = usePermissions();
  const role = (user?.role ?? "admin") as Role;

  const rolePerms = applyBackendModulePermissions(
    perms[role],
    user?.modulePermissions,
    role,
  );
  const catalogCaps = resolveModuleCaps(
    "permission-catalog" as ModuleKey,
    rolePerms["permission-catalog"],
    user?.modulePermissions,
    role,
  );
  const permissionsCaps = resolveModuleCaps(
    "permissions" as ModuleKey,
    rolePerms.permissions,
    user?.modulePermissions,
    role,
  );

  // Get module permissions for display
  const modulePerms = user?.modulePermissions ? Object.entries(user.modulePermissions) : [];

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-4 max-w-2xl">
      <Card className="p-4 space-y-3">
        <div className="font-semibold text-primary">Your account</div>
        {user ? (
          <dl className="text-sm space-y-2">
            <div>
              <dt className="text-muted-foreground text-xs">Name</dt>
              <dd className="font-medium">{user.name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Email</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Role</dt>
              <dd className="capitalize">{user.role}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Not signed in.</p>
        )}
      </Card>

      {modulePerms.length > 0 && (
        <Card className="p-4 space-y-3">
          <div className="font-semibold text-primary">Module permissions</div>
          <div className="space-y-2">
            {modulePerms.map(([moduleName, actions]) => (
              <div key={moduleName} className="text-sm bg-muted/40 rounded p-3">
                <div className="font-medium text-primary capitalize">{moduleName}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {Array.isArray(actions) && actions.length > 0
                    ? actions.join(", ")
                    : "No actions"}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {(permissionsCaps.canView || catalogCaps.canView) && (
        <Card className="p-4 space-y-2">
          <div className="font-semibold text-primary">Access & permissions</div>
          {permissionsCaps.canView && (
            <Button variant="outline" size="sm" asChild>
              <Link to={moduleHref(role, "permissions")}>Open Permissions</Link>
            </Button>
          )}
          {catalogCaps.canView && (
            <Button variant="ghost" size="sm" asChild className="block">
              <Link to={moduleHref(role, "permission-catalog")}>View permission catalog</Link>
            </Button>
          )}
        </Card>
      )}
    </div>
  );
};

export default SettingsModule;
