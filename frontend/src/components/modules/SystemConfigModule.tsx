import { useState } from "react";
import { Navigate } from "react-router-dom";
import type { ModuleActionCaps } from "@/lib/permissions";
import {
  DEFAULT_SYSTEM_CONFIG_SECTION,
  findSystemConfigSection,
  isSessionMongoId,
  type SystemConfigSection,
} from "@/lib/systemConfigMenus";
import SessionBar, { useActiveSessionId, useSessionScope } from "@/components/modules/timetable/SessionBar";
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
  const [sessionId, setSessionId] = useState(isDetailView ? action : "");
  useActiveSessionId(sessionId, setSessionId);
  const { isAll, writable } = useSessionScope(sessionId);

  if (sectionParam === "assessments") {
    return <Navigate to="../test-catalog" replace />;
  }

  if (!caps.canView) {
    return (
      <p className="p-6 text-muted-foreground text-sm">You do not have access to system configuration.</p>
    );
  }

  if (isDetailView) {
    return (
      <div>
        <SessionBar sessionId={sessionId} onSessionChange={setSessionId} allowAllSessions={false} />
        <SessionDetailPage sessionId={action} caps={caps} />
      </div>
    );
  }

  const section: SystemConfigSection = sectionParam
    ? findSystemConfigSection(sectionParam)
    : DEFAULT_SYSTEM_CONFIG_SECTION;

  if (sectionParam && sectionParam !== section) {
    return <Navigate to={`../${section}`} replace />;
  }

  const needsSession = section !== "history";
  /** Edit caps only when the selected session is writable (active). */
  const editCaps: ModuleActionCaps = writable
    ? caps
    : { ...caps, canCreate: false, canEdit: false, canDelete: false };

  return (
    <div>
      {needsSession && <SessionBar sessionId={sessionId} onSessionChange={setSessionId} />}
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
          {section === "teacher-assignments" && <AssignmentsTab sessionId={sessionId} caps={editCaps} />}
          {section === "timetable-rules" && <TimetableSettingsTab sessionId={sessionId} caps={editCaps} />}
          {section === "history" && <SessionHistoryTab caps={caps} />}
        </>
      )}
    </div>
  );
};

export default SystemConfigModule;
