/**
 * Measured duration estimates for loading indicators.
 *
 * A countdown is only honest when the wait has a known length. Genesis never invents one: the only source
 * of an estimate is how long the SAME operation (same key) took the last time it ran in this browser.
 * No measurement → no estimate → the indicator shows its label without a countdown.
 */

const STORAGE_KEY = 'genesis-os:duration-estimates/v1';
const memory = new Map<string, number>();

function readStore(): Record<string, number> {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** Record how long an operation actually took. Ignores non-positive or non-finite values. */
export function recordDuration(key: string, ms: number): void {
  if (!Number.isFinite(ms) || ms <= 0) return;
  memory.set(key, ms);
  try {
    const store = readStore();
    store[key] = Math.round(ms);
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage unavailable (private mode, blocked): the in-memory measurement still works for this session.
  }
}

/** The last measured duration of this operation, or null when it has never been measured. */
export function estimateDuration(key: string): number | null {
  const known = memory.get(key);
  if (known !== undefined) return known;
  const stored = readStore()[key];
  return typeof stored === 'number' && Number.isFinite(stored) && stored > 0 ? stored : null;
}

/** Whole seconds left of an estimate after `elapsedMs`; 0 once the estimate is used up. */
export function countdownSeconds(estimateMs: number, elapsedMs: number): number {
  return Math.max(0, Math.ceil((estimateMs - elapsedMs) / 1000));
}
