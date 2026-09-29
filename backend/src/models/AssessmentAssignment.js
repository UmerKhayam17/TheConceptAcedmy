const mongoose = require('mongoose');

const paperSchema = new mongoose.Schema(
  {
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademySubject', required: true },
    totalMarks: { type: Number, min: 1 },
    examDate: { type: Date },
    syllabus: { type: String, trim: true, default: '' },
    classTestId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyClassTest' },
  },
  { _id: true }
);

/**
 * One assignment of a catalog test/exam to a class (+ optional section).
 * The same plan item (e.g. TEST NO.1) can have many assignments across classes.
 */
const assessmentAssignmentSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session',
      required: true,
      index: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SessionAssessmentPlan',
      required: true,
      index: true,
    },
    planItemId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    /** Denormalized from plan item for easy listing. */
    category: { type: String, enum: ['test', 'exam'], required: true },
    name: { type: String, required: true, trim: true },
    assessmentType: { type: String, required: true, trim: true },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademyClass',
      required: true,
      index: true,
    },
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademySection',
      index: true,
    },
    papers: [paperSchema],
    status: {
      type: String,
      enum: ['draft', 'published'],
      default: 'draft',
      index: true,
    },
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam' },
    publishedAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'assessmentassignments' }
);

assessmentAssignmentSchema.index({ sessionId: 1, category: 1, status: 1 });
assessmentAssignmentSchema.index({ planItemId: 1, classId: 1 });

module.exports = mongoose.model('AssessmentAssignment', assessmentAssignmentSchema);
