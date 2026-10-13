const TimetableVersion = require('../../models/timetable/TimetableVersion');
const ScheduleSlot = require('../../models/timetable/ScheduleSlot');
const PeriodTemplate = require('../../models/timetable/PeriodTemplate');
const Session = require('../../models/Session');
const ApiError = require('../../utils/ApiError');
const { validateVersion } = require('./timetableConflictService');
const { assertSessionWritable } = require('../session/sessionGuard');
const { logAudit } = require('../session/auditService');
const { sanitizeSlots, repairOrphanedSlots } = require('./scheduleSlotSanitize');

function academyClassTransform(doc) {
  if (!doc) return doc;
  const o = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return { ...o, name: o.className || o.name };
}

function academySectionTransform(doc) {
  if (!doc) return doc;
  const o = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return { ...o, name: o.sectionName || o.name };
}

function academySubjectTransform(doc) {
  if (!doc) return doc;
  const o = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return { ...o, name: o.subjectName || o.name, code: o.subjectCode || o.code };
}

const versionPopulate = [
  { path: 'class', select: 'className', transform: academyClassTransform },
  { path: 'section', select: 'sectionName', transform: academySectionTransform },
  { path: 'session', select: 'name workingDays' },
  { path: 'periodTemplate' },
  { path: 'publishedBy', select: 'name' },
];

async function listVersions({ sessionId, sectionId, classId, status }) {
  const q = {};
  if (sessionId) q.session = sessionId;
  if (sectionId) q.section = sectionId;
  if (classId) q.class = classId;
  if (status) q.status = status;
  else q.status = { $in: ['draft', 'published'] }; // hide archived history from UI
  return TimetableVersion.find(q).populate(versionPopulate).sort({ version: -1, createdAt: -1 });
}

async function getVersion(id) {
  const version = await TimetableVersion.findById(id).populate(versionPopulate);
  if (!version) throw new ApiError(404, 'Timetable version not found');
  return version;
}

async function getPublishedVersion(sessionId, sectionId) {
  return TimetableVersion.findOne({
    session: sessionId,
    section: sectionId,
    status: 'published',
  }).populate(versionPopulate);
}

/**
 * One timetable per section: reuse the existing draft (never create v2/v3 drafts).
 * If only a published timetable exists, return that for in-place edits.
 */
async function createVersion(body, userId) {
  await assertSessionWritable(body.session);

  // Heal any legacy multi-draft rows before deciding
  try {
    const { consolidateSectionDrafts } = require('./classBoardService');
    await consolidateSectionDrafts(body.session, body.section);
  } catch (_) {
    /* consolidate is best-effort */
  }

  const existingDraft = await TimetableVersion.findOne({
    session: body.session,
    section: body.section,
    status: 'draft',
  })
    .sort({ version: -1, updatedAt: -1 })
    .populate(versionPopulate);
  if (existingDraft) {
    if (body.periodTemplate && String(existingDraft.periodTemplate?._id || existingDraft.periodTemplate) !== String(body.periodTemplate)) {
      existingDraft.periodTemplate = body.periodTemplate;
      await existingDraft.save();
      return TimetableVersion.findById(existingDraft._id).populate(versionPopulate);
    }
    return existingDraft;
  }

  const published = await TimetableVersion.findOne({
    session: body.session,
    section: body.section,
    status: 'published',
  })
    .sort({ version: -1, updatedAt: -1 })
    .populate(versionPopulate);
  if (published) {
    // Do not spawn a second "version" — edit the live published sheet
    return published;
  }

  const last = await TimetableVersion.findOne({
    session: body.session,
    section: body.section,
  })
    .sort({ version: -1 })
    .select('version');

  const version = await TimetableVersion.create({
    ...body,
    version: (last?.version || 0) + 1,
    status: 'draft',
    createdBy: userId,
  });
  return TimetableVersion.findById(version._id).populate(versionPopulate);
}

