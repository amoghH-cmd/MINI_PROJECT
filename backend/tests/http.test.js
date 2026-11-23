require('./setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../app');
const { computeBackoff } = require('../utils/backoff');
const { LocalStorage } = require('../services/storage');
const { sha256 } = require('../utils/hash');

async function withApp(fn) {
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  try { await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); }
}

test('health endpoint', () => withApp(async (u) => assert.equal((await (await fetch(u + '/api/health')).json()).status, 'ok')));
test('protected routes reject missing token with 401 envelope', () => withApp(async (u) => {
  for (const p of ['/api/audit', '/api/audit/verify-chain', '/api/admin/jobs', '/api/auth/me']) {
    const r = await fetch(u + p); const b = await r.json();
    assert.equal(r.status, 401, p); assert.equal(b.error.code, 'UNAUTHORIZED');
  }
}));
test('forged token (wrong secret) is rejected', () => withApp(async (u) => {
  const t = jwt.sign({ sub: '64b000000000000000000001', role: 'AUDITOR' }, 'some-other-secret-value-123');
  const r = await fetch(u + '/api/audit', { headers: { Authorization: 'Bearer ' + t } });
  assert.equal(r.status, 401);
}));
test('login validates input before touching the database', () => withApp(async (u) => {
  const r = await fetch(u + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'nope' }) });
  const b = await r.json();
  assert.equal(r.status, 422); assert.equal(b.error.code, 'VALIDATION_FAILED'); assert.ok(b.error.fields.length >= 1);
}));
test('registration rejects weak passwords', () => withApp(async (u) => {
  const r = await fetch(u + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Test', email: 'a@b.co', password: 'short' }) });
  assert.equal(r.status, 422);
}));
test('malformed JSON -> 400 envelope; unknown route -> 404 envelope', () => withApp(async (u) => {
  let r = await fetch(u + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' });
  assert.equal(r.status, 400);
  r = await fetch(u + '/api/nothing'); assert.equal(r.status, 404); assert.equal((await r.json()).error.code, 'NOT_FOUND');
}));

test('retry backoff doubles and is capped', () => {
  assert.equal(computeBackoff(1), 2000); assert.equal(computeBackoff(2), 4000); assert.equal(computeBackoff(3), 8000);
  assert.equal(computeBackoff(30), 300000);
});
test('storage: random server-side name, correct sha256, blocks path traversal', async () => {
  const s = new LocalStorage(require('path').join(require('os').tmpdir(), 'bcvp-storage-test'));
  const buf = Buffer.from('hello');
  const r = await s.save(buf, { ext: '.pdf' });
  assert.equal(r.sha256, sha256(buf)); assert.match(r.key, /^documents\/[0-9a-f-]{36}\.pdf$/);
  assert.throws(() => s.resolve('../../etc/passwd'), /Invalid storage key/);
  await s.remove(r.key);
});
