import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import type { ModuleActionCaps, PermLevel } from "@/lib/permissions";
import {
  DEFAULT_TEST_EXAMS_SECTION,
  findTestExamsSection,
  isClassTestId,
  isClassTestSeriesId,
  isExamId,
  isTestExamsSection,
  testExamsHref,
  type TestExamsSection,
} from "@/lib/testExamsMenus";
import ClassTestMarksPage from "./exams/ClassTestMarksPage";
import ClassTestSeriesPage from "./exams/ClassTestSeriesPage";
import ClassTestsPanel from "./exams/ClassTestsPanel";
import TermExamsPanel from "./exams/TermExamsPanel";
import ExamMarksPage from "./exams/ExamMarksPage";
import DateSheetPanel from "./exams/DateSheetPanel";
import DateSheetDetailPage from "./exams/DateSheetDetailPage";
import ReportCardPanel from "./exams/ReportCardPanel";
import ReportCardDetailPage from "./exams/ReportCardDetailPage";
import ParentExamsPanel from "./parent/ParentExamsPanel";
import ParentDateSheetPanel from "./parent/ParentDateSheetPanel";
import ParentReportCardPanel from "./parent/ParentReportCardPanel";

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
  const isParent = role === "parent";

  if (!sectionParam || sectionParam === "assign") {
    return <Navigate to={DEFAULT_TEST_EXAMS_SECTION} replace />;
  }

  // Parents: child results only — never staff scheduling / marks entry screens.
  if (isParent) {
    if (!isTestExamsSection(sectionParam) || action) {
      return <Navigate to={role ? testExamsHref(role, "term-exams") : ".."} replace />;
    }
    const section: TestExamsSection = findTestExamsSection(sectionParam);
    if (section === "date-sheet") {
      return <ParentDateSheetPanel />;
    }
    if (section === "report-card") {
      return <ParentReportCardPanel />;
    }
    // ParentExamsPanel owns its own page padding.
    return <ParentExamsPanel section={section} />;
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

  if (sectionParam === "term-exams" && action && isExamId(action)) {
    if (!role) return null;
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <ExamMarksPage examId={action} role={role} caps={caps} />
      </div>
    );
  }

  if (sectionParam === "term-exams" && action) {
    return <Navigate to={role ? testExamsHref(role, "term-exams") : ".."} replace />;
  }

  if (
    sectionParam === "date-sheet" &&
    action === "batch" &&
    subAction &&
    isClassTestId(subAction)
  ) {
    if (!role) return null;
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <DateSheetDetailPage paperId={subAction} role={role} />
      </div>
    );
  }

  if (sectionParam === "date-sheet" && action) {
    return <Navigate to={role ? testExamsHref(role, "date-sheet") : ".."} replace />;
  }

  if (
    sectionParam === "report-card" &&
    (action === "test" || action === "exam") &&
    subAction &&
    isClassTestId(subAction)
  ) {
    if (!role) return null;
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <ReportCardDetailPage kind={action} id={subAction} role={role} caps={caps} />
      </div>
    );
  }

  if (sectionParam === "report-card" && action) {
    return <Navigate to={role ? testExamsHref(role, "report-card") : ".."} replace />;
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
      {section === "report-card" && <ReportCardPanel caps={caps} />}
    </div>
  );
};

export default ExamsModule;
