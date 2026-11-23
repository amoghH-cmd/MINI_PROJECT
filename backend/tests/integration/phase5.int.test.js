// Full pipeline against the REAL AI service and the fictional sample PDFs.
// Needs MONGO_TEST_URI and AI_TEST_URL (the AI service must run with AI_UPLOAD_ROOT = this suite's UPLOAD_DIR
// and AI_SERVICE_TOKEN=test-token). Skipped otherwise.
process.env.AI_SERVICE_URL = process.env.AI_TEST_URL || 'http://127.0.0.1:1';
process.env.AI_SERVICE_TOKEN = 'test-token';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const path = require('path');
const h = require('./helpers');
const { makeGstin } = require('../../utils/identifiers');
const opts = { skip: (!h.enabled && 'MONGO_TEST_URI not set') || (!process.env.AI_TEST_URL && 'AI_TEST_URL not set') };

const SAMPLES = path.join(__dirname, '../../../sample-data/pdfs');
const sample = (rel) => [fs.readFileSync(path.join(SAMPLES, rel)), path.basename(rel)];
const future = (d) => new Date(Date.now() + d * 86400000).toISOString();
const S = {};
let worker, ProcessingJob, Document, ExtractedField, VerificationResult, TenderRequirement;

test.before(async () => {
  if (!h.enabled || !process.env.AI_TEST_URL) return;
  await h.start('p5');
  worker = require('../../jobs/worker'); require('../../jobs/handlers').registerAll(worker);
  ({ }); ProcessingJob = require('../../models/ProcessingJob'); Document = require('../../models/Document');
  ExtractedField = require('../../models/ExtractedField'); VerificationResult = require('../../models/VerificationResult'); TenderRequirement = require('../../models/TenderRequirement');
});
test.after(async () => { await h.stop(); });

async function drain(max = 15) {
  for (let i = 0; i < max; i++) {
    await worker.tick();
    if (!(await ProcessingJob.countDocuments({ status: { $in: ['queued', 'running'] }, nextRunAt: { $lte: new Date() } }))) return;
  }
}
const upload = (tok, subId, rel, category) => h.call('POST', `/api/submissions/${subId}/documents`, { token: tok, form: h.form(category ? { category } : {}, [sample(rel)]) });

const PACK = [['gst_certificate.pdf', 'GST_CERTIFICATE'], ['pan_card.pdf', 'PAN_CARD'], ['incorporation.pdf', 'INCORPORATION_CERTIFICATE'], ['udyam.pdf', 'UDYAM_CERTIFICATE'],
  ['financial_statements.pdf', 'FINANCIAL_STATEMENT'], ['experience_1.pdf', 'EXPERIENCE_LETTER'], ['experience_2.pdf', 'EXPERIENCE_LETTER']];

test('setup users', opts, async () => {
  S.off = await h.makeUser('PROCUREMENT_OFFICER', 'officer@t.test'); S.off2 = await h.makeUser('PROCUREMENT_OFFICER', 'o2@t.test');
  S.rev = await h.makeUser('TEC_REVIEWER', 'rev@t.test'); S.aud = await h.makeUser('AUDITOR', 'aud@t.test');
  S.a = await h.makeUser('BIDDER', 'a@t.test'); S.b = await h.makeUser('BIDDER', 'b@t.test');
});

test('NIT extraction: AI proposes draft requirements with sources; nothing is approved or in force', opts, async () => {
  const r = await h.call('POST', '/api/tenders', { token: S.off.token, form: h.form({ tenderNo: 'BCVP/DEMO/MM/2026/014', title: 'Supply of Seamless Carbon Steel Pipes (Demo)', department: 'Materials', estimatedValue: '25000000',
    submissionDeadline: future(10), bidOpeningDate: future(11) }, [sample('tender/nit_seamless_pipes.pdf')], 'tenderFile') });
  assert.equal(r.status, 201); S.tender = r.body.tender;
  await drain();
  const job = await ProcessingJob.findById(r.body.jobId); assert.equal(job.status, 'done', job.lastError); assert.ok(job.result.candidates >= 6);
  const rows = await TenderRequirement.find({ tenderId: S.tender.id }).lean();
  assert.ok(rows.every((x) => x.origin === 'ai' && x.approved === false && x.version === 1 && x.source.page === 1 && x.source.text));
  const turnover = rows.find((x) => x.rule.type === 'numeric_min');
  assert.deepEqual([turnover.rule.min, turnover.rule.unit, turnover.rule.years, turnover.rule.aggregate], [2, 'INR_CRORE', 3, 'average']);
  assert.deepEqual(rows.find((x) => x.rule.type === 'count_min').rule, { type: 'count_min', docType: 'EXPERIENCE_LETTER', minCount: 2, minValue: 5000000, sinceYears: 5 });
  assert.ok(!rows.some((x) => /pre-bid meeting|conference room/i.test(x.description)), 'irrelevant clause must not become a requirement');
  const t = await h.call('GET', `/api/tenders/${S.tender.id}`, { token: S.off.token });
  assert.equal(t.body.tender.status, 'requirements_review'); assert.equal(t.body.tender.approvedRequirementVersion, null);
  assert.equal((await h.call('GET', `/api/tenders/${S.tender.id}`, { token: S.a.token })).status, 404, 'bidders cannot see it until approval');
  const log = await h.call('GET', '/api/audit?action=REQUIREMENTS_EXTRACTED', { token: S.aud.token }); assert.equal(log.body.total, 1);
});

