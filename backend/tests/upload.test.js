require('./setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { inspectFile } = require('../utils/fileInspect');
const { uploadFiles } = require('../middleware/upload');
const { errorHandler } = require('../middleware/errorHandler');

const pdf = (extra = '') => Buffer.from(`%PDF-1.4\n1 0 obj<<>>endobj\n${extra}trailer<<>>\n%%EOF\n`);

test('accepts a well-formed PDF', () => assert.equal(inspectFile(pdf(), 'a.pdf').ok, true));
test('rejects empty file', () => assert.equal(inspectFile(Buffer.alloc(0), 'a.pdf').code, 'EMPTY_FILE'));
test('rejects executable renamed to .pdf (magic bytes, not extension)', () =>
  assert.equal(inspectFile(Buffer.from('MZ\x90\x00 fake exe'), 'invoice.pdf').code, 'UNSUPPORTED_TYPE'));
test('rejects PDF content with a .jpg extension', () => assert.equal(inspectFile(pdf(), 'a.jpg').code, 'EXTENSION_MISMATCH'));
test('rejects truncated PDF', () => assert.equal(inspectFile(Buffer.from('%PDF-1.4\nabc'), 'a.pdf').code, 'MALFORMED_PDF'));
test('rejects encrypted PDF', () => assert.equal(inspectFile(pdf('/Encrypt 5 0 R\n'), 'a.pdf').code, 'ENCRYPTED_PDF'));
test('respects per-endpoint allow-list', () => assert.equal(inspectFile(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]), 'a.jpg', ['pdf']).ok, false));

async function withServer(fn) {
  const app = express();
  app.post('/up', uploadFiles({ allowedKinds: ['pdf', 'png'] }), (req, res) => res.json({ n: req.inspectedFiles.length }));
  app.use(errorHandler);
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  try { await fn(`http://127.0.0.1:${server.address().port}/up`); } finally { server.close(); }
}
const form = (...files) => { const f = new FormData(); files.forEach(([buf, name]) => f.append('files', new Blob([buf]), name)); return f; };

test('HTTP: valid PDF accepted', () => withServer(async (url) => {
  const r = await fetch(url, { method: 'POST', body: form([pdf(), 'ok.pdf']) });
  assert.equal(r.status, 200); assert.equal((await r.json()).n, 1);
}));
test('HTTP: wrong type -> 415 with per-file error in standard envelope', () => withServer(async (url) => {
  const r = await fetch(url, { method: 'POST', body: form([Buffer.from('MZ not pdf'), 'evil.pdf']) });
  const b = await r.json();
  assert.equal(r.status, 415); assert.equal(b.error.code, 'UNSUPPORTED_MEDIA_TYPE'); assert.equal(b.error.fields[0].path, 'evil.pdf');
}));
test('HTTP: encrypted PDF -> 422', () => withServer(async (url) => {
  const r = await fetch(url, { method: 'POST', body: form([pdf('/Encrypt 1 0 R'), 'enc.pdf']) });
  assert.equal(r.status, 422); assert.equal((await r.json()).error.fields[0].code, 'ENCRYPTED_PDF');
}));
test('HTTP: oversize file -> 413', () => withServer(async (url) => {
  const big = Buffer.concat([pdf(), Buffer.alloc(1.2 * 1024 * 1024)]);
  const r = await fetch(url, { method: 'POST', body: form([big, 'big.pdf']) });
  assert.equal(r.status, 413);
}));
test('HTTP: no files -> 422', () => withServer(async (url) => {
  const r = await fetch(url, { method: 'POST', body: new FormData() });
  assert.equal(r.status, 422);
}));
