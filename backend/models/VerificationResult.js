const mongoose = require('mongoose');
const OUTCOMES = ['MATCH', 'PROBABLE_MATCH', 'MISMATCH', 'INSUFFICIENT_DATA'];
const schema = new mongoose.Schema(
  {
    submissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'BidSubmission', required: true, index: true },
    tenderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tender', required: true },
    type: { type: String, enum: ['consistency'], required: true },      // external verifications live in ExternalVerification (phase 5b)
    subtype: { type: String, required: true },                          // legal_name | gstin | pan | address | pan_in_gstin
    outcome: { type: String, enum: OUTCOMES, required: true },
    score: { type: Number, default: null },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },        // fieldA, fieldB, explanation as returned by the AI service
    sourceJobId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProcessingJob', default: null },
  },
  { timestamps: true, minimize: false }
);
module.exports = Object.assign(mongoose.models.VerificationResult || mongoose.model('VerificationResult', schema), { OUTCOMES });
