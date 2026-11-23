const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const { makeGstin } = require('../../utils/identifiers');
const opts = { skip: !h.enabled && 'MONGO_TEST_URI not set' };

test.before(async () => { if (h.enabled) await h.start('p4'); });
test.after(async () => { await h.stop(); });

const S = {}; // shared state; tests below run in order
const future = (days) => new Date(Date.now() + days * 86400000).toISOString();
const tenderForm = (over = {}, file = [h.pdf('NIT sample'), 'nit.pdf']) => h.form({
  tenderNo: 'BCVP/DEMO/MM/2026/014', title: 'Supply of Seamless Pipes (Demo)', department: 'Materials Management', estimatedValue: '25000000',
  submissionDeadline: future(10), bidOpeningDate: future(11), ...over }, file ? [file] : [], 'tenderFile');
const GST_RULE = { type: 'document_present', docType: 'GST_CERTIFICATE' };
const reqs = (extra = []) => ({ requirements: [
  { code: 'REQ-01', type: 'DOCUMENT', description: 'Valid GST registration certificate', rule: GST_RULE, mandatory: true },
  { code: 'REQ-02', type: 'FINANCIAL', description: 'Average annual turnover of at least Rs 2 crore', rule: { type: 'numeric_min', docType: 'FINANCIAL_STATEMENT', field: 'turnover', min: 2, unit: 'INR_CRORE', years: 3, aggregate: 'average' }, mandatory: true },
  ...extra ] });
const orgBody = (over = {}) => ({ legalName: 'Sample Fabricators Private Limited', gstin: makeGstin('29', 'AABCS1234F'), pan: 'AABCS1234F', type: 'PRIVATE_LIMITED',
  registeredAddress: { line1: 'Plot 12, Industrial Estate', city: 'Sample City', state: 'Karnataka', pincode: '560001' }, ...over });

test('setup users', opts, async () => {
  S.off = await h.makeUser('PROCUREMENT_OFFICER', 'officer@t.test');
  S.off2 = await h.makeUser('PROCUREMENT_OFFICER', 'officer2@t.test');
  S.rev = await h.makeUser('TEC_REVIEWER', 'rev@t.test');
  S.aud = await h.makeUser('AUDITOR', 'aud@t.test');
  S.adm = await h.makeUser('ADMIN', 'adm@t.test');
  S.b1 = await h.makeUser('BIDDER', 'b1@t.test'); S.b2 = await h.makeUser('BIDDER', 'b2@t.test'); S.b3 = await h.makeUser('BIDDER', 'b3@t.test');
});

// ---------------- tenders ----------------
test('tender create: validation and file-rejection paths store no record and no file', opts, async () => {
  const fs = require('fs'); const path = require('path');
  const dir = path.join(process.env.UPLOAD_DIR, 'tenders');
  const filesBefore = () => (fs.existsSync(dir) ? fs.readdirSync(dir).length : 0);
  const before = filesBefore();
  assert.equal((await h.call('POST', '/api/tenders', { token: S.off.token, form: tenderForm({}, null) })).status, 422, 'file is required');
  assert.equal((await h.call('POST', '/api/tenders', { token: S.off.token, form: tenderForm({}, [Buffer.from('MZ not a pdf'), 'x.pdf']) })).status, 415);
  let r = await h.call('POST', '/api/tenders', { token: S.off.token, form: tenderForm({ submissionDeadline: new Date(Date.now() - 86400000).toISOString() }) });
  assert.equal(r.status, 422); assert.ok(r.body.error.fields.some((f) => f.path === 'submissionDeadline'));
  r = await h.call('POST', '/api/tenders', { token: S.off.token, form: tenderForm({ bidOpeningDate: future(5), submissionDeadline: future(9) }) });
  assert.equal(r.status, 422); assert.ok(r.body.error.fields.some((f) => f.path === 'bidOpeningDate'));
  assert.equal(await require('../../models/Tender').countDocuments(), 0);
  assert.equal(filesBefore(), before, 'no file may be written for a rejected request');
});

