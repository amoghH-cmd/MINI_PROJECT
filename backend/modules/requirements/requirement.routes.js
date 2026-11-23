const router = require('express').Router({ mergeParams: true });
const { authenticate, requirePermission } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { wrap } = require('../../utils/http');
const svc = require('./requirement.service');
const s = require('./requirement.schema');

router.use(authenticate);
router.get('/', requirePermission('requirement:read'), validate({ query: s.getQuery }), wrap(async (req, res) => res.json(await svc.get(req.user, req.params.id, req.validatedQuery.version))));
router.put('/', requirePermission('requirement:edit'), validate({ body: s.saveBody }), wrap(async (req, res) => res.json(await svc.save(req.user, req.params.id, req.body.requirements))));
router.post('/approve', requirePermission('requirement:approve'), wrap(async (req, res) => res.json(await svc.approve(req.user, req.params.id))));
module.exports = router;
