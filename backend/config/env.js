require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { z } = require('zod');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(5000),
  MONGO_URI: z.string().default('mongodb://127.0.0.1:27017/bid_compliance'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),
  REFRESH_GRACE_SECONDS: z.coerce.number().int().min(0).default(10),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(25),
  AI_SERVICE_URL: z.string().default('http://localhost:8000'),
  AI_SERVICE_TOKEN: z.string().default(''),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(90000),
  WORKER_POLL_MS: z.coerce.number().int().positive().default(2000),
  SEED_DEMO_PASSWORD: z.string().default('Demo@Procure2026'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const msg = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${msg}\nCopy .env.example to .env and fill it in.`);
}
module.exports = Object.freeze(parsed.data);
