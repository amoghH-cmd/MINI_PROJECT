const router = require('express').Router();
const { z } = require('zod');
const { authenticate, requirePermission } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { uploadFiles } = require('../../middleware/upload');
const { wrap, pageQuery, objectId } = require('../../utils/http');
const svc = require('./submission.service');
const docs = require('../documents/document.service');

router.use(authenticate);
router.post('/', requirePermission('submission:create'), validate({ body: z.object({ tenderId: objectId }) }), wrap(async (req, res) => res.status(201).json({ submission: await svc.create(req.user, req.body.tenderId) })));
router.get('/', requirePermission('submission:read'), validate({ query: z.object({ ...pageQuery, tenderId: objectId.optional() }) }), wrap(async (req, res) => res.json(await svc.list(req.user, req.validatedQuery))));
router.get('/:id', requirePermission('submission:read'), wrap(async (req, res) => res.json({ submission: await svc.get(req.user, req.params.id) })));
router.get('/:id/verifications', requirePermission('extraction:read'), wrap(async (req, res) => res.json(await svc.verifications(req.user, req.params.id))));
router.post('/:id/submit', requirePermission('submission:submit'), wrap(async (req, res) => res.json({ submission: await svc.submit(req.user, req.params.id) })));

const docKinds = ['pdf', 'jpg', 'png', 'tiff', 'docx'];
router.post('/:id/documents', requirePermission('submission:upload'), uploadFiles({ field: 'files', maxCount: 10, allowedKinds: docKinds }),
  wrap(async (req, res) => res.status(202).json({ documents: await docs.upload(req.user, req.params.id, req.inspectedFiles, { category: req.body.category || undefined }) })));
router.post('/:id/documents/:docId/replace', requirePermission('submission:upload'), uploadFiles({ field: 'files', maxCount: 1, allowedKinds: docKinds }),
  wrap(async (req, res) => res.status(202).json({ document: await docs.replace(req.user, req.params.id, req.params.docId, req.inspectedFiles[0]) })));
module.exports = router;
