import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, BookOpen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { fetchSessions, fetchAssessmentDateSheet, type DateSheetRow } from "@/lib/configApi";
import { fetchAcademyClasses } from "@/lib/studentManagementApi";
import PanelToolbar from "@/components/modules/PanelToolbar";
import { matchesPanelSearch } from "@/lib/panelSearch";

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return value;
  }
}

export default function DateSheetPanel() {
  const { data: sessions = [] } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: () => fetchSessions(),
  });

  const activeId = useMemo(() => {
    const active = sessions.find((s) => s.isActive);
    return active?._id || sessions[0]?._id || "";
  }, [sessions]);

  const [sessionId, setSessionId] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [search, setSearch] = useState("");

  const effectiveSessionId = sessionId || activeId;

  const { data: classes = [] } = useQuery({
    queryKey: ["academy-classes", effectiveSessionId],
    queryFn: () => fetchAcademyClasses({ sessionId: effectiveSessionId, status: "active" }),
    enabled: Boolean(effectiveSessionId),
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["assessment-date-sheet", effectiveSessionId, classFilter],
    queryFn: () =>
      fetchAssessmentDateSheet(effectiveSessionId, {
        classId: classFilter || undefined,
      }),
    enabled: Boolean(effectiveSessionId),
    retry: false,
  });

  const rows = useMemo(() => {
    const list = data?.rows || [];
    if (!search.trim()) return list;
    return list.filter((r: DateSheetRow) =>
      matchesPanelSearch(search, [
        r.testName,
        r.subjectName,
        r.className,
        r.sectionName,
        r.syllabus,
        r.assessmentTypeLabel,
      ]),
    );
  }, [data, search]);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-primary flex items-center gap-2">
          <CalendarDays className="h-5 w-5" />
          Date sheet
        </h2>
        <p className="text-sm text-muted-foreground">
          Published test and exam schedule — dates, syllabus, and marks totals for parents and staff.
        </p>
      </div>

      <PanelToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Search subject, test, syllabus…">
        <div className="space-y-1">
          <Label className="sr-only">Session</Label>
          <Select
            value={effectiveSessionId || "_"}
            onValueChange={(v) => setSessionId(v === "_" ? "" : v)}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Session" />
            </SelectTrigger>
            <SelectContent>
              {sessions.map((s) => (
                <SelectItem key={s._id} value={s._id}>
                  {s.name}
                  {s.isActive ? " (active)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="sr-only">Class</Label>
          <Select value={classFilter || "_all"} onValueChange={(v) => setClassFilter(v === "_all" ? "" : v)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All classes</SelectItem>
              {classes.map((c) => (
                <SelectItem key={c._id} value={c._id}>
                  {c.className}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </PanelToolbar>

      <Card className="overflow-hidden">
        {isLoading && <p className="p-6 text-sm text-muted-foreground">Loading date sheet…</p>}
        {isError && (
          <p className="p-6 text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "No published date sheet for this session."}
          </p>
        )}
        {!isLoading && !isError && data && (
          <>
            <div className="px-4 py-3 border-b flex flex-wrap gap-2 items-center bg-secondary/30">
              <span className="font-semibold text-sm text-primary">{data.session?.name}</span>
              {data.publishedAt && (
                <Badge variant="secondary" className="text-[10px]">
                  Published {formatDate(data.publishedAt)}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">{rows.length} paper(s)</span>
            </div>
            {rows.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">No papers match your filters.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left bg-muted/40">
                      <th className="p-3 font-medium">Date</th>
                      <th className="p-3 font-medium">Test / Exam</th>
                      <th className="p-3 font-medium">Class</th>
                      <th className="p-3 font-medium">Subject</th>
                      <th className="p-3 font-medium">Marks</th>
                      <th className="p-3 font-medium">Syllabus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, idx) => (
                      <tr key={`${r.testName}-${r.subjectId}-${idx}`} className="border-t align-top">
                        <td className="p-3 whitespace-nowrap">{formatDate(r.examDate)}</td>
                        <td className="p-3">
                          <div className="font-medium">{r.testName}</div>
                          <div className="text-xs text-muted-foreground">{r.assessmentTypeLabel}</div>
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {r.className}
                          {r.sectionName ? ` · ${r.sectionName}` : ""}
                        </td>
                        <td className="p-3 font-medium">{r.subjectName}</td>
                        <td className="p-3">{r.totalMarks}</td>
                        <td className="p-3 text-muted-foreground max-w-xs">
                          {r.syllabus ? (
                            <span className="inline-flex gap-1">
                              <BookOpen className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                              {r.syllabus}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
