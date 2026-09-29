const ApiError = require('../../utils/ApiError');
const Session = require('../../models/Session');
const SessionAssessmentPlan = require('../../models/SessionAssessmentPlan');
const AssessmentAssignment = require('../../models/AssessmentAssignment');
const AcademyClass = require('../../models/academy/AcademyClass');
const AcademySection = require('../../models/academy/AcademySection');
const AcademySubject = require('../../models/academy/AcademySubject');
const AcademyStudent = require('../../models/academy/AcademyStudent');
const AcademyClassTest = require('../../models/academy/AcademyClassTest');
const Exam = require('../../models/Exam');
const User = require('../../models/User');
const {
  TEST_NAME_TEMPLATES,
  EXAM_NAME_TEMPLATES,
  assessmentTypeLabel,
  ASSESSMENT_TYPES,
} = require('../../config/assessmentTaxonomy');
const { assertSessionWritable } = require('../session/sessionGuard');
const { createNotificationForUser, emitModuleSync } = require('../realtime/realtimeService');

const ASSIGN_POPULATE = [
  { path: 'classId', select: 'className sessionId' },
  { path: 'sectionId', select: 'sectionName classId' },
  { path: 'papers.subjectId', select: 'subjectName subjectCode classId' },
];

async function getSession(sessionId) {
  const session = await Session.findById(sessionId).select('name startDate endDate status isClosed isActive');
  if (!session) throw new ApiError(404, 'Session not found');
  return session;
}

async function getOrCreatePlan(sessionId) {
  const session = await getSession(sessionId);
  let plan = await SessionAssessmentPlan.findOne({ sessionId });
  if (!plan) {
    plan = await SessionAssessmentPlan.create({ sessionId, status: 'empty', items: [] });
  } else if (plan.status === 'draft' || plan.status === 'published') {
    // Migrate older plan statuses (class was mixed into catalog).
    plan.status = plan.items?.length ? 'ready' : 'empty';
    await plan.save();
  }
  return { plan, session };
}

function catalogSummary(plan, assignmentCounts = {}) {
  const items = plan.items || [];
  return {
    totalItems: items.length,
    testCount: items.filter((i) => i.category === 'test').length,
    examCount: items.filter((i) => i.category === 'exam').length,
    status: plan.status,
    assignmentCount: assignmentCounts.total || 0,
    publishedAssignmentCount: assignmentCounts.published || 0,
  };
}

async function countAssignments(sessionId) {
  const [total, published] = await Promise.all([
    AssessmentAssignment.countDocuments({ sessionId }),
    AssessmentAssignment.countDocuments({ sessionId, status: 'published' }),
  ]);
  return { total, published };
}

/** System Config: get catalog (tests/exams names only). */
async function getPlan(sessionId) {
  const { plan, session } = await getOrCreatePlan(sessionId);
  const counts = await countAssignments(sessionId);
  const items = (plan.items || []).map((item) => ({
    ...item.toObject(),
    assignmentCount: undefined,
  }));

  const byItem = await AssessmentAssignment.aggregate([
    { $match: { sessionId: plan.sessionId } },
    { $group: { _id: '$planItemId', count: { $sum: 1 }, published: { $sum: { $cond: [{ $eq: ['$status', 'published'] }, 1, 0] } } } },
  ]);
  const countMap = Object.fromEntries(byItem.map((r) => [String(r._id), r]));

  return {
    plan: {
      ...plan.toObject(),
      items: items.map((it) => ({
        ...it,
        assignmentCount: countMap[String(it._id)]?.count || 0,
        publishedCount: countMap[String(it._id)]?.published || 0,
      })),
    },
    session,
    summary: catalogSummary(plan, counts),
  };
}