test('officer edits one AI draft and approves; provenance is preserved in the record', opts, async () => {
  const p = `/api/tenders/${S.tender.id}/requirements`;
  const cur = (await h.call('GET', p, { token: S.off.token })).body;
  assert.ok(cur.requirements.every((x) => x.origin === 'ai' && x.ruleValid));
  const edited = cur.requirements.map((x) => ({ code: x.code, type: x.type, description: x.description, rule: x.rule, mandatory: x.mandatory }));
  const idx = edited.findIndex((x) => x.rule.type === 'numeric_min'); edited[idx].rule = { ...edited[idx].rule, min: 2.5 };   // officer tightens the threshold
  const saved = await h.call('PUT', p, { token: S.off.token, json: { requirements: edited } });
  assert.equal(saved.status, 200); assert.equal(saved.body.version, 1);
  const row = saved.body.requirements.find((x) => x.rule.type === 'numeric_min'); assert.equal(row.origin, 'ai'); assert.equal(row.editedByOfficer, true);
  assert.equal(saved.body.requirements.filter((x) => x.editedByOfficer).length, 1, 'untouched drafts stay unedited');
  const ap = await h.call('POST', p + '/approve', { token: S.off.token }); assert.equal(ap.status, 200);
  const ev = await h.call('GET', '/api/audit?action=REQUIREMENTS_APPROVED', { token: S.aud.token });
  assert.ok(ev.body.items[0].meta.aiOrigin >= 6, 'audit records how many approved rules began as AI proposals');
});

test('registering organisations and starting submissions', opts, async () => {
  const addr = { line1: 'Plot 12, Industrial Estate Phase II', city: 'Sample City', state: 'Karnataka', pincode: '560001' };
  assert.equal((await h.call('POST', '/api/organizations', { token: S.a.token, json: { legalName: 'Sample Fabricators Private Limited', gstin: makeGstin('29', 'AABCS1234F'), pan: 'AABCS1234F', type: 'PRIVATE_LIMITED', registeredAddress: { ...addr } } })).status, 201);
  assert.equal((await h.call('POST', '/api/organizations', { token: S.b.token, json: { legalName: 'Second Engineering Works LLP', gstin: makeGstin('27', 'AAGCT5678K'), pan: 'AAGCT5678K', type: 'LLP', registeredAddress: { line1: 'Gala 4, Midc Road', city: 'Sample Town', state: 'Maharashtra', pincode: '400001' } } })).status, 201);
  S.subA = (await h.call('POST', '/api/submissions', { token: S.a.token, json: { tenderId: S.tender.id } })).body.submission;
  S.subB = (await h.call('POST', '/api/submissions', { token: S.b.token, json: { tenderId: S.tender.id } })).body.submission;
});

