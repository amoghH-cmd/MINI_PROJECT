class AppError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}
const E = {
  badRequest: (m = 'Bad request', f) => new AppError(400, 'BAD_REQUEST', m, f),
  unauthorized: (m = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', m),
  invalidCredentials: () => new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password'),
  forbidden: (m = 'You do not have permission to perform this action') => new AppError(403, 'FORBIDDEN', m),
  notFound: (m = 'Resource not found') => new AppError(404, 'NOT_FOUND', m),
  conflict: (m = 'Conflict') => new AppError(409, 'CONFLICT', m),
  tooLarge: (m = 'File too large') => new AppError(413, 'FILE_TOO_LARGE', m),
  unsupportedMedia: (m = 'Unsupported file type', f) => new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', m, f),
  unprocessable: (m = 'Validation failed', f) => new AppError(422, 'VALIDATION_FAILED', m, f),
  locked: (m = 'Account temporarily locked') => new AppError(423, 'ACCOUNT_LOCKED', m),
};
module.exports = { AppError, E };
