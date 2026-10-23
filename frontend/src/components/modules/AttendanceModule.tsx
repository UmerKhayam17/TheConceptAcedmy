import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ClipboardList,
  Clock3,
  Palmtree,
  UserX,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ModuleActionCaps, PermLevel } from "@/lib/permissions";
import { useToast } from "@/hooks/use-toast";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import ClassProgramSelect from "@/components/modules/ClassProgramSelect";
import { matchesPanelSearch } from "@/lib/panelSearch";
import {
  exportAcademyAttendance,
  fetchAcademyAttendanceDay,
  fetchAcademyClasses,
  fetchSectionsByClass,
  markAcademyAttendance,
  type AcademyAttendanceRecord,
  type AcademyStudent,
  type AttendanceExportFormat,
} from "@/lib/studentManagementApi";
import { useAuth } from "@/hooks/useAuth";
import { useSessionScope } from "@/components/modules/timetable/SessionBar";
import { usePanelSession } from "@/components/panel-header/PanelSessionContext";
import { localTodayYmd } from "@/lib/localDate";
import ParentAttendancePanel from "@/components/modules/parent/ParentAttendancePanel";
import PanelStatCard from "@/components/modules/PanelStatCard";
import { DefaulterListDownload } from "@/components/modules/student-management/DefaulterListDownload";
import { deliverReportBlob, openReportPreviewTab } from "@/lib/reportDownload";

const today = () => localTodayYmd();

function classLabel(s: AcademyStudent) {
  const c = s.classId;
  if (typeof c === "object" && c && "className" in c) return c.className;
  return "—";
}

function sectionLabel(s: AcademyStudent) {
  const sec = s.sectionId;
  if (typeof sec === "object" && sec && "sectionName" in sec) return sec.sectionName;
  return "—";
}

function studentRef(s: AcademyStudent) {
  return s.rollNumber || s.studentId || s.registrationNumber || "";
}

