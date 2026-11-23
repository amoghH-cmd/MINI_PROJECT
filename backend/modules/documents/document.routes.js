const router = require('express').Router();
const { authenticate, requirePermission } = require('../../middleware/auth');
const { wrap } = require('../../utils/http');
const svc = require('./document.service');

router.use(authenticate);
router.get('/:id/file', requirePermission('document:read'), wrap(async (req, res) => {
  const f = await svc.openFile(req.user, req.params.id);
  // Untrusted upload: served with a sandbox CSP and nosniff; never executed or interpreted by the server.
  res.set({ 'Content-Type': f.mime, 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(f.name)}`, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': 'sandbox', 'Cache-Control': 'private, no-store' });
  f.stream.on('error', () => res.destroy()).pipe(res);
}));
router.get('/:id/fields', requirePermission('extraction:read'), wrap(async (req, res) => res.json(await svc.getFields(req.user, req.params.id))));
module.exports = router;
