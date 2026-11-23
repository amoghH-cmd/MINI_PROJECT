const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../../config/env');
const User = require('../../models/User');
const { E } = require('../../utils/errors');
const { sha256 } = require('../../utils/hash');
const { ROLES } = require('../../config/permissions');
const audit = require('../../services/audit.service');

// Compared against when the user does not exist, so response time does not reveal valid emails.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);
const MAX_SESSIONS = 5;

const signAccess = (user) => jwt.sign({ sub: user.id, role: user.role }, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL });

// Opaque refresh token "<userId>.<secret>"; only sha256(secret) is stored.
function addRefreshToken(user) {
  const secret = crypto.randomBytes(48).toString('hex');
  const now = new Date();
  const graceMs = env.REFRESH_GRACE_SECONDS * 1000;
  // Drop expired tokens and consumed tokens whose grace window has ended.
  user.refreshTokens = (user.refreshTokens || []).filter((t) => t.expiresAt > now && !(t.usedAt && now - t.usedAt > graceMs)).slice(-(MAX_SESSIONS - 1));
  user.refreshTokens.push({ hash: sha256(secret), expiresAt: new Date(now.getTime() + env.REFRESH_TTL_DAYS * 86400000) });
  return `${user.id}.${secret}`;
}

async function login({ email, password }, ctx = {}) {
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash +refreshTokens');
  if (!user || !user.active) {
    await bcrypt.compare(password, DUMMY_HASH);
    await audit.safeAppend({ action: 'LOGIN_FAILED', entity: 'user', meta: { reason: user ? 'inactive' : 'unknown_email', ip: ctx.ip } });
    throw E.invalidCredentials();
  }
  if (user.isLocked()) {
    await audit.safeAppend({ actor: { id: user.id, role: user.role }, action: 'LOGIN_BLOCKED_LOCKED', entity: 'user', entityId: user.id, meta: { ip: ctx.ip } });
    throw E.locked(`Account locked until ${user.lockedUntil.toISOString()}`);
  }
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    user.failedAttempts += 1;
    const lockNow = user.failedAttempts >= env.LOGIN_MAX_ATTEMPTS;
    if (lockNow) { user.lockedUntil = new Date(Date.now() + env.LOGIN_LOCK_MINUTES * 60000); user.failedAttempts = 0; }
    await user.save();
    await audit.safeAppend({ actor: { id: user.id, role: user.role }, action: lockNow ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED', entity: 'user', entityId: user.id, meta: { ip: ctx.ip } });
    throw lockNow ? E.locked(`Too many failed attempts. Locked for ${env.LOGIN_LOCK_MINUTES} minutes`) : E.invalidCredentials();
  }
  user.failedAttempts = 0; user.lockedUntil = null;
  const refreshToken = addRefreshToken(user);
  await user.save();
  await audit.append({ actor: { id: user.id, role: user.role }, action: 'LOGIN', entity: 'user', entityId: user.id, meta: { ip: ctx.ip } });
  return { user: user.toPublic(), accessToken: signAccess(user), refreshToken };
}

async function refresh(raw, ctx = {}, attempt = 1) {
  const [uid, secret] = String(raw || '').split('.');
  if (!uid || !secret || !/^[a-f0-9]{24}$/i.test(uid)) throw E.unauthorized('Invalid refresh token');
  const user = await User.findById(uid).select('+refreshTokens');
  if (!user || !user.active) throw E.unauthorized('Invalid refresh token');
  const h = sha256(secret); const now = new Date();
  const tok = user.refreshTokens.find((t) => t.hash === h && t.expiresAt > now);
  const graceMs = env.REFRESH_GRACE_SECONDS * 1000;
  // Unknown/expired secret, or a consumed token presented after its grace window: possible theft -> end every session.
  if (!tok || (tok.usedAt && now - tok.usedAt > graceMs)) {
    user.refreshTokens = []; await user.save();
    await audit.safeAppend({ actor: { id: user.id, role: user.role }, action: 'REFRESH_REJECTED_SESSIONS_REVOKED', entity: 'user', entityId: user.id, meta: { ip: ctx.ip } });
    throw E.unauthorized('Invalid refresh token');
  }
  // Rotation: the presented token is marked consumed (still honoured briefly so concurrent tabs/requests do not log the user out).
  if (!tok.usedAt) tok.usedAt = now;
  const refreshToken = addRefreshToken(user);
  try { await user.save(); }
  catch (err) {
    if (err.name === 'VersionError' && attempt < 3) return refresh(raw, ctx, attempt + 1); // concurrent refresh won the write; re-read
    throw err;
  }
  return { user: user.toPublic(), accessToken: signAccess(user), refreshToken };
}

async function logout(raw, actor) {
  const [uid, secret] = String(raw || '').split('.');
  if (uid && secret && /^[a-f0-9]{24}$/i.test(uid)) {
    await User.updateOne({ _id: uid }, { $pull: { refreshTokens: { hash: sha256(secret) } } });
  }
  if (actor) await audit.safeAppend({ actor: { id: actor.id, role: actor.role }, action: 'LOGOUT', entity: 'user', entityId: actor.id });
}

async function registerBidder({ name, email, password }, ctx = {}) {
  const lower = email.toLowerCase();
  if (await User.exists({ email: lower })) throw E.conflict('An account with this email already exists');
  const user = await User.create({ name, email: lower, role: ROLES.BIDDER, passwordHash: await bcrypt.hash(password, 12) });
  await audit.append({ actor: { id: user.id, role: user.role }, action: 'USER_REGISTERED', entity: 'user', entityId: user.id, after: { email: lower, role: user.role }, meta: { ip: ctx.ip } });
  return user.toPublic();
}

module.exports = { login, refresh, logout, registerBidder, signAccess };
