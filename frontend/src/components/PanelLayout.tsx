import { useEffect, useMemo } from "react";
import { Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import PanelSidebar from "./PanelSidebar";
import PanelMobileNav from "./PanelMobileNav";
import { useAuth } from "@/hooks/useAuth";
import { usePanelRealtime } from "@/hooks/usePanelRealtime";
import type { Role } from "@/lib/auth";
import { resolvePanelPageMeta } from "@/lib/panelPageMeta";
import PanelPageHeader from "@/components/panel-header/PanelPageHeader";
import {
  PanelSessionProvider,
  usePanelSession,
} from "@/components/panel-header/PanelSessionContext";
import SessionScopeBanner from "@/components/panel-header/SessionScopeBanner";

function PanelChrome({ user }: { user: NonNullable<ReturnType<typeof useAuth>["user"]> }) {
  const { pathname } = useLocation();
  const { role, slug, section, action } = useParams<{
    role: Role;
    slug?: string;
    section?: string;
    action?: string;
  }>();
  const { setAllowAllSessions, setHeaderSearch } = usePanelSession();

  const meta = useMemo(
    () => resolvePanelPageMeta((role as Role) || user.role, pathname, { slug, section, action }),
    [role, user.role, pathname, slug, section, action],
  );

  useEffect(() => {
    setAllowAllSessions(meta.allowAllSessions);
  }, [meta.allowAllSessions, setAllowAllSessions]);

  // Clear header search when navigating between pages
  useEffect(() => {
    setHeaderSearch("");
  }, [pathname, setHeaderSearch]);

  return (
    <>
      <PanelPageHeader
        user={user}
        title={meta.title}
        icon={meta.icon}
        breadcrumbParent={meta.breadcrumbParent}
        breadcrumbCurrent={meta.breadcrumbCurrent}
        showSession={meta.showSession}
        allowAllSessions={meta.allowAllSessions}
      />
      {meta.showSession && <SessionScopeBanner />}
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <Outlet />
      </main>
      <PanelMobileNav user={user} />
    </>
  );
}

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
          <PanelSessionProvider>
            <PanelChrome user={user} />
          </PanelSessionProvider>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default PanelLayout;
