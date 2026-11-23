const mongoose = require('mongoose');
const SUBMISSION_STATUS = ['draft', 'submitted', 'under_review', 'decided'];
const subSchema = new mongoose.Schema(
  {
    tenderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tender', required: true, index: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    status: { type: String, enum: SUBMISSION_STATUS, default: 'draft' },
    submittedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);
subSchema.index({ tenderId: 1, organizationId: 1 }, { unique: true });
module.exports = Object.assign(mongoose.models.BidSubmission || mongoose.model('BidSubmission', subSchema), { SUBMISSION_STATUS });
