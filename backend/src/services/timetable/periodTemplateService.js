const PeriodTemplate = require('../../models/timetable/PeriodTemplate');
const ApiError = require('../../utils/ApiError');
const { assertSessionWritable } = require('../session/sessionGuard');

function parseTimeToMinutes(value) {
  if (typeof value !== 'string') throw new ApiError(400, 'Invalid time format');
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) throw new ApiError(400, `Invalid time value "${value}"`);
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatMinutesToTime(minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function sortBreaks(breaks) {
  return [...breaks]
    .map((br) => ({
      ...br,
      startMinutes: parseTimeToMinutes(br.startTime),
      endMinutes: parseTimeToMinutes(br.endTime),
    }))
    .sort((a, b) => a.startMinutes - b.startMinutes);
}

function validateBreakRanges(startMinutes, endMinutes, breaks) {
  const sorted = sortBreaks(breaks);
  let previousEnd = startMinutes;
  for (const br of sorted) {
    if (br.startMinutes < startMinutes || br.endMinutes > endMinutes) {
      throw new ApiError(400, `Break "${br.breakName}" must fall within academy hours`);
    }
    if (br.endMinutes <= br.startMinutes) {
      throw new ApiError(400, `Break "${br.breakName}" end time must be later than its start time`);
    }
    if (br.startMinutes < previousEnd) {
      throw new ApiError(400, `Break "${br.breakName}" overlaps with another break`);
    }
    previousEnd = br.endMinutes;
  }
  return sorted;
}

function generatePeriodSlots({ academyStartTime, academyEndTime, periodDurationMinutes, breaks = [] }) {
  if (!academyStartTime || !academyEndTime) {
    throw new ApiError(400, 'Academy start and end times are required');
  }

  const startMinutes = parseTimeToMinutes(academyStartTime);
  const endMinutes = parseTimeToMinutes(academyEndTime);
  if (endMinutes <= startMinutes) {
    throw new ApiError(400, 'Academy end time must be later than academy start time');
  }

  if (!Number.isInteger(periodDurationMinutes) || periodDurationMinutes <= 0) {
    throw new ApiError(400, 'Subject period duration must be a positive integer');
  }

  const sortedBreaks = validateBreakRanges(startMinutes, endMinutes, breaks);
  const slots = [];
  let periodCount = 1;
  let cursor = startMinutes;

  const addLectureSegment = (segmentEnd) => {
    if (segmentEnd <= cursor) return cursor;
    while (cursor + periodDurationMinutes <= segmentEnd) {
      slots.push({
        order: slots.length + 1,
        label: `Period ${periodCount}`,
        startTime: formatMinutesToTime(cursor),
        endTime: formatMinutesToTime(cursor + periodDurationMinutes),
        type: 'lecture',
      });
      cursor += periodDurationMinutes;
      periodCount += 1;
    }
    if (cursor < segmentEnd) {
      slots.push({
        order: slots.length + 1,
        label: `Period ${periodCount}`,
        startTime: formatMinutesToTime(cursor),
        endTime: formatMinutesToTime(segmentEnd),
        type: 'lecture',
      });
      cursor = segmentEnd;
      periodCount += 1;
    }
    return cursor;
  };

  for (const br of sortedBreaks) {
    addLectureSegment(br.startMinutes);
    slots.push({
      order: slots.length + 1,
      label: br.breakName,
      startTime: formatMinutesToTime(br.startMinutes),
      endTime: formatMinutesToTime(br.endMinutes),
      type: 'break',
    });
    cursor = br.endMinutes;
  }

  addLectureSegment(endMinutes);
  return slots;
}

function validateSlots(slots) {
  if (!Array.isArray(slots) || !slots.length) {
    throw new ApiError(400, 'At least one period slot is required');
  }
  return slots.map((slot, index) => {
    const label = String(slot.label || '').trim() || `Period ${index + 1}`;
    const startTime = String(slot.startTime || '').trim();
    const endTime = String(slot.endTime || '').trim();
    const startMinutes = parseTimeToMinutes(startTime);
    const endMinutes = parseTimeToMinutes(endTime);
    if (endMinutes <= startMinutes) {
      throw new ApiError(400, `"${label}" end time must be later than its start time`);
    }
    const out = {
      order: Number(slot.order) > 0 ? Number(slot.order) : index + 1,
      label,
      startTime,
      endTime,
      type: slot.type === 'break' || slot.type === 'assembly' || slot.type === 'prayer' ? slot.type : 'lecture',
    };
    if (slot._id) out._id = slot._id;
    return out;
  });
}

/** Keep existing subdocument ids when regenerating so schedule periodId refs stay valid. */
function mergeGeneratedSlots(existingSlots = [], generatedSlots = []) {
  const used = new Set();
  return generatedSlots.map((slot, index) => {
    const prevSameIndex = existingSlots[index];
    if (prevSameIndex?._id && prevSameIndex.type === slot.type && !used.has(String(prevSameIndex._id))) {
      used.add(String(prevSameIndex._id));
      return { ...slot, _id: prevSameIndex._id };
    }
    const byLabel = existingSlots.find(
      (e) => e?._id && e.label === slot.label && e.type === slot.type && !used.has(String(e._id))
    );
    if (byLabel) {
      used.add(String(byLabel._id));
      return { ...slot, _id: byLabel._id };
    }
    return slot;
  });
}

async function listPeriodTemplates({ sessionId, isActive }) {
  const q = {};
  if (sessionId) q.session = sessionId;
  if (isActive !== undefined) q.isActive = isActive === 'true' || isActive === true;
  return PeriodTemplate.find(q).sort({ isDefault: -1, name: 1 });
}

async function getPeriodTemplate(id) {
  const tpl = await PeriodTemplate.findById(id);
  if (!tpl) throw new ApiError(404, 'Period template not found');
  return tpl;
}

async function createPeriodTemplate(body, userId) {
  await assertSessionWritable(body.session);

  if (body.isDefault) {
    await PeriodTemplate.updateMany({ session: body.session }, { $set: { isDefault: false } });
  }

  const payload = { ...body };
  if (body.academyStartTime || body.academyEndTime || body.periodDurationMinutes || body.breaks) {
    payload.slots = generatePeriodSlots(body);
  } else if (Array.isArray(body.slots) && body.slots.length) {
    payload.slots = body.slots;
  } else {
    throw new ApiError(400, 'Period template requires configuration or slots');
  }

  return PeriodTemplate.create({ ...payload, createdBy: userId });
}

async function updatePeriodTemplate(id, body) {
  const existing = await PeriodTemplate.findById(id);
  if (!existing) throw new ApiError(404, 'Period template not found');
  await assertSessionWritable(existing.session);

  if (body.isDefault) {
    await PeriodTemplate.updateMany(
      { session: existing.session, _id: { $ne: id } },
      { $set: { isDefault: false } }
    );
  }

  const payload = { ...body };
  const hasConfigFields =
    body.academyStartTime !== undefined ||
    body.academyEndTime !== undefined ||
    body.periodDurationMinutes !== undefined ||
    body.breaks !== undefined;
  const hasExplicitSlots = Array.isArray(body.slots) && body.slots.length > 0;

  // Prefer manually edited period times when provided; otherwise regenerate from academy hours.
  if (hasExplicitSlots) {
    payload.slots = validateSlots(body.slots);
  } else if (hasConfigFields) {
    const generated = generatePeriodSlots({
      academyStartTime: body.academyStartTime ?? existing.academyStartTime,
      academyEndTime: body.academyEndTime ?? existing.academyEndTime,
      periodDurationMinutes: body.periodDurationMinutes ?? existing.periodDurationMinutes,
      breaks: body.breaks ?? existing.breaks,
    });
    payload.slots = mergeGeneratedSlots(existing.slots || [], generated);
  }

  const tpl = await PeriodTemplate.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
  return tpl;
}

async function deletePeriodTemplate(id) {
  const existing = await PeriodTemplate.findById(id);
  if (!existing) throw new ApiError(404, 'Period template not found');
  await assertSessionWritable(existing.session);
  const tpl = await PeriodTemplate.findByIdAndDelete(id);
  if (!tpl) throw new ApiError(404, 'Period template not found');
  return { deleted: true };
}

module.exports = {
  listPeriodTemplates,
  getPeriodTemplate,
  createPeriodTemplate,
  updatePeriodTemplate,
  deletePeriodTemplate,
};
