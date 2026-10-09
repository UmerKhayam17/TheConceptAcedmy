import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, GraduationCap, Layers } from "lucide-react";
import { Card } from "@/components/ui/card";
import { usePanelSession } from "@/components/panel-header/PanelSessionContext";
import type { ModuleActionCaps, ModuleKey } from "@/lib/permissions";
import { MODULES } from "@/lib/permissions";
import { fetchTeacherAssignments, type TeacherAssignment } from "@/lib/timetableApi";
import { isAllSessions } from "@/lib/configApi";

const COPY: Partial<Record<ModuleKey, { title: string; body: string }>> = {
  homework: {
    title: "Homework / Assignments",
    body: "Create, edit, and delete homework for your assigned classes and subjects.",
  },
  "study-materials": {
    title: "Study Materials",
    body: "Upload and manage study materials for your classes.",
  },
  "lesson-plans": {
    title: "Lesson Plans",
    body: "Create and view lesson plans for your teaching schedule.",
  },
  "student-progress": {
    title: "Student Progress",
    body: "View progress reports for students in your assigned classes.",
  },
  behaviour: {
    title: "Behaviour / Discipline",
    body: "Add behaviour notes and disciplinary remarks for your students.",
  },
  "parent-meetings": {
    title: "Parent Meetings",
    body: "Schedule and manage parent–teacher meeting records.",
  },
  "online-classes": {
    title: "Online Classes",
    body: "Create and manage online class sessions (optional).",
  },
  library: {
    title: "Library",
    body: "View books issued to you from the school library.",
  },
  "school-calendar": {
    title: "School Calendar",
    body: "View school events and the academic calendar.",
  },
  notifications: {
    title: "Notifications",
    body: "View your in-app notifications.",
  },
  leave: {
    title: "Leave Management",
    body: "Apply for leave and track approval status.",
  },
  "staff-attendance": {
    title: "Teacher Attendance",
    body: "View and mark your attendance (manual time in / out and AI check-in).",
  },
};

function refId(ref: { _id: string } | string | undefined | null) {
  if (!ref) return "";
  return typeof ref === "object" ? ref._id : String(ref);
}

function refName(ref: { _id: string; name?: string } | string | undefined | null) {
  if (!ref) return "—";
  if (typeof ref === "object") return ref.name || "—";
  return String(ref);
}

function refCode(ref: { _id: string; name?: string; code?: string } | string | undefined | null) {
  if (!ref || typeof ref !== "object") return "";
  return ref.code || "";
}

type ClassRow = {
  key: string;
  classId: string;
  className: string;
  sectionId: string;
  sectionName: string;
  subjects: { subjectId: string; subjectName: string; subjectCode: string }[];
};

type SubjectRow = {
  key: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  placements: { className: string; sectionName: string }[];
};

function groupByClass(assignments: TeacherAssignment[]): ClassRow[] {
  const map = new Map<string, ClassRow>();
  for (const a of assignments) {
    const classId = refId(a.class);
    const sectionId = refId(a.section);
    const key = `${classId}:${sectionId}`;
    let row = map.get(key);
    if (!row) {
      row = {
        key,
        classId,
        className: refName(a.class),
        sectionId,
        sectionName: refName(a.section),
        subjects: [],
      };
      map.set(key, row);
    }
    const subjectId = refId(a.subject);
    if (subjectId && !row.subjects.some((s) => s.subjectId === subjectId)) {
      row.subjects.push({
        subjectId,
        subjectName: refName(a.subject),
        subjectCode: refCode(a.subject),
      });
    }
  }
  return [...map.values()].sort((a, b) =>
    `${a.className} ${a.sectionName}`.localeCompare(`${b.className} ${b.sectionName}`),
  );
}

function groupBySubject(assignments: TeacherAssignment[]): SubjectRow[] {
  const map = new Map<string, SubjectRow>();
  for (const a of assignments) {
    const subjectId = refId(a.subject);
    if (!subjectId) continue;
    let row = map.get(subjectId);
    if (!row) {
      row = {
        key: subjectId,
        subjectId,
        subjectName: refName(a.subject),
        subjectCode: refCode(a.subject),
        placements: [],
      };
      map.set(subjectId, row);
    }
    const className = refName(a.class);
    const sectionName = refName(a.section);
    const placeKey = `${className}|${sectionName}`;
    if (!row.placements.some((p) => `${p.className}|${p.sectionName}` === placeKey)) {
      row.placements.push({ className, sectionName });
    }
  }
  return [...map.values()].sort((a, b) => a.subjectName.localeCompare(b.subjectName));
}

function useMyAssignments() {
  const { sessionId, apiSessionId, hasScope } = usePanelSession();
  const needsConcreteSession = !apiSessionId || isAllSessions(sessionId);

  const query = useQuery({
    queryKey: ["my-teacher-assignments", apiSessionId],
    queryFn: () => fetchTeacherAssignments({ sessionId: apiSessionId! }),
    enabled: Boolean(apiSessionId) && !isAllSessions(sessionId),
  });

  return { ...query, needsConcreteSession, hasScope, sessionId };
}

