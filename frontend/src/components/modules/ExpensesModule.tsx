import type { ModuleActionCaps, PermLevel } from "@/lib/permissions";
import AcademyExpensesManagement from "@/components/modules/student-management/AcademyExpensesManagement";

/** Panel Academy expenses — operating costs from the API */
const ExpensesModule = ({ perm: _perm, caps }: { perm: PermLevel; caps: ModuleActionCaps }) => {
  return <AcademyExpensesManagement caps={caps} />;
};

export default ExpensesModule;