test('tender create: success records hash, queues extraction job, writes audit', opts, async () => {
  const r = await h.call('POST', '/api/tenders', { token: S.off.token, form: tenderForm() });
  assert.equal(r.status, 201); S.tender = r.body.tender; assert.equal(S.tender.status, 'draft'); assert.match(S.tender.fileSha256, /^[a-f0-9]{64}$/);
  const job = await require('../../models/ProcessingJob').findById(r.body.jobId);
  assert.equal(job.type, 'extract_requirements'); assert.equal(job.status, 'queued');
  assert.equal((await h.call('POST', '/api/tenders', { token: S.off.token, form: tenderForm() })).status, 409, 'duplicate tender number');
  const log = await h.call('GET', '/api/audit?action=TENDER_CREATED', { token: S.aud.token });
  assert.equal(log.body.items[0].entityId, S.tender.id); assert.ok(log.body.items[0].afterHash);
});

test('tender scoping: other officers, unassigned reviewers and bidders cannot see a draft; admin has no access', opts, async () => {
  const id = S.tender.id;
  assert.equal((await h.call('GET', `/api/tenders/${id}`, { token: S.off.token })).status, 200);
  assert.equal((await h.call('GET', `/api/tenders/${id}`, { token: S.off2.token })).status, 404);
  assert.equal((await h.call('GET', `/api/tenders/${id}`, { token: S.rev.token })).status, 404);
  assert.equal((await h.call('GET', `/api/tenders/${id}`, { token: S.b1.token })).status, 404, 'draft tenders are not public');
  assert.equal((await h.call('GET', `/api/tenders/${id}`, { token: S.adm.token })).status, 403);
  assert.equal((await h.call('GET', `/api/tenders/${id}`, { token: S.aud.token })).status, 200);
  assert.equal((await h.call('GET', '/api/tenders', { token: S.off2.token })).body.total, 0);
  assert.equal((await h.call('PATCH', `/api/tenders/${id}`, { token: S.off2.token, json: { title: 'Hijacked title' } })).status, 404);
  assert.equal((await h.call('PATCH', `/api/tenders/${id}`, { token: S.rev.token, json: { title: 'Hijacked title' } })).status, 403);
});

test('tender update records before/after; search filter works', opts, async () => {
  const r = await h.call('PATCH', `/api/tenders/${S.tender.id}`, { token: S.off.token, json: { estimatedValue: 27500000 } });
  assert.equal(r.status, 200); assert.equal(r.body.tender.estimatedValue, 27500000);
  const log = await h.call('GET', '/api/audit?action=TENDER_UPDATED', { token: S.aud.token });
  assert.deepEqual(log.body.items[0].changes.estimatedValue, { from: 25000000, to: 27500000 });
  assert.equal((await h.call('GET', '/api/tenders?q=seamless', { token: S.off.token })).body.total, 1);
  assert.equal((await h.call('GET', '/api/tenders?q=zzz', { token: S.off.token })).body.total, 0);
  assert.equal((await h.call('GET', '/api/tenders?q=%5B', { token: S.off.token })).status, 200, 'regex metacharacters are escaped');
});

// ---------------- requirements ----------------
test('requirements: reviewer and bidder cannot edit or approve; approving nothing is refused', opts, async () => {
  const p = `/api/tenders/${S.tender.id}/requirements`;
  assert.equal((await h.call('PUT', p, { token: S.rev.token, json: reqs() })).status, 403);
  assert.equal((await h.call('POST', p + '/approve', { token: S.rev.token })).status, 403);
  assert.equal((await h.call('POST', p + '/approve', { token: S.off.token })).status, 409);
});

