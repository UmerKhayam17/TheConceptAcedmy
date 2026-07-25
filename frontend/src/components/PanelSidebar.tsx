import { Link, NavLink, useLocation } from "react-router-dom";
import {
  ShieldCheck,
  Calculator,
  GraduationCap,
  Users,
  LogOut,
  Home,
  School,
  ChevronDown,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Role, SessionUser, logout, panelPathFor } from "@/lib/auth";
import { usePermissions } from "@/hooks/usePermissions";
import { applyBackendModulePermissions, resolveModuleCaps } from "@/lib/permissions";
import {
  sidebarNavForRole,
  groupIsOpen,
  navItemIsActive,
  type SidebarNavGroup,
  type SidebarNavItem,
} from "@/lib/sidebarNav";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";

const roleHeader: Record<Role, { title: string; Icon: React.ComponentType<{ className?: string }> }> = {
  admin: { title: "Administrator", Icon: ShieldCheck },
  accountant: { title: "Accountant", Icon: Calculator },
  teacher: { title: "Teacher", Icon: GraduationCap },
  parent: { title: "Parent", Icon: Users },
  student: { title: "Student", Icon: School },
};

const PanelSidebar = ({ user }: { user: SessionUser }) => {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const head = roleHeader[user.role];
  const HeadIcon = head.Icon;
  const { perms } = usePermissions();
  const rolePerms = applyBackendModulePermissions(perms[user.role], user.modulePermissions, user.role);
  const rootPath = panelPathFor(user.role);

  const canView = (item: SidebarNavItem) => {
    if (item.moduleKey === "dashboard") return true;
    const caps = resolveModuleCaps(item.moduleKey, rolePerms[item.moduleKey], user.modulePermissions, user.role);
    if (!caps.canView) return false;
    if (item.requireManage && !(caps.canEdit || caps.canCreate)) return false;
    // My Schedule is mainly for teachers (and managers who teach)
    if (item.id === "my-schedule" && user.role !== "teacher" && !(caps.canEdit || caps.canCreate)) {
      return false;
    }
    return true;
  };

  const visibleGroups = sidebarNavForRole(user.role)
    .map((group) => ({
      ...group,
      items: group.items.filter(canView),
    }))
    .filter((group) => group.items.length > 0);

  const activeLinkClass =
    "!bg-primary !text-primary-foreground font-semibold shadow-sm hover:!bg-primary hover:!text-primary-foreground [&>svg]:!text-primary-foreground data-[active=true]:!bg-primary data-[active=true]:!text-primary-foreground";

  const renderLink = (item: SidebarNavItem, compact = false) => {
    const href = item.href(user.role);
    const active = navItemIsActive(item, pathname, user.role);
    const Icon = item.icon;
    if (compact) {
      return (
        <SidebarMenuSubItem key={item.id}>
          <SidebarMenuSubButton
            asChild
            isActive={active}
            className={cn("h-7 text-xs", active && activeLinkClass)}
          >
            <NavLink to={href} end={item.id === "dashboard"}>
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      );
    }
    return (
      <SidebarMenuItem key={item.id}>
        <SidebarMenuButton
          asChild
          isActive={active}
          tooltip={item.label}
          className={cn("h-8", active && activeLinkClass)}
        >
          <NavLink to={href} end={item.id === "dashboard"}>
            <Icon className="h-4 w-4 shrink-0" />
            <span className="text-sm truncate">{item.label}</span>
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  const renderCollapsibleGroup = (group: SidebarNavGroup) => {
    const routeOpen = groupIsOpen(group, pathname, user.role);
    const GroupIcon = group.icon;
    return (
      <Collapsible key={group.id} defaultOpen={routeOpen} className="group/collapsible">
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton
              tooltip={group.label}
              className={cn(
                "!h-8 min-h-8 py-1.5 items-center overflow-hidden [&>span]:truncate [&>span]:text-sm",
                "group-data-[state=open]/collapsible:bg-sidebar-accent/50",
              )}
            >
              <GroupIcon className="h-4 w-4 shrink-0" />
              <span>{group.label}</span>
              <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 transition-transform group-data-[state=open]/collapsible:rotate-180" />
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenuSub className="mx-0 ml-2 border-l border-sidebar-border pl-2.5 py-1 gap-0.5">
              {group.items.map((item) => renderLink(item, true))}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    );
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border p-0">
        <Link to={rootPath} className="flex items-center gap-2.5 px-2 py-2.5">
          <img src={logo} alt="The Concept Academy" className="h-8 w-8 rounded bg-background p-0.5 shrink-0" />
          {!collapsed && (
            <div className="leading-tight min-w-0">
              <div className="font-display text-sm font-bold truncate">The Concept Academy</div>
              <div className="text-[10px] uppercase tracking-wide text-sidebar-foreground/60 truncate">
                {head.title}
              </div>
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent className="gap-0 py-1">
        {visibleGroups.map((group, index) => (
          <div key={group.id}>
            {index > 0 && <SidebarSeparator className="mx-2 my-1" />}
            <SidebarGroup className="p-1">
              {!group.collapsible && group.id !== "dashboard" && (
                <SidebarGroupLabel className="h-6 px-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/55">
                  {group.label}
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {group.collapsible
                    ? renderCollapsibleGroup(group)
                    : group.items.map((item) => renderLink(item, false))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </div>
        ))}

        <SidebarSeparator className="mx-2 my-1" />
        <SidebarGroup className="p-1">
          <SidebarGroupLabel className="h-6 px-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/55">
            Account
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Back to website" className="h-8">
                  <Link to="/">
                    <Home className="h-4 w-4" />
                    <span className="text-sm">Website</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => void logout()} tooltip="Sign out" className="h-8">
                  <LogOut className="h-4 w-4" />
                  <span className="text-sm">Sign out</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-0">
        <div className="flex items-center gap-2.5 px-2 py-2 min-w-0">
          <div className="h-7 w-7 rounded-full bg-accent/20 grid place-items-center shrink-0">
            <HeadIcon className="h-3.5 w-3.5 text-accent" />
          </div>
          {!collapsed && (
            <div className="leading-tight min-w-0">
              <div className="text-xs font-semibold truncate">{user.name}</div>
              <div className="text-[10px] text-sidebar-foreground/60 truncate">{user.email}</div>
            </div>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
};

export default PanelSidebar;
