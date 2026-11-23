// Exponential backoff for job retries: base * 2^(attempt-1), capped.
function computeBackoff(attempts, baseMs = 2000, capMs = 5 * 60 * 1000) {
  const n = Math.max(1, attempts);
  return Math.min(capMs, baseMs * 2 ** (n - 1));
}
module.exports = { computeBackoff };
