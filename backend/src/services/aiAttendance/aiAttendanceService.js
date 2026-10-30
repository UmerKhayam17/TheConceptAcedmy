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
const { STAFF_ROLE_NAMES } = require('../../config/staffRoles');
const {
  resolveStudentAttendanceStatus,
  resolveFallbackAttendanceStatus,
} = require('./attendanceStatusFromTimetable');
const { dayBounds, formatDateInTz } = require('../../utils/schoolDay');

const MATCH_THRESHOLD = 0.75;
/** A second sighting only counts as check-out after this long (default 2 hours). */
const CHECKOUT_MIN_MS = (Number(process.env.AI_CHECKOUT_MIN_MINUTES) || 120) * 60 * 1000;
/** Same person is not re-processed within this window, across webcam and all cameras. */
const MARK_COOLDOWN_MS =
  Number(process.env.AI_MARK_COOLDOWN_MS) ||
  Number(process.env.AI_CAMERA_MATCH_COOLDOWN_MS) ||
  45000;
const recentMarks = new Map(); // personKey -> timestamp of last successful mark

function inCooldown(personKey) {
  const at = recentMarks.get(personKey);
  return Boolean(at && Date.now() - at < MARK_COOLDOWN_MS);
}

function rememberMark(personKey) {
  recentMarks.set(personKey, Date.now());
  if (recentMarks.size > 2000) {
    const cutoff = Date.now() - MARK_COOLDOWN_MS;
    recentMarks.forEach((at, key) => {
      if (at < cutoff) recentMarks.delete(key);
    });
  }
}

/**
 * Applies one AI sighting to an attendance row and records what changed in
 * doc.$locals.aiChange: check_in | check_out | check_out_update | none.
 */
async function applySighting(doc, { now, status, confidence, notes, source }) {
  let change = 'none';
  if (!doc.checkIn) {
    doc.checkIn = now;
    doc.status = status;
    doc.source = source;
    doc.confidence = confidence;
    change = 'check_in';
  } else if (now - doc.checkIn >= CHECKOUT_MIN_MS) {
    change = doc.checkOut ? 'check_out_update' : 'check_out';
    doc.checkOut = now;
    doc.confidence = confidence ?? doc.confidence;
  }
  if (notes) doc.notes = notes;
  if (change !== 'none' || notes) await doc.save();
  doc.$locals.aiChange = change;
  return doc;
}

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
      const created = await AcademyAttendance.create({
        studentId,
        date: start,
        status,
        source,
        checkIn: now,
        checkOut,
        confidence,
        notes,
      });
      created.$locals.aiChange = 'check_in';
      return created;
    } catch (err) {
      if (err?.code !== 11000) throw err;
      // Race: another writer inserted — fall through to update
    }
  }

  const doc = existing || (await AcademyAttendance.findOne(filter));
  if (!doc) throw new ApiError(500, 'Attendance write race failed');
  return applySighting(doc, { now, status, confidence, notes, source });
}

async function applyStaffAttendance(userId, { status, checkIn, checkOut, confidence, notes, source = 'ai' }) {
  const now = checkIn instanceof Date ? checkIn : new Date(checkIn || Date.now());
  const { start, end } = dayWindow(now);
  const filter = { userId, date: { $gte: start, $lte: end } };

  let existing = await StaffAttendance.findOne(filter);
  if (!existing) {
    try {
      const created = await StaffAttendance.create({
        userId,
        date: start,
        status,
        source,
        checkIn: now,
        checkOut,
        confidence,
        notes,
      });
      created.$locals.aiChange = 'check_in';
      return created;
    } catch (err) {
      if (err?.code !== 11000) throw err;
      existing = await StaffAttendance.findOne(filter);
    }
  }

  if (!existing) throw new ApiError(500, 'Staff attendance write race failed');
  return applySighting(existing, { now, status, confidence, notes, source });
}

/** check_in | check_out | check_out_update | already_marked */
function sightingAction(doc) {
  const change = doc?.$locals?.aiChange || 'none';
  return change === 'none' ? 'already_marked' : change;
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
    return { kind: 'student', doc, action: sightingAction(doc) };
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
    return { kind: 'staff', doc, action: sightingAction(doc) };
  }

  throw new ApiError(400, 'Unknown person key');
}

/**
 * Recognise every face in the frame and (optionally) mark each person found.
 * Top-level employee_* / status fields describe the best match, for older callers;
 * `people` lists everyone recognised. `announce` is true when a person's mark
 * actually changed (first check-in or first check-out) and is worth speaking.
 */
