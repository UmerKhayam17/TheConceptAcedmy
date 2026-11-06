import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarRange,
  CheckCircle2,
  Download,
  ExternalLink,
  GraduationCap,
  History,
  Layers,
  Users,
} from "lucide-react";
import SessionOpeningBalanceButton from "@/components/modules/timetable/SessionOpeningBalanceButton";
import PanelStatCard from "@/components/modules/PanelStatCard";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import FilterToolbar, { FilterToolbarActions } from "@/components/modules/FilterToolbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { ModuleActionCaps } from "@/lib/permissions";
import {
  completeSession,
  fetchSessionHistory,
  shiftSessionConfiguration,
  sessionStatus,
  type SessionStatus,
} from "@/lib/configApi";
import { systemConfigHref } from "@/lib/systemConfigMenus";
import { studentManagementHref } from "@/lib/studentManagementMenus";
import SessionEnrollmentImportFields, {
  buildSessionImportPayload,
  defaultSessionImportForm,
  type SessionImportFormState,
  validateSessionImportForm,
} from "@/components/modules/timetable/SessionEnrollmentImportFields";

const STATUS_LABEL: Record<SessionStatus, string> = {
  active: "Active",
  completed: "Completed",
  archived: "Archived",
};

const VERSION_BADGE: Record<string, string> = {
  published: "border-emerald-200 bg-emerald-50 text-emerald-700",
  draft: "border-sky-200 bg-sky-50 text-sky-700",
  archived: "border-slate-200 bg-slate-100 text-slate-600",
};

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return value;
  }
}

