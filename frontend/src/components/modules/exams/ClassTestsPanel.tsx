import AssignAssessmentsPanel from "@/components/modules/exams/AssignAssessmentsPanel";
import type { ModuleActionCaps } from "@/lib/permissions";

export default function ClassTestsPanel({ caps }: { caps: ModuleActionCaps }) {
  return <AssignAssessmentsPanel caps={caps} category="test" />;
}
