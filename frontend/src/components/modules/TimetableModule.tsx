import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import type { Role } from "@/lib/auth";
import type { ModuleActionCaps } from "@/lib/permissions";
import {
  defaultTimetableSection,
  findTimetableSection,
  getTimetableSections,
  type TimetableSection,
} from "@/lib/timetableMenus";
import { useSessionScope } from "@/components/modules/timetable/SessionBar";
import { usePanelSession } from "@/components/panel-header/PanelSessionContext";
import GridTab from "@/components/modules/timetable/GridTab";
import MyScheduleTab from "@/components/modules/timetable/MyScheduleTab";
import ViewScheduleTab from "@/components/modules/timetable/ViewScheduleTab";

const TimetableModule = ({
  caps,
  section: sectionParam,
  role,
}: {
  caps: ModuleActionCaps;
  section?: string;
  role: Role;
}) => {
  const { user } = useAuth();
  const { sessionId } = usePanelSession();
  const { isAll, writable } = useSessionScope(sessionId);

  const canManage = (caps.canEdit || caps.canCreate) && writable;
  const isTeacher = user?.role === "teacher";
  const section: TimetableSection = sectionParam
    ? findTimetableSection(sectionParam, { caps, role })
    : defaultTimetableSection({ caps, role });

  const allowed = getTimetableSections({ caps, role }).map((s) => s.key);
  if (sectionParam && !allowed.includes(sectionParam as TimetableSection)) {
    return <Navigate to={`../${section}`} replace />;
  }

  return (
    <>
      {isAll ? (
        <p className="px-4 sm:px-6 lg:px-8 py-8 text-sm text-muted-foreground">
          Pick a specific academic session to view or edit timetables. “All sessions” is for searchable lists in Student Management and Fees.
        </p>
      ) : (
        <>
          {section === "builder" && canManage && <GridTab sessionId={sessionId} caps={caps} />}
          {section === "builder" && !canManage && (
            <p className="px-4 sm:px-6 lg:px-8 py-8 text-sm text-muted-foreground">
              Timetable builder is available on the active session only. Switch to the active session to edit, or open View schedule to browse this session.
            </p>
          )}
          {section === "view" && <ViewScheduleTab sessionId={sessionId} />}
          {section === "mine" && (isTeacher || caps.canEdit || caps.canCreate) && (
            <MyScheduleTab sessionId={sessionId} />
          )}
        </>
      )}
    </>
  );
};

export default TimetableModule;
