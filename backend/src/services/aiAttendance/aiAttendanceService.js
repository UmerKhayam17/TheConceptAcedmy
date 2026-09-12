const AcademyStudent = require('../../models/academy/AcademyStudent');
const AcademyAttendance = require('../../models/academy/AcademyAttendance');
const User = require('../../models/User');
const StaffAttendance = require('../../models/StaffAttendance');
const AiCamera = require('../../models/AiCamera');
const ApiError = require('../../utils/ApiError');
const faceWorker = require('./faceWorkerClient');
const faceEnrollment = require('./faceEnrollmentService');
const {
  studentAiEmployeeId,
  staffAiEmployeeId,
  parseAiEmployeeId,
} = require('./aiAttendanceIds');
const Role = require('../../models/Role');
const {
  resolveStudentAttendanceStatus,
  resolveFallbackAttendanceStatus,
} = require('./attendanceStatusFromTimetable');
const { dayBounds, formatDateInTz } = require('../../utils/schoolDay');

function dayWindow(forDate = new Date()) {
  const ymd = formatDateInTz(forDate);
  return dayBounds(ymd);
}

async function applyStudentAttendance(studentId, { status, checkIn, checkOut, confidence, notes, source = 'ai' }) {
  const now = checkIn instanceof Date ? checkIn : new Date(checkIn || Date.now());
  const { start, end } = dayWindow(now);
  const filter = {
    studentId,
    date: { $gte: start, $lte: end },
    $or: [{ subjectId: { $exists: false } }, { subjectId: null }],
  };

  const existing = await AcademyAttendance.findOne(filter);
  if (!existing) {
    try {
      return await AcademyAttendance.create({
        studentId,
        date: start,
        status,
        source,
        checkIn: now,
        checkOut,
        confidence,
        notes,
      });
    } catch (err) {
      if (err?.code !== 11000) throw err;
      // Race: another writer inserted — fall through to update
    }
  }

  const doc = existing || (await AcademyAttendance.findOne(filter));
  if (!doc) throw new ApiError(500, 'Attendance write race failed');

  if (!doc.checkIn) {
    doc.checkIn = now;
    doc.status = status;
    doc.source = source;
    doc.confidence = confidence;
  } else if (now - doc.checkIn > 60 * 1000) {
    doc.checkOut = now;
    doc.confidence = confidence ?? doc.confidence;
  }
  if (notes) doc.notes = notes;
  await doc.save();
  return doc;
}

async function applyStaffAttendance(userId, { status, checkIn, checkOut, confidence, notes, source = 'ai' }) {
  const now = checkIn instanceof Date ? checkIn : new Date(checkIn || Date.now());
  const { start, end } = dayWindow(now);
  const filter = { userId, date: { $gte: start, $lte: end } };

  let existing = await StaffAttendance.findOne(filter);
  if (!existing) {
    try {
      return await StaffAttendance.create({
        userId,
        date: start,
        status,
        source,
        checkIn: now,
        checkOut,
        confidence,
        notes,
      });
    } catch (err) {
      if (err?.code !== 11000) throw err;
      existing = await StaffAttendance.findOne(filter);
    }
  }

  if (!existing) throw new ApiError(500, 'Staff attendance write race failed');

  if (!existing.checkIn) {
    existing.checkIn = now;
    existing.status = status;
    existing.confidence = confidence;
    existing.source = source;
  } else if (now - existing.checkIn > 60 * 1000) {
    existing.checkOut = now;
    existing.confidence = confidence ?? existing.confidence;
  }
  if (notes) existing.notes = notes;
  await existing.save();
  return existing;
}

async function markFromPersonKey(personKey, { confidence, notes, source = 'ai' } = {}) {
  const parsed = parseAiEmployeeId(personKey);
  const now = new Date();

  if (parsed.kind === 'student') {
    let student = await AcademyStudent.findById(parsed.mongoId).select('_id').lean();
    if (!student) {
      student = await AcademyStudent.findOne({ aiEmployeeId: personKey }).select('_id').lean();
    }
    if (!student) throw new ApiError(404, 'Student not found');
    // Late / on-time from the student's published class timetable (first period today)
    const status = await resolveStudentAttendanceStatus(student._id, now);
    const doc = await applyStudentAttendance(student._id, {
      status,
      checkIn: now,
      confidence,
      notes,
      source,
    });
    return { kind: 'student', doc, action: 'marked' };
  }

  if (parsed.kind === 'staff') {
    let user = await User.findById(parsed.mongoId).select('_id').lean();
    if (!user) {
      user = await User.findOne({ aiEmployeeId: personKey }).select('_id').lean();
    }
    if (!user) throw new ApiError(404, 'Staff not found');
    const status = resolveFallbackAttendanceStatus(now);
    const doc = await applyStaffAttendance(user._id, {
      status,
      checkIn: now,
      confidence,
      notes,
      source,
    });
    return { kind: 'staff', doc, action: doc.checkOut ? 'check_out' : 'check_in' };
  }

  throw new ApiError(400, 'Unknown person key');
}