test('requirements: invalid rule JSON is saved as a draft but rejected at approval with field errors (422)', opts, async () => {
  const p = `/api/tenders/${S.tender.id}/requirements`;
  const bad = reqs([{ code: 'REQ-03', type: 'VALIDITY', description: 'Certificate valid on bid opening', rule: { type: 'date_valid_on', docType: 'NOT_A_TYPE' }, mandatory: true }]);
  let r = await h.call('PUT', p, { token: S.off.token, json: bad });
  assert.equal(r.status, 200); assert.equal(r.body.version, 1); assert.equal(r.body.approved, false);
  assert.equal(r.body.requirements.find((x) => x.code === 'REQ-03').ruleValid, false);
  assert.equal((await h.call('GET', `/api/tenders/${S.tender.id}`, { token: S.off.token })).body.tender.status, 'requirements_review');
  r = await h.call('POST', p + '/approve', { token: S.off.token });
  assert.equal(r.status, 422); assert.ok(r.body.error.fields.some((f) => f.path.startsWith('REQ-03.rule')));
  assert.equal((await h.call('GET', `/api/tenders/${S.tender.id}`, { token: S.off.token })).body.tender.status, 'requirements_review', 'tender must not open');
  r = await h.call('PUT', p, { token: S.off.token, json: { requirements: [...reqs().requirements, reqs().requirements[0]] } });
  assert.equal(r.status, 422, 'duplicate codes rejected');
});

test('requirements: approve freezes version 1 and opens the tender; later edits start version 2', opts, async () => {
  const p = `/api/tenders/${S.tender.id}/requirements`;
  let r = await h.call('PUT', p, { token: S.off.token, json: reqs() });
  assert.equal(r.body.version, 1, 'draft edited in place, no version explosion'); assert.equal(r.body.requirements.length, 2);
  r = await h.call('POST', p + '/approve', { token: S.off.token });
  assert.equal(r.status, 200); assert.equal(r.body.version, 1); assert.equal(r.body.tenderStatus, 'open');
  assert.equal((await h.call('POST', p + '/approve', { token: S.off.token })).status, 409, 'already approved');
  // edit => new draft version; v1 untouched
  r = await h.call('PUT', p, { token: S.off.token, json: reqs([{ code: 'REQ-03', type: 'DECLARATION', description: 'Land border declaration (GFR 144(xi))', rule: { type: 'declaration_present', declarationCode: 'LAND_BORDER_144XI' }, mandatory: true }]) });
  assert.equal(r.body.version, 2); assert.equal(r.body.approved, false);
  const v1 = await h.call('GET', p + '?version=1', { token: S.off.token });
  assert.equal(v1.body.approved, true); assert.equal(v1.body.requirements.length, 2);
  // an unapproved draft must not be what bidders see
  const t = await h.call('GET', `/api/tenders/${S.tender.id}`, { token: S.off.token });
  assert.equal(t.body.tender.approvedRequirementVersion, 1);
  r = await h.call('POST', p + '/approve', { token: S.off.token });
  assert.equal(r.body.version, 2); S.reqVersion = 2;
  const ev = await h.call('GET', '/api/audit?action=REQUIREMENTS_APPROVED', { token: S.aud.token });
  assert.equal(ev.body.total, 2); assert.equal(ev.body.items[0].meta.version, 2);
});

test('requirements: bidders see only the approved version, without provenance or source text', opts, async () => {
  const r = await h.call('GET', `/api/tenders/${S.tender.id}/requirements`, { token: S.b1.token });
  assert.equal(r.status, 200); assert.equal(r.body.version, 2); assert.equal(r.body.requirements.length, 3);
  assert.ok(r.body.requirements.every((x) => !('origin' in x) && !('source' in x))); assert.deepEqual(r.body.versions, []);
});

