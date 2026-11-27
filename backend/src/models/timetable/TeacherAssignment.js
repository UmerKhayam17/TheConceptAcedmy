const mongoose = require('mongoose');

const teacherAssignmentSchema = new mongoose.Schema(
  {
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true, index: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyClass', required: true },
    section: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademySection', required: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademySubject', required: true },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    /**
     * YYYY-MM-DD from which this teacher is expected for this section+subject.
     * Attendance (and salary attendance) ignore timetable periods before this date.
     * Null/missing = no start filter (legacy rows).
     */
    assignedFrom: { type: String, default: null, trim: true },
    isPrimary: { type: Boolean, default: true },
    priority: { type: Number, default: 1, min: 1 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

teacherAssignmentSchema.index(
  { session: 1, section: 1, subject: 1, teacher: 1 },
  { unique: true }
);

module.exports = mongoose.model('TeacherAssignment', teacherAssignmentSchema);
