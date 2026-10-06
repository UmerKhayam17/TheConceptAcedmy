const ApiError = require('../../utils/ApiError');
const AcademyFeeStructure = require('../../models/academy/AcademyFeeStructure');
const AcademyClass = require('../../models/academy/AcademyClass');
const AcademyStudent = require('../../models/academy/AcademyStudent');

async function listAll({ status, classId } = {}) {
  const q = {};
  if (status) q.status = status;
  if (classId) q.classId = classId;
  return AcademyFeeStructure.find(q)
    .populate('classId', 'className status')
    .populate('createdBy', 'name email')
    .sort({ classId: 1, effectiveDate: -1, createdAt: -1 });
}

async function getByClass(classId) {
  const cls = await AcademyClass.findById(classId);
  if (!cls) throw new ApiError(404, 'Class not found');
  const row = await AcademyFeeStructure.findOne({ classId, status: 'active' })
    .sort({ effectiveDate: -1 })
    .populate('classId', 'className')
    .populate('createdBy', 'name email');
  return row;
}

async function createStructure(payload, userId) {
  const cls = await AcademyClass.findById(payload.classId);
  if (!cls) throw new ApiError(404, 'Class not found');
  if (payload.status !== 'inactive') {
    await AcademyFeeStructure.updateMany(
      { classId: payload.classId, status: 'active' },
      { $set: { status: 'inactive' } }
    );
  }
  return AcademyFeeStructure.create({
    ...payload,
    createdBy: userId,
    effectiveDate: payload.effectiveDate || new Date(),
  });
}

async function updateStructure(id, payload) {
  const doc = await AcademyFeeStructure.findById(id);
  if (!doc) throw new ApiError(404, 'Fee structure not found');
  if (payload.perSubjectFee !== undefined) doc.perSubjectFee = payload.perSubjectFee;
  if (payload.fullPackageFee !== undefined) doc.fullPackageFee = payload.fullPackageFee;
  if (payload.admissionFee !== undefined) doc.admissionFee = payload.admissionFee;
  if (payload.effectiveDate) doc.effectiveDate = payload.effectiveDate;
  if (payload.status) {
    if (payload.status === 'active') {
      await AcademyFeeStructure.updateMany(
        { classId: doc.classId, status: 'active', _id: { $ne: id } },
        { $set: { status: 'inactive' } }
      );
    }
    doc.status = payload.status;
  }
  await doc.save();
  return doc.populate('classId', 'className');
}

function calculateFeesFromStructure(feeStructure, { selectedSubjectIds, isFullPackage }) {
  let monthlyFee;
  if (isFullPackage) {
    monthlyFee = feeStructure.fullPackageFee;
  } else {
    const count = Array.isArray(selectedSubjectIds) ? selectedSubjectIds.length : 0;
    if (count === 0 && !isFullPackage) {
      throw new ApiError(400, 'Select at least one subject or enroll in full package');
    }
    monthlyFee = count * feeStructure.perSubjectFee;
  }
  const admissionFee = feeStructure.admissionFee;
  return { monthlyFee, admissionFee, subtotal: monthlyFee + admissionFee };
}

/** Apply PKR discounts.
 *  First month (enrollment): monthly + admission − discounts → totalFee
 *  Later months: monthly − monthlyFeeDiscount (applied in fee generation)
 *  List prices stay on the student for reporting.
 */
function applyDiscount(fees, discountOptions = {}) {
  const subtotal = fees.subtotal ?? fees.monthlyFee + fees.admissionFee;
  const monthlyInput = Math.max(0, Number(discountOptions.monthlyFeeDiscount) || 0);
  const admissionInput = Math.max(0, Number(discountOptions.admissionFeeDiscount) || 0);
  const legacyInput = Math.max(0, Number(discountOptions.discountAmount) || 0);

  if (monthlyInput > 0 || admissionInput > 0) {
    const monthlyFeeDiscount = Math.min(monthlyInput, fees.monthlyFee);
    const admissionFeeDiscount = Math.min(admissionInput, fees.admissionFee);
    const discountAmount = monthlyFeeDiscount + admissionFeeDiscount;
    return {
      monthlyFee: fees.monthlyFee,
      admissionFee: fees.admissionFee,
      subtotal,
      monthlyFeeDiscount,
      admissionFeeDiscount,
      discountAmount,
      totalFee: Math.max(0, subtotal - discountAmount),
    };
  }

  const applied = Math.min(legacyInput, subtotal);
  return {
    monthlyFee: fees.monthlyFee,
    admissionFee: fees.admissionFee,
    subtotal,
    monthlyFeeDiscount: 0,
    admissionFeeDiscount: 0,
    discountAmount: applied,
    totalFee: Math.max(0, subtotal - applied),
  };
}

function calculateFeesWithDiscount(feeStructure, options) {
  const base = calculateFeesFromStructure(feeStructure, options);
  return applyDiscount(base, options);
}

async function previewFees({
  classId,
  selectedSubjects,
  isFullPackage,
  discountAmount,
  monthlyFeeDiscount,
  admissionFeeDiscount,
}) {
  const feeStructure = await getByClass(classId);
  if (!feeStructure) throw new ApiError(400, 'No active fee structure for this class');
  const fees = calculateFeesWithDiscount(feeStructure, {
    selectedSubjectIds: selectedSubjects,
    isFullPackage,
    discountAmount,
    monthlyFeeDiscount,
    admissionFeeDiscount,
  });
  return {
    ...fees,
    feeStructureId: feeStructure._id,
    perSubjectFee: feeStructure.perSubjectFee,
    fullPackageFee: feeStructure.fullPackageFee,
  };
}

async function deleteStructure(id) {
  const doc = await AcademyFeeStructure.findById(id);
  if (!doc) throw new ApiError(404, 'Fee structure not found');
  const activeStudents = await AcademyStudent.countDocuments({
    classId: doc.classId,
    feeStructureId: id,
    status: 'active',
  });
  if (activeStudents > 0) {
    throw new ApiError(400, 'Cannot delete fee structure linked to active students');
  }
  await doc.deleteOne();
  return { deleted: true };
}

module.exports = {
  listAll,
  getByClass,
  createStructure,
  updateStructure,
  deleteStructure,
  calculateFeesFromStructure,
  applyDiscount,
  calculateFeesWithDiscount,
  previewFees,
};
