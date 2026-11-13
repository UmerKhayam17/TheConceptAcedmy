/**
 * Download the panel's code ahead of time so that, after login, the dashboard opens
 * without waiting for several files one after another. Uses the same imports as the
 * lazy routes, so the browser reuses the downloaded files.
 */
let shellStarted = false;

/** Panel frame + page (small). Safe to start while the user is on the login page. */
export function prefetchPanelShell() {
  if (shellStarted) return;
  shellStarted = true;
  void import("@/components/PanelLayout").catch(() => undefined);
  void import("@/pages/Panel").catch(() => undefined);
}

/** The dashboard for this role (admin/accountant dashboards include the charts library). */
export function prefetchDashboardFor(role: string) {
  prefetchPanelShell();
  const load =
    role === "admin" || role === "accountant"
      ? import("@/components/modules/AdminDashboard")
      : role === "teacher"
        ? import("@/components/modules/TeacherDashboard")
        : role === "parent"
          ? import("@/components/modules/ParentDashboard")
          : null;
  void load?.catch(() => undefined);
}
