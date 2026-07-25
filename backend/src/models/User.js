const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true, minlength: 8, select: false },
    phone: { type: String, required: true, trim: true },
    role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
    permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }],
    // Module-based permissions: { exam: ['view', 'create', 'edit'], assignment: ['view'] }
    modulePermissions: {
      type: Map,
      of: [String],
      default: new Map(),
    },
    isActive: { type: Boolean, default: true },
    /** Monthly / contractual salary for staff (teacher, accountant); PKR */
    salary: { type: Number, default: 0, min: 0 },
    profileImage: { type: String },
    /** Linked face ID in AIAttendance (`STF-…`). */
    aiEmployeeId: { type: String, trim: true, index: true },
    fcmToken: { type: String },
    lastLogin: { type: Date },
    refreshToken: { type: String, select: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

userSchema.index({ isActive: 1 });

userSchema.virtual('profile_image').get(function profileImageAlias() {
  return this.profileImage;
});
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('User', userSchema);