async function identifyAndMark(imageBase64, { markAttendance = true, source = 'webcam' } = {}) {
  const embRes = await faceWorker.embed(imageBase64);
  if (!embRes?.embedding?.length) {
    return {
      matched: false,
      message: embRes?.message || 'No face',
      confidence: 0,
    };
  }
  const { gallery, meta } = await faceEnrollment.buildGallery();
  const { personKey, confidence } = faceWorker.matchEmbedding(embRes.embedding, gallery, 0.45);
  if (!personKey) {
    return {
      matched: false,
      message: 'Unknown face',
      confidence: Math.round((confidence || 0) * 10000) / 10000,
    };
  }

  const result = {
    matched: true,
    employee_id: personKey,
    employee_name: meta[personKey]?.displayName,
    confidence: Math.round(confidence * 10000) / 10000,
    message: 'Face recognized',
  };

  if (markAttendance) {
    const marked = await markFromPersonKey(personKey, { confidence, source: source === 'cctv' ? 'ai' : 'ai' });
    result.attendance_action = marked.action;
    result.kind = marked.kind;
  }
  return result;
}

/** Ensure aiEmployeeId on active students + staff (Mongo only — no external DB). */
async function syncRoster() {
  const students = await AcademyStudent.find({ status: 'active' }).select('_id aiEmployeeId').lean();
  let studentsUpdated = 0;
  for (const s of students) {
    const id = studentAiEmployeeId(s);
    if (s.aiEmployeeId !== id) {
      // eslint-disable-next-line no-await-in-loop
      await AcademyStudent.updateOne({ _id: s._id }, { $set: { aiEmployeeId: id } });
      studentsUpdated += 1;
    }
  }

  const staffRoles = await Role.find({ name: { $in: ['teacher', 'accountant'] } }).select('_id').lean();
  const users = await User.find({
    isActive: true,
    role: { $in: staffRoles.map((r) => r._id) },
  })
    .select('_id aiEmployeeId')
    .lean();
  let staffUpdated = 0;
  for (const u of users) {
    const id = staffAiEmployeeId(u);
    if (u.aiEmployeeId !== id) {
      // eslint-disable-next-line no-await-in-loop
      await User.updateOne({ _id: u._id }, { $set: { aiEmployeeId: id } });
      staffUpdated += 1;
    }
  }

  return {
    students: { linked: students.length, updated: studentsUpdated },
    staff: { linked: users.length, updated: staffUpdated },
  };
}

async function listPeopleForEnrollment() {
  const [students, staffRoles] = await Promise.all([
    AcademyStudent.find({ status: 'active' })
      .select('studentName studentId aiEmployeeId photoImage classId')
      .populate('classId', 'className')
      .sort({ studentName: 1 })
      .lean(),
    Role.find({ name: { $in: ['teacher', 'accountant'] } }).select('_id name').lean(),
  ]);
  const staff = await User.find({
    isActive: true,
    role: { $in: staffRoles.map((r) => r._id) },
  })
    .select('name email aiEmployeeId profileImage role')
    .populate('role', 'name')
    .sort({ name: 1 })
    .lean();

  const enrollments = await faceEnrollment.galleryStats();
  const trainedKeys = new Set(
    (
      await require('../../models/AiFaceEnrollment')
        .find({ isTrained: true })
        .select('personKey')
        .lean()
    ).map((e) => e.personKey)
  );

  return {
    students: students.map((s) => {
      const aiEmployeeId = s.aiEmployeeId || studentAiEmployeeId(s);
      return {
        kind: 'student',
        id: String(s._id),
        name: s.studentName,
        label: s.studentId || s.classId?.className || '',
        aiEmployeeId,
        hasPhoto: Boolean(s.photoImage),
        isTrained: trainedKeys.has(aiEmployeeId),
      };
    }),
    staff: staff.map((u) => {
      const aiEmployeeId = u.aiEmployeeId || staffAiEmployeeId(u);
      return {
        kind: 'staff',
        id: String(u._id),
        name: u.name,
        label: u.role?.name || '',
        aiEmployeeId,
        hasPhoto: Boolean(u.profileImage),
        isTrained: trainedKeys.has(aiEmployeeId),
      };
    }),
    stats: enrollments,
  };
}