// ---------------- organisations ----------------
test('organisation registration: identifier validation', opts, async () => {
  const t = S.b1.token;
  let r = await h.call('POST', '/api/organizations', { token: t, json: orgBody({ gstin: makeGstin('29', 'AABCS1234F').slice(0, 14) + 'A' }) });
  assert.equal(r.status, 422); assert.ok(r.body.error.fields.some((f) => /checksum/i.test(f.message)));
  r = await h.call('POST', '/api/organizations', { token: t, json: orgBody({ pan: 'AAGCT5678K' }) });
  assert.equal(r.status, 422); assert.ok(r.body.error.fields.some((f) => f.path === 'pan'));
  r = await h.call('POST', '/api/organizations', { token: t, json: orgBody({ udyamNo: 'UDYAM-XX' }) });
  assert.equal(r.status, 422);
  assert.equal((await h.call('POST', '/api/organizations', { token: S.off.token, json: orgBody() })).status, 403);
});
test('organisation registration: success, duplicate GSTIN, one org per account, PAN/GSTIN immutable', opts, async () => {
  let r = await h.call('POST', '/api/organizations', { token: S.b1.token, json: orgBody() });
  assert.equal(r.status, 201); S.org1 = r.body.organization;
  assert.equal((await h.call('POST', '/api/organizations', { token: S.b1.token, json: orgBody() })).status, 409);
  assert.equal((await h.call('POST', '/api/organizations', { token: S.b2.token, json: orgBody() })).status, 409, 'GSTIN already registered');
  r = await h.call('POST', '/api/organizations', { token: S.b2.token, json: orgBody({ legalName: 'Second Engineering Works LLP', gstin: makeGstin('27', 'AAGCT5678K'), pan: 'AAGCT5678K', type: 'LLP' }) });
  assert.equal(r.status, 201); S.org2 = r.body.organization;
  r = await h.call('PATCH', '/api/organizations/me', { token: S.b1.token, json: { gstin: makeGstin('27', 'AAGCT5678K'), cin: 'U12345KA2019PTC123456' } });
  assert.equal(r.status, 200); assert.equal(r.body.organization.gstin, S.org1.gstin, 'GSTIN is not editable');
  const log = await h.call('GET', '/api/audit?action=ORGANIZATION_REGISTERED', { token: S.aud.token });
  const json = JSON.stringify(log.body.items); assert.ok(!json.includes(S.org1.gstin) && !json.includes('AABCS1234F'), 'PAN/GSTIN masked in audit');
});

// ---------------- submissions & documents ----------------
test('submission: needs an organisation; one per organisation per tender; draft tenders are not accepting', opts, async () => {
  let r = await h.call('POST', '/api/submissions', { token: S.b3.token, json: { tenderId: S.tender.id } });
  assert.equal(r.status, 422, 'bidder without an organisation');
  r = await h.call('POST', '/api/submissions', { token: S.b1.token, json: { tenderId: S.tender.id } });
  assert.equal(r.status, 201); S.sub1 = r.body.submission;
  assert.equal((await h.call('POST', '/api/submissions', { token: S.b1.token, json: { tenderId: S.tender.id } })).status, 409);
  r = await h.call('POST', '/api/submissions', { token: S.b2.token, json: { tenderId: S.tender.id } });
  assert.equal(r.status, 201); S.sub2 = r.body.submission;
});

test('upload: invalid and hostile files are rejected with per-file errors and nothing is stored', opts, async () => {
  const p = `/api/submissions/${S.sub1.id}/documents`; const Document = require('../../models/Document');
  let r = await h.call('POST', p, { token: S.b1.token, form: h.form({}, [[Buffer.from('MZ\x90 exe'), 'gst.pdf']]) });
  assert.equal(r.status, 415);
  r = await h.call('POST', p, { token: S.b1.token, form: h.form({}, [[h.pdf('/Encrypt locked'), 'locked.pdf']]) });
  assert.equal(r.status, 422); assert.equal(r.body.error.fields[0].code, 'ENCRYPTED_PDF');
  r = await h.call('POST', p, { token: S.b1.token, form: h.form({ category: 'NOT_A_CATEGORY' }, [[h.pdf('x'), 'x.pdf']]) });
  assert.equal(r.status, 422);
  assert.equal(await Document.countDocuments(), 0);
});

test('upload: accepted files are hashed, queued for processing, audited; checklist reflects approved requirements', opts, async () => {
  const p = `/api/submissions/${S.sub1.id}/documents`;
  let r = await h.call('POST', p, { token: S.b1.token, form: h.form({ category: 'GST_CERTIFICATE' }, [[h.pdf('B1 GST certificate'), 'gst.pdf']]) });
  assert.equal(r.status, 202); S.doc1 = r.body.documents[0];
  assert.equal(S.doc1.processingStatus, 'queued'); assert.ok(!('duplicateOf' in S.doc1));
  const job = await require('../../models/ProcessingJob').findOne({ 'refs.documentId': S.doc1.id });
  assert.equal(job.type, 'process_document');
  r = await h.call('GET', `/api/submissions/${S.sub1.id}`, { token: S.b1.token });
  const gst = r.body.submission.checklist.find((c) => c.docType === 'GST_CERTIFICATE');
  assert.equal(gst.uploaded, 1); assert.equal(gst.basis, 'declared');
  assert.equal(r.body.submission.completenessPct, 33, 'approved v2 needs 3 mandatory categories (GST, financials, declaration); 1 is covered');
  assert.equal(r.body.submission.jobs.length, 1);
});

