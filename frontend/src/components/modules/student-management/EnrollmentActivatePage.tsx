import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { EnrollmentVoucherWizard } from "./EnrollmentVoucherWizard";
import type { AcademyStudentRoutes } from "@/lib/studentManagementMenus";

/** Registration → Activate: pay-first enrollment voucher wizard. */
export default function EnrollmentActivatePage({
  studentId,
  routes,
}: {
  studentId: string;
  routes?: AcademyStudentRoutes;
}) {
  const navigate = useNavigate();
  const listHref = routes?.list ?? "../";

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-4 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-[#0B2347]">Complete enrollment</h1>
        <p className="mt-1 text-sm text-slate-500">
          Select subjects, generate an unpaid fee voucher, mark payment, then assign a section.
        </p>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => navigate(listHref)}>
          Back to registration
        </Button>
      </div>
      <EnrollmentVoucherWizard
        open
        initialStudentId={studentId}
        onOpenChange={(open) => {
          if (!open) navigate(listHref);
        }}
      />
    </div>
  );
}
