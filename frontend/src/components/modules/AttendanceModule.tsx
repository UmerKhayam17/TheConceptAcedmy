import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Download, FileSpreadsheet, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ModuleActionCaps, PermLevel } from "@/lib/permissions";
import { useToast } from "@/hooks/use-toast";
import PanelToolbar from "@/components/modules/PanelToolbar";
import { matchesPanelSearch } from "@/lib/panelSearch";
import {
  exportAcademyAttendance,
  fetchAcademyAttendanceDay,
  fetchAcademyClasses,
  fetchAcademyStudents,
  fetchSectionsByClass,
  markAcademyAttendance,
  type AcademyAttendanceRecord,
  type AcademyStudent,
  type AttendanceExportFormat,
} from "@/lib/studentManagementApi";
import { useAuth } from "@/hooks/useAuth";
import SessionBar, { useActiveSessionId, useSessionScope } from "@/components/modules/timetable/SessionBar";
import { localTodayYmd } from "@/lib/localDate";

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

const AttendanceModule = ({ perm: _perm, caps }: { perm: PermLevel; caps: ModuleActionCaps }) => {
  const { user } = useAuth();
  const isParent = user?.role === "parent";
  const { toast } = useToast();
  const qc = useQueryClient();
  const [sessionId, setSessionId] = useState("");
  useActiveSessionId(sessionId, setSessionId);
  const { apiSessionId, writable, hasScope } = useSessionScope(sessionId);

  const [date, setDate] = useState(today());
  const [classFilter, setClassFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [studentFilter, setStudentFilter] = useState("");
  const [exporting, setExporting] = useState<AttendanceExportFormat | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string>(() => {
    try {
      return localStorage.getItem("parent_selected_student_id") || "";
    } catch {
      return "";
    }
  });
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
    enabled: !isParent && hasScope,
  });

  const { data: sections = [] } = useQuery({
    queryKey: ["academy-sections-attendance", classFilter],
    queryFn: () => fetchSectionsByClass(classFilter, { status: "active" }),
    enabled: !isParent && Boolean(classFilter),
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["academy-attendance-day", date, sessionId, classFilter, sectionFilter, isParent, selectedStudentId],
    queryFn: () =>
      fetchAcademyAttendanceDay({
        date,
        classId: isParent ? undefined : classFilter || undefined,
        sectionId: isParent ? undefined : sectionFilter || undefined,
        sessionId: isParent || classFilter ? undefined : apiSessionId,
        studentId: isParent ? selectedStudentId || undefined : undefined,
      }),
    enabled: isParent ? Boolean(selectedStudentId) : hasScope,
  });

  const { data: parentStudents = [] } = useQuery({
    queryKey: ["parent-students-attendance"],
    queryFn: async () => {
      const r = await fetchAcademyStudents({ page: 1, limit: 200, status: "active" });
      return r.students;
    },
    enabled: isParent,
    retry: false,
  });

  useEffect(() => {
    if (!isParent) return;
    try {
      localStorage.setItem("parent_selected_student_id", selectedStudentId || "");
    } catch {
      // ignore
    }
  }, [isParent, selectedStudentId]);

  useEffect(() => {
    if (!isParent) return;
    if (!parentStudents.length) {
      if (selectedStudentId) setSelectedStudentId("");
      return;
    }
    if (!selectedStudentId || !parentStudents.some((s) => s._id === selectedStudentId)) {
      setSelectedStudentId(parentStudents[0]._id);
    }
  }, [isParent, parentStudents, selectedStudentId]);

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
    if (isParent && selectedStudentId) {
      base = students.filter((s) => s._id === selectedStudentId);
    } else if (studentFilter) {
      base = students.filter((s) => s._id === studentFilter);
    }
    if (!search.trim()) return base;
    return base.filter((s) =>
      matchesPanelSearch(search, s.studentName, s.studentId, studentRef(s), classLabel(s), sectionLabel(s), s.phone)
    );
  }, [students, search, isParent, selectedStudentId, studentFilter]);

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
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = format === "pdf" ? `attendance-${date}.pdf` : `attendance-${date}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: format === "pdf" ? "PDF downloaded" : "Excel downloaded" });
    } catch {
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
    markMut.mutate(
      { studentId, status },
      { onSuccess: () => toast({ title: `Marked ${status}` }) }
    );
  };

  const colSpan = canMark ? 7 : 6;

  return (
    <div>
      {!isParent && <SessionBar sessionId={sessionId} onSessionChange={setSessionId} />}
      <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Present</div>
            <div className="font-display text-2xl font-bold text-accent">
              {visibleSummary.present}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Late</div>
            <div className="font-display text-2xl font-bold text-primary">
              {visibleSummary.late}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Absent</div>
            <div className="font-display text-2xl font-bold text-destructive">
              {visibleSummary.absent}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Leave</div>
            <div className="font-display text-2xl font-bold text-primary">
              {visibleSummary.leave}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Unmarked</div>
            <div className="font-display text-2xl font-bold text-muted-foreground">
              {visibleSummary.unmarked}
            </div>
          </Card>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Date</label>
            <input
              type="date"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          {isParent ? (
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Child</label>
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm min-w-[14rem]"
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
              >
                <option value="">Select child…</option>
                {parentStudents.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.studentName} ({s.studentId})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Class</label>
                <select
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm min-w-[10rem]"
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                  disabled={!hasScope}
                >
                  <option value="">All classes</option>
                  {classes.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.className}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Section</label>
                <select
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm min-w-[8rem]"
                  value={sectionFilter}
                  onChange={(e) => setSectionFilter(e.target.value)}
                  disabled={!classFilter || sections.length === 0}
                >
                  <option value="">{classFilter ? "All sections" : "Select class first"}</option>
                  {sections.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.sectionName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Student</label>
                <select
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm min-w-[14rem]"
                  value={studentFilter}
                  onChange={(e) => setStudentFilter(e.target.value)}
                  disabled={!classFilter}
                >
                  <option value="">{classFilter ? "All students" : "Select class first"}</option>
                  {students.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.studentName}
                      {studentRef(s) ? ` (${studentRef(s)})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1 h-9" disabled={!!exporting || !hasScope}>
                    <Download className="h-4 w-4" />
                    {exporting ? "Exporting…" : "Export"}
                    <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem className="gap-2" onClick={() => void handleExport("xlsx")}>
                    <FileSpreadsheet className="h-4 w-4" />
                    Excel (.xlsx)
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2" onClick={() => void handleExport("pdf")}>
                    <FileText className="h-4 w-4" />
                    PDF report
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>

        <PanelToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search student, class, or section…"
        />

        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-border font-semibold text-primary">
            Attendance — {date}
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
                          className={`text-xs font-semibold rounded-full px-2 py-0.5 ${cur === "present"
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
};

export default AttendanceModule;
