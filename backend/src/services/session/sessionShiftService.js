const ApiError = require('../../utils/ApiError');
const { assertSessionWritable, getSessionOrThrow } = require('./sessionGuard');
const { logAudit } = require('./auditService');
const { importEnrollmentFromSession } = require('../academy/academySessionImportService');
const { copyTimetableSetupBetweenSessions } = require('./sessionTimetableCopyService');

/**
 * Copy full session configuration from source → target:
 * academy sections, fee structures, choice groups (classes/subjects matched by name),
 * plus timetable periods, rooms, teacher profiles, assignments, and settings.
 */
async function shiftFullSessionConfiguration(targetSessionId, opts, userId) {
  const { sourceSessionId, classIds, includeFeeStructure = true } = opts;

  if (!sourceSessionId) throw new ApiError(400, 'sourceSessionId is required');
  if (String(sourceSessionId) === String(targetSessionId)) {
    throw new ApiError(400, 'Source and target session must be different');
  }

  await assertSessionWritable(targetSessionId);
  const source = await getSessionOrThrow(sourceSessionId);
  const target = await getSessionOrThrow(targetSessionId);

  const enrollment = await importEnrollmentFromSession(
    targetSessionId,
    { sourceSessionId, classIds, includeFeeStructure },
    userId
  );

  const timetable = await copyTimetableSetupBetweenSessions(sourceSessionId, targetSessionId, userId);

  await logAudit({
    sessionId: targetSessionId,
    action: 'SESSION_CONFIGURATION_SHIFTED',
    userId,
    details: {
      sourceSessionId,
      sourceName: source.name,
      targetName: target.name,
      enrollment,
      timetable,
    },
  });

  return {
    enrollment,
    timetable,
    sourceSession: { _id: source._id, name: source.name },
    targetSession: { _id: target._id, name: target.name },
  };
}

module.exports = { shiftFullSessionConfiguration };
