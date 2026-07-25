const mongoose = require('mongoose');

/**
 * Face enrollment for a student or staff member (Mongo-only AI attendance).
 * personKey = STU-<mongoId> | STF-<mongoId>
 */
const aiFaceEnrollmentSchema = new mongoose.Schema(
  {
    personKey: { type: String, required: true, unique: true, trim: true, index: true },
    kind: { type: String, enum: ['student', 'staff'], required: true },
    refId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    displayName: { type: String, trim: true },
    imagePaths: [{ type: String }],
    totalImages: { type: Number, default: 0 },
    embedding: { type: [Number], default: undefined },
    isTrained: { type: Boolean, default: false },
    modelVersion: { type: String, default: 'insightface-buffalo_l' },
  },
  { timestamps: true, collection: 'ai_face_enrollments' }
);

module.exports = mongoose.model('AiFaceEnrollment', aiFaceEnrollmentSchema);
