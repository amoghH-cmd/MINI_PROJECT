const mongoose = require('mongoose');
const { DOC_TYPE_KEYS } = require('../config/docTypes');
const PROC_STATUS = ['queued', 'processing', 'done', 'needs_review', 'failed'];
const docSchema = new mongoose.Schema(
  {
    submissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'BidSubmission', required: true, index: true },
    tenderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tender', required: true, index: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    originalName: { type: String, required: true },
    storagePath: { type: String, required: true },
    sha256: { type: String, required: true, index: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    pageCount: { type: Number, default: null },
    declaredCategory: { type: String, enum: [...DOC_TYPE_KEYS, null], default: null }, // chosen by the bidder
    docType: { type: String, enum: [...DOC_TYPE_KEYS, null], default: null },           // set by classification (phase 5)
    classifyConfidence: { type: Number, default: null },
    processingStatus: { type: String, enum: PROC_STATUS, default: 'queued' },
    pdfSignals: { type: mongoose.Schema.Types.Mixed, default: null },
    // OCR pages/confidence, warnings and classification basis from the AI service, or { error } when processing failed
    processing: { type: mongoose.Schema.Types.Mixed, default: null },
    superseded: { type: Boolean, default: false },
    replacesId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null },
    // Exact-hash matches elsewhere in the same tender. Staff-only: never shown to bidders (confidentiality / collusion screening).
    duplicateOf: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);
module.exports = Object.assign(mongoose.models.Document || mongoose.model('Document', docSchema), { PROC_STATUS });
