const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const c = require('./auth.controller');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { loginBody, registerBody } = require('./auth.schema');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: true, legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' } }),
});

router.post('/login', limiter, validate({ body: loginBody }), c.login);
router.post('/register', limiter, validate({ body: registerBody }), c.register);
router.post('/refresh', limiter, c.refresh);
router.post('/logout', authenticate, c.logout);
router.get('/me', authenticate, c.me);
module.exports = router;