test('duplicate screening: same file in another bid is flagged for staff, invisible to the bidders', opts, async () => {
  const same = h.pdf('B1 GST certificate');
  const r = await h.call('POST', `/api/submissions/${S.sub2.id}/documents`, { token: S.b2.token, form: h.form({ category: 'GST_CERTIFICATE' }, [[same, 'gst_b2.pdf']]) });
  assert.equal(r.status, 202); S.doc2 = r.body.documents[0];
  assert.ok(!('duplicateOf' in S.doc2), 'bidder response must not reveal duplicate matches');
  const raw = await require('../../models/Document').findById(S.doc2.id).lean();
  assert.equal(raw.duplicateOf.length, 1); assert.equal(String(raw.duplicateOf[0]), S.doc1.id);
});

test('confidentiality: bidders cannot read each other; officers cannot open draft bids; auditors never get files', opts, async () => {
  assert.equal((await h.call('GET', `/api/submissions/${S.sub1.id}`, { token: S.b2.token })).status, 404);
  assert.equal((await h.call('GET', `/api/documents/${S.doc1.id}/file`, { token: S.b2.token })).status, 404);
  assert.equal((await h.call('POST', `/api/submissions/${S.sub1.id}/documents`, { token: S.b2.token, form: h.form({}, [[h.pdf('intrude'), 'i.pdf']]) })).status, 404);
  assert.equal((await h.call('GET', `/api/documents/${S.doc1.id}/file`, { token: S.off.token })).status, 404, 'draft bids are not open to the officer');
  assert.equal((await h.call('GET', `/api/documents/${S.doc1.id}/file`, { token: S.aud.token })).status, 403);
  assert.equal((await h.call('GET', `/api/submissions/${S.sub1.id}`, { token: S.off2.token })).status, 404);
  assert.equal((await h.call('GET', `/api/submissions?tenderId=${S.tender.id}`, { token: S.off.token })).body.total, 0, 'drafts are not listed to staff');
  const own = await h.call('GET', `/api/documents/${S.doc1.id}/file`, { token: S.b1.token });
  assert.equal(own.status, 200); assert.equal(own.headers.get('x-content-type-options'), 'nosniff'); assert.match(own.headers.get('content-security-policy'), /sandbox/);
  assert.ok(own.raw.equals(h.pdf('B1 GST certificate')), 'served bytes equal uploaded bytes');
});

test('replacement keeps the old file, supersedes it, and re-queues processing', opts, async () => {
  const r = await h.call('POST', `/api/submissions/${S.sub1.id}/documents/${S.doc1.id}/replace`, { token: S.b1.token, form: h.form({}, [[h.pdf('B1 GST certificate v2'), 'gst_v2.pdf']]) });
  assert.equal(r.status, 202); S.doc1b = r.body.document; assert.equal(S.doc1b.replacesId, S.doc1.id); assert.equal(S.doc1b.declaredCategory, 'GST_CERTIFICATE');
  const old = await require('../../models/Document').findById(S.doc1.id); assert.equal(old.superseded, true);
  const sub = (await h.call('GET', `/api/submissions/${S.sub1.id}`, { token: S.b1.token })).body.submission;
  assert.equal(sub.checklist.find((c) => c.docType === 'GST_CERTIFICATE').uploaded, 1, 'superseded file is not counted');
});

