import { useAuth } from "@/hooks/useAuth";
import ParentDashboard from "@/components/modules/ParentDashboard";

/**
 * My Children — same parent dashboard as home, scoped to linked students.
 * Student names appear as chips on the dashboard; selecting one swaps the view.
 */
export default function ParentChildrenPage({ studentId }: { studentId?: string }) {
  const { user } = useAuth();
  return <ParentDashboard name={user?.name || "Parent"} studentId={studentId} />;
}
