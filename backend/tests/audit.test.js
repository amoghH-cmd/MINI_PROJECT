require('./setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../services/audit.service');
const { maskDeep } = require('../utils/mask');

function build(n) {
  const out = []; let prev = A.GENESIS;
  for (let i = 1; i <= n; i++) {
    const e = { seq: i, actorId: '64b000000000000000000001', actorRole: 'PROCUREMENT_OFFICER', action: 'X' + i, entity: 'tender',
      entityId: 't1', beforeHash: null, afterHash: null, changes: { status: { from: 'draft', to: 'open' } }, meta: null, at: new Date(1700000000000 + i * 1000), prevHash: prev };
    e.hash = A.computeHash(prev, e); prev = e.hash; out.push(e);
  }
  return out;
}

test('an untouched chain verifies', () => {
  const r = A.verifyEntries(build(5));
  assert.equal(r.valid, true); assert.equal(r.checked, 5);
});
test('hash survives a JSON/DB-style round trip', () => {
  const rt = JSON.parse(JSON.stringify(build(3))).map((e) => ({ ...e, at: new Date(e.at) }));
  assert.equal(A.verifyEntries(rt).valid, true);
});
test('editing an entry is detected at that sequence number', () => {
  const c = build(5); c[2].changes = { status: { from: 'draft', to: 'cancelled' } };
  const r = A.verifyEntries(c);
  assert.equal(r.valid, false); assert.equal(r.brokenAtSeq, 3);
});
test('deleting an entry is detected as a sequence gap', () => {
  const c = build(5); c.splice(2, 1);
  const r = A.verifyEntries(c);
  assert.equal(r.valid, false); assert.match(r.reason, /sequence gap/);
});
test('re-pointing prevHash is detected', () => {
  const c = build(4); c[3].prevHash = 'deadbeef';
  assert.equal(A.verifyEntries(c).valid, false);
});
test('diffStates reports only changed keys', () => {
  assert.deepEqual(A.diffStates({ a: 1, b: 2 }, { a: 1, b: 3 }), { b: { from: 2, to: 3 } });
});
test('PAN, GSTIN and secrets are masked before logging', () => {
  const m = maskDeep({ note: 'PAN ABCDE1234F, GSTIN 29ABCDE1234F1Z5', password: 'x', refreshTokens: ['a'] });
  assert.ok(!m.note.includes('ABCDE1234F')); assert.ok(!m.note.includes('29ABCDE1234F1Z5'));
  assert.equal(m.password, '[REDACTED]'); assert.equal(m.refreshTokens, '[REDACTED]');
});
