// Format and checksum validation for Indian identifiers. These check FORMAT only; they cannot
// tell whether a number is actually registered (that is the external-verification adapters' job).
const GST_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const PAN_HOLDER_TYPES = 'ABCFGHLJPT'; // 4th character: A=AOP B=BOI C=Company F=Firm G=Govt H=HUF L=Local J=Artificial person P=Person T=Trust
const UDYAM_RE = /^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/;
const CIN_RE = /^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/;
const VALID_STATE_CODES = new Set([...Array.from({ length: 38 }, (_, i) => String(i + 1).padStart(2, '0')), '97', '99']);

const norm = (s) => String(s ?? '').trim().toUpperCase();

function gstinChecksumChar(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = GST_CHARS.indexOf(first14[i]);
    if (v < 0) return null;
    const p = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return GST_CHARS[(36 - (sum % 36)) % 36];
}

function validatePan(input) {
  const pan = norm(input);
  if (!PAN_RE.test(pan)) return { ok: false, reason: 'PAN must be 5 letters, 4 digits, 1 letter' };
  if (!PAN_HOLDER_TYPES.includes(pan[3])) return { ok: false, reason: 'PAN 4th character is not a valid holder type' };
  return { ok: true, value: pan };
}

function validateGstin(input) {
  const g = norm(input);
  if (g.length !== 15) return { ok: false, reason: 'GSTIN must be 15 characters' };
  if (!VALID_STATE_CODES.has(g.slice(0, 2))) return { ok: false, reason: 'GSTIN state code is not valid' };
  const pan = validatePan(g.slice(2, 12));
  if (!pan.ok) return { ok: false, reason: 'GSTIN does not contain a valid PAN (characters 3-12)' };
  if (!/^[1-9A-Z]$/.test(g[12])) return { ok: false, reason: 'GSTIN entity number (13th character) is not valid' };
  if (g[13] !== 'Z') return { ok: false, reason: 'GSTIN 14th character must be Z' };
  if (gstinChecksumChar(g.slice(0, 14)) !== g[14]) return { ok: false, reason: 'GSTIN checksum digit does not match' };
  return { ok: true, value: g, pan: g.slice(2, 12) };
}

const validateUdyam = (input) => (UDYAM_RE.test(norm(input)) ? { ok: true, value: norm(input) } : { ok: false, reason: 'Udyam number format is UDYAM-XX-00-0000000' });
const validateCin = (input) => (CIN_RE.test(norm(input)) ? { ok: true, value: norm(input) } : { ok: false, reason: 'CIN must be 21 characters in the standard format' });

// Used by seed data and tests to build checksum-valid FICTIONAL identifiers.
function makeGstin(stateCode, pan, entityNo = '1') {
  const first14 = `${stateCode}${pan}${entityNo}Z`;
  return first14 + gstinChecksumChar(first14);
}

// Lower-case, '&' -> 'and', strip punctuation, common suffix variants unified. Used for matching, never for display.
function normalizeName(name) {
  return String(name ?? '').toLowerCase().replace(/&/g, ' and ').replace(/[.,()'"\-/]/g, ' ')
    .replace(/\bprivate\b/g, 'pvt').replace(/\blimited\b/g, 'ltd').replace(/\s+/g, ' ').trim();
}

module.exports = { validatePan, validateGstin, validateUdyam, validateCin, makeGstin, gstinChecksumChar, normalizeName };
