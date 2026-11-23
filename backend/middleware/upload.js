const multer = require('multer');
const env = require('../config/env');
const { inspectFile } = require('../utils/fileInspect');
const { E } = require('../utils/errors');

/**
 * Parses multipart into memory and inspects every file by content. Nothing is written to disk here:
 * services save files only after authorisation and business rules (e.g. tender still open) pass,
 * so rejected requests leave no orphan files.
 * Result: req.inspectedFiles = [{ buffer, originalName, kind, mime, ext, size }]
 */
function uploadFiles({ field = 'files', maxCount = 20, allowedKinds, required = true } = {}) {
  const parser = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: maxCount },
  }).array(field, maxCount);

  return (req, res, next) => {
    parser(req, res, (err) => {
      if (err) return next(err);
      const files = req.files || [];
      if (files.length === 0 && !required) { req.inspectedFiles = []; return next(); }
      if (files.length === 0) return next(E.unprocessable('No files were uploaded', [{ path: field, message: 'At least one file is required' }]));
      const problems = [];
      req.inspectedFiles = [];
      for (const f of files) {
        const verdict = inspectFile(f.buffer, f.originalname, allowedKinds);
        if (!verdict.ok) problems.push({ path: f.originalname, code: verdict.code, message: verdict.message });
        else req.inspectedFiles.push({ buffer: f.buffer, originalName: f.originalname, kind: verdict.kind, mime: verdict.mime, ext: verdict.ext, size: f.size });
      }
      if (problems.length) {
        const typeOnly = problems.every((p) => p.code === 'UNSUPPORTED_TYPE' || p.code === 'EXTENSION_MISMATCH');
        return next(typeOnly ? E.unsupportedMedia('One or more files were rejected', problems) : E.unprocessable('One or more files were rejected', problems));
      }
      next();
    });
  };
}
module.exports = { uploadFiles };