async function identifyAndMark(imageBase64, { markAttendance = true } = {}) {
  const embRes = await faceWorker.embedAll(imageBase64);
  const faces = Array.isArray(embRes?.faces) ? embRes.faces : [];
  if (!faces.length) {
    return {
      matched: false,
      message: embRes?.message || 'No face',
      confidence: 0,
      people: [],
      unknownFaces: 0,
    };
  }

  const { gallery, meta } = await faceEnrollment.buildGallery();
  const best = new Map(); // personKey -> confidence
  let unknownFaces = 0;
  let bestUnknown = 0;
  faces.forEach((face) => {
    const { personKey, confidence } = faceWorker.matchEmbedding(
      face.embedding,
      gallery,
      MATCH_THRESHOLD
    );
    if (!personKey) {
      unknownFaces += 1;
      bestUnknown = Math.max(bestUnknown, confidence || 0);
      return;
    }
    if (!best.has(personKey) || confidence > best.get(personKey)) best.set(personKey, confidence);
  });

  if (!best.size) {
    return {
      matched: false,
      message: 'Unknown face',
      confidence: Math.round(bestUnknown * 10000) / 10000,
      people: [],
      unknownFaces,
    };
  }

  const people = [...best.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([personKey, confidence]) => ({
      employee_id: personKey,
      employee_name: meta[personKey]?.displayName,
      confidence: Math.round(confidence * 10000) / 10000,
    }));

  if (markAttendance) {
    // A failure for one person must not block the others in the same frame.
    for (const person of people) {
      if (inCooldown(person.employee_id)) {
        person.attendance_action = 'cooldown';
        person.announce = false;
        continue;
      }
      try {
        // eslint-disable-next-line no-await-in-loop
        const marked = await markFromPersonKey(person.employee_id, {
          confidence: person.confidence,
          source: 'ai',
        });
        rememberMark(person.employee_id);
        person.kind = marked.kind;
        person.status = marked.doc?.status || null;
        person.attendance_action = marked.action;
        person.announce = marked.action === 'check_in' || marked.action === 'check_out';
      } catch (err) {
        person.error = err?.message || String(err);
        person.announce = false;
      }
    }
  }

  const first = people[0];
  return {
    matched: true,
    message: people.length > 1 ? `${people.length} faces recognized` : 'Face recognized',
    employee_id: first.employee_id,
    employee_name: first.employee_name,
    confidence: first.confidence,
    kind: first.kind,
    status: first.status ?? null,
    attendance_action: first.attendance_action,
    people,
    unknownFaces,
  };
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

  const staffRoles = await Role.find({ name: { $in: STAFF_ROLE_NAMES } }).select('_id').lean();
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
      .select('studentName fatherName gender studentId rollNumber aiEmployeeId photoImage classId')
      .populate('classId', 'className')
      .sort({ rollNumber: 1, studentName: 1 })
      .lean(),
    Role.find({ name: { $in: STAFF_ROLE_NAMES } }).select('_id name').lean(),
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
  const enrollDocs = await require('../../models/AiFaceEnrollment')
    .find({})
    .select('personKey isTrained totalImages')
    .lean();
  const enrollByKey = new Map(enrollDocs.map((e) => [e.personKey, e]));

  return {
    students: students.map((s) => {
      const aiEmployeeId = s.aiEmployeeId || studentAiEmployeeId(s);
      const en = enrollByKey.get(aiEmployeeId);
      return {
        kind: 'student',
        id: String(s._id),
        name: s.studentName,
        fatherName: s.fatherName || '',
        gender: s.gender || '',
        label: s.studentId || s.classId?.className || '',
        aiEmployeeId,
        hasPhoto: Boolean(s.photoImage),
        photoUrl: s.photoImage || '',
        isTrained: Boolean(en?.isTrained),
        totalImages: en?.totalImages || 0,
      };
    }),
    staff: staff.map((u) => {
      const aiEmployeeId = u.aiEmployeeId || staffAiEmployeeId(u);
      const en = enrollByKey.get(aiEmployeeId);
      return {
        kind: 'staff',
        id: String(u._id),
        name: u.name,
        label: u.role?.name || '',
        aiEmployeeId,
        hasPhoto: Boolean(u.profileImage),
        photoUrl: u.profileImage || '',
        isTrained: Boolean(en?.isTrained),
        totalImages: en?.totalImages || 0,
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