test('submitting: needs at least one document; locks further uploads; becomes visible to the owning officer only', opts, async () => {
  assert.equal((await h.call('POST', `/api/submissions/${S.sub2.id}/submit`, { token: S.b1.token })).status, 404);
  let r = await h.call('POST', `/api/submissions/${S.sub1.id}/submit`, { token: S.b1.token });
  assert.equal(r.status, 200); assert.equal(r.body.submission.status, 'submitted');
  assert.equal((await h.call('POST', `/api/submissions/${S.sub1.id}/submit`, { token: S.b1.token })).status, 409);
  assert.equal((await h.call('POST', `/api/submissions/${S.sub1.id}/documents`, { token: S.b1.token, form: h.form({}, [[h.pdf('late'), 'l.pdf']]) })).status, 409);
  assert.equal((await h.call('POST', `/api/submissions/${S.sub1.id}/documents/${S.doc1b.id}/replace`, { token: S.b1.token, form: h.form({}, [[h.pdf('late2'), 'l.pdf']]) })).status, 409);
  r = await h.call('GET', `/api/submissions?tenderId=${S.tender.id}`, { token: S.off.token });
  assert.equal(r.body.total, 1); assert.equal(r.body.items[0].organization.legalName, 'Sample Fabricators Private Limited');
  const sub = await h.call('GET', `/api/submissions/${S.sub1.id}`, { token: S.off.token });
  assert.equal(sub.body.submission.documentsVisible, true); assert.equal(sub.body.submission.documents.length, 2 );
  const file = await h.call('GET', `/api/documents/${S.doc1b.id}/file`, { token: S.off.token });
  assert.equal(file.status, 200);
  assert.equal((await h.call('GET', `/api/documents/${S.doc1b.id}/file`, { token: S.off2.token })).status, 404);
  const sub2 = await h.call('GET', `/api/submissions/${S.sub2.id}`, { token: S.off.token });
  assert.equal(sub2.status, 200, 'staff may open the record, but...'); assert.equal(sub2.body.submission.documentsVisible, false, '...not the files of an unsubmitted draft');
});

test('officer view of a submitted bid exposes the duplicate signal; requirements are frozen once bids exist', opts, async () => {
  const { sub } = { sub: S.sub2 };
  assert.equal((await h.call('POST', `/api/submissions/${sub.id}/submit`, { token: S.b2.token })).status, 200);
  const r = await h.call('GET', `/api/submissions/${sub.id}`, { token: S.off.token });
  assert.equal(r.body.submission.documents[0].duplicateOf.length, 1);
  const bidderView = await h.call('GET', `/api/submissions/${sub.id}`, { token: S.b2.token });
  assert.ok(!('duplicateOf' in bidderView.body.submission.documents[0]));
  assert.equal((await h.call('PUT', `/api/tenders/${S.tender.id}/requirements`, { token: S.off.token, json: reqs() })).status, 409);
  assert.equal((await h.call('PATCH', `/api/tenders/${S.tender.id}`, { token: S.off.token, json: { title: 'Changed after bids' } })).status, 409);
});

test('reviewers: assignment is validated; they see files only after the tender closes', opts, async () => {
  const id = S.tender.id;
  assert.equal((await h.call('PUT', `/api/tenders/${id}/reviewers`, { token: S.off.token, json: { reviewerIds: [String(S.off2.user._id)] } })).status, 422, 'only active TEC reviewers');
  assert.equal((await h.call('PUT', `/api/tenders/${id}/reviewers`, { token: S.off2.token, json: { reviewerIds: [String(S.rev.user._id)] } })).status, 404);
  let r = await h.call('PUT', `/api/tenders/${id}/reviewers`, { token: S.off.token, json: { reviewerIds: [String(S.rev.user._id)] } });
  assert.equal(r.status, 200);
  assert.equal((await h.call('GET', `/api/tenders/${id}`, { token: S.rev.token })).status, 200);
  assert.equal((await h.call('GET', `/api/documents/${S.doc1b.id}/file`, { token: S.rev.token })).status, 404, 'tender still open: bids are sealed');
  assert.equal((await h.call('POST', `/api/tenders/${id}/close`, { token: S.rev.token })).status, 403);
  assert.equal((await h.call('POST', `/api/tenders/${id}/close`, { token: S.off.token })).status, 200);
  assert.equal((await h.call('POST', `/api/tenders/${id}/close`, { token: S.off.token })).status, 409);
  assert.equal((await h.call('GET', `/api/documents/${S.doc1b.id}/file`, { token: S.rev.token })).status, 200, 'closed: assigned reviewer may inspect');
  const list = await h.call('GET', '/api/tenders/reviewers', { token: S.off.token });
  assert.equal(list.body.items.length, 1);
});

