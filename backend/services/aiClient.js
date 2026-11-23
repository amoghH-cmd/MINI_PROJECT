// HTTP client for the Python AI service. The AI service proposes; this client never interprets results as decisions.
const env = require('../config/env');

class AiError extends Error {
  constructor(message, { status = null, code = 'AI_ERROR', fatal = false } = {}) {
    super(message); this.name = 'AiError'; this.status = status; this.code = code; this.fatal = fatal;
  }
}

async function post(path, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), env.AI_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(env.AI_SERVICE_URL + path, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'x-service-token': env.AI_SERVICE_TOKEN },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new AiError(`AI service unreachable or timed out: ${e.cause?.code || e.message}`, { code: 'AI_UNAVAILABLE' }); // retryable
  } finally { clearTimeout(timer); }

  const data = await res.json().catch(() => null);
  if (res.ok) return data;
  const err = data?.error || {};
  // 422 file problems and 400/404 path problems cannot succeed on retry.
  const fatal = (res.status === 422 && err.code !== 'VALIDATION_FAILED') || res.status === 400 || res.status === 404;
  throw new AiError(err.message || `AI service error ${res.status}`, { status: res.status, code: err.code || 'AI_ERROR', fatal });
}

module.exports = {
  AiError,
  processDocument: (b) => post('/v1/documents/process', b),
  extractTender: (b) => post('/v1/tender/extract', b),
  consistency: (b) => post('/v1/consistency', b),
};