/** Disabled: multiple drafts caused Class Board / shared-lesson conflicts. */
async function duplicateVersion(_id, _userId) {
  throw new ApiError(
    400,
    'Duplicate versions are disabled. Keep one timetable per section — edit and publish the same sheet.'
  );
}

async function getVersionGrid(id) {
  const version = await getVersion(id);
  const rawSlots = await ScheduleSlot.find({ timetableVersion: id, cancelled: { $ne: true } })
    .populate({
      path: 'subject',
      select: 'subjectName subjectCode enrollmentType choiceGroupName',
      transform: academySubjectTransform,
    })
    .populate('teacher', 'name email')
    .populate({
      path: 'parallelEntries.subject',
      select: 'subjectName subjectCode enrollmentType choiceGroupName',
      transform: academySubjectTransform,
    })
    .populate('parallelEntries.teacher', 'name email')
    .populate('room', 'name code type');

  const repair = await repairOrphanedSlots(rawSlots);
  let slots = rawSlots;
  if (repair.repaired || repair.deleted) {
    slots = await ScheduleSlot.find({ timetableVersion: id, cancelled: { $ne: true } })
      .populate({
        path: 'subject',
        select: 'subjectName subjectCode enrollmentType choiceGroupName',
        transform: academySubjectTransform,
      })
      .populate('teacher', 'name email')
      .populate({
        path: 'parallelEntries.subject',
        select: 'subjectName subjectCode enrollmentType choiceGroupName',
        transform: academySubjectTransform,
      })
      .populate('parallelEntries.teacher', 'name email')
      .populate('room', 'name code type');
  }

  const session = await Session.findById(version.session._id || version.session);
  const template = version.periodTemplate;

  return {
    version,
    workingDays: session?.workingDays?.length ? session.workingDays : ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
    periods: template?.slots || [],
    slots: sanitizeSlots(slots),
  };
}

async function publishVersion(id, userId) {
  const version = await TimetableVersion.findById(id);
  if (!version) throw new ApiError(404, 'Timetable version not found');
  await assertSessionWritable(version.session);
  if (version.status === 'published') throw new ApiError(400, 'Version is already published');

  const validation = await validateVersion(id, { forPublish: true });
  if (!validation.valid) {
    throw new ApiError(400, 'Timetable has validation errors', validation.errors);
  }

  await TimetableVersion.updateMany(
    { session: version.session, section: version.section, status: 'published' },
    { $set: { status: 'archived' } }
  );

  version.status = 'published';
  version.publishedAt = new Date();
  version.publishedBy = userId;
  if (!version.effectiveFrom) version.effectiveFrom = new Date();
  await version.save();

  await logAudit({
    sessionId: version.session,
    action: 'TIMETABLE_PUBLISHED',
    userId,
    entityType: 'TimetableVersion',
    entityId: version._id,
    details: { version: version.version, sectionId: String(version.section) },
  });

  return TimetableVersion.findById(id).populate(versionPopulate);
}

async function archiveVersion(id) {
  const version = await TimetableVersion.findByIdAndUpdate(
    id,
    { status: 'archived' },
    { new: true }
  ).populate(versionPopulate);
  if (!version) throw new ApiError(404, 'Timetable version not found');
  return version;
}

async function deleteVersion(id) {
  const version = await TimetableVersion.findById(id);
  if (!version) throw new ApiError(404, 'Timetable version not found');
  if (version.status === 'published') {
    throw new ApiError(400, 'Cannot delete a published timetable. Archive it first.');
  }
  await ScheduleSlot.deleteMany({ timetableVersion: id });
  await TimetableVersion.findByIdAndDelete(id);
  return { deleted: true };
}

module.exports = {
  listVersions,
  getVersion,
  getPublishedVersion,
  createVersion,
  duplicateVersion,
  getVersionGrid,
  publishVersion,
  archiveVersion,
  deleteVersion,
};