/** System Config: create TEST NO.1–15 + Full Length / Full Book catalog. */
async function initializePlan(sessionId, userId) {
  await assertSessionWritable(sessionId);
  const { plan, session } = await getOrCreatePlan(sessionId);

  if (plan.items?.length) {
    throw new ApiError(400, 'Catalog already initialized. Clear it first to recreate.');
  }

  plan.items = [
    ...TEST_NAME_TEMPLATES.map((t) => ({
      category: 'test',
      name: t.name,
      assessmentType: t.assessmentType,
    })),
    ...EXAM_NAME_TEMPLATES.map((t) => ({
      category: 'exam',
      name: t.name,
      assessmentType: t.assessmentType,
    })),
  ];
  plan.status = 'ready';
  plan.createdBy = userId;
  plan.updatedBy = userId;
  await plan.save();

  emitModuleSync('exam', 'assessment-plan', 'initialized', { sessionId: String(sessionId) });
  return getPlan(sessionId);
}

async function clearPlan(sessionId, userId) {
  await assertSessionWritable(sessionId);
  const { plan } = await getOrCreatePlan(sessionId);

  const published = await AssessmentAssignment.countDocuments({ sessionId, status: 'published' });
  if (published) {
    throw new ApiError(400, 'Cannot clear catalog while published class assignments exist');
  }

  await AssessmentAssignment.deleteMany({ sessionId, status: 'draft' });
  plan.items = [];
  plan.status = 'empty';
  plan.updatedBy = userId;
  await plan.save();

  emitModuleSync('exam', 'assessment-plan', 'cleared', { sessionId: String(sessionId) });
  return getPlan(sessionId);
}

async function updateCatalogItem(sessionId, itemId, body, userId) {
  await assertSessionWritable(sessionId);
  const { plan } = await getOrCreatePlan(sessionId);
  const item = plan.items.id(itemId);
  if (!item) throw new ApiError(404, 'Catalog item not found');

  if (body.name !== undefined) item.name = String(body.name).trim();
  if (body.assessmentType !== undefined) {
    if (!ASSESSMENT_TYPES[body.assessmentType]) {
      throw new ApiError(400, `Invalid assessment type: ${body.assessmentType}`);
    }
    item.assessmentType = body.assessmentType;
    item.category = ASSESSMENT_TYPES[body.assessmentType].category;
  }

  plan.updatedBy = userId;
  await plan.save();

  // Keep denormalized fields in draft assignments in sync
  await AssessmentAssignment.updateMany(
    { sessionId, planItemId: itemId, status: 'draft' },
    {
      $set: {
        name: item.name,
        assessmentType: item.assessmentType,
        category: item.category,
        updatedBy: userId,
      },
    }
  );

  return getPlan(sessionId);
}

function paperReady(p) {
  return p.totalMarks >= 1 && p.examDate;
}

function assignmentReady(a) {
  return Boolean(a.classId) && (a.papers || []).some(paperReady);
}

async function findDuplicateAssignment(planItemId, classId, sectionId, excludeId) {
  const q = { planItemId, classId };
  if (sectionId) q.sectionId = sectionId;
  else q.$or = [{ sectionId: null }, { sectionId: { $exists: false } }];
  if (excludeId) q._id = { $ne: excludeId };
  return AssessmentAssignment.findOne(q);
}

/** Assessments module: list assignments (optionally by category / plan item). */
async function listAssignments(sessionId, { category, planItemId, status } = {}) {
  await getSession(sessionId);
  const q = { sessionId };
  if (category) q.category = category;
  if (planItemId) q.planItemId = planItemId;
  if (status) q.status = status;

  const rows = await AssessmentAssignment.find(q)
    .populate(ASSIGN_POPULATE)
    .sort({ name: 1, createdAt: 1 })
    .lean();

  const { plan } = await getOrCreatePlan(sessionId);
  return {
    plan: { _id: plan._id, status: plan.status, items: plan.items },
    assignments: rows,
  };
}

