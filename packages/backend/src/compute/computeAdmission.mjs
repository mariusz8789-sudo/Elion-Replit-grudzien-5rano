/**
 * Process-local admission control for expensive scientific execution.
 * Authentication remains in api.mjs; this module only budgets an already
 * authenticated principal and limits simultaneous heavy runs in this process.
 */
export const DEFAULT_HEAVY_RUN_LIMIT = 6;
export const DEFAULT_HEAVY_RUN_WINDOW_MS = 60_000;
export const DEFAULT_MAX_ACTIVE_HEAVY_RUNS = 1;

export function createComputeAdmission({
  limit = DEFAULT_HEAVY_RUN_LIMIT,
  windowMs = DEFAULT_HEAVY_RUN_WINDOW_MS,
  maxActive = DEFAULT_MAX_ACTIVE_HEAVY_RUNS,
  now = () => Date.now(),
} = {}) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('compute admission limit must be a positive integer');
  if (!Number.isFinite(windowMs) || windowMs <= 0) throw new Error('compute admission windowMs must be positive');
  if (!Number.isInteger(maxActive) || maxActive < 1) throw new Error('compute admission maxActive must be a positive integer');

  const admittedByPrincipal = new Map();
  let active = 0;

  function prune(at = now()) {
    const cutoff = at - windowMs;
    for (const [principal, timestamps] of admittedByPrincipal) {
      const recent = timestamps.filter((timestamp) => timestamp > cutoff);
      if (recent.length === 0) admittedByPrincipal.delete(principal);
      else if (recent.length !== timestamps.length) admittedByPrincipal.set(principal, recent);
    }
  }

  function acquire(principal) {
    const key = String(principal ?? '').trim();
    if (!key) return { ok: false, reason: 'invalid_principal' };
    const at = now();
    prune(at);
    if (active >= maxActive) return { ok: false, reason: 'busy' };
    const timestamps = admittedByPrincipal.get(key) ?? [];
    if (timestamps.length >= limit) return { ok: false, reason: 'rate_limited' };

    timestamps.push(at);
    admittedByPrincipal.set(key, timestamps);
    active += 1;
    let released = false;
    return {
      ok: true,
      release() {
        if (released) return;
        released = true;
        active = Math.max(0, active - 1);
      },
    };
  }

  return {
    acquire,
    cleanup: prune,
    active: () => active,
    principals: () => admittedByPrincipal.size,
  };
}
