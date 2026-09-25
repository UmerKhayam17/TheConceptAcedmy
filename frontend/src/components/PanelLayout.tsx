import { useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import PanelSidebar from "./PanelSidebar";
import PanelMobileNav from "./PanelMobileNav";
import PanelUserMenu from "./PanelUserMenu";
import { useAuth } from "@/hooks/useAuth";
import NotificationBell from "@/components/NotificationBell";
import { usePanelRealtime } from "@/hooks/usePanelRealtime";

const PanelLayout = () => {
  const { user, loading } = useAuth();

  useEffect(() => {
    document.body.classList.add("cms-active");
    return () => document.body.classList.remove("cms-active");
  }, []);

  usePanelRealtime(Boolean(user));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary/30 text-muted-foreground text-sm">
        Loading portal…
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <SidebarProvider className="h-dvh max-h-dvh min-h-0 overflow-hidden !min-h-0">
      <div className="cms-root flex h-full max-h-full w-full overflow-hidden bg-secondary/30">
        <PanelSidebar user={user} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="z-30 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-background/95 px-2.5 backdrop-blur sm:px-4">
            <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
              <SidebarTrigger className="shrink-0" />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold capitalize text-primary leading-tight">
                  {user.role} Portal
                </div>
                <div className="hidden truncate text-[11px] text-muted-foreground sm:block">
                  {user.name}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
              <NotificationBell />
              <PanelUserMenu user={user} />
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
            <Outlet />
          </main>

          <PanelMobileNav user={user} />
        </div>
      </div>
    </SidebarProvider>
  );
};

export default PanelLayout;
