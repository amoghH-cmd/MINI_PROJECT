require('./setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const { PERMISSIONS, ROLES, can } = require('../config/permissions');
const { requirePermission } = require('../middleware/auth');
const audit = require('../services/audit.service');

const run = (mw, req) => new Promise((resolve) => mw(req, {}, (err) => resolve(err)));
const denied = [];
audit.safeAppend = async (e) => { denied.push(e); return null; }; // no DB in unit tests

test('only a Procurement Officer may record a final decision', () => {
  assert.deepEqual(PERMISSIONS['decision:record'], [ROLES.OFFICER]);
  for (const r of [ROLES.ADMIN, ROLES.REVIEWER, ROLES.BIDDER, ROLES.AUDITOR]) assert.equal(can(r, 'decision:record'), false);
});
test('TEC reviewer can comment and recommend but cannot override, approve or decide', () => {
  assert.equal(can(ROLES.REVIEWER, 'comment:add'), true);
  assert.equal(can(ROLES.REVIEWER, 'recommendation:submit'), true);
  for (const a of ['check:override', 'requirement:approve', 'decision:record', 'tender:create']) assert.equal(can(ROLES.REVIEWER, a), false);
});
test('auditor is read-only', () => {
  const writes = Object.entries(PERMISSIONS).filter(([, roles]) => roles.includes(ROLES.AUDITOR)).map(([a]) => a);
  assert.ok(writes.every((a) => /:read$/.test(a)), `auditor has non-read permission: ${writes}`);
});
test('bidder cannot touch officer or admin actions', () => {
  for (const a of ['tender:create', 'check:override', 'user:manage', 'audit:read', 'evaluation:run']) assert.equal(can(ROLES.BIDDER, a), false);
});
test('unknown permission is denied for everyone', () => {
  for (const r of Object.values(ROLES)) assert.equal(can(r, 'nope:nope'), false);
});
test('every permission lists only valid roles', () => {
  const valid = new Set(Object.values(ROLES));
  for (const roles of Object.values(PERMISSIONS)) roles.forEach((r) => assert.ok(valid.has(r)));
});
test('middleware: 401 without user, 403 + audit entry when role lacks permission, pass when allowed', async () => {
  let err = await run(requirePermission('decision:record'), {});
  assert.equal(err.status, 401);
  err = await run(requirePermission('decision:record'), { user: { id: 'u1', role: ROLES.REVIEWER }, method: 'POST', originalUrl: '/x' });
  assert.equal(err.status, 403); assert.equal(denied.at(-1).action, 'ACCESS_DENIED');
  err = await run(requirePermission('decision:record'), { user: { id: 'u2', role: ROLES.OFFICER } });
  assert.equal(err, undefined);
});
