const catchAsync = require('../../utils/catchAsync');
const classTestService = require('../../services/academy/academyClassTestService');
const { renderAwardListPdf } = require('../../services/academy/academyAwardListService');
const { renderClassTestMarksReportPdf } = require('../../services/academy/academyMarksReportService');
const {
  isParentRole,
  linkedStudentsForParent,
  assertNotParent,
} = require('../../utils/parentScope');

function idStr(ref) {
  if (!ref) return '';
  return String(typeof ref === 'object' ? ref._id || ref : ref);
}

async function filterClassTestsForParent(req, rows) {
  if (!isParentRole(req)) return rows;
  const kids = await linkedStudentsForParent(req, { select: 'classId sectionId' });
  const classIds = new Set(kids.map((s) => idStr(s.classId)).filter(Boolean));
  const sectionIds = new Set(kids.map((s) => idStr(s.sectionId)).filter(Boolean));
  return (rows || []).filter((row) => {
    const cid = idStr(row.classId);
    const sid = idStr(row.sectionId);
    if (!classIds.has(cid)) return false;
    if (sid && sectionIds.size && !sectionIds.has(sid)) return false;
    return true;
  });
}

const list = catchAsync(async (req, res) => {
  const data = await classTestService.listClassTests(
    {
      classId: req.query.classId,
      seriesId: req.query.seriesId,
      sessionId: req.query.sessionId,
    },
    req.user
  );
  res.json({ success: true, data: await filterClassTestsForParent(req, data) });
});

const create = catchAsync(async (req, res) => {
  assertNotParent(req, 'Parents cannot create class tests');
  const data = await classTestService.createClassTest(req.body, req.user._id, req.user);
  res.status(201).json({ success: true, data });
});

const getEntry = catchAsync(async (req, res) => {
  assertNotParent(req, 'Parents cannot open marks entry');
  const data = await classTestService.getClassTestMarksEntry(
    req.params.id,
    req.user,
    req.query.sessionId
  );
  res.json({ success: true, data });
});

const saveMarks = catchAsync(async (req, res) => {
  assertNotParent(req, 'Parents cannot save marks');
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
  assertNotParent(req, 'Parents cannot upload test papers');
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
  assertNotParent(req, 'Parents cannot delete class tests');
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

const marksReportPdf = catchAsync(async (req, res) => {
  const view = String(req.query.view || 'test').toLowerCase();
  const buffer = await renderClassTestMarksReportPdf(req.params.id, req.user, req.query.sessionId, {
    view,
    studentId: req.query.studentId ? String(req.query.studentId) : undefined,
    studentIds: req.query.studentIds ? String(req.query.studentIds) : undefined,
  });
  const filename = `marks-report-${view}-${req.params.id}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.send(buffer);
});

module.exports = {
  list,
  create,
  getEntry,
  saveMarks,
  uploadTestPaper,
  remove,
  awardListPdf,
  marksReportPdf,
};