/** Assign catalog test/exam to a class (+ optional section). Same item → many classes. */
async function createAssignment(sessionId, body, userId) {
  await assertSessionWritable(sessionId);
  const { plan, session } = await getOrCreatePlan(sessionId);
  if (plan.status !== 'ready' || !plan.items?.length) {
    throw new ApiError(400, 'Initialize the assessment catalog in System Config first');
  }

  const item = plan.items.id(body.planItemId);
  if (!item) throw new ApiError(404, 'Catalog test/exam not found');

  if (!body.classId) throw new ApiError(400, 'Class is required');
  const cls = await AcademyClass.findOne({ _id: body.classId, sessionId });
  if (!cls) throw new ApiError(400, 'Class not found in this session');

  let sectionId;
  if (body.sectionId) {
    const sec = await AcademySection.findOne({ _id: body.sectionId, classId: body.classId });
    if (!sec) throw new ApiError(400, 'Section not found for this class');
    sectionId = body.sectionId;
  }

  const dup = await findDuplicateAssignment(item._id, body.classId, sectionId);
  if (dup) {
    throw new ApiError(409, `${item.name} is already assigned to this class${sectionId ? '/section' : ''}`);
  }

  const doc = await AssessmentAssignment.create({
    sessionId,
    planId: plan._id,
    planItemId: item._id,
    category: item.category,
    name: item.name,
    assessmentType: item.assessmentType,
    classId: body.classId,
    sectionId: sectionId || undefined,
    papers: [],
    status: 'draft',
    createdBy: userId,
    updatedBy: userId,
  });

  const populated = await AssessmentAssignment.findById(doc._id).populate(ASSIGN_POPULATE);
  emitModuleSync('exam', 'assessment-assignment', 'created', { sessionId: String(sessionId) });
  return { assignment: populated, session };
}

async function updateAssignment(sessionId, assignmentId, body, userId) {
  await assertSessionWritable(sessionId);
  const doc = await AssessmentAssignment.findOne({ _id: assignmentId, sessionId });
  if (!doc) throw new ApiError(404, 'Assignment not found');
  if (doc.status === 'published') throw new ApiError(400, 'Published assignments are locked');

  if (body.classId !== undefined) {
    const cls = await AcademyClass.findOne({ _id: body.classId, sessionId });
    if (!cls) throw new ApiError(400, 'Class not found in this session');
    const classChanged = String(doc.classId) !== String(body.classId);
    doc.classId = body.classId;
    if (classChanged) {
      doc.sectionId = undefined;
      doc.papers = [];
    }
  }

  if (body.sectionId !== undefined) {
    if (!body.sectionId) {
      doc.sectionId = undefined;
    } else {
      const sec = await AcademySection.findOne({ _id: body.sectionId, classId: doc.classId });
      if (!sec) throw new ApiError(400, 'Section not found for this class');
      doc.sectionId = body.sectionId;
    }
  }

  const dup = await findDuplicateAssignment(doc.planItemId, doc.classId, doc.sectionId, doc._id);
  if (dup) {
    throw new ApiError(409, `${doc.name} is already assigned to this class/section`);
  }

  doc.updatedBy = userId;
  await doc.save();
  const populated = await AssessmentAssignment.findById(doc._id).populate(ASSIGN_POPULATE);
  return { assignment: populated };
}