export default function SessionDetailPage({
  sessionId,
  caps,
}: {
  sessionId: string;
  caps: ModuleActionCaps;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const role = user?.role ?? "admin";
  const [importOpen, setImportOpen] = useState(false);
  const [importForm, setImportForm] = useState<SessionImportFormState>(() => ({
    ...defaultSessionImportForm(),
    enabled: true,
  }));
  const [classSearch, setClassSearch] = useState("");
  const [classStatusFilter, setClassStatusFilter] = useState<"" | "active" | "inactive">("");

  const { data: history, isLoading, isError, error } = useQuery({
    queryKey: ["session-history", sessionId],
    queryFn: () => fetchSessionHistory(sessionId),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["academic-sessions"] });
    qc.invalidateQueries({ queryKey: ["session-history", sessionId] });
  };

  const closeMut = useMutation({
    mutationFn: () => completeSession(sessionId),
    onSuccess: () => {
      invalidate();
      toast({
        title: "Session closed",
        description: "This session is now completed and read-only.",
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const importMut = useMutation({
    mutationFn: async () => {
      const importError = validateSessionImportForm(importForm);
      if (importError) throw new Error(importError);
      return shiftSessionConfiguration(sessionId, buildSessionImportPayload(importForm));
    },
    onSuccess: (result) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["academy-classes"] });
      setImportOpen(false);
      setImportForm({ ...defaultSessionImportForm(), enabled: true });
      const e = result.enrollment;
      const skipped = e.skipped?.length ?? 0;
      toast({
        title: "Configuration shifted",
        description: `${e.sections} sections, ${e.feeStructures} fee structures, timetable setup copied.${skipped ? ` ${skipped} class(es) skipped.` : ""}`,
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-12 text-center text-muted-foreground text-sm">
        Loading session summary…
      </div>
    );
  }

  if (isError || !history) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-12 space-y-4 text-center">
        <p className="text-destructive text-sm">{error instanceof Error ? error.message : "Session not found."}</p>
        <Button variant="outline" asChild>
          <Link to={systemConfigHref(role, "academic")}>Back to sessions</Link>
        </Button>
      </div>
    );
  }

  const session = history.session;
  const status = sessionStatus(session);
  const academy = history.academy ?? {
    classCount: 0,
    sectionCount: 0,
    studentCount: 0,
    classes: [],
  };

  const handleClose = () => {
    if (
      !confirm(
        "Close this session? It will be marked completed and draft timetables will be archived.",
      )
    ) {
      return;
    }
    closeMut.mutate();
  };

  const canChange = caps.canEdit && status === "active";
  const openImport = () => {
    setImportForm({ ...defaultSessionImportForm(), enabled: true });
    setImportOpen(true);
  };

  const q = classSearch.trim().toLowerCase();
  const visibleClasses = academy.classes.filter((cls) => {
    if (classStatusFilter && cls.status !== classStatusFilter) return false;
    if (!q) return true;
    return (
      cls.className.toLowerCase().includes(q) ||
      cls.sections.some((sec) => sec.sectionName.toLowerCase().includes(q))
    );
  });

  const versionsByStatus = Object.entries(history.summary.versionsByStatus || {});
  const thClass =
    "whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600";

  return (
    <div className="min-h-full bg-slate-50 px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      {/* Top bar — same layout as the other System Config pages */}
      <div className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
              <CalendarRange className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight">
                {session.name}
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500 max-w-xl">
                {STATUS_LABEL[status]} session · {formatDate(session.startDate)} – {formatDate(session.endDate)}
                {status !== "active" ? " · Read-only" : ""}
              </p>
            </div>
          </div>
          <div className="shrink-0 rounded-lg bg-primary/10 px-3 py-2 max-w-[15rem]">
            <p className="text-xs sm:text-sm italic leading-snug text-[#1a2b4b]/80">
              <span className="mr-1 text-primary not-italic font-serif text-base leading-none">
                &ldquo;
              </span>
              A great school builds great futures.
              <span className="ml-0.5 text-primary not-italic font-serif text-base leading-none">
                &rdquo;
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <PanelStatCard
          label="Classes"
          value={academy.classCount}
          hint="In this session"
          icon={GraduationCap}
          iconWrapClass="bg-[#dbeafe]"
          iconClass="text-[#1d4ed8]"
        />
        <PanelStatCard
          label="Sections"
          value={academy.sectionCount}
          hint="Across all classes"
          icon={Layers}
          iconWrapClass="bg-[#ede9fe]"
          iconClass="text-[#7c3aed]"
        />
        <PanelStatCard
          label="Students"
          value={academy.studentCount}
          hint="Enrolled"
          icon={Users}
          iconWrapClass="bg-[#d1fae5]"
          iconClass="text-[#059669]"
        />
        <PanelStatCard
          label="Timetable versions"
          value={history.summary.timetableVersions}
          hint={`${history.summary.scheduleSlots} schedule slots`}
          icon={CalendarRange}
          iconWrapClass="bg-[#fef3c7]"
          iconClass="text-[#d97706]"
        />
      </div>

      {/* Filter bar */}
      <Card className="p-3 sm:p-4 shadow-sm border-border/80">
        <FilterToolbar>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm w-[10rem] shrink-0"
            value={classStatusFilter}
            onChange={(e) => setClassStatusFilter(e.target.value as "" | "active" | "inactive")}
            aria-label="Class status filter"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <PanelSearchBar
            value={classSearch}
            onChange={setClassSearch}
            placeholder="Search class or section…"
            className="min-w-[12rem] flex-1 max-w-md"
          />
          {canChange && (
            <FilterToolbarActions>
              <SessionOpeningBalanceButton session={session} variant="outline" className="h-10 gap-2" />
              <Button
                variant="outline"
                className="h-10 gap-2"
                disabled={closeMut.isPending}
                onClick={handleClose}
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Close session
              </Button>
              <Button variant="outline" className="h-10 gap-2" onClick={openImport}>
                <Download className="h-4 w-4" /> Shift configuration
              </Button>
              <Button className="h-10 gap-2" asChild>
                <Link to={studentManagementHref(role, "classes")}>
                  <ExternalLink className="h-4 w-4" /> Manage in Enrollment
                </Link>
              </Button>
            </FilterToolbarActions>
          )}
        </FilterToolbar>
      </Card>

      {/* Enrollment structure table */}
      <Card className="overflow-hidden shadow-sm border-border/80">
        <div className="flex items-center justify-between gap-2 border-b bg-white px-4 py-3">
          <div className="flex min-w-0 items-center gap-2 font-display font-semibold text-[#1a2b4b]">
            <GraduationCap className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">Enrollment structure</span>
          </div>
          <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            {visibleClasses.length}
            {visibleClasses.length !== academy.classes.length ? ` of ${academy.classes.length}` : ""}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="border-b bg-[#eef4fc]">
              <tr>
                <th className={`${thClass} w-12`}>#</th>
                <th className={thClass}>Class</th>
                <th className={thClass}>Sections</th>
                <th className={`${thClass} text-center`}>Section count</th>
                <th className={thClass}>Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleClasses.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-10 text-center">
                    <GraduationCap className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-2 text-sm font-medium text-slate-600">
                      {academy.classes.length === 0
                        ? "No classes linked to this session yet"
                        : "No classes match your filters"}
                    </p>
                    {academy.classes.length === 0 && canChange && (
                      <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={openImport}>
                        <Download className="h-4 w-4" /> Shift configuration from session
                      </Button>
                    )}
                  </td>
                </tr>
              )}
              {visibleClasses.map((cls, index) => (
                <tr key={cls._id} className="border-b last:border-0 transition-colors hover:bg-slate-50/80">
                  <td className="px-4 py-3 text-xs font-medium text-slate-400">{index + 1}</td>
                  <td className="px-4 py-3 font-semibold text-[#1a2b4b]">{cls.className}</td>
                  <td className="px-4 py-3">
                    {cls.sections.length === 0 ? (
                      <span className="text-xs text-slate-400">No sections</span>
                    ) : (
                      <div className="flex max-w-[22rem] flex-wrap gap-1">
                        {cls.sections.map((sec) => (
                          <span
                            key={sec._id}
                            className={`rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${
                              sec.status === "active"
                                ? "border-primary/20 bg-primary/5 text-primary"
                                : "border-slate-200 bg-slate-50 text-slate-400 line-through"
                            }`}
                            title={sec.status === "active" ? "Active section" : "Inactive section"}
                          >
                            {sec.sectionName}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex min-w-[2.25rem] justify-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      {cls.sections.length}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${
                        cls.status === "active"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-slate-50 text-slate-500"
                      }`}
                    >
                      {cls.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Timetable summary */}
        <Card className="overflow-hidden shadow-sm border-border/80">
          <div className="flex items-center gap-2 border-b bg-white px-4 py-3 font-display font-semibold text-[#1a2b4b]">
            <CalendarRange className="h-4 w-4 shrink-0 text-primary" />
            Timetable summary
          </div>
          <div className="grid grid-cols-2 gap-3 p-4">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-500">Schedule slots</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-[#1a2b4b]">
                {history.summary.scheduleSlots}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-500">Timetable versions</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-[#1a2b4b]">
                {history.summary.timetableVersions}
              </p>
            </div>
            <div className="col-span-2">
              <p className="mb-1.5 text-xs font-medium text-slate-500">Versions by status</p>
              {versionsByStatus.length === 0 ? (
                <p className="text-sm text-slate-400">None</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {versionsByStatus.map(([key, count]) => (
                    <span
                      key={key}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${
                        VERSION_BADGE[key] || "border-slate-200 bg-slate-50 text-slate-600"
                      }`}
                    >
                      {key}
                      <span className="tabular-nums">{count}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Recent activity */}
        <Card className="overflow-hidden shadow-sm border-border/80">
          <div className="flex items-center gap-2 border-b bg-white px-4 py-3 font-display font-semibold text-[#1a2b4b]">
            <History className="h-4 w-4 shrink-0 text-primary" />
            Recent activity
          </div>
          {history.auditLogs?.length ? (
            <ul className="max-h-64 divide-y overflow-y-auto">
              {history.auditLogs.slice(0, 8).map((log) => (
                <li key={log._id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-primary/60" />
                    <span className="truncate text-sm font-medium capitalize text-slate-700">
                      {log.action.replace(/_/g, " ").toLowerCase()}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs text-slate-500">
                    {new Date(log.createdAt).toLocaleString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-6 text-center text-sm text-slate-400">No activity recorded yet.</p>
          )}
        </Card>
      </div>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Shift configuration from session</DialogTitle>
          </DialogHeader>
          <SessionEnrollmentImportFields
            excludeSessionId={sessionId}
            value={importForm}
            onChange={setImportForm}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => importMut.mutate()} disabled={importMut.isPending}>
              Shift configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
