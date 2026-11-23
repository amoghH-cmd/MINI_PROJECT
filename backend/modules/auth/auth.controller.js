const env = require('../../config/env');
const svc = require('./auth.service');

const COOKIE = 'refresh_token';
const cookieOpts = () => ({
  httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'strict',
  path: '/api/auth', maxAge: env.REFRESH_TTL_DAYS * 86400000,
});
const ctx = (req) => ({ ip: req.ip });
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

exports.login = wrap(async (req, res) => {
  const { user, accessToken, refreshToken } = await svc.login(req.body, ctx(req));
  res.cookie(COOKIE, refreshToken, cookieOpts()).json({ user, accessToken });
});
exports.refresh = wrap(async (req, res) => {
  const { user, accessToken, refreshToken } = await svc.refresh(req.cookies[COOKIE], ctx(req));
  res.cookie(COOKIE, refreshToken, cookieOpts()).json({ user, accessToken });
});
exports.logout = wrap(async (req, res) => {
  await svc.logout(req.cookies[COOKIE], req.user);
  res.clearCookie(COOKIE, { path: '/api/auth' }).status(204).end();
});
exports.register = wrap(async (req, res) => {
  res.status(201).json({ user: await svc.registerBidder(req.body, ctx(req)) });
});
exports.me = wrap(async (req, res) => { res.json({ user: req.user.toPublic() }); });
