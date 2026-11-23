// Magic-byte inspection (not extension-trust). Returns a verdict; never throws on bad input.
const ALLOWED = {
  pdf: { mime: 'application/pdf', exts: ['.pdf'] },
  jpg: { mime: 'image/jpeg', exts: ['.jpg', '.jpeg'] },
  png: { mime: 'image/png', exts: ['.png'] },
  tiff: { mime: 'image/tiff', exts: ['.tif', '.tiff'] },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', exts: ['.docx'] },
};
const startsWith = (buf, bytes) => buf.length >= bytes.length && bytes.every((b, i) => buf[i] === b);

function sniff(buf) {
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46])) return 'pdf';
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'jpg';
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(buf, [0x49, 0x49, 0x2a, 0x00]) || startsWith(buf, [0x4d, 0x4d, 0x00, 0x2a])) return 'tiff';
  // DOCX is a ZIP container. We only confirm the ZIP signature here; deep inspection of the package is not done.
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) return 'docx';
  return null;
}
const extOf = (name) => { const i = String(name).lastIndexOf('.'); return i < 0 ? '' : String(name).slice(i).toLowerCase(); };

/**
 * @param {Buffer} buf
 * @param {string} originalName
 * @param {string[]} allowedKinds subset of Object.keys(ALLOWED)
 */
function inspectFile(buf, originalName, allowedKinds = Object.keys(ALLOWED)) {
  if (!buf || buf.length === 0) return { ok: false, code: 'EMPTY_FILE', message: 'File is empty' };
  const kind = sniff(buf);
  if (!kind || !allowedKinds.includes(kind)) {
    return { ok: false, code: 'UNSUPPORTED_TYPE', message: `File content is not an allowed type (${allowedKinds.join(', ')})` };
  }
  const ext = extOf(originalName);
  if (!ALLOWED[kind].exts.includes(ext)) {
    return { ok: false, code: 'EXTENSION_MISMATCH', message: `Extension "${ext || '(none)'}" does not match file content (${kind})` };
  }
  if (kind === 'pdf') {
    // Heuristic checks; the AI container performs the authoritative parse with resource limits.
    if (!buf.subarray(Math.max(0, buf.length - 2048)).includes('%%EOF')) {
      return { ok: false, code: 'MALFORMED_PDF', message: 'PDF is truncated or malformed (no %%EOF marker)' };
    }
    if (buf.includes('/Encrypt')) {
      return { ok: false, code: 'ENCRYPTED_PDF', message: 'Encrypted or password-protected PDFs are not accepted' };
    }
  }
  return { ok: true, kind, mime: ALLOWED[kind].mime, ext: ALLOWED[kind].exts[0] };
}
module.exports = { inspectFile, sniff, ALLOWED };
