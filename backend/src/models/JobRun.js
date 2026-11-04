const mongoose = require('mongoose');

/**
 * One row per scheduled-job run key (e.g. `monthly-fees:2026-11`).
 * Used so a job runs once per period even across restarts or multiple server instances.
 */
const jobRunSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    status: { type: String, enum: ['running', 'done', 'failed'], default: 'running', index: true },
    attempts: { type: Number, default: 0 },
    trigger: { type: String, trim: true },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    result: { type: mongoose.Schema.Types.Mixed },
    error: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('JobRun', jobRunSchema);
