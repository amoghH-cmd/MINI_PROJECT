const mongoose = require('mongoose');
const REQ_TYPES = ['DOCUMENT', 'IDENTITY', 'VALIDITY', 'FINANCIAL', 'EXPERIENCE', 'DECLARATION', 'CONSISTENCY', 'REGISTRATION'];
const reqSchema = new mongoose.Schema(
  {
    tenderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tender', required: true },
    version: { type: Number, required: true },
    code: { type: String, required: true },
    type: { type: String, enum: REQ_TYPES, required: true },
    description: { type: String, required: true },
    rule: { type: mongoose.Schema.Types.Mixed, default: {} },
    mandatory: { type: Boolean, default: true },
    // 'ai' rows came from the extraction service; they stay unapproved drafts until an officer approves the version.
    origin: { type: String, enum: ['ai', 'officer'], default: 'officer' },
    editedByOfficer: { type: Boolean, default: false },
    source: { page: Number, text: String, confidence: Number },
    approved: { type: Boolean, default: false },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, minimize: false }
);
reqSchema.index({ tenderId: 1, version: 1, code: 1 }, { unique: true });
module.exports = Object.assign(mongoose.models.TenderRequirement || mongoose.model('TenderRequirement', reqSchema), { REQ_TYPES });
