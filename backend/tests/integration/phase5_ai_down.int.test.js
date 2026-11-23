// The AI service is unreachable. The platform must degrade visibly and safely (HLD: "no data loss on AI failure").
process.env.AI_SERVICE_URL = 'http://127.0.0.1:1';   // nothing listens here
process.env.AI_SERVICE_TOKEN = 'test-token';
const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const { makeGstin } = require('../../utils/identifiers');
const opts = { skip: !h.enabled && 'MONGO_TEST_URI not set' };
const S = {}; let worker, ProcessingJob, Document;
test.before(async () => { if (!h.enabled) return; await h.start('p5down'); worker = require('../../jobs/worker'); require('../../jobs/handlers').registerAll(worker); ProcessingJob = require('../../models/ProcessingJob'); Document = require('../../models/Document'); });
test.after(async () => { await h.stop(); });
const future = (d) => new Date(Date.now() + d * 86400000).toISOString();

async function rounds(n) {            // one attempt per round: pull the retry time forward instead of sleeping through the backoff
  for (let i = 0; i < n; i++) { await ProcessingJob.updateMany({ status: 'queued' }, { nextRunAt: new Date(0) }); await worker.tick(); }
}

test('tender extraction retries with backoff, then fails visibly; the officer can still work manually', opts, async () => {
  S.off = await h.makeUser('PROCUREMENT_OFFICER', 'o@t.test');
  const r = await h.call('POST', '/api/tenders', { token: S.off.token, form: h.form({ tenderNo: 'T/AI/DOWN/1', title: 'Tender created while AI is down', department: 'Dept', estimatedValue: '100000', submissionDeadline: future(5), bidOpeningDate: future(6) }, [[h.pdf('NIT'), 'nit.pdf']], 'tenderFile') });
  assert.equal(r.status, 201, 'creating a tender must not depend on the AI service'); S.t = r.body.tender;
  await worker.tick();
  let job = await ProcessingJob.findById(r.body.jobId);
  assert.equal(job.status, 'queued'); assert.equal(job.attempts, 1); assert.match(job.lastError, /unreachable/i); assert.ok(job.nextRunAt > new Date(), 'backoff applied');
  await rounds(2);
  job = await ProcessingJob.findById(r.body.jobId);
  assert.equal(job.status, 'failed'); assert.equal(job.attempts, 3);
  const t = await h.call('GET', `/api/tenders/${S.t.id}`, { token: S.off.token });
  assert.equal(t.body.tender.jobs[0].status, 'failed'); assert.match(t.body.tender.jobs[0].lastError, /unreachable/i);
  // manual path still works end to end
  const rule = { type: 'document_present', docType: 'GST_CERTIFICATE' };
  assert.equal((await h.call('PUT', `/api/tenders/${S.t.id}/requirements`, { token: S.off.token, json: { requirements: [{ code: 'REQ-01', type: 'DOCUMENT', description: 'GST registration certificate', rule, mandatory: true }] } })).status, 200);
  assert.equal((await h.call('POST', `/api/tenders/${S.t.id}/requirements/approve`, { token: S.off.token })).status, 200);
});

test('document processing: retries, then the document is marked failed; the upload is never lost', opts, async () => {
  S.b = await h.makeUser('BIDDER', 'b@t.test');
  await h.call('POST', '/api/organizations', { token: S.b.token, json: { legalName: 'Offline Test Pvt Ltd', gstin: makeGstin('29', 'AABCS1234F'), pan: 'AABCS1234F', registeredAddress: { line1: 'Somewhere 1', city: 'City', state: 'State', pincode: '560001' } } });
  const sub = (await h.call('POST', '/api/submissions', { token: S.b.token, json: { tenderId: S.t.id } })).body.submission;
  const up = await h.call('POST', `/api/submissions/${sub.id}/documents`, { token: S.b.token, form: h.form({ category: 'GST_CERTIFICATE' }, [[h.pdf('GST cert'), 'gst.pdf']]) });
  assert.equal(up.status, 202);
  await worker.tick();
  let d = await Document.findById(up.body.documents[0].id).lean();
  assert.equal(d.processingStatus, 'queued', 'between attempts the document is waiting, not failed');
  await rounds(2);
  d = await Document.findById(up.body.documents[0].id).lean();
  assert.equal(d.processingStatus, 'failed'); assert.equal(d.processing.error.code, 'AI_UNAVAILABLE');
  const view = (await h.call('GET', `/api/submissions/${sub.id}`, { token: S.b.token })).body.submission;
  assert.match(view.documents[0].processingError, /unreachable/i);
  const file = await h.call('GET', `/api/documents/${d._id}/file`, { token: S.b.token });
  assert.equal(file.status, 200, 'the stored file is intact and downloadable despite AI failure');
  const submit = await h.call('POST', `/api/submissions/${sub.id}/submit`, { token: S.b.token });
  assert.equal(submit.status, 200, 'a bidder can still submit; officers will see the document as unprocessed');
});
