const queue = require('./queue');
const env = require('../config/env');

// handlers[type] = async (job) => result. Phase 5 registers the AI-service handlers here.
const handlers = {};
const register = (type, fn) => { handlers[type] = fn; };

let timer = null; let busy = false;
async function tick() {
  if (busy) return;
  busy = true;
  try {
    await queue.requeueStale();
    let job;
    while ((job = await queue.claim(Object.keys(handlers)))) {
      const handler = handlers[job.type];
      try {
        if (!handler) throw new Error(`No handler registered for job type "${job.type}"`);
        await queue.complete(job, await handler(job));
      } catch (err) { await queue.fail(job, err); }
    }
  } catch (err) { console.error('[worker] tick failed:', err.message); }
  finally { busy = false; }
}
const start = () => { if (!timer) timer = setInterval(tick, env.WORKER_POLL_MS); };
const stop = () => { clearInterval(timer); timer = null; };
module.exports = { register, start, stop, tick };
