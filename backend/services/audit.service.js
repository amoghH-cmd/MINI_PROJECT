const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const { sha256, canonicalJson } = require('../utils/hash');
const { maskDeep } = require('../utils/mask');

const GENESIS = 'GENESIS';

// The exact fields that feed the hash. Anything stored on the entry that is not here
// (e.g. _id) cannot be changed without affecting nothing, so keep this list complete.
function hashPayload(e) {
  return {
    seq: e.seq,
    actorId: e.actorId ? String(e.actorId) : null,
    actorRole: e.actorRole ?? null,
    action: e.action,
    entity: e.entity,
    entityId: e.entityId ?? null,
    beforeHash: e.beforeHash ?? null,
    afterHash: e.afterHash ?? null,
    changes: e.changes ?? null,
    meta: e.meta ?? null,
    at: new Date(e.at).toISOString(),
  };
}
const computeHash = (prevHash, entry) => sha256(prevHash + canonicalJson(hashPayload(entry)));

// Shallow before/after diff of already-masked states.
function diffStates(before, after) {
  if (!before && !after) return null;
  const b = before || {};
  const a = after || {};
  const out = {};
  for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (canonicalJson(b[k]) !== canonicalJson(a[k])) out[k] = { from: b[k] ?? null, to: a[k] ?? null };
  }
  return out;
}

// Incremental verifier so the whole log never has to sit in memory.
class ChainVerifier {
  constructor() { this.prev = GENESIS; this.expectedSeq = 1; this.checked = 0; this.brokenAtSeq = null; this.reason = null; }
  push(entry) {
    if (this.brokenAtSeq !== null) return;
    const fail = (reason) => { this.brokenAtSeq = entry.seq; this.reason = reason; };
    if (entry.seq !== this.expectedSeq) return fail(`sequence gap: expected ${this.expectedSeq}, found ${entry.seq}`);
    if (entry.prevHash !== this.prev) return fail('prevHash does not match previous entry');
    if (computeHash(entry.prevHash, entry) !== entry.hash) return fail('hash does not match entry contents');
    this.prev = entry.hash;
    this.expectedSeq += 1;
    this.checked += 1;
  }
  result() {
    return { valid: this.brokenAtSeq === null, checked: this.checked, brokenAtSeq: this.brokenAtSeq, reason: this.reason };
  }
}
const verifyEntries = (entries) => {
  const v = new ChainVerifier();
  for (const e of entries) v.push(e);
  return v.result();
};

// Appends are serialised in-process; the unique index on `seq` guards against a second process.
let tail = Promise.resolve();
async function appendOnce(input) {
  const last = await AuditLog.findOne().sort({ seq: -1 }).lean();
  const seq = last ? last.seq + 1 : 1;
  const prevHash = last ? last.hash : GENESIS;
  const before = input.before ? maskDeep(input.before) : null;
  const after = input.after ? maskDeep(input.after) : null;
  const entry = {
    seq,
    actorId: input.actor?.id || null,
    actorRole: input.actor?.role || null,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId ? String(input.entityId) : null,
    beforeHash: before ? sha256(canonicalJson(before)) : null,
    afterHash: after ? sha256(canonicalJson(after)) : null,
    changes: diffStates(before, after),
    meta: input.meta ? maskDeep(input.meta) : null,
    at: new Date(),
  };
  entry.prevHash = prevHash;
  entry.hash = computeHash(prevHash, entry);
  return AuditLog.create(entry);
}

function append(input) {
  const run = async () => {
    try { return await appendOnce(input); }
    catch (err) {
      if (err && err.code === 11000) return appendOnce(input); // another writer took the seq
      throw err;
    }
  };
  const p = tail.then(run);
  tail = p.catch(() => {});
  return p;
}

// For non-blocking denial/failed-login logging. Never throws, but never fails silently either.
async function safeAppend(input) {
  if (mongoose.connection.readyState !== 1) {
    console.error('[audit] database not connected; entry NOT recorded:', input.action);
    return null;
  }
  try { return await append(input); }
  catch (err) { console.error('[audit] failed to record entry:', input.action, err.message); return null; }
}

async function verifyChain() {
  const v = new ChainVerifier();
  const cursor = AuditLog.find().sort({ seq: 1 }).lean().cursor();
  for await (const e of cursor) { v.push(e); if (v.brokenAtSeq !== null) break; }
  return v.result();
}

module.exports = { append, safeAppend, verifyChain, verifyEntries, computeHash, hashPayload, diffStates, ChainVerifier, GENESIS };
