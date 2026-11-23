// Integration harness. Runs only when MONGO_TEST_URI is set (e.g. mongodb://127.0.0.1:27017).
// Each test file gets its own throw-away database, dropped at the end.
require('../setup');
process.env.LOGIN_MAX_ATTEMPTS = '3';
process.env.REFRESH_GRACE_SECONDS = '1';
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const URI = process.env.MONGO_TEST_URI;
const enabled = !!URI;
let server, base;

async function start(dbName) {
  await mongoose.connect(URI, { dbName: `bcvp_test_${dbName}_${Date.now()}`, serverSelectionTimeoutMS: 8000 });
  await mongoose.connection.dropDatabase();
  const app = require('../../app');
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
}
async function stop() {
  if (server) server.close();
  if (mongoose.connection.readyState === 1) { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); }
}

// json: object body; form: FormData; returns { status, body, headers, raw }
async function call(method, path, { token, json, form, cookie } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;
  let body;
  if (json !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) body = form;
  const res = await fetch(base + path, { method, headers, body });
  const buf = Buffer.from(await res.arrayBuffer());
  let parsed = null;
  if ((res.headers.get('content-type') || '').includes('json')) { try { parsed = JSON.parse(buf.toString()); } catch { /* not json */ } }
  return { status: res.status, body: parsed, headers: res.headers, raw: buf };
}

const User = () => require('../../models/User');
async function makeUser(role, email, extra = {}) {
  const u = await User().create({ name: extra.name || email.split('@')[0], email, role, designation: extra.designation || '', passwordHash: await bcrypt.hash(extra.password || 'Valid#Pass12345', 4), ...extra.fields });
  const { signAccess } = require('../../modules/auth/auth.service');
  return { user: u, token: signAccess(u), password: extra.password || 'Valid#Pass12345' };
}

const pdf = (text) => Buffer.from(`%PDF-1.4\n% ${text}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`);
function form(fields = {}, files = [], fileField = 'files') {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  for (const [buf, name] of files) f.append(fileField, new Blob([buf]), name);
  return f;
}
module.exports = { enabled, start, stop, call, makeUser, pdf, form, mongoose };
