import type { ModuleActionCaps, PermLevel } from "@/lib/permissions";
import AcademySalaryManagement from "@/components/modules/student-management/AcademySalaryManagement";
import AcademySalaryDetailPage from "@/components/modules/student-management/AcademySalaryDetailPage";

/** Panel Teacher salary — live staff payroll from the API */
const SalaryModule = ({
  perm: _perm,
  caps,
  section,
}: {
  perm: PermLevel;
  caps: ModuleActionCaps;
  section?: string;
}) => {
  // /panel/:role/salary/:salaryId → voucher detail page
  if (section && /^[a-f0-9]{24}$/i.test(section)) {
    return <AcademySalaryDetailPage salaryId={section} />;
  }

  return <AcademySalaryManagement caps={caps} />;
};

export default SalaryModule;
