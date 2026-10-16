import { Navigate } from "react-router-dom";
import type { ModuleActionCaps, PermLevel } from "@/lib/permissions";
import {
  academyStudentRoutes,
  isAcademyStudentId,
} from "@/lib/studentManagementMenus";
import { useAuth } from "@/hooks/useAuth";
import { usePanelSession } from "@/components/panel-header/PanelSessionContext";
import RegistrationTab from "@/components/modules/student-management/RegistrationTab";
import RegisterStudentPage from "@/components/modules/student-management/RegisterStudentPage";
import StudentDetailPage from "@/components/modules/student-management/StudentDetailPage";
import ParentChildrenPage from "@/components/modules/parent/ParentChildrenPage";

/** Student Records — enrollment for staff; linked children for parents. */
const StudentsRecordsModule = ({
  caps,
  section,
  action,
}: {
  perm: PermLevel;
  caps: ModuleActionCaps;
  section?: string;
  action?: string;
}) => {
  const { user } = useAuth();
  const role = user?.role ?? "admin";
  const isParent = role === "parent";
  const { sessionId } = usePanelSession();

  const routes = user?.role ? academyStudentRoutes(user.role, "records") : null;
  const listHref = routes?.list ?? "..";

  const body = (() => {
    if (isParent) {
      if (section === "register" || section === "new") {
        return <Navigate to={listHref} replace />;
      }
      if (section && isAcademyStudentId(section)) {
        if (action === "activate" || action === "edit") {
          return <Navigate to={routes?.detail(section) ?? listHref} replace />;
        }
        if (action) return <Navigate to={routes?.detail(section) ?? listHref} replace />;
        return <StudentDetailPage caps={caps} studentId={section} routes={routes ?? undefined} />;
      }
      if (section) return <Navigate to={listHref} replace />;
      // My Children → same parent dashboard, with student name chips
      return <ParentChildrenPage />;
    }

    if (section === "register") {
      if (!caps.canEdit) return <Navigate to={listHref} replace />;
      return (
        <RegisterStudentPage
          caps={caps}
          routes={routes ?? undefined}
          sessionId={sessionId}
          mode="direct"
        />
      );
    }

    if (section === "new") {
      return <Navigate to={`${listHref}?intake=1`} replace />;
    }

    if (section && isAcademyStudentId(section)) {
      if (action === "activate") {
        if (!caps.canEdit) return <Navigate to={routes?.detail(section) ?? listHref} replace />;
        return (
          <RegisterStudentPage
            caps={caps}
            studentId={section}
            mode="activate"
            routes={routes ?? undefined}
            sessionId={sessionId}
          />
        );
      }
      if (action === "edit") {
        if (!caps.canEdit) return <Navigate to={routes?.detail(section) ?? listHref} replace />;
        return <RegisterStudentPage caps={caps} studentId={section} routes={routes ?? undefined} sessionId={sessionId} />;
      }
      if (action) return <Navigate to={routes?.detail(section) ?? listHref} replace />;
      return <StudentDetailPage caps={caps} studentId={section} routes={routes ?? undefined} />;
    }

    if (section) return <Navigate to={listHref} replace />;

    return (
      <RegistrationTab
        caps={caps}
        routes={routes ?? undefined}
        sessionId={sessionId}
        heading="Students"
        showHeading
        enrollmentFlow="both"
        emptyHint="No students on record yet."
      />
    );
  })();

  return <div>{body}</div>;
};

export default StudentsRecordsModule;
