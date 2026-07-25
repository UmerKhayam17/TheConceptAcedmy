import { useMemo } from "react";
import {
  applyBackendModulePermissions,
  DEFAULT_PERMISSIONS,
  PermLevel,
  ModuleKey,
} from "@/lib/permissions";
import { Role } from "@/lib/auth";
import { useAuth } from "@/hooks/useAuth";

/** Panel access matrix: server `modulePermissions` when present, otherwise role defaults. */
export const usePermissions = () => {
  const { user } = useAuth();

  const perms = useMemo(() => {
    const roles = Object.keys(DEFAULT_PERMISSIONS) as Role[];
    const out = {} as Record<Role, Record<ModuleKey, PermLevel>>;
    for (const role of roles) {
      out[role] = applyBackendModulePermissions(
        DEFAULT_PERMISSIONS[role],
        role === user?.role ? user?.modulePermissions : undefined,
        role,
      );
    }
    return out;
  }, [user?.role, user?.modulePermissions]);

  const get = (role: Role, mod: ModuleKey): PermLevel => perms[role]?.[mod] ?? "none";

  return { perms, get };
};
