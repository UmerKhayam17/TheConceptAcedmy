const mongoose = require('mongoose');

const academySubjectSchema = new mongoose.Schema(
  {
    subjectName: { type: String, required: true, trim: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyClass', required: true, index: true },
    subjectCode: { type: String, required: true, trim: true, uppercase: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    /**
     * required = core/standard subject
     * choice = elective; subjects sharing the same choiceGroupName form one pick-group
     */
    enrollmentType: {
      type: String,
      enum: ['required', 'choice'],
      default: 'required',
      index: true,
    },
    /** Shared name for electives in the same choice group (within a class). */
    choiceGroupName: { type: String, trim: true },
    /** How many subjects a student must pick from this group (stored on each member). */
    pickCount: { type: Number, default: 1, min: 1 },
    /**
     * Share of the student's monthly tuition that goes into this subject's teacher pool.
     * Excel: 10%/15% (9th–10th) or 13.333%/20% (11th–12th). 0 = not used in salary calc.
     * Teacher cut % is on the staff user (`salaryPercentage`), not on the subject.
     */
    tuitionSharePercent: { type: Number, default: 0, min: 0, max: 100 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'subjects' }
);

academySubjectSchema.index({ classId: 1, subjectCode: 1 }, { unique: true });
academySubjectSchema.index({ classId: 1, enrollmentType: 1, choiceGroupName: 1 });

/** Timetable / legacy config API compatibility */
academySubjectSchema.virtual('name').get(function getName() {
  return this.subjectName;
});
academySubjectSchema.virtual('code').get(function getCode() {
  return this.subjectCode;
});
academySubjectSchema.virtual('class').get(function getClass() {
  return this.classId;
});
academySubjectSchema.set('toJSON', { virtuals: true });
academySubjectSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('AcademySubject', academySubjectSchema);
