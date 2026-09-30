import { Navigate } from "react-router-dom";
import type { ModuleActionCaps, PermLevel } from "@/lib/permissions";
import {
  academyStudentRoutes,
  DEFAULT_STUDENT_MANAGEMENT_SECTION,
  findStudentManagementSection,
  isAcademyClassId,
  isAcademyStudentId,
  studentManagementHref,
  type StudentManagementSection,
} from "@/lib/studentManagementMenus";
import { useAuth } from "@/hooks/useAuth";
import { usePanelSession } from "@/components/panel-header/PanelSessionContext";
import ClassesTab from "@/components/modules/student-management/ClassesTab";
import SectionsTab from "@/components/modules/student-management/SectionsTab";
import SubjectsTab from "@/components/modules/student-management/SubjectsTab";
import FeeStructureTab from "@/components/modules/student-management/FeeStructureTab";
import RegistrationTab from "@/components/modules/student-management/RegistrationTab";
import RegisterStudentPage from "@/components/modules/student-management/RegisterStudentPage";
import StudentDetailPage from "@/components/modules/student-management/StudentDetailPage";
import ClassDetailPage from "@/components/modules/student-management/ClassDetailPage";

const StudentManagementModule = ({
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
  const role = user?.role ?? "admin";
  const { sessionId } = usePanelSession();

  const registrationRoutes = user?.role ? academyStudentRoutes(user.role, "registration") : null;
  const registrationList = registrationRoutes?.list ?? "../registration";

  const renderBody = () => {
    if (sectionParam === "fees" || sectionParam === "fee-defaulters") {
      return <Navigate to={`/panel/${role}/fees`} replace />;
    }

    if (sectionParam === "registration") {
      if (action === "new") {
        return <Navigate to={`${registrationList}?intake=1`} replace />;
      }
      if (action && isAcademyStudentId(action)) {
        if (subAction === "activate") {
          if (!caps.canEdit) return <Navigate to={registrationRoutes?.detail(action) ?? registrationList} replace />;
          return (
            <RegisterStudentPage
              caps={caps}
              studentId={action}
              mode="activate"
              routes={registrationRoutes ?? undefined}
              sessionId={sessionId}
            />
          );
        }
        if (subAction === "edit") {
          if (!caps.canEdit) return <Navigate to={`../${action}`} replace />;
          return (
            <RegisterStudentPage
              caps={caps}
              studentId={action}
              routes={registrationRoutes ?? undefined}
              sessionId={sessionId}
            />
          );
        }
        if (subAction) return <Navigate to={`../${action}`} replace />;
        return (
          <StudentDetailPage
            caps={caps}
            studentId={action}
            routes={registrationRoutes ?? undefined}
          />
        );
      }
      if (action) return <Navigate to={registrationList} replace />;
      return <RegistrationTab caps={caps} routes={registrationRoutes ?? undefined} sessionId={sessionId} enrollmentFlow="intake" />;
    }

    if (sectionParam === "classes") {
      if (action && isAcademyClassId(action)) {
        return <ClassDetailPage caps={caps} classId={action} />;
      }
      if (action) {
        return <Navigate to={studentManagementHref(role, "classes")} replace />;
      }
      return <ClassesTab caps={caps} sessionId={sessionId} />;
    }

    const section: StudentManagementSection = sectionParam
      ? findStudentManagementSection(sectionParam)
      : DEFAULT_STUDENT_MANAGEMENT_SECTION;

    if (sectionParam && sectionParam !== section) {
      return <Navigate to={`../${section}`} replace />;
    }

    if (section === "classes") return <ClassesTab caps={caps} sessionId={sessionId} />;
    if (section === "sections") return <SectionsTab caps={caps} sessionId={sessionId} />;
    if (section === "subjects") return <SubjectsTab caps={caps} sessionId={sessionId} />;
    if (section === "fees-structure") return <FeeStructureTab caps={caps} sessionId={sessionId} />;
    if (section === "registration") {
      return <RegistrationTab caps={caps} routes={registrationRoutes ?? undefined} sessionId={sessionId} enrollmentFlow="intake" />;
    }
    return null;
  };

  return <div>{renderBody()}</div>;
};

export default StudentManagementModule;
