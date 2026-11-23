const crypto = require('crypto');
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

// Deterministic JSON: sorted keys, undefined dropped. Used so hashes survive a DB round-trip.
function canonicalJson(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return '[' + value.map((v) => canonicalJson(v)).join(',') + ']';
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
}
module.exports = { sha256, canonicalJson };
