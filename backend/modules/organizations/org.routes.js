const router = require('express').Router();
const { z } = require('zod');
const { authenticate, requirePermission } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { wrap, pageQuery } = require('../../utils/http');
const svc = require('./org.service');
const s = require('./org.schema');

router.use(authenticate);
router.post('/', requirePermission('organization:manage'), validate({ body: s.createBody }), wrap(async (req, res) => res.status(201).json({ organization: await svc.create(req.user, req.body) })));
router.get('/me', requirePermission('organization:manage'), wrap(async (req, res) => res.json({ organization: await svc.mine(req.user) })));
router.patch('/me', requirePermission('organization:manage'), validate({ body: s.updateBody }), wrap(async (req, res) => res.json({ organization: await svc.updateMine(req.user, req.body) })));
router.get('/', requirePermission('organization:read'), validate({ query: z.object(pageQuery) }), wrap(async (req, res) => res.json(await svc.list(req.user, req.validatedQuery))));
router.get('/:id', requirePermission('organization:read'), wrap(async (req, res) => res.json({ organization: await svc.getById(req.user, req.params.id) })));
module.exports = router;