test('bidder A: documents are classified, fields extracted with evidence, consistency finds no mismatch', opts, async () => {
  S.docsA = {};
  for (const [f, cat] of PACK) { const r = await upload(S.a.token, S.subA.id, `bidder_a_sample_fabricators/${f}`, cat); assert.equal(r.status, 202, JSON.stringify(r.body)); S.docsA[f] = r.body.documents[0]; }
  const scan = await upload(S.a.token, S.subA.id, 'bidder_a_sample_fabricators/turnover_certificate_scan.pdf', 'TURNOVER_CERTIFICATE'); S.docsA['scan'] = scan.body.documents[0];
  const decl = await upload(S.a.token, S.subA.id, 'bidder_a_sample_fabricators/declaration_land_border.pdf', 'DECLARATION'); S.docsA['decl'] = decl.body.documents[0];
  assert.equal(S.docsA['gst_certificate.pdf'].processingStatus, 'queued');
  await drain();
  const docs = await Document.find({ submissionId: S.subA.id }).lean();
  assert.equal(docs.length, 9);
  const expected = { 'gst_certificate.pdf': 'GST_CERTIFICATE', 'pan_card.pdf': 'PAN_CARD', 'incorporation.pdf': 'INCORPORATION_CERTIFICATE', 'udyam.pdf': 'UDYAM_CERTIFICATE', 'financial_statements.pdf': 'FINANCIAL_STATEMENT', 'experience_1.pdf': 'EXPERIENCE_LETTER', 'decl': 'DECLARATION' };
  for (const [k, t] of Object.entries(expected)) { const d = docs.find((x) => String(x._id) === S.docsA[k].id); assert.equal(d.docType, t, k); assert.equal(d.processingStatus, 'done', k); }
  const scanDoc = docs.find((x) => String(x._id) === S.docsA['scan'].id);
  assert.deepEqual(scanDoc.processing.ocrPages, [1]); assert.ok(['done', 'needs_review'].includes(scanDoc.processingStatus));
  const v = await VerificationResult.find({ submissionId: S.subA.id }).lean();
  assert.ok(v.length >= 6); assert.ok(!v.some((x) => x.outcome === 'MISMATCH'), JSON.stringify(v.filter((x) => x.outcome === 'MISMATCH')));
  assert.ok(v.some((x) => x.subtype === 'legal_name' && x.details.fieldA.value === 'Sample Fabricators Pvt. Ltd.' && x.outcome === 'MATCH'), 'legal-name variant matches');
});

test('officer sees extracted fields with bounding-box evidence; others are kept out', opts, async () => {
  assert.equal((await h.call('POST', `/api/submissions/${S.subA.id}/submit`, { token: S.a.token })).status, 200);
  const gst = S.docsA['gst_certificate.pdf'].id;
  const r = await h.call('GET', `/api/documents/${gst}/fields`, { token: S.off.token });
  assert.equal(r.status, 200); const g = r.body.fields.find((f) => f.fieldName === 'gstin');
  assert.equal(g.normalizedValue, makeGstin('29', 'AABCS1234F')); assert.equal(g.attrs.checksumValid, true); assert.equal(g.page, 1);
  assert.equal(g.bbox.length, 4); assert.ok(g.bbox[0] < g.bbox[2] && g.pageSize[0] === 595.0 || g.pageSize[0] > 500);
  const upto = r.body.fields.find((f) => f.fieldName === 'valid_upto'); assert.equal(upto.normalizedValue, 'NOT_APPLICABLE'); assert.ok(upto.confidence < 0.7);
  assert.equal(r.body.document.docType, 'GST_CERTIFICATE'); assert.ok(r.body.document.processing.classifyBasis.length);
  assert.equal((await h.call('GET', `/api/documents/${gst}/fields`, { token: S.a.token })).status, 403, 'bidders do not get extraction output');
  assert.equal((await h.call('GET', `/api/documents/${gst}/fields`, { token: S.off2.token })).status, 404);
  assert.equal((await h.call('GET', `/api/documents/${gst}/fields`, { token: S.rev.token })).status, 404, 'unassigned reviewer');
  assert.equal((await h.call('GET', `/api/documents/${gst}/fields`, { token: S.aud.token })).status, 403);
  const vr = await h.call('GET', `/api/submissions/${S.subA.id}/verifications`, { token: S.off.token }); assert.equal(vr.status, 200); assert.ok(vr.body.items.length >= 6);
  assert.equal((await h.call('GET', `/api/submissions/${S.subA.id}/verifications`, { token: S.a.token })).status, 403);
  const sub = (await h.call('GET', `/api/submissions/${S.subA.id}`, { token: S.a.token })).body.submission;
  assert.ok(sub.checklist.filter((c) => c.uploaded > 0).every((c) => c.basis === 'classified'), 'categories are now confirmed by classification');
  assert.equal(sub.completenessPct, 100);
});

