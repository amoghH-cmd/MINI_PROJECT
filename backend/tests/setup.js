// Required first by every test file: provides a safe test environment (no real secrets).
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789';
process.env.UPLOAD_DIR = require('path').join(require('os').tmpdir(), 'bcvp-test-uploads');
process.env.MAX_UPLOAD_MB = '1';
