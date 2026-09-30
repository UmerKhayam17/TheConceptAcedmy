import type { ComponentType } from "react";
import { ChevronRight, Menu } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import NotificationBell from "@/components/NotificationBell";
import PanelUserMenu from "@/components/PanelUserMenu";
import type { SessionUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import AcademicSessionHeaderSelector from "./AcademicSessionHeaderSelector";
import HeaderDateDisplay from "./HeaderDateDisplay";
import HeaderGlobalSearch from "./HeaderGlobalSearch";
import { usePanelSession } from "./PanelSessionContext";

function SidebarToggle() {
  const { toggleSidebar } = useSidebar();

  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label="Toggle sidebar"
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
        "text-[#10244A] transition-all duration-150 ease-out",
        "hover:bg-[#EEF5FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1769E0]/35",
      )}
    >
      <Menu className="h-5 w-5" aria-hidden />
    </button>
  );
}

function PageIdentity({
  title,
  icon: Icon,
  breadcrumbParent,
  breadcrumbCurrent,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  breadcrumbParent: string;
  breadcrumbCurrent: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
      <Icon className="h-6 w-6 shrink-0 text-[#1769E0]" aria-hidden />
      <div className="min-w-0 leading-tight">
        <h1 className="truncate text-[18px] font-bold leading-6 text-[#10244A] sm:text-[19px]">
          {title}
        </h1>
        <nav aria-label="Breadcrumb" className="mt-0.5 hidden items-center gap-1 sm:flex">
          <span className="truncate text-[11px] text-slate-400">{breadcrumbParent}</span>
          <ChevronRight className="h-3 w-3 shrink-0 text-slate-300" aria-hidden />
          <span className="truncate text-[11px] font-medium text-slate-500">{breadcrumbCurrent}</span>
        </nav>
      </div>
    </div>
  );
}

export default function PanelPageHeader({
  user,
  title,
  icon,
  breadcrumbParent,
  breadcrumbCurrent,
  showSession,
  allowAllSessions = true,
  showSearch = true,
}: {
  user: SessionUser;
  title: string;
  icon: ComponentType<{ className?: string }>;
  breadcrumbParent: string;
  breadcrumbCurrent: string;
  showSession: boolean;
  allowAllSessions?: boolean;
  showSearch?: boolean;
}) {
  const { sessionId, setSessionId, headerSearch, setHeaderSearch } = usePanelSession();
  const showMobileExtras = showSession || showSearch;

  return (
    <header className="z-30 w-full shrink-0 border-b border-[#DCE4EF] bg-white">
      <div className="flex h-[72px] w-full items-center justify-between gap-3 px-4 sm:px-5 lg:px-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <SidebarToggle />
          <PageIdentity
            title={title}
            icon={icon}
            breadcrumbParent={breadcrumbParent}
            breadcrumbCurrent={breadcrumbCurrent}
          />
        </div>

        <div className="flex shrink-0 items-center gap-2.5 sm:gap-3.5 lg:gap-4">
          {showSession && (
            <AcademicSessionHeaderSelector
              sessionId={sessionId}
              onSessionChange={setSessionId}
              allowAllSessions={allowAllSessions}
              className="hidden md:flex"
            />
          )}
          {showSearch && (
            <HeaderGlobalSearch
              value={headerSearch}
              onChange={setHeaderSearch}
              className="hidden md:block"
            />
          )}
          <NotificationBell />
          <HeaderDateDisplay />
          <PanelUserMenu user={user} variant="portal" />
        </div>
      </div>

      {showMobileExtras && (
        <div className="flex items-center gap-2 border-t border-[#EEF2F7] bg-white px-4 py-2 md:hidden">
          {showSession && (
            <AcademicSessionHeaderSelector
              sessionId={sessionId}
              onSessionChange={setSessionId}
              allowAllSessions={allowAllSessions}
              className="w-[140px]"
            />
          )}
          {showSearch && (
            <HeaderGlobalSearch
              value={headerSearch}
              onChange={setHeaderSearch}
              className="min-w-0 w-auto max-w-none flex-1"
            />
          )}
        </div>
      )}
    </header>
  );
}