test('bidder B: PAN/name mismatches, missing declaration and an exact duplicate are surfaced', opts, async () => {
  S.docsB = {};
  for (const [f, cat] of [...PACK.slice(0, 6), ['experience_2_duplicate_of_A.pdf', 'EXPERIENCE_LETTER']]) { const r = await upload(S.b.token, S.subB.id, `bidder_b_second_engineering/${f}`, cat); assert.equal(r.status, 202, JSON.stringify(r.body)); S.docsB[f] = r.body.documents[0]; }
  // A replacement while still a draft: the old file is kept but no longer counts, and the new one is processed
  const rep = await h.call('POST', `/api/submissions/${S.subB.id}/documents/${S.docsB['pan_card.pdf'].id}/replace`, { token: S.b.token, form: h.form({}, [sample('bidder_b_second_engineering/pan_card.pdf')]) });
  assert.equal(rep.status, 202); S.docsB['pan_card.pdf'] = rep.body.document;
  // A file the backend accepts but the AI service cannot read: must fail fast, visibly, without retries
  const junk = await h.call('POST', `/api/submissions/${S.subB.id}/documents`, { token: S.b.token, form: h.form({ category: 'OTHER' }, [[Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('not really a docx'.repeat(20))]), 'notes.docx']]) });
  assert.equal(junk.status, 202); S.junk = junk.body.documents[0];
  await drain();

  const bad = await Document.findById(S.junk.id).lean();
  assert.equal(bad.processingStatus, 'failed'); assert.equal(bad.processing.error.code, 'UNREADABLE_FILE');
  const job = await ProcessingJob.findOne({ 'refs.documentId': S.junk.id }); assert.equal(job.status, 'failed'); assert.equal(job.attempts, 1, 'fatal errors are not retried');
  const bView = (await h.call('GET', `/api/submissions/${S.subB.id}`, { token: S.b.token })).body.submission;
  assert.match(bView.documents.find((d) => d.id === S.junk.id).processingError, /could not be opened/i);

  const v = await VerificationResult.find({ submissionId: S.subB.id }).lean();
  const mm = (sub) => v.filter((x) => x.subtype === sub && x.outcome === 'MISMATCH');
  assert.ok(mm('pan').length >= 1, 'PAN AAGCT5678L on the card/Udyam differs from the profile PAN AAGCT5678K');
  assert.ok(mm('legal_name').some((x) => /RAMA/.test(x.details.fieldA.value)), 'PAN card holder name differs from the legal name');
  assert.ok(!v.some((x) => x.details.fieldA.docId === S.docsB['pan_card.pdf'].id && false));
  const live = new Set((await Document.find({ submissionId: S.subB.id, superseded: false }).select('_id').lean()).map((d) => String(d._id)));
  assert.ok(v.every((x) => !x.details.fieldA.docId || live.has(x.details.fieldA.docId)), 'findings only reference live (non-superseded) documents');

  const dup = await Document.findById(S.docsB['experience_2_duplicate_of_A.pdf'].id).lean();
  assert.equal(dup.duplicateOf.length, 1); assert.equal(String(dup.duplicateOf[0]), S.docsA['experience_1.pdf'].id);
  const sub = (await h.call('GET', `/api/submissions/${S.subB.id}`, { token: S.b.token })).body.submission;
  assert.ok(sub.completenessPct < 100, 'declaration is missing'); assert.ok(!('duplicateOf' in sub.documents[0]));
  const udyam = (await h.call('GET', `/api/documents/${S.docsB['udyam.pdf'].id}/fields`, { token: (await (async () => { await h.call('POST', `/api/submissions/${S.subB.id}/submit`, { token: S.b.token }); return S.off; })()).token })).body;
  assert.equal(udyam.fields.find((f) => f.fieldName === 'valid_upto').normalizedValue, '2025-03-31', 'expiry date is extracted for the rule engine; AI itself does not judge expiry');
});

test('re-running processing is idempotent: no duplicate fields or findings', opts, async () => {
  const before = { f: await ExtractedField.countDocuments({ submissionId: S.subA.id }), v: await VerificationResult.countDocuments({ submissionId: S.subA.id }) };
  const { maybeEnqueueConsistency } = require('../../jobs/handlers');
  const j1 = await maybeEnqueueConsistency(S.subA.id, S.tender.id);
  assert.equal(j1.status, 'done', 'same document set => same idempotency key => the finished job is returned, not re-run');
  await drain();
  assert.deepEqual({ f: await ExtractedField.countDocuments({ submissionId: S.subA.id }), v: await VerificationResult.countDocuments({ submissionId: S.subA.id }) }, before);
});

test('no AI output has become a compliance finding or a decision', opts, async () => {
  const cols = (await h.mongoose.connection.db.listCollections().toArray()).map((c) => c.name);
  for (const forbidden of ['compliancechecks', 'officerdecisions', 'riskflags']) assert.ok(!cols.includes(forbidden) || (await h.mongoose.connection.db.collection(forbidden).countDocuments()) === 0, forbidden);
  const v = await h.call('GET', '/api/audit/verify-chain', { token: S.aud.token }); assert.equal(v.body.valid, true, v.body.reason);
  const acts = new Set((await h.call('GET', '/api/audit?pageSize=100', { token: S.aud.token })).body.items.map((i) => i.action));
  for (const a of ['REQUIREMENTS_EXTRACTED', 'DOCUMENT_PROCESSED', 'DOCUMENT_PROCESSING_FAILED', 'CONSISTENCY_CHECKED']) assert.ok(acts.has(a), a);
});
