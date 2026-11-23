const mongoose = require('mongoose');
const { ROLES } = require('../config/permissions');

// One User model; the five roles are a field, as the LLD specifies.
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(ROLES), required: true, index: true },
    designation: { type: String, trim: true, default: '' },
    department: { type: String, trim: true, default: '' },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
    active: { type: Boolean, default: true },
    failedAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    refreshTokens: {
      type: [{ _id: false, hash: String, expiresAt: Date, usedAt: { type: Date, default: null } }],
      select: false,
      default: [],
    },
  },
  { timestamps: true }
);

userSchema.methods.isLocked = function (now = new Date()) {
  return !!this.lockedUntil && this.lockedUntil > now;
};
userSchema.methods.toPublic = function () {
  return {
    id: this.id, name: this.name, email: this.email, role: this.role,
    designation: this.designation, department: this.department,
    organizationId: this.organizationId, active: this.active,
  };
};

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
