const router = require('express').Router();
const { authenticate, requirePermission } = require('../../middleware/auth');
const { wrap } = require('../../utils/http');
const svc = require('./dashboard.service');
router.get('/officer', authenticate, requirePermission('dashboard:officer'), wrap(async (req, res) => res.json(await svc.officer(req.user))));
module.exports = router;
