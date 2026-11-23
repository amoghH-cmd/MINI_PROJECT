const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const opts = { skip: !h.enabled && 'MONGO_TEST_URI not set' };

test.before(async () => { if (h.enabled) await h.start('p3'); });
test.after(async () => { await h.stop(); });

let officer, auditor, cookie; const S = {};
const cookieOf = (r) => (r.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).find((c) => c.startsWith('refresh_token='));

test('login: success returns token + HTTP-only refresh cookie; wrong password and unknown email give the same 401', opts, async () => {
  officer = await h.makeUser('PROCUREMENT_OFFICER', 'o@t.test');
  auditor = await h.makeUser('AUDITOR', 'a@t.test');
  let r = await h.call('POST', '/api/auth/login', { json: { email: 'o@t.test', password: officer.password } });
  assert.equal(r.status, 200); assert.ok(r.body.accessToken); assert.equal(r.body.user.role, 'PROCUREMENT_OFFICER');
  assert.ok(!('passwordHash' in r.body.user));
  assert.match(r.headers.getSetCookie().join(';'), /HttpOnly/i); cookie = cookieOf(r);
  const bad = await h.call('POST', '/api/auth/login', { json: { email: 'o@t.test', password: 'wrong-password-1' } });
  const unk = await h.call('POST', '/api/auth/login', { json: { email: 'nobody@t.test', password: 'wrong-password-1' } });
  assert.equal(bad.status, 401); assert.equal(unk.status, 401); assert.deepEqual(bad.body, unk.body);
});

test('refresh rotates the token; two concurrent refreshes with one cookie both succeed (grace window)', opts, async () => {
  const [a, b] = await Promise.all([h.call('POST', '/api/auth/refresh', { cookie }), h.call('POST', '/api/auth/refresh', { cookie })]);
  assert.deepEqual([a.status, b.status], [200, 200], 'tabs racing on the same cookie must not be logged out');
  assert.notEqual(cookieOf(a), cookie); S.fresh = cookieOf(a);
});

test('a consumed refresh token replayed after the grace window revokes all sessions', opts, async () => {
  await new Promise((r) => setTimeout(r, 1300));
  const replay = await h.call('POST', '/api/auth/refresh', { cookie });
  assert.equal(replay.status, 401);
  const after = await h.call('POST', '/api/auth/refresh', { cookie: S.fresh });
  assert.equal(after.status, 401, 'tokens issued from the stolen lineage are revoked too');
  const log = await h.call('GET', '/api/audit?action=REFRESH_REJECTED_SESSIONS_REVOKED', { token: auditor.token });
  assert.ok(log.body.total >= 1);
});

test('lockout: 3 failures lock the account (423) even for the right password', opts, async () => {
  await h.makeUser('BIDDER', 'lock@t.test');
  const codes = [];
  for (let i = 0; i < 3; i++) codes.push((await h.call('POST', '/api/auth/login', { json: { email: 'lock@t.test', password: 'wrong-password-1' } })).status);
  assert.deepEqual(codes, [401, 401, 423]);
  const r = await h.call('POST', '/api/auth/login', { json: { email: 'lock@t.test', password: 'Valid#Pass12345' } });
  assert.equal(r.status, 423); assert.equal(r.body.error.code, 'ACCOUNT_LOCKED');
});

test('registration creates BIDDER only and rejects duplicates', opts, async () => {
  const body = { name: 'New Bidder', email: 'nb@t.test', password: 'Strong#Pass123' };
  const r = await h.call('POST', '/api/auth/register', { json: { ...body, role: 'ADMIN' } });
  assert.equal(r.status, 201); assert.equal(r.body.user.role, 'BIDDER');
  assert.equal((await h.call('POST', '/api/auth/register', { json: body })).status, 409);
});

test('RBAC: bidder hitting an officer route gets 403 and an ACCESS_DENIED audit entry', opts, async () => {
  const b = await h.makeUser('BIDDER', 'b@t.test');
  const r = await h.call('POST', '/api/tenders', { token: b.token, form: h.form({}, []) });
  assert.equal(r.status, 403);
  const log = await h.call('GET', '/api/audit?action=ACCESS_DENIED', { token: auditor.token });
  assert.equal(log.status, 200); assert.ok(log.body.items.length >= 1);
  assert.equal(log.body.items[0].meta.permission, 'tender:create');
});

test('audit chain verifies, and direct tampering in the database is detected', opts, async () => {
  let v = await h.call('GET', '/api/audit/verify-chain', { token: auditor.token });
  assert.equal(v.body.valid, true); assert.ok(v.body.checked >= 5);
  // Bypass Mongoose entirely (as a malicious DBA would) and alter one entry.
  const col = h.mongoose.connection.db.collection('auditlogs');
  const target = await col.findOne({ action: 'LOGIN' });
  await col.updateOne({ _id: target._id }, { $set: { action: 'LOGIN_EDITED' } });
  v = await h.call('GET', '/api/audit/verify-chain', { token: auditor.token });
  assert.equal(v.body.valid, false); assert.equal(v.body.brokenAtSeq, target.seq);
});

test('AuditLog cannot be updated or deleted through the application layer', opts, async () => {
  const AuditLog = require('../../models/AuditLog');
  await assert.rejects(() => AuditLog.updateOne({}, { action: 'x' }), /append-only/);
  await assert.rejects(() => AuditLog.deleteMany({}), /append-only/);
});

test('only auditors may read the audit trail', opts, async () => {
  assert.equal((await h.call('GET', '/api/audit', { token: officer.token })).status, 403);
  assert.equal((await h.call('GET', '/api/audit', { token: auditor.token })).status, 200);
});

test('job queue: idempotent enqueue, claim, retry with backoff, then fail after max attempts', opts, async () => {
  const q = require('../../jobs/queue');
  const a = await q.enqueue('process_document', { documentId: 'd1' }, { idempotencyKey: 'k1', maxAttempts: 2 });
  const b = await q.enqueue('process_document', { documentId: 'd1' }, { idempotencyKey: 'k1' });
  assert.equal(String(a._id), String(b._id));
  const c = await q.enqueue('consistency', {}); const d = await q.enqueue('consistency', {});
  assert.notEqual(String(c._id), String(d._id), 'jobs without a key must not collide');
  assert.equal(await q.claim(['extract_requirements']), null, 'types without a handler are not claimed');
  let job = await q.claim(['process_document']); assert.equal(job.attempts, 1);
  job = await q.fail(job, new Error('boom')); assert.equal(job.status, 'queued'); assert.ok(job.nextRunAt > new Date());
  const ProcessingJob = require('../../models/ProcessingJob');
  await ProcessingJob.updateOne({ _id: job._id }, { nextRunAt: new Date(0) });
  job = await q.claim(['process_document']); assert.equal(job.attempts, 2);
  job = await q.fail(job, new Error('boom again')); assert.equal(job.status, 'failed'); assert.equal(job.lastError, 'boom again');
});
