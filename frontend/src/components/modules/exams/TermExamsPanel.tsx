import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import type { ModuleActionCaps } from "@/lib/permissions";
import { examMarksHref } from "@/lib/testExamsMenus";
import AssignAssessmentsPanel from "@/components/modules/exams/AssignAssessmentsPanel";

/** Exams catalog / assign list — marks entry lives on `/exams/term-exams/:examId`. */
export default function TermExamsPanel({ caps }: { caps: ModuleActionCaps }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role;

  return (
    <AssignAssessmentsPanel
      caps={caps}
      category="exam"
      onEnterExam={(examId, subjectId) => {
        if (!role) return;
        navigate(examMarksHref(role, examId, subjectId));
      }}
    />
  );
}