async function upsertAssignmentPapers(sessionId, assignmentId, papersInput, userId) {
  await assertSessionWritable(sessionId);
  const doc = await AssessmentAssignment.findOne({ _id: assignmentId, sessionId });
  if (!doc) throw new ApiError(404, 'Assignment not found');
  if (doc.status === 'published') throw new ApiError(400, 'Published assignments are locked');

  const subjects = await AcademySubject.find({ classId: doc.classId, status: 'active' }).select('_id');
  const allowed = new Set(subjects.map((s) => String(s._id)));

  if (!Array.isArray(papersInput)) throw new ApiError(400, 'papers must be an array');

  const next = [];
  for (const row of papersInput) {
    if (!row.subjectId || !allowed.has(String(row.subjectId))) {
      throw new ApiError(400, 'Invalid subject for this class');
    }
    const totalMarks = row.totalMarks != null && row.totalMarks !== '' ? Number(row.totalMarks) : undefined;
    const examDate = row.examDate ? new Date(row.examDate) : undefined;
    const syllabus = row.syllabus != null ? String(row.syllabus).trim() : '';

    if (!totalMarks && !examDate && !syllabus) continue;
    if (!totalMarks || totalMarks < 1) throw new ApiError(400, 'Total marks required for each included subject');
    if (!examDate || Number.isNaN(examDate.getTime())) {
      throw new ApiError(400, 'Test date required for each included subject');
    }

    next.push({ subjectId: row.subjectId, totalMarks, examDate, syllabus });
  }

  doc.papers = next;
  doc.updatedBy = userId;
  await doc.save();

  const populated = await AssessmentAssignment.findById(doc._id).populate(ASSIGN_POPULATE);
  return { assignment: populated };
}

async function deleteAssignment(sessionId, assignmentId) {
  await assertSessionWritable(sessionId);
  const doc = await AssessmentAssignment.findOne({ _id: assignmentId, sessionId });
  if (!doc) throw new ApiError(404, 'Assignment not found');
  if (doc.status === 'published') throw new ApiError(400, 'Cannot delete a published assignment');
  await doc.deleteOne();
  emitModuleSync('exam', 'assessment-assignment', 'deleted', { sessionId: String(sessionId) });
  return { ok: true };
}

/** Publish one class assignment → live class tests / exam + parent notify. */
async function publishAssignment(sessionId, assignmentId, userId) {
  await assertSessionWritable(sessionId);
  const session = await getSession(sessionId);
  const doc = await AssessmentAssignment.findOne({ _id: assignmentId, sessionId });
  if (!doc) throw new ApiError(404, 'Assignment not found');
  if (doc.status === 'published') throw new ApiError(400, 'Already published');
  if (!assignmentReady(doc)) {
    throw new ApiError(400, 'Add at least one subject with marks and date before publishing');
  }

  const readyPapers = doc.papers.filter(paperReady);
  let testsCreated = 0;
  let examsCreated = 0;

  if (doc.category === 'test') {
    for (const paper of readyPapers) {
      const created = await AcademyClassTest.create({
        classId: doc.classId,
        sectionId: doc.sectionId || undefined,
        subjectId: paper.subjectId,
        title: `${doc.name} — ${assessmentTypeLabel(doc.assessmentType)}`,
        seriesLabel: doc.name,
        assessmentType: doc.assessmentType,
        examDate: paper.examDate,
        testTime: '09:00',
        totalMarks: paper.totalMarks,
        syllabus: paper.syllabus || '',
        status: 'open',
        recurrence: 'once',
        planId: doc.planId,
        planItemId: doc.planItemId,
        assignmentId: doc._id,
        createdBy: userId,
      });
      paper.classTestId = created._id;
      testsCreated += 1;
    }
  } else {
    const dates = readyPapers.map((p) => new Date(p.examDate).getTime());
    const startDate = new Date(Math.min(...dates));
    const endDate = new Date(Math.max(...dates));
    const exam = await Exam.create({
      title: doc.name,
      type: assessmentTypeLabel(doc.assessmentType),
      academyClass: doc.classId,
      sectionId: doc.sectionId || undefined,
      sessionId: session._id,
      sessionLabel: session.name,
      startDate,
      endDate,
      dateSheet: readyPapers.map((p) => ({
        subject: p.subjectId,
        date: p.examDate,
        startTime: '09:00',
        endTime: '12:00',
        totalMarks: p.totalMarks,
        syllabus: p.syllabus || '',
      })),
      status: 'scheduled',
      planId: doc.planId,
      planItemId: doc.planItemId,
      assignmentId: doc._id,
      createdBy: userId,
    });
    doc.examId = exam._id;
    examsCreated = 1;
  }

  doc.status = 'published';
  doc.publishedAt = new Date();
  doc.updatedBy = userId;
  await doc.save();

  await notifyParentsForAssignment(session, doc);

  emitModuleSync('exam', 'assessment-assignment', 'published', { sessionId: String(sessionId) });
  emitModuleSync('exam', 'class-test', 'created', { sessionId: String(sessionId) });

  const populated = await AssessmentAssignment.findById(doc._id).populate(ASSIGN_POPULATE);
  return {
    assignment: populated,
    published: { testsCreated, examsCreated },
  };
}