function fmtTime(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function StaffAttendanceModule({ caps }: { caps: ModuleActionCaps }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { sessionId } = usePanelSession();
  const { apiSessionId, writable, hasScope } = useSessionScope(sessionId);

  const [date, setDate] = useState(today());
  const [classFilter, setClassFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [studentFilter, setStudentFilter] = useState("");
  const [exporting, setExporting] = useState<AttendanceExportFormat | null>(null);
  const [search, setSearch] = useState("");
  const canMark = writable && (caps.canCreate || caps.canEdit);

  useEffect(() => {
    setClassFilter("");
    setSectionFilter("");
    setStudentFilter("");
  }, [sessionId]);

  useEffect(() => {
    setSectionFilter("");
    setStudentFilter("");
  }, [classFilter]);

  useEffect(() => {
    setStudentFilter("");
  }, [sectionFilter]);

  const { data: classes = [] } = useQuery({
    queryKey: ["academy-classes-attendance", sessionId],
    queryFn: () => fetchAcademyClasses({ status: "active", sessionId: apiSessionId }),
    enabled: hasScope,
  });

  const { data: sections = [] } = useQuery({
    queryKey: ["academy-sections-attendance", classFilter],
    queryFn: () => fetchSectionsByClass(classFilter, { status: "active" }),
    enabled: Boolean(classFilter),
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["academy-attendance-day", date, sessionId, classFilter, sectionFilter],
    queryFn: () =>
      fetchAcademyAttendanceDay({
        date,
        classId: classFilter || undefined,
        sectionId: sectionFilter || undefined,
        sessionId: classFilter ? undefined : apiSessionId,
      }),
    enabled: hasScope,
  });

  const markMut = useMutation({
    mutationFn: (payload: { studentId: string; status: "present" | "absent" | "late" | "leave" }) =>
      markAcademyAttendance({
        date,
        entries: [{ studentId: payload.studentId, status: payload.status }],
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academy-attendance-day", date] });
      qc.invalidateQueries({ queryKey: ["academy-attendance-summary"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const recordMap = useMemo(() => {
    const m = new Map<string, AcademyAttendanceRecord>();
    (data?.records ?? []).forEach((r) => {
      const sid = typeof r.studentId === "object" ? (r.studentId as { _id?: string })._id : r.studentId;
      if (sid) m.set(String(sid), r);
    });
    return m;
  }, [data?.records]);

  const students = data?.students ?? [];

  const studentsFiltered = useMemo(() => {
    let base = students;
    if (studentFilter) {
      base = students.filter((s) => s._id === studentFilter);
    }
    if (!search.trim()) return base;
    return base.filter((s) =>
      matchesPanelSearch(
        search,
        s.studentName,
        s.studentId,
        studentRef(s),
        classLabel(s),
        sectionLabel(s),
        user?.role === "teacher" ? undefined : s.phone,
      ),
    );
  }, [students, search, studentFilter, user?.role]);

  const visibleSummary = useMemo(() => {
    const counts = { present: 0, absent: 0, leave: 0, late: 0, unmarked: 0 };
    studentsFiltered.forEach((s) => {
      const rec = recordMap.get(s._id);
      if (!rec) counts.unmarked += 1;
      else if (rec.status in counts) (counts as Record<string, number>)[rec.status] += 1;
    });
    return counts;
  }, [studentsFiltered, recordMap]);

  const handleExport = async (format: AttendanceExportFormat) => {
    setExporting(format);
    const preview = openReportPreviewTab(format);
    try {
      const blob = await exportAcademyAttendance(
        {
          date,
          classId: classFilter || undefined,
          sectionId: sectionFilter || undefined,
          sessionId: classFilter ? undefined : apiSessionId,
          studentId: studentFilter || undefined,
        },
        format,
      );
      const mode = deliverReportBlob(
        blob,
        `Student-Attendance_${date}.${format}`,
        format,
        preview,
      );
      toast({
        title: mode === "preview" ? "Report preview opened" : "Excel downloaded",
        description:
          mode === "preview" ? "Use Print or Download from the preview window." : undefined,
      });
    } catch {
      preview?.close();
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  const mark = (studentId: string, status: "present" | "absent" | "late" | "leave") => {
    if (!writable) {
      toast({
        title: "Read-only session",
        description: "Switch to the active session to mark attendance.",
        variant: "destructive",
      });
      return;
    }
    markMut.mutate({ studentId, status }, { onSuccess: () => toast({ title: `Marked ${status}` }) });
  };

  const colSpan = canMark ? 7 : 6;

  return (
    <div>
      <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        <Card className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
                <ClipboardList className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
              </span>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight">
                  Student Attendance
                </h1>
                <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500 max-w-xl">
                  Mark daily attendance for students by class and section.
                </p>
              </div>
            </div>
            <div className="shrink-0 rounded-lg bg-primary/10 px-3 py-2 max-w-[14rem]">
              <p className="text-xs sm:text-sm italic leading-snug text-[#1a2b4b]/80">
                <span className="mr-1 text-primary not-italic font-serif text-base leading-none">
                  &ldquo;
                </span>
                Consistency builds excellence.
                <span className="ml-0.5 text-primary not-italic font-serif text-base leading-none">
                  &rdquo;
                </span>
              </p>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-2 xl:grid-cols-5 gap-3 sm:gap-4">
          <PanelStatCard
            label="Present"
            value={visibleSummary.present}
            hint={date}
            icon={CheckCircle2}
            iconWrapClass="bg-[#d1fae5]"
            iconClass="text-[#059669]"
          />
          <PanelStatCard
            label="Late"
            value={visibleSummary.late}
            hint="Today"
            icon={Clock3}
            iconWrapClass="bg-[#fef3c7]"
            iconClass="text-[#d97706]"
          />
          <PanelStatCard
            label="Absent"
            value={visibleSummary.absent}
            hint="Today"
            icon={UserX}
            iconWrapClass="bg-[#ffe4e6]"
            iconClass="text-[#e11d48]"
          />
          <PanelStatCard
            label="Leave"
            value={visibleSummary.leave}
            hint="Today"
            icon={Palmtree}
            iconWrapClass="bg-[#dbeafe]"
            iconClass="text-[#2563eb]"
          />
          <PanelStatCard
            label="Unmarked"
            value={visibleSummary.unmarked}
            hint="Need marking"
            icon={ClipboardList}
            iconWrapClass="bg-[#ede9fe]"
            iconClass="text-[#7c3aed]"
          />
        </div>

        <Card className="p-3 sm:p-4 shadow-sm border-border/80">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm shrink-0"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Date"
            />
            <ClassProgramSelect
              className="w-[16.5rem] shrink-0"
              label={false}
              value={classFilter}
              onChange={setClassFilter}
              classes={classes}
              allowAll
              disabled={!hasScope}
              selectClassName="rounded-md border-input h-10"
            />
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm w-[10rem] shrink-0"
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              disabled={!classFilter || sections.length === 0}
              aria-label="Section filter"
            >
              <option value="">{classFilter ? "All Sections" : "Select class first"}</option>
              {sections.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.sectionName}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm min-w-[12rem] shrink-0"
              value={studentFilter}
              onChange={(e) => setStudentFilter(e.target.value)}
              disabled={!classFilter}
              aria-label="Student filter"
            >
              <option value="">{classFilter ? "All students" : "Select class first"}</option>
              {students.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.studentName}
                  {studentRef(s) ? ` (${studentRef(s)})` : ""}
                </option>
              ))}
            </select>
            <PanelSearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search student, class, or section…"
              className="min-w-[12rem] flex-1 max-w-md"
            />
            <div className="flex flex-wrap items-center gap-2 shrink-0 ml-auto">
              <DefaulterListDownload
                size="default"
                label="Print / Export"
                exporting={exporting}
                disabled={!hasScope}
                onDownload={(format) => void handleExport(format)}
              />
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-border font-semibold text-primary">
            Student attendance — {date}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3">Student</th>
                  <th className="text-left px-4 py-3">Class</th>
                  <th className="text-left px-4 py-3">Section</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">First check-in</th>
                  <th className="text-left px-4 py-3">Last check-out</th>
                  {canMark && <th className="text-right px-4 py-3">Mark</th>}
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={colSpan} className="px-4 py-8 text-center text-muted-foreground">
                      Loading students…
                    </td>
                  </tr>
                )}
                {isError && (
                  <tr>
                    <td colSpan={colSpan} className="px-4 py-8 text-center text-destructive">
                      {(error as Error).message}
                    </td>
                  </tr>
                )}
                {!isLoading && !isError && studentsFiltered.length === 0 && (
                  <tr>
                    <td colSpan={colSpan} className="px-4 py-8 text-center text-muted-foreground">
                      {students.length === 0
                        ? "No active academy students for this session. Register students in Student Records."
                        : "No students match your search."}
                    </td>
                  </tr>
                )}
                {studentsFiltered.map((s) => {
                  const cur = recordMap.get(s._id)?.status;
                  const record = recordMap.get(s._id);
                  return (
                    <tr key={s._id} className="border-t border-border">
                      <td className="px-4 py-3 font-medium text-primary">{s.studentName}</td>
                      <td className="px-4 py-3">{classLabel(s)}</td>
                      <td className="px-4 py-3">{sectionLabel(s)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-semibold rounded-full px-2 py-0.5 ${
                            cur === "present"
                              ? "bg-accent/15 text-accent"
                              : cur === "absent"
                                ? "bg-destructive/15 text-destructive"
                                : cur === "leave" || cur === "late"
                                  ? "bg-primary/15 text-primary"
                                  : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {cur || "unmarked"}
                        </span>
                        {record?.source === "ai" && (
                          <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary/80">
                            AI
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{fmtTime(record?.checkIn)}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{fmtTime(record?.checkOut)}</td>
                      {canMark && (
                        <td className="px-4 py-3 text-right whitespace-nowrap space-x-1">
                          <Button
                            size="sm"
                            variant={cur === "present" ? "hero" : "outline"}
                            disabled={markMut.isPending}
                            onClick={() => mark(s._id, "present")}
                          >
                            P
                          </Button>
                          <Button
                            size="sm"
                            variant={cur === "late" ? "hero" : "outline"}
                            disabled={markMut.isPending}
                            onClick={() => mark(s._id, "late")}
                          >
                            Late
                          </Button>
                          <Button
                            size="sm"
                            variant={cur === "absent" ? "hero" : "outline"}
                            disabled={markMut.isPending}
                            onClick={() => mark(s._id, "absent")}
                          >
                            A
                          </Button>
                          <Button
                            size="sm"
                            variant={cur === "leave" ? "hero" : "outline"}
                            disabled={markMut.isPending}
                            onClick={() => mark(s._id, "leave")}
                          >
                            L
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

const AttendanceModule = ({ perm: _perm, caps }: { perm: PermLevel; caps: ModuleActionCaps }) => {
  const { user } = useAuth();
  if (user?.role === "parent") {
    return <ParentAttendancePanel />;
  }
  return <StaffAttendanceModule caps={caps} />;
};

export default AttendanceModule;
