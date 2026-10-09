import type { AdditionalCharge, AcademyFeeRecord, AcademyStudent } from "@/lib/studentManagementApi";

function sameId(a: unknown, b: unknown) {
  if (!a || !b) return false;
  const left = typeof a === "object" && a && "_id" in a ? (a as { _id: string })._id : a;
  const right = typeof b === "object" && b && "_id" in b ? (b as { _id: string })._id : b;
  return String(left) === String(right);
}

function includesId(list: unknown[] | undefined, value: unknown) {
  return Array.isArray(list) && list.some((id) => sameId(id, value));
}

/** Mirror of backend chargeApplies — whether a charge can be offered for this student/month. */
export function chargeAppliesToStudent(
  charge: AdditionalCharge,
  student: Pick<AcademyStudent, "_id" | "classId" | "sectionId"> | null | undefined,
  month: number
) {
  if (!charge || charge.status === "inactive" || !student) return false;
  if (charge.frequency === "selected_months") {
    const months = (charge.months || []).map(Number);
    if (!months.includes(Number(month))) return false;
  }
  if (charge.applicability === "students") {
    return includesId(charge.studentIds as unknown[], student._id);
  }
  if (charge.applicability === "class") {
    const classId =
      typeof student.classId === "object" && student.classId
        ? (student.classId as { _id?: string })._id || student.classId
        : student.classId;
    if (!includesId(charge.classIds as unknown[], classId)) return false;
    if (Array.isArray(charge.sectionIds) && charge.sectionIds.length) {
      const sectionId =
        typeof student.sectionId === "object" && student.sectionId
          ? (student.sectionId as { _id?: string })._id || student.sectionId
          : student.sectionId;
      return includesId(charge.sectionIds as unknown[], sectionId);
    }
    return true;
  }
  return true;
}

/** Charges that apply to at least one of the given fee months for this student. */
export function applicableChargesForFees(
  charges: AdditionalCharge[],
  student: AcademyStudent | null | undefined,
  fees: Pick<AcademyFeeRecord, "month" | "feeType">[]
) {
  const months = [...new Set(fees.map((f) => Number(f.month)).filter(Boolean))];
  return charges.filter(
    (charge) =>
      charge.status === "active" &&
      months.some((month) => chargeAppliesToStudent(charge, student, month))
  );
}

/** Tuition + admission only (strip previously selected charge lines). */
export function baseFeeAmount(fee: AcademyFeeRecord) {
  const comps = fee.components || [];
  if (!comps.length) return Number(fee.amount) || 0;
  return comps
    .filter((line) => line.kind !== "charge")
    .reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
}

export function chargeIdsOnFee(fee: AcademyFeeRecord) {
  return (fee.components || [])
    .filter((line) => line.kind === "charge" && line.chargeId)
    .map((line) => String(line.chargeId));
}

/** Recalculate a fee amount from base + checked charges that apply to its month. */
export function feeAmountWithCharges(
  fee: AcademyFeeRecord,
  student: AcademyStudent | null | undefined,
  charges: AdditionalCharge[],
  selectedChargeIds: string[]
) {
  const selected = new Set(selectedChargeIds.map(String));
  let total = baseFeeAmount(fee);
  for (const charge of charges) {
    if (!selected.has(charge._id)) continue;
    if (!chargeAppliesToStudent(charge, student, fee.month)) continue;
    total += Number(charge.amount) || 0;
  }
  return Math.round(total * 100) / 100;
}
