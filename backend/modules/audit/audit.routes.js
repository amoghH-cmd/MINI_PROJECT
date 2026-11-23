const router = require('express').Router();
const { z } = require('zod');
const AuditLog = require('../../models/AuditLog');
const { authenticate, requirePermission } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const audit = require('../../services/audit.service');

const query = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  action: z.string().max(60).optional(),
  entity: z.string().max(60).optional(),
  actorId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

router.use(authenticate, requirePermission('audit:read'));

router.get('/', validate({ query }), async (req, res, next) => {
  try {
    const q = req.validatedQuery;
    const filter = {};
    if (q.action) filter.action = q.action;
    if (q.entity) filter.entity = q.entity;
    if (q.actorId) filter.actorId = q.actorId;
    if (q.from || q.to) filter.at = { ...(q.from && { $gte: q.from }), ...(q.to && { $lte: q.to }) };
    const [items, total] = await Promise.all([
      AuditLog.find(filter).sort({ seq: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean(),
      AuditLog.countDocuments(filter),
    ]);
    res.json({ items, page: q.page, pageSize: q.pageSize, total });
  } catch (e) { next(e); }
});

router.get('/verify-chain', async (_req, res, next) => {
  try { res.json(await audit.verifyChain()); } catch (e) { next(e); }
});
module.exports = router;
