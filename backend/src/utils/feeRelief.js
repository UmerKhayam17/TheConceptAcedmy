/**
 * Tuition relief description shared by reports, exports, student record, parent portal
 * and fee vouchers / receipts.
 *
 * Three kinds, at most one per student:
 *  - concession: category % off tuition (feeReliefType 'concession', or an old record that has a category)
 *  - exemption:  fixed PKR off tuition with a recorded reason
 *  - legacy:     a monthly discount saved before relief types existed — no category, no reason.
 *                The fixed PKR amount stays authoritative; the % is indicative (display only).
 */

const STUDENT_RELIEF_FIELDS =
  'feeReliefType concessionCategory concessionPercent exemptionRemarks monthlyFee monthlyFeeDiscount';

function effectiveReliefType(student = {}) {
  if (student.feeReliefType === 'concession' || student.feeReliefType === 'exemption') {
    return student.feeReliefType;
  }
  if (student.concessionCategory) return 'concession';
  if (Number(student.monthlyFeeDiscount) > 0) return 'legacy';
  return '';
}

/** Discount as a rounded % of the monthly fee (display only). */
function indicativePercent(amount, monthlyFee) {
  const fee = Number(monthlyFee) || 0;
  if (!fee || !(amount > 0)) return 0;
  return Math.round((amount / fee) * 100);
}

/**
 * @param {object} student lean or hydrated AcademyStudent
 * @param {Record<string,string>} [categoryNames] concession key → display name
 */
function describeFeeRelief(student = {}, categoryNames = {}) {
  const type = effectiveReliefType(student);
  const monthly = Math.max(0, Number(student.monthlyFee) || 0);
  const discount = Math.max(0, Number(student.monthlyFeeDiscount) || 0);
  const amount = type ? (monthly ? Math.min(discount, monthly) : discount) : 0;
  const categoryKey = type === 'concession' ? String(student.concessionCategory || '') : '';
  const categoryName = categoryKey ? categoryNames[categoryKey] || categoryKey : '';
  const percent = type === 'concession' ? Number(student.concessionPercent) || 0 : 0;
  const remarks = type === 'exemption' ? String(student.exemptionRemarks || '').trim() : '';
  const approxPercent = indicativePercent(amount, monthly);

  let typeLabel = '';
  let detail = '';
  if (type === 'concession') {
    typeLabel = 'Concession';
    detail = categoryName ? `${categoryName}${percent ? ` (${percent}%)` : ''}` : percent ? `${percent}%` : 'no category';
  } else if (type === 'exemption') {
    typeLabel = 'Exemption';
    detail = remarks;
  } else if (type === 'legacy') {
    typeLabel = 'Legacy discount';
    detail = approxPercent ? `≈${approxPercent}% of current fee` : '';
  }

  const label = type === 'legacy'
    ? approxPercent ? `Legacy discount (≈${approxPercent}%)` : 'Legacy discount'
    : typeLabel ? (detail ? `${typeLabel} — ${detail}` : typeLabel) : '';

  return {
    feeReliefType: type,
    reliefTypeLabel: typeLabel,
    concessionCategory: categoryKey,
    concessionCategoryName: categoryName,
    concessionPercent: percent,
    exemptionRemarks: remarks,
    reliefAmount: amount,
    /** Discount ÷ current monthly fee — informational only, never saved. */
    indicativePercent: approxPercent,
    /** Staff-facing label (reports, exports, student pages). */
    reliefLabel: label,
    /** Label for parents and printed challans / receipts: a legacy discount is just "Discount". */
    publicLabel: type === 'legacy' ? 'Discount' : label,
  };
}

module.exports = { STUDENT_RELIEF_FIELDS, effectiveReliefType, indicativePercent, describeFeeRelief };
