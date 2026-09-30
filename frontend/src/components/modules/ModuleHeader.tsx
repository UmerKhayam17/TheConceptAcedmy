import type { ComponentType } from "react";
import { Role } from "@/lib/auth";
import { ModuleDef } from "@/lib/permissions";
import { ICONS } from "@/lib/panelMenus";

const ModuleHeader = ({
  module,
  role,
  title,
  icon: IconOverride,
  right,
}: {
  module: ModuleDef;
  role: Role;
  title?: string;
  icon?: ComponentType<{ className?: string }>;
  right?: React.ReactNode;
}) => {
  const Icon = IconOverride || ICONS[module.icon] || ICONS.LayoutDashboard;
  return (
    <div className="bg-[image:var(--gradient-hero)] text-primary-foreground border-b border-primary/20">
      <div className="px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-accent/20 border border-accent/40 grid place-items-center shrink-0">
          <Icon className="h-5 w-5 text-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] tracking-widest uppercase text-accent/90 capitalize">{role} portal</div>
          <h1 className="font-display text-xl sm:text-2xl font-bold leading-tight">{title || module.label}</h1>
        </div>
        {right && <div className="hidden sm:block">{right}</div>}
      </div>
    </div>
  );
};

export default ModuleHeader;
