const TeacherProfile = require('../../models/timetable/TeacherProfile');
const User = require('../../models/User');
const Role = require('../../models/Role');
const ApiError = require('../../utils/ApiError');

const populateOpts = [
  { path: 'user', select: 'name email phone isActive' },
  {
    path: 'subjects',
    select: 'subjectName subjectCode',
    transform: (doc) => {
      if (!doc) return doc;
      const o = typeof doc.toObject === 'function' ? doc.toObject() : doc;
      return { ...o, name: o.subjectName || o.name, code: o.subjectCode || o.code };
    },
  },
  { path: 'preferredRooms', select: 'name code type' },
];

async function listTeacherProfiles({ sessionId, isActive, userId }) {
  const q = {};
  if (sessionId) q.session = sessionId;
  if (isActive !== undefined) q.isActive = isActive === 'true' || isActive === true;
  if (userId) q.user = userId;
  return TeacherProfile.find(q).populate(populateOpts).sort({ createdAt: -1 });
}

async function getTeacherProfile(id) {
  const profile = await TeacherProfile.findById(id).populate(populateOpts);
  if (!profile) throw new ApiError(404, 'Teacher profile not found');
  return profile;
}

async function createTeacherProfile(body, userId) {
  const existing = await TeacherProfile.findOne({ user: body.user, session: body.session });
  if (existing) throw new ApiError(409, 'Teacher profile already exists for this session');
  return TeacherProfile.create({ ...body, createdBy: userId });
}

async function updateTeacherProfile(id, body) {
  const profile = await TeacherProfile.findByIdAndUpdate(id, body, {
    new: true,
    runValidators: true,
  }).populate(populateOpts);
  if (!profile) throw new ApiError(404, 'Teacher profile not found');
  return profile;
}

async function deleteTeacherProfile(id) {
  const profile = await TeacherProfile.findByIdAndDelete(id);
  if (!profile) throw new ApiError(404, 'Teacher profile not found');
  return { deleted: true };
}

/** Teacher must have an active session profile (timetable roster), not just a staff login. */
async function assertTeacherOnSessionRoster(sessionId, teacherId) {
  if (!teacherId) return;
  const profile = await TeacherProfile.findOne({
    user: teacherId,
    session: sessionId,
    isActive: { $ne: false },
  }).select('_id');
  if (!profile) {
    throw new ApiError(
      400,
      'Selected teacher is not on this session roster. Add them under System Config → Teachers, or use Sync all teachers.'
    );
  }
}

/**
 * Create session teacher profiles for every active staff account with role "teacher"
 * that does not already have a profile in this session.
 */
async function syncAllTeacherProfilesFromStaff({ sessionId }, createdBy) {
  if (!sessionId) throw new ApiError(400, 'sessionId is required');

  const teacherRole = await Role.findOne({ name: 'teacher' }).select('_id').lean();
  if (!teacherRole) throw new ApiError(404, 'Teacher role not found');

  const staffTeachers = await User.find({
    role: teacherRole._id,
    isActive: { $ne: false },
  })
    .select('_id')
    .lean();

  const existing = await TeacherProfile.find({ session: sessionId }).select('user').lean();
  const existingUserIds = new Set(existing.map((row) => String(row.user)));

  const missing = staffTeachers.filter((u) => !existingUserIds.has(String(u._id)));
  let created = 0;
  for (const user of missing) {
    // eslint-disable-next-line no-await-in-loop
    await TeacherProfile.create({
      user: user._id,
      session: sessionId,
      createdBy,
    });
    created += 1;
  }

  return {
    created,
    skipped: existing.length,
    totalStaffTeachers: staffTeachers.length,
    totalProfiles: existing.length + created,
  };
}

module.exports = {
  listTeacherProfiles,
  getTeacherProfile,
  createTeacherProfile,
  updateTeacherProfile,
  deleteTeacherProfile,
  assertTeacherOnSessionRoster,
  syncAllTeacherProfilesFromStaff,
};
