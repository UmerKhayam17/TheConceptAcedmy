const mongoose = require('mongoose');

const academyAttendanceSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AcademyStudent',
      required: true,
      index: true,
    },
    date: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ['present', 'absent', 'late', 'leave'],
      default: 'present',
    },
    /** manual | ai — how this day was marked */
    source: {
      type: String,
      enum: ['manual', 'ai'],
      default: 'manual',
    },
    checkIn: { type: Date },
    checkOut: { type: Date },
    confidence: { type: Number },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademySubject' },
    notes: { type: String, trim: true },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'attendances' }
);

academyAttendanceSchema.index({ studentId: 1, date: 1, subjectId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('AcademyAttendance', academyAttendanceSchema);
