import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import ParentDashboard from "@/components/modules/ParentDashboard";

/**
 * My Children — same parent dashboard as home, scoped to linked students.
 * Sidebar links use ?student=<id> so the named child is selected.
 */
export default function ParentChildrenPage({ studentId }: { studentId?: string }) {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const fromQuery = params.get("student") || undefined;
  const resolvedId = studentId || fromQuery;

  useEffect(() => {
    if (!resolvedId) return;
    try {
      localStorage.setItem("parent_selected_student_id", resolvedId);
    } catch {
      /* ignore */
    }
  }, [resolvedId]);

  return <ParentDashboard name={user?.name || "Parent"} studentId={resolvedId} />;
}
