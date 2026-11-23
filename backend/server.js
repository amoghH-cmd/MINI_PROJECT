const mongoose = require('mongoose');
const env = require('./config/env');
const app = require('./app');
const worker = require('./jobs/worker');
require('./jobs/handlers').registerAll(worker);

async function main() {
  await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  console.log('[db] connected');
  worker.start();
  const server = app.listen(env.PORT, () => console.log(`[api] listening on :${env.PORT}`));
  const shutdown = async () => { worker.stop(); server.close(); await mongoose.disconnect(); process.exit(0); };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
}
main().catch((e) => { console.error('Startup failed:', e.message); process.exit(1); });
