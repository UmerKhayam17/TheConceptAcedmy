import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import type { ModuleActionCaps, PermLevel } from "@/lib/permissions";
import {
  DEFAULT_TEST_EXAMS_SECTION,
  findTestExamsSection,
  isClassTestId,
  isClassTestSeriesId,
  isTestExamsSection,
  testExamsHref,
  type TestExamsSection,
} from "@/lib/testExamsMenus";
import ClassTestMarksPage from "./exams/ClassTestMarksPage";
import ClassTestSeriesPage from "./exams/ClassTestSeriesPage";
import ClassTestsPanel from "./exams/ClassTestsPanel";
import TermExamsPanel from "./exams/TermExamsPanel";
import DateSheetPanel from "./exams/DateSheetPanel";

const ExamsModule = ({
  perm: _perm,
  caps,
  section: sectionParam,
  action,
  subAction,
}: {
  perm: PermLevel;
  caps: ModuleActionCaps;
  section?: string;
  action?: string;
  subAction?: string;
}) => {
  const { user } = useAuth();
  const role = user?.role;

  if (!sectionParam || sectionParam === "assign") {
    return <Navigate to={DEFAULT_TEST_EXAMS_SECTION} replace />;
  }

  if (sectionParam === "enter-tests" && action === "series" && subAction && isClassTestSeriesId(subAction)) {
    if (!role) return null;
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <ClassTestSeriesPage seriesId={subAction} role={role} caps={caps} />
      </div>
    );
  }

  if (sectionParam === "enter-tests" && action && isClassTestId(action)) {
    if (!role) return null;
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <ClassTestMarksPage testId={action} role={role} caps={caps} />
      </div>
    );
  }

  if (sectionParam === "enter-tests" && action) {
    return <Navigate to={role ? testExamsHref(role, "enter-tests") : ".."} replace />;
  }

  if (!isTestExamsSection(sectionParam)) {
    return <Navigate to={`../${DEFAULT_TEST_EXAMS_SECTION}`} replace />;
  }

  const section: TestExamsSection = findTestExamsSection(sectionParam);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6">
      {section === "enter-tests" && <ClassTestsPanel caps={caps} />}
      {section === "term-exams" && <TermExamsPanel caps={caps} />}
      {section === "date-sheet" && <DateSheetPanel />}
    </div>
  );
};

export default ExamsModule;
