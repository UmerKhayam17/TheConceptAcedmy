import { Card } from "@/components/ui/card";
import type { ModuleActionCaps, ModuleKey } from "@/lib/permissions";
import { MODULES } from "@/lib/permissions";

const COPY: Partial<Record<ModuleKey, { title: string; body: string }>> = {
  "my-classes": {
    title: "My Classes",
    body: "Classes assigned to you will appear here. Assignments come from Teacher Assignments in Academic Setup.",
  },
  "my-subjects": {
    title: "My Subjects",
    body: "Subjects you teach will appear here based on your teacher assignments.",
  },
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
    title: "My Attendance",
    body: "View your attendance from the biometric system and request corrections if needed.",
  },
};

/** Lightweight teacher-portal pages until full feature UIs are built. */
export default function TeacherFeatureModule({
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
    <div className="px-4 sm:px-6 lg:px-8 py-6">
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
    </div>
  );
}
