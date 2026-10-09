const catchAsync = require('../../utils/catchAsync');
const classTestService = require('../../services/academy/academyClassTestService');
const { renderAwardListPdf } = require('../../services/academy/academyAwardListService');

const list = catchAsync(async (req, res) => {
  const data = await classTestService.listClassTests(
    {
      classId: req.query.classId,
      seriesId: req.query.seriesId,
      sessionId: req.query.sessionId,
    },
    req.user
  );
  res.json({ success: true, data });
});

const create = catchAsync(async (req, res) => {
  const data = await classTestService.createClassTest(req.body, req.user._id, req.user);
  res.status(201).json({ success: true, data });
});

const getEntry = catchAsync(async (req, res) => {
  const data = await classTestService.getClassTestMarksEntry(
    req.params.id,
    req.user,
    req.query.sessionId
  );
  res.json({ success: true, data });
});

const saveMarks = catchAsync(async (req, res) => {
  const data = await classTestService.saveClassTestMarks(
    req.params.id,
    req.body.entries,
    req.user._id,
    req.user,
    req.body.sessionId || req.query.sessionId
  );
  res.status(201).json({ success: true, data });
});

const uploadTestPaper = catchAsync(async (req, res) => {
  const data = await classTestService.uploadStudentTestPaper(
    req.params.id,
    req.params.studentId,
    req.file,
    req.user,
    req.query.sessionId
  );
  res.status(201).json({ success: true, data });
});

const remove = catchAsync(async (req, res) => {
  const deleteSeries = req.query.series === 'true' || req.query.series === '1';
  const data = await classTestService.removeClassTest(
    req.params.id,
    { deleteSeries },
    req.user,
    req.query.sessionId
  );
  res.json({ success: true, data });
});

const awardListPdf = catchAsync(async (req, res) => {
  const buffer = await renderAwardListPdf(req.params.id, req.user, req.query.sessionId);
  const filename = `award-list-${req.params.id}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.send(buffer);
});

module.exports = { list, create, getEntry, saveMarks, uploadTestPaper, remove, awardListPdf };
