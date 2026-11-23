const mongoose = require('mongoose');

const JOB_TYPES = ['extract_requirements', 'process_document', 'consistency', 'evaluate', 'build_report'];
const JOB_STATUS = ['queued', 'running', 'done', 'failed'];

const jobSchema = new mongoose.Schema(
  {
    type: { type: String, enum: JOB_TYPES, required: true, index: true },
    status: { type: String, enum: JOB_STATUS, default: 'queued', index: true },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    nextRunAt: { type: Date, default: Date.now, index: true },
    lockedAt: { type: Date, default: null },
    lastError: { type: String, default: null },
    // What the job is about, e.g. { tenderId } or { documentId, submissionId }
    refs: { type: mongoose.Schema.Types.Mixed, default: {} },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    // Same key => same job (idempotent enqueue)
    idempotencyKey: { type: String, required: true, unique: true },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true, minimize: false }
);

module.exports = Object.assign(
  mongoose.models.ProcessingJob || mongoose.model('ProcessingJob', jobSchema),
  { JOB_TYPES, JOB_STATUS }
);
