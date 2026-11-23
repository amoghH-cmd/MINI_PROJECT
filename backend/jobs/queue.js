const mongoose = require('mongoose');
const ProcessingJob = require('../models/ProcessingJob');
const { computeBackoff } = require('../utils/backoff');

// MongoDB-backed queue (no Redis, per HLD 4.1).
// A key is always stored (auto-generated when the caller gives none) so the unique index never
// depends on sparse/partial-index behaviour.
async function enqueue(type, refs = {}, { idempotencyKey, maxAttempts = 3, delayMs = 0 } = {}) {
  const key = idempotencyKey || `auto:${new mongoose.Types.ObjectId()}`;
  const existing = await ProcessingJob.findOne({ idempotencyKey: key });
  if (existing) return existing;
  try {
    return await ProcessingJob.create({ type, refs, idempotencyKey: key, maxAttempts, nextRunAt: new Date(Date.now() + delayMs) });
  } catch (err) {
    if (err.code === 11000) return ProcessingJob.findOne({ idempotencyKey: key });
    throw err;
  }
}

// Atomically claims the oldest runnable job.
// Only job types that have a registered handler are claimed; others stay queued until one exists.
const claim = (types) =>
  ProcessingJob.findOneAndUpdate(
    { status: 'queued', nextRunAt: { $lte: new Date() }, ...(types ? { type: { $in: types } } : {}) },
    { $set: { status: 'running', lockedAt: new Date() }, $inc: { attempts: 1 } },
    { sort: { createdAt: 1 }, new: true }
  );

const complete = (job, result = null) =>
  ProcessingJob.findByIdAndUpdate(job._id, { status: 'done', result, lastError: null, finishedAt: new Date(), lockedAt: null }, { new: true });

// Retry with backoff; after maxAttempts the job is marked failed (partial results are kept by handlers).
function fail(job, error) {
  const msg = String(error && error.message ? error.message : error).slice(0, 500);
  // error.fatal = retrying cannot help (e.g. encrypted file): fail immediately instead of burning attempts.
  if (error && error.fatal || job.attempts >= job.maxAttempts) {
    return ProcessingJob.findByIdAndUpdate(job._id, { status: 'failed', lastError: msg, finishedAt: new Date(), lockedAt: null }, { new: true });
  }
  return ProcessingJob.findByIdAndUpdate(
    job._id,
    { status: 'queued', lastError: msg, lockedAt: null, nextRunAt: new Date(Date.now() + computeBackoff(job.attempts)) },
    { new: true }
  );
}

// A worker that died mid-job leaves it 'running'; requeue after a timeout.
const requeueStale = (olderThanMs = 10 * 60 * 1000) =>
  ProcessingJob.updateMany({ status: 'running', lockedAt: { $lt: new Date(Date.now() - olderThanMs) } }, { status: 'queued', lockedAt: null });

module.exports = { enqueue, claim, complete, fail, requeueStale };
