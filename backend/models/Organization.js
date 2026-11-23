const mongoose = require('mongoose');
const ORG_TYPES = ['PRIVATE_LIMITED', 'PUBLIC_LIMITED', 'LLP', 'PARTNERSHIP', 'PROPRIETORSHIP', 'OTHER'];
const orgSchema = new mongoose.Schema(
  {
    legalName: { type: String, required: true, trim: true, maxlength: 200 },
    normalizedName: { type: String, required: true, index: true },
    gstin: { type: String, required: true, unique: true },
    pan: { type: String, required: true, index: true },
    udyamNo: { type: String, default: '' },
    cin: { type: String, default: '' },
    type: { type: String, enum: ORG_TYPES, default: 'OTHER' },
    registeredAddress: {
      line1: { type: String, default: '' }, city: { type: String, default: '' },
      state: { type: String, default: '' }, pincode: { type: String, default: '' },
    },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, minimize: false }
);
module.exports = Object.assign(mongoose.models.Organization || mongoose.model('Organization', orgSchema), { ORG_TYPES });