function MyClassesPanel() {
  const { data: assignments = [], isLoading, isError, error, needsConcreteSession, hasScope } =
    useMyAssignments();
  const rows = useMemo(() => groupByClass(assignments), [assignments]);

  if (!hasScope || needsConcreteSession) {
    return (
      <EmptyState message="Select an academic session in the header to see your assigned classes." />
    );
  }
  if (isLoading) return <EmptyState message="Loading your classes…" />;
  if (isError) {
    return (
      <EmptyState
        message={(error as Error)?.message || "Could not load your class assignments."}
        tone="error"
      />
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState message="No classes assigned yet. Ask admin to assign you subjects in Academic Setup → Assign Subject Teachers." />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold text-primary">My Classes</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Classes and sections assigned to you for this session.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          {rows.length} class{rows.length === 1 ? "" : "es"} / section{rows.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <Card key={row.key} className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700">
                <GraduationCap className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-900 truncate">{row.className}</h3>
                <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <Layers className="h-3.5 w-3.5" />
                  Section {row.sectionName}
                </p>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
                Subjects you teach ({row.subjects.length})
              </p>
              <ul className="space-y-1">
                {row.subjects.map((s) => (
                  <li
                    key={s.subjectId}
                    className="text-sm rounded-md border bg-muted/30 px-2.5 py-1.5 flex items-center justify-between gap-2"
                  >
                    <span className="font-medium truncate">{s.subjectName}</span>
                    {s.subjectCode ? (
                      <span className="text-xs font-mono text-muted-foreground shrink-0">
                        {s.subjectCode}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function MySubjectsPanel() {
  const { data: assignments = [], isLoading, isError, error, needsConcreteSession, hasScope } =
    useMyAssignments();
  const rows = useMemo(() => groupBySubject(assignments), [assignments]);

  if (!hasScope || needsConcreteSession) {
    return (
      <EmptyState message="Select an academic session in the header to see your assigned subjects." />
    );
  }
  if (isLoading) return <EmptyState message="Loading your subjects…" />;
  if (isError) {
    return (
      <EmptyState
        message={(error as Error)?.message || "Could not load your subject assignments."}
        tone="error"
      />
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState message="No subjects assigned yet. Ask admin to assign you subjects in Academic Setup → Assign Subject Teachers." />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold text-primary">My Subjects</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Subjects you teach, with the classes and sections for each.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          {rows.length} subject{rows.length === 1 ? "" : "s"}
        </p>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left p-3 font-medium">Subject</th>
                <th className="text-left p-3 font-medium">Code</th>
                <th className="text-left p-3 font-medium">Taught in</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="p-3 font-medium">
                    <span className="inline-flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-blue-600 shrink-0" />
                      {row.subjectName}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">
                    {row.subjectCode || "—"}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1.5">
                      {row.placements.map((p) => (
                        <span
                          key={`${p.className}-${p.sectionName}`}
                          className="inline-flex items-center rounded-full border bg-background px-2.5 py-0.5 text-xs"
                        >
                          {p.className}
                          {p.sectionName !== "—" ? ` · ${p.sectionName}` : ""}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function EmptyState({
  message,
  tone = "muted",
}: {
  message: string;
  tone?: "muted" | "error";
}) {
  return (
    <Card className="p-8 text-center">
      <p className={tone === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
        {message}
      </p>
    </Card>
  );
}

function ComingSoonCard({
  moduleKey,
  caps,
}: {
  moduleKey: ModuleKey;
  caps: ModuleActionCaps;
}) {
  const mod = MODULES.find((m) => m.key === moduleKey);
  const copy = COPY[moduleKey] || {
    title: mod?.label || "Module",
    body: mod?.desc || "This module is available based on your permissions.",
  };

  return (
    <Card className="p-6 space-y-3 max-w-2xl">
      <h2 className="text-xl font-semibold text-primary">{copy.title} — Coming soon</h2>
      <p className="text-sm text-muted-foreground">{copy.body}</p>
      <p className="text-xs text-muted-foreground">
        Access:{" "}
        {[
          caps.canView && "View",
          caps.canCreate && "Create",
          caps.canEdit && "Edit",
          caps.canDelete && "Delete",
        ]
          .filter(Boolean)
          .join(", ") || "None"}
      </p>
    </Card>
  );
}

/** Teacher portal pages — My Classes / My Subjects load live assignment data. */
export default function TeacherFeatureModule({
  moduleKey,
  caps,
}: {
  moduleKey: ModuleKey;
  caps: ModuleActionCaps;
}) {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6">
      {moduleKey === "my-classes" ? (
        <MyClassesPanel />
      ) : moduleKey === "my-subjects" ? (
        <MySubjectsPanel />
      ) : (
        <ComingSoonCard moduleKey={moduleKey} caps={caps} />
      )}
    </div>
  );
}