async function notifyParentsForAssignment(session, assignment) {
  try {
    const q = { classId: assignment.classId, status: 'active' };
    if (assignment.sectionId) q.sectionId = assignment.sectionId;
    const students = await AcademyStudent.find(q).select('guardianEmail');
    const emails = [
      ...new Set(students.map((s) => String(s.guardianEmail || '').trim().toLowerCase()).filter(Boolean)),
    ];
    if (!emails.length) return;

    const parents = await User.find({ email: { $in: emails }, isActive: true }).select('_id');
    const title = `${assignment.name} scheduled — ${session.name}`;
    const body = `Date sheet and syllabus are available in the parent portal.`;

    await Promise.all(
      parents.map((p) =>
        createNotificationForUser(p._id, {
          type: 'assessment_assignment_published',
          title,
          body,
          path: '/exams/date-sheet',
          moduleKey: 'exam',
          resource: 'assessment-assignment',
          resourceId: String(assignment._id),
          meta: { sessionId: String(session._id), name: assignment.name },
        })
      )
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[assessment-assignment] parent notify failed:', err.message);
  }
}

async function getPublishedDateSheet(sessionId, { classId, sectionId } = {}) {
  const session = await getSession(sessionId);
  const q = { sessionId, status: 'published' };
  if (classId) q.classId = classId;
  if (sectionId) q.sectionId = sectionId;

  const assignments = await AssessmentAssignment.find(q).populate(ASSIGN_POPULATE).lean();
  const rows = [];

  for (const a of assignments) {
    for (const paper of (a.papers || []).filter(paperReady)) {
      const subj = paper.subjectId;
      rows.push({
        category: a.category,
        assessmentType: a.assessmentType,
        assessmentTypeLabel: assessmentTypeLabel(a.assessmentType),
        testName: a.name,
        className: typeof a.classId === 'object' ? a.classId.className : '',
        classId: String(a.classId?._id || a.classId || ''),
        sectionName: typeof a.sectionId === 'object' ? a.sectionId?.sectionName || '' : '',
        sectionId: a.sectionId ? String(a.sectionId._id || a.sectionId) : '',
        subjectName: typeof subj === 'object' ? subj.subjectName : '',
        subjectId: String(subj?._id || subj || ''),
        totalMarks: paper.totalMarks,
        examDate: paper.examDate,
        syllabus: paper.syllabus || '',
        classTestId: paper.classTestId ? String(paper.classTestId) : '',
        examId: a.examId ? String(a.examId) : '',
        assignmentId: String(a._id),
      });
    }
  }

  rows.sort((a, b) => new Date(a.examDate) - new Date(b.examDate));

  return {
    session,
    publishedAt: assignments.reduce((max, a) => {
      if (!a.publishedAt) return max;
      if (!max || new Date(a.publishedAt) > new Date(max)) return a.publishedAt;
      return max;
    }, null),
    rows,
  };
}

module.exports = {
  getPlan,
  initializePlan,
  clearPlan,
  updateCatalogItem,
  listAssignments,
  createAssignment,
  updateAssignment,
  upsertAssignmentPapers,
  deleteAssignment,
  publishAssignment,
  getPublishedDateSheet,
};
