import type { ModuleActionCaps, PermLevel } from "@/lib/permissions";
import AcademySalaryManagement from "@/components/modules/student-management/AcademySalaryManagement";

/** Panel Teacher salary — live staff payroll from the API */
const SalaryModule = ({ perm: _perm, caps }: { perm: PermLevel; caps: ModuleActionCaps }) => {
  return <AcademySalaryManagement caps={caps} />;
};

export default SalaryModule;
