const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const { E } = require('../utils/errors');
const { can } = require('../config/permissions');
const audit = require('../services/audit.service');

// Verifies the access token and re-loads the user so deactivation takes effect immediately.
async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw E.unauthorized();
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
    const user = await User.findById(payload.sub);
    if (!user || !user.active) throw E.unauthorized('Account not found or deactivated');
    req.user = user;
    next();
  } catch (err) { next(err); }
}

// Backend authorisation. Hiding a button in the UI is never relied on.
function requirePermission(action) {
  return (req, _res, next) => {
    if (!req.user) return next(E.unauthorized());
    if (!can(req.user.role, action)) {
      audit.safeAppend({
        actor: { id: req.user.id, role: req.user.role },
        action: 'ACCESS_DENIED', entity: 'route',
        meta: { permission: action, method: req.method, path: req.originalUrl },
      });
      return next(E.forbidden());
    }
    next();
  };
}
module.exports = { authenticate, requirePermission };