async function statusOverview() {
  const workerConfigured = faceWorker.isConfigured();
  let worker = null;
  let workerError = null;
  if (workerConfigured) {
    try {
      worker = await faceWorker.health();
    } catch (err) {
      workerError = err.message;
    }
  }
  const [studentsLinked, staffLinked, gallery] = await Promise.all([
    AcademyStudent.countDocuments({ aiEmployeeId: { $exists: true, $ne: '' } }),
    User.countDocuments({ aiEmployeeId: { $exists: true, $ne: '' } }),
    faceEnrollment.galleryStats(),
  ]);
  return {
    database: 'mongodb',
    configured: workerConfigured,
    faceWorkerUrl: workerConfigured ? require('./faceWorkerClient').faceWorkerUrl() : null,
    studentsLinked,
    staffLinked,
    gallery,
    worker,
    workerError,
  };
}

async function listCameras() {
  const cctv = require('./cctvPoller');
  const cameras = await AiCamera.find().sort({ sortOrder: 1, name: 1 }).lean();
  const runtime = cctv.getStatus();
  const byId = new Map(
    (Array.isArray(runtime) ? runtime : runtime ? [runtime] : []).map((r) => [String(r.cameraId), r])
  );
  return {
    cameras: cameras.map((c) => {
      const rt = byId.get(String(c._id)) || { running: false };
      return {
        _id: String(c._id),
        name: c.name,
        location: c.location || '',
        isActive: Boolean(c.isActive),
        sortOrder: c.sortOrder ?? 0,
        // Mask password in RTSP URL for UI
        rtspHost: (() => {
          try {
            const u = String(c.rtspUrl || '');
            const at = u.lastIndexOf('@');
            return at >= 0 ? `rtsp://***@${u.slice(at + 1)}` : u ? 'rtsp://…' : '';
          } catch {
            return '';
          }
        })(),
        runtime: {
          running: Boolean(rt.running),
          connected: Boolean(rt.connected),
          hasFrame: Boolean(rt.hasFrame),
          lastError: rt.lastError || '',
          lastFrameAt: rt.lastFrameAt || null,
          lastMatch: rt.lastMatch || null,
        },
      };
    }),
    overview: {
      total: cameras.length,
      active: cameras.filter((c) => c.isActive).length,
      running: Array.isArray(runtime) ? runtime.filter((r) => r.running).length : 0,
      note: 'Set AI_CAMERA_RTSP_URL in backend/.env — camera auto-starts with npm run dev.',
    },
  };
}

async function cameraSnapshot(cameraId) {
  const cctv = require('./cctvPoller');
  const cam = await AiCamera.findById(cameraId).lean();
  if (!cam) throw new ApiError(404, 'Camera not found');
  const snap = await cctv.getSnapshot(cameraId);
  return {
    cameraId: String(cam._id),
    name: cam.name,
    location: cam.location || '',
    ...snap,
  };
}

async function cameraAction(action, cameraId) {
  const cctv = require('./cctvPoller');
  if (action === 'start_all') {
    return { action, statuses: await cctv.startAllActive() };
  }
  if (action === 'stop_all') {
    return { action, statuses: await cctv.stopAll() };
  }
  if (action === 'start' && cameraId != null) {
    const cam = await AiCamera.findById(cameraId).lean();
    if (!cam) throw new ApiError(404, 'Camera not found');
    return { action, status: await cctv.startCamera(cam) };
  }
  if (action === 'stop' && cameraId != null) {
    return { action, status: await cctv.stopCamera(cameraId) };
  }
  throw new ApiError(400, 'action required: start_all | stop_all | start | stop');
}

module.exports = {
  syncRoster,
  listPeopleForEnrollment,
  statusOverview,
  identifyAndMark,
  markFromPersonKey,
  listCameras,
  cameraSnapshot,
  cameraAction,
  applyStudentAttendance,
  applyStaffAttendance,
};
