const { ZodError } = require('zod');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const { AppError } = require('../utils/errors');

const notFound = (req, res) =>
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` } });

// Single error envelope: { error: { code, message, fields? } }
function errorHandler(err, req, res, _next) {
  let status = 500, code = 'INTERNAL_ERROR', message = 'Unexpected server error', fields;

  if (err instanceof AppError) { ({ status, code, message, fields } = err); }
  else if (err instanceof ZodError) {
    status = 422; code = 'VALIDATION_FAILED'; message = 'Validation failed';
    fields = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  } else if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') { status = 413; code = 'FILE_TOO_LARGE'; message = 'File exceeds the maximum allowed size'; }
    else { status = 400; code = 'UPLOAD_ERROR'; message = err.message; }
  } else if (err instanceof jwt.TokenExpiredError) { status = 401; code = 'TOKEN_EXPIRED'; message = 'Access token expired'; }
  else if (err instanceof jwt.JsonWebTokenError) { status = 401; code = 'UNAUTHORIZED'; message = 'Invalid token'; }
  else if (err && err.type === 'entity.parse.failed') { status = 400; code = 'BAD_REQUEST'; message = 'Malformed JSON body'; }
  else if (err && err.name === 'CastError') { status = 400; code = 'BAD_REQUEST'; message = 'Invalid identifier'; }

  if (status >= 500) console.error('[error]', req.method, req.originalUrl, err);
  const body = { error: { code, message } };
  if (fields) body.error.fields = fields;
  res.status(status).json(body);
}
module.exports = { notFound, errorHandler };