test('window rules: no submissions or uploads after close or after the deadline passes', opts, async () => {
  assert.equal((await h.call('POST', '/api/submissions', { token: S.b3.token, json: { tenderId: S.tender.id } })).status, 422);
  // deadline passing while status is still "open" must also block uploads
  const t2 = await h.call('POST', '/api/tenders', { token: S.off.token, form: tenderForm({ tenderNo: 'BCVP/DEMO/IT/2026/003' }) });
  const id2 = t2.body.tender.id;
  await h.call('PUT', `/api/tenders/${id2}/requirements`, { token: S.off.token, json: { requirements: [reqs().requirements[0]] } });
  await h.call('POST', `/api/tenders/${id2}/requirements/approve`, { token: S.off.token });
  const o3 = await h.call('POST', '/api/organizations', { token: S.b3.token, json: orgBody({ legalName: 'Third Supplies Pvt Ltd', gstin: makeGstin('33', 'AAACT9999Q'), pan: 'AAACT9999Q' }) });
  assert.equal(o3.status, 201);
  const s3 = await h.call('POST', '/api/submissions', { token: S.b3.token, json: { tenderId: id2 } });
  assert.equal(s3.status, 201);
  await require('../../models/Tender').updateOne({ _id: id2 }, { submissionDeadline: new Date(Date.now() - 1000) });
  const r = await h.call('POST', `/api/submissions/${s3.body.submission.id}/documents`, { token: S.b3.token, form: h.form({}, [[h.pdf('late b3'), 'l.pdf']]) });
  assert.equal(r.status, 409); assert.match(r.body.error.message, /window closed/i);
});

test('officer dashboard reflects real records; unavailable figures are null, not zero', opts, async () => {
  const r = await h.call('GET', '/api/dashboard/officer', { token: S.off.token });
  assert.equal(r.status, 200);
  assert.equal(r.body.totals.totalTenders, 2); assert.equal(r.body.totals.submittedBids, 2);
  assert.equal(r.body.totals.findingsRequiringReview, null); assert.equal(r.body.totals.pendingClarifications, null);
  assert.ok(r.body.recentActivity.length > 0 && r.body.recentActivity.length <= 10);
  assert.equal((await h.call('GET', '/api/dashboard/officer', { token: S.off2.token })).body.totals.totalTenders, 0);
  assert.equal((await h.call('GET', '/api/dashboard/officer', { token: S.b1.token })).status, 403);
});

test('bidders see published tenders and tenders they bid on, nothing else', opts, async () => {
  const r = await h.call('GET', '/api/tenders', { token: S.b3.token });
  assert.equal(r.status, 200); assert.ok(r.body.items.every((t) => !('ownerId' in t) && !('fileSha256' in t)));
  const mine = await h.call('GET', '/api/submissions', { token: S.b1.token });
  assert.equal(mine.body.total, 1);
});

test('after all of the above the audit chain is still intact and every key action is recorded', opts, async () => {
  const v = await h.call('GET', '/api/audit/verify-chain', { token: S.aud.token });
  assert.equal(v.body.valid, true, v.body.reason);
  const actions = new Set((await h.call('GET', '/api/audit?pageSize=100', { token: S.aud.token })).body.items.map((i) => i.action));
  for (const a of ['TENDER_CREATED', 'TENDER_UPDATED', 'TENDER_CLOSED', 'TENDER_REVIEWERS_ASSIGNED', 'REQUIREMENTS_SAVED', 'REQUIREMENTS_APPROVED', 'ORGANIZATION_REGISTERED',
    'SUBMISSION_CREATED', 'SUBMISSION_SUBMITTED', 'DOCUMENT_UPLOADED', 'DOCUMENT_REPLACED', 'DOCUMENT_VIEWED', 'ACCESS_DENIED']) assert.ok(actions.has(a), `missing audit action ${a}`);
});
