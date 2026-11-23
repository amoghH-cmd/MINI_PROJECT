const router = require('express').Router();
const { z } = require('zod');
const bcrypt = require('bcryptjs');
const ProcessingJob = require('../../models/ProcessingJob');
const User = require('../../models/User');
const { authenticate, requirePermission } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { wrap, pageQuery } = require('../../utils/http');
const audit = require('../../services/audit.service');
const { actorOf } = require('../../utils/http');
const { ROLES } = require('../../config/permissions');

// --- Jobs monitoring ---
const jobQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(ProcessingJob.JOB_STATUS).optional(),
  type: z.enum(ProcessingJob.JOB_TYPES).optional(),
});

router.get(
  '/jobs',
  authenticate,
  requirePermission('job:monitor'),
  validate({ query: jobQuery }),
  wrap(async (req, res) => {
    const q = req.validatedQuery;
    const filter = {};
    if (q.status) filter.status = q.status;
    if (q.type) filter.type = q.type;
    const [items, total] = await Promise.all([
      ProcessingJob.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean(),
      ProcessingJob.countDocuments(filter),
    ]);
    res.json({ items, page: q.page, pageSize: q.pageSize, total });
  })
);

// --- User management (Admin only) ---
const userQuery = z.object({ ...pageQuery, role: z.enum(Object.values(ROLES)).optional() });
const createUserBody = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(Object.values(ROLES)),
  designation: z.string().max(80).default(''),
  department: z.string().max(80).default(''),
});
const patchUserBody = z.object({
  active: z.boolean().optional(),
  designation: z.string().max(80).optional(),
  department: z.string().max(80).optional(),
});

router.get(
  '/users',
  authenticate,
  requirePermission('user:manage'),
  validate({ query: userQuery }),
  wrap(async (req, res) => {
    const q = req.validatedQuery;
    const filter = {};
    if (q.role) filter.role = q.role;
    const [items, total] = await Promise.all([
      User.find(filter).sort({ name: 1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize).lean(),
      User.countDocuments(filter),
    ]);
    res.json({ items: items.map((u) => ({ id: String(u._id), name: u.name, email: u.email, role: u.role, designation: u.designation, department: u.department, active: u.active, organizationId: u.organizationId, createdAt: u.createdAt })), page: q.page, pageSize: q.pageSize, total });
  })
);

router.post(
  '/users',
  authenticate,
  requirePermission('user:manage'),
  validate({ body: createUserBody }),
  wrap(async (req, res) => {
    const { password, ...rest } = req.body;
    const existing = await User.findOne({ email: rest.email });
    if (existing) return res.status(409).json({ error: { code: 'CONFLICT', message: 'Email already in use' } });
    const user = await User.create({ ...rest, passwordHash: await bcrypt.hash(password, 12) });
    await audit.append({ actor: actorOf(req.user), action: 'USER_CREATED', entity: 'user', entityId: user.id, after: { email: user.email, role: user.role } });
    res.status(201).json({ user: user.toPublic() });
  })
);

router.patch(
  '/users/:id',
  authenticate,
  requirePermission('user:manage'),
  validate({ body: patchUserBody }),
  wrap(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    const before = { active: user.active, designation: user.designation, department: user.department };
    user.set(req.body);
    await user.save();
    await audit.append({ actor: actorOf(req.user), action: 'USER_UPDATED', entity: 'user', entityId: user.id, before, after: req.body });
    res.json({ user: user.toPublic() });
  })
);

module.exports = router;
