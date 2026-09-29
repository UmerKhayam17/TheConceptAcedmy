const mongoose = require('mongoose');
const { ALL_ASSESSMENT_TYPE_KEYS } = require('../config/assessmentTaxonomy');

/** Catalog slot only — no class/section. Assignments live in AssessmentAssignment. */
const planItemSchema = new mongoose.Schema(
  {
    category: { type: String, enum: ['test', 'exam'], required: true },
    name: { type: String, required: true, trim: true },
    assessmentType: {
      type: String,
      enum: ALL_ASSESSMENT_TYPE_KEYS,
      required: true,
    },
  },
  { _id: true }
);

const sessionAssessmentPlanSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session',
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['empty', 'ready'],
      default: 'empty',
      index: true,
    },
    items: [planItemSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'sessionassessmentplans' }
);

module.exports = mongoose.model('SessionAssessmentPlan', sessionAssessmentPlanSchema);
