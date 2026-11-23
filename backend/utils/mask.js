// Sensitive identifiers (PAN, GSTIN) and secrets are masked before they enter logs/audit entries.
const GSTIN = /\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/g;
const PAN = /\b[A-Z]{5}\d{4}[A-Z]\b/g;
const SECRET_KEYS = /^(password|passwordhash|token|accesstoken|refreshtoken|refreshtokens|secret|authorization)$/i;

const maskId = (s) => s.slice(0, 2) + '*'.repeat(Math.max(s.length - 3, 1)) + s.slice(-1);

function maskString(s) {
  return s.replace(GSTIN, maskId).replace(PAN, maskId);
}

function maskDeep(value) {
  if (typeof value === 'string') return maskString(value);
  if (Array.isArray(value)) return value.map(maskDeep);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEYS.test(k) ? '[REDACTED]' : maskDeep(v);
    return out;
  }
  return value;
}
module.exports = { maskDeep, maskString };
