const mongoose = require('mongoose');
const TENDER_STATUS = ['draft', 'requirements_review', 'open', 'closed', 'under_evaluation', 'evaluated'];
const tenderSchema = new mongoose.Schema(
  {
    tenderNo: { type: String, required: true, unique: true, trim: true },
    gemBidNo: { type: String, default: '', trim: true },
    title: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    estimatedValue: { type: Number, required: true, min: 0 }, // INR
    bidOpeningDate: { type: Date, required: true },
    submissionDeadline: { type: Date, required: true },
    status: { type: String, enum: TENDER_STATUS, default: 'draft', index: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    assignedReviewerIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [], index: true },
    approvedRequirementVersion: { type: Number, default: null },
    tenderFile: { originalName: String, storagePath: String, sha256: String, size: Number, mimeType: String },
  },
  { timestamps: true }
);
// A tender accepts submissions only while open AND before the deadline (the deadline is enforced even if nobody closed it).
tenderSchema.methods.isAcceptingSubmissions = function (now = new Date()) {
  return this.status === 'open' && now <= this.submissionDeadline;
};
module.exports = Object.assign(mongoose.models.Tender || mongoose.model('Tender', tenderSchema), { TENDER_STATUS });
