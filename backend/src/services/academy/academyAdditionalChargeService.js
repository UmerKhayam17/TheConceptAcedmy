const ApiError = require('../../utils/ApiError');
const AcademyAdditionalCharge = require('../../models/academy/AcademyAdditionalCharge');

function idList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => String(id)).filter(Boolean))];
}

function normalizePayload(payload, { partial = false } = {}) {
  const next = {};
  if (payload.name !== undefined) {
    const name = String(payload.name || '').trim();
    if (!name) throw new ApiError(400, 'Charge name is required');
    next.name = name;
  } else if (!partial) {
    throw new ApiError(400, 'Charge name is required');
  }

  if (payload.amount !== undefined) {
    const amount = Math.round(Number(payload.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount < 0) throw new ApiError(400, 'Amount must be 0 or more');
    next.amount = amount;
  } else if (!partial) {
    throw new ApiError(400, 'Amount is required');
  }

  if (payload.frequency !== undefined) {
    if (!['every_month', 'selected_months'].includes(payload.frequency)) {
      throw new ApiError(400, 'Frequency must be every month or selected months');
    }
    next.frequency = payload.frequency;
  }

  if (payload.months !== undefined) {
    const months = idList(payload.months).map(Number).filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);
    next.months = [...new Set(months)].sort((a, b) => a - b);
  }

  if (payload.applicability !== undefined) {
    if (!['all', 'class', 'students'].includes(payload.applicability)) {
      throw new ApiError(400, 'Choose who this charge applies to');
    }
    next.applicability = payload.applicability;
  }

  if (payload.classIds !== undefined) next.classIds = idList(payload.classIds);
  if (payload.sectionIds !== undefined) next.sectionIds = idList(payload.sectionIds);
  if (payload.studentIds !== undefined) next.studentIds = idList(payload.studentIds);
  if (payload.status !== undefined) {
    if (!['active', 'inactive'].includes(payload.status)) throw new ApiError(400, 'Invalid status');
    next.status = payload.status;
  }

  const frequency = next.frequency;
  const months = next.months;
  if (frequency === 'selected_months' && months && months.length === 0) {
    throw new ApiError(400, 'Select at least one month');
  }
  return next;
}

function sameId(a, b) {
  if (!a || !b) return false;
  const left = typeof a === 'object' && a._id ? a._id : a;
  const right = typeof b === 'object' && b._id ? b._id : b;
  return String(left) === String(right);
}

function includesId(list, value) {
  return Array.isArray(list) && list.some((id) => sameId(id, value));
}

/** Whether this charge should be added to the given month's monthly fee. */
function chargeApplies(charge, student, month) {
  if (!charge || charge.status === 'inactive') return false;
  const m = Number(month);
  if (charge.frequency === 'selected_months') {
    const months = Array.isArray(charge.months) ? charge.months.map(Number) : [];
    if (!months.includes(m)) return false;
  }

  if (charge.applicability === 'students') {
    return includesId(charge.studentIds, student?._id);
  }
  if (charge.applicability === 'class') {
    if (!includesId(charge.classIds, student?.classId)) return false;
    if (Array.isArray(charge.sectionIds) && charge.sectionIds.length) {
      return includesId(charge.sectionIds, student?.sectionId);
    }
    return true;
  }
  return true;
}

function componentFromCharge(charge) {
  const amount = Math.round(Number(charge.amount) * 100) / 100;
  return {
    name: charge.name,
    amount,
    kind: 'charge',
    chargeId: charge._id,
  };
}

async function listCharges({ status } = {}) {
  const q = {};
  if (status) q.status = status;
  return AcademyAdditionalCharge.find(q)
    .populate('classIds', 'className')
    .populate('sectionIds', 'sectionName')
    .populate('studentIds', 'studentName studentId')
    .sort({ name: 1 });
}

async function listActiveCharges() {
  return AcademyAdditionalCharge.find({ status: 'active' }).sort({ name: 1 });
}

async function createCharge(payload, userId) {
  const body = normalizePayload(payload);
  if (body.frequency === 'selected_months' && (!body.months || !body.months.length)) {
    throw new ApiError(400, 'Select at least one month');
  }
  if (body.applicability === 'class' && (!body.classIds || !body.classIds.length)) {
    throw new ApiError(400, 'Select at least one class');
  }
  if (body.applicability === 'students' && (!body.studentIds || !body.studentIds.length)) {
    throw new ApiError(400, 'Select at least one student');
  }
  return AcademyAdditionalCharge.create({
    name: body.name,
    amount: body.amount,
    frequency: body.frequency || 'every_month',
    months: body.months || [],
    applicability: body.applicability || 'all',
    classIds: body.classIds || [],
    sectionIds: body.sectionIds || [],
    studentIds: body.studentIds || [],
    status: body.status || 'active',
    createdBy: userId,
  });
}

async function updateCharge(id, payload) {
  const doc = await AcademyAdditionalCharge.findById(id);
  if (!doc) throw new ApiError(404, 'Charge not found');
  const body = normalizePayload(payload, { partial: true });
  Object.assign(doc, body);
  if (doc.frequency === 'selected_months' && (!doc.months || !doc.months.length)) {
    throw new ApiError(400, 'Select at least one month');
  }
  if (doc.applicability === 'class' && (!doc.classIds || !doc.classIds.length)) {
    throw new ApiError(400, 'Select at least one class');
  }
  if (doc.applicability === 'students' && (!doc.studentIds || !doc.studentIds.length)) {
    throw new ApiError(400, 'Select at least one student');
  }
  await doc.save();
  return doc;
}

async function deleteCharge(id) {
  const doc = await AcademyAdditionalCharge.findById(id);
  if (!doc) throw new ApiError(404, 'Charge not found');
  await AcademyAdditionalCharge.deleteOne({ _id: id });
  return { deleted: true };
}

module.exports = {
  chargeApplies,
  componentFromCharge,
  listCharges,
  listActiveCharges,
  createCharge,
  updateCharge,
  deleteCharge,
};
