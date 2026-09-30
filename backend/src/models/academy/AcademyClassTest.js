const mongoose = require('mongoose');
const { ALL_ASSESSMENT_TYPE_KEYS } = require('../../config/assessmentTaxonomy');

const academyClassTestSchema = new mongoose.Schema(
  {
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademyClass',
      required: true,
      index: true,
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademySubject',
      required: true,
    },
    /** Display name for this occurrence (includes series part when recurring). */
    title: { type: String, required: true, trim: true },
    /** Base test name for the whole series (same on every occurrence). */
    seriesLabel: { type: String, trim: true },
    assessmentType: {
      type: String,
      enum: ALL_ASSESSMENT_TYPE_KEYS,
      default: 'weekly',
    },
    examDate: { type: Date, required: true, index: true },
    /** Time the test was held or scheduled, 24h "HH:mm". */
    testTime: { type: String, trim: true, default: '09:00' },
    totalMarks: { type: Number, required: true, min: 1 },
    syllabus: { type: String, trim: true, default: '' },
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademySection',
      index: true,
    },
    status: {
      type: String,
      enum: ['open', 'closed'],
      default: 'open',
    },
    recurrence: {
      type: String,
      enum: ['once', 'daily', 'weekly', 'monthly'],
      default: 'once',
      index: true,
    },
    seriesId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
    },
    occurrenceIndex: { type: Number, min: 1, default: 1 },
    occurrenceCount: { type: Number, min: 1, default: 1 },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'SessionAssessmentPlan', index: true },
    planItemId: { type: mongoose.Schema.Types.ObjectId },
    assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssessmentAssignment', index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'classtests' }
);

academyClassTestSchema.index({ seriesId: 1, occurrenceIndex: 1 });

module.exports = mongoose.model('AcademyClassTest', academyClassTestSchema);
