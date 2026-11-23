const mongoose = require('mongoose');
const schema = new mongoose.Schema(
  {
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true, index: true },
    submissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'BidSubmission', required: true, index: true },
    tenderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tender', required: true },
    fieldName: { type: String, required: true, index: true },
    rawValue: { type: String, required: true },
    normalizedValue: { type: String, default: null },
    confidence: { type: Number, min: 0, max: 1, required: true },
    page: { type: Number, required: true },
    bbox: { type: [Number], default: undefined },          // PDF points; absent when the AI could not locate the text (never invented)
    pageSize: { type: [Number], default: undefined },
    method: { type: String, required: true },
    attrs: { type: mongoose.Schema.Types.Mixed, default: {} },
    officerCorrected: { type: Boolean, default: false },
  },
  { timestamps: true, minimize: false }
);
module.exports = mongoose.models.ExtractedField || mongoose.model('ExtractedField', schema);
