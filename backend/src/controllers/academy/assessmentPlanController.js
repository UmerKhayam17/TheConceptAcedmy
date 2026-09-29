const catchAsync = require('../../utils/catchAsync');
const planService = require('../../services/academy/assessmentPlanService');

const getPlan = catchAsync(async (req, res) => {
  const data = await planService.getPlan(req.params.sessionId);
  res.json({ success: true, data });
});

const initialize = catchAsync(async (req, res) => {
  const data = await planService.initializePlan(req.params.sessionId, req.user._id);
  res.status(201).json({ success: true, data });
});

const clear = catchAsync(async (req, res) => {
  const data = await planService.clearPlan(req.params.sessionId, req.user._id);
  res.json({ success: true, data });
});

const updateItem = catchAsync(async (req, res) => {
  const data = await planService.updateCatalogItem(
    req.params.sessionId,
    req.params.itemId,
    req.body,
    req.user._id
  );
  res.json({ success: true, data });
});

const listAssignments = catchAsync(async (req, res) => {
  const data = await planService.listAssignments(req.params.sessionId, {
    category: req.query.category,
    planItemId: req.query.planItemId,
    status: req.query.status,
  });
  res.json({ success: true, data });
});

const createAssignment = catchAsync(async (req, res) => {
  const data = await planService.createAssignment(req.params.sessionId, req.body, req.user._id);
  res.status(201).json({ success: true, data });
});

const updateAssignment = catchAsync(async (req, res) => {
  const data = await planService.updateAssignment(
    req.params.sessionId,
    req.params.assignmentId,
    req.body,
    req.user._id
  );
  res.json({ success: true, data });
});

const upsertPapers = catchAsync(async (req, res) => {
  const data = await planService.upsertAssignmentPapers(
    req.params.sessionId,
    req.params.assignmentId,
    req.body.papers,
    req.user._id
  );
  res.json({ success: true, data });
});

const deleteAssignment = catchAsync(async (req, res) => {
  const data = await planService.deleteAssignment(req.params.sessionId, req.params.assignmentId);
  res.json({ success: true, data });
});

const publishAssignment = catchAsync(async (req, res) => {
  const data = await planService.publishAssignment(
    req.params.sessionId,
    req.params.assignmentId,
    req.user._id
  );
  res.json({ success: true, data });
});

const dateSheet = catchAsync(async (req, res) => {
  const data = await planService.getPublishedDateSheet(req.params.sessionId, {
    classId: req.query.classId,
    sectionId: req.query.sectionId,
  });
  res.json({ success: true, data });
});

module.exports = {
  getPlan,
  initialize,
  clear,
  updateItem,
  listAssignments,
  createAssignment,
  updateAssignment,
  upsertPapers,
  deleteAssignment,
  publishAssignment,
  dateSheet,
};
