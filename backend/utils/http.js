const { z } = require('zod');
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
};
const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid identifier');
const actorOf = (user) => ({ id: user.id, role: user.role });
// Escape user text before using it in a regex search.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
module.exports = { wrap, pageQuery, objectId, actorOf, escapeRe };
