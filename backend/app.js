const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'bid-compliance-backend' }));
app.use('/api/auth', require('./modules/auth/auth.routes'));
app.use('/api/audit', require('./modules/audit/audit.routes'));
app.use('/api/admin', require('./modules/admin/admin.routes'));
app.use('/api/tenders', require('./modules/tenders/tender.routes'));
app.use('/api/organizations', require('./modules/organizations/org.routes'));
app.use('/api/submissions', require('./modules/submissions/submission.routes'));
app.use('/api/documents', require('./modules/documents/document.routes'));
app.use('/api/dashboard', require('./modules/dashboard/dashboard.routes'));
// Phases 5-7 mount: checks, clarifications, decisions, reports, notifications.

app.use(notFound);
app.use(errorHandler);
module.exports = app;
