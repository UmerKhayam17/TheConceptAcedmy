const catchAsync = require('../../utils/catchAsync');
const roomService = require('../../services/timetable/roomService');
const periodTemplateService = require('../../services/timetable/periodTemplateService');
const teacherProfileService = require('../../services/timetable/teacherProfileService');
const teacherAssignmentService = require('../../services/timetable/teacherAssignmentService');
const timetableSettingsService = require('../../services/timetable/timetableSettingsService');

// Rooms
const listRooms = catchAsync(async (req, res) => {
  const data = await roomService.listRooms(req.query);
  res.json({ success: true, data });
});

const getRoom = catchAsync(async (req, res) => {
  const data = await roomService.getRoom(req.params.id);
  res.json({ success: true, data });
});

const createRoom = catchAsync(async (req, res) => {
  const data = await roomService.createRoom(req.body, req.user._id);
  res.status(201).json({ success: true, data });
});

const updateRoom = catchAsync(async (req, res) => {
  const data = await roomService.updateRoom(req.params.id, req.body);
  res.json({ success: true, data });
});

const deleteRoom = catchAsync(async (req, res) => {
  const data = await roomService.deleteRoom(req.params.id);
  res.json({ success: true, data });
});

// Period templates
const listPeriodTemplates = catchAsync(async (req, res) => {
  const data = await periodTemplateService.listPeriodTemplates(req.query);
  res.json({ success: true, data });
});

const getPeriodTemplate = catchAsync(async (req, res) => {
  const data = await periodTemplateService.getPeriodTemplate(req.params.id);
  res.json({ success: true, data });
});

const createPeriodTemplate = catchAsync(async (req, res) => {
  const data = await periodTemplateService.createPeriodTemplate(req.body, req.user._id);
  res.status(201).json({ success: true, data });
});

const updatePeriodTemplate = catchAsync(async (req, res) => {
  const data = await periodTemplateService.updatePeriodTemplate(req.params.id, req.body);
  res.json({ success: true, data });
});

const deletePeriodTemplate = catchAsync(async (req, res) => {
  const data = await periodTemplateService.deletePeriodTemplate(req.params.id);
  res.json({ success: true, data });
});

// Teacher profiles
const listTeacherProfiles = catchAsync(async (req, res) => {
  const data = await teacherProfileService.listTeacherProfiles(req.query);
  res.json({ success: true, data });
});

const getTeacherProfile = catchAsync(async (req, res) => {
  const data = await teacherProfileService.getTeacherProfile(req.params.id);
  res.json({ success: true, data });
});

const createTeacherProfile = catchAsync(async (req, res) => {
  const data = await teacherProfileService.createTeacherProfile(req.body, req.user._id);
  res.status(201).json({ success: true, data });
});

const updateTeacherProfile = catchAsync(async (req, res) => {
  const data = await teacherProfileService.updateTeacherProfile(req.params.id, req.body);
  res.json({ success: true, data });
});

const deleteTeacherProfile = catchAsync(async (req, res) => {
  const data = await teacherProfileService.deleteTeacherProfile(req.params.id);
  res.json({ success: true, data });
});

const { roleNameOf } = require('../../utils/parentScope');

// Teacher assignments
const listTeacherAssignments = catchAsync(async (req, res) => {
  const query = { ...req.query };
  if (roleNameOf(req) === 'teacher') {
    query.teacherId = String(req.user._id);
  }
  const data = await teacherAssignmentService.listTeacherAssignments(query);
  res.json({ success: true, data });
});

const createTeacherAssignment = catchAsync(async (req, res) => {
  const data = await teacherAssignmentService.createTeacherAssignment(req.body, req.user._id);
  res.status(201).json({ success: true, data });
});

const bulkSyncTeacherAssignments = catchAsync(async (req, res) => {
  const data = await teacherAssignmentService.bulkSyncTeacherAssignments(req.body, req.user._id);
  res.json({ success: true, data });
});

const upsertSubjectTeacher = catchAsync(async (req, res) => {
  const data = await teacherAssignmentService.upsertSubjectTeacher(req.body, req.user._id);
  res.json({ success: true, data });
});

const syncSectionSubjectTeachers = catchAsync(async (req, res) => {
  const data = await teacherAssignmentService.syncSectionSubjectTeachers(req.body, req.user._id);
  res.json({ success: true, data });
});

const updateTeacherAssignment = catchAsync(async (req, res) => {
  const data = await teacherAssignmentService.updateTeacherAssignment(req.params.id, req.body);
  res.json({ success: true, data });
});

const deleteTeacherAssignment = catchAsync(async (req, res) => {
  const data = await teacherAssignmentService.deleteTeacherAssignment(req.params.id);
  res.json({ success: true, data });
});

// Settings
const getSettings = catchAsync(async (req, res) => {
  const data = await timetableSettingsService.getSettings(req.params.sessionId);
  res.json({ success: true, data });
});

const upsertSettings = catchAsync(async (req, res) => {
  const data = await timetableSettingsService.upsertSettings(req.params.sessionId, req.body);
  res.json({ success: true, data });
});

module.exports = {
  listRooms,
  getRoom,
  createRoom,
  updateRoom,
  deleteRoom,
  listPeriodTemplates,
  getPeriodTemplate,
  createPeriodTemplate,
  updatePeriodTemplate,
  deletePeriodTemplate,
  listTeacherProfiles,
  getTeacherProfile,
  createTeacherProfile,
  updateTeacherProfile,
  deleteTeacherProfile,
  listTeacherAssignments,
  createTeacherAssignment,
  bulkSyncTeacherAssignments,
  upsertSubjectTeacher,
  syncSectionSubjectTeachers,
  updateTeacherAssignment,
  deleteTeacherAssignment,
  getSettings,
  upsertSettings,
};
