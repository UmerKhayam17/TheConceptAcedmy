const mongoose = require('mongoose');

const dateSheetEntrySchema = new mongoose.Schema(
  {
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademySubject' },
    date: { type: Date },
    startTime: { type: String },
    endTime: { type: String },
    totalMarks: { type: Number, min: 1 },
    syllabus: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const examSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true },
    academyClass: {
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
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', index: true },
    sessionLabel: { type: String, trim: true, default: '' },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    dateSheet: [dateSheetEntrySchema],
    status: {
      type: String,
      enum: ['scheduled', 'ongoing', 'completed', 'cancelled'],
      default: 'scheduled',
      index: true,
    },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'SessionAssessmentPlan', index: true },
    planItemId: { type: mongoose.Schema.Types.ObjectId },
    assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssessmentAssignment', index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Exam', examSchema);
