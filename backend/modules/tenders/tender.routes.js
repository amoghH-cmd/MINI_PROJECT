const router = require('express').Router();
const { authenticate, requirePermission } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { uploadFiles } = require('../../middleware/upload');
const { wrap } = require('../../utils/http');
const svc = require('./tender.service');
const s = require('./tender.schema');

router.use(authenticate);

// Multipart: file is parsed first, then text fields are validated (S2: invalid file -> 415/422 before anything is saved).
router.post('/', requirePermission('tender:create'),
  uploadFiles({ field: 'tenderFile', maxCount: 1, allowedKinds: ['pdf'] }),
  validate({ body: s.createBody }),
  wrap(async (req, res) => res.status(201).json(await svc.create(req.user, req.body, req.inspectedFiles[0]))));

router.get('/reviewers', requirePermission('tender:assign'), wrap(async (_req, res) => res.json({ items: await svc.listReviewers() })));
router.get('/', requirePermission('tender:read'), validate({ query: s.listQuery }), wrap(async (req, res) => res.json(await svc.list(req.user, req.validatedQuery))));
router.get('/:id', requirePermission('tender:read'), wrap(async (req, res) => res.json({ tender: await svc.get(req.user, req.params.id) })));
router.patch('/:id', requirePermission('tender:update'), validate({ body: s.updateBody }), wrap(async (req, res) => res.json({ tender: await svc.update(req.user, req.params.id, req.body) })));
router.post('/:id/close', requirePermission('tender:close'), wrap(async (req, res) => res.json({ tender: await svc.close(req.user, req.params.id) })));
router.put('/:id/reviewers', requirePermission('tender:assign'), validate({ body: s.reviewersBody }), wrap(async (req, res) => res.json({ tender: await svc.assignReviewers(req.user, req.params.id, req.body.reviewerIds) })));
router.get('/:id/file', requirePermission('tender:read'), wrap(async (req, res) => {
  const f = await svc.openFile(req.user, req.params.id);
  res.set({ 'Content-Type': f.mime, 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(f.name)}`, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': 'sandbox' });
  f.stream.on('error', () => res.destroy()).pipe(res);
}));

// Requirements are nested under a tender (HLD S4)
router.use('/:id/requirements', require('../requirements/requirement.routes'));
module.exports = router;
