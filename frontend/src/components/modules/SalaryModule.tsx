import type { ModuleActionCaps, PermLevel } from "@/lib/permissions";
import AcademySalaryManagement from "@/components/modules/student-management/AcademySalaryManagement";
import AcademySalaryDetailPage from "@/components/modules/student-management/AcademySalaryDetailPage";
import { Navigate, useParams } from "react-router-dom";
import type { Role } from "@/lib/auth";
import { advanceDetailHref, advancesHref } from "@/lib/panelMenus";

/** Panel Teacher salary — live staff payroll from the API */
const SalaryModule = ({
  perm: _perm,
  caps,
  section,
  action,
}: {
  perm: PermLevel;
  caps: ModuleActionCaps;
  section?: string;
  action?: string;
}) => {
  const { role: roleParam } = useParams<{ role: string }>();
  const role = (roleParam || "admin") as Role;
  // Old links: /salary/advances[/:id] → Advances & Loans module (own permission)
  if (section === "advances") {
    const id = action && /^[a-f0-9]{24}$/i.test(action) ? action : undefined;
    return <Navigate to={id ? advanceDetailHref(role, id) : advancesHref(role)} replace />;
  }

  // /panel/:role/salary/:salaryId → voucher detail page
  if (section && /^[a-f0-9]{24}$/i.test(section)) {
    return <AcademySalaryDetailPage salaryId={section} />;
  }

  return <AcademySalaryManagement caps={caps} />;
};

export default SalaryModule;
