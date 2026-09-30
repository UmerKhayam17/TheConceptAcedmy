import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import type { ModuleActionCaps } from "@/lib/permissions";
import {
  DEFAULT_SYSTEM_CONFIG_SECTION,
  findSystemConfigSection,
  isSessionMongoId,
  type SystemConfigSection,
} from "@/lib/systemConfigMenus";
import { useSessionScope } from "@/components/modules/timetable/SessionBar";
import AcademicSetupTab from "@/components/modules/timetable/AcademicSetupTab";
import SectionsTab from "@/components/modules/timetable/SectionsTab";
import PeriodsTab from "@/components/modules/timetable/PeriodsTab";
import RoomsTab from "@/components/modules/timetable/RoomsTab";
import TeacherProfilesTab from "@/components/modules/timetable/TeacherProfilesTab";
import AssignmentsTab from "@/components/modules/timetable/AssignmentsTab";
import TimetableSettingsTab from "@/components/modules/timetable/TimetableSettingsTab";
import SessionHistoryTab from "@/components/modules/timetable/SessionHistoryTab";
import SessionDetailPage from "@/components/modules/timetable/SessionDetailPage";
import AssessmentsConfigTab from "@/components/modules/timetable/AssessmentsConfigTab";
import { usePanelSession } from "@/components/panel-header/PanelSessionContext";

const SystemConfigModule = ({
  caps,
  section: sectionParam,
  action,
}: {
  caps: ModuleActionCaps;
  section?: string;
  action?: string;
}) => {
  const isDetailView = sectionParam === "academic" && action && isSessionMongoId(action);
  const { sessionId, setSessionId, headerSearch, setHeaderSearch } = usePanelSession();
  const { isAll, writable } = useSessionScope(sessionId);

  useEffect(() => {
    if (isDetailView && action && action !== sessionId) {
      setSessionId(action);
    }
  }, [isDetailView, action, sessionId, setSessionId]);

  if (sectionParam === "assessments") {
    return <Navigate to="../test-catalog" replace />;
  }

  if (sectionParam === "teacher-assignments") {
    return <Navigate to="../subject-teachers" replace />;
  }

  if (!caps.canView) {
    return (
      <p className="p-6 text-muted-foreground text-sm">You do not have access to system configuration.</p>
    );
  }

  if (isDetailView) {
    return <SessionDetailPage sessionId={action} caps={caps} />;
  }

  const section: SystemConfigSection = sectionParam
    ? findSystemConfigSection(sectionParam)
    : DEFAULT_SYSTEM_CONFIG_SECTION;

  if (sectionParam && sectionParam !== section) {
    return <Navigate to={`../${section}`} replace />;
  }

  const needsSession = section !== "history";
  const editCaps: ModuleActionCaps = writable
    ? caps
    : { ...caps, canCreate: false, canEdit: false, canDelete: false };

  return (
    <div>
      {needsSession && isAll && section !== "academic" ? (
        <p className="px-4 sm:px-6 lg:px-8 py-8 text-sm text-muted-foreground">
          Pick a specific academic session to manage timetable setup. Use Student Management or Fees with “All sessions” to search across years.
        </p>
      ) : (
        <>
          {section === "academic" && (
            <AcademicSetupTab sessionId={isAll ? "" : sessionId} caps={caps} onSessionCreated={setSessionId} />
          )}
          {section === "test-catalog" && (
            <AssessmentsConfigTab sessionId={sessionId} caps={editCaps} category="test" />
          )}
          {section === "exam-catalog" && (
            <AssessmentsConfigTab sessionId={sessionId} caps={editCaps} category="exam" />
          )}
          {section === "sections" && <SectionsTab sessionId={sessionId} caps={editCaps} />}
          {section === "periods" && <PeriodsTab sessionId={sessionId} caps={editCaps} />}
          {section === "rooms" && <RoomsTab sessionId={sessionId} caps={editCaps} />}
          {section === "teachers" && <TeacherProfilesTab sessionId={sessionId} caps={editCaps} />}
          {section === "subject-teachers" && (
            <AssignmentsTab
              sessionId={sessionId}
              caps={editCaps}
              search={headerSearch}
              onSearchChange={setHeaderSearch}
              hidePageTitle
            />
          )}
          {section === "timetable-rules" && <TimetableSettingsTab sessionId={sessionId} caps={editCaps} />}
          {section === "history" && <SessionHistoryTab caps={caps} />}
        </>
      )}
    </div>
  );
};

export default SystemConfigModule;
