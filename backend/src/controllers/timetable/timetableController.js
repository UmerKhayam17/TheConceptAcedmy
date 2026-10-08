const catchAsync = require('../../utils/catchAsync');
const timetableVersionService = require('../../services/timetable/timetableVersionService');
const scheduleSlotService = require('../../services/timetable/scheduleSlotService');
const classBoardService = require('../../services/timetable/classBoardService');
const { validateVersion } = require('../../services/timetable/timetableConflictService');

// Versions
const listVersions = catchAsync(async (req, res) => {
  const data = await timetableVersionService.listVersions(req.query);
  res.json({ success: true, data });
});

const getVersion = catchAsync(async (req, res) => {
  const data = await timetableVersionService.getVersion(req.params.id);
  res.json({ success: true, data });
});

const createVersion = catchAsync(async (req, res) => {
  const data = await timetableVersionService.createVersion(req.body, req.user._id);
  res.status(201).json({ success: true, data });
});

const duplicateVersion = catchAsync(async (req, res) => {
  const data = await timetableVersionService.duplicateVersion(req.params.id, req.user._id);
  res.status(201).json({ success: true, data });
});

const getVersionGrid = catchAsync(async (req, res) => {
  const data = await timetableVersionService.getVersionGrid(req.params.id);
  res.json({ success: true, data });
});

const publishVersion = catchAsync(async (req, res) => {
  const data = await timetableVersionService.publishVersion(req.params.id, req.user._id);
  res.json({ success: true, data });
});

const archiveVersion = catchAsync(async (req, res) => {
  const data = await timetableVersionService.archiveVersion(req.params.id);
  res.json({ success: true, data });
});

const deleteVersion = catchAsync(async (req, res) => {
  const data = await timetableVersionService.deleteVersion(req.params.id);
  res.json({ success: true, data });
});

const validateVersionHandler = catchAsync(async (req, res) => {
  const forPublish = req.query.forPublish === 'true';
  const result = await validateVersion(req.params.id, { forPublish });
  res.json({ success: true, data: result });
});

const getPublishedForSection = catchAsync(async (req, res) => {
  const { sessionId, sectionId } = req.query;
  const data = await timetableVersionService.getPublishedVersion(sessionId, sectionId);
  res.json({ success: true, data });
});

// Slots
const listSlots = catchAsync(async (req, res) => {
  const data = await scheduleSlotService.listSlots(req.params.versionId);
  res.json({ success: true, data });
});

const upsertSlot = catchAsync(async (req, res) => {
  const data = await scheduleSlotService.upsertSlot(req.params.versionId, req.body, {
    userId: req.user._id,
  });
  res.status(201).json({ success: true, data });
});

const moveSlot = catchAsync(async (req, res) => {
  const data = await scheduleSlotService.moveSlot(req.params.slotId, req.body);
  res.json({ success: true, data });
});

const deleteSlot = catchAsync(async (req, res) => {
  const data = await scheduleSlotService.deleteSlot(req.params.slotId);
  res.json({ success: true, data });
});

// Views
const myTeacherSchedule = catchAsync(async (req, res) => {
  const sessionId = req.query.sessionId;
  const teacherId = req.query.teacherId || req.user._id;
  const data = await scheduleSlotService.getTeacherSchedule(sessionId, teacherId, {
    status: req.query.status || 'published',
  });
  res.json({ success: true, data });
});

const roomSchedule = catchAsync(async (req, res) => {
  const data = await scheduleSlotService.getRoomSchedule(
    req.query.sessionId,
    req.params.roomId,
    { status: req.query.status || 'published' }
  );
  res.json({ success: true, data });
});

const sectionSchedule = catchAsync(async (req, res) => {
  const { sessionId, sectionId } = req.query;
  const version = await timetableVersionService.getPublishedVersion(sessionId, sectionId);
  if (!version) {
    return res.json({ success: true, data: { version: null, grid: null } });
  }
  const grid = await timetableVersionService.getVersionGrid(version._id);
  res.json({ success: true, data: grid });
});

const createSubstitution = catchAsync(async (req, res) => {
  const data = await scheduleSlotService.createSubstitution(req.body, req.user._id);
  res.status(201).json({ success: true, data });
});

const getClassBoard = catchAsync(async (req, res) => {
  const data = await classBoardService.getClassBoard({
    sessionId: req.query.sessionId,
    classId: req.query.classId,
    day: req.query.day,
  });
  res.json({ success: true, data });
});

const upsertSharedLesson = catchAsync(async (req, res) => {
  const data = await classBoardService.upsertSharedLesson(req.body, req.user._id);
  res.status(201).json({ success: true, data });
});

const deleteCombinedGroup = catchAsync(async (req, res) => {
  const data = await classBoardService.deleteCombinedGroup(req.params.combinedGroupId);
  res.json({ success: true, data });
});

const publishClassDrafts = catchAsync(async (req, res) => {
  const data = await classBoardService.publishClassDrafts(req.body, req.user._id);
  res.json({ success: true, data });
});

const moveClassBoardLesson = catchAsync(async (req, res) => {
  const data = await classBoardService.moveClassBoardLesson(req.body, req.user._id);
  res.json({ success: true, data });
});

module.exports = {
  listVersions,
  getVersion,
  createVersion,
  duplicateVersion,
  getVersionGrid,
  publishVersion,
  archiveVersion,
  deleteVersion,
  validateVersionHandler,
  getPublishedForSection,
  listSlots,
  upsertSlot,
  moveSlot,
  deleteSlot,
  myTeacherSchedule,
  roomSchedule,
  sectionSchedule,
  createSubstitution,
  getClassBoard,
  upsertSharedLesson,
  deleteCombinedGroup,
  publishClassDrafts,
  moveClassBoardLesson,
};
